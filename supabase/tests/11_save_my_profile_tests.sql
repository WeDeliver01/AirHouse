-- save_my_profile() (migration 034), exercised as a signed-in browser user.
--
-- The profile editor reported "Cannot coerce the result to a single JSON
-- object" because a write expecting one row touched none. These tests cover
-- the cases that produced it: a normal save, an account with no profiles row,
-- an account with no creator_profiles row, and the guarantees that the
-- function never writes privileged columns or anyone else's row.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION smp_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

-- The baseline keeps creator_profiles minimal; give it the columns the live
-- table has (migration 004) so the function is exercised against them.
ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_handle TEXT,
  ADD COLUMN IF NOT EXISTS youtube_handle TEXT,
  ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS niche TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS portfolio_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rate_card JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location TEXT;

DO $$
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    ('cccccccc-3333-4333-8333-333333333333', 'smp-carol@example.com', '{"full_name":"Carol"}'),
    ('dddddddd-4444-4444-8444-444444444444', 'smp-dan@example.com',   '{"full_name":"Dan"}'),
    ('eeeeeeee-5555-4555-8555-555555555555', 'smp-eve@example.com',   '{"role":"developer"}')
  ON CONFLICT DO NOTHING;
  -- Carol has a profile but no creator_profiles row; Dan has neither.
  INSERT INTO profiles(id, email, role, full_name) VALUES
    ('cccccccc-3333-4333-8333-333333333333', 'smp-carol@example.com', 'creator', 'Carol'),
    ('eeeeeeee-5555-4555-8555-555555555555', 'smp-eve@example.com', 'developer', 'Eve')
  ON CONFLICT (id) DO NOTHING;
  DELETE FROM creator_profiles WHERE user_id = 'cccccccc-3333-4333-8333-333333333333';
  DELETE FROM profiles WHERE id = 'dddddddd-4444-4444-8444-444444444444';
END $$;

\echo '--- SAVE_MY_PROFILE, AS A SIGNED-IN CREATOR ---'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-3333-4333-8333-333333333333', false);

DO $$
DECLARE r JSONB;
BEGIN
  r := save_my_profile(
    '{"full_name":"Carol K","bio":"Tours","phone":"0820000000","role":"admin","is_verified":true}',
    '{"instagram_handle":"@carol","follower_count":12000,"niche":["Luxury","Lifestyle"],
      "portfolio_urls":["https://example.com/a"],"location":"Cape Town",
      "rate_card":{"instagram_reel":"7000","tiktok_video":"11000"}}'
  );
  PERFORM smp_check('Saves profile fields', r->'profile'->>'full_name' = 'Carol K' AND r->'profile'->>'bio' = 'Tours');
  PERFORM smp_check('Ignores role / is_verified in the payload',
    r->'profile'->>'role' = 'creator' AND COALESCE((r->'profile'->>'is_verified')::boolean, false) = false);
  PERFORM smp_check('Creates the missing creator_profiles row and saves it',
    r->'creator_profile'->>'instagram_handle' = '@carol'
    AND (r->'creator_profile'->>'follower_count')::int = 12000
    AND r->'creator_profile'->'rate_card'->>'tiktok_video' = '11000'
    AND r->'creator_profile'->'niche' = '["Luxury","Lifestyle"]'::jsonb);

  -- Second save: absent keys are left alone, empty handle cleared.
  r := save_my_profile('{"bio":"Updated"}', '{"instagram_handle":"","follower_count":null}');
  PERFORM smp_check('Leaves absent fields unchanged', r->'profile'->>'full_name' = 'Carol K');
  PERFORM smp_check('Clears blanked fields',
    r->'creator_profile'->>'instagram_handle' IS NULL
    AND r->'creator_profile'->>'follower_count' IS NULL
    AND r->'creator_profile'->>'location' = 'Cape Town');

  r := save_my_profile('{"full_name":"   "}', NULL);
  PERFORM smp_check('A blank full_name keeps the current name', r->'profile'->>'full_name' = 'Carol K');
END $$;

\echo '--- SAVE_MY_PROFILE, ACCOUNT WITH NO PROFILES ROW ---'
SELECT set_config('request.jwt.claim.sub', 'dddddddd-4444-4444-8444-444444444444', false);

DO $$
DECLARE r JSONB;
BEGIN
  r := save_my_profile('{"bio":"New here"}', '{"location":"Durban"}');
  PERFORM smp_check('Provisions a missing profiles row as a creator',
    r->'profile'->>'id' = 'dddddddd-4444-4444-8444-444444444444'
    AND r->'profile'->>'role' = 'creator'
    AND r->'profile'->>'full_name' = 'Dan'
    AND r->'profile'->>'email' = 'smp-dan@example.com');
  PERFORM smp_check('Provisions and fills the creator row', r->'creator_profile'->>'location' = 'Durban');
END $$;

\echo '--- SAVE_MY_PROFILE, BOUNDARIES ---'
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-5555-4555-8555-555555555555', false);

DO $$
DECLARE r JSONB; blocked BOOLEAN := false;
BEGIN
  r := save_my_profile('{"company_name":"Eve Dev Co"}', NULL);
  PERFORM smp_check('A developer can save their own profile', r->'profile'->>'company_name' = 'Eve Dev Co');
  BEGIN
    PERFORM save_my_profile('{}', '{"location":"x"}');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  PERFORM smp_check('A developer cannot create a creator profile', blocked);
END $$;

RESET ROLE;
DO $$
BEGIN
  PERFORM smp_check('No other account was touched',
    (SELECT company_name IS NULL AND bio = 'Updated' FROM profiles
      WHERE id = 'cccccccc-3333-4333-8333-333333333333')
    AND NOT EXISTS (SELECT 1 FROM creator_profiles WHERE user_id = 'eeeeeeee-5555-4555-8555-555555555555'));
END $$;

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
DECLARE blocked BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM save_my_profile('{"bio":"x"}', NULL);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  PERFORM smp_check('Anonymous callers are refused', blocked);
END $$;
RESET ROLE;
