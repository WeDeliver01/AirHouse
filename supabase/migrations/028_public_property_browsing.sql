-- ============================================
-- PUBLIC PROPERTY BROWSING
-- The site's "see what's actually on the platform" page is moving from the
-- generic public Marketplace/Campaigns pages (now super-admin only) to a
-- single public Properties page, categorised as getaway stays, apartments
-- or houses -- the platform launches on short-stay listings, not just
-- long-term developments.
--
-- Adds the category column those listings need, and opens active listings
-- to public (including anonymous) read access: a potential buyer or guest
-- browsing properties is not expected to have an AirHouse account.
-- ============================================

DO $$ BEGIN
  CREATE TYPE property_listing_type AS ENUM ('getaway_stay', 'apartment', 'house');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_type property_listing_type NOT NULL DEFAULT 'house';

CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);

-- Supersedes the creator-only read policy from migration 011: an active
-- listing is now meant to be seen by anyone, not just signed-in creators.
DROP POLICY IF EXISTS "Active properties readable by creators" ON properties;

DROP POLICY IF EXISTS "Active properties are publicly readable" ON properties;
CREATE POLICY "Active properties are publicly readable" ON properties
  FOR SELECT
  USING (status = 'active');
