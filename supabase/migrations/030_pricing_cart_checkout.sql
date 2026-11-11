-- ============================================================================
-- 030_pricing_cart_checkout.sql
--
-- Rate-card pricing, a shopping cart of deliverables, and direct-pay checkout.
--
-- WHAT THIS REPLACES
-- -------------------
-- Campaigns used to be funded for an arbitrary amount, with 25% kept as a
-- platform commission and the remaining 75% held in a per-developer escrow
-- wallet, released to the creator in tranches as content was approved
-- (see release_campaign_escrow / refund_campaign_escrow, migrations 016/023).
--
-- The product has moved to fixed, creator-set pricing: a creator publishes a
-- rate card (price per platform + deliverable type), a developer builds a
-- cart of deliverables from one creator's rate card and checks out. There is
-- no escrow hold and no 75/25 split. The platform instead takes a flat 2.7%
-- transaction fee at the moment payment is confirmed, and the remaining
-- 97.3% is credited to the creator's wallet immediately -- not released
-- later against content approval.
--
-- release_campaign_escrow() and refund_campaign_escrow() are dropped.
-- confirm_manual_payment() is rewritten to pay the creator directly instead
-- of crediting a campaign escrow wallet. A new refund_campaign_payment()
-- replaces refund_campaign_escrow() for dispute resolution: because the
-- creator has already been paid in full at checkout, a refund now claws the
-- amount back from the creator's wallet rather than from an escrow balance.
--
-- The legacy `campaigns.escrow_amount` / `escrow_wallet_id` columns and the
-- `escrow` wallet_type are left in place (dropping them would ripple through
-- every historical campaign and report) but nothing written by this
-- migration uses them. They stay at zero for every campaign created through
-- checkout_campaign_cart().
-- ============================================================================

BEGIN;

-- Defensive: defined back in 001_schema.sql, but restated here (CREATE OR
-- REPLACE, harmless where it already exists) so this migration does not
-- depend on load order in a minimal test harness.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1. Rate cards.
--
--    A creator prices their own deliverables: one row per
--    (platform, deliverable type) combination they offer.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creator_rate_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL CHECK (platform IN
                     ('instagram','tiktok','youtube','facebook','x','other')),
  deliverable_type TEXT NOT NULL CHECK (deliverable_type IN
                     ('reel','story','feed_post','carousel','video','short','live_stream','bundle','other')),
  label            TEXT NOT NULL,
  description      TEXT,
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
  currency         TEXT NOT NULL DEFAULT 'ZAR',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_id, platform, deliverable_type)
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_creator ON creator_rate_cards (creator_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_active   ON creator_rate_cards (is_active) WHERE is_active;

DROP TRIGGER IF EXISTS update_creator_rate_cards_updated_at ON creator_rate_cards;
CREATE TRIGGER update_creator_rate_cards_updated_at
  BEFORE UPDATE ON creator_rate_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE creator_rate_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_cards_owner_manage" ON creator_rate_cards;
CREATE POLICY "rate_cards_owner_manage" ON creator_rate_cards
  FOR ALL TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Any authenticated user may browse a creator's published prices to build a
-- cart; only active rows are visible to anyone other than the creator.
DROP POLICY IF EXISTS "rate_cards_read_active" ON creator_rate_cards;
CREATE POLICY "rate_cards_read_active" ON creator_rate_cards
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON creator_rate_cards TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. The cart: one draft per (developer, creator) pair, with line items
--    snapshotting the rate-card price at the time they were added so a later
--    price change on the rate card does not alter a cart already in
--    progress.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_carts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','checked_out','abandoned')),
  campaign_id    UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  currency       TEXT NOT NULL DEFAULT 'ZAR',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ
);

-- Only one open cart per developer/creator pair at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_one_draft
  ON campaign_carts (developer_id, creator_id) WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_carts_developer ON campaign_carts (developer_id);
CREATE INDEX IF NOT EXISTS idx_carts_creator   ON campaign_carts (creator_id);

DROP TRIGGER IF EXISTS update_campaign_carts_updated_at ON campaign_carts;
CREATE TRIGGER update_campaign_carts_updated_at
  BEFORE UPDATE ON campaign_carts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carts_developer_manage" ON campaign_carts;
CREATE POLICY "carts_developer_manage" ON campaign_carts
  FOR ALL TO authenticated
  USING (developer_id = auth.uid())
  WITH CHECK (developer_id = auth.uid());

DROP POLICY IF EXISTS "carts_creator_read" ON campaign_carts;
CREATE POLICY "carts_creator_read" ON campaign_carts
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_carts TO authenticated;

