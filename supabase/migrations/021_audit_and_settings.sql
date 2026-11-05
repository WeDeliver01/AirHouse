-- ============================================================================
-- 021_audit_and_settings.sql
--
-- Two things that the operations side of the platform needs before go-live:
-- an audit trail that cannot be forged, and a settings table so an operator
-- can change platform behaviour without a deploy.
--
-- WHY THE AUDIT TRAIL CHANGES (AH-027)
-- ------------------------------------
-- `audit_logs` was written from the browser (`src/lib/disputes.js`). A
-- client-written audit trail records only what the client chooses to send: an
-- entry can be omitted, delayed, or fabricated. It therefore cannot support
-- an investigation, a dispute, or a regulator's question -- which is the only
-- reason to keep one.
--
-- Writes now go through `record_audit_event()`, which stamps the actor from
-- `auth.uid()` rather than taking it as an argument, and clients have no
-- INSERT privilege on the table (migration 018).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Audit trail
-- ----------------------------------------------------------------------------

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role    TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address    INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent    TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS correlation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time
  ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time
  ON audit_logs (entity_type, entity_id, created_at DESC);

-- The trail is append-only, like the financial ledger.
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

/**
 * Record an audit event.
 *
 * The actor is taken from the session, never from the caller's arguments, so
 * a caller cannot attribute their action to somebody else.
 */
CREATE OR REPLACE FUNCTION record_audit_event(
  p_action         TEXT,
  p_entity_type    TEXT,
  p_entity_id      UUID DEFAULT NULL,
  p_metadata       JSONB DEFAULT '{}'::jsonb,
  p_correlation_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role  TEXT;
  v_id    UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record an audit event'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'An audit event needs an action' USING ERRCODE = 'check_violation';
  END IF;

  SELECT role::text INTO v_role FROM profiles WHERE id = v_actor;

  INSERT INTO audit_logs (user_id, actor_role, action, entity_type, entity_id,
                          metadata, correlation_id)
  VALUES (v_actor, v_role, p_action, p_entity_type, p_entity_id,
          COALESCE(p_metadata, '{}'::jsonb), p_correlation_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION record_audit_event(TEXT, TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_audit_event(TEXT, TEXT, UUID, JSONB, TEXT) TO authenticated;

-- Readable by the actor and by super admins. Ordinary users seeing their own
-- history is useful; seeing anyone else's is not.
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR fin_is_super_admin(auth.uid()));

GRANT SELECT ON audit_logs TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Platform settings
--
--    Operator-controlled behaviour that must change without a deploy. The
--    headline one is `payments_mode`: the platform runs on manual bank
--    transfers until a card gateway is switched on deliberately.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES profiles(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_settings FROM anon, authenticated;
GRANT SELECT ON platform_settings TO authenticated;

DROP POLICY IF EXISTS "platform_settings_read" ON platform_settings;
CREATE POLICY "platform_settings_read" ON platform_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO platform_settings (key, value, description) VALUES
  ('payments_mode', '"manual"'::jsonb,
   'How money is collected and paid out. "manual" = bank transfer recorded by an operator. "gateway" = card payments through the configured provider. Switch to "gateway" only once the provider integration is live and reconciled.'),
  ('platform_fee_rate', '0.25'::jsonb,
   'Share of a campaign budget retained by the platform.'),
  ('payout_fee_rate', '0.03'::jsonb,
   'Fee deducted from a creator payout.'),
  ('min_payout_amount', '100'::jsonb,
   'Smallest payout a creator may request, in rand.'),
  ('lead_duplicate_window_hours', '24'::jsonb,
   'Window within which the same contact against the same campaign is treated as a duplicate lead.'),
  ('require_mfa_for_admins', 'true'::jsonb,
   'Whether privileged accounts must present a second factor.')
ON CONFLICT (key) DO NOTHING;

/** Read one setting, with a fallback when it has not been configured. */
CREATE OR REPLACE FUNCTION get_platform_setting(p_key TEXT, p_default JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value FROM platform_settings WHERE key = p_key), p_default);
$$;

GRANT EXECUTE ON FUNCTION get_platform_setting(TEXT, JSONB) TO authenticated;

/**
 * Change a setting. Super admins only, and every change is audited -- a
 * settings table that can be edited without a trace is a liability, since
 * `payments_mode` and the fee rates are commercially significant.
 */
CREATE OR REPLACE FUNCTION set_platform_setting(p_key TEXT, p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_old    JSONB;
BEGIN
  IF v_caller IS NULL OR NOT fin_is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Only super admins may change platform settings'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = p_key) THEN
    RAISE EXCEPTION 'Unknown setting: %', p_key USING ERRCODE = 'check_violation';
  END IF;

  -- Guard the one setting that decides whether real card money can move.
  IF p_key = 'payments_mode' AND p_value #>> '{}' NOT IN ('manual', 'gateway') THEN
    RAISE EXCEPTION 'payments_mode must be "manual" or "gateway"'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT value INTO v_old FROM platform_settings WHERE key = p_key;

  UPDATE platform_settings
  SET value = p_value, updated_by = v_caller, updated_at = NOW()
  WHERE key = p_key;

  PERFORM record_audit_event(
    'platform_setting_changed', 'platform_settings', NULL,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value)
  );

  RETURN p_value;
END;
$$;

REVOKE ALL ON FUNCTION set_platform_setting(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_platform_setting(TEXT, JSONB) TO authenticated;

COMMIT;
