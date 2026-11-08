-- ============================================================================
-- 023_ledger_integration.sql
--
-- Brings the money movements defined in migration 016 onto the double-entry
-- ledger from migration 022, and adds the reconciliation the checklist asks
-- for.
--
-- WHY THIS IS A SEPARATE MIGRATION
-- --------------------------------
-- 016 shipped and was tested before the ledger existed. Rather than editing
-- it in place -- which would make the applied history of an already-deployed
-- environment ambiguous -- the functions are redefined here. Behaviour is
-- unchanged except that each now also posts a balanced ledger transaction.
--
-- After this migration `ledger_is_balanced()` must hold at all times. If it
-- ever returns false, stop and investigate before moving more money.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Escrow release: campaign funds become money owed to a creator.
--
--    Debit  campaign_funds   (the liability to the developer shrinks)
--    Credit creator_payable  (the liability to the creator grows)
--
--    No cash moves here -- the platform still holds it. Cash leaves only on
--    payout.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION release_campaign_escrow(
  p_campaign_id     UUID,
  p_creator_id      UUID,
  p_amount          DECIMAL(12,2),
  p_reason          TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_existing  JSONB;
  v_campaign  campaigns;
  v_escrow    wallets;
  v_creator   wallets;
  v_reference TEXT;
  v_cents     BIGINT;
  v_txn       UUID;
  v_result    JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = 'check_violation';
  END IF;

  v_existing := fin_existing_operation(p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Release amount must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_campaign FROM campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_campaign.developer_id <> v_caller AND NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Not authorised to release funds for this campaign'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM campaign_assignments
    WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id
  ) THEN
    RAISE EXCEPTION 'Creator is not assigned to this campaign' USING ERRCODE = 'check_violation';
  END IF;

  IF v_campaign.escrow_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Campaign has no escrow wallet' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_escrow FROM wallets WHERE id = v_campaign.escrow_wallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_escrow.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient escrow balance' USING ERRCODE = 'check_violation';
  END IF;

  v_creator   := fin_lock_wallet(p_creator_id, 'creator');
  v_reference := 'REL-' || substr(p_campaign_id::text, 1, 8) || '-' || substr(p_idempotency_key, 1, 12);
  v_cents     := ROUND(p_amount * 100);

  v_txn := post_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('account','campaign_funds',  'direction','debit',  'amount_cents', v_cents),
      jsonb_build_object('account','creator_payable', 'direction','credit', 'amount_cents', v_cents,
                         'counterparty_id', p_creator_id)
    ),
    'escrow_released', p_campaign_id, p_creator_id, v_reference,
    jsonb_build_object('reason', p_reason)
  );

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_escrow.id, 'escrow_release', -p_amount, -p_amount,
    v_escrow.balance, v_escrow.balance - p_amount,
    'Escrow release: ' || COALESCE(p_reason, 'content approved'),
    v_reference || '-OUT', p_campaign_id, v_creator.id,
    jsonb_build_object('creator_id', p_creator_id, 'idempotency_key', p_idempotency_key,
                       'ledger_transaction_id', v_txn),
    v_caller
  );

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_creator.id, 'escrow_release', p_amount, p_amount,
    v_creator.balance, v_creator.balance + p_amount,
    'Payment received: ' || COALESCE(p_reason, 'content approved'),
    v_reference || '-IN', p_campaign_id, v_escrow.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'ledger_transaction_id', v_txn),
    v_caller
  );

  UPDATE wallets SET balance = balance - p_amount, updated_at = NOW() WHERE id = v_escrow.id;
  UPDATE wallets
  SET balance = balance + p_amount,
      total_earned = COALESCE(total_earned, 0) + p_amount,
      updated_at = NOW()
  WHERE id = v_creator.id;

  UPDATE campaigns
  SET escrow_amount   = GREATEST(COALESCE(escrow_amount, 0) - p_amount, 0),
      amount_paid_out = COALESCE(amount_paid_out, 0) + p_amount
  WHERE id = p_campaign_id;

  v_result := jsonb_build_object(
    'success', true, 'amount', p_amount, 'reference_number', v_reference,
    'campaign_id', p_campaign_id, 'creator_id', p_creator_id,
    'ledger_transaction_id', v_txn
  );

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    campaign_id, counterparty_id, amount, result)
  VALUES (p_idempotency_key, 'release_escrow', v_caller, p_campaign_id,
          p_creator_id, p_amount, v_result);

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Payout: money owed to a creator actually leaves the bank account.
--
--    On request  -- nothing is posted; the money has not moved, it is only
--                   held. The wallet hold is enough.
--    On approval -- Debit  creator_payable (the liability is settled)
--                   Credit bank            (cash leaves)
--                   Credit payout_fee      (the platform keeps the fee)
--                   with the debit covering both credits.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_payout_request(
  p_payout_id          UUID,
  p_action             TEXT,
  p_notes              TEXT,
  p_idempotency_key    TEXT,
  p_provider_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_existing   JSONB;
  v_payout     payout_requests;
  v_wallet     wallets;
  v_gross      BIGINT;
  v_fee        BIGINT;
  v_net        BIGINT;
  v_txn        UUID;
  v_result     JSONB;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may process payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Action must be approve or reject' USING ERRCODE = 'check_violation';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = 'check_violation';
  END IF;

  v_existing := fin_existing_operation(p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_payout FROM payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_payout.user_id = v_caller THEN
    RAISE EXCEPTION 'You may not action your own payout request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_payout.status <> 'pending' THEN
    RAISE EXCEPTION 'Payout is not pending' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE id = v_payout.wallet_id FOR UPDATE;

  v_gross := ROUND(v_payout.amount * 100);
  v_fee   := ROUND(v_payout.payout_fee * 100);
  v_net   := v_gross - v_fee;

  IF p_action = 'approve' THEN
    -- Cash leaves the bank; the platform keeps the fee.
    v_txn := post_ledger_transaction(
      jsonb_build_array(
        jsonb_build_object('account','creator_payable','direction','debit',  'amount_cents', v_gross,
                           'counterparty_id', v_payout.user_id),
        jsonb_build_object('account','bank',           'direction','credit', 'amount_cents', v_net),
        jsonb_build_object('account','payout_fee',     'direction','credit', 'amount_cents', v_fee)
      ),
      'payout_settled', NULL, v_payout.user_id,
      COALESCE(p_provider_reference, 'PAY-' || substr(p_payout_id::text, 1, 8)),
      jsonb_build_object('payout_id', p_payout_id)
    );

    UPDATE payout_requests
    SET status = 'processing', processed_by = v_caller, processed_at = NOW(),
        payment_reference = p_provider_reference, notes = p_notes
    WHERE id = p_payout_id;

    UPDATE wallets
    SET pending_balance = GREATEST(COALESCE(pending_balance, 0) - v_payout.amount, 0),
        total_withdrawn = COALESCE(total_withdrawn, 0) + (v_net / 100.0),
        updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO wallet_transactions (
      wallet_id, transaction_type, amount, net_amount, fee,
      balance_before, balance_after, description, reference_number,
      related_payout_id, metadata, created_by
    ) VALUES (
      v_wallet.id, 'payout_fee', -(v_fee / 100.0), -(v_fee / 100.0), v_fee / 100.0,
      v_wallet.balance, v_wallet.balance,
      'Payout fee', 'PAY-' || substr(p_payout_id::text, 1, 8) || '-FEE',
      p_payout_id,
      jsonb_build_object('idempotency_key', p_idempotency_key, 'ledger_transaction_id', v_txn),
      v_caller
    );

    v_result := jsonb_build_object('success', true, 'status', 'processing',
                                   'payout_id', p_payout_id, 'ledger_transaction_id', v_txn);
  ELSE
    -- Nothing was ever posted for the request, so rejection posts nothing
    -- either; it simply returns the hold to the available balance.
    UPDATE wallets
    SET balance = balance + v_payout.amount,
        pending_balance = GREATEST(COALESCE(pending_balance, 0) - v_payout.amount, 0),
        updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO wallet_transactions (
      wallet_id, transaction_type, amount, net_amount,
      balance_before, balance_after, description, reference_number,
      related_payout_id, metadata, created_by
    ) VALUES (
      v_wallet.id, 'refund', v_payout.amount, v_payout.amount,
      v_wallet.balance, v_wallet.balance + v_payout.amount,
      'Payout request rejected', 'PAY-' || substr(p_payout_id::text, 1, 8) || '-REF',
      p_payout_id,
      jsonb_build_object('idempotency_key', p_idempotency_key, 'reason', p_notes),
      v_caller
    );

    UPDATE payout_requests
    SET status = 'cancelled', processed_by = v_caller, processed_at = NOW(),
        failure_reason = p_notes, notes = p_notes
    WHERE id = p_payout_id;

    v_result := jsonb_build_object('success', true, 'status', 'cancelled', 'payout_id', p_payout_id);
  END IF;

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    counterparty_id, amount, provider_reference, result)
  VALUES (p_idempotency_key, 'process_payout', v_caller, v_payout.user_id,
          v_payout.amount, p_provider_reference, v_result);

  PERFORM record_audit_event('payout_' || p_action || 'd', 'payout_requests',
                             p_payout_id, v_result);

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Refund: campaign funds go back to the developer's bank account.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refund_campaign_escrow(
  p_campaign_id     UUID,
  p_amount          DECIMAL(12,2),
  p_reason          TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_existing  JSONB;
  v_campaign  campaigns;
  v_escrow    wallets;
  v_developer wallets;
  v_reference TEXT;
  v_cents     BIGINT;
  v_txn       UUID;
  v_result    JSONB;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may refund campaign funds'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = 'check_violation';
  END IF;

  v_existing := fin_existing_operation(p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_campaign FROM campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_campaign.escrow_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Campaign has no escrow wallet' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_escrow FROM wallets WHERE id = v_campaign.escrow_wallet_id FOR UPDATE;
  IF v_escrow.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient escrow balance' USING ERRCODE = 'check_violation';
  END IF;

  v_developer := fin_lock_wallet(v_campaign.developer_id, 'developer');
  v_reference := 'REF-' || substr(p_campaign_id::text, 1, 8) || '-' || substr(p_idempotency_key, 1, 12);
  v_cents     := ROUND(p_amount * 100);

  v_txn := post_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('account','campaign_funds','direction','debit',  'amount_cents', v_cents),
      jsonb_build_object('account','bank',          'direction','credit', 'amount_cents', v_cents)
    ),
    'campaign_refunded', p_campaign_id, v_campaign.developer_id, v_reference,
    jsonb_build_object('reason', p_reason)
  );

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_escrow.id, 'refund', -p_amount, -p_amount,
    v_escrow.balance, v_escrow.balance - p_amount,
    'Refund: ' || COALESCE(p_reason, 'dispute resolution'),
    v_reference || '-OUT', p_campaign_id, v_developer.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'ledger_transaction_id', v_txn),
    v_caller
  );

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_developer.id, 'refund', p_amount, p_amount,
    v_developer.balance, v_developer.balance + p_amount,
    'Refund received: ' || COALESCE(p_reason, 'dispute resolution'),
    v_reference || '-IN', p_campaign_id, v_escrow.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'ledger_transaction_id', v_txn),
    v_caller
  );

  UPDATE wallets SET balance = balance - p_amount, updated_at = NOW() WHERE id = v_escrow.id;
  UPDATE wallets SET balance = balance + p_amount, updated_at = NOW() WHERE id = v_developer.id;
  UPDATE campaigns
  SET escrow_amount = GREATEST(COALESCE(escrow_amount, 0) - p_amount, 0)
  WHERE id = p_campaign_id;

  v_result := jsonb_build_object('success', true, 'amount', p_amount,
                                 'reference_number', v_reference,
                                 'campaign_id', p_campaign_id,
                                 'ledger_transaction_id', v_txn);

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    campaign_id, amount, result)
  VALUES (p_idempotency_key, 'refund_escrow', v_caller, p_campaign_id, p_amount, v_result);

  PERFORM record_audit_event('campaign_refunded', 'campaigns', p_campaign_id, v_result);

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Reconciliation
--
--    Answers the questions the audit says the platform must be able to
--    answer, from the ledger rather than from derived balances.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW financial_position AS
SELECT
  (SELECT balance_cents FROM ledger_account_balances WHERE code='bank')            AS cash_held_cents,
  (SELECT balance_cents FROM ledger_account_balances WHERE code='campaign_funds')  AS campaign_funds_cents,
  (SELECT balance_cents FROM ledger_account_balances WHERE code='creator_payable') AS owed_to_creators_cents,
  (SELECT balance_cents FROM ledger_account_balances WHERE code='platform_fee')    AS platform_income_cents,
  (SELECT balance_cents FROM ledger_account_balances WHERE code='payout_fee')      AS payout_income_cents,
  (SELECT balance_cents FROM ledger_account_balances WHERE code='campaign_funds')
    + (SELECT balance_cents FROM ledger_account_balances WHERE code='creator_payable')
                                                                                   AS total_liability_cents,
  ledger_is_balanced()                                                             AS is_balanced;

