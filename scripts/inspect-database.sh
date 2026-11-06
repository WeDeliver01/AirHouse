#!/usr/bin/env bash
#
# Report what is actually in a database, changing nothing.
#
#   ./scripts/inspect-database.sh "postgresql://postgres:PASSWORD@HOST:5432/postgres"
#   ./scripts/inspect-database.sh "$DATABASE_URL" > inspection.txt
#
# The migration series in supabase/migrations/ is not a reliable record of
# what is deployed (docs/MIGRATION_HISTORY.md). Nothing should be applied to
# production until the live schema is known, and this is how to know it.
#
# SAFETY: the session is opened with default_transaction_read_only=on, so the
# server itself refuses any write this script could attempt. That is enforced
# by PostgreSQL, not by this script being careful.
#
# Use the DIRECT connection on port 5432, not the transaction pooler on 6543 --
# the pooler does not keep session settings or support everything used here.

set -euo pipefail

URL="${1:-${DATABASE_URL:-}}"

if [ -z "$URL" ]; then
  echo "Usage: $0 <postgres-connection-url>" >&2
  echo "Supabase: Project Settings -> Database -> Connection string -> URI (direct, port 5432)." >&2
  exit 2
fi

command -v psql >/dev/null 2>&1 || {
  echo "psql is not installed. On Debian/Ubuntu: sudo apt-get install -y postgresql-client-16" >&2
  exit 2
}

case "$URL" in
  *:6543/*) echo "WARNING: port 6543 is the transaction pooler. Use the direct connection on 5432." >&2 ;;
esac

# Enforced read-only, plus a timeout so a slow query cannot hang a session.
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30000"

run() {
  printf '\n\033[1m%s\033[0m\n' "$1"
  shift
  psql "$URL" -X -q -v ON_ERROR_STOP=0 -c "$*" 2>&1 | sed 's/^/  /'
}

# True when a table exists. Needed because PostgreSQL parses an entire
# statement before running it, so wrapping a query in `CASE WHEN table exists`
# still fails to parse when the table is absent -- which is exactly the case
# this script has to survive.
exists() {
  [ "$(psql "$URL" -X -qtA -c "SELECT to_regclass('public.$1') IS NOT NULL" 2>/dev/null)" = "t" ]
}

# True when a column exists on a table.
has_column() {
  [ "$(psql "$URL" -X -qtA -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$1' AND column_name='$2')" 2>/dev/null)" = "t" ]
}

# Run a query only if the named table is there; otherwise say so plainly.
run_if() {
  local table="$1" title="$2" sql="$3"
  if exists "$table"; then
    run "$title" "$sql"
  else
    printf '\n\033[1m%s\033[0m\n  (no %s table in this database)\n' "$title" "$table"
  fi
}

printf '\033[1mAirHouse database inspection — %s\033[0m\n' "$(date -u '+%Y-%m-%d %H:%M UTC')"
psql "$URL" -X -qtA -c "select 'Server: ' || version();" 2>&1 | sed 's/^/  /'
psql "$URL" -X -qtA -c "select 'Database: ' || current_database() || ', role: ' || current_user;" 2>&1 | sed 's/^/  /'

run "1. Has apply-migrations.sh ever run here?" "
SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL
            THEN 'NO — schema_migrations does not exist; this database has never been managed by scripts/apply-migrations.sh'
            ELSE 'YES — see the list below' END AS status;"

run_if schema_migrations "   Migrations already recorded" "
SELECT filename, applied_at FROM public.schema_migrations ORDER BY filename;"

run "2. Which hardening migrations are already present?" "
SELECT m.name AS migration,
       CASE WHEN m.present THEN 'PRESENT' ELSE 'absent' END AS state
FROM (VALUES
  ('016 financial_integrity',  to_regprocedure('public.release_campaign_escrow(uuid,bigint,text)') IS NOT NULL
                               OR to_regclass('public.financial_operations') IS NOT NULL),
  ('017 access_control',       to_regprocedure('public.fin_is_super_admin()') IS NOT NULL),
  ('020 campaign_lifecycle',   to_regclass('public.campaign_status_transitions') IS NOT NULL),
  ('021 audit_and_settings',   to_regclass('public.platform_settings') IS NOT NULL),
  ('022 double_entry_ledger',  to_regclass('public.ledger_entries') IS NOT NULL),
  ('024 lead_integrity',       to_regclass('public.lead_stage_transitions') IS NOT NULL),
  ('025 data_protection',      to_regclass('public.data_subject_requests') IS NOT NULL)
) AS m(name, present);"

run "3. Permissive policies — every row here is a hole" "
SELECT tablename, policyname, cmd,
       COALESCE(qual, '(none)') AS using_clause,
       COALESCE(with_check, '(none)') AS with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true' OR policyname LIKE 'allow_all%'
       OR (cmd IN ('UPDATE','ALL') AND with_check IS NULL))
ORDER BY tablename, policyname;"

run "4. Direct write access granted to browser clients" "
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;"

run "5. Tables with row-level security OFF (should be none)" "
SELECT c.relname AS table_without_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;"

run "6. Which wallets schema is deployed?" "
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS wallet_columns
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'wallets';"

run "   Verdict" "
SELECT CASE
  WHEN to_regclass('public.wallets') IS NULL THEN 'no wallets table at all'
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wallets' AND column_name='pending_balance')
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wallets' AND column_name='escrow_balance')
    THEN 'quick_setup.sql lineage (pending_balance, no escrow_balance) — the numbered series was NOT applied'
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wallets' AND column_name='escrow_balance')
    THEN 'migration 004 lineage (escrow_balance present)'
  ELSE 'neither lineage — inspect by hand' END AS lineage;"

run "7. How much real data is at stake?" "
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN NULL
            ELSE (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.name), false, true, '')))[1]::text::bigint
       END AS rows
FROM (VALUES ('profiles'),('campaigns'),('leads'),('wallets'),('wallet_transactions'),
             ('payout_requests'),('campaign_assignments'),('content_submissions'),
             ('disputes'),('terms_acceptances')) AS t(name)
ORDER BY 1;"

if exists profiles && has_column profiles is_super_admin; then
  run "8. Accounts holding elevated privilege (AH-003)" "
SELECT id, email, role, COALESCE(is_super_admin, false) AS super_admin, created_at
FROM public.profiles
WHERE role::text = 'admin' OR COALESCE(is_super_admin, false)
ORDER BY created_at;"
elif exists profiles; then
  run "8. Accounts holding elevated privilege (AH-003)" "
SELECT id, email, role, created_at FROM public.profiles
WHERE role::text = 'admin' ORDER BY created_at;"
else
  printf '\n\033[1m8. Accounts holding elevated privilege (AH-003)\033[0m\n  (no profiles table)\n'
fi

if exists wallets && has_column wallets balance; then
  run "9. Money currently recorded" "
SELECT count(*) AS wallets, COALESCE(sum(balance), 0) AS total_balance FROM public.wallets;"
else
  printf '\n\033[1m9. Money currently recorded\033[0m\n  (no wallets table, or no balance column)\n'
fi

printf '\n\033[1mNothing was modified: the session was read-only.\033[0m\n'
printf 'Next: docs/MIGRATION_HISTORY.md, "Procedure: establishing the true state".\n\n'
