-- Migration 041: a creator's lead counters follow their credited leads.
--
-- In production an enquiry through a creator's referral link was saved and
-- credited, yet the creator's Active Campaigns page still said "0 Leads
-- Generated": campaign_assignments.leads_generated was only bumped when a
-- lead carried an assignment_id, which the public form never sets. This file
-- checks 041 backfills an earlier, uncredited enquiry, recounts, and keeps
-- both counters right for new enquiries without counting duplicates.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION clc_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

\echo '--- CREATOR LEAD COUNTS (041) ---'

ALTER TABLE campaign_assignments ADD COLUMN IF NOT EXISTS leads_generated INTEGER DEFAULT 0;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS total_leads_generated INTEGER DEFAULT 0;

-- An enquiry from before 038: referral code stored, creator never resolved.
-- Inserted with triggers off so today's attribution trigger cannot fix it.
SET session_replication_role = replica;
INSERT INTO leads (campaign_id, referral_code, lead_name, lead_email, lead_phone, status, pipeline_stage, created_at)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'CRE-PLC00001', 'Old Uncredited',
        'clc-old@example.com', '0820004444', 'new', 'new', NOW() - INTERVAL '3 days');
SET session_replication_role = DEFAULT;

-- Counters start wrong, as in production.
UPDATE campaign_assignments SET leads_generated = 0;
UPDATE creator_profiles SET total_leads_generated = 0;

\ir ../migrations/041_creator_lead_counts.sql

CREATE OR REPLACE FUNCTION clc_expected() RETURNS INT LANGUAGE sql AS $$
  SELECT count(*)::int FROM leads
  WHERE campaign_id = 'cccccccc-0000-4000-8000-000000000001'
    AND creator_id = '22222222-2222-4222-8222-222222222222'
    AND duplicate_of IS NULL
$$;

CREATE OR REPLACE FUNCTION clc_assignment() RETURNS INT LANGUAGE sql AS $$
  SELECT leads_generated FROM campaign_assignments
  WHERE campaign_id = 'cccccccc-0000-4000-8000-000000000001'
    AND creator_id = '22222222-2222-4222-8222-222222222222'
$$;

DO $$
DECLARE v_creator UUID; v_before INT;
BEGIN
  SELECT creator_id INTO v_creator FROM leads WHERE lead_email = 'clc-old@example.com';
  PERFORM clc_check('041 credits an earlier enquiry from its stored referral code',
    v_creator = '22222222-2222-4222-8222-222222222222');

  PERFORM clc_check('The per-campaign count is recounted from credited leads',
    clc_assignment() = clc_expected() AND clc_expected() >= 1);

  PERFORM clc_check('The creator''s total is recounted too',
    (SELECT total_leads_generated FROM creator_profiles
      WHERE user_id = '22222222-2222-4222-8222-222222222222') = clc_expected());
END $$;

CREATE TEMP TABLE clc_before AS SELECT clc_assignment() AS n;
GRANT SELECT ON clc_before TO anon;

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO leads (campaign_id, tracking_code, lead_name, lead_email, lead_phone, status, pipeline_stage)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'CRE-PLC00001', 'New Referred',
        'clc-new@example.com', '0820005555', 'new', 'new');
-- Same person again within the duplicate window: kept, flagged, not counted.
INSERT INTO leads (campaign_id, tracking_code, lead_name, lead_email, lead_phone, status, pipeline_stage)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'CRE-PLC00001', 'New Referred',
        'clc-new@example.com', '0820005555', 'new', 'new');
RESET ROLE;

DO $$
BEGIN
  PERFORM clc_check('A new referred enquiry from a visitor raises the creator''s count by one',
    clc_assignment() = (SELECT n FROM clc_before) + 1);
  PERFORM clc_check('A duplicate enquiry is not counted twice', clc_assignment() = clc_expected());
END $$;

-- Moving a lead off the creator lowers the count again.
UPDATE leads SET creator_id = NULL WHERE lead_email = 'clc-old@example.com';
DO $$
BEGIN
  PERFORM clc_check('Un-crediting a lead lowers the count', clc_assignment() = (SELECT n FROM clc_before));
END $$;

\ir ../migrations/041_creator_lead_counts.sql
DO $$ BEGIN PERFORM clc_check('041 is safe to re-run', clc_assignment() = clc_expected()); END $$;
