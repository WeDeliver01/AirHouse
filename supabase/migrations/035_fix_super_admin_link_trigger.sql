-- ============================================================================
-- 035_fix_super_admin_link_trigger.sql
--
-- Saving a creator profile failed with
--
--   insert or update on table "super_admins" violates foreign key constraint
--   "super_admins_user_id_fkey"
--
-- check_super_admin_status() (migration 008) is a BEFORE INSERT OR UPDATE
-- trigger on profiles. For an email listed in super_admins it ran
--
--   UPDATE super_admins SET user_id = NEW.id WHERE email = NEW.email ...
--
-- super_admins.user_id references profiles(id), and in a BEFORE INSERT
-- trigger that profiles row does not exist yet -- so the FK check fails and
-- the whole INSERT is rolled back. Consequences:
--
--   * At signup, handle_new_user() swallowed the error (it never blocks
--     account creation), so any account whose email is on the super_admins
--     list was left with NO profiles row, wallet or creator_profiles row.
--     That is the original "Cannot coerce the result to a single JSON
--     object" on /creator/profile.
--   * Every later attempt to create the missing row (033's backfill,
--     save_my_profile() from 034, the client fallback) hits the same trigger.
--
-- Fix: the BEFORE trigger only sets role / is_super_admin on the row being
-- written; linking super_admins.user_id moves to an AFTER trigger, when the
-- profiles row exists. Then repair the accounts the bug left behind.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. BEFORE trigger: decide role on the row itself. No writes elsewhere.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_super_admin_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE email = NEW.email AND is_active = TRUE
  ) THEN
    NEW.role := 'admin';
    NEW.is_super_admin := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. AFTER trigger: link the super_admins row once the profile exists.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_super_admin_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.super_admins
  SET user_id = NEW.id
  WHERE email = NEW.email
    AND user_id IS NULL;
  RETURN NULL;
END;
$$;

-- Only attach where super_admins has the email column (the 008 shape, which
-- is what production has). Lineages without it never had the 008 trigger.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'super_admins' AND column_name = 'email'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_link_super_admin ON public.profiles;
    CREATE TRIGGER trigger_link_super_admin
      AFTER INSERT OR UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.link_super_admin_user();

    -- Make sure the BEFORE trigger exists and points at the fixed function.
    DROP TRIGGER IF EXISTS trigger_check_super_admin ON public.profiles;
    CREATE TRIGGER trigger_check_super_admin
      BEFORE INSERT OR UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.check_super_admin_status();
  ELSE
    RAISE NOTICE '035: super_admins has no email column; super-admin link triggers not attached';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. save_my_profile(): supersedes 034.
