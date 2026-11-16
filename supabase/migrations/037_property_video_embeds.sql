-- 037_property_video_embeds.sql (originally numbered 033, which collided with
-- 033_backfill_missing_profiles.sql and blocked the deploy migration check).
-- Idempotent, so renumbering is safe even where it was already applied.
-- ============================================
-- PROPERTY VIDEO EMBEDS
-- Lets developers attach YouTube / TikTok / Instagram video links to a
-- property listing, alongside its photos. Additive: existing properties
-- default to an empty array and keep working unchanged.
-- ============================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS video_urls TEXT[] NOT NULL DEFAULT '{}';
