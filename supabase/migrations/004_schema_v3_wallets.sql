-- ============================================
-- PropertyCampaigns Database Schema v3
-- WALLET, ESCROW & AUDIT SYSTEM
-- ============================================

-- Drop existing objects first (in order)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_creator_profiles_updated_at ON creator_profiles;
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
DROP TRIGGER IF EXISTS set_campaign_referral_code_trigger ON campaigns;
DROP TRIGGER IF EXISTS set_creator_referral_code_trigger ON campaign_assignments;
DROP TRIGGER IF EXISTS track_lead_status_change_trigger ON leads;
DROP TRIGGER IF EXISTS update_creator_lead_stats_trigger ON leads;

DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS generate_referral_code() CASCADE;
DROP FUNCTION IF EXISTS set_campaign_referral_code() CASCADE;
DROP FUNCTION IF EXISTS set_creator_referral_code() CASCADE;
DROP FUNCTION IF EXISTS track_lead_status_change() CASCADE;
DROP FUNCTION IF EXISTS update_creator_lead_stats() CASCADE;

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS payout_requests CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS bank_accounts CASCADE;
DROP TABLE IF EXISTS lead_activities CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS content_submissions CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS campaign_assignments CASCADE;
DROP TABLE IF EXISTS campaign_applications CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS creator_profiles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS campaign_status CASCADE;
DROP TYPE IF EXISTS application_status CASCADE;
DROP TYPE IF EXISTS lead_status CASCADE;
DROP TYPE IF EXISTS pipeline_stage CASCADE;
DROP TYPE IF EXISTS content_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS wallet_type CASCADE;
DROP TYPE IF EXISTS transaction_type CASCADE;
DROP TYPE IF EXISTS payout_status CASCADE;

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('creator', 'developer', 'admin');
CREATE TYPE campaign_status AS ENUM ('draft', 'open', 'invited', 'active', 'completed', 'archived');
CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'invited');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');
CREATE TYPE pipeline_stage AS ENUM ('new', 'contacted', 'qualified', 'negotiating', 'converted', 'lost');
CREATE TYPE content_status AS ENUM ('pending_review', 'approved', 'revision_requested', 'live');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'paid', 'cancelled');
CREATE TYPE wallet_type AS ENUM ('creator', 'developer', 'platform', 'escrow');
CREATE TYPE transaction_type AS ENUM (
  'deposit',           -- Developer tops up wallet
  'platform_fee',      -- 25% commission to platform
  'escrow_lock',       -- Funds locked for campaign
  'escrow_release',    -- Funds released from escrow to creator
  'content_payment',   -- Payment for approved content
  'payout_request',    -- Creator withdraws to bank
  'payout_fee',        -- 3% payout fee
  'refund',            -- Refund to developer
  'adjustment'         -- Manual adjustment by admin
);
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role user_role NOT NULL DEFAULT 'creator',
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  company_name TEXT,
  bio TEXT,
  phone TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profiles viewable by authenticated" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- WALLETS TABLE
-- ============================================

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_type wallet_type NOT NULL,
  balance DECIMAL(12,2) DEFAULT 0.00,
  escrow_balance DECIMAL(12,2) DEFAULT 0.00,  -- For developers: funds locked in campaigns
  total_deposited DECIMAL(12,2) DEFAULT 0.00,
  total_withdrawn DECIMAL(12,2) DEFAULT 0.00,
  total_earned DECIMAL(12,2) DEFAULT 0.00,    -- For creators: lifetime earnings
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wallet_type)
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON wallets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all wallets" ON wallets FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- BANK ACCOUNTS TABLE (for creator payouts)
-- ============================================

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  branch_code TEXT,
  account_type TEXT DEFAULT 'savings', -- savings, cheque, transmission
  is_primary BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bank accounts" ON bank_accounts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Admins can view all bank accounts" ON bank_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- WALLET TRANSACTIONS TABLE (full audit trail)