--    * A super admin may keep creator details of their own (they are routed
--      to the admin dashboard, but the save must not fail).
--    * Provisioning a missing profile also provisions the wallet that
--      handle_new_user() would have created.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_my_profile(
  p_profile JSONB DEFAULT '{}'::jsonb,
  p_creator JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_email   TEXT;
  v_meta    JSONB;
  v_signup  TEXT;
  v_profile public.profiles;
  v_creator public.creator_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  p_profile := COALESCE(p_profile, '{}'::jsonb);
  IF jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'p_profile must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_creator IS NOT NULL AND jsonb_typeof(p_creator) <> 'object' THEN
    RAISE EXCEPTION 'p_creator must be a JSON object' USING ERRCODE = '22023';
  END IF;

  -- 1. Provision what signup failed to create.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    SELECT u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      INTO v_email, v_meta
    FROM auth.users u
    WHERE u.id = v_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
    END IF;

    v_signup := CASE WHEN v_meta->>'role' = 'developer' THEN 'developer' ELSE 'creator' END;

    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (
      v_uid,
      v_email,
      v_signup::user_role,
      COALESCE(
        NULLIF(btrim(p_profile->>'full_name'), ''),
        NULLIF(btrim(v_meta->>'full_name'), ''),
        split_part(v_email, '@', 1)
      )
    )
    ON CONFLICT DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM public.wallets
      WHERE user_id = v_uid AND wallet_type = v_signup::wallet_type
    ) THEN
      INSERT INTO public.wallets (user_id, wallet_type)
      VALUES (v_uid, v_signup::wallet_type)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- 2. Self-service profile fields only. Absent keys are left alone;
  --    full_name is NOT NULL, so a blank one keeps the current value.
  UPDATE public.profiles SET
    full_name    = CASE WHEN NULLIF(btrim(p_profile->>'full_name'), '') IS NOT NULL
                        THEN btrim(p_profile->>'full_name') ELSE full_name END,
    bio          = CASE WHEN p_profile ? 'bio'          THEN p_profile->>'bio'          ELSE bio END,
    phone        = CASE WHEN p_profile ? 'phone'        THEN p_profile->>'phone'        ELSE phone END,
    company_name = CASE WHEN p_profile ? 'company_name' THEN p_profile->>'company_name' ELSE company_name END
  WHERE id = v_uid
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile could not be saved' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Creator details: creators, and super admins for their own account.
  IF p_creator IS NOT NULL THEN
    IF v_profile.role::text NOT IN ('creator', 'admin') THEN
      RAISE EXCEPTION 'Only creator accounts have a creator profile' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.creator_profiles (user_id) VALUES (v_uid)
    ON CONFLICT DO NOTHING;

    UPDATE public.creator_profiles SET
      instagram_handle = CASE WHEN p_creator ? 'instagram_handle'
                              THEN NULLIF(btrim(p_creator->>'instagram_handle'), '') ELSE instagram_handle END,
      tiktok_handle    = CASE WHEN p_creator ? 'tiktok_handle'
                              THEN NULLIF(btrim(p_creator->>'tiktok_handle'), '') ELSE tiktok_handle END,
      youtube_handle   = CASE WHEN p_creator ? 'youtube_handle'
                              THEN NULLIF(btrim(p_creator->>'youtube_handle'), '') ELSE youtube_handle END,
      location         = CASE WHEN p_creator ? 'location'
                              THEN NULLIF(btrim(p_creator->>'location'), '') ELSE location END,
      follower_count   = CASE
                           WHEN NOT (p_creator ? 'follower_count') THEN follower_count
                           WHEN jsonb_typeof(p_creator->'follower_count') = 'number'
                             THEN GREATEST(0, LEAST(2147483647, floor((p_creator->>'follower_count')::numeric)))::int
                           WHEN jsonb_typeof(p_creator->'follower_count') = 'string'
                                AND btrim(p_creator->>'follower_count') ~ '^[0-9]{1,10}$'
                             THEN LEAST(2147483647, btrim(p_creator->>'follower_count')::bigint)::int
                           ELSE NULL
                         END,
      niche            = CASE WHEN jsonb_typeof(p_creator->'niche') = 'array'
                              THEN ARRAY(SELECT jsonb_array_elements_text(p_creator->'niche'))
                              ELSE niche END,
      portfolio_urls   = CASE WHEN jsonb_typeof(p_creator->'portfolio_urls') = 'array'
                              THEN ARRAY(SELECT jsonb_array_elements_text(p_creator->'portfolio_urls'))
                              ELSE portfolio_urls END,
      rate_card        = CASE WHEN jsonb_typeof(p_creator->'rate_card') = 'object'
                              THEN p_creator->'rate_card' ELSE rate_card END
    WHERE user_id = v_uid
    RETURNING * INTO v_creator;
  ELSE
    SELECT * INTO v_creator FROM public.creator_profiles WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'profile',         to_jsonb(v_profile),
    'creator_profile', to_jsonb(v_creator)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_profile(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_my_profile(JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_my_profile(JSONB, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Repair accounts the trigger left without a profile (what 033 tried to
--    do, and could not while the trigger was broken). One account at a time,
--    so a single bad row cannot block the rest.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r        RECORD;
  v_signup TEXT;
  v_fixed  INT := 0;
BEGIN
  FOR r IN
    SELECT u.id, u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb) AS meta
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    BEGIN
      v_signup := CASE WHEN r.meta->>'role' = 'developer' THEN 'developer' ELSE 'creator' END;

      INSERT INTO public.profiles (id, email, role, full_name)
      VALUES (
        r.id, r.email, v_signup::user_role,
        COALESCE(NULLIF(btrim(r.meta->>'full_name'), ''), split_part(r.email, '@', 1), 'User')
      )
      ON CONFLICT DO NOTHING;

      IF NOT EXISTS (
        SELECT 1 FROM public.wallets WHERE user_id = r.id AND wallet_type = v_signup::wallet_type
      ) THEN
        INSERT INTO public.wallets (user_id, wallet_type) VALUES (r.id, v_signup::wallet_type)
        ON CONFLICT DO NOTHING;
      END IF;

      IF v_signup = 'creator' THEN
        INSERT INTO public.creator_profiles (user_id) VALUES (r.id) ON CONFLICT DO NOTHING;
      END IF;

      v_fixed := v_fixed + 1;
      RAISE NOTICE '035: provisioned missing profile for %', r.email;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '035: could not provision profile for % (%): %', r.email, r.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '035: % account(s) repaired', v_fixed;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
