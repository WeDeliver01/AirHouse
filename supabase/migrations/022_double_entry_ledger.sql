-- ============================================================================
-- 022_double_entry_ledger.sql
--
-- An immutable double-entry ledger, and the manual bank-transfer flow that
-- runs on top of it.
--
-- WHY DOUBLE ENTRY
-- ----------------
-- The wallet balances in migration 016 are correct and atomic, but they are
-- derived numbers. A derived number cannot answer "where did this come from",
-- and two derived numbers cannot be proved consistent with each other. Double
-- entry fixes that: every movement writes equal debits and credits, so the
-- whole ledger must sum to zero, and any balance can be re-derived from the
-- entries rather than trusted.
--
-- CHART OF ACCOUNTS
-- -----------------
--   bank            asset       money actually in the platform bank account
--   creator_payable liability   earned by creators, not yet paid out
--   campaign_funds  liability   paid in by developers, not yet earned
--   platform_fee    income      the platform's share
--   payout_fee      income      fee on withdrawals
--   refunds         contra      money returned to developers
--
-- Money is collected by bank transfer and paid out by bank transfer. The
-- platform holds developer funds between those two events, which is what
-- `campaign_funds` represents.
--
-- NOTE ON SCOPE: the product owner has decided to operate without a formal
-- escrow arrangement and without a legal review of the funds flow. This
-- schema therefore models the platform's own bookkeeping only. It makes no
-- representation about the legal character of the money held, and the
-- `campaign_funds` account is a liability precisely because those funds
-- belong to somebody else.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Accounts
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ledger_accounts (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('asset','liability','income','expense','contra')),
  -- Which side increases this account.
  normal_side TEXT NOT NULL CHECK (normal_side IN ('debit','credit'))
);

INSERT INTO ledger_accounts (code, name, kind, normal_side) VALUES
  ('bank',            'Platform bank account',        'asset',     'debit'),
  ('creator_payable', 'Owed to creators',             'liability', 'credit'),
  ('campaign_funds',  'Campaign funds held',          'liability', 'credit'),
  ('platform_fee',    'Platform commission income',   'income',    'credit'),
  ('payout_fee',      'Payout fee income',            'income',    'credit'),
  ('refunds',         'Refunds to developers',        'contra',    'debit')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Entries
