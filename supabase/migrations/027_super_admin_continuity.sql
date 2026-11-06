-- 027_super_admin_continuity.sql
--
-- Keep the people who administer the platform able to administer it.
--
-- Before this remediation, "is this user an admin?" was answered by reading
-- `profiles.role = 'admin'` or `profiles.is_super_admin`, both of which live
-- on a row the user owns. That is AH-003: the account being checked could
-- write the answer.
--
-- 016 replaced that with fin_is_super_admin(), which reads the separate
-- `super_admins` table, and 018 and 026 use it in every policy that grants
-- staff access. Nothing, however, carried the existing administrators across.
--
-- On the live project that would have been a lockout: the one admin account
-- holds `role = 'admin'` and `is_super_admin = true` on its profile and has
-- no row in super_admins, so after migrating it would have lost payout
-- processing, manual payment confirmation, the payments_mode setting and
-- every staff read -- with no way back, because 018 also revokes the client
-- write grant on super_admins. Recovering would have needed the database
-- password.
--
-- This back-fills from the old markers to the new table, names everyone it
-- promotes, and refuses to finish if the result would leave nobody able to
-- run the platform.
--
-- Review the NOTICE output. Anyone listed who should not be an administrator
-- was able to set `is_super_admin` on their own profile while AH-001 and
-- AH-003 were live, and should be removed:
--
--   UPDATE super_admins SET is_active = FALSE WHERE email = '...';

DO $$
DECLARE
  r RECORD;
  v_promoted INT := 0;
  v_active   INT;
  v_has_email      BOOLEAN;
  v_has_granted_by BOOLEAN;
  v_has_is_active  BOOLEAN;
  v_cols TEXT;
  v_vals TEXT;
  v_matched BOOLEAN;
BEGIN
  SELECT
    bool_or(column_name = 'email'),
    bool_or(column_name = 'granted_by'),
    bool_or(column_name = 'is_active')
  INTO v_has_email, v_has_granted_by, v_has_is_active
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'super_admins';

  v_has_email      := COALESCE(v_has_email, FALSE);
  v_has_granted_by := COALESCE(v_has_granted_by, FALSE);
  v_has_is_active  := COALESCE(v_has_is_active, FALSE);
  FOR r IN
    SELECT p.id, p.email, p.role::text AS role, COALESCE(p.is_super_admin, false) AS flagged
    FROM profiles p
    WHERE (p.role::text = 'admin' OR COALESCE(p.is_super_admin, false))
      AND NOT EXISTS (
        SELECT 1 FROM super_admins sa
        WHERE sa.user_id = p.id
          AND (NOT v_has_is_active OR sa.is_active = TRUE)
      )
    ORDER BY p.created_at
  LOOP
    -- The table's shape differs between the numbered series and what is
    -- actually deployed: migration 008 defines email, granted_by, is_active
    -- and updated_at, while other lineages have only user_id and is_active.
    -- Build the statement from the columns that are really there rather than
    -- assuming either.
    -- Every reference to a column that may not exist goes through EXECUTE.
    -- A plain `IF v_has_email AND EXISTS (... sa.email ...)` does not help:
    -- PL/pgSQL plans the whole condition before evaluating it, so the missing
    -- column is a parse error however the flag is set.
    v_matched := EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = r.id);

    IF v_matched THEN
      IF v_has_is_active THEN
        EXECUTE 'UPDATE super_admins SET is_active = TRUE WHERE user_id = $1' USING r.id;
      END IF;
    ELSE
      IF v_has_email THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM super_admins WHERE email = $1)'
          INTO v_matched USING r.email;
      END IF;

      IF v_matched THEN
        -- A row for this address exists but points elsewhere, or nowhere.
        EXECUTE format(
          'UPDATE super_admins SET user_id = $1%s WHERE email = $2',
          CASE WHEN v_has_is_active THEN ', is_active = TRUE' ELSE '' END
        ) USING r.id, r.email;
      ELSE
        v_cols := 'user_id';
        v_vals := '$1';
        IF v_has_email      THEN v_cols := v_cols || ', email';      v_vals := v_vals || ', $2'; END IF;
        IF v_has_granted_by THEN v_cols := v_cols || ', granted_by'; v_vals := v_vals || ', ''migration 027 (from profiles)'''; END IF;
        IF v_has_is_active  THEN v_cols := v_cols || ', is_active';  v_vals := v_vals || ', TRUE'; END IF;

        IF v_has_email THEN
          EXECUTE format('INSERT INTO super_admins (%s) VALUES (%s)', v_cols, v_vals) USING r.id, r.email;
        ELSE
          EXECUTE format('INSERT INTO super_admins (%s) VALUES (%s)', v_cols, v_vals) USING r.id;
        END IF;
      END IF;
    END IF;

    v_promoted := v_promoted + 1;
    RAISE NOTICE 'super admin carried across: % (role=%, is_super_admin=%)', r.email, r.role, r.flagged;
  END LOOP;

  IF v_has_is_active THEN
    SELECT count(*) INTO v_active FROM super_admins WHERE is_active = TRUE;
  ELSE
    SELECT count(*) INTO v_active FROM super_admins;
  END IF;

  RAISE NOTICE '027: % account(s) carried across, % active super admin(s) in total', v_promoted, v_active;

  -- A platform nobody can administer is a worse outcome than the problem
  -- this series set out to fix, so stop rather than leave it that way.
  IF v_active = 0 THEN
    RAISE EXCEPTION
      'No active super admin would remain. Add one before migrating: '
      'INSERT INTO super_admins (email, user_id, is_active) VALUES (''you@example.com'', ''<auth user id>'', TRUE);';
  END IF;
END $$;

-- The old markers stay on `profiles` because the application still reads
-- `role` to decide which dashboard to show. They no longer grant anything:
-- 017 removes the column grant that let their owner write them, and every
-- authorization check now goes through fin_is_super_admin().
