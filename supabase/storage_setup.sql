-- ============================================
-- STORAGE SETUP
-- ============================================
-- IMPORTANT: Storage buckets MUST be created via the Supabase Dashboard UI
-- This file only adds the database columns needed for media URLs

-- Add media columns to campaigns table if they don't exist
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS property_images TEXT[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brochure_urls TEXT[];

-- ============================================
-- MANUAL STEPS IN SUPABASE DASHBOARD
-- ============================================
-- 
-- 1. Go to "Storage" in the left sidebar of your Supabase Dashboard
--
-- 2. Click "New bucket" and create:
--    
--    BUCKET 1:
--    - Name: avatars
--    - Public bucket: ✅ CHECK THIS BOX
--    - Click "Create bucket"
--    
--    BUCKET 2:
--    - Name: campaign-media
--    - Public bucket: ✅ CHECK THIS BOX
--    - Click "Create bucket"
--
-- 3. For EACH bucket, click on it, then go to "Policies" tab:
--    
--    Click "New Policy" → "Get started quickly" → "Allow access to all users"
--    This will create SELECT, INSERT, UPDATE, DELETE policies
--
-- That's it! Storage is now configured.
--
-- ============================================
-- TEST
-- ============================================
-- After setup, verify buckets exist:
SELECT * FROM storage.buckets;