--
--    Amounts are integer cents. Storing money as a float or a rounded decimal
--    invites drift that only shows up during reconciliation.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ledger_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Both sides of one movement share a transaction id.
  transaction_id UUID NOT NULL,
  account_code   TEXT NOT NULL REFERENCES ledger_accounts(code),
  direction      TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),
  currency       TEXT NOT NULL DEFAULT 'ZAR',
  -- What caused this, and who it concerns.
  event_type     TEXT NOT NULL,
  campaign_id    UUID,
  counterparty_id UUID REFERENCES profiles(id),
  actor_id       UUID REFERENCES profiles(id),
  reference      TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_txn      ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account  ON ledger_entries (account_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_party    ON ledger_entries (counterparty_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_campaign ON ledger_entries (campaign_id, created_at DESC);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_entries, ledger_accounts FROM anon, authenticated;
GRANT SELECT ON ledger_entries, ledger_accounts TO authenticated;

DROP POLICY IF EXISTS "ledger_entries_select" ON ledger_entries;
CREATE POLICY "ledger_entries_select" ON ledger_entries
  FOR SELECT TO authenticated
  USING (counterparty_id = auth.uid() OR fin_is_super_admin(auth.uid()));

-- The ledger is append-only, like wallet_transactions.
DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER trg_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- ----------------------------------------------------------------------------
-- 3. Posting
--
--    One function writes entries, and it refuses anything that does not
--    balance. That single check is what makes the rest of the system
--    trustworthy.
-- ----------------------------------------------------------------------------

/**
 * Post a balanced set of entries as one transaction.
 *
 * p_legs is a JSON array of {account, direction, amount_cents}. The sum of
 * debits must equal the sum of credits or nothing is written.
 */
CREATE OR REPLACE FUNCTION post_ledger_transaction(
  p_legs           JSONB,
  p_event_type     TEXT,
  p_campaign_id    UUID DEFAULT NULL,
  p_counterparty_id UUID DEFAULT NULL,
  p_reference      TEXT DEFAULT NULL,
  p_metadata       JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_txn     UUID := gen_random_uuid();
  v_debits  BIGINT := 0;
  v_credits BIGINT := 0;
  v_leg     JSONB;
BEGIN
  IF jsonb_typeof(p_legs) <> 'array' OR jsonb_array_length(p_legs) < 2 THEN
    RAISE EXCEPTION 'A ledger transaction needs at least two legs'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    IF (v_leg->>'direction') = 'debit' THEN
      v_debits := v_debits + (v_leg->>'amount_cents')::BIGINT;
    ELSE
      v_credits := v_credits + (v_leg->>'amount_cents')::BIGINT;
    END IF;
  END LOOP;

  IF v_debits <> v_credits THEN
    RAISE EXCEPTION 'Ledger transaction does not balance: debits %, credits %',
      v_debits, v_credits USING ERRCODE = 'check_violation';
  END IF;

  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    INSERT INTO ledger_entries (
      transaction_id, account_code, direction, amount_cents,
      event_type, campaign_id, counterparty_id, actor_id, reference, metadata
    ) VALUES (
      v_txn,
      v_leg->>'account',
      v_leg->>'direction',
      (v_leg->>'amount_cents')::BIGINT,
      p_event_type, p_campaign_id,
      COALESCE((v_leg->>'counterparty_id')::UUID, p_counterparty_id),
      auth.uid(), p_reference, p_metadata
    );
  END LOOP;

  RETURN v_txn;
END;
$$;

REVOKE ALL ON FUNCTION post_ledger_transaction(JSONB, TEXT, UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Balances, derived rather than stored
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW ledger_account_balances AS
SELECT
  a.code,
  a.name,
  a.kind,
  COALESCE(SUM(CASE WHEN e.direction = 'debit'  THEN e.amount_cents ELSE 0 END), 0) AS debits_cents,
  COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount_cents ELSE 0 END), 0) AS credits_cents,
  CASE a.normal_side
    WHEN 'debit' THEN
      COALESCE(SUM(CASE WHEN e.direction='debit'  THEN e.amount_cents ELSE -e.amount_cents END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount_cents ELSE -e.amount_cents END), 0)
  END AS balance_cents
FROM ledger_accounts a
LEFT JOIN ledger_entries e ON e.account_code = a.code
GROUP BY a.code, a.name, a.kind, a.normal_side;

REVOKE ALL ON ledger_account_balances FROM anon, authenticated;

/**
 * The whole-ledger integrity check: total debits must equal total credits.
 * If this ever returns false, stop and investigate before moving more money.
 */
CREATE OR REPLACE FUNCTION ledger_is_balanced()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(CASE WHEN direction='debit' THEN amount_cents ELSE -amount_cents END), 0) = 0
  FROM ledger_entries;
$$;

GRANT EXECUTE ON FUNCTION ledger_is_balanced() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Manual bank payments
--
--    The platform operates on bank transfers until a card gateway is switched
--    on. A developer is given a reference, pays by EFT, and an operator
--    confirms receipt against the bank statement. Confirmation is the only
--    thing that creates funds -- the developer's claim to have paid does not.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_intents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        TEXT UNIQUE NOT NULL,
  campaign_id      UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  payer_id         UUID NOT NULL REFERENCES profiles(id),
  amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
  currency         TEXT NOT NULL DEFAULT 'ZAR',
  method           TEXT NOT NULL DEFAULT 'bank_transfer'
                     CHECK (method IN ('bank_transfer','card')),
  status           TEXT NOT NULL DEFAULT 'awaiting_payment'
                     CHECK (status IN ('awaiting_payment','under_review','confirmed','rejected','cancelled')),
  proof_object_path TEXT,
  bank_reference   TEXT,
  confirmed_by     UUID REFERENCES profiles(id),
  confirmed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_payer  ON payment_intents (payer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents (status, created_at DESC);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_intents FROM anon, authenticated;
GRANT SELECT ON payment_intents TO authenticated;

DROP POLICY IF EXISTS "payment_intents_select" ON payment_intents;
CREATE POLICY "payment_intents_select" ON payment_intents
  FOR SELECT TO authenticated
  USING (payer_id = auth.uid() OR fin_is_super_admin(auth.uid()));

/**
 * Start a funding request. Creates a reference for the developer to quote on
 * their EFT. Creates no money: status begins at `awaiting_payment`.
 */
CREATE OR REPLACE FUNCTION create_payment_intent(
  p_campaign_id UUID,
  p_amount_cents BIGINT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_existing JSONB;
  v_campaign campaigns;
  v_ref      TEXT;
  v_id       UUID;
  v_result   JSONB;
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

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_campaign FROM campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_campaign.developer_id <> v_caller THEN
    RAISE EXCEPTION 'Only the campaign owner may fund it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_ref := 'AH-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));

  INSERT INTO payment_intents (reference, campaign_id, payer_id, amount_cents)
  VALUES (v_ref, p_campaign_id, v_caller, p_amount_cents)
  RETURNING id INTO v_id;

  v_result := jsonb_build_object(
    'success', true, 'payment_intent_id', v_id,
    'reference', v_ref, 'amount_cents', p_amount_cents,
    'status', 'awaiting_payment'
  );

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    campaign_id, amount, result)
  VALUES (p_idempotency_key, 'create_payment_intent', v_caller, p_campaign_id,
          p_amount_cents / 100.0, v_result);

  PERFORM record_audit_event('payment_intent_created', 'payment_intents', v_id,
                             jsonb_build_object('reference', v_ref, 'amount_cents', p_amount_cents));

  RETURN v_result;
