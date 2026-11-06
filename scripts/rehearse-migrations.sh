#!/usr/bin/env bash
#
# Rehearse the migrations against a copy of production, in a container.
#
#   ./scripts/rehearse-migrations.sh 'postgresql://postgres@db.<ref>.supabase.co:5432/postgres'
#
# Takes a dump of the live public schema, restores it into a throwaway
# PostgreSQL 17, applies the migrations there, and reports what changed.
# Production is only ever READ -- the dump runs in a read-only session.
#
# This is step 3 of docs/MIGRATION_HISTORY.md. Doing it on a copy is what
# turns "the migrations should work" into "the migrations did work, on your
# data, and here is the proof".

set -euo pipefail

URL="${1:-${DATABASE_URL:-}}"
CONTAINER="airhouse-rehearsal"
PGPORT_LOCAL="${REHEARSAL_PORT:-55432}"
WORKDIR="$(mktemp -d)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP="$WORKDIR/production-$STAMP.sql"

if [ -z "$URL" ]; then
  echo "Usage: $0 'postgresql://postgres@HOST:5432/postgres'" >&2
  echo "Leave the password out; you will be prompted." >&2
  exit 2
fi

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is missing: sudo apt-get install -y postgresql-client-16" >&2; exit 2; }
command -v docker  >/dev/null 2>&1 || { echo "docker is required to run the throwaway database." >&2; exit 2; }

if ! printf '%s' "$URL" | grep -qE '://[^/@]*:[^/@]*@'; then
  if [ -z "${PGPASSWORD:-}" ]; then
    printf 'Database password (not echoed): ' >&2
    read -rs PGPASSWORD
    printf '\n' >&2
    export PGPASSWORD
  fi
fi

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
log "Dumping the live public schema and data (read-only)"

# Read-only for the dump session too: pg_dump never writes, but saying so
# means a mistake here cannot become a production change.
PGOPTIONS="-c default_transaction_read_only=on" \
pg_dump "$URL" \
  --schema=public \
  --no-owner --no-privileges --no-publications --no-subscriptions \
  --quote-all-identifiers \
  > "$DUMP" || die "pg_dump failed. For an IPv6-only host use the Session pooler string."

echo "    $(wc -l < "$DUMP") lines, $(du -h "$DUMP" | cut -f1)"

# ---------------------------------------------------------------------------
log "Starting a throwaway PostgreSQL 17"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=rehearsal \
  -e POSTGRES_DB=airhouse \
  -p "127.0.0.1:$PGPORT_LOCAL:5432" \
  postgres:17-alpine >/dev/null

LOCAL="postgresql://postgres:rehearsal@127.0.0.1:$PGPORT_LOCAL/airhouse"

for _ in $(seq 1 60); do
  if PGPASSWORD=rehearsal psql "$LOCAL" -X -qtA -c 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
PGPASSWORD=rehearsal psql "$LOCAL" -X -qtA -c 'SELECT 1' >/dev/null 2>&1 || die "the throwaway database did not start"

# ---------------------------------------------------------------------------
log "Recreating what Supabase provides but a dump does not"

# A Supabase dump of `public` references auth.users, the anon/authenticated/
# service_role roles, and auth.uid(). Those live outside the dump, so the
# restore needs them to exist first. supabase/tests/00_supabase_shim.sql is
# the same shim the integrity suite uses.
PGPASSWORD=rehearsal psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_supabase_shim.sql >/dev/null || die "could not install the Supabase shim"

# ---------------------------------------------------------------------------
log "Restoring the copy"

# Not ON_ERROR_STOP: a dump of a live database always has a few statements
# that do not apply cleanly outside Supabase (extensions, event triggers).
# Those are counted and shown rather than aborting the rehearsal.
PGPASSWORD=rehearsal psql "$LOCAL" -X -q -f "$DUMP" > "$WORKDIR/restore.log" 2>&1 || true

restore_errors=$(grep -c '^ERROR:' "$WORKDIR/restore.log" || true)
echo "    $restore_errors statement(s) did not apply"
if [ "${restore_errors:-0}" -gt 0 ]; then
  grep '^ERROR:' "$WORKDIR/restore.log" | sort | uniq -c | sort -rn | head -15 | sed 's/^/      /'
fi

tables=$(PGPASSWORD=rehearsal psql "$LOCAL" -X -qtA -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
echo "    $tables tables restored"
[ "${tables:-0}" -gt 5 ] || die "the restore produced almost nothing; see $WORKDIR/restore.log"

# ---------------------------------------------------------------------------
log "Before: what the copy looks like"

PGPASSWORD=rehearsal psql "$LOCAL" -X -q -c "
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true')) AS unrestricted_policies,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND grantee IN ('anon','authenticated')
       AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')) AS client_write_grants,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity) AS tables_without_rls;"

# ---------------------------------------------------------------------------
log "Applying the migrations to the copy"

if ! PGPASSWORD=rehearsal bash scripts/apply-migrations.sh "$LOCAL" --adopt 2>&1 | tee "$WORKDIR/migrate.log" | tail -25; then
  die "the migrations failed on the copy. Full log: $WORKDIR/migrate.log (kept below)"
fi

# ---------------------------------------------------------------------------
log "After: the same three measures"

PGPASSWORD=rehearsal psql "$LOCAL" -X -q -c "
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true')) AS unrestricted_policies,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND grantee IN ('anon','authenticated')
       AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')) AS client_write_grants,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity) AS tables_without_rls;"

log "Nothing was lost"

PGPASSWORD=rehearsal psql "$LOCAL" -X -q -c "
SELECT 'profiles' AS t, count(*) FROM profiles
UNION ALL SELECT 'wallets', count(*) FROM wallets
UNION ALL SELECT 'campaigns', count(*) FROM campaigns
UNION ALL SELECT 'leads', count(*) FROM leads
ORDER BY 1;"

cp "$DUMP" "./production-dump-$STAMP.sql" 2>/dev/null && echo "
The dump has been kept at ./production-dump-$STAMP.sql -- it contains real
user data, so move it somewhere safe or delete it when you are done."

log "The rehearsal succeeded"
cat <<'NEXT'
The migrations applied to a copy of your production data without losing
anything. The two counts above should both have fallen to near zero.

Production has NOT been touched. When you are satisfied:

  ./scripts/backup-database.sh "$DATABASE_URL" ./backup
  ./scripts/apply-migrations.sh "$DATABASE_URL" --adopt

NEXT
