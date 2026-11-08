-- ============================================
-- ADD MISSING CAMPAIGN COLUMNS
-- Run this in Supabase SQL Editor
-- ============================================

-- Add missing columns to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_objectives TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS key_selling_points TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS payment_structure TEXT DEFAULT 'milestone';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS property_images TEXT[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brochure_urls TEXT[];

-- Fix target_audience to be an array instead of text
-- First check if it's text type and convert
DO $$
BEGIN
  -- Try to alter the column type if it's text
  ALTER TABLE campaigns ALTER COLUMN target_audience TYPE TEXT[] USING 
    CASE 
      WHEN target_audience IS NULL THEN NULL
      WHEN target_audience = '' THEN NULL
      ELSE ARRAY[target_audience]
    END;
EXCEPTION
  WHEN others THEN
    -- Column might already be the right type, ignore
    NULL;
END $$;

-- Make sure RLS policies allow developers to insert
DROP POLICY IF EXISTS "Developers can manage own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can insert campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can update own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Developers can delete own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Open campaigns viewable by authenticated" ON campaigns;

-- Create comprehensive policies
CREATE POLICY "Anyone can view open campaigns" ON campaigns 
FOR SELECT USING (status IN ('open', 'active') OR developer_id = auth.uid());

CREATE POLICY "Developers can insert campaigns" ON campaigns 
FOR INSERT WITH CHECK (developer_id = auth.uid());

CREATE POLICY "Developers can update own campaigns" ON campaigns 
FOR UPDATE USING (developer_id = auth.uid());

CREATE POLICY "Developers can delete own campaigns" ON campaigns 
FOR DELETE USING (developer_id = auth.uid());

-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
ORDER BY ordinal_position;
