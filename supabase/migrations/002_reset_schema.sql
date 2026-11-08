-- ============================================
-- PropertyCampaigns Database Schema
-- RESET MIGRATION - Run this to start fresh
-- ============================================

-- Drop existing triggers first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_creator_profiles_updated_at ON creator_profiles;
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
DROP TRIGGER IF EXISTS set_campaign_referral_code_trigger ON campaigns;

-- Drop existing functions
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS update_updated_at();
DROP FUNCTION IF EXISTS generate_referral_code();
DROP FUNCTION IF EXISTS set_campaign_referral_code();

-- Drop existing tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS content_submissions CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS campaign_assignments CASCADE;
DROP TABLE IF EXISTS campaign_applications CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS creator_profiles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop existing types
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS campaign_status CASCADE;
DROP TYPE IF EXISTS application_status CASCADE;
DROP TYPE IF EXISTS lead_status CASCADE;
DROP TYPE IF EXISTS content_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('creator', 'developer', 'admin');
CREATE TYPE campaign_status AS ENUM ('draft', 'open', 'invited', 'active', 'completed', 'archived');
CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'invited');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');
CREATE TYPE content_status AS ENUM ('pending_review', 'approved', 'revision_requested');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'cancelled');

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles 
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

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
  rate_card JSONB,
  location TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  avg_engagement_rate DECIMAL(5,2),
  reliability_score INTEGER DEFAULT 0,
  campaigns_completed INTEGER DEFAULT 0,
  total_leads_generated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage their own creator profile" ON creator_profiles 
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Creator profiles are viewable by authenticated users" ON creator_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- CAMPAIGNS TABLE
-- ============================================

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  property_name TEXT NOT NULL,
  property_location TEXT NOT NULL,
  property_type TEXT,
  budget DECIMAL(12,2) NOT NULL,
  start_date DATE,
  end_date DATE,
  status campaign_status DEFAULT 'draft',
  deliverables JSONB DEFAULT '[]',
  target_audience TEXT,
  referral_code TEXT UNIQUE,
  landing_page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage their own campaigns" ON campaigns 
  FOR ALL USING (developer_id = auth.uid());

CREATE POLICY "Open campaigns are viewable by all authenticated users" ON campaigns 
  FOR SELECT USING (status IN ('open', 'active') OR developer_id = auth.uid());

CREATE POLICY "Campaigns viewable by admins" ON campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- CAMPAIGN APPLICATIONS TABLE
-- ============================================

CREATE TABLE campaign_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  status application_status DEFAULT 'pending',
  pitch_message TEXT,
  proposed_approach TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(campaign_id, creator_id)
);

ALTER TABLE campaign_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage their own applications" ON campaign_applications 
  FOR ALL USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Developers can view applications for their campaigns" ON campaign_applications 
  FOR SELECT USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

CREATE POLICY "Developers can update application status" ON campaign_applications 
  FOR UPDATE USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

-- ============================================
-- CAMPAIGN ASSIGNMENTS TABLE
-- ============================================

CREATE TABLE campaign_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  agreed_deliverables JSONB,
  agreed_budget DECIMAL(12,2),
  unique_referral_url TEXT,
  UNIQUE(campaign_id)
);

ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their assignments" ON campaign_assignments 
  FOR SELECT USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Developers can manage assignments" ON campaign_assignments 
  FOR ALL USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

-- ============================================
-- CONTENT SUBMISSIONS TABLE
-- ============================================

CREATE TABLE content_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  content_url TEXT NOT NULL,
  platform TEXT,
  content_type TEXT,
  status content_status DEFAULT 'pending_review',
  feedback TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE content_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage their submissions" ON content_submissions
  FOR ALL USING (assignment_id IN (
    SELECT ca.id FROM campaign_assignments ca
    JOIN creator_profiles cp ON ca.creator_id = cp.id
    WHERE cp.user_id = auth.uid()
  ));

CREATE POLICY "Developers can view submissions for their campaigns" ON content_submissions
  FOR SELECT USING (assignment_id IN (
    SELECT ca.id FROM campaign_assignments ca
    JOIN campaigns c ON ca.campaign_id = c.id
    WHERE c.developer_id = auth.uid()
  ));

-- ============================================
-- LEADS TABLE
-- ============================================

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES creator_profiles(id),
  referral_code TEXT,
  lead_name TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  lead_phone TEXT,
  interest_level TEXT DEFAULT 'warm',
  notes TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status lead_status DEFAULT 'new'
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage leads for their campaigns" ON leads 
  FOR ALL USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

CREATE POLICY "Anyone can submit leads" ON leads 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage all leads" ON leads
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- PAYMENTS TABLE
-- ============================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  status payment_status DEFAULT 'pending',
  due_date DATE,
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their payments" ON payments 
  FOR SELECT USING (assignment_id IN (
    SELECT ca.id FROM campaign_assignments ca
    JOIN creator_profiles cp ON ca.creator_id = cp.id
    WHERE cp.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage all payments" ON payments
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notifications" ON notifications 
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'creator'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  -- If creator, also create creator_profiles entry
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'creator') = 'creator' THEN
    INSERT INTO creator_profiles (user_id) VALUES (NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_creator_profiles_updated_at 
  BEFORE UPDATE ON creator_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_campaigns_updated_at 
  BEFORE UPDATE ON campaigns 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to generate referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := 'REF-';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_campaign_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_campaign_referral_code_trigger
  BEFORE INSERT ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_campaign_referral_code();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_campaigns_developer ON campaigns(developer_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_applications_campaign ON campaign_applications(campaign_id);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- ============================================
-- DONE!
-- ============================================
