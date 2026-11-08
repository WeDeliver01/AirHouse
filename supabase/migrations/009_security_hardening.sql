-- ============================================
-- SECURITY HARDENING MIGRATION
-- Prevents privilege escalation via client-side manipulation
-- ============================================

-- 1. Trigger to prevent regular users from changing sensitive fields on UPDATE
-- SECURITY DEFINER triggers (check_super_admin_status) run under postgres role,
-- not 'authenticated', so they bypass this check naturally.
-- Super admins (verified via super_admins table) can update other users' sensitive fields.
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_caller_id UUID;
BEGIN
  -- Only apply restrictions when called by authenticated users (not SECURITY DEFINER triggers)
  IF current_setting('role', true) != 'authenticated' THEN
    RETURN NEW;
  END IF;

  v_caller_id := auth.uid();

  -- Check if caller is a super admin
  SELECT EXISTS (
    SELECT 1 FROM super_admins 
    WHERE user_id = v_caller_id AND is_active = TRUE
  ) INTO v_is_super_admin;

  -- Self-update protection: no user can change their own privileged fields
  IF OLD.id = v_caller_id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Users cannot change their own role';
    END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Users cannot change their own verification status';
    END IF;
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      RAISE EXCEPTION 'Users cannot change their own super admin status';
    END IF;
  END IF;

  -- Non-super-admins cannot change any user's privileged fields
  IF NOT v_is_super_admin AND OLD.id != v_caller_id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Only super admins can change user roles';
    END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Only super admins can change verification status';
    END IF;
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      RAISE EXCEPTION 'Only super admins can change super admin status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prevent_privilege_escalation ON profiles;
CREATE TRIGGER trigger_prevent_privilege_escalation
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION prevent_privilege_escalation();

-- 2. Restrict profile INSERT to only allow creator/developer roles
-- The check_super_admin_status trigger runs AFTER this (alphabetical order: 'e' < 't')
-- and overrides role to 'admin' for super admin emails via SECURITY DEFINER.
-- We name this trigger with 'a_' prefix to ensure it runs BEFORE check_super_admin_status.
CREATE OR REPLACE FUNCTION enforce_signup_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Only restrict when called by authenticated users, not by SECURITY DEFINER functions
  IF current_setting('role', true) != 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- For regular signups, only allow creator or developer
  -- The check_super_admin_status trigger (which runs after) will override for super admin emails
  IF NEW.role NOT IN ('creator', 'developer') THEN
    NEW.role := 'creator';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_signup_role ON profiles;
-- Named with 'a_' prefix so it fires BEFORE 'trigger_check_super_admin' (alphabetical)
CREATE TRIGGER a_trigger_enforce_signup_role
BEFORE INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION enforce_signup_role();

-- 3. Add rate limiting helper table for tracking failed attempts
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,
  action_type TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  UNIQUE(identifier, action_type)
);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- 4. Tighten profiles self-UPDATE RLS
-- Regular users can only update their own profile AND cannot change sensitive fields
-- Super admins bypass this via the "Admins can update all profiles" policy
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update own safe fields" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND is_verified IS NOT DISTINCT FROM (SELECT p.is_verified FROM profiles p WHERE p.id = auth.uid())
    AND COALESCE(is_super_admin, false) IS NOT DISTINCT FROM COALESCE((SELECT p.is_super_admin FROM profiles p WHERE p.id = auth.uid()), false)
  );

-- Ensure admin update policy has no WITH CHECK restriction so super admins can modify sensitive fields
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE
  USING (
    auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active = TRUE)
  );
