-- Access-control assertions for migration 017.
--
-- These run as a privileged test role, so they check the *grants and
-- policies* rather than attempting the writes directly. A client connects as
-- `authenticated`; the checks below confirm that role has no write privilege
-- on the financial tables and that no all-rows-permissive policy remains on
-- them.

-- Attach the real signup trigger so the assertions below exercise the actual
-- production code path rather than a stand-in.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DO $$
DECLARE
  n INT;
  v_role user_role;
BEGIN
  RAISE NOTICE '--- FINANCIAL TABLES ARE READ-ONLY TO CLIENTS ---';

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'wallets'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM expect('No client write grants remain on wallets', n = 0);

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'wallet_transactions'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM expect('No client write grants remain on wallet_transactions', n = 0);

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'payout_requests'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM expect('No client write grants remain on payout_requests', n = 0);

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'financial_operations'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM expect('No client write grants remain on financial_operations', n = 0);

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'wallets' AND grantee = 'anon';
  PERFORM expect('Anonymous role has no access at all to wallets', n = 0);

  RAISE NOTICE '--- NO PERMISSIVE POLICIES ON FINANCIAL TABLES ---';

  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('wallets', 'wallet_transactions', 'payout_requests', 'financial_operations')
    AND (qual = 'true' OR with_check = 'true');
  PERFORM expect('No all-rows-permissive policy on any financial table', n = 0);

  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'wallets'
    AND cmd IN ('UPDATE', 'INSERT', 'ALL');
  PERFORM expect('wallets has no INSERT/UPDATE/ALL policy for clients', n = 0);

  RAISE NOTICE '--- PRIVILEGED PROFILE COLUMNS ---';

  SELECT count(*) INTO n
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name IN ('role', 'is_verified', 'is_super_admin')
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type = 'UPDATE';
  PERFORM expect('Clients cannot UPDATE profiles.role / is_verified / is_super_admin', n = 0);

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'super_admins'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM expect('Clients cannot write the super_admins table', n = 0);

  RAISE NOTICE '--- SIGN-UP ROLE CLAMPING ---';

  -- Simulate the signup trigger with hostile metadata.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('99999999-9999-4999-8999-999999999991', 'escalate@example.com',
          '{"role":"admin","full_name":"Escalation Attempt"}'::jsonb);
  SELECT role INTO v_role FROM profiles WHERE id = '99999999-9999-4999-8999-999999999991';
  PERFORM expect('Sign-up metadata role "admin" is clamped to creator', v_role = 'creator');

  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('99999999-9999-4999-8999-999999999992', 'dev-signup@example.com',
          '{"role":"developer","full_name":"Legit Developer"}'::jsonb);
  SELECT role INTO v_role FROM profiles WHERE id = '99999999-9999-4999-8999-999999999992';
  PERFORM expect('Sign-up metadata role "developer" is honoured', v_role = 'developer');
END $$;
