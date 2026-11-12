-- ============================================================================
-- 033_backfill_missing_profiles.sql
--
-- handle_new_user() (migration 017) provisions profiles/wallets/creator_
-- profiles rows for a new signup but deliberately never blocks account
-- creation on failure -- it catches every exception and just logs a
-- RAISE WARNING. That is the right call for not locking people out of an
-- account they just created, but it means a transient failure (e.g. a
-- constraint violation in the trigger at the time) leaves an auth.users row
-- with no corresponding profiles row, silently.
--
-- The symptom reported in production: onboarding's "save profile" step calls
-- `.update(...).eq('id', user.id).single()`, which fails with PostgREST's
-- "Cannot coerce the result to a single JSON object" because the UPDATE
-- matches zero rows. The client now repairs this itself on next save (see
-- AuthContext.updateProfile), but this backfills any account already
-- affected, mirroring handle_new_user()'s own logic.
-- ============================================================================

BEGIN;

-- 1. profiles: one per auth user that doesn't have one yet.
INSERT INTO public.profiles (id, email, role, full_name)
SELECT
  u.id,
  u.email,
  CASE WHEN u.raw_user_meta_data->>'role' = 'developer' THEN 'developer' ELSE 'creator' END::user_role,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 2. wallets: one per profile that doesn't have one yet, matching its role.
INSERT INTO public.wallets (user_id, wallet_type)
SELECT p.id, CASE WHEN p.role = 'developer' THEN 'developer' ELSE 'creator' END::wallet_type
FROM public.profiles p
LEFT JOIN public.wallets w ON w.user_id = p.id AND w.wallet_type = (
  CASE WHEN p.role = 'developer' THEN 'developer' ELSE 'creator' END::wallet_type
)
WHERE w.id IS NULL
  AND p.role IN ('creator', 'developer')
ON CONFLICT (user_id, wallet_type) DO NOTHING;

-- 3. creator_profiles: one per creator profile that doesn't have one yet.
INSERT INTO public.creator_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.creator_profiles cp ON cp.user_id = p.id
WHERE cp.id IS NULL
  AND p.role = 'creator'
ON CONFLICT DO NOTHING;

COMMIT;
