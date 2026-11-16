-- ============================================================================
-- 034_save_my_profile_rpc.sql
--
-- Creators still hit "Cannot coerce the result to a single JSON object" when
-- saving /creator/profile. PostgREST raises that whenever a write that asks
-- for a single row back affects zero rows. For `profiles` and
-- `creator_profiles` that happens when the row is missing (handle_new_user()
-- swallows its own failures, see 033) OR when the row exists but the live
-- policies/grants on the table do not let the owner update it -- the live
-- database has drifted from this repository more than once (see 026).
--
-- Rather than depend on the exact policy state of two tables, saving your own
-- profile goes through one SECURITY DEFINER function that:
--   * only ever touches the caller's own rows (auth.uid()),
--   * only writes the self-service columns the profile editor exposes
--     (never role, email, is_verified, is_super_admin, verification_*),
--   * provisions the profiles / creator_profiles row if it is missing.
--
-- Safe to re-run.
-- ============================================================================

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

  -- 1. Provision the profiles row if signup never created it (mirrors 033).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    SELECT u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      INTO v_email, v_meta
    FROM auth.users u
    WHERE u.id = v_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (
      v_uid,
      v_email,
      CASE WHEN v_meta->>'role' = 'developer' THEN 'developer' ELSE 'creator' END::user_role,
      COALESCE(
        NULLIF(btrim(p_profile->>'full_name'), ''),
        NULLIF(btrim(v_meta->>'full_name'), ''),
        split_part(v_email, '@', 1)
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- 2. Self-service profile fields only. A key that is absent is left alone;
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

  -- 3. Creator details, for creators only.
  IF p_creator IS NOT NULL THEN
    IF v_profile.role <> 'creator' THEN
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

-- Make the new function visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
