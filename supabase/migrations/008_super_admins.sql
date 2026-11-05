-- ============================================
-- SUPER ADMIN SYSTEM
-- ============================================

-- Table to store permanent super admin records
CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_by TEXT DEFAULT 'system',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view super_admins table" ON super_admins FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active = TRUE)
  );

CREATE POLICY "Super admins can manage super_admins table" ON super_admins FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active = TRUE)
  );

-- Admin invite codes table
CREATE TABLE IF NOT EXISTS admin_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email_restriction TEXT,
  is_used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage invites" ON admin_invites FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active = TRUE)
  );

-- Seed the first super admin
INSERT INTO super_admins (email, granted_by)
VALUES ('ashleybaloyi.work@gmail.com', 'system')
ON CONFLICT (email) DO NOTHING;

-- Add is_super_admin column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Update the profile for the super admin if they already exist
UPDATE profiles 
SET role = 'admin', is_super_admin = TRUE 
WHERE email = 'ashleybaloyi.work@gmail.com';

-- Function to check and set super admin status on profile creation/update
CREATE OR REPLACE FUNCTION check_super_admin_status()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM super_admins 
    WHERE email = NEW.email AND is_active = TRUE
  ) THEN
    NEW.role := 'admin';
    NEW.is_super_admin := TRUE;
    
    UPDATE super_admins 
    SET user_id = NEW.id, updated_at = NOW()
    WHERE email = NEW.email AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_check_super_admin
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION check_super_admin_status();

-- ============================================
-- SERVER-SIDE INVITE REDEMPTION FUNCTION
-- Atomically validates invite code, creates super_admin record, marks invite used
-- ============================================

CREATE OR REPLACE FUNCTION redeem_admin_invite(
  p_invite_code TEXT,
  p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_invite admin_invites%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_invite
  FROM admin_invites
  WHERE invite_code = p_invite_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invite code');
  END IF;

  IF v_invite.is_used THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite has already been used');
  END IF;

  IF v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite has expired');
  END IF;

  IF v_invite.email_restriction IS NOT NULL AND v_invite.email_restriction != p_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite is restricted to a different email');
  END IF;

  INSERT INTO super_admins (email, granted_by)
  VALUES (p_email, 'invite:' || p_invite_code)
  ON CONFLICT (email) DO NOTHING;

  UPDATE admin_invites
  SET is_used = TRUE
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SERVER-SIDE INVITE VALIDATION FUNCTION
-- Allows checking if an invite code is valid without exposing the full table
-- ============================================

CREATE OR REPLACE FUNCTION validate_admin_invite(p_invite_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_invite admin_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite
  FROM admin_invites
  WHERE invite_code = p_invite_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;

  IF v_invite.is_used THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used');
  END IF;

  IF v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'valid', true, 
    'email_restriction', v_invite.email_restriction
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins(email);
CREATE INDEX IF NOT EXISTS idx_super_admins_user_id ON super_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_invites_code ON admin_invites(invite_code);
