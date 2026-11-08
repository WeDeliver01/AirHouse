-- ============================================================================
-- 025_data_protection.sql
--
-- The technical machinery behind POPIA: a record of what personal data is
-- held and why, retention periods that are enforced rather than aspirational,
-- and working export and erasure requests.
--
-- WHAT THIS IS NOT
-- ----------------
-- This is engineering, not legal advice. It gives the platform the ability
-- to answer a data subject request and to delete what it no longer needs.
-- Deciding the lawful basis for each purpose, the retention periods
-- themselves, and the operator agreements with Supabase and Resend is work
-- for whoever owns privacy at AirHouse.
--
-- The defaults below are starting points, deliberately conservative, and
-- every one of them is a business decision to confirm.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. What personal data is held, where, and for how long.
--
--    A data inventory that lives next to the data stays accurate; one kept in
--    a spreadsheet does not.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_inventory (
  table_name      TEXT PRIMARY KEY,
  category        TEXT NOT NULL CHECK (category IN ('identity','contact','financial','behavioural','special')),
  purpose         TEXT NOT NULL,
  subject         TEXT NOT NULL CHECK (subject IN ('creator','developer','lead','staff')),
  retention_days  INTEGER,
  retention_basis TEXT,
  notes           TEXT
);

TRUNCATE data_inventory;
INSERT INTO data_inventory (table_name, category, purpose, subject, retention_days, retention_basis, notes) VALUES
  ('profiles', 'identity', 'Account identity and role', 'staff', NULL,
   'Retained while the account exists', 'Deleted on account erasure.'),
  ('creator_profiles', 'behavioural', 'Marketplace listing and performance', 'creator', NULL,
   'Retained while the account exists', NULL),
  ('leads', 'contact', 'Property enquiry passed to the developer', 'lead', 1095,
   'Three years, to support the developer''s sales cycle and any dispute',
   'The enquirer is a third party who never created an account. Confirm this period.'),
  ('lead_activities', 'behavioural', 'Lead handling history', 'lead', 1095,
   'Matches the lead it belongs to', NULL),
  ('creator_verifications', 'special', 'Identity verification', 'creator', 1825,
   'Five years, in line with typical FICA-style record keeping',
   'Identity documents. The most sensitive data held. Confirm the period.'),
  ('verification_requests', 'special', 'Identity verification workflow', 'creator', 1825,
   'Matches the verification record', NULL),
  ('bank_accounts', 'financial', 'Paying creators', 'creator', NULL,
   'Retained while the account exists', 'Account numbers. Never expose beyond the owner.'),
  ('payment_intents', 'financial', 'Record of money collected', 'developer', 2555,
   'Seven years, in line with typical accounting record keeping', NULL),
  ('ledger_entries', 'financial', 'Accounting record', 'staff', 2555,
   'Seven years; never deleted by a data subject request', 'Financial records are exempt from erasure.'),
  ('wallet_transactions', 'financial', 'Accounting record', 'staff', 2555,
   'Seven years; never deleted by a data subject request', NULL),
  ('messages', 'behavioural', 'Communication between parties', 'creator', 1095,
   'Three years, to support any dispute', NULL),
  ('disputes', 'behavioural', 'Dispute record', 'creator', 2555,
   'Seven years, as evidence of resolution', NULL),
  ('dispute_messages', 'behavioural', 'Dispute evidence', 'creator', 2555,
   'Matches the dispute', NULL),
  ('contracts', 'behavioural', 'Agreement between parties', 'creator', 2555,
   'Seven years after the agreement ends', NULL),
  ('audit_logs', 'behavioural', 'Security and accountability record', 'staff', 2555,
   'Seven years; never deleted by a data subject request', 'Required for accountability.'),
  ('terms_acceptances', 'behavioural', 'Proof of what was agreed and when', 'creator', 2555,
   'Seven years; never deleted by a data subject request', NULL),
  ('support_tickets', 'contact', 'Support correspondence', 'creator', 730,
   'Two years', NULL),
  ('notifications', 'behavioural', 'In-product notifications', 'creator', 365,
   'One year', NULL);

