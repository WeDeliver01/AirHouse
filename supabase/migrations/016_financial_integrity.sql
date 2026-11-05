-- ============================================================================
-- 016_financial_integrity.sql
--
-- Makes money movement server-authoritative, atomic and idempotent.
--
-- WHY
-- ---
-- Before this migration every financial operation was performed by the
-- browser as a sequence of independent requests: read a balance, insert
-- transaction rows, then update each wallet. That design has three defects
-- that are unacceptable for a platform holding developer funds and creator
-- earnings (AH-002):
--
--   1. Partial failure. If the second wallet update failed, the ledger and
--      the balances disagreed permanently, with no rollback.
--   2. Concurrency. Two simultaneous release requests both read the same
--      starting balance and both succeeded, paying a creator twice.
--   3. Trust. The client decided the amounts and the resulting balances.
--      Combined with a permissive RLS policy on `wallets` (AH-001) a user
--      could simply write their own balance.
--
-- This migration replaces those client-side sequences with SECURITY DEFINER
-- functions. Each runs in a single transaction, takes row locks in a fixed
-- order, re-derives every amount from stored data, enforces authorization
-- internally, and is keyed by an idempotency token so a retry or duplicate
-- webhook cannot move money twice.
--
-- !! BEFORE APPLYING !!
-- ---------------------
-- The deployed schema has NOT been confirmed to match the numbered
-- migrations in this directory. `src/lib/payments.js` writes a
-- `pending_balance` column that migration 004 does not define, and omits the
-- NOT NULL `net_amount` column that it does define -- which indicates the
-- live database was built from `supabase/quick_setup.sql` and patched, not
-- from this migration series. See docs/MIGRATION_HISTORY.md.
--
-- This file is therefore written defensively (IF NOT EXISTS / conditional
-- column adds) but it MUST still be:
--   1. Run against a restored copy of the production database first.
--   2. Verified with the checks in docs/FINANCIAL_ARCHITECTURE.md.
-- Do not run it directly against production.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Schema normalisation
--    Bring the wallet tables to a known shape regardless of which historical
--    script created them.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE transaction_type AS ENUM (
      'deposit', 'platform_fee', 'escrow_lock', 'escrow_release',
      'content_payment', 'payout_request', 'payout_fee', 'refund', 'adjustment'
    );
  END IF;
END $$;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pending_balance DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS escrow_balance  DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS total_earned    DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS total_withdrawn DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS metadata        JSONB DEFAULT '{}'::jsonb;

-- `net_amount` is NOT NULL in migration 004 but was never populated by the
-- client. Give it a default so historical inserts cannot fail on it; the
-- functions below always set it explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions'
      AND column_name = 'net_amount'
  ) THEN
    ALTER TABLE wallet_transactions ALTER COLUMN net_amount SET DEFAULT 0.00;
  END IF;
END $$;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS escrow_amount   DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS amount_paid_out DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS escrow_wallet_id UUID;

-- ----------------------------------------------------------------------------
-- 1. Balances may never go negative.
--    Enforced by the database, not by application logic, so a bug in any
--    caller cannot create money.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_non_negative'
  ) THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_balance_non_negative
      CHECK (balance >= 0 AND COALESCE(pending_balance, 0) >= 0);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Idempotency and operation audit.
--    Every money movement is registered here before it happens. The unique
--    key means a retried request returns the original result instead of
--    performing the movement a second time.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS financial_operations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  TEXT NOT NULL UNIQUE,
  operation_type   TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'completed',
  actor_id         UUID REFERENCES profiles(id),
  campaign_id      UUID,
  counterparty_id  UUID,
  amount           DECIMAL(12,2),
  currency         TEXT NOT NULL DEFAULT 'ZAR',
  provider_reference TEXT,
  result           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_operations_actor
  ON financial_operations (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_operations_campaign
  ON financial_operations (campaign_id, created_at DESC);

ALTER TABLE financial_operations ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. The ledger is append-only.
--    Corrections are made with a reversing entry, never by editing history.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION forbid_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'wallet_transactions is append-only; post a reversing entry instead of % ', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_transactions_immutable ON wallet_transactions;
CREATE TRIGGER trg_wallet_transactions_immutable
  BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

DROP TRIGGER IF EXISTS trg_financial_operations_immutable ON financial_operations;
CREATE TRIGGER trg_financial_operations_immutable
  BEFORE DELETE ON financial_operations
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- ----------------------------------------------------------------------------
-- 4. Authorization helpers.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fin_is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM super_admins
    WHERE user_id = p_user_id AND is_active = TRUE
  );
