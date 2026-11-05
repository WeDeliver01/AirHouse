-- ============================================================================
-- 013: Helper RPC for dispute notifications
-- ============================================================================
-- The dispute lifecycle (open / message / resolve) needs to email super admins
-- so they can mediate cases. The `super_admins` table is RLS-locked to admins
-- only, so a regular reporter / reported party cannot read those rows directly.
--
-- This SECURITY DEFINER function exposes ONLY the active admin emails to any
-- authenticated user, which is the minimum surface needed for the client to
-- fan out notifications when a dispute event occurs. No other admin metadata
-- is leaked.
-- ============================================================================

-- Returns an array (TEXT[]) so PostgREST surfaces it to supabase-js as a plain
-- array of strings (e.g. ['a@x.com','b@x.com']) rather than the SETOF wrapper
-- format ([{get_active_super_admin_emails:'a@x.com'},...]).
CREATE OR REPLACE FUNCTION get_active_super_admin_emails()
RETURNS TEXT[]
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(email), ARRAY[]::TEXT[])
  FROM super_admins
  WHERE is_active = TRUE
    AND email IS NOT NULL
    AND email <> '';
$$;

REVOKE ALL ON FUNCTION get_active_super_admin_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_active_super_admin_emails() TO authenticated;

COMMENT ON FUNCTION get_active_super_admin_emails() IS
  'Returns active super admin email addresses for outbound dispute notifications. SECURITY DEFINER bypasses the super_admins RLS lock; callers receive emails only, not the rest of the table.';