END;
$$;

/** The payer tells us they have paid, and attaches proof. Still no money. */
CREATE OR REPLACE FUNCTION submit_payment_proof(
  p_payment_intent_id UUID,
  p_proof_object_path TEXT,
  p_bank_reference    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_intent payment_intents;
BEGIN
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment intent not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_intent.payer_id <> v_caller THEN
    RAISE EXCEPTION 'Not your payment' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_intent.status <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'This payment is already %', v_intent.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE payment_intents
  SET status = 'under_review',
      proof_object_path = p_proof_object_path,
      bank_reference = p_bank_reference,
      updated_at = NOW()
  WHERE id = p_payment_intent_id;

  PERFORM record_audit_event('payment_proof_submitted', 'payment_intents',
                             p_payment_intent_id, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'status', 'under_review');
END;
$$;

/**
 * An operator confirms the money actually arrived.
 *
 * This is the single point at which campaign funds come into existence. It
 * posts the double-entry transaction, credits the campaign, and is idempotent
 * so a double click cannot fund a campaign twice.
 */
CREATE OR REPLACE FUNCTION confirm_manual_payment(
  p_payment_intent_id UUID,
  p_bank_reference    TEXT,
  p_idempotency_key   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_existing  JSONB;
  v_intent    payment_intents;
  v_fee_rate  NUMERIC;
  v_fee_cents BIGINT;
  v_net_cents BIGINT;
  v_escrow    wallets;
  v_txn       UUID;
  v_result    JSONB;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may confirm a payment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = 'check_violation';
  END IF;

  v_existing := fin_existing_operation(p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_intent FROM payment_intents WHERE id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment intent not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_intent.status = 'confirmed' THEN
    RAISE EXCEPTION 'This payment is already confirmed' USING ERRCODE = 'check_violation';
  END IF;
  IF v_intent.status NOT IN ('awaiting_payment','under_review') THEN
    RAISE EXCEPTION 'A % payment cannot be confirmed', v_intent.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- Separation of duties: an operator cannot confirm their own payment.
  IF v_intent.payer_id = v_caller THEN
    RAISE EXCEPTION 'You may not confirm your own payment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_fee_rate  := (get_platform_setting('platform_fee_rate', '0.25'::jsonb))::text::numeric;
  v_fee_cents := ROUND(v_intent.amount_cents * v_fee_rate);
  v_net_cents := v_intent.amount_cents - v_fee_cents;

  -- Double entry: cash in, split between the platform's income and the
  -- balance held on the developer's behalf.
  v_txn := post_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('account','bank',           'direction','debit',  'amount_cents', v_intent.amount_cents),
      jsonb_build_object('account','platform_fee',   'direction','credit', 'amount_cents', v_fee_cents),
      jsonb_build_object('account','campaign_funds', 'direction','credit', 'amount_cents', v_net_cents)
    ),
    'campaign_funded', v_intent.campaign_id, v_intent.payer_id, v_intent.reference,
    jsonb_build_object('payment_intent_id', p_payment_intent_id, 'method', v_intent.method)
  );

  -- Keep the derived wallet view in step with the ledger.
  v_escrow := fin_lock_wallet(v_intent.payer_id, 'escrow');

  UPDATE wallets
  SET balance = balance + (v_net_cents / 100.0), updated_at = NOW()
  WHERE id = v_escrow.id;

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount, fee,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, metadata, created_by
  ) VALUES (
    v_escrow.id, 'deposit', v_net_cents / 100.0, v_net_cents / 100.0, v_fee_cents / 100.0,
    v_escrow.balance, v_escrow.balance + (v_net_cents / 100.0),
    'Campaign funding confirmed', v_intent.reference,
    v_intent.campaign_id,
    jsonb_build_object('payment_intent_id', p_payment_intent_id, 'ledger_transaction_id', v_txn),
    v_caller
  );

  UPDATE campaigns
  SET escrow_amount    = COALESCE(escrow_amount, 0) + (v_net_cents / 100.0),
      escrow_wallet_id = COALESCE(escrow_wallet_id, v_escrow.id),
      platform_fee     = COALESCE(platform_fee, 0) + (v_fee_cents / 100.0),
      funded_at        = COALESCE(funded_at, NOW())
  WHERE id = v_intent.campaign_id;

  UPDATE payment_intents
  SET status = 'confirmed', confirmed_by = v_caller, confirmed_at = NOW(),
      bank_reference = COALESCE(p_bank_reference, bank_reference), updated_at = NOW()
  WHERE id = p_payment_intent_id;

  v_result := jsonb_build_object(
    'success', true,
    'payment_intent_id', p_payment_intent_id,
    'ledger_transaction_id', v_txn,
    'amount_cents', v_intent.amount_cents,
    'platform_fee_cents', v_fee_cents,
    'campaign_funds_cents', v_net_cents
  );

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    campaign_id, counterparty_id, amount,
                                    provider_reference, result)
  VALUES (p_idempotency_key, 'confirm_manual_payment', v_caller, v_intent.campaign_id,
          v_intent.payer_id, v_intent.amount_cents / 100.0, v_intent.reference, v_result);

  PERFORM record_audit_event('payment_confirmed', 'payment_intents', p_payment_intent_id, v_result);

  RETURN v_result;
