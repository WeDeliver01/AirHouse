-- ============================================================================
-- 031_site_analytics_and_property_urls.sql
--
-- Two additions, both additive and backward-compatible:
--
--   1. Site-wide analytics: a generic event log (page views, logins, signups,
--      outbound clicks) that a super admin can see in full and a developer
--      can see scoped to their own properties. Writes go through a single
--      SECURITY DEFINER RPC so anon/authenticated never get a direct INSERT
--      grant on the table itself.
--
--   2. Property-direct leads: a lead captured from a property's own public
--      URL (airhouse.co.za/:slug) no longer requires a campaign. leads.
--      campaign_id becomes nullable, leads.property_id is added, and the
--      lead validation trigger + public insert policy + developer read
--      policy are extended to cover the property-only path. Nothing about
--      the existing campaign-based path changes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Property-direct leads.
-- ----------------------------------------------------------------------------

ALTER TABLE leads ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_campaign_or_property') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_campaign_or_property
      CHECK (campaign_id IS NOT NULL OR property_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_property ON leads(property_id) WHERE property_id IS NOT NULL;

-- validate_lead() (migration 024) assumed every lead named a campaign.
-- Extend it to accept a property-only lead, validating the property the
-- same way the campaign path validates the campaign, and leaving every
-- existing campaign-path rule untouched.
CREATE OR REPLACE FUNCTION validate_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status      campaign_status;
  v_prop_status property_status;
  v_window      INT;
  v_existing    UUID;
  v_assigned    BOOLEAN;
  v_dedupe_key  UUID;
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT status INTO v_status FROM campaigns WHERE id = NEW.campaign_id;
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_status::text NOT IN ('open', 'invited', 'active') THEN
      RAISE EXCEPTION 'This campaign is not accepting enquiries'
        USING ERRCODE = 'check_violation';
    END IF;
    v_dedupe_key := NEW.campaign_id;
  ELSE
    -- Property-only lead: no campaign, captured from the property's own
    -- public URL. The property must exist and be live.
    SELECT status INTO v_prop_status FROM properties WHERE id = NEW.property_id;
    IF v_prop_status IS NULL THEN
      RAISE EXCEPTION 'Property not found' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_prop_status::text <> 'active' THEN
      RAISE EXCEPTION 'This listing is not accepting enquiries'
        USING ERRCODE = 'check_violation';
    END IF;
    -- A property-only lead is never creator-attributed: tracking links are
    -- always tied to a campaign (migration 029), so there is no assignment
    -- to verify against here.
    NEW.creator_id := NULL;
    NEW.attributed_at := NULL;
    NEW.referral_code := NULL;
    v_dedupe_key := NEW.property_id;
  END IF;

  -- Contact details: at least one usable channel, and a sane shape.
  IF (NEW.lead_email IS NULL OR length(trim(NEW.lead_email)) = 0)
     AND (NEW.lead_phone IS NULL OR length(trim(NEW.lead_phone)) = 0) THEN
    RAISE EXCEPTION 'An enquiry needs an email address or a phone number'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.lead_email IS NOT NULL AND length(trim(NEW.lead_email)) > 0
     AND NEW.lead_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'That email address is not valid' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.lead_name IS NULL OR length(trim(NEW.lead_name)) < 2 THEN
    RAISE EXCEPTION 'An enquiry needs a name' USING ERRCODE = 'check_violation';
  END IF;

  -- Bound the free-text fields so the table cannot be used as storage.
  IF length(COALESCE(NEW.lead_name, '')) > 200
     OR length(COALESCE(NEW.lead_email, '')) > 320
     OR length(COALESCE(NEW.lead_phone, '')) > 50
     OR length(COALESCE(NEW.notes, '')) > 5000
     OR length(COALESCE(NEW.source_url, '')) > 2000 THEN
    RAISE EXCEPTION 'One of the submitted fields is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.normalised_email := lower(nullif(trim(NEW.lead_email), ''));
  NEW.normalised_phone := normalise_phone(NEW.lead_phone);

  -- Attribution must be real: a referral code only counts if that creator is
  -- actually assigned to this campaign. Otherwise the lead is kept but
  -- recorded as unattributed, rather than crediting the wrong person.
  IF NEW.campaign_id IS NOT NULL AND NEW.creator_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM campaign_assignments
      WHERE campaign_id = NEW.campaign_id AND creator_id = NEW.creator_id
    ) INTO v_assigned;

    IF NOT v_assigned THEN
      NEW.creator_id := NULL;
      NEW.attributed_at := NULL;
      NEW.referral_code := NULL;
    ELSIF NEW.attributed_at IS NULL THEN
      NEW.attributed_at := NOW();
    END IF;
  END IF;

  -- Duplicate detection, scoped to whichever of campaign/property this lead
  -- belongs to.
  v_window := COALESCE((get_platform_setting('lead_duplicate_window_hours', '24'::jsonb))::text::int, 24);

  SELECT id INTO v_existing
  FROM leads
  WHERE COALESCE(campaign_id, property_id) = v_dedupe_key
    AND created_at > NOW() - make_interval(hours => v_window)
    AND (
      (NEW.normalised_email IS NOT NULL AND normalised_email = NEW.normalised_email)
      OR (NEW.normalised_phone IS NOT NULL AND normalised_phone = NEW.normalised_phone)
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    NEW.duplicate_of := v_existing;
    NEW.pipeline_stage := 'duplicate';
    NEW.status := 'duplicate';
  END IF;

  -- Consent is recorded, not assumed.
  IF NEW.consent_given IS TRUE AND NEW.consent_at IS NULL THEN
    NEW.consent_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

-- Public insert policy (migration 018) only ever allowed campaign-based
-- leads. Extend it to also allow a property-only lead against an active
-- property.
DROP POLICY IF EXISTS "leads_insert_public" ON leads;
CREATE POLICY "leads_insert_public" ON leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (campaign_id IS NOT NULL AND campaign_id IN (SELECT id FROM campaigns WHERE status IN ('open', 'active')))
    OR
    (campaign_id IS NULL AND property_id IS NOT NULL AND property_id IN (SELECT id FROM properties WHERE status = 'active'))
  );

