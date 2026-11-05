-- Baseline mirroring the relevant parts of supabase/migrations/004_schema_v3_wallets.sql
CREATE TYPE user_role AS ENUM ('creator','developer','admin');
CREATE TYPE wallet_type AS ENUM ('creator','developer','platform','escrow');
CREATE TYPE payout_status AS ENUM ('pending','processing','completed','failed','cancelled');
CREATE TYPE campaign_status AS ENUM ('draft','open','invited','active','completed','archived');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role user_role NOT NULL DEFAULT 'creator',
  full_name TEXT NOT NULL DEFAULT 'User',
  is_verified BOOLEAN DEFAULT FALSE,
  is_super_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_type wallet_type NOT NULL,
  balance DECIMAL(12,2) DEFAULT 0.00,
  escrow_balance DECIMAL(12,2) DEFAULT 0.00,
  total_deposited DECIMAL(12,2) DEFAULT 0.00,
  total_withdrawn DECIMAL(12,2) DEFAULT 0.00,
  total_earned DECIMAL(12,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wallet_type)
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT,
  status campaign_status DEFAULT 'draft',
  total_budget DECIMAL(12,2),
  platform_fee DECIMAL(12,2),
  creator_budget DECIMAL(12,2),
  escrow_amount DECIMAL(12,2) DEFAULT 0.00,
  amount_paid_out DECIMAL(12,2) DEFAULT 0.00,
  escrow_wallet_id UUID,
  funded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaign_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active'
);

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name TEXT,
  account_number TEXT
);

CREATE TYPE transaction_type AS ENUM (
  'deposit','platform_fee','escrow_lock','escrow_release','content_payment',
  'payout_request','payout_fee','refund','adjustment'
);

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  transaction_type transaction_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  fee DECIMAL(12,2) DEFAULT 0.00,
  net_amount DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  related_campaign_id UUID,
  related_assignment_id UUID,
  related_content_id UUID,
  related_payout_id UUID,
  counterparty_wallet_id UUID REFERENCES wallets(id),
  description TEXT,
  reference_number TEXT UNIQUE,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'completed',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  amount DECIMAL(12,2) NOT NULL,
  payout_fee DECIMAL(12,2) NOT NULL,
  net_amount DECIMAL(12,2) NOT NULL,
  status payout_status DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES profiles(id),
  payment_reference TEXT,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- The pre-remediation RLS posture, reproduced so the access-control
-- migration can be shown to actually change behaviour.
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_select" ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wallets_update" ON wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wallets_insert" ON wallets FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_all" ON profiles FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Remaining tables, mirroring the shape the application and migrations expect.
-- Trimmed to the columns that policies and triggers reference.
-- ---------------------------------------------------------------------------

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaign_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  content_type TEXT,
  payment_amount DECIMAL(12,2),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE pipeline_stage AS ENUM
  ('new','contacted','qualified','site_visit','negotiation','converted','unqualified','lost','duplicate','unreachable');

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id),
  referral_code TEXT,
  tracking_code TEXT,
  lead_name TEXT,
  lead_email TEXT,
  lead_phone TEXT,
  interest_level TEXT,
  notes TEXT,
  source_url TEXT,
  attributed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'new',
  pipeline_stage pipeline_stage DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE creator_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tracking_code TEXT UNIQUE NOT NULL,
  full_url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0
);

CREATE TABLE campaign_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL
);

CREATE TABLE escrow_release_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  payment_amount DECIMAL(12,2),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE escrow_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  creator_id UUID NOT NULL REFERENCES profiles(id),
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  customer_id UUID REFERENCES profiles(id),
  subtotal DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  card_brand TEXT
);

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  gateway TEXT NOT NULL,
  gateway_transaction_id TEXT UNIQUE,
  type TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'pending'
);

CREATE TABLE creator_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id),
  recipient_id UUID REFERENCES profiles(id),
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  raised_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'open'
);

CREATE TABLE dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  body TEXT
);

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  creator_id UUID REFERENCES profiles(id),
  developer_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'draft'
);

CREATE TABLE creator_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5)
);

CREATE TABLE developer_creator_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE
);

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  subject TEXT,
  body TEXT
);

CREATE TABLE terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action TEXT,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  action_type TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  UNIQUE(identifier, action_type)
);

-- Pre-remediation posture: RLS on, blanket grants, as quick_setup.sql leaves it.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
