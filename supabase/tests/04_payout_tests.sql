CREATE OR REPLACE FUNCTION try_sql(p_user UUID, p_sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  EXECUTE p_sql INTO r;
  RETURN 'OK:' || COALESCE(r,'');
EXCEPTION WHEN OTHERS THEN RETURN 'ERR:' || SQLERRM;
END $$;

DO $$
DECLARE res TEXT; v_payout UUID; bal DECIMAL; pend DECIMAL; bal_before DECIMAL;
BEGIN
  RAISE NOTICE '--- PAYOUT REQUEST ---';
  -- Creator has 800.
  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT request_creator_payout(50, 'bbbbbbbb-0000-4000-8000-000000000001', 'payout-key-0001')::text$q$);
  PERFORM expect('Payout below the R100 minimum is rejected', res LIKE 'ERR:Minimum payout%');

  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT request_creator_payout(99999, 'bbbbbbbb-0000-4000-8000-000000000001', 'payout-key-0002')::text$q$);
  PERFORM expect('Payout above the available balance is rejected', res LIKE 'ERR:Insufficient balance%');

  -- A creator using someone else's bank account.
  res := try_sql('33333333-3333-4333-8333-333333333333',
    $q$SELECT request_creator_payout(100, 'bbbbbbbb-0000-4000-8000-000000000001', 'payout-key-0003')::text$q$);
  PERFORM expect('Cannot pay out to another user''s bank account', res LIKE 'ERR:Bank account not found%');

  SELECT balance INTO bal_before FROM wallets WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT request_creator_payout(200, 'bbbbbbbb-0000-4000-8000-000000000001', 'payout-key-0004')::text$q$);
  PERFORM expect('Valid payout request succeeds', res LIKE 'OK:%"success": true%');

  SELECT balance, pending_balance INTO bal, pend
  FROM wallets WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
  PERFORM expect('Available balance reduced by exactly the payout amount', bal = bal_before - 200.00);
  PERFORM expect('Pending balance holds the 200', pend = 200.00);

  SELECT (result->>'payout_fee')::DECIMAL INTO bal FROM financial_operations
  WHERE idempotency_key='payout-key-0004';
  PERFORM expect('Payout fee computed server-side as 3% (R6)', bal = 6.00);

  SELECT id INTO v_payout FROM payout_requests ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE '--- PAYOUT APPROVAL / SEPARATION OF DUTIES ---';

  res := try_sql('22222222-2222-4222-8222-222222222222',
    format($q$SELECT process_payout_request('%s','approve','ok','approve-key-0001')::text$q$, v_payout));
  PERFORM expect('A creator cannot approve a payout', res LIKE 'ERR:Only super admins%');

  res := try_sql('11111111-1111-4111-8111-111111111111',
    format($q$SELECT process_payout_request('%s','approve','ok','approve-key-0002')::text$q$, v_payout));
  PERFORM expect('A developer cannot approve a payout', res LIKE 'ERR:Only super admins%');

  -- Super admin requesting their own payout then approving it.
  INSERT INTO wallets (id, user_id, wallet_type, balance)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000009','44444444-4444-4444-8444-444444444444','creator',500)
  ON CONFLICT DO NOTHING;
  INSERT INTO bank_accounts (id, user_id, bank_name, account_number)
  VALUES ('bbbbbbbb-0000-4000-8000-000000000009','44444444-4444-4444-8444-444444444444','FNB','999')
  ON CONFLICT DO NOTHING;
  res := try_sql('44444444-4444-4444-8444-444444444444',
    $q$SELECT request_creator_payout(100,'bbbbbbbb-0000-4000-8000-000000000009','admin-own-payout-1')::text$q$);
  PERFORM expect('Super admin can request their own payout', res LIKE 'OK:%"success": true%');

  SELECT id INTO v_payout FROM payout_requests
  WHERE user_id='44444444-4444-4444-8444-444444444444' ORDER BY created_at DESC LIMIT 1;
  res := try_sql('44444444-4444-4444-8444-444444444444',
    format($q$SELECT process_payout_request('%s','approve','self','self-approve-key-01')::text$q$, v_payout));
  PERFORM expect('Super admin CANNOT approve their own payout (separation of duties)',
                 res LIKE 'ERR:You may not action your own payout%');
END $$;
