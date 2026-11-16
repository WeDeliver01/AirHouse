-- ============================================
-- PROPERTY VIDEO EMBEDS
-- Lets developers attach YouTube / TikTok / Instagram video links to a
-- property listing, alongside its photos. Additive: existing properties
-- default to an empty array and keep working unchanged.
-- ============================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS video_urls TEXT[] NOT NULL DEFAULT '{}';
