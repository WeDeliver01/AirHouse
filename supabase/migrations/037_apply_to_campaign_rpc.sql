-- ============================================================================
-- 037_apply_to_campaign_rpc.sql
--
-- Creators could not apply to campaigns ("Failed to apply"). 018 re-grants
-- client privileges table by table and gives campaign_applications only
-- SELECT, UPDATE, DELETE -- no INSERT -- while the app creates applications
-- with a direct INSERT. Every application was refused with "permission
-- denied for table campaign_applications".
--
-- Rather than grant raw INSERT (which would let a creator insert their own
-- application already marked 'accepted'), applying goes through one function
-- that:
--   * only creator accounts may call, for themselves,
--   * always files the application as 'pending',
--   * gives a clear message for a duplicate or empty pitch.
-- The existing trg_application_campaign_open trigger (020) still refuses
-- campaigns that are not accepting applications.
--
-- Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_to_campaign(
  p_campaign_id UUID,
  p_pitch       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_role    TEXT;
  v_creator UUID;
  v_pitch   TEXT := btrim(COALESCE(p_pitch, ''));
  v_app     public.campaign_applications;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'creator' THEN
    RAISE EXCEPTION 'Only creator accounts can apply to campaigns' USING ERRCODE = '42501';
  END IF;

  IF v_pitch = '' THEN
    RAISE EXCEPTION 'Please write a pitch' USING ERRCODE = '22023';
  END IF;
  IF length(v_pitch) > 5000 THEN
    RAISE EXCEPTION 'Pitch is too long (5000 characters maximum)' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE id = p_campaign_id) THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002';
  END IF;

  -- The creator's marketplace row; create it if signup never did.
  SELECT id INTO v_creator FROM public.creator_profiles WHERE user_id = v_uid;
  IF v_creator IS NULL THEN
    INSERT INTO public.creator_profiles (user_id) VALUES (v_uid) ON CONFLICT DO NOTHING;
    SELECT id INTO v_creator FROM public.creator_profiles WHERE user_id = v_uid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.campaign_applications
    WHERE campaign_id = p_campaign_id AND creator_id = v_creator
  ) THEN
    RAISE EXCEPTION 'You have already applied to this campaign' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.campaign_applications (campaign_id, creator_id, pitch_message, status)
  VALUES (p_campaign_id, v_creator, v_pitch, 'pending')
  RETURNING * INTO v_app;

  RETURN to_jsonb(v_app);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_to_campaign(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_to_campaign(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_to_campaign(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
