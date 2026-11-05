-- Assertions for migrations 018 (tenant isolation), 019 (storage) and
-- 020 (campaign lifecycle).

DO $$
DECLARE n INT; v TEXT;
BEGIN
  RAISE NOTICE '--- NO BLANKET WRITE GRANTS REMAIN ---';

  -- The tables holding personal or commercially sensitive data must carry no
  -- anonymous privilege whatsoever.
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='anon'
    AND table_name IN ('leads','creator_verifications','verification_requests',
                       'messages','disputes','dispute_messages','contracts',
                       'bank_accounts','wallets','wallet_transactions',
                       'payout_requests','audit_logs','super_admins')
    AND privilege_type <> 'INSERT';
  PERFORM expect('Anonymous holds no read/update/delete on any sensitive table', n = 0);

  -- Leads are the one anonymous write, and it must be write-only.
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='anon' AND table_name='leads'
    AND privilege_type='SELECT';
  PERFORM expect('Anonymous cannot read leads back', n = 0);

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='anon' AND table_name='leads'
    AND privilege_type='INSERT';
  PERFORM expect('Anonymous can still submit a lead', n = 1);

  -- Nothing anywhere should still have TRUNCATE or blanket DELETE it does not need.
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('anon','authenticated')
    AND privilege_type='TRUNCATE';
  PERFORM expect('No client role can TRUNCATE any table', n = 0);

  -- Clients may not write the audit trail.
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='audit_logs'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE');
  PERFORM expect('Clients cannot write audit_logs', n = 0);

  -- The tables the app genuinely writes must keep working.
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='authenticated'
    AND table_name='campaigns' AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');
  PERFORM expect('Authenticated retains full access to campaigns', n = 4);

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='authenticated'
    AND table_name='messages' AND privilege_type IN ('SELECT','INSERT','UPDATE');
  PERFORM expect('Authenticated retains messaging access', n = 3);

  RAISE NOTICE '--- STORAGE OWNERSHIP ---';

  SELECT count(*) INTO n FROM storage.buckets
  WHERE id IN ('verification-documents','dispute-evidence') AND public = TRUE;
  PERFORM expect('Identity and evidence buckets are private', n = 0);

  -- Every write policy on storage must test the owning folder, not just the
  -- bucket. This is the actual AH-025 regression guard.
  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND cmd IN ('INSERT','UPDATE','DELETE')
    AND COALESCE(qual,'') || COALESCE(with_check,'') NOT LIKE '%foldername%';
  PERFORM expect('Every storage write policy checks folder ownership', n = 0);

  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
    AND qual LIKE '%verification-documents%' AND qual NOT LIKE '%foldername%';
  PERFORM expect('Verification documents are not readable without ownership', n = 0);

  RAISE NOTICE '--- CAMPAIGN LIFECYCLE ---';

  -- Valid progression.
  UPDATE campaigns SET status='open' WHERE id='cccccccc-0000-4000-8000-000000000002';
  SELECT status::text INTO v FROM campaigns WHERE id='cccccccc-0000-4000-8000-000000000002';
  PERFORM expect('draft -> open is allowed', v = 'open');

  UPDATE campaigns SET status='active' WHERE id='cccccccc-0000-4000-8000-000000000002';
  PERFORM expect('open -> active is allowed',
    (SELECT status::text FROM campaigns WHERE id='cccccccc-0000-4000-8000-000000000002') = 'active');

  -- Invalid jump.
  BEGIN
    UPDATE campaigns SET status='draft' WHERE id='cccccccc-0000-4000-8000-000000000002';
    PERFORM expect('active -> draft is refused', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('active -> draft is refused', TRUE);
  END;

  UPDATE campaigns SET status='completed' WHERE id='cccccccc-0000-4000-8000-000000000002';
  PERFORM expect('active -> completed is allowed',
    (SELECT status::text FROM campaigns WHERE id='cccccccc-0000-4000-8000-000000000002') = 'completed');

  -- The rule the audit calls out by name.
  BEGIN
    INSERT INTO campaign_assignments (campaign_id, creator_id)
    VALUES ('cccccccc-0000-4000-8000-000000000002','33333333-3333-4333-8333-333333333333');
    PERFORM expect('A completed campaign refuses new assignments', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('A completed campaign refuses new assignments', TRUE);
  END;

  BEGIN
    INSERT INTO campaign_applications (campaign_id, creator_id)
    VALUES ('cccccccc-0000-4000-8000-000000000002','33333333-3333-4333-8333-333333333333');
    PERFORM expect('A completed campaign refuses new applications', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('A completed campaign refuses new applications', TRUE);
  END;

  -- A campaign holding money cannot be archived out of reach.
  UPDATE campaigns SET escrow_amount = 250 WHERE id='cccccccc-0000-4000-8000-000000000002';
  BEGIN
    UPDATE campaigns SET status='archived' WHERE id='cccccccc-0000-4000-8000-000000000002';
    PERFORM expect('A campaign still holding funds cannot be archived', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('A campaign still holding funds cannot be archived', TRUE);
  END;

  UPDATE campaigns SET escrow_amount = 0 WHERE id='cccccccc-0000-4000-8000-000000000002';
  UPDATE campaigns SET status='archived' WHERE id='cccccccc-0000-4000-8000-000000000002';
  PERFORM expect('An emptied campaign can be archived',
    (SELECT status::text FROM campaigns WHERE id='cccccccc-0000-4000-8000-000000000002') = 'archived');
END $$;
