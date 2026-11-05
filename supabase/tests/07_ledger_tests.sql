-- Double-entry ledger and manual bank payment assertions (migrations 021-023).

DO $$
DECLARE
  res TEXT; v_intent UUID; v_ref TEXT; j JSONB;
  bank BIGINT; funds BIGINT; funds2 BIGINT; payable BIGINT; fee BIGINT; n INT;
BEGIN
  RAISE NOTICE '--- PLATFORM SETTINGS ---';

  PERFORM expect('Platform defaults to manual bank payments',
    (get_platform_setting('payments_mode'))::text = '"manual"');

  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT set_platform_setting('payments_mode','"gateway"')::text$q$);
  PERFORM expect('A creator cannot change platform settings', res LIKE 'ERR:Only super admins%');

  res := try_sql('44444444-4444-4444-8444-444444444444',
    $q$SELECT set_platform_setting('payments_mode','"paypal"')::text$q$);
  PERFORM expect('An invalid payments_mode is refused', res LIKE 'ERR:payments_mode must be%');

  res := try_sql('44444444-4444-4444-8444-444444444444',
    $q$SELECT set_platform_setting('payments_mode','"gateway"')::text$q$);
  PERFORM expect('A super admin can switch to the card gateway', res LIKE 'OK:%');
  -- Put it back; the rest of the suite runs in manual mode.
  PERFORM set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444', true);
  PERFORM set_platform_setting('payments_mode','"manual"');

  SELECT count(*) INTO n FROM audit_logs WHERE action = 'platform_setting_changed';
  PERFORM expect('Settings changes are audited', n >= 2);

  RAISE NOTICE '--- AUDIT TRAIL CANNOT BE FORGED ---';

  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT record_audit_event('did_a_thing','campaigns')::text$q$);
  PERFORM expect('An authenticated user can record an audit event', res LIKE 'OK:%');

  -- The actor is taken from the session, not from arguments.
  SELECT count(*) INTO n FROM audit_logs
  WHERE action='did_a_thing' AND user_id='22222222-2222-4222-8222-222222222222';
  PERFORM expect('The audit event is attributed to the real caller', n = 1);

  BEGIN
    UPDATE audit_logs SET action = 'rewritten' WHERE action = 'did_a_thing';
    PERFORM expect('Audit entries cannot be rewritten', FALSE);
  EXCEPTION WHEN OTHERS THEN
    PERFORM expect('Audit entries cannot be rewritten', SQLERRM LIKE '%append-only%');
  END;

  BEGIN
    DELETE FROM audit_logs WHERE action = 'did_a_thing';
    PERFORM expect('Audit entries cannot be deleted', FALSE);
  EXCEPTION WHEN OTHERS THEN
    PERFORM expect('Audit entries cannot be deleted', SQLERRM LIKE '%append-only%');
  END;

  RAISE NOTICE '--- MANUAL BANK PAYMENT ---';

  -- Developer raises a funding request for R2,000 on the lifecycle campaign.
  PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111', true);
  SELECT balance_cents INTO bank FROM ledger_account_balances WHERE code='bank';
  j := create_payment_intent('cccccccc-0000-4000-8000-000000000002', 200000, 'intent-key-00001');
  v_intent := (j->>'payment_intent_id')::UUID;
  v_ref := j->>'reference';
  PERFORM expect('A funding request can be raised', (j->>'status') = 'awaiting_payment');
  PERFORM expect('It carries a bank reference to quote', v_ref LIKE 'AH-%');

  -- Raising a request must not create money.
  PERFORM expect('Raising a request moves no money',
    (SELECT balance_cents FROM ledger_account_balances WHERE code='bank') = bank);

  -- A different developer cannot fund someone else's campaign.
  res := try_sql('55555555-5555-4555-8555-555555555555',
    $q$SELECT create_payment_intent('cccccccc-0000-4000-8000-000000000002', 100000, 'intent-key-00002')::text$q$);
  PERFORM expect('Only the campaign owner may fund it', res LIKE 'ERR:Only the campaign owner%');

  -- Payer attaches proof.
  PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111', true);
  PERFORM submit_payment_proof(v_intent, 'proofs/11111111/eft.pdf', 'FNB-12345');
  PERFORM expect('Proof moves the request to under_review',
    (SELECT status FROM payment_intents WHERE id=v_intent) = 'under_review');

  -- The payer cannot confirm their own money.
  res := try_sql('11111111-1111-4111-8111-111111111111',
    format($q$SELECT confirm_manual_payment('%s','FNB-12345','confirm-key-00001')::text$q$, v_intent));
  PERFORM expect('A developer cannot confirm their own payment', res LIKE 'ERR:Only super admins%');

  -- Capture the position before confirmation so the assertions below measure
  -- the effect of this payment rather than the whole suite's history.
  SELECT balance_cents INTO bank  FROM ledger_account_balances WHERE code='bank';
  SELECT balance_cents INTO funds FROM ledger_account_balances WHERE code='campaign_funds';
  SELECT balance_cents INTO fee   FROM ledger_account_balances WHERE code='platform_fee';

  -- Operator confirms receipt. This is where money is created.
  PERFORM set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444', true);
  j := confirm_manual_payment(v_intent, 'FNB-12345', 'confirm-key-00001');
  PERFORM expect('An operator can confirm receipt', (j->>'success') = 'true');
  PERFORM expect('Platform fee is 25% of R2,000 = R500', (j->>'platform_fee_cents')::BIGINT = 50000);
  PERFORM expect('Campaign receives the remaining R1,500', (j->>'campaign_funds_cents')::BIGINT = 150000);

  PERFORM expect('Bank asset rises by R2,000',
    (SELECT balance_cents FROM ledger_account_balances WHERE code='bank') - bank = 200000);
  PERFORM expect('Campaign funds liability rises by R1,500',
    (SELECT balance_cents FROM ledger_account_balances WHERE code='campaign_funds') - funds = 150000);
  PERFORM expect('Platform income rises by R500',
    (SELECT balance_cents FROM ledger_account_balances WHERE code='platform_fee') - fee = 50000);
  PERFORM expect('Ledger balances after funding', ledger_is_balanced());
  SELECT balance_cents INTO bank FROM ledger_account_balances WHERE code='bank';

  -- Idempotency: the same confirmation twice must not fund twice.
  j := confirm_manual_payment(v_intent, 'FNB-12345', 'confirm-key-00001');
  PERFORM expect('Replaying a confirmation is a no-op', (j->>'replayed') = 'true');
  PERFORM expect('Bank balance unchanged after replay',
    (SELECT balance_cents FROM ledger_account_balances WHERE code='bank') = bank);

  -- A confirmed payment cannot be rejected.
  res := try_sql('44444444-4444-4444-8444-444444444444',
    format($q$SELECT reject_manual_payment('%s','changed my mind')::text$q$, v_intent));
  PERFORM expect('A confirmed payment cannot be rejected', res LIKE 'ERR:A confirmed payment%');

  RAISE NOTICE '--- LEDGER FOLLOWS THE MONEY ---';

  -- Release R600 of the funded campaign to the assigned creator.
  INSERT INTO campaign_assignments (campaign_id, creator_id)
  VALUES ('cccccccc-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222');

  PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111', true);
  SELECT balance_cents INTO funds2  FROM ledger_account_balances WHERE code='campaign_funds';
  SELECT balance_cents INTO payable FROM ledger_account_balances WHERE code='creator_payable';
  j := release_campaign_escrow('cccccccc-0000-4000-8000-000000000002',
                               '22222222-2222-4222-8222-222222222222',
                               600, 'content approved', 'ledger-release-0001');
  PERFORM expect('Escrow release succeeds', (j->>'success') = 'true');

  PERFORM expect('Campaign funds fall by R600',
    funds2 - (SELECT balance_cents FROM ledger_account_balances WHERE code='campaign_funds') = 60000);
  PERFORM expect('Creator payable rises by R600',
    (SELECT balance_cents FROM ledger_account_balances WHERE code='creator_payable') - payable = 60000);
  PERFORM expect('Ledger still balances after a release', ledger_is_balanced());
  PERFORM expect('No cash left the bank on a release',
    (SELECT balance_cents FROM ledger_account_balances WHERE code='bank') = bank);

  RAISE NOTICE '--- RECONCILIATION ---';

  PERFORM set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444', true);
  j := run_reconciliation();
  PERFORM expect('Reconciliation reports the ledger balanced', (j->>'balanced') = 'true');

  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT run_reconciliation()::text$q$);
  PERFORM expect('A creator cannot run reconciliation', res LIKE 'ERR:Only super admins%');

  RAISE NOTICE '--- LEDGER REFUSES AN UNBALANCED POSTING ---';

  BEGIN
    PERFORM post_ledger_transaction(
      jsonb_build_array(
        jsonb_build_object('account','bank','direction','debit','amount_cents', 100),
        jsonb_build_object('account','platform_fee','direction','credit','amount_cents', 99)
      ), 'bad_posting');
    PERFORM expect('An unbalanced transaction is refused', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('An unbalanced transaction is refused', TRUE);
  END;

  BEGIN
    UPDATE ledger_entries SET amount_cents = 1 WHERE TRUE;
    PERFORM expect('Ledger entries are immutable', FALSE);
  EXCEPTION WHEN OTHERS THEN
    PERFORM expect('Ledger entries are immutable', SQLERRM LIKE '%append-only%');
  END;
END $$;
