-- ============================================================================
-- 040_lead_insert_triggers_definer.sql
--
-- After 038, anonymous enquiries made through a creator's referral link still
-- failed ("Something went wrong"). 038 started crediting the creator, which
-- made an older AFTER INSERT trigger fire for the first time from the public
-- form: update_creator_lead_stats() (supabase/006_tracking_content.sql, and
-- an earlier version in 003). It recounts the creator's leads and updates
-- creator_profiles / campaign_assignments, but it was created without
-- SECURITY DEFINER, so it ran as the visitor. `anon` may not read leads or
-- update those tables, so the whole insert was rolled back.
--
-- Trigger functions that fire when a lead is inserted do bookkeeping on the
-- platform's behalf; they must not depend on the privileges of whoever
-- submitted the form. Make every such function in `public` SECURITY DEFINER
-- with a pinned search_path. The function bodies are unchanged.
--
-- Idempotent. Lists what it changed.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.oid::regprocedure AS fn, p.proname
    FROM pg_trigger t
    JOIN pg_proc p      ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.leads'::regclass
      AND NOT t.tgisinternal
      AND (t.tgtype & 4) <> 0          -- fires on INSERT
      AND n.nspname = 'public'
      AND NOT p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public, pg_temp', r.fn);
    RAISE NOTICE 'Lead insert trigger function % now runs as its owner', r.proname;
  END LOOP;
END $$;

-- Named explicitly as well, in case it exists but is not (yet) attached here.
DO $$
BEGIN
  IF to_regprocedure('public.update_creator_lead_stats()') IS NOT NULL THEN
    ALTER FUNCTION public.update_creator_lead_stats()
      SECURITY DEFINER SET search_path = public, pg_temp;
  END IF;
END $$;

-- Trigger functions are not callable as RPCs, but keep them off the API.
DO $$
BEGIN
  IF to_regprocedure('public.update_creator_lead_stats()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.update_creator_lead_stats() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

COMMIT;
