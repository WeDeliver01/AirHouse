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

command -v psql   >/dev/null 2>&1 || { echo "psql is missing: sudo apt-get install -y postgresql-client-16" >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "docker is required to run the throwaway database." >&2; exit 2; }

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
log "Checking versions"

# pg_dump refuses to dump a server newer than itself, and Supabase runs a
# newer PostgreSQL than Ubuntu packages. Rather than add the PGDG apt
# repository, borrow pg_dump from the same image this script already runs the
# copy in -- which also guarantees the dump and the restore are the same
# major version.
server_num="$(psql "$URL" -X -qtA -c 'SHOW server_version_num' 2>/dev/null || true)"
[ -n "$server_num" ] || die "could not connect. For an IPv6-only host, use the Session pooler string."
SERVER_MAJOR=$(( server_num / 10000 ))

if command -v pg_dump >/dev/null 2>&1; then
  LOCAL_MAJOR="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
else
  LOCAL_MAJOR=0
fi

echo "    server PostgreSQL $SERVER_MAJOR, local pg_dump ${LOCAL_MAJOR:-none}"

PG_IMAGE="postgres:${SERVER_MAJOR}-alpine"

log "Dumping the live public schema and data (read-only)"

# Read-only for the dump session too: pg_dump never writes, but saying so
# means a mistake here cannot become a production change.
DUMP_ARGS=(--schema=public --no-owner --no-privileges --no-publications --no-subscriptions --quote-all-identifiers)

if [ "${LOCAL_MAJOR:-0}" -ge "$SERVER_MAJOR" ]; then
  PGOPTIONS="-c default_transaction_read_only=on" \
    pg_dump "$URL" "${DUMP_ARGS[@]}" > "$DUMP" 2> "$WORKDIR/dump.err" \
    || die "pg_dump failed: $(tail -2 "$WORKDIR/dump.err")"
else
  echo "    local pg_dump is too old; using $PG_IMAGE instead"
  docker pull -q "$PG_IMAGE" >/dev/null 2>&1 || true
  # --network host so the container inherits the host's routing, including
  # IPv6, which Supabase's direct endpoint needs.
  docker run --rm --network host \
    -e PGPASSWORD="${PGPASSWORD:-}" \
    -e PGOPTIONS="-c default_transaction_read_only=on" \
    "$PG_IMAGE" pg_dump "$URL" "${DUMP_ARGS[@]}" > "$DUMP" 2> "$WORKDIR/dump.err" \
    || die "pg_dump failed: $(tail -3 "$WORKDIR/dump.err")"
fi

[ -s "$DUMP" ] || die "the dump is empty; see $WORKDIR/dump.err"
echo "    $(wc -l < "$DUMP") lines, $(du -h "$DUMP" | cut -f1)"

# ---------------------------------------------------------------------------
log "Starting a throwaway PostgreSQL $SERVER_MAJOR"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=rehearsal \
  -e POSTGRES_DB=airhouse \
  -p "127.0.0.1:$PGPORT_LOCAL:5432" \
  "$PG_IMAGE" >/dev/null

LOCAL="postgresql://postgres:rehearsal@127.0.0.1:$PGPORT_LOCAL/airhouse"

for _ in $(seq 1 60); do
  if PGPASSWORD=rehearsal psql "$LOCAL" -X -qtA -c 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
PGPASSWORD=rehearsal psql "$LOCAL" -X -qtA -c 'SELECT 1' >/dev/null 2>&1 || die "the throwaway database did not start"

# ---------------------------------------------------------------------------
log "Counting what should come across"

SOURCE_TABLES="$(psql "$URL" -X -qtA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'" 2>/dev/null || echo 0)"
echo "    $SOURCE_TABLES tables in the live public schema"

log "Recreating what Supabase provides but a dump does not"

