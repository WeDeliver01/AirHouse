-- ============================================
-- FIX: Infinite recursion in super_admins RLS policies
-- The super_admins table policies reference themselves, causing
-- infinite recursion when any profiles update triggers policy checks.
-- Solution: Use a SECURITY DEFINER function to bypass RLS on super_admins.
-- ============================================

-- Create a function that checks super admin status WITHOUT triggering RLS
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM super_admins 
    WHERE user_id = check_user_id AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fix super_admins table policies to use the function instead of self-referencing
DROP POLICY IF EXISTS "Super admins can view super_admins table" ON super_admins;
CREATE POLICY "Super admins can view super_admins table" ON super_admins FOR SELECT
  USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can manage super_admins table" ON super_admins;
CREATE POLICY "Super admins can manage super_admins table" ON super_admins FOR ALL
  USING (is_super_admin(auth.uid()));

-- Fix admin_invites policy
DROP POLICY IF EXISTS "Super admins can manage invites" ON admin_invites;
CREATE POLICY "Super admins can manage invites" ON admin_invites FOR ALL
  USING (is_super_admin(auth.uid()));

-- Fix profiles admin update policy
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE
  USING (is_super_admin(auth.uid()));