-- ============================================

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  transaction_type transaction_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  fee DECIMAL(12,2) DEFAULT 0.00,
  net_amount DECIMAL(12,2) NOT NULL, -- amount after fees
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  
  -- Related entities
  related_campaign_id UUID,
  related_assignment_id UUID,
  related_content_id UUID,
  related_payout_id UUID,
  counterparty_wallet_id UUID REFERENCES wallets(id),
  
  -- Details
  description TEXT,
  reference_number TEXT UNIQUE,
  metadata JSONB DEFAULT '{}',
  
  -- Status
  status TEXT DEFAULT 'completed',
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON wallet_transactions FOR SELECT USING (
  wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can view all transactions" ON wallet_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- PAYOUT REQUESTS TABLE
-- ============================================

CREATE TABLE payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  
  -- Amounts
  amount DECIMAL(12,2) NOT NULL,
  payout_fee DECIMAL(12,2) NOT NULL, -- 3% fee
  net_amount DECIMAL(12,2) NOT NULL, -- Amount user receives
  
  -- Status tracking
  status payout_status DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Processing details
  processed_by UUID REFERENCES profiles(id),
  payment_reference TEXT,
  failure_reason TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payouts" ON payout_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create own payouts" ON payout_requests FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all payouts" ON payout_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- CREATOR PROFILES TABLE
-- ============================================

CREATE TABLE creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  instagram_handle TEXT,
  tiktok_handle TEXT,
  youtube_handle TEXT,
  follower_count INTEGER DEFAULT 0,
  niche TEXT[] DEFAULT '{}',
  portfolio_urls TEXT[] DEFAULT '{}',
  past_collaborations JSONB DEFAULT '[]',
  rate_card JSONB DEFAULT '{}',
  location TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  avg_engagement_rate DECIMAL(5,2),
  reliability_score INTEGER DEFAULT 100,
  campaigns_completed INTEGER DEFAULT 0,
  total_leads_generated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage own profile" ON creator_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Creator profiles viewable by authenticated" ON creator_profiles FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- CAMPAIGNS TABLE (with Escrow)
-- ============================================

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  property_name TEXT NOT NULL,
  property_location TEXT NOT NULL,
  property_type TEXT,
  
  -- Budget & Commission
  total_budget DECIMAL(12,2) NOT NULL,
  platform_fee DECIMAL(12,2) NOT NULL,       -- 25% taken immediately
  creator_budget DECIMAL(12,2) NOT NULL,     -- 75% for creators
  escrow_amount DECIMAL(12,2) DEFAULT 0.00,  -- Amount locked from developer wallet
  amount_paid_out DECIMAL(12,2) DEFAULT 0.00, -- Amount released to creators
  
  -- Timeline
  start_date DATE,
  end_date DATE,
  
  -- Status & Content
  status campaign_status DEFAULT 'draft',
  deliverables JSONB DEFAULT '[]',
  target_audience TEXT,
  content_guidelines TEXT,
  brand_assets_url TEXT,
  
  -- Tracking
  referral_code TEXT UNIQUE,
  landing_page_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage own campaigns" ON campaigns FOR ALL USING (developer_id = auth.uid());
CREATE POLICY "Open campaigns viewable by authenticated" ON campaigns FOR SELECT USING (status IN ('open', 'active') OR developer_id = auth.uid());
CREATE POLICY "Admins can manage all campaigns" ON campaigns FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- CAMPAIGN APPLICATIONS TABLE
-- ============================================

CREATE TABLE campaign_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  status application_status DEFAULT 'pending',
  pitch_message TEXT,
  proposed_rate DECIMAL(12,2),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(campaign_id, creator_id)
);

ALTER TABLE campaign_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage own applications" ON campaign_applications FOR ALL USING (
  creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Developers can view campaign applications" ON campaign_applications FOR SELECT USING (
  campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
);
CREATE POLICY "Developers can update application status" ON campaign_applications FOR UPDATE USING (
  campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
);

-- ============================================
-- CAMPAIGN ASSIGNMENTS TABLE
-- ============================================

CREATE TABLE campaign_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  
  -- Assignment Details
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  agreed_deliverables JSONB,
  agreed_budget DECIMAL(12,2),
  
  -- Payment tracking
  amount_earned DECIMAL(12,2) DEFAULT 0.00,
  amount_paid DECIMAL(12,2) DEFAULT 0.00,
  
  -- Unique Referral URL
  creator_referral_code TEXT UNIQUE NOT NULL,
  
  -- Performance
  leads_generated INTEGER DEFAULT 0,
  content_submitted INTEGER DEFAULT 0,
  content_approved INTEGER DEFAULT 0,
  
  -- Status
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  
  UNIQUE(campaign_id, creator_id)
);

ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own assignments" ON campaign_assignments FOR SELECT USING (
  creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Developers can manage assignments" ON campaign_assignments FOR ALL USING (
  campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
);

-- ============================================
-- CONTENT SUBMISSIONS TABLE (triggers payment)
-- ============================================

CREATE TABLE content_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  
  -- Content Details
  content_url TEXT NOT NULL,          -- Link to live content
  platform TEXT,                      -- instagram, tiktok, youtube, etc
  content_type TEXT,                  -- reel, post, story, video
  thumbnail_url TEXT,
  caption TEXT,
  
  -- Status
  status content_status DEFAULT 'pending_review',
  
  -- Review
  feedback TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  
  -- Payment (when approved and live)
  payment_amount DECIMAL(12,2),
  payment_released BOOLEAN DEFAULT FALSE,
  payment_released_at TIMESTAMPTZ,
  payment_transaction_id UUID,
  
  -- Live verification
  is_live BOOLEAN DEFAULT FALSE,
  live_verified_at TIMESTAMPTZ,
  
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage own submissions" ON content_submissions FOR ALL USING (
  assignment_id IN (
    SELECT ca.id FROM campaign_assignments ca
    JOIN creator_profiles cp ON ca.creator_id = cp.id
    WHERE cp.user_id = auth.uid()
  )
);
CREATE POLICY "Developers can manage submissions" ON content_submissions FOR ALL USING (
  assignment_id IN (
    SELECT ca.id FROM campaign_assignments ca
    JOIN campaigns c ON ca.campaign_id = c.id
    WHERE c.developer_id = auth.uid()
  )
);