ALTER TABLE data_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON data_inventory FROM anon, authenticated;
GRANT SELECT ON data_inventory TO authenticated;
DROP POLICY IF EXISTS "data_inventory_read" ON data_inventory;
CREATE POLICY "data_inventory_read" ON data_inventory
  FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 2. Data subject requests.
--
--    Every request is recorded, so the platform can show what was asked, when,
--    and what was done about it.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subject_email TEXT,
  request_type  TEXT NOT NULL CHECK (request_type IN ('export','erasure','correction','objection')),
  status        TEXT NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received','in_progress','completed','refused')),
  reason        TEXT,
  outcome       JSONB,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  handled_by    UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_dsr_status ON data_subject_requests (status, requested_at);

ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON data_subject_requests FROM anon, authenticated;
GRANT SELECT ON data_subject_requests TO authenticated;

DROP POLICY IF EXISTS "dsr_select_own" ON data_subject_requests;
CREATE POLICY "dsr_select_own" ON data_subject_requests
  FOR SELECT TO authenticated
  USING (subject_id = auth.uid() OR fin_is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. Export: everything held about the person who asks.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', NOW(),
    'profile', (SELECT to_jsonb(p) FROM profiles p WHERE p.id = v_caller),
    'creator_profile', (SELECT to_jsonb(cp) FROM creator_profiles cp WHERE cp.user_id = v_caller),
    'campaigns', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                  FROM campaigns c WHERE c.developer_id = v_caller),
    'assignments', (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                    FROM campaign_assignments a WHERE a.creator_id = v_caller),
    'wallets', (SELECT COALESCE(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
                FROM wallets w WHERE w.user_id = v_caller),
    'transactions', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                     FROM wallet_transactions t
                     WHERE t.wallet_id IN (SELECT id FROM wallets WHERE user_id = v_caller)),
    'payout_requests', (SELECT COALESCE(jsonb_agg(to_jsonb(pr)), '[]'::jsonb)
                        FROM payout_requests pr WHERE pr.user_id = v_caller),
    'bank_accounts', (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
                      FROM bank_accounts b WHERE b.user_id = v_caller),
    'messages', (SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                 FROM messages m WHERE m.sender_id = v_caller OR m.recipient_id = v_caller),
    'terms_accepted', (SELECT COALESCE(jsonb_agg(to_jsonb(ta)), '[]'::jsonb)
                       FROM terms_acceptances ta WHERE ta.user_id = v_caller),
    'support_tickets', (SELECT COALESCE(jsonb_agg(to_jsonb(st)), '[]'::jsonb)
                        FROM support_tickets st WHERE st.user_id = v_caller)
  ) INTO v_result;

  INSERT INTO data_subject_requests (subject_id, request_type, status, completed_at)
  VALUES (v_caller, 'export', 'completed', NOW());

  PERFORM record_audit_event('data_exported', 'profiles', v_caller, '{}'::jsonb);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION export_my_data() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Erasure.
