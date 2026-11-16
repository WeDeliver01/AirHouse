-- Migration 035: the super-admin link trigger.
--
-- Production reported, when a creator saved their profile:
--   insert or update on table "super_admins" violates foreign key
--   constraint "super_admins_user_id_fkey"
-- 008's BEFORE INSERT trigger on profiles wrote super_admins.user_id = NEW.id
-- before the profiles row existed. This file reproduces that with the 008
-- trigger as written, applies 035, and checks the account can now be saved.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION sal_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

-- Give super_admins the production (008) shape and install 008's trigger.
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION check_super_admin_status()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM super_admins WHERE email = NEW.email AND is_active = TRUE) THEN
    NEW.role := 'admin';
    NEW.is_super_admin := TRUE;
    UPDATE super_admins SET user_id = NEW.id, updated_at = NOW()
    WHERE email = NEW.email AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_super_admin ON profiles;
CREATE TRIGGER trigger_check_super_admin
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION check_super_admin_status();

INSERT INTO super_admins (email, is_active) VALUES
  ('sal-owner@example.com', TRUE), ('sal-later@example.com', TRUE)
ON CONFLICT (email) DO NOTHING;

\echo '--- 008 TRIGGER, AS DEPLOYED ---'
DO $$
DECLARE failed BOOLEAN := false;
BEGIN
  -- Signup: handle_new_user() swallows the failure, leaving no profile.
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    ('f0f0f0f0-6666-4666-8666-666666666666', 'sal-owner@example.com', '{"role":"creator","full_name":"Owner"}')
  ON CONFLICT DO NOTHING;
  DELETE FROM profiles WHERE id = 'f0f0f0f0-6666-4666-8666-666666666666';

  BEGIN
    INSERT INTO profiles (id, email, role, full_name)
    VALUES ('f0f0f0f0-6666-4666-8666-666666666666', 'sal-owner@example.com', 'creator', 'Owner');
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  PERFORM sal_check('Reproduces: 008 trigger breaks profile creation with super_admins_user_id_fkey', failed);
END $$;

-- A second broken account, for 035's repair step.
INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('f1f1f1f1-7777-4777-8777-777777777777', 'sal-later@example.com', '{"role":"creator"}')
ON CONFLICT DO NOTHING;
DELETE FROM profiles WHERE id = 'f1f1f1f1-7777-4777-8777-777777777777';

\echo '--- APPLYING 035 ---'
\ir ../migrations/035_fix_super_admin_link_trigger.sql

\echo '--- AFTER 035 ---'
DO $$
BEGIN
  PERFORM sal_check('035 repairs accounts the trigger left without a profile',
    EXISTS (SELECT 1 FROM profiles WHERE id = 'f1f1f1f1-7777-4777-8777-777777777777' AND role = 'admin')
    AND EXISTS (SELECT 1 FROM wallets WHERE user_id = 'f1f1f1f1-7777-4777-8777-777777777777'));
  PERFORM sal_check('and links their super_admins row',
    (SELECT user_id FROM super_admins WHERE email = 'sal-later@example.com') = 'f1f1f1f1-7777-4777-8777-777777777777');
END $$;

-- The owner account: remove the repaired row again so save_my_profile has to
-- provision it, exactly as on production.
DELETE FROM wallets WHERE user_id = 'f0f0f0f0-6666-4666-8666-666666666666';
DELETE FROM creator_profiles WHERE user_id = 'f0f0f0f0-6666-4666-8666-666666666666';
UPDATE super_admins SET user_id = NULL WHERE email = 'sal-owner@example.com';
DELETE FROM profiles WHERE id = 'f0f0f0f0-6666-4666-8666-666666666666';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0f0f0f0-6666-4666-8666-666666666666', false);

DO $$
DECLARE r JSONB;
BEGIN
  r := save_my_profile(
    '{"full_name":"Owner","bio":"Hi"}',
    '{"rate_card":{"instagram_reel":"7000","tiktok_video":"11000"},"location":"Johannesburg"}'
  );
  PERFORM sal_check('A super-admin email with no profile can now save',
    r->'profile'->>'id' = 'f0f0f0f0-6666-4666-8666-666666666666' AND r->'profile'->>'bio' = 'Hi');
  PERFORM sal_check('Their creator details are saved',
    r->'creator_profile'->'rate_card'->>'tiktok_video' = '11000'
    AND r->'creator_profile'->>'location' = 'Johannesburg');
END $$;

RESET ROLE;
DO $$
BEGIN
  PERFORM sal_check('The super_admins row is linked after the profile exists',
    (SELECT user_id FROM super_admins WHERE email = 'sal-owner@example.com') = 'f0f0f0f0-6666-4666-8666-666666666666');
  PERFORM sal_check('A wallet is provisioned for the repaired account',
    EXISTS (SELECT 1 FROM wallets WHERE user_id = 'f0f0f0f0-6666-4666-8666-666666666666' AND wallet_type = 'creator'));
END $$;

-- Re-running 035 is harmless.
\ir ../migrations/035_fix_super_admin_link_trigger.sql
DO $$ BEGIN PERFORM sal_check('035 is safe to re-run', true); END $$;
