-- Migration 038: public lead links, as an anonymous visitor.
--
-- In production every anonymous visit to /lead/:campaignId failed with
-- "permission denied for table profiles": 018 revoked anon's privileges on
-- profiles while PUBLIC-role admin policies on campaigns and leads still
-- looked profiles up. This file recreates those policies, shows the failure,
-- applies 038, and checks a visitor can load the campaign, see the developer's
-- name, submit an enquiry (credited to the referring creator), and resolve a
-- short /r/:code link -- without gaining any read access to leads.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION plc_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

\echo '--- PUBLIC LEAD CAPTURE (038) ---'

-- The production-shaped policies: attached to PUBLIC, looking up profiles.
DROP POLICY IF EXISTS "Admins can manage all campaigns" ON campaigns;
CREATE POLICY "Admins can manage all campaigns" ON campaigns FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Admins can manage all leads" ON leads;
CREATE POLICY "Admins can manage all leads" ON leads FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- A creator's referral code on the live seed campaign, and one on a draft.
UPDATE campaign_assignments SET creator_referral_code = 'CRE-PLC00001'
WHERE campaign_id = 'cccccccc-0000-4000-8000-000000000001'
  AND creator_id = '22222222-2222-4222-8222-222222222222';
-- That campaign is no longer live (the lifecycle tests archive it), and its
-- trigger rightly refuses new assignments, so place this fixture directly.
SET session_replication_role = replica;
INSERT INTO campaign_assignments (campaign_id, creator_id, creator_referral_code)
VALUES ('cccccccc-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'CRE-PLCDRAFT');
SET session_replication_role = DEFAULT;

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
DECLARE failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM 1 FROM campaigns WHERE id = 'cccccccc-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    failed := true;
  END;
  PERFORM plc_check('Reproduces: anon reading a campaign fails with permission denied for profiles', failed);
END $$;

RESET ROLE;

\ir ../migrations/038_public_lead_capture_repair.sql

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
DECLARE
  n INT;
  v_name TEXT;
  blocked BOOLEAN;
BEGIN
  SELECT count(*) INTO n FROM campaigns WHERE id = 'cccccccc-0000-4000-8000-000000000001';
  PERFORM plc_check('After 038, a visitor can load a live campaign', n = 1);

  SELECT count(*) INTO n FROM campaigns WHERE id = 'cccccccc-0000-4000-8000-000000000002';
  PERFORM plc_check('A campaign that is not live stays hidden from visitors', n = 0);

  SELECT full_name INTO v_name FROM profiles WHERE id = '11111111-1111-4111-8111-111111111111';
  PERFORM plc_check('A visitor can see the name of the developer behind a live campaign', v_name = 'Dev One');

  SELECT count(*) INTO n FROM profiles WHERE id = '55555555-5555-4555-8555-555555555555';
  PERFORM plc_check('A developer with nothing live is not exposed', n = 0);

  SELECT count(*) INTO n FROM profiles WHERE id = '44444444-4444-4444-8444-444444444444';
  PERFORM plc_check('Admin profiles are not exposed', n = 0);

  blocked := false;
  BEGIN
    PERFORM email FROM profiles WHERE id = '11111111-1111-4111-8111-111111111111';
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  PERFORM plc_check('A visitor still cannot read a developer''s email', blocked);

  INSERT INTO leads (campaign_id, referral_code, lead_name, lead_email, lead_phone, status, pipeline_stage)
  VALUES ('cccccccc-0000-4000-8000-000000000001', 'CRE-PLC00001', 'Public Visitor',
          'plc-visitor@example.com', '0820001111', 'new', 'new');
  PERFORM plc_check('A visitor can submit an enquiry on a live campaign', true);

  blocked := false;
  BEGIN
    PERFORM 1 FROM leads LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  PERFORM plc_check('A visitor still cannot read leads back', blocked);

  PERFORM plc_check('A short link code resolves to its live campaign',
    resolve_referral_campaign('CRE-PLC00001') = 'cccccccc-0000-4000-8000-000000000001');
  PERFORM plc_check('A short link to a campaign that is not live does not resolve',
    resolve_referral_campaign('CRE-PLCDRAFT') IS NULL);
  PERFORM plc_check('An unknown short link does not resolve',
    resolve_referral_campaign('CRE-NOPE') IS NULL);
END $$;

RESET ROLE;

DO $$
DECLARE v_creator UUID;
BEGIN
  SELECT creator_id INTO v_creator FROM leads WHERE lead_email = 'plc-visitor@example.com';
  PERFORM plc_check('The enquiry is credited to the creator whose code was used',
    v_creator = '22222222-2222-4222-8222-222222222222');
END $$;

-- Signed-in admins keep their access through the re-scoped policy.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM campaigns WHERE id = 'cccccccc-0000-4000-8000-000000000002';
  PERFORM plc_check('A signed-in admin still sees campaigns that are not live', n = 1);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

\ir ../migrations/038_public_lead_capture_repair.sql
DO $$ BEGIN PERFORM plc_check('038 is safe to re-run', true); END $$;