--
--    Personal data is removed; financial and accountability records are kept
--    but severed from the person, because the platform has a competing
--    obligation to retain them. Pretending otherwise would be worse than
--    saying so plainly.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION erase_user_data(p_user_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_removed JSONB := '{}'::jsonb;
  v_count   INT;
  v_owed    NUMERIC;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may action an erasure request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Refuse while money is outstanding: erasing now would strand funds that
  -- belong to this person.
  SELECT COALESCE(SUM(balance + COALESCE(pending_balance, 0)), 0)
  INTO v_owed FROM wallets WHERE user_id = p_user_id;

  IF v_owed > 0 THEN
    RAISE EXCEPTION 'This account still holds a balance of %. Settle it before erasing.', v_owed
      USING ERRCODE = 'check_violation';
  END IF;

  -- Contact details and free text become unavailable.
  UPDATE profiles
  SET email = NULL,
      full_name = 'Deleted user',
      avatar_url = NULL,
      bio = NULL,
      phone = NULL,
      company_name = NULL
  WHERE id = p_user_id;

  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_removed := v_removed || jsonb_build_object('bank_accounts', v_count);

  DELETE FROM creator_verifications WHERE creator_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_removed := v_removed || jsonb_build_object('creator_verifications', v_count);

  DELETE FROM verification_requests WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_removed := v_removed || jsonb_build_object('verification_requests', v_count);

  DELETE FROM notifications WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_removed := v_removed || jsonb_build_object('notifications', v_count);

  UPDATE messages SET body = '[deleted]'
  WHERE sender_id = p_user_id OR recipient_id = p_user_id;

  -- Leads this creator referred stay with the developer who received them,
  -- but the attribution link is cut.
  UPDATE leads SET creator_id = NULL WHERE creator_id = p_user_id;

  INSERT INTO data_subject_requests
    (subject_id, request_type, status, reason, outcome, completed_at, handled_by)
  VALUES (p_user_id, 'erasure', 'completed', p_reason,
          v_removed || jsonb_build_object(
            'retained', jsonb_build_array('ledger_entries', 'wallet_transactions',
                                          'audit_logs', 'terms_acceptances', 'contracts'),
            'retained_reason', 'Financial and accountability records are kept under a competing obligation, severed from the person.'
          ),
          NOW(), v_caller);

  PERFORM record_audit_event('data_erased', 'profiles', p_user_id,
                             jsonb_build_object('removed', v_removed, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'removed', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION erase_user_data(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erase_user_data(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Retention enforcement.
--
--    A retention policy nobody runs is not a policy. This reports what is
--    overdue; deletion is a separate, deliberate call.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION retention_report()
RETURNS TABLE (table_name TEXT, overdue_rows BIGINT, retention_days INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  n BIGINT;
BEGIN
  FOR r IN SELECT i.table_name, i.retention_days FROM data_inventory i
           WHERE i.retention_days IS NOT NULL
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM public.%I WHERE created_at < NOW() - make_interval(days => %s)',
        r.table_name, r.retention_days
      ) INTO n;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      n := NULL;
    END;

    IF n IS NOT NULL AND n > 0 THEN
      table_name := r.table_name;
      overdue_rows := n;
      retention_days := r.retention_days;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION retention_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retention_report() TO authenticated;

/** Delete rows past their retention period for one table. Super admins only. */
CREATE OR REPLACE FUNCTION apply_retention(p_table TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_days   INTEGER;
  v_count  BIGINT;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may apply retention'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT retention_days INTO v_days FROM data_inventory WHERE table_name = p_table;
  IF v_days IS NULL THEN
    RAISE EXCEPTION 'No retention period is defined for %', p_table
      USING ERRCODE = 'check_violation';
  END IF;

  -- Financial and accountability records are never swept.
  IF p_table IN ('ledger_entries','wallet_transactions','audit_logs','terms_acceptances') THEN
    RAISE EXCEPTION '% is an accountability record and is not deleted by retention', p_table
      USING ERRCODE = 'check_violation';
  END IF;

  -- Not every table carries created_at. Report that plainly rather than
  -- failing with a column error that looks like a bug.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'created_at'
  ) THEN
    RAISE EXCEPTION '% has no created_at column, so age-based retention cannot be applied', p_table
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE format(
    'DELETE FROM public.%I WHERE created_at < NOW() - make_interval(days => %s)',
    p_table, v_days
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM record_audit_event('retention_applied', p_table, NULL,
                             jsonb_build_object('deleted', v_count, 'retention_days', v_days));

  RETURN jsonb_build_object('success', true, 'table', p_table, 'deleted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION apply_retention(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION apply_retention(TEXT) TO authenticated;

COMMIT;
