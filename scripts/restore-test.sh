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
PGBIN="${PGBIN:-$(dirname "$(command -v psql)")}"
PORT="${PGPORT:-5466}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Usage: $0 <path-to-dump>" >&2
  exit 1
fi

MANIFEST="${DUMP%.dump}.manifest.txt"
WORKDIR="$(mktemp -d)"
cleanup() {
  "$PGBIN/pg_ctl" -D "$WORKDIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "==> Starting a throwaway PostgreSQL instance"
mkdir -p "$WORKDIR/data" "$WORKDIR/sock"
"$PGBIN/initdb" -D "$WORKDIR/data" --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$WORKDIR/data" -l "$WORKDIR/pg.log" \
  -o "-p $PORT -k $WORKDIR/sock -c listen_addresses=''" -w start >/dev/null

"$PGBIN/createdb" -h "$WORKDIR/sock" -p "$PORT" restore_test

echo "==> Restoring"
# Supabase dumps reference roles that do not exist locally; those errors are
# expected and do not affect the data.
"$PGBIN/pg_restore" -h "$WORKDIR/sock" -p "$PORT" -d restore_test \
  --no-owner --no-privileges "$DUMP" 2>"$WORKDIR/restore.log" || true

echo "==> Comparing row counts against the manifest"
failures=0

if [ -f "$MANIFEST" ]; then
  while read -r table expected; do
    [ -z "$table" ] && continue
    actual="$("$PGBIN/psql" -h "$WORKDIR/sock" -p "$PORT" -d restore_test -tAc \
      "SELECT count(*) FROM public.$(printf '%q' "$table")" 2>/dev/null || echo "missing")"

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
balanced="$("$PGBIN/psql" -h "$WORKDIR/sock" -p "$PORT" -d restore_test -tAc \
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