-- Developers already manage leads for their campaigns (migration 004). Add
-- the equivalent for leads captured straight off their property's own URL.
DROP POLICY IF EXISTS "Developers can manage property leads" ON leads;
CREATE POLICY "Developers can manage property leads" ON leads FOR ALL USING (
  property_id IN (SELECT id FROM properties WHERE developer_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 2. Site-wide analytics event log.
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE site_event_type AS ENUM ('pageview', 'login', 'signup', 'outbound_click');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS site_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  visitor_id  TEXT NOT NULL,
  event_type  site_event_type NOT NULL,
  path        TEXT,
  referrer    TEXT,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_role   TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_events_created ON site_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_session ON site_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_site_events_property ON site_events(property_id, created_at DESC) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_events_type ON site_events(event_type, created_at DESC);

ALTER TABLE site_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read all site events" ON site_events;
CREATE POLICY "Super admins read all site events" ON site_events
  FOR SELECT USING (fin_is_super_admin(auth.uid()));

-- A developer may see traffic on their own listings, but not platform-wide
-- events (logins/signups with no property, or another developer's pages).
DROP POLICY IF EXISTS "Developers read traffic on their own properties" ON site_events;
CREATE POLICY "Developers read traffic on their own properties" ON site_events
  FOR SELECT TO authenticated
  USING (property_id IN (SELECT id FROM properties WHERE developer_id = auth.uid()));

-- No direct INSERT grant to anyone: every write goes through
-- record_site_event() below, which bounds and sanitises its own input.
GRANT SELECT ON site_events TO authenticated;

CREATE OR REPLACE FUNCTION record_site_event(
  p_session_id  TEXT,
  p_visitor_id  TEXT,
  p_event_type  TEXT,
  p_path        TEXT DEFAULT NULL,
  p_referrer    TEXT DEFAULT NULL,
  p_property_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  IF p_session_id IS NULL OR length(trim(p_session_id)) = 0
     OR p_visitor_id IS NULL OR length(trim(p_visitor_id)) = 0 THEN
    RETURN;
  END IF;

  IF p_event_type NOT IN ('pageview', 'login', 'signup', 'outbound_click') THEN
    RETURN;
  END IF;

  -- A property-scoped event must actually name a real, live property --
  -- otherwise silently drop the property_id rather than let an arbitrary
  -- UUID be recorded against a listing that doesn't exist.
  IF p_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM properties WHERE id = p_property_id
  ) THEN
    p_property_id := NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_user_role FROM profiles WHERE id = auth.uid();
  END IF;

  INSERT INTO site_events (session_id, visitor_id, event_type, path, referrer, user_id, user_role, property_id)
  VALUES (
    left(trim(p_session_id), 64),
    left(trim(p_visitor_id), 64),
    p_event_type::site_event_type,
    left(COALESCE(p_path, ''), 500),
    left(COALESCE(p_referrer, ''), 500),
    auth.uid(),
    v_user_role,
    p_property_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_site_event(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

-- Per-property traffic summary for the developer analytics screen. The
-- view enforces its own scoping by auth.uid() rather than relying on RLS on
-- the underlying table being evaluated the way the caller expects, so it is
-- safe regardless of the view owner's privileges.
CREATE OR REPLACE VIEW property_traffic_summary AS
SELECT
  p.id AS property_id,
  p.developer_id,
  count(*) FILTER (WHERE e.event_type = 'pageview') AS page_views,
  count(*) FILTER (WHERE e.event_type = 'outbound_click') AS outbound_clicks,
  count(DISTINCT e.visitor_id) AS unique_visitors,
  count(DISTINCT e.session_id) AS unique_sessions,
  max(e.created_at) AS last_viewed_at
FROM properties p
JOIN site_events e ON e.property_id = p.id
WHERE p.developer_id = auth.uid() OR fin_is_super_admin(auth.uid())
GROUP BY p.id, p.developer_id;

REVOKE ALL ON property_traffic_summary FROM anon;
GRANT SELECT ON property_traffic_summary TO authenticated;

COMMIT;