# A Supabase dump of `public` references auth.users, the anon/authenticated/
# service_role roles, and auth.uid(). Those live outside the dump, so the
# restore needs them to exist first. supabase/tests/00_supabase_shim.sql is
# the same shim the integrity suite uses.
# Supabase keeps uuid-ossp and pgcrypto in an `extensions` schema that a
# --schema=public dump does not carry, while the dumped tables default their
# ids to extensions.uuid_generate_v4(). The schema name matters: creating the
# extension in `public` leaves the qualified call unresolvable, every CREATE
# TABLE using it fails, and the copy comes up missing a quarter of its tables
# behind a wall of cascading "relation does not exist" errors.
#
# So mirror Supabase's layout, and put `extensions` on the search path as
# well, so an unqualified call resolves too.
PGPASSWORD=rehearsal psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 -c '
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pgcrypto  WITH SCHEMA extensions;
  GRANT USAGE ON SCHEMA extensions TO PUBLIC;
  ALTER DATABASE airhouse SET search_path TO public, extensions;
' >/dev/null || die "could not create the extensions the dump relies on"

PGPASSWORD=rehearsal psql "$LOCAL" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_supabase_shim.sql >/dev/null || die "could not install the Supabase shim"

# ---------------------------------------------------------------------------
log "Restoring the copy"

# Not ON_ERROR_STOP: a dump of a live database always has a few statements
# that do not apply cleanly outside Supabase (extensions, event triggers).
# Those are counted and shown rather than aborting the rehearsal.
PGPASSWORD=rehearsal psql "$LOCAL" -X -q -f "$DUMP" > "$WORKDIR/restore.log" 2>&1 || true

# psql prefixes its diagnostics with "psql:<file>:<line>: ", so an anchored
# ^ERROR: matches nothing and every failure is counted as a success. That
# reported "0 statements did not apply" over a restore that had dropped a
# third of the schema.
# A dump always re-creates the public schema the target already has. That is
# noise, not a failure, and counting it trains the reader to ignore the line.
BENIGN='schema "public" already exists|extension "[^"]+" already exists|role "[^"]+" (already exists|does not exist)'
restore_errors=$(grep 'ERROR:' "$WORKDIR/restore.log" | grep -cvE "$BENIGN" || true)
benign_errors=$(grep 'ERROR:' "$WORKDIR/restore.log" | grep -cE "$BENIGN" || true)
echo "    $restore_errors statement(s) did not apply${benign_errors:+ (plus $benign_errors harmless)}"
if [ "${restore_errors:-0}" -gt 0 ]; then
  sed -E 's/^psql:[^:]*:[0-9]+: //' "$WORKDIR/restore.log" \
    | grep 'ERROR:' | grep -vE "$BENIGN" | cut -c1-110 | sort | uniq -c | sort -rn | head -10 | sed 's/^/      /'
fi

