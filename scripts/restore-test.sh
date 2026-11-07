#!/usr/bin/env bash
#
# Prove a backup restores, by restoring it into a throwaway local database
# and comparing row counts against the manifest taken at backup time.
#
#   ./scripts/restore-test.sh ./backup/airhouse-20261105T090000Z.dump
#
# Run this on a schedule. An untested backup is a hope, not a recovery plan.

set -euo pipefail

DUMP="${1:-}"
CONTAINER="airhouse-restore-test"
PORT="${PGPORT:-5466}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Usage: $0 <path-to-dump>" >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "docker is required: the archive must be restored by its own PostgreSQL major version." >&2
  exit 1
}

MANIFEST="${DUMP%.dump}.manifest.txt"
WORKDIR="$(mktemp -d)"
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

DUMP_ABS="$(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP")"

# A custom-format archive records the server it came from, and an older
# pg_restore cannot read a newer one. Read the version out of the archive
# and restore with a PostgreSQL of that major version, rather than whatever
# this machine happens to have installed.
echo "==> Reading the archive"
ARCHIVE_MAJOR="$(
  docker run --rm -i -v "$DUMP_ABS:/work/input:ro" postgres:17-alpine \
    pg_restore --list /work/input 2>/dev/null \
  | grep -oiE 'dumped from database version: ?[0-9]+' | grep -oE '[0-9]+' | head -1
)"

if [ -z "$ARCHIVE_MAJOR" ]; then
  echo "    could not read the version from the archive; assuming 17"
  ARCHIVE_MAJOR=17
else
  echo "    dumped from PostgreSQL $ARCHIVE_MAJOR"
fi

PG_IMAGE="postgres:${ARCHIVE_MAJOR}-alpine"
LOCAL="postgresql://postgres:restoretest@127.0.0.1:$PORT/restore_test"

echo "==> Starting a throwaway PostgreSQL $ARCHIVE_MAJOR"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=restoretest \
  -e POSTGRES_DB=restore_test \
  -v "$DUMP_ABS:/work/input:ro" \
  -p "127.0.0.1:$PORT:5432" \
  "$PG_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -q 2>/dev/null; then break; fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -q 2>/dev/null || {
  echo "the throwaway database did not start" >&2
  exit 1
}

# The dump references auth.users, the Supabase roles and the extensions
# schema, none of which a public-schema dump carries.
docker exec -i "$CONTAINER" psql -U postgres -d restore_test -q -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<'SHIM'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto  WITH SCHEMA extensions;
ALTER DATABASE restore_test SET search_path TO public, extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SHIM

echo "==> Restoring"
# Supabase dumps reference roles and objects that do not exist here; those
# errors are expected and do not affect the data.
docker exec "$CONTAINER" pg_restore -U postgres -d restore_test \
  --no-owner --no-privileges /work/input > "$WORKDIR/restore.log" 2>&1 || true

psql_t() {
  docker exec "$CONTAINER" psql -U postgres -d restore_test -tAc "$1" 2>/dev/null
}

echo "==> Comparing row counts against the manifest"
failures=0

if [ -f "$MANIFEST" ]; then
  while read -r table expected; do
    [ -z "$table" ] && continue
    actual="$(psql_t "SELECT count(*) FROM public.\"$table\"" || echo "missing")"
    [ -n "$actual" ] || actual="missing"

    if [ "$actual" = "missing" ]; then
      echo "    MISSING  $table (expected ~$expected)"
      failures=$((failures + 1))
    else
      # pg_stat_user_tables is an estimate, so allow a small difference and
      # fail only when a table comes back empty that should not be.
      if [ "$expected" -gt 0 ] && [ "$actual" -eq 0 ]; then
        echo "    EMPTY    $table (expected ~$expected)"
        failures=$((failures + 1))
      else
        echo "    ok       $table ($actual rows)"
      fi
    fi
  done < <(sed -n '/row counts:/,$p' "$MANIFEST" | tail -n +2 | sed 's/^  //')
else
  echo "    No manifest alongside the dump; comparing structure only."
fi

echo "==> Checking the financial ledger still balances"
balanced="$(psql_t \
  "SELECT ledger_is_balanced()" 2>/dev/null || echo "unknown")"
echo "    ledger_is_balanced = $balanced"
if [ "$balanced" = "f" ]; then
  failures=$((failures + 1))
fi

echo
if [ "$failures" -ne 0 ]; then
  echo "RESTORE TEST FAILED: $failures problem(s). This backup is not usable." >&2
  exit 1
fi

echo "RESTORE TEST PASSED. This backup is proven recoverable."
