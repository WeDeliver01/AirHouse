#!/usr/bin/env bash
#
# Deploy AirHouse to this host.
#
#   ./deploy/deploy.sh              # build and switch to the new version
#   ./deploy/deploy.sh --rollback   # go back to the previous image
#   ./deploy/deploy.sh --status     # what is running now
#
# Builds the new image first and only stops the running container once the
# new one answers its health check, so a failed build or a container that
# will not start leaves the current version serving traffic.
#
# This does NOT apply database migrations. Those are a separate, deliberate
# step -- see scripts/apply-migrations.sh and docs/MIGRATION_HISTORY.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/.env.production"
PREVIOUS_TAG_FILE="$REPO_ROOT/deploy/.previous-release"

cd "$REPO_ROOT"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m    %s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

# Read the env file into the environment WITHOUT letting the shell interpret
# it.
#
# This used to be `set -a; source "$ENV_FILE"; set +a`, which treats the
# config file as a shell script. A perfectly reasonable value -- a display
# name like AirHouse (Pty) Ltd, or an address like
# AirHouse <notifications@airhouse.co.za> -- then hits bash as a subshell or a
# redirect, and the whole deploy dies with
#
#     .env.production: line 63: syntax error near unexpected token `newline'
#
# which names neither the setting nor the problem. Worse, `source` would run
# anything in there, so a stray backtick in a pasted key executes on the host.
#
# Parse it ourselves instead: KEY=value, one layer of matching quotes stripped
# the way `docker compose --env-file` strips it, so the shell and compose
# always agree on what a value is.
load_env() {
  local line key value lineno=0

  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))

    # Tolerate a byte-order mark and CRLF line endings, which is what you get
    # when the file has been through a Windows editor or a copy-paste.
    [ "$lineno" -eq 1 ] && line="${line#$'\xef\xbb\xbf'}"
    line="${line%$'\r'}"

    # Trim surrounding whitespace.
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    case "$line" in ""|\#*) continue ;; esac

    line="${line#export }"

    case "$line" in
      *=*) ;;
      *) die "$ENV_FILE line $lineno is not KEY=value: $line" ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"

    case "$key" in
      [A-Za-z_]*) ;;
      *) die "$ENV_FILE line $lineno has an invalid setting name: $key" ;;
    esac
    case "$key" in
      *[!A-Za-z0-9_]*) die "$ENV_FILE line $lineno has an invalid setting name: $key" ;;
    esac

    # Strip one layer of matching quotes.
    if [ ${#value} -ge 2 ]; then
      case "$value" in
        \"*\") value="${value:1:${#value}-2}" ;;
        \'*\') value="${value:1:${#value}-2}" ;;
      esac
    fi

    # An unquoted value with an inline comment is ambiguous: compose keeps the
    # "# ..." and the shell would drop it. Refuse rather than guess, and say
    # which line to fix.
    case "$line" in
      *\"*|*\'*) ;;
      *" #"*) die "$ENV_FILE line $lineno: $key has a comment after its value. Put the comment on its own line, or quote the value." ;;
    esac

    export "$key=$value"
  done < "$ENV_FILE"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Copy deploy/.env.production.example and fill it in."

perms="$(stat -c '%a' "$ENV_FILE")"
if [ "$perms" != "600" ]; then
  warn "$ENV_FILE is mode $perms; tightening to 600 (it holds the service role key)."
  chmod 600 "$ENV_FILE"
fi

command -v docker >/dev/null 2>&1 || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed."

# Fail early on a missing required value rather than halfway through a build.
missing=""
load_env
for key in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY SUPABASE_URL SUPABASE_ANON_KEY \
           SUPABASE_SERVICE_ROLE_KEY SMTP_HOST EMAIL_FROM ALLOWED_ORIGINS; do
  [ -z "${!key:-}" ] && missing="$missing $key"
done
[ -n "$missing" ] && die "Missing required settings in $ENV_FILE:$missing"

case "${1:-deploy}" in
  --status)
    log "Running containers"
    compose ps
    log "Health"
    curl -fsS "http://127.0.0.1:${APP_PORT:-5000}/api/health" && echo
    exit 0
    ;;

  --rollback)
    [ -f "$PREVIOUS_TAG_FILE" ] || die "No previous release recorded; nothing to roll back to."
    previous="$(cat "$PREVIOUS_TAG_FILE")"
    log "Rolling back to $previous"
    VITE_RELEASE="$previous" compose up -d --no-build
    log "Rolled back. Verify with: $0 --status"
    exit 0
    ;;

  deploy) ;;
  *) die "Unknown option: $1" ;;
esac

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

RELEASE="$(git rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)"
log "Deploying release $RELEASE"

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  warn "The working tree has uncommitted changes; they will be included in this build."
fi

# Remember what is currently serving, so --rollback has somewhere to go.
current="$(docker inspect --format '{{ index .Config.Labels "release" }}' airhouse 2>/dev/null || true)"
[ -n "$current" ] && echo "$current" > "$PREVIOUS_TAG_FILE"

log "Building the image"
VITE_RELEASE="$RELEASE" compose build --build-arg VITE_RELEASE="$RELEASE"

# ---------------------------------------------------------------------------
# Switch over
# ---------------------------------------------------------------------------

log "Starting the new container"
VITE_RELEASE="$RELEASE" compose up -d

log "Waiting for it to report healthy"
deadline=$(( $(date +%s) + 90 ))
healthy=false
while [ "$(date +%s)" -lt "$deadline" ]; do
  state="$(docker inspect --format '{{ .State.Health.Status }}' airhouse 2>/dev/null || echo starting)"
  if [ "$state" = "healthy" ]; then
    healthy=true
    break
  fi
  if [ "$state" = "unhealthy" ]; then
    break
  fi
  sleep 3
done

if [ "$healthy" != true ]; then
  warn "The new container did not become healthy. Recent logs:"
  compose logs --tail 40 app || true
  die "Deploy failed. The previous image is still on this host; run '$0 --rollback'."
fi

log "Verifying through the reverse proxy"
if curl -fsS --max-time 10 "https://airhouse.co.za/api/health" >/dev/null 2>&1; then
  echo "    https://airhouse.co.za/api/health responded"
else
  warn "Could not reach https://airhouse.co.za/api/health."
  warn "The container is healthy, so this is usually Nginx or DNS rather than the app."
  warn "Check: sudo nginx -t && sudo systemctl reload nginx"
fi

log "Cleaning up old images"
docker image prune -f --filter "label=app=airhouse" >/dev/null 2>&1 || true

log "Deployed $RELEASE"
echo "    Roll back with: $0 --rollback"
echo "    Logs:           docker compose --env-file $ENV_FILE logs -f app"
