-- ============================================================================
-- 038_public_lead_capture_repair.sql
--
-- Public lead links (/lead/:campaignId) were broken for every anonymous
-- visitor: the page showed "Failed to load campaign details" and, where it
-- did load, submitting failed. Both came back from Supabase as
--
--     permission denied for table profiles
--
-- Cause: migration 018 revoked every table privilege from `anon`, including
-- the safe-column SELECT grant on `profiles` that 011 had set up. But older
-- policies on campaigns / leads / properties are still attached to the
-- PUBLIC role (so they are evaluated for anon too) and look up `profiles` to
-- decide whether the caller is an admin, e.g.
--
--     USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
--
-- PostgreSQL checks privileges on every table a policy references, even when
-- another policy would already allow the row, so anon's missing privilege
-- on profiles failed the whole query: reading a campaign, and inserting a
-- lead.
--
-- Fix, in four parts, all idempotent:
--   1. Policies that only make sense for a signed-in user (they reference
--      auth.uid(), which is NULL for anon) are attached to `authenticated`
--      instead of PUBLIC. Anon keeps its explicit policies from 018/028/031.
--   2. Anon gets back the safe-column SELECT on profiles (as in 011), plus a
--      policy letting it see the developer behind a live campaign or listing,
--      which the lead page shows ("A representative from X will contact you").
--   3. Referral attribution is resolved inside the database. Anon cannot
--      read campaign_assignments or creator_tracking_links, so the browser
--      lookup always came back empty and creators were never credited.
--   4. resolve_referral_campaign(code) backs the short link /r/:code.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Signed-in-only policies stop applying to anon.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('campaigns', 'leads', 'properties', 'profiles')
      AND roles = ARRAY['public']::name[]
      AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%auth.uid()%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
    RAISE NOTICE 'Policy "%" on % now applies to authenticated only', r.policyname, r.tablename;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Public display of developer names.
-- ----------------------------------------------------------------------------

-- Same safe columns as migration 011; phone, email and anything sensitive stay
-- out. Only columns this database actually has are granted.
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name IN ('id', 'role', 'full_name', 'avatar_url', 'company_name',
                        'bio', 'is_verified', 'created_at', 'updated_at');

  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon', v_cols);
  END IF;
END $$;

DO $$
DECLARE
  v_using TEXT := $u$
    role::text = 'developer'
    AND (
      id IN (SELECT developer_id FROM public.campaigns WHERE status::text IN ('open', 'invited', 'active'))
  $u$;
BEGIN
  IF to_regclass('public.properties') IS NOT NULL THEN
    v_using := v_using || $u$
      OR id IN (SELECT developer_id FROM public.properties WHERE status::text = 'active')
    $u$;
  END IF;
  v_using := v_using || ')';

  EXECUTE 'DROP POLICY IF EXISTS "Public can view developers with live listings" ON public.profiles';
  EXECUTE format(
    'CREATE POLICY "Public can view developers with live listings" ON public.profiles
       FOR SELECT TO anon USING (%s)', v_using);
END $$;

-- ----------------------------------------------------------------------------
-- 3. Referral attribution, resolved server-side.
--
--    A referral code is either a creator_tracking_links token or a
--    campaign_assignments.creator_referral_code (the CRE-XXXXXXXX codes).
--    Column names differ between schema lineages, so look them up rather
--    than assume them.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_referral_creator(p_campaign_id UUID, p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creator UUID;
  v_col     TEXT;
BEGIN
  IF p_campaign_id IS NULL OR p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.creator_tracking_links') IS NOT NULL THEN
    FOREACH v_col IN ARRAY ARRAY['token', 'tracking_code'] LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'creator_tracking_links'
                   AND column_name = v_col) THEN
        EXECUTE format(
          'SELECT creator_id FROM creator_tracking_links WHERE %I = $1 AND campaign_id = $2 LIMIT 1',
          v_col)
        INTO v_creator USING p_code, p_campaign_id;
        IF v_creator IS NOT NULL THEN RETURN v_creator; END IF;
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'campaign_assignments'
               AND column_name = 'creator_referral_code') THEN
    EXECUTE
      'SELECT creator_id FROM campaign_assignments
        WHERE creator_referral_code = $1 AND campaign_id = $2 LIMIT 1'
    INTO v_creator USING p_code, p_campaign_id;
  END IF;

  RETURN v_creator;
END;
$$;

REVOKE ALL ON FUNCTION resolve_referral_creator(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Fills in creator_id from the referral code when the browser could not.
-- Named to sort before trg_validate_lead (triggers fire in name order), so
-- validate_lead() still verifies the creator is assigned to the campaign.
CREATE OR REPLACE FUNCTION attribute_lead_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row  JSONB := to_jsonb(NEW);
  v_code TEXT;
BEGIN
  IF NEW.creator_id IS NOT NULL OR NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- tracking_token (029) or tracking_code (older lineage), then referral_code.
  v_code := COALESCE(
    NULLIF(v_row->>'tracking_token', ''),
    NULLIF(v_row->>'tracking_code', ''),
    NULLIF(v_row->>'referral_code', '')
  );

  NEW.creator_id := resolve_referral_creator(NEW.campaign_id, v_code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attribute_lead_referral ON leads;
CREATE TRIGGER trg_attribute_lead_referral
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION attribute_lead_referral();

-- ----------------------------------------------------------------------------
-- 4. Short referral links: /r/:code -> the campaign it belongs to.
--    Only live campaigns resolve; anything else returns NULL.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_referral_campaign(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign UUID;
  v_col      TEXT;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 OR length(p_code) > 100 THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'campaign_assignments'
               AND column_name = 'creator_referral_code') THEN
    EXECUTE
      'SELECT campaign_id FROM campaign_assignments WHERE creator_referral_code = $1 LIMIT 1'
    INTO v_campaign USING p_code;
  END IF;

  IF v_campaign IS NULL AND to_regclass('public.creator_tracking_links') IS NOT NULL THEN
    FOREACH v_col IN ARRAY ARRAY['token', 'tracking_code'] LOOP
      EXIT WHEN v_campaign IS NOT NULL;
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'creator_tracking_links'
                   AND column_name = v_col) THEN
        EXECUTE format('SELECT campaign_id FROM creator_tracking_links WHERE %I = $1 LIMIT 1', v_col)
        INTO v_campaign USING p_code;
      END IF;
    END LOOP;
  END IF;

  IF v_campaign IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT id FROM campaigns
    WHERE id = v_campaign AND status::text IN ('open', 'invited', 'active')
  );
END;
$$;

REVOKE ALL ON FUNCTION resolve_referral_campaign(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_referral_campaign(TEXT) TO anon, authenticated;

COMMIT;