END;
$$;

/** Reject a payment that never arrived or cannot be matched. */
CREATE OR REPLACE FUNCTION reject_manual_payment(
  p_payment_intent_id UUID,
  p_reason            TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_intent payment_intents;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may reject a payment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_intent FROM payment_intents WHERE id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment intent not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_intent.status = 'confirmed' THEN
    RAISE EXCEPTION 'A confirmed payment cannot be rejected; post a refund instead'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE payment_intents
  SET status = 'rejected', rejection_reason = p_reason,
      confirmed_by = v_caller, confirmed_at = NOW(), updated_at = NOW()
  WHERE id = p_payment_intent_id;

  PERFORM record_audit_event('payment_rejected', 'payment_intents', p_payment_intent_id,
                             jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION create_payment_intent(UUID, BIGINT, TEXT)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION submit_payment_proof(UUID, TEXT, TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION confirm_manual_payment(UUID, TEXT, TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION reject_manual_payment(UUID, TEXT)               FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION create_payment_intent(UUID, BIGINT, TEXT)    TO authenticated;
GRANT EXECUTE ON FUNCTION submit_payment_proof(UUID, TEXT, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_manual_payment(UUID, TEXT, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION reject_manual_payment(UUID, TEXT)            TO authenticated;

COMMIT;
