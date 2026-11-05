\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

CREATE OR REPLACE FUNCTION expect(label TEXT, cond BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE WARNING 'FAIL  %', label;
  END IF;
END $$;

-- Helper: run a release as a given user, capture whether it raised.
CREATE OR REPLACE FUNCTION try_release(p_user UUID, p_creator UUID, p_amount DECIMAL, p_key TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  r := release_campaign_escrow('cccccccc-0000-4000-8000-000000000001', p_creator, p_amount, 'test', p_key);
  RETURN 'OK:' || (r->>'success');
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLERRM;
END $$;

DO $$
DECLARE res TEXT; bal DECIMAL; cnt INT;
BEGIN
  RAISE NOTICE '--- AUTHORIZATION ---';

  res := try_release('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',100,'key-other-dev-001');
  PERFORM expect('A different developer cannot release this campaign''s escrow', res LIKE 'ERR:Not authorised%');

  res := try_release('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222',100,'key-creator-self-001');
  PERFORM expect('A creator cannot release escrow to themselves', res LIKE 'ERR:Not authorised%');

  res := try_release('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',100,'key-unassigned-001');
  PERFORM expect('Cannot pay a creator not assigned to the campaign', res LIKE 'ERR:Creator is not assigned%');

  RAISE NOTICE '--- AMOUNT VALIDATION ---';

  res := try_release('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',-50,'key-negative-001');
  PERFORM expect('Negative amounts are rejected', res LIKE 'ERR:Release amount must be greater than zero%');

  res := try_release('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',99999,'key-overdraw-001');
  PERFORM expect('Cannot release more than the escrow holds', res LIKE 'ERR:Insufficient escrow balance%');

  res := try_release('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',100,'short');
  PERFORM expect('A weak idempotency key is rejected', res LIKE 'ERR:A valid idempotency key%');

  RAISE NOTICE '--- HAPPY PATH ---';

  res := try_release('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',300,'key-release-good-001');
  PERFORM expect('Campaign developer can release 300 to an assigned creator', res = 'OK:true');

  SELECT balance INTO bal FROM wallets WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
  PERFORM expect('Escrow debited to 700', bal = 700.00);
  SELECT balance INTO bal FROM wallets WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
  PERFORM expect('Creator credited 300', bal = 300.00);
  SELECT total_earned INTO bal FROM wallets WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
  PERFORM expect('Creator lifetime earnings updated', bal = 300.00);
  SELECT escrow_amount INTO bal FROM campaigns WHERE id='cccccccc-0000-4000-8000-000000000001';
  PERFORM expect('Campaign escrow_amount updated', bal = 700.00);
  SELECT amount_paid_out INTO bal FROM campaigns WHERE id='cccccccc-0000-4000-8000-000000000001';
  PERFORM expect('Campaign amount_paid_out updated', bal = 300.00);
  SELECT count(*) INTO cnt FROM wallet_transactions;
  PERFORM expect('Double-sided ledger entry written (2 rows)', cnt = 2);

  RAISE NOTICE '--- IDEMPOTENCY ---';

  res := try_release('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',300,'key-release-good-001');
  PERFORM expect('Replaying the same idempotency key succeeds without moving money', res = 'OK:true');
  SELECT balance INTO bal FROM wallets WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
  PERFORM expect('Creator balance unchanged after replay (still 300)', bal = 300.00);
  SELECT count(*) INTO cnt FROM wallet_transactions;
  PERFORM expect('No extra ledger rows after replay (still 2)', cnt = 2);

  RAISE NOTICE '--- LEDGER IMMUTABILITY ---';

  BEGIN
    UPDATE wallet_transactions SET amount = 9999 WHERE TRUE;
    PERFORM expect('Ledger UPDATE is blocked', FALSE);
  EXCEPTION WHEN OTHERS THEN
    PERFORM expect('Ledger UPDATE is blocked', SQLERRM LIKE '%append-only%');
  END;

  BEGIN
    DELETE FROM wallet_transactions WHERE TRUE;
    PERFORM expect('Ledger DELETE is blocked', FALSE);
  EXCEPTION WHEN OTHERS THEN
    PERFORM expect('Ledger DELETE is blocked', SQLERRM LIKE '%append-only%');
  END;

  RAISE NOTICE '--- NEGATIVE BALANCE GUARD ---';
  BEGIN
    UPDATE wallets SET balance = -1 WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
    PERFORM expect('Negative balance rejected by CHECK constraint', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('Negative balance rejected by CHECK constraint', TRUE);
  END;
END $$;
