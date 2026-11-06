-- 026_profile_policy_repair.sql
--
-- Repairs two defects found by rehearsing 016-025 against a copy of the live
-- database. Both left `profiles` and `creator_profiles` wide open while every
-- test passed.
--
-- 1. 017 revokes table-level UPDATE on `profiles` and re-grants it column by
--    column, so `role` and `is_super_admin` cannot be written by the account
--    that owns the row (AH-001, AH-003). 018 then loops every table in the
--    schema running `REVOKE ALL ... FROM anon, authenticated`, which removes
--    column grants as well, and re-grants only SELECT and INSERT. The column
--    grants were gone and nothing put them back: no user could edit their own
--    profile at all.
--
-- 2. Neither 017 nor 018 removes the permissive policies already on these
--    tables. The live database carries `allow_all_profiles` and
--    `allow_all_creator_profiles` from `quick_setup.sql`, both USING (true)
--    WITH CHECK (true), plus a `Users can update own profile` policy whose
--    USING clause is simply `true`. PostgreSQL combines permissive policies
--    with OR, so one surviving `true` grants everything regardless of what
--    else is added alongside it.
--
-- Policies are dropped by shape rather than by name, because the names differ
-- between the quick_setup lineage, the numbered series and the test baseline.

-- ----------------------------------------------------------------------------
-- 1. Remove every unrestricted policy on these two tables.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'creator_profiles')
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'dropped unrestricted policy %.%', r.tablename, r.policyname;
  END LOOP;
END $$;

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. profiles — own row, plus what the platform needs to function.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"    ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Staff need to see every account to run the platform. fin_is_super_admin()
-- is SECURITY DEFINER and reads super_admins, so this does not recurse
-- through profiles the way a role lookup on this same table would.
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.fin_is_super_admin(auth.uid()));

-- The column grants decide WHICH columns may be written; this decides which
-- rows. Both are required: a row check alone would still let the owner
-- escalate their own role.
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Only ever your own row, and only once: the id is the authenticated user.
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Restore the column-level UPDATE grant that 018 removed.
--
--    Derived from the live column list rather than hard-coded, so a column
--    added later is writable by its owner by default, while the four that
--    decide identity and privilege stay server-only.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_safe_columns TEXT;
BEGIN
  EXECUTE 'REVOKE UPDATE ON public.profiles FROM anon, authenticated';

  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name NOT IN ('id', 'email', 'role', 'is_verified', 'is_super_admin', 'created_at');

  IF v_safe_columns IS NULL THEN
    RAISE EXCEPTION 'profiles has no updatable columns; refusing to leave it unwritable';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_safe_columns);
  RAISE NOTICE 'profiles: UPDATE re-granted on safe columns only (%)', v_safe_columns;
END $$;

-- ----------------------------------------------------------------------------
-- 3b. Let policies actually call the super-admin predicate.
--
--     016 revokes EXECUTE on fin_is_super_admin from authenticated, and 018
--     then uses it in eight policies. A policy expression is evaluated with
--     the caller's privileges, so every one of those policies raises
--     "permission denied for function fin_is_super_admin" for a signed-in
--     user -- the tables they protect become unreadable rather than
--     protected.
--
--     Nothing caught it because every test runs as the database owner, who
--     bypasses RLS. supabase/tests/10_rls_as_client_tests.sql now runs as
--     the anon and authenticated roles instead.
--
--     Granting EXECUTE discloses nothing new: 018 already grants SELECT on
--     super_admins to authenticated, so the same question can be asked
--     directly.
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.fin_is_super_admin(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. creator_profiles — readable by signed-in users, writable only by owner.
--
--    Anonymous visitors read the marketplace through
--    creator_marketplace_public, which exposes no contact details (AH-008).
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "creator_profiles_select_authenticated" ON public.creator_profiles;
DROP POLICY IF EXISTS "creator_profiles_insert_own"           ON public.creator_profiles;
DROP POLICY IF EXISTS "creator_profiles_update_own"           ON public.creator_profiles;

CREATE POLICY "creator_profiles_select_authenticated" ON public.creator_profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "creator_profiles_insert_own" ON public.creator_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "creator_profiles_update_own" ON public.creator_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. Refuse to finish if either table is still unrestricted.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('profiles', 'creator_profiles')
    AND (qual = 'true' OR with_check = 'true')
    -- The marketplace read is deliberately unrestricted for signed-in users.
    AND policyname <> 'creator_profiles_select_authenticated';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'profiles/creator_profiles still carry % unrestricted policies', v_remaining;
  END IF;
END $$;
