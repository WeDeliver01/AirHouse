-- ============================================================================
-- 041_creator_lead_counts.sql
--
-- With 038/040 live, an enquiry through a creator's referral link is saved
-- and credited (leads.creator_id), but the creator still saw "0 Leads
-- Generated". Their pages read two counters that nothing keeps right:
--
--   campaign_assignments.leads_generated     (per campaign: Active Campaigns)
--   creator_profiles.total_leads_generated   (overall: Dashboard, Scorecard)
--
-- The old trigger (003) only bumped the per-campaign counter when the lead
-- carried an assignment_id, which the public form never sets; the 006
-- version does not touch assignments at all. Both incremented by one, so any
-- miss was permanent.
--
-- Replace the bookkeeping with a recount from the leads themselves:
--   1. sync_creator_lead_counts(creator) recounts both counters, excluding
--      leads flagged as duplicates (024).
--   2. An AFTER INSERT / UPDATE OF creator_id / DELETE trigger calls it. It
--      is named to run after the older increment triggers, so its recount is
--      the value that sticks.
--   3. Backfill: credit earlier enquiries that carry a referral code but no
--      creator, then recount every creator.
--
-- SECURITY DEFINER throughout: this runs on behalf of anonymous visitors.
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION sync_creator_lead_counts(p_creator UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_not_dup TEXT := '';
BEGIN
  IF p_creator IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'duplicate_of') THEN
    v_not_dup := ' AND l.duplicate_of IS NULL';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'campaign_assignments'
               AND column_name = 'leads_generated') THEN
    EXECUTE format(
      'UPDATE campaign_assignments a
          SET leads_generated = (SELECT count(*) FROM leads l
                                  WHERE l.campaign_id = a.campaign_id
                                    AND l.creator_id = a.creator_id%s)
        WHERE a.creator_id = $1', v_not_dup)
    USING p_creator;
  END IF;

  -- creator_id is creator_profiles.id in the live schema; older lineages
  -- keyed it by the user id, so match either.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'creator_profiles'
               AND column_name = 'total_leads_generated') THEN
    EXECUTE format(
      'UPDATE creator_profiles cp
          SET total_leads_generated = (SELECT count(*) FROM leads l
                                        WHERE l.creator_id = $1%s)
        WHERE cp.id = $1 OR cp.user_id = $1', v_not_dup)
    USING p_creator;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION sync_creator_lead_counts(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sync_creator_lead_counts_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM sync_creator_lead_counts(NEW.creator_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.creator_id IS DISTINCT FROM
     (CASE WHEN TG_OP = 'UPDATE' THEN NEW.creator_id END) THEN
    PERFORM sync_creator_lead_counts(OLD.creator_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION sync_creator_lead_counts_trigger() FROM PUBLIC, anon, authenticated;

-- "zz_" so it fires after update_creator_lead_stats_trigger /
-- update_creator_stats_on_lead (AFTER triggers run in name order).
DROP TRIGGER IF EXISTS zz_sync_creator_lead_counts ON leads;
CREATE TRIGGER zz_sync_creator_lead_counts
  AFTER INSERT OR UPDATE OF creator_id OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_creator_lead_counts_trigger();

-- Backfill attribution for enquiries whose referral code was stored but never
-- matched to a creator (before 038 the lookup ran in the visitor's browser,
-- where it was not allowed). resolve_referral_creator() only returns a
-- creator assigned to that lead's campaign.
DO $$
DECLARE
  n INT;
BEGIN
  IF to_regprocedure('public.resolve_referral_creator(uuid, text)') IS NULL THEN
    RAISE NOTICE 'resolve_referral_creator() missing: apply 038 first; skipping backfill';
    RETURN;
  END IF;

  WITH resolved AS (
    SELECT l.id,
           resolve_referral_creator(
             l.campaign_id,
             COALESCE(NULLIF(to_jsonb(l)->>'tracking_token', ''),
                      NULLIF(to_jsonb(l)->>'tracking_code', ''),
                      NULLIF(l.referral_code, ''))) AS creator_id
    FROM leads l
    WHERE l.creator_id IS NULL AND l.campaign_id IS NOT NULL
  )
  UPDATE leads l
     SET creator_id = r.creator_id
    FROM resolved r
   WHERE l.id = r.id AND r.creator_id IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Credited % earlier enquiries to their referring creator', n;
END $$;

-- Recount everyone, so counters that drifted are corrected now.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT creator_id FROM campaign_assignments WHERE creator_id IS NOT NULL
           UNION
           SELECT DISTINCT creator_id FROM leads WHERE creator_id IS NOT NULL
  LOOP
    PERFORM sync_creator_lead_counts(r.creator_id);
  END LOOP;
END $$;

COMMIT;
