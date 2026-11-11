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

-- Helper: run arbitrary SQL as a given user (also defined in 04_payout_tests.sql;
-- CREATE OR REPLACE makes the duplicate harmless regardless of run order).
CREATE OR REPLACE FUNCTION try_sql(p_user UUID, p_sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  EXECUTE p_sql INTO r;
  RETURN 'OK:' || COALESCE(r,'');
EXCEPTION WHEN OTHERS THEN RETURN 'ERR:' || SQLERRM;
END $$;

-- Helper: confirm a manual payment as a given user, capture whether it raised.
CREATE OR REPLACE FUNCTION try_confirm(p_user UUID, p_intent UUID, p_key TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  r := confirm_manual_payment(p_intent, 'TEST-REF', p_key);
  RETURN 'OK:' || (r->>'success');
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLERRM;
END $$;

DO $$
DECLARE
  res TEXT; bal DECIMAL; cnt INT; j JSONB;
  v_campaign UUID; v_intent UUID;
BEGIN
  RAISE NOTICE '--- DIRECT-PAY CHECKOUT: AMOUNT VALIDATION ---';

  -- A cart with no items cannot be checked out.
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
  INSERT INTO campaign_carts (id, developer_id, creator_id, status)
  VALUES ('dddddddd-0000-4000-8000-000000000099','55555555-5555-4555-8555-555555555555',
          '22222222-2222-4222-8222-222222222222','draft');
  BEGIN
    PERFORM checkout_campaign_cart('dddddddd-0000-4000-8000-000000000099','Empty Cart','Prop','Loc','key-empty-cart-001');
    PERFORM expect('An empty cart cannot be checked out', FALSE);
  EXCEPTION WHEN OTHERS THEN
    PERFORM expect('An empty cart cannot be checked out', SQLERRM LIKE '%Cart is empty%');
  END;

  RAISE NOTICE '--- DIRECT-PAY CHECKOUT: AUTHORIZATION ---';

  -- Dev One's seeded cart (dddddddd-...0001) cannot be checked out by someone else.
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
    PERFORM checkout_campaign_cart('dddddddd-0000-4000-8000-000000000001','Stolen Cart','Prop','Loc','key-steal-cart-001');
    PERFORM expect('A different developer cannot check out someone else''s cart', FALSE);
  EXCEPTION WHEN OTHERS THEN
    PERFORM expect('A different developer cannot check out someone else''s cart', SQLERRM LIKE '%Only the cart owner%');
  END;

  RAISE NOTICE '--- DIRECT-PAY CHECKOUT: HAPPY PATH ---';

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  j := checkout_campaign_cart('dddddddd-0000-4000-8000-000000000001','Video Collab','Sandton Views','Sandton','key-checkout-001');
  PERFORM expect('Checkout succeeds for the cart owner', (j->>'success') = 'true');
  PERFORM expect('Subtotal is the sum of the cart (R1,800)', (j->>'subtotal_cents')::BIGINT = 180000);
  PERFORM expect('Platform fee is 2.7% of R1,800 = R48.60', (j->>'platform_fee_cents')::BIGINT = 4860);
  PERFORM expect('Creator receives the remaining R1,751.40', (j->>'creator_amount_cents')::BIGINT = 175140);

  v_campaign := (j->>'campaign_id')::UUID;
  v_intent   := (j->'payment_intent'->>'payment_intent_id')::UUID;

  PERFORM expect('Checkout creates exactly one assignment for the cart''s creator',
    (SELECT count(*) FROM campaign_assignments WHERE campaign_id = v_campaign
       AND creator_id = '22222222-2222-4222-8222-222222222222') = 1);
  PERFORM expect('The campaign is booked (invited), not funded yet',
    (SELECT status::text FROM campaigns WHERE id = v_campaign) = 'invited');
  PERFORM expect('A funding request was raised for the full cart total',
    (SELECT amount_cents FROM payment_intents WHERE id = v_intent) = 180000);

  RAISE NOTICE '--- DIRECT-PAY CONFIRMATION: AUTHORIZATION ---';

  res := try_confirm('11111111-1111-4111-8111-111111111111', v_intent, 'key-self-confirm-001');
  PERFORM expect('A developer cannot confirm their own payment', res LIKE 'ERR:Only super admins%');

  res := try_confirm('22222222-2222-4222-8222-222222222222', v_intent, 'key-creator-confirm-001');
  PERFORM expect('A creator cannot confirm a payment', res LIKE 'ERR:Only super admins%');

  RAISE NOTICE '--- DIRECT-PAY CONFIRMATION: HAPPY PATH (no escrow, paid straight to the creator) ---';

  SELECT balance INTO bal FROM wallets WHERE user_id = '22222222-2222-4222-8222-222222222222' AND wallet_type = 'creator';
  res := try_confirm('44444444-4444-4444-8444-444444444444', v_intent, 'key-confirm-good-001');
  PERFORM expect('An operator can confirm the payment', res = 'OK:true');

  SELECT balance INTO bal FROM wallets WHERE user_id = '22222222-2222-4222-8222-222222222222' AND wallet_type = 'creator';
  PERFORM expect('Creator wallet is credited R1,751.40 immediately, with nothing held back', bal = 1751.40);
  PERFORM expect('The campaign is active and nothing sits in escrow',
    (SELECT status::text = 'active' AND COALESCE(escrow_amount, 0) = 0 FROM campaigns WHERE id = v_campaign));

  SELECT count(*) INTO cnt FROM wallet_transactions WHERE related_campaign_id = v_campaign;
  PERFORM expect('A single wallet transaction records the direct payment', cnt = 1);

  RAISE NOTICE '--- DIRECT-PAY CONFIRMATION: IDEMPOTENCY ---';

  res := try_confirm('44444444-4444-4444-8444-444444444444', v_intent, 'key-confirm-good-001');
  PERFORM expect('Replaying the same confirmation does not pay the creator twice', res = 'OK:true');
  SELECT balance INTO bal FROM wallets WHERE user_id = '22222222-2222-4222-8222-222222222222' AND wallet_type = 'creator';
  PERFORM expect('Creator balance unchanged after replay', bal = 1751.40);

  RAISE NOTICE '--- CLAWBACK REFUND (replaces escrow refund): AUTHORIZATION & GUARDS ---';

  res := try_sql('11111111-1111-4111-8111-111111111111',
    format($q$SELECT refund_campaign_payment('%s','22222222-2222-4222-8222-222222222222',100,'test','key-refund-dev-001')::text$q$, v_campaign));
  PERFORM expect('A developer cannot refund their own campaign directly', res LIKE 'ERR:Only super admins%');

  res := try_sql('44444444-4444-4444-8444-444444444444',
    format($q$SELECT refund_campaign_payment('%s','22222222-2222-4222-8222-222222222222',9999,'test','key-refund-overdraw-001')::text$q$, v_campaign));
  PERFORM expect('Cannot claw back more than the creator''s wallet holds', res LIKE 'ERR:Insufficient creator balance%');

  RAISE NOTICE '--- CLAWBACK REFUND: HAPPY PATH ---';

  res := try_sql('44444444-4444-4444-8444-444444444444',
    format($q$SELECT refund_campaign_payment('%s','22222222-2222-4222-8222-222222222222',200,'quality dispute','key-refund-good-001')::text$q$, v_campaign));
  PERFORM expect('A super admin can claw back a disputed amount', res LIKE 'OK:%');

  SELECT balance INTO bal FROM wallets WHERE user_id = '22222222-2222-4222-8222-222222222222' AND wallet_type = 'creator';
  PERFORM expect('Creator balance falls by the refunded amount', bal = 1551.40);
  SELECT balance INTO bal FROM wallets WHERE user_id = '11111111-1111-4111-8111-111111111111' AND wallet_type = 'developer';
  PERFORM expect('Developer wallet is credited the refund', bal = 200.00);

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
    UPDATE wallets SET balance = -1
    WHERE user_id = '22222222-2222-4222-8222-222222222222' AND wallet_type = 'creator';
    PERFORM expect('Negative balance rejected by CHECK constraint', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('Negative balance rejected by CHECK constraint', TRUE);
  END;
END $$;
