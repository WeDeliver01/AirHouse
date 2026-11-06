#!/usr/bin/env bash
#
# Apply pending migrations in order, each in its own transaction, recording
# what was applied in a schema_migrations ledger.
#
#   ./scripts/apply-migrations.sh <database-url>              # apply pending
#   ./scripts/apply-migrations.sh <database-url> --adopt      # adopt existing
#   ./scripts/apply-migrations.sh <database-url> --dry-run    # list only
#
# WHY A LEDGER
# ------------
# Migrations were previously applied by hand over a pooler connection, with
# no record of what had run. That is how the live schema drifted from this
# repository (AH-017). With a ledger, "what is deployed" becomes a query.
#
# ADOPTING AN EXISTING DATABASE
# -----------------------------
# The historical migrations (001-015) were written before the ledger existed,
# contain duplicate numbers, and in several cases are not safely re-runnable
# against a database that already has their objects. For a database that is
# already live, run once with --adopt: it records those migrations as applied
# WITHOUT executing them, then applies everything from 016 onward normally.
#
# Confirm the live schema really does match before adopting. The queries for
# that are in docs/MIGRATION_HISTORY.md.

set -euo pipefail

DATABASE_URL="${1:-${DATABASE_URL:-}}"
MODE="${2:-apply}"
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../supabase/migrations" && pwd)"

# Migrations at or below this number predate the ledger and are adopted
# rather than replayed. Everything above it is managed normally.
HISTORICAL_THROUGH="015"

if [ -z "$DATABASE_URL" ]; then
  echo "Usage: $0 <database-url> [--adopt|--dry-run]" >&2
  exit 1
fi

psql_exec() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
psql_value() { psql "$DATABASE_URL" -tAc "$1"; }

# Which tables does a migration create? Used to check whether a historical
# migration is genuinely already applied before adopting it.
tables_created_by() {
  grep -ioE 'CREATE TABLE (IF NOT EXISTS )?(public\.)?"?[a-z_]+' "$1" \
    | sed -E 's/.*[ .]"?//' | sort -u
}

# "present", "absent" or "partial" -- whether this migration's tables exist.
historical_state() {
  local file="$1" found=0 missing=0 table
  for table in $(tables_created_by "$file"); do
    if [ "$(psql_value "SELECT to_regclass('public.$table') IS NOT NULL")" = "t" ]; then
      found=$((found + 1))
    else
      missing=$((missing + 1))
    fi
  done

  # A migration that creates no table (policies, functions, grants only)
  # cannot be checked this way; assume the operator's inspection was right.
  if [ "$found" -eq 0 ] && [ "$missing" -eq 0 ]; then echo "present"; return; fi
  if [ "$missing" -eq 0 ]; then echo "present"; return; fi
  if [ "$found" -eq 0 ]; then echo "absent"; return; fi
  echo "partial"
}

echo "==> Ensuring the migration ledger exists"
psql_exec <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum   TEXT,
  adopted    BOOLEAN NOT NULL DEFAULT FALSE
);
SQL

applied=0
adopted=0
skipped=0
pending=()

for file in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql | sort); do
  version="$(basename "$file" .sql)"
  number="${version%%_*}"
  checksum="$(sha256sum "$file" | cut -d' ' -f1)"

  existing="$(psql_value "SELECT checksum FROM schema_migrations WHERE version = '$version'")"

  if [ -n "$existing" ]; then
    if [ "$existing" != "$checksum" ] && [ "$existing" != "adopted" ]; then
      echo "::error::$version was applied before but its contents have changed."
      echo "A migration must never be edited after it has been applied; add a new one instead."
      exit 1
    fi
    skipped=$((skipped + 1))
    continue
  fi

  # Historical migrations are recorded, not executed.
  if [ "$number" \< "$HISTORICAL_THROUGH" ] || [ "$number" = "$HISTORICAL_THROUGH" ]; then
    if [ "$MODE" = "--adopt" ]; then
      # Adopting means "this is already applied, record it and move on". That
      # is only true if its objects are actually there. Adopting one whose
      # tables are missing marks it done forever and the tables are never
      # created -- found on the live project, where 015_terms_acceptances had
      # never been applied while everything around it had.
      state="$(historical_state "$file")"

      case "$state" in
        present)
          echo "==> Adopting $version (objects present; recorded, not executed)"
          psql_exec -c "INSERT INTO schema_migrations (version, checksum, adopted)
                        VALUES ('$version', 'adopted', TRUE)"
          adopted=$((adopted + 1))
          ;;
        absent)
          # Nothing it creates exists, so there is nothing for it to collide
          # with: running it is both safe and necessary.
          echo "==> Applying $version (historical, but its objects are missing here)"
          psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file"
          psql_exec -c "INSERT INTO schema_migrations (version, checksum) VALUES ('$version', '$checksum')"
          applied=$((applied + 1))
          ;;
        partial)
          echo "::error::$version is partially applied: some of its tables exist and some do not."
          echo "Adopting it would record work that was never done; replaying it would"
          echo "collide with what is there. Reconcile this migration by hand, then"
          echo "record it with:"
          echo "  INSERT INTO schema_migrations (version, checksum, adopted) VALUES ('$version', 'adopted', TRUE);"
          echo "Tables it creates:"
          for t in $(tables_created_by "$file"); do
            echo "  $t: $(psql_value "SELECT CASE WHEN to_regclass('public.$t') IS NULL THEN 'MISSING' ELSE 'present' END")"
          done
          exit 1
          ;;
      esac
    else
      echo "::warning::$version is historical and not in the ledger."
      echo "            Run once with --adopt if this database already has it."
      pending+=("$version")
    fi
    continue
  fi

  if [ "$MODE" = "--dry-run" ]; then
    echo "    would apply: $version"
    pending+=("$version")
    continue
  fi

  echo "==> Applying $version"
  # Each migration opens and closes its own transaction, so psql must not
  # wrap it in another: an inner COMMIT would end the outer transaction
  # early and quietly defeat the atomicity it was meant to provide. Migration
  # 020 genuinely needs two transactions, because a new enum value cannot be
  # used in the transaction that added it.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file"
  psql_exec -c "INSERT INTO schema_migrations (version, checksum) VALUES ('$version', '$checksum')"
  applied=$((applied + 1))
done

echo
echo "==> applied: $applied   adopted: $adopted   already present: $skipped"

if [ "$MODE" = "--dry-run" ]; then
  echo "==> Dry run; nothing was changed."
  exit 0
fi

# After any change, the money must still add up.
echo "==> Verifying the financial ledger balances"
balanced="$(psql_value "SELECT ledger_is_balanced()" 2>/dev/null || echo "unavailable")"
echo "    ledger_is_balanced = $balanced"
if [ "$balanced" = "f" ]; then
  echo "::error::The financial ledger does not balance. Investigate before moving more money."
  exit 1
fi

if [ "${#pending[@]}" -gt 0 ]; then
  echo
  echo "==> Not applied: ${pending[*]}"
fi
