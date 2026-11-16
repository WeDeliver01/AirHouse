-- ============================================================================
-- 036_disable_admin_mfa.sql
--
-- Two-factor authentication has been removed from the app (route guard,
-- enrolment screens and settings cards). Turn the platform setting off as
-- well so nothing that still reads it -- an older build still being served,
-- for instance -- puts an admin behind the enrolment screen.
--
-- Safe to re-run.
-- ============================================================================

INSERT INTO public.platform_settings (key, value, description)
VALUES ('require_mfa_for_admins', 'false'::jsonb,
        'Two-factor authentication is not used. Kept for older builds that read it.')
ON CONFLICT (key) DO UPDATE
  SET value = 'false'::jsonb,
      description = EXCLUDED.description;
