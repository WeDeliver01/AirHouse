-- ============================================================================
-- 029_accommodation_marketing.sql
--
-- Extends the existing property / campaign / creator-assignment / lead
-- infrastructure to support marketing short-term rental (Airbnb-style)
-- listings alongside property sales. Additive and backward-compatible:
-- every new column is nullable or defaulted, every new table is new, and no
-- existing column, policy or API contract changes meaning.
--
-- Covers:
--   1. Property accommodation fields + sale-vs-rental classification.
--   2. Campaign objectives for accommodation marketing.
--   3. First-party click tracking (`creator_tracking_links` + `link_clicks`),
--      resolved only through a SECURITY DEFINER function so a visitor can
--      never supply an arbitrary redirect destination.
--   4. Accommodation enquiry fields on the existing `leads` table.
--   5. A fix for the `leads.attributed_at` column referenced (but never
--      created) by migration 024's attribution trigger.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Fix: migration 024's validate_lead() trigger reads/writes
--    NEW.attributed_at, but no migration ever added that column. Any lead
--    carrying a creator_id has been hitting an undefined-column error.
-- ----------------------------------------------------------------------------

ALTER TABLE leads ADD COLUMN IF NOT EXISTS attributed_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 1. Property classification + accommodation fields.
--
--    `property_type` already exists and means "listing style" (getaway_stay
--    / apartment / house) -- it is not the sale-vs-rental split this task
--    asks for. `listing_category` is the new, separate field. Existing
--    'getaway_stay' listings default to 'short_term_rental'; everything
--    else defaults to 'sale', so no existing row changes behaviour.
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE listing_category AS ENUM ('sale', 'short_term_rental');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_category listing_category;

UPDATE properties
SET listing_category = CASE WHEN property_type = 'getaway_stay' THEN 'short_term_rental' ELSE 'sale' END::listing_category
WHERE listing_category IS NULL;

ALTER TABLE properties ALTER COLUMN listing_category SET DEFAULT 'sale';
ALTER TABLE properties ALTER COLUMN listing_category SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_listing_category ON properties(listing_category);

