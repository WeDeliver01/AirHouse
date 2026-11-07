#!/usr/bin/env bash
#
# Run PostgreSQL client tools that match the server, whatever is installed.
#
# Supabase runs a newer PostgreSQL than Ubuntu packages, and pg_dump refuses
# to dump a server newer than itself:
#
#   pg_dump: error: aborting because of server version mismatch
#   pg_dump: detail: server version: 17.6; pg_dump version: 16.15
#
# Rather than add the PGDG apt repository to every machine, borrow the tools
# from the official postgres image for the server's own major version. The
# container runs with --network host so it inherits the host's routing,
# including IPv6, which Supabase's direct endpoint needs.
#
# Source this, then call pg_tool: it runs the local binary when that is new
# enough and the container otherwise.
#
#   . "$(dirname "$0")/lib/pgtools.sh"
#   pg_detect_versions "$DATABASE_URL"
#   pg_tool pg_dump "$DATABASE_URL" --schema=public > out.sql

PG_SERVER_MAJOR=""
PG_LOCAL_MAJOR=0
PG_IMAGE=""

pg_local_major() {
  local tool="${1:-pg_dump}"
  command -v "$tool" >/dev/null 2>&1 || { echo 0; return; }
  "$tool" --version | grep -oE '[0-9]+' | head -1
}

# Ask the server what it is. Needs psql, which any client package provides.
pg_detect_versions() {
  local url="$1" num
  command -v psql >/dev/null 2>&1 || {
    echo "psql is not installed: sudo apt-get install -y postgresql-client-16" >&2
    return 1
  }

  num="$(psql "$url" -X -qtA -c 'SHOW server_version_num' 2>/dev/null || true)"
  [ -n "$num" ] || {
    echo "could not connect to the database. For an IPv6-only host, use Supabase's Session pooler string." >&2
    return 1
  }

  PG_SERVER_MAJOR=$(( num / 10000 ))
  PG_LOCAL_MAJOR="$(pg_local_major pg_dump)"
  PG_IMAGE="postgres:${PG_SERVER_MAJOR}-alpine"
}

# True when the locally installed tools can talk to this server.
pg_local_is_current() {
  [ "${PG_LOCAL_MAJOR:-0}" -ge "${PG_SERVER_MAJOR:-0}" ]
}

# Run a client tool at the server's major version. Output goes to stdout, so
# redirection works exactly as it would for the local binary.
pg_tool() {
  local tool="$1"; shift

  if pg_local_is_current; then
    "$tool" "$@"
    return $?
  fi

  command -v docker >/dev/null 2>&1 || {
    echo "Local $tool is $PG_LOCAL_MAJOR but the server is $PG_SERVER_MAJOR, and docker is not available." >&2
    echo "Install postgresql-client-$PG_SERVER_MAJOR, or install docker." >&2
    return 1
  }

  docker run --rm --network host -i \
    -e PGPASSWORD="${PGPASSWORD:-}" \
    -e PGOPTIONS="${PGOPTIONS:-}" \
    "$PG_IMAGE" "$tool" "$@"
}

# Same, for a tool that must read a local file: the file is mounted read-only
# and the path inside the container is substituted for it.
pg_tool_with_file() {
  local tool="$1" file="$2"; shift 2

  if pg_local_is_current; then
    "$tool" "$@" "$file"
    return $?
  fi

  command -v docker >/dev/null 2>&1 || {
    echo "Local $tool is $PG_LOCAL_MAJOR but the server is $PG_SERVER_MAJOR, and docker is not available." >&2
    return 1
  }

  docker run --rm --network host -i \
    -e PGPASSWORD="${PGPASSWORD:-}" \
    -v "$(cd "$(dirname "$file")" && pwd)/$(basename "$file"):/work/input:ro" \
    "$PG_IMAGE" "$tool" "$@" /work/input
}

pg_report_versions() {
  if pg_local_is_current; then
    echo "    PostgreSQL $PG_SERVER_MAJOR server, local client $PG_LOCAL_MAJOR"
  else
    echo "    PostgreSQL $PG_SERVER_MAJOR server, local client ${PG_LOCAL_MAJOR:-none}; using $PG_IMAGE"
  fi
}