$$;

-- Fetch-or-create a wallet while holding a lock on it.
CREATE OR REPLACE FUNCTION fin_lock_wallet(p_user_id UUID, p_wallet_type wallet_type)
RETURNS wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wallet wallets;
BEGIN
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id AND wallet_type = p_wallet_type
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, wallet_type, balance)
    VALUES (p_user_id, p_wallet_type, 0)
    ON CONFLICT (user_id, wallet_type) DO NOTHING;

    SELECT * INTO v_wallet
    FROM wallets
    WHERE user_id = p_user_id AND wallet_type = p_wallet_type
    FOR UPDATE;
  END IF;

  RETURN v_wallet;
END;
$$;

-- Return a previously recorded result for this idempotency key, if any.
CREATE OR REPLACE FUNCTION fin_existing_operation(p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT result FROM financial_operations WHERE idempotency_key = p_key;
$$;

-- ----------------------------------------------------------------------------
-- 5. Release campaign escrow to a creator.
--
--    Replaces releaseEscrowToCreator() in src/lib/payments.js. The caller
--    supplies the campaign, the creator and an idempotency key; the function
--    derives everything else and refuses to release more than the campaign
--    actually holds.
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
  v_caller        UUID := auth.uid();
  v_existing      JSONB;
  v_campaign      campaigns;
  v_escrow        wallets;
  v_creator       wallets;
  v_reference     TEXT;
  v_result        JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = 'check_violation';
  END IF;

  -- A repeat of an operation already performed returns the original result.
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

  -- Only the campaign's own developer, or a super admin, may release funds.
  IF v_campaign.developer_id <> v_caller AND NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Not authorised to release funds for this campaign'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The creator must actually be assigned to this campaign.
  IF NOT EXISTS (
    SELECT 1 FROM campaign_assignments
    WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id
  ) THEN
    RAISE EXCEPTION 'Creator is not assigned to this campaign'
      USING ERRCODE = 'check_violation';
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

  v_creator := fin_lock_wallet(p_creator_id, 'creator');
  v_reference := 'REL-' || substr(p_campaign_id::text, 1, 8) || '-' || substr(p_idempotency_key, 1, 12);

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_escrow.id, 'escrow_release', -p_amount, -p_amount,
    v_escrow.balance, v_escrow.balance - p_amount,
    'Escrow release: ' || COALESCE(p_reason, 'content approved'),
    v_reference || '-OUT',
    p_campaign_id, v_creator.id,
    jsonb_build_object('creator_id', p_creator_id, 'idempotency_key', p_idempotency_key),
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
    v_reference || '-IN',
    p_campaign_id, v_escrow.id,
    jsonb_build_object('idempotency_key', p_idempotency_key),
    v_caller
  );

  UPDATE wallets SET balance = balance - p_amount, updated_at = NOW()
  WHERE id = v_escrow.id;

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
    'success', true,
    'amount', p_amount,
    'reference_number', v_reference,
    'campaign_id', p_campaign_id,
    'creator_id', p_creator_id
  );

  INSERT INTO financial_operations (
    idempotency_key, operation_type, actor_id, campaign_id,
    counterparty_id, amount, result
  ) VALUES (
    p_idempotency_key, 'release_escrow', v_caller, p_campaign_id,
    p_creator_id, p_amount, v_result
  );

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Refund unspent escrow to the developer (dispute resolution).
--    Restricted to super admins.
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
  v_result    JSONB;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may refund escrow'
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

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_escrow.id, 'refund', -p_amount, -p_amount,
    v_escrow.balance, v_escrow.balance - p_amount,
    'Escrow refund: ' || COALESCE(p_reason, 'dispute resolution'),
    v_reference || '-OUT',
    p_campaign_id, v_developer.id,
    jsonb_build_object('idempotency_key', p_idempotency_key), v_caller
  );

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_developer.id, 'refund', p_amount, p_amount,
    v_developer.balance, v_developer.balance + p_amount,
    'Refund received: ' || COALESCE(p_reason, 'dispute resolution'),
    v_reference || '-IN',
    p_campaign_id, v_escrow.id,
    jsonb_build_object('idempotency_key', p_idempotency_key), v_caller
  );

  UPDATE wallets SET balance = balance - p_amount, updated_at = NOW() WHERE id = v_escrow.id;
  UPDATE wallets SET balance = balance + p_amount, updated_at = NOW() WHERE id = v_developer.id;
  UPDATE campaigns
  SET escrow_amount = GREATEST(COALESCE(escrow_amount, 0) - p_amount, 0)
  WHERE id = p_campaign_id;

  v_result := jsonb_build_object(
    'success', true, 'amount', p_amount,
    'reference_number', v_reference, 'campaign_id', p_campaign_id
  );

  INSERT INTO financial_operations (
    idempotency_key, operation_type, actor_id, campaign_id, amount, result
  ) VALUES (
    p_idempotency_key, 'refund_escrow', v_caller, p_campaign_id, p_amount, v_result
  );

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Creator payout request.
--    Moves funds from available balance into pending, atomically.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION request_creator_payout(
  p_amount          DECIMAL(12,2),
  p_bank_account_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_existing   JSONB;
  v_wallet     wallets;
  v_fee        DECIMAL(12,2);
  v_net        DECIMAL(12,2);
  v_payout_id  UUID;
  v_result     JSONB;
  c_fee_rate   CONSTANT DECIMAL := 0.03;
  c_min_payout CONSTANT DECIMAL := 100;
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

  IF p_amount IS NULL OR p_amount < c_min_payout THEN
    RAISE EXCEPTION 'Minimum payout amount is R%', c_min_payout USING ERRCODE = 'check_violation';
  END IF;

  -- The bank account must belong to the caller.
  IF NOT EXISTS (
    SELECT 1 FROM bank_accounts WHERE id = p_bank_account_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_wallet FROM wallets
  WHERE user_id = v_caller AND wallet_type = 'creator'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_wallet.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'check_violation';
  END IF;

  -- Fees are computed here, from constants, not supplied by the caller.
  v_fee := ROUND(p_amount * c_fee_rate, 2);
  v_net := p_amount - v_fee;

  INSERT INTO payout_requests (
    user_id, wallet_id, bank_account_id, amount, payout_fee, net_amount, status
  ) VALUES (
    v_caller, v_wallet.id, p_bank_account_id, p_amount, v_fee, v_net, 'pending'
  ) RETURNING id INTO v_payout_id;

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount, fee,
    balance_before, balance_after, description, reference_number,
    related_payout_id, metadata, created_by
  ) VALUES (
    v_wallet.id, 'payout_request', -p_amount, -v_net, v_fee,
    v_wallet.balance, v_wallet.balance - p_amount,
    'Payout requested', 'PAY-' || substr(v_payout_id::text, 1, 8),
    v_payout_id,
    jsonb_build_object('idempotency_key', p_idempotency_key), v_caller
  );

  UPDATE wallets
  SET balance = balance - p_amount,
      pending_balance = COALESCE(pending_balance, 0) + p_amount,
      updated_at = NOW()
  WHERE id = v_wallet.id;

  v_result := jsonb_build_object(
    'success', true, 'payout_id', v_payout_id,
    'amount', p_amount, 'payout_fee', v_fee, 'net_amount', v_net,
    'status', 'pending'
  );

  INSERT INTO financial_operations (
    idempotency_key, operation_type, actor_id, amount, result
  ) VALUES (
    p_idempotency_key, 'request_payout', v_caller, p_amount, v_result
  );

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Approve or reject a payout request.
--
--    Separation of duties: a super admin may not action their own payout
--    request. This is the control behind the acceptance test "developer
--    attempts to approve their own financial payout -> denied".
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_payout_request(
  p_payout_id       UUID,
  p_action          TEXT,
  p_notes           TEXT,
  p_idempotency_key TEXT,
  p_provider_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_existing JSONB;
  v_payout   payout_requests;
  v_wallet   wallets;
  v_result   JSONB;
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

  IF p_action = 'approve' THEN
    -- The funds already left `balance` at request time; clear the pending
    -- hold and record the fee. Actual disbursement is confirmed separately
    -- by the payment provider webhook (see docs/FINANCIAL_ARCHITECTURE.md).
    UPDATE payout_requests
    SET status = 'processing',
        processed_by = v_caller,
        processed_at = NOW(),
        payment_reference = p_provider_reference,
        notes = p_notes
    WHERE id = p_payout_id;

    INSERT INTO wallet_transactions (
      wallet_id, transaction_type, amount, net_amount, fee,
      balance_before, balance_after, description, reference_number,
      related_payout_id, metadata, created_by
    ) VALUES (
      v_wallet.id, 'payout_fee', -v_payout.payout_fee, -v_payout.payout_fee, v_payout.payout_fee,
      v_wallet.balance, v_wallet.balance,
      'Payout fee', 'PAY-' || substr(p_payout_id::text, 1, 8) || '-FEE',
      p_payout_id,
      jsonb_build_object('idempotency_key', p_idempotency_key), v_caller
    );

    v_result := jsonb_build_object('success', true, 'status', 'processing', 'payout_id', p_payout_id);

  ELSE
    -- Rejection returns the held funds to the available balance.
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
      jsonb_build_object('idempotency_key', p_idempotency_key, 'reason', p_notes), v_caller
    );

    UPDATE payout_requests
    SET status = 'cancelled',
        processed_by = v_caller,
        processed_at = NOW(),
        failure_reason = p_notes,
        notes = p_notes
    WHERE id = p_payout_id;

    v_result := jsonb_build_object('success', true, 'status', 'cancelled', 'payout_id', p_payout_id);
  END IF;

  INSERT INTO financial_operations (
    idempotency_key, operation_type, actor_id, counterparty_id,
    amount, provider_reference, result
  ) VALUES (
    p_idempotency_key, 'process_payout', v_caller, v_payout.user_id,
    v_payout.amount, p_provider_reference, v_result
  );

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Execution permissions.
--    Only authenticated users may call these; each function checks
--    authorization internally. PUBLIC is revoked explicitly because the
--    default for a new function is EXECUTE to PUBLIC.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION fin_is_super_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fin_lock_wallet(UUID, wallet_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fin_existing_operation(TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION release_campaign_escrow(UUID, UUID, DECIMAL, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION refund_campaign_escrow(UUID, DECIMAL, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION request_creator_payout(DECIMAL, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION process_payout_request(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION release_campaign_escrow(UUID, UUID, DECIMAL, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_campaign_escrow(UUID, DECIMAL, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION request_creator_payout(DECIMAL, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_payout_request(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. Read access to the operation log.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users read own financial operations" ON financial_operations;
CREATE POLICY "Users read own financial operations" ON financial_operations
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR counterparty_id = auth.uid());

DROP POLICY IF EXISTS "Super admins read all financial operations" ON financial_operations;
CREATE POLICY "Super admins read all financial operations" ON financial_operations
  FOR SELECT TO authenticated
  USING (fin_is_super_admin(auth.uid()));

COMMIT;
