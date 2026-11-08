-- ============================================================================
-- 012: Persist verification rejections so rejected applicants stop reappearing
--      in the admin verification queue after a refresh.
-- ============================================================================
-- Adds two nullable columns on `profiles`:
--   * verification_rejected_at      — timestamp the reviewer rejected the user
--   * verification_rejection_reason — free-form note shown to the applicant
--
-- The existing `prevent_privilege_escalation` trigger only blocks self-edits to
-- `role`, `is_verified`, and `is_super_admin`, so writing these new fields from
-- a super-admin session is allowed by the existing
-- "Admins can update all profiles" RLS policy. No RPC or trigger is changed.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verification_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_rejected_at
  ON profiles(verification_rejected_at)
  WHERE verification_rejected_at IS NOT NULL;

COMMENT ON COLUMN profiles.verification_rejected_at IS
  'Set by an admin/super-admin to record that this profile was reviewed and rejected. The verification queue filters these out so they do not reappear.';
COMMENT ON COLUMN profiles.verification_rejection_reason IS
  'Reviewer-supplied reason shown to the applicant when their verification request is denied.';
