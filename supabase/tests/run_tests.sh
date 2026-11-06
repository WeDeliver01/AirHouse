#!/usr/bin/env bash
#
# Run the database integrity test suite against a throwaway PostgreSQL
# instance. Requires a local PostgreSQL 14+ installation (the CI workflow
# installs postgresql-16).
#
#   ./supabase/tests/run_tests.sh
#
# The suite proves the properties the financial migration is supposed to
# guarantee: authorization, amount validation, idempotency, ledger
# immutability, concurrency safety and separation of duties.
#
# It does NOT talk to any Supabase project. `00_supabase_shim.sql` provides a
# local stand-in for auth.uid() and the anon/authenticated roles so the same
# SQL can run without a cloud dependency.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

PGBIN="${PGBIN:-$(dirname "$(command -v psql)")}"
PGPORT="${PGPORT:-5433}"
WORKDIR="$(mktemp -d)"
PGDATA="$WORKDIR/data"
SOCKET="$WORKDIR/sock"
DBNAME="airhouse_test"

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

mkdir -p "$PGDATA" "$SOCKET"

echo "==> Initialising temporary PostgreSQL cluster"
"$PGBIN/initdb" -D "$PGDATA" --auth=trust >/dev/null

echo "==> Starting PostgreSQL on port $PGPORT"
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$WORKDIR/pg.log" \
  -o "-p $PGPORT -k $SOCKET -c listen_addresses=''" -w start >/dev/null

PSQL=("$PGBIN/psql" -h "$SOCKET" -p "$PGPORT" -d "$DBNAME" -v ON_ERROR_STOP=1 -q)

"$PGBIN/createdb" -h "$SOCKET" -p "$PGPORT" "$DBNAME"

echo "==> Loading Supabase shim and baseline schema"
"${PSQL[@]}" -f "$HERE/00_supabase_shim.sql" -f "$HERE/01_baseline.sql"

echo "==> Applying migration 016_financial_integrity.sql"
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/016_financial_integrity.sql" 2>&1 \
  | grep -v '^psql:.*NOTICE' || true

for m in 017_access_control_hardening 018_tenant_isolation 019_storage_hardening 020_campaign_lifecycle 021_audit_and_settings 022_double_entry_ledger 023_ledger_integration 024_lead_integrity 025_data_protection 026_profile_policy_repair 027_super_admin_continuity; do
  echo "==> Applying migration $m.sql"
  "${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/$m.sql" 2>&1 | grep -v '^psql:.*NOTICE' || true
done

echo "==> Seeding test data"
"${PSQL[@]}" -f "$HERE/02_seed.sql"

echo "==> Running assertions"
OUTPUT="$(
  "$PGBIN/psql" -h "$SOCKET" -p "$PGPORT" -d "$DBNAME" \
    -f "$HERE/03_financial_integrity_tests.sql" \
    -f "$HERE/04_payout_tests.sql" \
    -f "$HERE/05_access_control_tests.sql" \
    -f "$HERE/06_tenant_isolation_tests.sql" \
    -f "$HERE/07_ledger_tests.sql" \
    -f "$HERE/08_lead_integrity_tests.sql" \
    -f "$HERE/09_data_protection_tests.sql" \
    -f "$HERE/10_rls_as_client_tests.sql" 2>&1
)"

echo "$OUTPUT" | grep -E 'PASS|FAIL|NOTICE:  ---' | sed 's/^psql:[^ ]* //'

FAILURES="$(echo "$OUTPUT" | grep -c 'FAIL ' || true)"
PASSES="$(echo "$OUTPUT" | grep -c 'PASS ' || true)"

echo
echo "==> $PASSES passed, $FAILURES failed"

if [ "$FAILURES" -ne 0 ]; then
  echo "DATABASE INTEGRITY TESTS FAILED" >&2
  exit 1
fi
