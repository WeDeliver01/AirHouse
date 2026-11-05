-- ============================================
-- PROPERTY LISTING MANAGER
-- Adds a `properties` table so developers can manage real
-- property records that can be linked to one or more campaigns.
-- Additive migration — existing campaigns without `property_id` continue to work.
-- ============================================

-- Property status enum
DO $$ BEGIN
  CREATE TYPE property_status AS ENUM ('draft', 'active', 'sold', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- PROPERTIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,

  price_zar NUMERIC(14,2),

  location_city TEXT,
  location_suburb TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),

  bedrooms INTEGER,
  bathrooms INTEGER,
  parking INTEGER,
  floor_area_sqm NUMERIC(10,2),

  status property_status NOT NULL DEFAULT 'draft',
  photo_urls TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_developer ON properties(developer_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(location_city);

-- updated_at trigger (reuse existing helper if present, otherwise inline)
CREATE OR REPLACE FUNCTION set_properties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS properties_set_updated_at ON properties;
CREATE TRIGGER properties_set_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION set_properties_updated_at();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developers manage their own properties" ON properties;
CREATE POLICY "Developers manage their own properties" ON properties
  FOR ALL
  USING (developer_id = auth.uid())
  WITH CHECK (developer_id = auth.uid());

-- Creators (and only creators) can read ACTIVE properties.
-- This is intentionally NOT `auth.role() = 'authenticated'` because that would
-- let other developers see each other's active listings (cross-tenant leakage).
DROP POLICY IF EXISTS "Active properties readable by authenticated" ON properties;
DROP POLICY IF EXISTS "Active properties readable by creators" ON properties;
CREATE POLICY "Active properties readable by creators" ON properties
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'creator'
    )
  );

-- Super admin all-access (uses helper from migration 010)
DROP POLICY IF EXISTS "Super admins full access on properties" ON properties;
CREATE POLICY "Super admins full access on properties" ON properties
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- ============================================
-- LINK CAMPAIGNS -> PROPERTIES
-- Additive: nullable FK so existing campaigns keep working.
-- ============================================
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_property ON campaigns(property_id);

-- ============================================
-- STORAGE BUCKET: property-photos
-- Public read, writes restricted to developer's own folder.
-- Folder convention: <developer_id>/<property_id>/<filename>
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', TRUE)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Public read
DROP POLICY IF EXISTS "Public read property photos" ON storage.objects;
CREATE POLICY "Public read property photos" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'property-photos');

-- Authenticated developer can upload only into a folder named after their own user id
DROP POLICY IF EXISTS "Developers upload own property photos" ON storage.objects;
CREATE POLICY "Developers upload own property photos" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated developer can update only their own folder
DROP POLICY IF EXISTS "Developers update own property photos" ON storage.objects;
CREATE POLICY "Developers update own property photos" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated developer can delete only their own folder
DROP POLICY IF EXISTS "Developers delete own property photos" ON storage.objects;
CREATE POLICY "Developers delete own property photos" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
