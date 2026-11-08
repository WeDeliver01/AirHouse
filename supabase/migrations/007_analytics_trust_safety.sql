-- ============================================
-- Analytics & Trust/Safety Schema
-- ============================================

-- ============================================
-- LEAD COST TRACKING
-- ============================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS cost_per_lead DECIMAL(12,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sale_amount DECIMAL(12,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sale_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS developer_feedback TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- ============================================
-- CREATOR REVIEWS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS creator_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
  review_text TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, creator_id, developer_id)
);

ALTER TABLE creator_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can create reviews for their campaigns" ON creator_reviews FOR INSERT
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));
CREATE POLICY "Reviews are viewable by all authenticated users" ON creator_reviews FOR SELECT
  USING (is_public = TRUE OR developer_id = auth.uid());
CREATE POLICY "Developers can update their own reviews" ON creator_reviews FOR UPDATE
  USING (developer_id = auth.uid());
CREATE POLICY "Admins can manage all reviews" ON creator_reviews FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ============================================
-- CREATOR VERIFICATION TABLE
-- ============================================

CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
CREATE TYPE verification_type AS ENUM ('id_verification', 'social_proof', 'portfolio', 'background_check');

CREATE TABLE IF NOT EXISTS creator_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  verification_type verification_type NOT NULL,
  status verification_status DEFAULT 'pending',
  document_url TEXT,
  social_platform TEXT,
  social_handle TEXT,
  follower_count INTEGER,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  reviewer_id UUID REFERENCES profiles(id),
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE creator_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their verifications" ON creator_verifications FOR SELECT
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Creators can submit verifications" ON creator_verifications FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage verifications" ON creator_verifications FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Update creator_profiles with verification fields
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS verification_level TEXT DEFAULT 'none';
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS verified_badges TEXT[] DEFAULT '{}';

-- ============================================
-- DISPUTES TABLE
-- ============================================

CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved', 'closed', 'escalated');
CREATE TYPE dispute_type AS ENUM ('payment', 'content_quality', 'delivery', 'communication', 'other');

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES campaign_assignments(id) ON DELETE SET NULL,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_party_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  dispute_type dispute_type NOT NULL,
  status dispute_status DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  resolution_notes TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  refund_amount DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their disputes" ON disputes FOR SELECT
  USING (reporter_id = auth.uid() OR reported_party_id = auth.uid());
CREATE POLICY "Users can create disputes" ON disputes FOR INSERT
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Users can update their own disputes" ON disputes FOR UPDATE
  USING (reporter_id = auth.uid() AND status IN ('open', 'under_review'));
CREATE POLICY "Admins can manage all disputes" ON disputes FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Dispute messages for communication
CREATE TABLE IF NOT EXISTS dispute_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachment_urls TEXT[] DEFAULT '{}',
  is_admin_message BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dispute_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispute participants can view messages" ON dispute_messages FOR SELECT
  USING (dispute_id IN (SELECT id FROM disputes WHERE reporter_id = auth.uid() OR reported_party_id = auth.uid()));
CREATE POLICY "Dispute participants can send messages" ON dispute_messages FOR INSERT
  WITH CHECK (dispute_id IN (SELECT id FROM disputes WHERE reporter_id = auth.uid() OR reported_party_id = auth.uid()));
CREATE POLICY "Admins can manage dispute messages" ON dispute_messages FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ============================================
-- CONTRACTS TABLE
-- ============================================

