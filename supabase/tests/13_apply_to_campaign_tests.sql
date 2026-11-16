-- apply_to_campaign() (migration 037), exercised as a signed-in creator.
--
-- Production reported "Failed to apply": 018 grants campaign_applications
-- SELECT/UPDATE/DELETE to clients but not INSERT, and the app inserted
-- directly. This reproduces that, then checks the function.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION atc_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

-- Give the baseline table the production shape (004): creator_id points at
-- creator_profiles, one application per creator per campaign.
ALTER TABLE campaign_applications DROP CONSTRAINT IF EXISTS campaign_applications_creator_id_fkey;
DELETE FROM campaign_applications;
ALTER TABLE campaign_applications
  ADD CONSTRAINT campaign_applications_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES creator_profiles(id) ON DELETE CASCADE;
ALTER TABLE campaign_applications ADD COLUMN IF NOT EXISTS pitch_message TEXT;
DO $$ BEGIN
  ALTER TABLE campaign_applications ADD CONSTRAINT campaign_applications_unique UNIQUE (campaign_id, creator_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    ('a1a1a1a1-0000-4000-8000-0000000000a1', 'atc-creator@example.com', '{"role":"creator"}'),
    ('a2a2a2a2-0000-4000-8000-0000000000a2', 'atc-dev@example.com',     '{"role":"developer"}'),
    ('a3a3a3a3-0000-4000-8000-0000000000a3', 'atc-fresh@example.com',   '{"role":"creator"}')
  ON CONFLICT DO NOTHING;
  INSERT INTO profiles(id, email, role, full_name) VALUES
    ('a1a1a1a1-0000-4000-8000-0000000000a1', 'atc-creator@example.com', 'creator', 'Applicant'),
    ('a2a2a2a2-0000-4000-8000-0000000000a2', 'atc-dev@example.com', 'developer', 'Dev'),
    ('a3a3a3a3-0000-4000-8000-0000000000a3', 'atc-fresh@example.com', 'creator', 'Fresh')
  ON CONFLICT (id) DO NOTHING;
  UPDATE profiles SET role = 'developer' WHERE id = 'a2a2a2a2-0000-4000-8000-0000000000a2';
  INSERT INTO creator_profiles(user_id) VALUES ('a1a1a1a1-0000-4000-8000-0000000000a1') ON CONFLICT DO NOTHING;
  DELETE FROM creator_profiles WHERE user_id = 'a3a3a3a3-0000-4000-8000-0000000000a3';
  INSERT INTO campaigns(id, developer_id, title, status) VALUES
    ('c0c0c0c0-0000-4000-8000-0000000000c1', 'a2a2a2a2-0000-4000-8000-0000000000a2', 'Open one', 'open'),
    ('c0c0c0c0-0000-4000-8000-0000000000c2', 'a2a2a2a2-0000-4000-8000-0000000000a2', 'Draft one', 'draft')
  ON CONFLICT DO NOTHING;
END $$;

\echo '--- APPLY TO CAMPAIGN, AS A SIGNED-IN CREATOR ---'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-4000-8000-0000000000a1', false);

DO $$
DECLARE r JSONB; refused BOOLEAN := false; dup BOOLEAN := false; closed BOOLEAN := false; empty BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO campaign_applications (campaign_id, creator_id, status)
    SELECT 'c0c0c0c0-0000-4000-8000-0000000000c1', id, 'pending' FROM creator_profiles
    WHERE user_id = auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  PERFORM atc_check('Reproduces: a direct INSERT is refused (no INSERT grant since 018)', refused);

  r := apply_to_campaign('c0c0c0c0-0000-4000-8000-0000000000c1', '  Perfect  ');
  PERFORM atc_check('A creator can apply to an open campaign',
    r->>'campaign_id' = 'c0c0c0c0-0000-4000-8000-0000000000c1' AND r->>'pitch_message' = 'Perfect');
  PERFORM atc_check('The application is filed as pending', r->>'status' = 'pending');

  BEGIN
    PERFORM apply_to_campaign('c0c0c0c0-0000-4000-8000-0000000000c1', 'Again');
  EXCEPTION WHEN unique_violation THEN dup := true;
  END;
  PERFORM atc_check('Applying twice is refused as a duplicate', dup);

  BEGIN
    PERFORM apply_to_campaign('c0c0c0c0-0000-4000-8000-0000000000c2', 'Hi');
  EXCEPTION WHEN check_violation THEN closed := true;
  END;
  PERFORM atc_check('A campaign not accepting applications is refused', closed);

  BEGIN
    PERFORM apply_to_campaign('c0c0c0c0-0000-4000-8000-0000000000c1', '   ');
  EXCEPTION WHEN invalid_parameter_value THEN empty := true;
  END;
  PERFORM atc_check('An empty pitch is refused', empty);
END $$;

SELECT set_config('request.jwt.claim.sub', 'a3a3a3a3-0000-4000-8000-0000000000a3', false);
DO $$
DECLARE r JSONB;
BEGIN
  r := apply_to_campaign('c0c0c0c0-0000-4000-8000-0000000000c1', 'New here');
  PERFORM atc_check('A creator with no creator_profiles row can still apply', r->>'status' = 'pending');
END $$;

SELECT set_config('request.jwt.claim.sub', 'a2a2a2a2-0000-4000-8000-0000000000a2', false);
DO $$
DECLARE blocked BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM apply_to_campaign('c0c0c0c0-0000-4000-8000-0000000000c1', 'Me too');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  PERFORM atc_check('A developer cannot apply', blocked);
END $$;

RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
DECLARE blocked BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM apply_to_campaign('c0c0c0c0-0000-4000-8000-0000000000c1', 'x');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  PERFORM atc_check('Anonymous callers are refused', blocked);
END $$;
RESET ROLE;
