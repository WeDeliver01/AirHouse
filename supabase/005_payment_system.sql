-- ============================================
-- PAYMENT SYSTEM ENHANCEMENTS
-- Run this after the main schema
-- ============================================

-- Add escrow_wallet_id to campaigns if not exists
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS escrow_wallet_id UUID REFERENCES wallets(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS funding_status TEXT DEFAULT 'unfunded';

-- ============================================
-- INVOICES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- 'campaign_funding', 'creator_payment', 'payout', 'platform_fee'
  
  -- Customer info
  customer_id UUID REFERENCES profiles(id),
  customer_name TEXT,
  customer_email TEXT,
  
  -- Amounts
  subtotal DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'cancelled', 'refunded'
  
  -- Dates
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  pdf_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices" ON invoices 
FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Admins can manage all invoices" ON invoices 
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- PAYMENT METHODS TABLE (for future card storage)
-- ============================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Card details (tokenized - never store raw card numbers)
  gateway TEXT NOT NULL, -- 'yoco', 'bobpay', 'stripe'
  gateway_customer_id TEXT, -- Customer ID in payment gateway
  gateway_payment_method_id TEXT, -- Payment method ID in gateway
  
  -- Display info only
  card_brand TEXT, -- 'visa', 'mastercard', etc.
  card_last4 TEXT, -- Last 4 digits
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  
  -- Status
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own payment methods" ON payment_methods 
FOR ALL USING (user_id = auth.uid());

-- ============================================
-- PAYMENT TRANSACTIONS TABLE (gateway transactions)
-- ============================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  
  -- Transaction details
  gateway TEXT NOT NULL, -- 'yoco', 'bobpay', 'test'
  gateway_transaction_id TEXT UNIQUE,
  type TEXT NOT NULL, -- 'charge', 'refund', 'payout'
  
  -- Amounts
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  fee DECIMAL(12,2) DEFAULT 0, -- Gateway fee
  net_amount DECIMAL(12,2), -- Amount after fees
  
  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'succeeded', 'failed', 'refunded'
  failure_code TEXT,
  failure_message TEXT,
  
  -- Related records
  campaign_id UUID REFERENCES campaigns(id),
  payout_request_id UUID REFERENCES payout_requests(id),
  invoice_id UUID REFERENCES invoices(id),
  wallet_transaction_id UUID REFERENCES wallet_transactions(id),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  gateway_response JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment transactions" ON payment_transactions 
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all payment transactions" ON payment_transactions 
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- ESCROW RELEASE RULES TABLE
-- Defines when money automatically releases from escrow
-- ============================================

CREATE TABLE IF NOT EXISTS escrow_release_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Rule definition
  trigger_type TEXT NOT NULL, -- 'content_approved', 'milestone', 'campaign_complete', 'manual'
  trigger_condition JSONB DEFAULT '{}', -- Additional conditions
  
  -- Payment calculation
  payment_type TEXT NOT NULL, -- 'fixed', 'percentage', 'per_unit'
  payment_amount DECIMAL(12,2), -- Fixed amount or percentage
  max_amount DECIMAL(12,2), -- Cap for per-unit payments
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE escrow_release_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage own campaign rules" ON escrow_release_rules 
FOR ALL USING (
  campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
);

CREATE POLICY "Admins can manage all rules" ON escrow_release_rules 
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- ESCROW RELEASES TABLE (audit trail)
-- ============================================

CREATE TABLE IF NOT EXISTS escrow_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  creator_id UUID NOT NULL REFERENCES profiles(id),
  
  -- Release details
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  trigger_type TEXT, -- What triggered this release
  
  -- Related records
  rule_id UUID REFERENCES escrow_release_rules(id),
  content_submission_id UUID REFERENCES content_submissions(id),
  lead_id UUID REFERENCES leads(id),
  
  -- Wallet transactions
  escrow_transaction_id UUID REFERENCES wallet_transactions(id),
  creator_transaction_id UUID REFERENCES wallet_transactions(id),
  
  -- Approval
  released_by UUID REFERENCES profiles(id),
  released_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE escrow_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own releases" ON escrow_releases 
FOR SELECT USING (creator_id = auth.uid());

CREATE POLICY "Developers can view campaign releases" ON escrow_releases 
FOR SELECT USING (
  campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
);

CREATE POLICY "Admins can manage all releases" ON escrow_releases 
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- ADD payment_amount TO CONTENT_SUBMISSIONS
-- ============================================

ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(12,2);
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_escrow_releases_campaign ON escrow_releases(campaign_id);
CREATE INDEX IF NOT EXISTS idx_escrow_releases_creator ON escrow_releases(creator_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to calculate campaign escrow balance
CREATE OR REPLACE FUNCTION get_campaign_escrow_balance(p_campaign_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_balance DECIMAL;
BEGIN
  SELECT COALESCE(w.balance, 0) INTO v_balance
  FROM campaigns c
  JOIN wallets w ON w.id = c.escrow_wallet_id
  WHERE c.id = p_campaign_id;
  
  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get total paid to creator for a campaign
CREATE OR REPLACE FUNCTION get_creator_campaign_earnings(p_campaign_id UUID, p_creator_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM escrow_releases
  WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id;
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Auto-release on content approval
-- ============================================

CREATE OR REPLACE FUNCTION trigger_content_approval_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- When content is approved, check for release rules
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Check if there's an active rule for content approval
    -- The actual payment logic is handled in application code
    -- This just marks it for payment processing
    UPDATE content_submissions 
    SET payment_status = 'pending_release'
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_content_approved ON content_submissions;
CREATE TRIGGER on_content_approved
  AFTER UPDATE ON content_submissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_content_approval_payment();
