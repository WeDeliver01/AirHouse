-- ============================================
-- 011_marketplace_public_view.sql
-- Public-readable, RLS-enforced surface for the Creator Marketplace.
--
-- We do NOT bypass RLS. Instead:
--   1. We define a `security_invoker = true` view so queries run with the
--      caller's privileges and RLS on the underlying tables applies.
--   2. We add narrow anon SELECT policies on `creator_profiles` and on
--      `profiles` (creators only) so anon can read the rows the marketplace
--      needs.
--   3. We use column-level GRANT/REVOKE on `profiles` so the anon role can
--      only read public-safe columns (no `phone`, no future sensitive
--      fields), even when querying `profiles` directly via PostgREST.
--   4. The view itself projects only non-sensitive columns and computes
--      `min_rate_zar` / `max_rate_zar` from the JSONB `rate_card` so the
--      marketplace can filter by rate range server-side.
-- ============================================

-- ----------------------------------------------------------------------
-- 1. Anon SELECT policies on the underlying tables
-- ----------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can view creator marketplace profiles" ON public.creator_profiles;
CREATE POLICY "Public can view creator marketplace profiles"
  ON public.creator_profiles
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Public can view creator profile cards" ON public.profiles;
CREATE POLICY "Public can view creator profile cards"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (role = 'creator');

-- ----------------------------------------------------------------------
-- 2. Column-level privileges for anon on `profiles`
--
-- Re-grant SELECT to anon ONLY on the columns that are safe to expose
-- publicly. `phone` (and any future sensitive column added to profiles)
-- is intentionally excluded.
-- ----------------------------------------------------------------------

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id,
  role,
  full_name,
  avatar_url,
  company_name,
  bio,
  is_verified,
  created_at,
  updated_at
) ON public.profiles TO anon;

-- creator_profiles has no sensitive columns today, but we still scope the
-- anon grant explicitly so adding a new sensitive column in the future
-- does not silently leak. Mirror the columns the public view exposes.
REVOKE SELECT ON public.creator_profiles FROM anon;
GRANT SELECT (
  id,
  user_id,
  instagram_handle,
  tiktok_handle,
  youtube_handle,
  follower_count,
  niche,
  portfolio_urls,
  rate_card,
  location,
  is_available,
  avg_engagement_rate,
  reliability_score,
  campaigns_completed,
  total_leads_generated,
  created_at,
  updated_at
) ON public.creator_profiles TO anon;

-- ----------------------------------------------------------------------
-- 3. Marketplace view (security_invoker = RLS applies to the caller)
-- ----------------------------------------------------------------------

DROP VIEW IF EXISTS public.creator_marketplace_public CASCADE;

CREATE VIEW public.creator_marketplace_public
WITH (security_invoker = true) AS
SELECT
  cp.id                            AS creator_profile_id,
  cp.user_id                       AS user_id,
  p.full_name                      AS full_name,
  p.avatar_url                     AS avatar_url,
  p.bio                            AS bio,
  COALESCE(p.is_verified, false)   AS is_verified,
  cp.location                      AS location,
  cp.niche                         AS niche,
  cp.follower_count                AS follower_count,
  cp.instagram_handle              AS instagram_handle,
  cp.tiktok_handle                 AS tiktok_handle,
  cp.youtube_handle                AS youtube_handle,
  cp.reliability_score             AS reliability_score,
  cp.campaigns_completed           AS campaigns_completed,
  cp.total_leads_generated         AS total_leads_generated,
  cp.is_available                  AS is_available,
  cp.created_at                    AS created_at,
  cp.rate_card                     AS rate_card,
  -- Min/max positive rate from the JSONB rate_card (used for ZAR rate filters)
  (
    SELECT MIN(value::numeric)
    FROM jsonb_each_text(cp.rate_card)
    WHERE value ~ '^[0-9]+(\.[0-9]+)?$'
      AND value::numeric > 0
  ) AS min_rate_zar,
  (
    SELECT MAX(value::numeric)
    FROM jsonb_each_text(cp.rate_card)
    WHERE value ~ '^[0-9]+(\.[0-9]+)?$'
      AND value::numeric > 0
  ) AS max_rate_zar
FROM public.creator_profiles cp
JOIN public.profiles p ON p.id = cp.user_id
WHERE p.role = 'creator';

GRANT SELECT ON public.creator_marketplace_public TO anon, authenticated;

COMMENT ON VIEW public.creator_marketplace_public IS
  'Public marketplace surface over creator_profiles + profiles. View runs '
  'with security_invoker=true so RLS on the underlying tables is enforced. '
  'Anon access is permitted by the dedicated SELECT policies in this same '
  'migration, scoped to creator-role profiles and non-sensitive columns.';