CREATE TABLE IF NOT EXISTS campaign_cart_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID NOT NULL REFERENCES campaign_carts(id) ON DELETE CASCADE,
  rate_card_id     UUID REFERENCES creator_rate_cards(id) ON DELETE SET NULL,
  platform         TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  label            TEXT NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON campaign_cart_items (cart_id);

ALTER TABLE campaign_cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cart_items_via_cart" ON campaign_cart_items;
CREATE POLICY "cart_items_via_cart" ON campaign_cart_items
  FOR ALL TO authenticated
  USING (cart_id IN (SELECT id FROM campaign_carts WHERE developer_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM campaign_carts WHERE developer_id = auth.uid() AND status = 'draft'));

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_cart_items TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Checkout.
--
--    Turns a draft cart into a campaign booked with exactly one creator, at
--    the status that campaign_assignments requires ('invited'), and raises
--    the funding request for it in the same call. No money moves here --
--    that still only happens once an operator confirms the bank transfer via
--    confirm_manual_payment(), same as every other campaign.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION checkout_campaign_cart(
  p_cart_id            UUID,
  p_title              TEXT,
  p_property_name      TEXT,
  p_property_location  TEXT,
  p_idempotency_key    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_existing     JSONB;
  v_cart         campaign_carts;
  v_items        JSONB;
  v_subtotal     BIGINT;
  v_fee_rate     NUMERIC;
  v_fee_cents    BIGINT;
  v_creator_cents BIGINT;
  v_campaign_id  UUID;
  v_intent       JSONB;
  v_result       JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'A campaign title is required' USING ERRCODE = 'check_violation';
  END IF;

  v_existing := fin_existing_operation(p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_cart FROM campaign_carts WHERE id = p_cart_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cart not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cart.developer_id <> v_caller THEN
    RAISE EXCEPTION 'Only the cart owner may check it out' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_cart.status <> 'draft' THEN
    RAISE EXCEPTION 'This cart has already been checked out' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    COALESCE(SUM(quantity * unit_price_cents), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'platform', platform, 'deliverable_type', deliverable_type,
      'label', label, 'quantity', quantity, 'unit_price_cents', unit_price_cents
    )), '[]'::jsonb)
  INTO v_subtotal, v_items
  FROM campaign_cart_items WHERE cart_id = p_cart_id;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Cart is empty' USING ERRCODE = 'check_violation';
  END IF;

  v_fee_rate      := (get_platform_setting('platform_fee_rate', '0.027'::jsonb))::text::numeric;
  v_fee_cents     := ROUND(v_subtotal * v_fee_rate);
  v_creator_cents := v_subtotal - v_fee_cents;

  INSERT INTO campaigns (
    developer_id, title, property_name, property_location,
    total_budget, platform_fee, creator_budget, status, deliverables
  ) VALUES (
    v_caller, p_title, p_property_name, p_property_location,
    v_subtotal / 100.0, v_fee_cents / 100.0, v_creator_cents / 100.0, 'invited', v_items
  ) RETURNING id INTO v_campaign_id;

  INSERT INTO campaign_assignments (campaign_id, creator_id, agreed_deliverables, agreed_budget, creator_referral_code)
  VALUES (v_campaign_id, v_cart.creator_id, v_items, v_subtotal / 100.0,
          'CART-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10)));

  UPDATE campaign_carts
  SET status = 'checked_out', campaign_id = v_campaign_id, checked_out_at = NOW()
  WHERE id = p_cart_id;

  -- Raise the funding request in the same call; the developer still pays by
  -- the platform's normal rail (bank transfer today, card once a gateway is
  -- live) and nothing is funded until that is confirmed.
  v_intent := create_payment_intent(v_campaign_id, v_subtotal, p_idempotency_key || '-intent');

  v_result := jsonb_build_object(
    'success', true,
    'cart_id', p_cart_id,
    'campaign_id', v_campaign_id,
    'subtotal_cents', v_subtotal,
    'platform_fee_cents', v_fee_cents,
    'creator_amount_cents', v_creator_cents,
    'payment_intent', v_intent
  );

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    campaign_id, counterparty_id, amount, result)
  VALUES (p_idempotency_key, 'cart_checkout', v_caller, v_campaign_id,
          v_cart.creator_id, v_subtotal / 100.0, v_result);

  PERFORM record_audit_event('cart_checked_out', 'campaigns', v_campaign_id, v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION checkout_campaign_cart(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION checkout_campaign_cart(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Drop the escrow release/refund functions. Nothing creates an escrow
--    balance any more, so there is nothing left for them to move.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS release_campaign_escrow(UUID, UUID, DECIMAL(12,2), TEXT, TEXT);
DROP FUNCTION IF EXISTS refund_campaign_escrow(UUID, DECIMAL(12,2), TEXT, TEXT);

-- ----------------------------------------------------------------------------
-- 5. Platform fee drops from 25% to a flat 2.7% transaction fee.
-- ----------------------------------------------------------------------------

UPDATE platform_settings
SET value = '0.027'::jsonb,
    description = 'Flat transaction fee retained by the platform at checkout. The remaining amount is credited to the creator immediately -- there is no escrow hold and no revenue share.'
WHERE key = 'platform_fee_rate';

-- ----------------------------------------------------------------------------
-- 6. Rewrite confirm_manual_payment(): pay the creator directly instead of
--    crediting a per-developer escrow wallet. Same signature, so every
--    caller (manualPayments.js) is unaffected.
-- ----------------------------------------------------------------------------

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
  v_caller     UUID := auth.uid();
  v_existing   JSONB;
  v_intent     payment_intents;
  v_creator_id UUID;
  v_assignees  INT;
  v_fee_rate   NUMERIC;
  v_fee_cents  BIGINT;
  v_net_cents  BIGINT;
  v_creator    wallets;
  v_txn        UUID;
  v_result     JSONB;
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
  IF v_intent.payer_id = v_caller THEN
    RAISE EXCEPTION 'You may not confirm your own payment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Direct payment needs a single, unambiguous payee. A campaign is only
  -- fundable through this path once exactly one creator is booked against
  -- it, which is what checkout_campaign_cart() always creates.
  SELECT count(*) INTO v_assignees FROM campaign_assignments WHERE campaign_id = v_intent.campaign_id;
  IF v_assignees <> 1 THEN
    RAISE EXCEPTION 'Campaign must have exactly one assigned creator to confirm direct payment (found %)', v_assignees
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT creator_id INTO v_creator_id FROM campaign_assignments WHERE campaign_id = v_intent.campaign_id;

  v_fee_rate  := (get_platform_setting('platform_fee_rate', '0.027'::jsonb))::text::numeric;
  v_fee_cents := ROUND(v_intent.amount_cents * v_fee_rate);
  v_net_cents := v_intent.amount_cents - v_fee_cents;

  -- Double entry: cash in, split between the platform's income and what is
  -- now owed straight to the creator (no intermediate campaign-funds leg).
  v_txn := post_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('account','bank',            'direction','debit',  'amount_cents', v_intent.amount_cents),
      jsonb_build_object('account','platform_fee',    'direction','credit', 'amount_cents', v_fee_cents),
      jsonb_build_object('account','creator_payable',  'direction','credit', 'amount_cents', v_net_cents)
    ),
    'campaign_paid', v_intent.campaign_id, v_creator_id, v_intent.reference,
    jsonb_build_object('payment_intent_id', p_payment_intent_id, 'method', v_intent.method)
  );

  v_creator := fin_lock_wallet(v_creator_id, 'creator');

  UPDATE wallets
  SET balance = balance + (v_net_cents / 100.0),
      total_earned = COALESCE(total_earned, 0) + (v_net_cents / 100.0),
      updated_at = NOW()
  WHERE id = v_creator.id;

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount, fee,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, metadata, created_by
  ) VALUES (
    v_creator.id, 'content_payment', v_net_cents / 100.0, v_net_cents / 100.0, v_fee_cents / 100.0,
    v_creator.balance, v_creator.balance + (v_net_cents / 100.0),
    'Campaign payment received', v_intent.reference,
    v_intent.campaign_id,
    jsonb_build_object('payment_intent_id', p_payment_intent_id, 'ledger_transaction_id', v_txn,
                        'platform_fee_rate', v_fee_rate),
    v_caller
  );

  UPDATE campaigns
  SET status          = 'active',
      amount_paid_out = COALESCE(amount_paid_out, 0) + (v_net_cents / 100.0),
      platform_fee    = (v_fee_cents / 100.0),
      funded_at       = COALESCE(funded_at, NOW())
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
    'creator_amount_cents', v_net_cents,
    'creator_id', v_creator_id
  );

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    campaign_id, counterparty_id, amount,
                                    provider_reference, result)
  VALUES (p_idempotency_key, 'confirm_manual_payment', v_caller, v_intent.campaign_id,
          v_creator_id, v_intent.amount_cents / 100.0, v_intent.reference, v_result);

  PERFORM record_audit_event('payment_confirmed', 'payment_intents', p_payment_intent_id, v_result);

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Refund a direct payment after the fact (dispute resolution).
--
--    Replaces refund_campaign_escrow(). Because the creator was paid in
--    full at checkout, a refund now claws the amount back out of the
--    creator's own wallet balance and credits the developer -- it is not
--    available if the creator has already withdrawn the money, which is a
--    real constraint of not holding funds in escrow and is surfaced as a
--    clear error rather than an overdraft.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refund_campaign_payment(
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
  v_creator   wallets;
  v_developer wallets;
  v_reference TEXT;
  v_cents     BIGINT;
  v_txn       UUID;
  v_result    JSONB;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may refund a campaign payment'
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

  IF NOT EXISTS (
    SELECT 1 FROM campaign_assignments
    WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id
  ) THEN
    RAISE EXCEPTION 'Creator is not assigned to this campaign' USING ERRCODE = 'check_violation';
  END IF;

  v_creator := fin_lock_wallet(p_creator_id, 'creator');
  IF v_creator.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient creator balance to refund (% available); the creator may have already withdrawn these funds',
      v_creator.balance USING ERRCODE = 'check_violation';
  END IF;

  v_developer := fin_lock_wallet(v_campaign.developer_id, 'developer');
  v_reference := 'REF-' || substr(p_campaign_id::text, 1, 8) || '-' || substr(p_idempotency_key, 1, 12);
  v_cents     := ROUND(p_amount * 100);

  v_txn := post_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('account','creator_payable','direction','debit',  'amount_cents', v_cents),
      jsonb_build_object('account','bank',            'direction','credit', 'amount_cents', v_cents)
    ),
    'campaign_payment_refunded', p_campaign_id, p_creator_id, v_reference,
    jsonb_build_object('reason', p_reason)
  );

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_creator.id, 'refund', -p_amount, -p_amount,
    v_creator.balance, v_creator.balance - p_amount,
    'Refund clawed back: ' || COALESCE(p_reason, 'dispute resolution'),
    v_reference || '-OUT', p_campaign_id, v_developer.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'ledger_transaction_id', v_txn), v_caller
  );

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, net_amount,
    balance_before, balance_after, description, reference_number,
    related_campaign_id, counterparty_wallet_id, metadata, created_by
  ) VALUES (
    v_developer.id, 'refund', p_amount, p_amount,
    v_developer.balance, v_developer.balance + p_amount,
    'Refund received: ' || COALESCE(p_reason, 'dispute resolution'),
    v_reference || '-IN', p_campaign_id, v_creator.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'ledger_transaction_id', v_txn), v_caller
  );

  UPDATE wallets
  SET balance = balance - p_amount,
      total_earned = GREATEST(COALESCE(total_earned, 0) - p_amount, 0),
      updated_at = NOW()
  WHERE id = v_creator.id;
  UPDATE wallets SET balance = balance + p_amount, updated_at = NOW() WHERE id = v_developer.id;

  UPDATE campaigns
  SET amount_paid_out = GREATEST(COALESCE(amount_paid_out, 0) - p_amount, 0)
  WHERE id = p_campaign_id;

  v_result := jsonb_build_object(
    'success', true, 'amount', p_amount,
    'reference_number', v_reference, 'campaign_id', p_campaign_id,
    'creator_id', p_creator_id, 'ledger_transaction_id', v_txn
  );

  INSERT INTO financial_operations (idempotency_key, operation_type, actor_id,
                                    campaign_id, counterparty_id, amount, result)
  VALUES (p_idempotency_key, 'refund_campaign_payment', v_caller, p_campaign_id, p_creator_id, p_amount, v_result);

  PERFORM record_audit_event('campaign_payment_refunded', 'campaigns', p_campaign_id, v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION refund_campaign_payment(UUID, UUID, DECIMAL(12,2), TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION refund_campaign_payment(UUID, UUID, DECIMAL(12,2), TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Fix a pre-existing type mismatch in reconcile_wallets().
--
--    ledger_account_balances.balance_cents is the result of SUM(bigint),
--    which Postgres types as NUMERIC, not BIGINT -- so reconcile_wallets()
--    (declared RETURNS TABLE(..., ledger_cents BIGINT, ...)) has always
--    raised "structure of query does not match function result type" the
--    moment it actually had to return a row. Nothing before this migration
--    exercised that path successfully. Direct-pay checkout exercises it
--    routinely, so it is fixed here rather than left latent.
-- ----------------------------------------------------------------------------

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
    SELECT COALESCE(balance_cents, 0)::BIGINT AS cents
    FROM ledger_account_balances WHERE code = 'creator_payable'
  ),
  wallet_payable AS (
    SELECT COALESCE(ROUND(SUM(balance + COALESCE(pending_balance, 0)) * 100), 0)::BIGINT AS cents
    FROM wallets WHERE wallet_type = 'creator'
  ),
  ledger_funds AS (
    SELECT COALESCE(balance_cents, 0)::BIGINT AS cents
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

COMMIT;