-- Booking.com and direct bookings are future platforms; the column accepts
-- any value today and a CHECK can be tightened later without a rewrite.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS booking_platform TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_booking_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS guest_capacity INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS nightly_rate NUMERIC(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_guest_capacity_nonneg') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_guest_capacity_nonneg
      CHECK (guest_capacity IS NULL OR guest_capacity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_nightly_rate_nonneg') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_nightly_rate_nonneg
      CHECK (nightly_rate IS NULL OR nightly_rate >= 0);
  END IF;
  -- A short-term rental needs somewhere to send the guest. Sale listings are
  -- unaffected by this check.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_str_needs_booking_url') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_str_needs_booking_url
      CHECK (listing_category <> 'short_term_rental' OR external_booking_url IS NOT NULL);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Campaign objectives.
--
--    `campaign_objectives` already exists as a free-text brief field and
--    keeps its meaning. `objective` is new, structured, and nullable so
--    every existing campaign keeps working unchanged.
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE campaign_objective AS ENUM (
    'listing_awareness', 'listing_traffic', 'booking_enquiries', 'occupancy'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objective campaign_objective;

-- ----------------------------------------------------------------------------
-- 3. First-party creator tracking links + click attribution.
--
--    `creator_tracking_links` and an `increment_link_clicks` RPC were
--    referenced by the client (src/lib/tracking.js) but never created by
--    any migration, so link tracking has never actually worked. This
--    creates the real table this time, matched to what the client needs,
--    plus the public, token-only redirect path requested by this task:
--    a visitor's request carries nothing but an opaque token, and the
--    actual destination URL only ever comes out of the database.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creator_tracking_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES campaign_assignments(id) ON DELETE CASCADE,
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id     UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE
);

-- Defensive ADD COLUMN IF NOT EXISTS for every column, rather than relying
-- solely on the CREATE TABLE above, in case some environment already has a
-- partially-shaped version of this table.
ALTER TABLE creator_tracking_links ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
-- Opaque token used in both /go/:token (outbound booking redirects) and
-- ?ref=:token (enquiry-form attribution). Never a destination URL itself.
ALTER TABLE creator_tracking_links ADD COLUMN IF NOT EXISTS token TEXT;
ALTER TABLE creator_tracking_links ADD COLUMN IF NOT EXISTS clicks_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE creator_tracking_links ADD COLUMN IF NOT EXISTS leads_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE creator_tracking_links ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill any legacy rows (an older, incompatible shape of this table) that
-- have no token yet, so the NOT NULL/UNIQUE constraints below can be added.
UPDATE creator_tracking_links SET token = 'legacy-' || id::text WHERE token IS NULL;
ALTER TABLE creator_tracking_links ALTER COLUMN token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_tracking_links_token_key') THEN
    ALTER TABLE creator_tracking_links ADD CONSTRAINT creator_tracking_links_token_key UNIQUE (token);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_tracking_links_assignment_id_key') THEN
    ALTER TABLE creator_tracking_links ADD CONSTRAINT creator_tracking_links_assignment_id_key UNIQUE (assignment_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tracking_links_campaign ON creator_tracking_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_creator ON creator_tracking_links(creator_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_property ON creator_tracking_links(property_id);

ALTER TABLE creator_tracking_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators manage own tracking links" ON creator_tracking_links;
CREATE POLICY "Creators manage own tracking links" ON creator_tracking_links
  FOR ALL TO authenticated
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()))
  WITH CHECK (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Developers view tracking links on own campaigns" ON creator_tracking_links;
CREATE POLICY "Developers view tracking links on own campaigns" ON creator_tracking_links
  FOR SELECT TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

DROP POLICY IF EXISTS "Super admins full access on tracking links" ON creator_tracking_links;
CREATE POLICY "Super admins full access on tracking links" ON creator_tracking_links
  FOR ALL USING (fin_is_super_admin(auth.uid())) WITH CHECK (fin_is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON creator_tracking_links TO authenticated;

-- Click log. No role is ever granted direct INSERT -- every click is
-- recorded through record_tracking_click() below, which resolves the token
-- server-side and never trusts a client-supplied destination.
CREATE TABLE IF NOT EXISTS link_clicks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_link_id UUID NOT NULL REFERENCES creator_tracking_links(id) ON DELETE CASCADE,
  campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id       UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE
);

ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
-- POPIA-conscious: no raw IP or precise fingerprint is kept. A salted hash
-- is enough to dedupe "unique visitors" without storing who they are.
ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS visitor_hash TEXT;
ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_campaign ON link_clicks(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_clicks_creator ON link_clicks(creator_id, created_at DESC);

ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developers view clicks on own campaigns" ON link_clicks;
CREATE POLICY "Developers view clicks on own campaigns" ON link_clicks
  FOR SELECT TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

DROP POLICY IF EXISTS "Creators view own clicks" ON link_clicks;
CREATE POLICY "Creators view own clicks" ON link_clicks
  FOR SELECT TO authenticated
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Super admins full access on link clicks" ON link_clicks;
CREATE POLICY "Super admins full access on link clicks" ON link_clicks
  FOR ALL USING (fin_is_super_admin(auth.uid())) WITH CHECK (fin_is_super_admin(auth.uid()));

-- Deliberately no GRANT to anon/authenticated: all writes go through the
-- SECURITY DEFINER function below, which runs as the table owner.
GRANT SELECT ON link_clicks TO authenticated;

-- Resolves a token to a redirect destination and records the click, all in
-- one server-side step. The visitor's request never names a destination --
-- only an opaque token -- so there is nothing for them to redirect
-- elsewhere with.
CREATE OR REPLACE FUNCTION record_tracking_click(
  p_token TEXT,
  p_visitor_hash TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL
)
RETURNS TABLE(destination_url TEXT, property_id UUID, campaign_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link RECORD;
  v_dest TEXT;
BEGIN
  SELECT ctl.id, ctl.campaign_id, ctl.creator_id, ctl.property_id
  INTO v_link
  FROM creator_tracking_links ctl
  WHERE ctl.token = p_token;

  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'Unknown tracking link' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(p.external_booking_url, c.landing_page_url)
  INTO v_dest
  FROM campaigns c
  LEFT JOIN properties p ON p.id = COALESCE(v_link.property_id, c.property_id)
  WHERE c.id = v_link.campaign_id;

  IF v_dest IS NULL OR length(trim(v_dest)) = 0 THEN
    RAISE EXCEPTION 'This link has no destination configured' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO link_clicks (tracking_link_id, campaign_id, creator_id, property_id, visitor_hash, referrer)
  VALUES (v_link.id, v_link.campaign_id, v_link.creator_id, v_link.property_id,
          left(COALESCE(p_visitor_hash, ''), 128), left(COALESCE(p_referrer, ''), 2000));

  UPDATE creator_tracking_links SET clicks_count = clicks_count + 1 WHERE id = v_link.id;

  RETURN QUERY SELECT v_dest, v_link.property_id, v_link.campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_tracking_click(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Used by the enquiry form (and the old lead-capture flow it shares a table
-- with) to credit the creator without exposing clicks_count/leads_count to
-- a direct public write.
CREATE OR REPLACE FUNCTION increment_link_leads(p_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE creator_tracking_links SET leads_count = leads_count + 1 WHERE token = p_token;
$$;

GRANT EXECUTE ON FUNCTION increment_link_leads(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Accommodation enquiry fields on the existing `leads` table.
--
--    A click (link_clicks) is never a lead. An enquiry is a lead, same as a
--    sale enquiry, just with a few more fields when the campaign is for a
--    short-term rental.
-- ----------------------------------------------------------------------------

ALTER TABLE leads ADD COLUMN IF NOT EXISTS check_in_date  DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS check_out_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS guest_count    INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_token TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_guest_count_nonneg') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_guest_count_nonneg
      CHECK (guest_count IS NULL OR guest_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_checkout_after_checkin') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_checkout_after_checkin
      CHECK (check_out_date IS NULL OR check_in_date IS NULL OR check_out_date > check_in_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_tracking_token ON leads(tracking_token) WHERE tracking_token IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. Reporting: per-creator, per-campaign click/enquiry funnel.
--
--    Counts only -- no enquirer personal detail is exposed here, matching
--    the existing creator_attribution_summary view from migration 024.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW creator_tracking_link_stats AS
SELECT
  ctl.id                AS tracking_link_id,
  ctl.token,
  ctl.campaign_id,
  ctl.creator_id,
  ctl.property_id,
  ctl.clicks_count,
  ctl.leads_count,
  CASE WHEN ctl.clicks_count > 0
       THEN round((ctl.leads_count::numeric / ctl.clicks_count) * 100, 1)
       ELSE 0 END        AS click_to_enquiry_rate,
  (SELECT count(DISTINCT lc.visitor_hash)
     FROM link_clicks lc
    WHERE lc.tracking_link_id = ctl.id AND lc.visitor_hash IS NOT NULL AND lc.visitor_hash <> '')
                          AS unique_visitors
FROM creator_tracking_links ctl;

REVOKE ALL ON creator_tracking_link_stats FROM anon;
GRANT SELECT ON creator_tracking_link_stats TO authenticated;

COMMIT;
