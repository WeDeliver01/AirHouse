-- ============================================
-- SAFE CAMPAIGNS SCHEMA UPDATE
-- Drops existing policies before recreating
-- ============================================

-- Drop existing campaign policies first
DROP POLICY IF EXISTS "Anyone can view open campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can view own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can create campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can update own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can delete own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can insert campaigns" ON campaigns;

-- Add missing columns if they don't exist
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_objectives TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS key_selling_points TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS payment_structure TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS property_images TEXT[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brochure_urls TEXT[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_guidelines TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS creator_budget DECIMAL(12,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(12,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS escrow_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS amount_paid_out DECIMAL(12,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS escrow_wallet_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS funding_status TEXT DEFAULT 'unfunded';

-- Recreate RLS policies for campaigns
CREATE POLICY "Anyone can view open campaigns" ON campaigns 
FOR SELECT USING (status IN ('open', 'active') OR developer_id = auth.uid());

CREATE POLICY "Developers can insert campaigns" ON campaigns 
FOR INSERT WITH CHECK (developer_id = auth.uid());

CREATE POLICY "Developers can update own campaigns" ON campaigns 
FOR UPDATE USING (developer_id = auth.uid());

CREATE POLICY "Developers can delete own campaigns" ON campaigns 
FOR DELETE USING (developer_id = auth.uid());

-- Verify the columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
ORDER BY ordinal_position;
