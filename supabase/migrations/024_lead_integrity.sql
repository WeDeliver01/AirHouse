-- ============================================================================
-- 024_lead_integrity.sql
--
-- Abuse protection and attribution integrity for the public lead-capture
-- form, which is the one place an unauthenticated stranger can write to the
-- database.
--
-- The audit asks for server-side validation, duplicate detection, campaign
-- status validation, consent capture, submission metadata and attribution
-- validation. Rate limiting and bot protection sit in front of this, in the
-- notification service and the form itself; the rules here are the ones that
-- must hold even if somebody posts straight to PostgREST.
--
-- A click is not a lead, and a lead is not a sale. The pipeline below keeps
-- those distinct.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Consent and provenance.
--
--    POPIA: a lead is a third party's personal information, collected by a
--    creator's referral and processed by a developer. Record what they were
--    told and where it came from.
-- ----------------------------------------------------------------------------

ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_given        BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_text         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_at           TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS submission_ip        INET;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS submission_user_agent TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS duplicate_of         UUID REFERENCES leads(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalised_email     TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalised_phone     TEXT;

-- ----------------------------------------------------------------------------
-- 2. Validation and normalisation on the way in.
--
--    Runs for every insert including a direct PostgREST call, so the form is
--    not the only thing standing between the table and a bot.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION normalise_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  -- Keep digits only, then drop a South African country code so that
  -- 0821234567 and +27821234567 compare equal.
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    ELSE regexp_replace(
           regexp_replace(regexp_replace(p_phone, '\D', '', 'g'), '^27', '0'),
           '^00', '0')
  END;
$$;

CREATE OR REPLACE FUNCTION validate_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status      campaign_status;
  v_window      INT;
  v_existing    UUID;
  v_assigned    BOOLEAN;
BEGIN
  -- A lead must name a campaign that is actually accepting them.
  SELECT status INTO v_status FROM campaigns WHERE id = NEW.campaign_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status::text NOT IN ('open', 'invited', 'active') THEN
    RAISE EXCEPTION 'This campaign is not accepting enquiries'
      USING ERRCODE = 'check_violation';
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
  IF NEW.creator_id IS NOT NULL THEN
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

  -- Duplicate detection: the same person enquiring about the same campaign
  -- inside the configured window is flagged rather than rejected, so a
  -- genuine second enquiry is not lost but the developer is not double
  -- counted.
  v_window := COALESCE((get_platform_setting('lead_duplicate_window_hours', '24'::jsonb))::text::int, 24);

  SELECT id INTO v_existing
  FROM leads
  WHERE campaign_id = NEW.campaign_id
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

DROP TRIGGER IF EXISTS trg_validate_lead ON leads;
CREATE TRIGGER trg_validate_lead
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION validate_lead();

CREATE INDEX IF NOT EXISTS idx_leads_dedupe
  ON leads (campaign_id, normalised_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_dedupe_phone
  ON leads (campaign_id, normalised_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_stage
  ON leads (campaign_id, pipeline_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_creator_attribution
  ON leads (creator_id, created_at DESC) WHERE creator_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Pipeline transitions.
--
--    The audit distinguishes generated, qualified and converted. Enforcing
--    the order stops a lead jumping straight to converted and inflating the
--    conversion figures a developer is paying against.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_stage_transitions (
  from_stage TEXT NOT NULL,
  to_stage   TEXT NOT NULL,
  PRIMARY KEY (from_stage, to_stage)
);

TRUNCATE lead_stage_transitions;
INSERT INTO lead_stage_transitions (from_stage, to_stage) VALUES
  ('new','contacted'), ('new','unqualified'), ('new','duplicate'), ('new','unreachable'), ('new','lost'),
  ('contacted','qualified'), ('contacted','unqualified'), ('contacted','unreachable'), ('contacted','lost'),
  ('contacted','new'),
  ('qualified','site_visit'), ('qualified','negotiation'), ('qualified','lost'), ('qualified','unqualified'),
  ('site_visit','negotiation'), ('site_visit','converted'), ('site_visit','lost'),
  ('negotiation','converted'), ('negotiation','lost'),
  ('unreachable','contacted'), ('unreachable','lost'),
  ('unqualified','contacted'),
  ('duplicate','contacted');

ALTER TABLE lead_stage_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lead_stage_transitions FROM anon, authenticated;
GRANT SELECT ON lead_stage_transitions TO authenticated;
DROP POLICY IF EXISTS "lead_stage_transitions_read" ON lead_stage_transitions;
CREATE POLICY "lead_stage_transitions_read" ON lead_stage_transitions
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION enforce_lead_stage_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.pipeline_stage IS NOT DISTINCT FROM OLD.pipeline_stage THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lead_stage_transitions
    WHERE from_stage = OLD.pipeline_stage::text AND to_stage = NEW.pipeline_stage::text
  ) THEN
    RAISE EXCEPTION 'A lead cannot move from % to %', OLD.pipeline_stage, NEW.pipeline_stage
      USING ERRCODE = 'check_violation';
  END IF;

  -- Record the movement so conversion reporting has a history behind it.
  INSERT INTO lead_activities (lead_id, user_id, activity_type, previous_stage, new_stage)
  VALUES (NEW.id, auth.uid(), 'status_change', OLD.pipeline_stage, NEW.pipeline_stage);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_stage_transition ON leads;
CREATE TRIGGER trg_lead_stage_transition
  BEFORE UPDATE OF pipeline_stage ON leads
  FOR EACH ROW EXECUTE FUNCTION enforce_lead_stage_transition();

-- ----------------------------------------------------------------------------
-- 4. Attribution reporting.
--
--    Counts only, for the creator. A creator should see how many enquiries
--    their link produced without seeing the enquirer's personal details.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW creator_attribution_summary AS
SELECT
  l.creator_id,
  l.campaign_id,
  count(*)                                                      AS leads_total,
  count(*) FILTER (WHERE l.duplicate_of IS NULL)                AS leads_unique,
  count(*) FILTER (WHERE l.pipeline_stage = 'qualified')        AS leads_qualified,
  count(*) FILTER (WHERE l.pipeline_stage = 'converted')        AS leads_converted,
  min(l.created_at)                                             AS first_lead_at,
  max(l.created_at)                                             AS last_lead_at
FROM leads l
WHERE l.creator_id IS NOT NULL
GROUP BY l.creator_id, l.campaign_id;

REVOKE ALL ON creator_attribution_summary FROM anon;
GRANT SELECT ON creator_attribution_summary TO authenticated;

COMMIT;
