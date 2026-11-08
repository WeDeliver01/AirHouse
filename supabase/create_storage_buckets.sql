-- ============================================
-- STORAGE BUCKET SETUP - RUN IN SQL EDITOR
-- ============================================
-- This creates the storage buckets AND policies via SQL

-- Create avatars bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 
  'avatars', 
  true,  -- public bucket
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 10485760;

-- Create campaign-media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-media', 
  'campaign-media', 
  true,  -- public bucket
  104857600,  -- 100MB limit for 4K images
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 104857600;

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Drop existing policies first (ignore errors if they don't exist)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete their own avatar" ON storage.objects;

DROP POLICY IF EXISTS "Campaign media is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete campaign media" ON storage.objects;

-- AVATARS BUCKET POLICIES
-- Allow public read access
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload
CREATE POLICY "Anyone can upload an avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars');

-- Allow users to update their own avatars
CREATE POLICY "Anyone can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars');

-- Allow users to delete their own avatars
CREATE POLICY "Anyone can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars');

-- CAMPAIGN-MEDIA BUCKET POLICIES
-- Allow public read access
CREATE POLICY "Campaign media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-media');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload campaign media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'campaign-media');

-- Allow authenticated users to update
CREATE POLICY "Authenticated users can update campaign media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'campaign-media');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete campaign media"
ON storage.objects FOR DELETE
USING (bucket_id = 'campaign-media');

-- ============================================
-- VERIFY SETUP
-- ============================================
SELECT id, name, public FROM storage.buckets WHERE id IN ('avatars', 'campaign-media');