REVOKE ALL ON financial_position FROM anon, authenticated;

/**
 * Compare the ledger against the derived wallet balances.
 *
 * These are maintained by the same transactions, so they should always agree.
 * A row returned here means they do not, which is a stop-and-investigate
 * condition rather than something to patch around.
 */
CREATE OR REPLACE FUNCTION reconcile_wallets()
RETURNS TABLE (
  discrepancy        TEXT,
  ledger_cents       BIGINT,
  wallet_cents       BIGINT,
  difference_cents   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH ledger_payable AS (
    SELECT COALESCE(balance_cents, 0) AS cents
    FROM ledger_account_balances WHERE code = 'creator_payable'
  ),
  wallet_payable AS (
    SELECT COALESCE(ROUND(SUM(balance + COALESCE(pending_balance, 0)) * 100), 0)::BIGINT AS cents
    FROM wallets WHERE wallet_type = 'creator'
  ),
  ledger_funds AS (
    SELECT COALESCE(balance_cents, 0) AS cents
    FROM ledger_account_balances WHERE code = 'campaign_funds'
  ),
  wallet_funds AS (
    SELECT COALESCE(ROUND(SUM(balance) * 100), 0)::BIGINT AS cents
    FROM wallets WHERE wallet_type = 'escrow'
  )
  SELECT 'creator_payable vs creator wallets'::TEXT,
         lp.cents, wp.cents, lp.cents - wp.cents
  FROM ledger_payable lp, wallet_payable wp
  WHERE lp.cents <> wp.cents
  UNION ALL
  SELECT 'campaign_funds vs escrow wallets'::TEXT,
         lf.cents, wf.cents, lf.cents - wf.cents
  FROM ledger_funds lf, wallet_funds wf
  WHERE lf.cents <> wf.cents;
END;
$$;

REVOKE ALL ON FUNCTION reconcile_wallets() FROM PUBLIC, anon, authenticated;

/** A super-admin-callable wrapper, so reconciliation can be run from the UI. */
CREATE OR REPLACE FUNCTION run_reconciliation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_rows   JSONB;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may run reconciliation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_rows
  FROM reconcile_wallets() r;

  PERFORM record_audit_event('reconciliation_run', 'ledger', NULL,
                             jsonb_build_object('discrepancies', v_rows));

  RETURN jsonb_build_object(
    'balanced', ledger_is_balanced(),
    'discrepancies', v_rows,
    'position', (SELECT to_jsonb(f) FROM financial_position f)
  );
END;
$$;

REVOKE ALL ON FUNCTION run_reconciliation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION run_reconciliation() TO authenticated;

COMMIT;