CREATE TYPE contract_status AS ENUM ('draft', 'pending_creator', 'pending_developer', 'signed', 'expired', 'cancelled');

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES campaign_assignments(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  terms TEXT NOT NULL,
  deliverables JSONB DEFAULT '[]',
  payment_terms JSONB DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  total_value DECIMAL(12,2) NOT NULL,
  status contract_status DEFAULT 'draft',
  creator_signed_at TIMESTAMPTZ,
  developer_signed_at TIMESTAMPTZ,
  creator_signature TEXT,
  developer_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view their contracts" ON contracts FOR SELECT
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Developers can manage contracts for their campaigns" ON contracts FOR ALL
  USING (developer_id = auth.uid());
CREATE POLICY "Creators can sign contracts" ON contracts FOR UPDATE
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage all contracts" ON contracts FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ============================================
-- ANALYTICS VIEWS
-- ============================================

-- Campaign ROI View
CREATE OR REPLACE VIEW campaign_roi_stats AS
SELECT 
  c.id AS campaign_id,
  c.title,
  c.developer_id,
  c.total_budget,
  c.status,
  COUNT(DISTINCT l.id) AS total_leads,
  COUNT(DISTINCT CASE WHEN l.pipeline_stage = 'converted' THEN l.id END) AS converted_leads,
  SUM(COALESCE(l.sale_amount, 0)) AS total_revenue,
  CASE 
    WHEN c.total_budget > 0 THEN 
      ((SUM(COALESCE(l.sale_amount, 0)) - c.total_budget) / c.total_budget) * 100
    ELSE 0 
  END AS roi_percentage,
  CASE 
    WHEN COUNT(l.id) > 0 THEN c.total_budget / COUNT(l.id)
    ELSE 0 
  END AS cost_per_lead,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN l.pipeline_stage = 'converted' THEN l.id END) > 0 
    THEN c.total_budget / COUNT(DISTINCT CASE WHEN l.pipeline_stage = 'converted' THEN l.id END)
    ELSE 0 
  END AS cost_per_conversion
FROM campaigns c
LEFT JOIN leads l ON l.campaign_id = c.id
GROUP BY c.id, c.title, c.developer_id, c.total_budget, c.status;

-- Creator Performance View
CREATE OR REPLACE VIEW creator_performance_stats AS
SELECT 
  cp.id AS creator_id,
  cp.user_id,
  p.full_name,
  p.avatar_url,
  cp.follower_count,
  cp.avg_engagement_rate,
  cp.campaigns_completed,
  cp.total_leads_generated,
  cp.reliability_score,
  cp.verification_level,
  cp.verified_badges,
  COALESCE(AVG(cr.rating), 0) AS avg_rating,
  COUNT(DISTINCT cr.id) AS total_reviews,
  COALESCE(AVG(cr.communication_rating), 0) AS avg_communication,
  COALESCE(AVG(cr.quality_rating), 0) AS avg_quality,
  COALESCE(AVG(cr.timeliness_rating), 0) AS avg_timeliness
FROM creator_profiles cp
JOIN profiles p ON p.id = cp.user_id
LEFT JOIN creator_reviews cr ON cr.creator_id = cp.id
GROUP BY cp.id, cp.user_id, p.full_name, p.avatar_url, cp.follower_count, 
  cp.avg_engagement_rate, cp.campaigns_completed, cp.total_leads_generated, 
  cp.reliability_score, cp.verification_level, cp.verified_badges;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_leads_campaign_stage ON leads(campaign_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(campaign_id) WHERE pipeline_stage = 'converted';
CREATE INDEX IF NOT EXISTS idx_creator_reviews_creator ON creator_reviews(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_reviews_campaign ON creator_reviews(campaign_id);
CREATE INDEX IF NOT EXISTS idx_disputes_reporter ON disputes(reporter_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_contracts_campaign ON contracts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_verifications_creator ON creator_verifications(creator_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON creator_verifications(status);

-- ============================================
-- FUNCTION: Calculate Cost Per Lead
-- ============================================

CREATE OR REPLACE FUNCTION calculate_cost_per_lead()
RETURNS TRIGGER AS $$
DECLARE
  campaign_budget DECIMAL(12,2);
  total_leads INTEGER;
  calculated_cpl DECIMAL(12,2);
BEGIN
  SELECT COALESCE(total_budget, 0) INTO campaign_budget
  FROM campaigns WHERE id = NEW.campaign_id;

  SELECT COUNT(*) INTO total_leads
  FROM leads WHERE campaign_id = NEW.campaign_id;

  IF total_leads > 0 THEN
    calculated_cpl := campaign_budget / total_leads;
    
    UPDATE leads SET cost_per_lead = calculated_cpl
    WHERE campaign_id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_cpl
AFTER INSERT ON leads
FOR EACH ROW EXECUTE FUNCTION calculate_cost_per_lead();
