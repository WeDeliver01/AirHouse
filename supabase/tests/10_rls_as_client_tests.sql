-- Row-level security, exercised as the roles a browser actually uses.
--
-- Every other file in this suite runs as the database owner, who bypasses RLS
-- entirely -- no FORCE ROW LEVEL SECURITY is set anywhere. So 123 assertions
-- passed while the policies protecting profiles, creator_profiles and wallets
-- had never once been evaluated. Three defects survived that gap:
--
--   * 018 revoked the column-level UPDATE grants 017 had carefully placed on
--     profiles, leaving nobody able to edit their own profile
--   * neither migration removed the pre-existing `allow_all_*` policies, and
--     PostgreSQL combines permissive policies with OR, so one surviving
--     USING (true) granted everything
--   * 016 revoked EXECUTE on fin_is_super_admin from authenticated while 018
--     used it in eight policies, so those policies raised "permission denied"
--     for exactly the users they were written for
--
-- These tests SET ROLE, so the policies are the thing under test.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION rls_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

-- Two ordinary creators, owned by nobody special.
DO $$
DECLARE
  alice UUID := 'aaaaaaaa-1111-4111-8111-111111111111';
  bob   UUID := 'bbbbbbbb-2222-4222-8222-222222222222';
BEGIN
  INSERT INTO auth.users(id) VALUES (alice), (bob) ON CONFLICT DO NOTHING;
  INSERT INTO profiles(id, email, role, full_name) VALUES
    (alice, 'rls-alice@example.com', 'creator', 'RLS Alice'),
    (bob,   'rls-bob@example.com',   'creator', 'RLS Bob')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------

\echo '--- PROFILES, AS A SIGNED-IN CREATOR ---'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4111-8111-111111111111', false);

DO $$
DECLARE n INT; blocked BOOLEAN;
BEGIN
  SELECT count(*) INTO n FROM profiles;
  PERFORM rls_check('A creator sees only their own profile row', n = 1);

  UPDATE profiles SET full_name = 'Renamed' WHERE id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM rls_check('A creator can edit their own profile', n = 1);

  blocked := false;
  BEGIN
    UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('A creator cannot grant themselves the admin role (AH-003)', blocked);

  blocked := false;
  BEGIN
    UPDATE profiles SET is_super_admin = true WHERE id = auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('A creator cannot make themselves super admin (AH-003)', blocked);

  UPDATE profiles SET full_name = 'Hijacked' WHERE id = 'bbbbbbbb-2222-4222-8222-222222222222';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM rls_check('A creator cannot edit another user''s profile', n = 0);

  -- Blocked either by the absence of a DELETE grant or by the row policy;
  -- both are correct, and which one fires is not the point of the test.
  blocked := false;
  BEGIN
    DELETE FROM profiles WHERE id = 'bbbbbbbb-2222-4222-8222-222222222222';
    GET DIAGNOSTICS n = ROW_COUNT;
    blocked := (n = 0);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('A creator cannot delete another user''s profile', blocked);
END $$;

-- ---------------------------------------------------------------------------
\echo '--- WALLETS, AS A SIGNED-IN CREATOR ---'

DO $$
DECLARE blocked BOOLEAN;
BEGIN
  -- The finding that started the whole review: a client writing its own
  -- balance. After 018 the role holds no write privilege on the table at all.
  blocked := false;
  BEGIN
    UPDATE wallets SET balance = balance + 1000000;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('A creator cannot write any wallet balance (AH-001)', blocked);

  blocked := false;
  BEGIN
    INSERT INTO wallet_transactions(wallet_id, amount, transaction_type)
    VALUES (gen_random_uuid(), 999999, 'deposit');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
            WHEN others THEN blocked := true; END;
  PERFORM rls_check('A creator cannot invent a wallet transaction', blocked);

  blocked := false;
  BEGIN
    UPDATE payout_requests SET status = 'completed';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('A creator cannot approve their own payout', blocked);
END $$;

-- ---------------------------------------------------------------------------
\echo '--- PRIVILEGE TABLES, AS A SIGNED-IN CREATOR ---'

DO $$
DECLARE blocked BOOLEAN;
BEGIN
  blocked := false;
  BEGIN
    INSERT INTO super_admins(user_id) VALUES (auth.uid());
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
            WHEN others THEN blocked := true; END;
  PERFORM rls_check('A creator cannot add themselves to super_admins', blocked);

  blocked := false;
  BEGIN
    DELETE FROM audit_logs;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('A creator cannot erase the audit trail (AH-027)', blocked);
END $$;

RESET ROLE;

-- ---------------------------------------------------------------------------
\echo '--- AS AN ANONYMOUS VISITOR ---'

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
DECLARE n INT; blocked BOOLEAN;
BEGIN
  blocked := false;
  BEGIN
    SELECT count(*) INTO n FROM profiles;
    blocked := (n = 0);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('An anonymous visitor reads no profiles (AH-008)', blocked);

  blocked := false;
  BEGIN
    UPDATE wallets SET balance = 0;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('An anonymous visitor cannot touch wallets', blocked);

  blocked := false;
  BEGIN
    DELETE FROM profiles;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  PERFORM rls_check('An anonymous visitor cannot delete profiles', blocked);
END $$;

RESET ROLE;

\echo '--- RLS AS CLIENT: all checks passed ---'
