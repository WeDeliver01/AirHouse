-- ============================================================================
-- 032_identity_verification_toggle.sql
--
-- The onboarding wizard's identity-check step (ID document + liveness
-- selfie upload) isn't needed yet and is friction for every new signup.
-- Rather than ripping the feature out, this makes it operator-controlled
-- through the same `platform_settings` mechanism as `payments_mode`
-- (migration 021): off by default, switchable back on by a super admin
-- without a deploy.
-- ============================================================================

BEGIN;

INSERT INTO platform_settings (key, value, description) VALUES
  ('require_identity_verification', 'false'::jsonb,
   'Whether new creators/developers must complete the identity-check step (ID document + selfie upload) during onboarding. Off by default; a super admin can switch it back on in Platform Settings.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
