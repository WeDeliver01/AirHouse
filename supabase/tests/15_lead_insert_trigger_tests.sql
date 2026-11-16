-- Migration 040: lead-insert triggers must not run with the visitor's rights.
--
-- Production still has update_creator_lead_stats() from
-- supabase/006_tracking_content.sql: an AFTER INSERT trigger on leads,
-- without SECURITY DEFINER, that recounts a creator's leads and updates
-- creator_profiles. Once 038 began crediting creators from referral codes it
-- fired for anonymous enquiries and failed them, since anon may not read
-- leads or update creator_profiles. This file recreates that trigger, shows
-- a referred enquiry failing, applies 040 and checks it succeeds.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION ltr_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

\echo '--- LEAD INSERT TRIGGERS (040) ---'

-- The production-shaped trigger, as 006 wrote it (no SECURITY DEFINER).
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS total_leads_generated INTEGER DEFAULT 0;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION update_creator_lead_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.creator_id IS NOT NULL THEN
    UPDATE creator_profiles
    SET total_leads_generated = (SELECT COUNT(*) FROM leads WHERE creator_id = NEW.creator_id),
        updated_at = NOW()
    WHERE user_id = NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_creator_stats_on_lead ON leads;
CREATE TRIGGER update_creator_stats_on_lead
  AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_creator_lead_stats();

INSERT INTO creator_profiles (user_id) VALUES ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (user_id) DO NOTHING;

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
DECLARE failed BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO leads (campaign_id, referral_code, lead_name, lead_email, lead_phone, status, pipeline_stage)
    VALUES ('cccccccc-0000-4000-8000-000000000001', 'CRE-PLC00001', 'Referred Before',
            'ltr-before@example.com', '0820002222', 'new', 'new');
  EXCEPTION WHEN insufficient_privilege THEN
    failed := true;
  END;
  PERFORM ltr_check('Reproduces: a referred anonymous enquiry fails in the creator-stats trigger', failed);
END $$;

RESET ROLE;

\ir ../migrations/040_lead_insert_triggers_definer.sql

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
DECLARE blocked BOOLEAN := false;
BEGIN
  INSERT INTO leads (campaign_id, referral_code, lead_name, lead_email, lead_phone, status, pipeline_stage)
  VALUES ('cccccccc-0000-4000-8000-000000000001', 'CRE-PLC00001', 'Referred After',
          'ltr-after@example.com', '0820003333', 'new', 'new');
  PERFORM ltr_check('After 040, a referred anonymous enquiry is saved', true);

  BEGIN
    PERFORM 1 FROM leads LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  PERFORM ltr_check('A visitor still cannot read leads', blocked);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_creator UUID;
  v_total INT;
BEGIN
  SELECT creator_id INTO v_creator FROM leads WHERE lead_email = 'ltr-after@example.com';
  PERFORM ltr_check('The enquiry is credited to the referring creator',
    v_creator = '22222222-2222-4222-8222-222222222222');

  SELECT total_leads_generated INTO v_total FROM creator_profiles
  WHERE user_id = '22222222-2222-4222-8222-222222222222';
  PERFORM ltr_check('The creator''s lead count is kept up to date',
    v_total = (SELECT count(*) FROM leads WHERE creator_id = '22222222-2222-4222-8222-222222222222'));

  PERFORM ltr_check('The stats function now runs as its owner',
    (SELECT prosecdef FROM pg_proc WHERE oid = 'public.update_creator_lead_stats()'::regprocedure));
END $$;

\ir ../migrations/040_lead_insert_triggers_definer.sql
DO $$ BEGIN PERFORM ltr_check('040 is safe to re-run', true); END $$;