tables=$(PGPASSWORD=rehearsal psql "$LOCAL" -X -qtA -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
echo "    $tables of $SOURCE_TABLES tables restored"

# A copy that is missing tables is not a copy, and migrating it proves
# nothing about the real database.
if [ "${SOURCE_TABLES:-0}" -gt 0 ] && [ "${tables:-0}" -lt "${SOURCE_TABLES:-0}" ]; then
  die "the copy is missing $(( SOURCE_TABLES - tables )) table(s). Full log: $WORKDIR/restore.log
Migrating an incomplete copy would tell you nothing about production."
fi
[ "${tables:-0}" -gt 5 ] || die "the restore produced almost nothing; see $WORKDIR/restore.log"

# ---------------------------------------------------------------------------
# The three measures that matter, plus the row counts, so the "after" can be
# compared against something rather than judged on its own.
measure() {
  PGPASSWORD=rehearsal psql "$LOCAL" -X -qtA -c "$1"
}

BEFORE_MONEY_GRANTS="$(measure "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE') AND table_name IN ('wallets','wallet_transactions','payout_requests','super_admins','audit_logs','admin_invites','escrow_holds','escrow_releases','invoices','payment_transactions')")"
BEFORE_OPEN_POLICIES="$(measure "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','creator_profiles','wallets') AND (qual='true' OR with_check='true')")"
BEFORE_ANON_WRITES="$(measure "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')")"
BEFORE_ROWS="$(measure "SELECT string_agg(t || '=' || n, ' ') FROM (SELECT 'profiles' AS t, count(*) AS n FROM profiles UNION ALL SELECT 'wallets', count(*) FROM wallets UNION ALL SELECT 'campaigns', count(*) FROM campaigns UNION ALL SELECT 'leads', count(*) FROM leads ORDER BY 1) q")"

log "Before the migrations"
printf '    write grants on money and privilege tables: %s\n' "$BEFORE_MONEY_GRANTS"
printf '    unrestricted policies on profiles/creator_profiles/wallets: %s\n' "$BEFORE_OPEN_POLICIES"
printf '    tables anonymous visitors may write: %s\n' "$BEFORE_ANON_WRITES"
printf '    rows: %s\n' "$BEFORE_ROWS"

# ---------------------------------------------------------------------------
log "Applying the migrations to the copy"

if ! PGPASSWORD=rehearsal bash scripts/apply-migrations.sh "$LOCAL" --adopt 2>&1 | tee "$WORKDIR/migrate.log" | tail -25; then
  die "the migrations failed on the copy. Full log: $WORKDIR/migrate.log (kept below)"
fi

# ---------------------------------------------------------------------------
AFTER_MONEY_GRANTS="$(measure "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE') AND table_name IN ('wallets','wallet_transactions','payout_requests','super_admins','audit_logs','admin_invites','escrow_holds','escrow_releases','invoices','payment_transactions')")"
AFTER_OPEN_POLICIES="$(measure "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','creator_profiles','wallets') AND (qual='true' OR with_check='true') AND policyname <> 'creator_profiles_select_authenticated'")"
AFTER_ANON_WRITES="$(measure "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')")"
AFTER_ANON_DETAIL="$(measure "SELECT COALESCE(string_agg(table_name || ':' || privilege_type, ' '), 'none') FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')")"
AFTER_ROWS="$(measure "SELECT string_agg(t || '=' || n, ' ') FROM (SELECT 'profiles' AS t, count(*) AS n FROM profiles UNION ALL SELECT 'wallets', count(*) FROM wallets UNION ALL SELECT 'campaigns', count(*) FROM campaigns UNION ALL SELECT 'leads', count(*) FROM leads ORDER BY 1) q")"
LEDGER_OK="$(measure "SELECT ledger_is_balanced()" 2>/dev/null || echo "?")"

log "After the migrations"

verdict=0
check() {
  if [ "$2" = "pass" ]; then printf '    \033[32m✓\033[0m %s\n' "$1"
  else printf '    \033[31m✗\033[0m %s\n' "$1"; verdict=1; fi
}

check "money and privilege tables: $BEFORE_MONEY_GRANTS client write grants -> $AFTER_MONEY_GRANTS" \
      "$([ "${AFTER_MONEY_GRANTS:-1}" -eq 0 ] && echo pass || echo fail)"
check "profiles / creator_profiles / wallets: $BEFORE_OPEN_POLICIES unrestricted policies -> $AFTER_OPEN_POLICIES" \
      "$([ "${AFTER_OPEN_POLICIES:-1}" -eq 0 ] && echo pass || echo fail)"
# Anonymous visitors keep exactly one write: submitting a lead.
check "anonymous writes: $BEFORE_ANON_WRITES -> $AFTER_ANON_WRITES ($AFTER_ANON_DETAIL)" \
      "$([ "${AFTER_ANON_WRITES:-9}" -le 1 ] && echo pass || echo fail)"
check "financial ledger balances: $LEDGER_OK" \
      "$([ "$LEDGER_OK" = "t" ] && echo pass || echo fail)"
check "rows unchanged: $BEFORE_ROWS -> $AFTER_ROWS" \
      "$([ "$BEFORE_ROWS" = "$AFTER_ROWS" ] && echo pass || echo fail)"

if cp "$DUMP" "./production-dump-$STAMP.sql" 2>/dev/null; then
  chmod 600 "./production-dump-$STAMP.sql"
  echo
  echo "The dump is at ./production-dump-$STAMP.sql (mode 600). It holds real"
  echo "user data -- it is a backup until you delete it, and a liability after."
fi

if [ "$verdict" -ne 0 ]; then
  log "The rehearsal FAILED"
  echo "Something above is not as it should be. Do not apply this to production."
  echo "The copy is still running as container $CONTAINER until this script exits."
  exit 1
fi

log "The rehearsal succeeded"
cat <<NEXT
The migrations applied to a copy of your production data, every check above
passed, and no rows were lost.

Production has NOT been touched. When you are ready:

  ./scripts/backup-database.sh '<url>' ./backup
  ./scripts/restore-test.sh ./backup/airhouse-<stamp>.dump
  ./scripts/apply-migrations.sh '<url>' --adopt

NEXT
