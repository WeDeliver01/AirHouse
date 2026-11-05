-- ============================================================================
-- 017_access_control_hardening.sql
--
-- Closes the two access-control defects that let a client write its own
-- financial records or obtain a privileged role.
--
-- WHY
-- ---
-- AH-001  `supabase/quick_setup.sql` grants ALL on every table in the public
--         schema to the `anon` and `authenticated` roles and installs
--         `allow_all_*` policies. `supabase/fix_auth.sql` tightens the wallet
--         policies but still leaves:
--
--             CREATE POLICY "wallets_update" ON wallets
--               FOR UPDATE USING (auth.uid() = user_id);
--
--         A FOR UPDATE policy with a USING clause and no WITH CHECK restricts
--         which rows may be updated but places no constraint on the values
--         written. With table-level UPDATE granted, any authenticated user can
--         set their own wallet balance to an arbitrary number. Whichever of
--         the historical scripts produced the live database, the application
--         itself writes balances from the browser, so a permissive policy must
--         exist for it to work at all.
--
-- AH-003  `handle_new_user()` copies `raw_user_meta_data->>'role'` straight
--         into `profiles.role`. That metadata is supplied by the client at
--         sign-up. The `enforce_signup_role` trigger added in migration 009
--         only applies when `current_setting('role') = 'authenticated'`, which
--         is not the case during the SECURITY DEFINER signup trigger, so it
--         does not cover this path.
--
-- SCOPE
-- -----
-- This migration deliberately does NOT blanket-revoke privileges across all
-- 37 tables. The access requirements of every table have not been verified
-- against the live application, and an indiscriminate revoke would break
-- working features. It fixes the financial and privilege paths, which are
-- the ones that allow a user to take money or take over an account, and
-- leaves an inventory query (section 5) for the remaining tables to be
-- worked through table by table in Phase 1.
--
-- !! Apply to a restored copy of production first. !!
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Financial tables become read-only to clients.
--
--    All writes now go through the SECURITY DEFINER functions added in
--    migration 016, which run as the function owner and are unaffected by
--    these grants. Reads stay available so dashboards keep working; RLS still
--    restricts them to the user's own rows.
-- ----------------------------------------------------------------------------

-- Remove the permissive policies regardless of which script created them.
DROP POLICY IF EXISTS "allow_all_wallets"   ON wallets;
DROP POLICY IF EXISTS "wallets_update"      ON wallets;
DROP POLICY IF EXISTS "wallets_insert"      ON wallets;
DROP POLICY IF EXISTS "wallets_select"      ON wallets;
DROP POLICY IF EXISTS "Users can view own wallet" ON wallets;

CREATE POLICY "wallets_select_own" ON wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR fin_is_super_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy is defined for wallets. With RLS enabled and
-- no permissive policy, every client write is refused even if a table grant
-- were restored by accident -- defence in depth.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON wallets FROM anon, authenticated;
REVOKE ALL ON wallets FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON wallet_transactions FROM anon, authenticated;
REVOKE ALL ON wallet_transactions FROM anon;

DROP POLICY IF EXISTS "Users can view own transactions" ON wallet_transactions;
CREATE POLICY "wallet_transactions_select_own" ON wallet_transactions
  FOR SELECT TO authenticated
  USING (
    wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid())
    OR fin_is_super_admin(auth.uid())
  );

-- Payout requests are created through request_creator_payout() so that the
-- fee and the balance hold are computed server-side.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON payout_requests FROM anon, authenticated;
REVOKE ALL ON payout_requests FROM anon;

DROP POLICY IF EXISTS "Users can create own payouts" ON payout_requests;
DROP POLICY IF EXISTS "Users can view own payouts"   ON payout_requests;
CREATE POLICY "payout_requests_select_own" ON payout_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR fin_is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON financial_operations FROM anon, authenticated;
REVOKE ALL ON financial_operations FROM anon;

-- Bank account details are personal financial data: the owner only.
REVOKE ALL ON bank_accounts FROM anon;

-- ----------------------------------------------------------------------------
-- 2. Privileged profile columns cannot be written by clients.
--
--    Column-level revokes sit underneath the trigger added in migration 009,
--    so a user cannot change their own role even if a policy regression
--    reopened row-level access.
-- ----------------------------------------------------------------------------

-- A column-level REVOKE has no effect while a table-level UPDATE grant is
-- held: the table grant already covers every column. The table privilege must
-- be withdrawn first and then re-granted column by column, listing only the
-- fields a user may edit about themselves.
DO $$
DECLARE
  v_safe_columns TEXT;
BEGIN
  EXECUTE 'REVOKE UPDATE ON profiles FROM anon, authenticated';

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO v_safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name NOT IN (
      'id', 'email', 'role', 'is_verified', 'is_super_admin', 'created_at'
    );

  IF v_safe_columns IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON profiles TO authenticated', v_safe_columns);
    RAISE NOTICE 'profiles: UPDATE granted on safe columns only (%)', v_safe_columns;
  END IF;
END $$;

-- The super_admins table decides who holds privilege; clients never write it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON super_admins FROM anon, authenticated;
REVOKE ALL ON super_admins FROM anon;

-- ----------------------------------------------------------------------------
-- 3. Sign-up can no longer choose a privileged role.
--
--    The role is clamped to the two self-service roles. Promotion to admin
--    happens only through the separate super-admin workflow.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requested TEXT;
  v_role      user_role;
  v_wallet    wallet_type;
BEGIN
  v_requested := NEW.raw_user_meta_data->>'role';

  -- Client-supplied metadata is untrusted. Anything that is not exactly
  -- 'creator' or 'developer' becomes 'creator'.
  IF v_requested = 'developer' THEN
    v_role   := 'developer'::user_role;
    v_wallet := 'developer'::wallet_type;
  ELSE
    v_role   := 'creator'::user_role;
    v_wallet := 'creator'::wallet_type;
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1))
  );

  INSERT INTO public.wallets (user_id, wallet_type)
  VALUES (NEW.id, v_wallet)
  ON CONFLICT (user_id, wallet_type) DO NOTHING;

  IF v_role = 'creator' THEN
    INSERT INTO public.creator_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block account creation on a profile-provisioning failure, but make
  -- the failure visible rather than silent.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Verification helper.
--
--    Returns any policy that is permissive for all rows, and any table still
--    carrying write grants for anon. Should return zero rows for the
--    financial tables after this migration.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW security_review_permissive_policies AS
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true');

CREATE OR REPLACE VIEW security_review_anon_write_grants AS
SELECT table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
ORDER BY table_name, grantee, privilege_type;

REVOKE ALL ON security_review_permissive_policies FROM anon, authenticated;
REVOKE ALL ON security_review_anon_write_grants   FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. REMAINING WORK (Phase 1, not automated here)
--
--    Run the two views above against the live database and work through every
--    row. For each table decide the intended access for anon, authenticated,
--    the owner, and admins, then replace blanket grants with explicit ones:
--
--        SELECT * FROM security_review_permissive_policies;
--        SELECT * FROM security_review_anon_write_grants;
--
--    Tables holding personal or commercially sensitive data -- leads,
--    creator_verifications, verification_requests, messages, disputes,
--    dispute_messages, contracts, bank_accounts -- should be done first.
--    Tracked as AH-009 in docs/RISK_REGISTER.md.
-- ----------------------------------------------------------------------------

COMMIT;
