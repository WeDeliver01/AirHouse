-- ============================================
-- CREATOR ATTRIBUTION & CONTENT WORKFLOW
-- Run this after 005_payment_system.sql
-- ============================================

-- ============================================
-- CREATOR TRACKING LINKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS creator_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  
  -- Tracking identifiers
  tracking_code TEXT UNIQUE NOT NULL,
  full_url TEXT NOT NULL,
  
  -- Stats
  clicks INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One link per assignment
  UNIQUE(assignment_id)
);

ALTER TABLE creator_tracking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own tracking links" ON creator_tracking_links 
FOR SELECT USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Developers can view campaign tracking links" ON creator_tracking_links 
FOR SELECT USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

CREATE INDEX idx_tracking_links_code ON creator_tracking_links(tracking_code);
CREATE INDEX idx_tracking_links_campaign ON creator_tracking_links(campaign_id);
CREATE INDEX idx_tracking_links_creator ON creator_tracking_links(creator_id);

-- ============================================
-- ENHANCE LEADS TABLE FOR ATTRIBUTION
-- ============================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_data JSONB DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS attributed_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_opened BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS link_clicked BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS documents_viewed BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_confirmed BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_tracking_code ON leads(tracking_code);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_quality_score ON leads(quality_score);

-- ============================================
-- LEAD ACTIVITIES TABLE (for tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'stage_change', 'note_added', 'email_sent', 'call_logged', 'meeting_scheduled', 'document_shared'
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead activities for their campaigns" ON lead_activities 
FOR SELECT USING (
  lead_id IN (
    SELECT l.id FROM leads l 
    JOIN campaigns c ON l.campaign_id = c.id 
    WHERE c.developer_id = auth.uid()
  )
  OR
  lead_id IN (
    SELECT l.id FROM leads l 
    WHERE l.creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid())
  )
);

-- ============================================
-- CAMPAIGN ASSETS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS campaign_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Asset details
  asset_type TEXT NOT NULL, -- 'image', 'video', 'document', 'logo', 'guideline', 'template'
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  description TEXT,
  
  -- Organization
  category TEXT, -- 'brand', 'property', 'lifestyle', 'testimonial'
  tags TEXT[] DEFAULT '{}',
  
  -- Access control
  is_public BOOLEAN DEFAULT true, -- Available to all assigned creators
  
  -- Metadata
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaign_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can manage own campaign assets" ON campaign_assets 
FOR ALL USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

CREATE POLICY "Assigned creators can view campaign assets" ON campaign_assets 
FOR SELECT USING (
  campaign_id IN (
    SELECT ca.campaign_id FROM campaign_assignments ca
    JOIN creator_profiles cp ON ca.creator_id = cp.id
    WHERE cp.user_id = auth.uid()
  )
);

-- ============================================
-- ENHANCE CONTENT SUBMISSIONS TABLE
-- ============================================

-- Add new columns if they don't exist
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS creator_notes TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS revision_feedback TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS revision_changes JSONB DEFAULT '[]';
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS revision_history JSONB DEFAULT '[]';
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS schedule_notes TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS live_url TEXT;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE content_submissions ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES creator_profiles(id);

-- ============================================
-- CONTENT ACTIVITIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS content_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'submitted', 'revision_requested', 'resubmitted', 'approved', 'rejected', 'scheduled', 'live'
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view content activities" ON content_activities 
FOR SELECT USING (
  submission_id IN (
    SELECT cs.id FROM content_submissions cs
    JOIN campaign_assignments ca ON cs.assignment_id = ca.id
    JOIN campaigns c ON ca.campaign_id = c.id
    WHERE c.developer_id = auth.uid()
  )
  OR
  submission_id IN (
    SELECT cs.id FROM content_submissions cs
    WHERE cs.creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid())
  )
);

-- ============================================
-- CONTENT CALENDAR VIEW
-- ============================================

CREATE OR REPLACE VIEW content_calendar AS
SELECT 
  cs.id,
  cs.title,
  cs.content_type,
  cs.status,
  cs.scheduled_for,
  cs.posted_at,
  cs.live_url,
  c.id as campaign_id,
  c.title as campaign_title,
  c.property_name,
  p.full_name as creator_name,
  p.avatar_url as creator_avatar
FROM content_submissions cs
JOIN campaign_assignments ca ON cs.assignment_id = ca.id
JOIN campaigns c ON ca.campaign_id = c.id
JOIN creator_profiles cp ON ca.creator_id = cp.id
JOIN profiles p ON cp.user_id = p.id
WHERE cs.scheduled_for IS NOT NULL
ORDER BY cs.scheduled_for;

-- ============================================
-- FUNCTION: Increment link clicks
-- ============================================

CREATE OR REPLACE FUNCTION increment_link_clicks(p_tracking_code TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE creator_tracking_links
  SET clicks = clicks + 1, updated_at = NOW()
  WHERE tracking_code = p_tracking_code;
END;
$$ LANGUAGE plpgsql;

-- Function to increment lead count
CREATE OR REPLACE FUNCTION increment_link_leads(p_tracking_code TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE creator_tracking_links
  SET leads = leads + 1, updated_at = NOW()
  WHERE tracking_code = p_tracking_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Auto-calculate lead score
-- ============================================

CREATE OR REPLACE FUNCTION calculate_lead_score()
RETURNS TRIGGER AS $$
DECLARE
  v_score INTEGER := 0;
BEGIN
  -- Stage points
  CASE NEW.pipeline_stage
    WHEN 'new' THEN v_score := v_score + 0;
    WHEN 'contacted' THEN v_score := v_score + 10;
    WHEN 'engaged' THEN v_score := v_score + 25;
    WHEN 'qualified' THEN v_score := v_score + 50;
    WHEN 'site_visit' THEN v_score := v_score + 70;
    WHEN 'offer_made' THEN v_score := v_score + 85;
    WHEN 'converted' THEN v_score := v_score + 100;
    ELSE v_score := v_score + 0;
  END CASE;
  
  -- Interest level bonus
  CASE NEW.interest_level
    WHEN 'hot' THEN v_score := v_score + 20;
    WHEN 'warm' THEN v_score := v_score + 10;
    ELSE v_score := v_score + 0;
  END CASE;
  
  -- Engagement bonuses
  IF NEW.email_opened THEN v_score := v_score + 5; END IF;
  IF NEW.link_clicked THEN v_score := v_score + 10; END IF;
  IF NEW.documents_viewed THEN v_score := v_score + 10; END IF;
  IF NEW.budget_confirmed THEN v_score := v_score + 15; END IF;
  
  -- Cap at 100
  NEW.quality_score := LEAST(v_score, 100);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_calculate_lead_score ON leads;
CREATE TRIGGER auto_calculate_lead_score
  BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION calculate_lead_score();

-- ============================================
-- FUNCTION: Update creator stats on lead change
-- ============================================

CREATE OR REPLACE FUNCTION update_creator_lead_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update creator profile stats
  IF NEW.creator_id IS NOT NULL THEN
    UPDATE creator_profiles
    SET 
      total_leads_generated = (
        SELECT COUNT(*) FROM leads WHERE creator_id = NEW.creator_id
      ),
      updated_at = NOW()
    WHERE id = NEW.creator_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_creator_stats_on_lead ON leads;
CREATE TRIGGER update_creator_stats_on_lead
  AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_lead_stats();

-- ============================================
-- CREATE STORAGE BUCKET FOR CAMPAIGN ASSETS
-- ============================================

-- Note: Run this in Supabase dashboard or via API
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('campaign-assets', 'campaign-assets', true);