-- ============================================
-- LEADS TABLE
-- ============================================

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES creator_profiles(id),
  assignment_id UUID REFERENCES campaign_assignments(id),
  
  referral_code TEXT,
  source_url TEXT,
  
  lead_name TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  lead_phone TEXT,
  
  interest_level TEXT DEFAULT 'warm',
  pipeline_stage pipeline_stage DEFAULT 'new',
  status lead_status DEFAULT 'new',
  
  last_contacted_at TIMESTAMPTZ,
  next_follow_up DATE,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage campaign leads" ON leads FOR ALL USING (
  campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
);
CREATE POLICY "Anyone can submit leads" ON leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage all leads" ON leads FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- LEAD ACTIVITIES TABLE
-- ============================================

CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  activity_type TEXT NOT NULL,
  previous_stage pipeline_stage,
  new_stage pipeline_stage,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage lead activities" ON lead_activities FOR ALL USING (
  lead_id IN (
    SELECT l.id FROM leads l
    JOIN campaigns c ON l.campaign_id = c.id
    WHERE c.developer_id = auth.uid()
  )
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notifications" ON notifications FOR ALL USING (user_id = auth.uid());

-- ============================================
-- AUDIT LOGS TABLE (comprehensive tracking)
-- ============================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who
  user_id UUID REFERENCES profiles(id),
  user_role user_role,
  user_email TEXT,
  
  -- What
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- wallet, campaign, payout, content, etc
  entity_id UUID,
  
  -- Details
  old_values JSONB,
  new_values JSONB,
  metadata JSONB DEFAULT '{}',
  
  -- Where
  ip_address TEXT,
  user_agent TEXT,
  
  -- When
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Generate reference numbers
CREATE OR REPLACE FUNCTION generate_reference(prefix TEXT DEFAULT 'TXN')
RETURNS TEXT AS $$
BEGIN
  RETURN prefix || '-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
         UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8));
END;
$$ LANGUAGE plpgsql;

-- Generate referral code
CREATE OR REPLACE FUNCTION generate_referral_code(prefix TEXT DEFAULT 'REF')
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := prefix || '-';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create user profile and wallet on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_wallet_type wallet_type;
BEGIN
  -- Create profile
  INSERT INTO profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'creator'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  -- Determine wallet type based on role
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'creator') = 'creator' THEN
    user_wallet_type := 'creator';
    -- Also create creator profile
    INSERT INTO creator_profiles (user_id) VALUES (NEW.id);
  ELSIF COALESCE(NEW.raw_user_meta_data->>'role', 'creator') = 'developer' THEN
    user_wallet_type := 'developer';
  ELSE
    user_wallet_type := 'creator';
  END IF;
  
  -- Create wallet
  INSERT INTO wallets (user_id, wallet_type) VALUES (NEW.id, user_wallet_type);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_creator_profiles_updated_at BEFORE UPDATE ON creator_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Set campaign referral code
CREATE OR REPLACE FUNCTION set_campaign_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code('CMP');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_campaign_referral_code_trigger
  BEFORE INSERT ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_campaign_referral_code();

-- Set creator referral code on assignment
CREATE OR REPLACE FUNCTION set_creator_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.creator_referral_code IS NULL THEN
    NEW.creator_referral_code := generate_referral_code('CRE');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_creator_referral_code_trigger
  BEFORE INSERT ON campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION set_creator_referral_code();

-- Update lead stats
CREATE OR REPLACE FUNCTION update_creator_lead_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.creator_id IS NOT NULL THEN
    UPDATE creator_profiles SET total_leads_generated = total_leads_generated + 1 WHERE id = NEW.creator_id;
    IF NEW.assignment_id IS NOT NULL THEN
      UPDATE campaign_assignments SET leads_generated = leads_generated + 1 WHERE id = NEW.assignment_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_creator_lead_stats_trigger
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION update_creator_lead_stats();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_wallets_type ON wallets(wallet_type);
CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(transaction_type);
CREATE INDEX idx_wallet_transactions_created ON wallet_transactions(created_at);
CREATE INDEX idx_payout_requests_user ON payout_requests(user_id);
CREATE INDEX idx_payout_requests_status ON payout_requests(status);
CREATE INDEX idx_bank_accounts_user ON bank_accounts(user_id);
CREATE INDEX idx_campaigns_developer ON campaigns(developer_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_referral ON campaigns(referral_code);
CREATE INDEX idx_applications_campaign ON campaign_applications(campaign_id);
CREATE INDEX idx_assignments_campaign ON campaign_assignments(campaign_id);
CREATE INDEX idx_assignments_creator ON campaign_assignments(creator_id);
CREATE INDEX idx_content_submissions_assignment ON content_submissions(assignment_id);
CREATE INDEX idx_content_submissions_status ON content_submissions(status);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_creator ON leads(creator_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================
-- CREATE PLATFORM WALLET (for collecting fees)
-- ============================================

-- This should be run once after schema is created
-- INSERT INTO wallets (id, wallet_type) VALUES ('00000000-0000-0000-0000-000000000001', 'platform');

-- ============================================
-- DONE!
-- ============================================
