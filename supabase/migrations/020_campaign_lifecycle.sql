-- ============================================================================
-- 020_campaign_lifecycle.sql
--
-- Closes AH-026: `campaign_status` was a well-formed enum with no transition
-- rules, so any status could become any other status and a completed campaign
-- could still take on new creators. Audit section 6.12 requires the backend to
-- prevent invalid transitions.
--
-- STATE MACHINE
-- -------------
--        draft ─┬─> pending_review ──> open ──> active ──> completed
--               │                       │        │
--               ├─> cancelled           ├─> paused <─┤
--               │                       │
--               └─> (open directly, when no review step is configured)
--
--   paused    -> open | active | cancelled
--   open      -> invited | active | paused | cancelled | expired
--   invited   -> active | open | cancelled | expired
--   active    -> completed | paused | cancelled
--   completed -> archived
--   cancelled -> archived
--   expired   -> archived | open        (re-opening resets the dates)
--   archived  -> (terminal)
--
-- Rules enforced here rather than in the client, because the client is not
-- trusted and because a direct PostgREST call bypasses it entirely.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Extend the enum with the states the audit asks for.
--    ADD VALUE IF NOT EXISTS is idempotent and safe to re-run.
-- ----------------------------------------------------------------------------

ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'expired';

COMMIT;

-- A new enum label cannot be used in the same transaction that added it.
BEGIN;

-- ----------------------------------------------------------------------------
-- 2. The allowed transitions, as data rather than as a chain of IF statements.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_status_transitions (
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

TRUNCATE campaign_status_transitions;

INSERT INTO campaign_status_transitions (from_status, to_status) VALUES
  ('draft',          'pending_review'),
  ('draft',          'open'),
  ('draft',          'cancelled'),
  ('pending_review', 'open'),
  ('pending_review', 'rejected'),
  ('pending_review', 'draft'),
  ('rejected',       'draft'),
  ('rejected',       'cancelled'),
  ('open',           'invited'),
  ('open',           'active'),
  ('open',           'paused'),
  ('open',           'cancelled'),
  ('open',           'expired'),
  ('invited',        'active'),
  ('invited',        'open'),
  ('invited',        'paused'),
  ('invited',        'cancelled'),
  ('invited',        'expired'),
  ('active',         'completed'),
  ('active',         'paused'),
  ('active',         'cancelled'),
  ('paused',         'open'),
  ('paused',         'active'),
  ('paused',         'cancelled'),
  ('completed',      'archived'),
  ('cancelled',      'archived'),
  ('expired',        'archived'),
  ('expired',        'open');

ALTER TABLE campaign_status_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON campaign_status_transitions FROM anon, authenticated;
GRANT SELECT ON campaign_status_transitions TO authenticated;

DROP POLICY IF EXISTS "campaign_status_transitions_read" ON campaign_status_transitions;
CREATE POLICY "campaign_status_transitions_read" ON campaign_status_transitions
  FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 3. Enforce them.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_campaign_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM campaign_status_transitions
    WHERE from_status = OLD.status::text AND to_status = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'Campaign cannot move from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A campaign that still holds escrow must not be archived, or the money
  -- becomes unreachable through the product.
  IF NEW.status = 'archived' AND COALESCE(OLD.escrow_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Campaign still holds escrow of %; release or refund it before archiving',
      OLD.escrow_amount USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_transition ON campaigns;
CREATE TRIGGER trg_campaign_transition
  BEFORE UPDATE OF status ON campaigns
  FOR EACH ROW EXECUTE FUNCTION enforce_campaign_transition();

-- ----------------------------------------------------------------------------
-- 4. A closed campaign accepts no new work.
--
--    This is the rule the audit states explicitly: "a completed campaign
--    should not accept new creator assignments".
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_campaign_open_for_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status campaign_status;
BEGIN
  SELECT status INTO v_status FROM campaigns WHERE id = NEW.campaign_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_status::text NOT IN ('open', 'invited', 'active') THEN
    RAISE EXCEPTION 'Campaign is % and cannot take new assignments', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_campaign_open ON campaign_assignments;
CREATE TRIGGER trg_assignment_campaign_open
  BEFORE INSERT ON campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_campaign_open_for_assignment();

-- The same rule for applications: no applying to a closed campaign.
CREATE OR REPLACE FUNCTION enforce_campaign_open_for_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status campaign_status;
BEGIN
  SELECT status INTO v_status FROM campaigns WHERE id = NEW.campaign_id;

  IF v_status::text NOT IN ('open', 'invited', 'active') THEN
    RAISE EXCEPTION 'Campaign is % and is not accepting applications', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_campaign_open ON campaign_applications;
CREATE TRIGGER trg_application_campaign_open
  BEFORE INSERT ON campaign_applications
  FOR EACH ROW EXECUTE FUNCTION enforce_campaign_open_for_application();

-- ----------------------------------------------------------------------------
-- 5. Content may only be submitted against a live assignment.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_submission_assignment_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status campaign_status;
  v_creator UUID;
BEGIN
  SELECT c.status, ca.creator_id INTO v_status, v_creator
  FROM campaign_assignments ca
  JOIN campaigns c ON c.id = ca.campaign_id
  WHERE ca.id = NEW.assignment_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Only the assigned creator may submit against it.
  IF auth.uid() IS NOT NULL AND v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned creator may submit content for this assignment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status::text NOT IN ('open', 'invited', 'active') THEN
    RAISE EXCEPTION 'Campaign is % and is not accepting content', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_assignment_live ON content_submissions;
CREATE TRIGGER trg_submission_assignment_live
  BEFORE INSERT ON content_submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_submission_assignment_live();

COMMIT;
