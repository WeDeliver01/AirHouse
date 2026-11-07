#!/usr/bin/env bash
#
# Take a verified backup.
#
#   ./scripts/backup-database.sh "postgresql://..." ./backup
#
# A dump that has never been restored is not a backup, so this also checks
# the archive is readable and records a manifest of row counts to compare
# against after a restore.

set -euo pipefail

# pg_dump refuses to dump a server newer than itself, and Supabase runs a
# newer PostgreSQL than Ubuntu packages. pgtools picks a matching client.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/pgtools.sh"

DATABASE_URL="${1:-${DATABASE_URL:-}}"
OUT_DIR="${2:-./backup}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -z "$DATABASE_URL" ]; then
  echo "Usage: $0 <database-url> [output-dir]" >&2
  exit 1
fi

if ! printf '%s' "$DATABASE_URL" | grep -qE '://[^/@]*:[^/@]*@'; then
  if [ -z "${PGPASSWORD:-}" ]; then
    printf 'Database password (not echoed): ' >&2
    read -rs PGPASSWORD
    printf '\n' >&2
    export PGPASSWORD
  fi
fi

echo "==> Checking versions"
pg_detect_versions "$DATABASE_URL" || exit 1
pg_report_versions

mkdir -p "$OUT_DIR"

DUMP="$OUT_DIR/airhouse-$STAMP.dump"
MANIFEST="$OUT_DIR/airhouse-$STAMP.manifest.txt"

echo "==> Dumping to $DUMP"
# To stdout rather than --file: when the dump runs in a container, --file
# would write the archive inside it and leave nothing behind here.
pg_tool pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  > "$DUMP"

[ -s "$DUMP" ] || { echo "ERROR: the dump is empty." >&2; exit 1; }

echo "==> Verifying the archive is readable"
# Listing the table of contents proves the file is a valid archive. It does
# not prove it restores -- only scripts/restore-test.sh does that.
pg_tool_with_file pg_restore "$DUMP" --list > /dev/null
echo "    archive OK ($(du -h "$DUMP" | cut -f1))"

echo "==> Recording a row-count manifest"
{
  echo "AirHouse backup manifest"
  echo "taken_at: $STAMP"
  echo "dump: $(basename "$DUMP")"
  echo "sha256: $(sha256sum "$DUMP" | cut -d' ' -f1)"
  echo
  echo "row counts:"
  pg_tool psql "$DATABASE_URL" -tA -F$'\t' -c "
    SELECT relname, n_live_tup
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname;" | sed 's/^/  /'
} > "$MANIFEST"

echo "==> Manifest written to $MANIFEST"
echo
echo "This backup is not proven until scripts/restore-test.sh has restored it."
