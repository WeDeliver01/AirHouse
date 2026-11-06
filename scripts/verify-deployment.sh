#!/usr/bin/env bash
#
# Check a deployed AirHouse from the outside.
#
#   ./scripts/verify-deployment.sh                       # https://airhouse.co.za
#   ./scripts/verify-deployment.sh http://127.0.0.1:5000 # the container directly
#
# Every check is something a user would notice if it were wrong. A build
# passing is not the same as a deployment working, and "the home page loads"
# is not the same as the proxy, TLS, redirects, caching and authentication
# being right.
#
# An http:// target is taken to be the container itself, with Nginx out of the
# path, so the checks that test Nginx's work -- TLS, redirects, security
# headers, caching -- are skipped rather than reported as failures.

set -uo pipefail

BASE="${1:-https://airhouse.co.za}"
BASE="${BASE%/}"
SCHEME="${BASE%%:*}"
HOST="$(printf '%s' "$BASE" | sed -E 's#^[a-z]+://##; s#[:/].*$##')"

# https means we are going through Nginx; http://127.0.0.1 means we are not.
if [ "$SCHEME" = "https" ]; then PROXIED=1; else PROXIED=0; fi

pass=0; fail=0; skip=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '      %s\n' "$2"; fail=$((fail+1)); }
meh()  { printf '  \033[33m–\033[0m %s\n' "$1"; skip=$((skip+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Fetch and cache one response's headers and body.
fetch() {
  curl -sS -o /tmp/ah-body.$$ -D /tmp/ah-head.$$ -w '%{http_code}' --max-time 15 "$@" 2>/tmp/ah-err.$$
}
header() { grep -i "^$1:" /tmp/ah-head.$$ | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }
cleanup() { rm -f /tmp/ah-body.$$ /tmp/ah-head.$$ /tmp/ah-err.$$; }
trap cleanup EXIT

printf '\n\033[1mVerifying %s\033[0m\n' "$BASE"

# ---------------------------------------------------------------------------
head_ "Reachability"

code="$(fetch "$BASE/api/health")"
if [ "$code" = "200" ] && grep -q '"status":"ok"' /tmp/ah-body.$$; then
  ok "/api/health answers 200 with status ok"
elif [ "$code" = "502" ]; then
  no "/api/health returned 502" "Nginx cannot reach the container. Check APP_PORT matches the upstream, and ./deploy/deploy.sh --status."
elif [ "$code" = "000" ]; then
  no "could not connect" "$(head -1 /tmp/ah-err.$$ 2>/dev/null)"
else
  no "/api/health returned $code" "$(head -c 200 /tmp/ah-body.$$)"
fi

code="$(fetch "$BASE/")"
if [ "$code" = "200" ] && grep -qi '<div id="root"\|<title' /tmp/ah-body.$$; then
  ok "the home page is served"
else
  no "the home page returned $code"
fi

# A single-page app must answer a deep link with the app, not a 404, or a
# refresh on any inner page breaks.
code="$(fetch "$BASE/developer/campaigns")"
if [ "$code" = "200" ]; then
  ok "a deep link falls through to the app (refresh works on inner pages)"
else
  no "a deep link returned $code" "Client-side routes must serve index.html, or a page refresh 404s."
fi

# ---------------------------------------------------------------------------
head_ "Transport"

if [ "$SCHEME" != "https" ]; then
  meh "TLS checks skipped for an http:// target"
else
  if curl -sS -o /dev/null --max-time 15 "https://$HOST/" 2>/tmp/ah-err.$$; then
    ok "the certificate is valid and trusted"
  else
    no "the certificate was rejected" "$(head -1 /tmp/ah-err.$$)"
  fi

  expiry="$(printf '' | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [ -n "$expiry" ]; then
    left=$(( ( $(date -d "$expiry" +%s) - $(date +%s) ) / 86400 ))
    if [ "$left" -gt 21 ]; then ok "the certificate has $left days left"
    elif [ "$left" -gt 0 ]; then no "the certificate expires in $left days" "Renewal should have happened by now. Check: certbot renew --dry-run"
    else no "the certificate has expired"; fi
  else
    meh "could not read the certificate expiry"
  fi

  code="$(curl -sS -o /dev/null -D /tmp/ah-head.$$ -w '%{http_code}' --max-time 15 "http://$HOST/")"
  loc="$(header location)"
  case "$code" in
    301|302|308) case "$loc" in https://*) ok "http redirects to $loc" ;; *) no "http redirected to '$loc'" "Expected an https:// target." ;; esac ;;
    *) no "http returned $code instead of a redirect" "Plain http should never serve the site." ;;
  esac

  code="$(curl -sS -o /dev/null -D /tmp/ah-head.$$ -w '%{http_code}' --max-time 15 "https://www.$HOST/")"
  loc="$(header location)"
  if [ "$code" = "000" ]; then
    meh "www.$HOST did not answer (no DNS record, or not covered by the certificate)"
  elif case "$code" in 301|302|308) true ;; *) false ;; esac && [ "$loc" = "https://$HOST/" ]; then
    ok "www redirects to the apex"
  else
    no "www returned $code to '$loc'" "One canonical host keeps links, cookies and the Supabase redirect URL in agreement."
  fi
fi

# ---------------------------------------------------------------------------
head_ "Security headers"

if [ "$PROXIED" -eq 0 ]; then
  meh "skipped: these are added by Nginx, which is not in the path for an http:// target"
else

fetch "$BASE/" >/dev/null
for pair in \
  "x-content-type-options:nosniff" \
  "x-frame-options:SAMEORIGIN" \
  "referrer-policy:strict-origin-when-cross-origin"
do
  name="${pair%%:*}"; want="${pair#*:}"
  got="$(header "$name")"
  if [ "$got" = "$want" ]; then ok "$name: $got"
  elif [ -z "$got" ]; then no "$name is missing"
  else no "$name is '$got', expected '$want'"; fi
done

csp="$(header content-security-policy)"
if [ -n "$csp" ]; then
  case "$csp" in
    *"default-src 'self'"*) ok "a Content-Security-Policy is set" ;;
    *) no "the Content-Security-Policy does not restrict default-src" ;;
  esac
else
  no "no Content-Security-Policy"
fi

hsts="$(header strict-transport-security)"
if [ -n "$hsts" ]; then ok "HSTS: $hsts"
else
  meh "HSTS is not enabled (deliberate until you are sure every subdomain is https)"
fi

fi

# ---------------------------------------------------------------------------
head_ "Authentication and isolation"

code="$(fetch -X POST -H 'Content-Type: application/json' -d '{"type":"welcome","to":"x@x.com","data":{}}' "$BASE/api/notifications/send")"
if [ "$code" = "401" ]; then
  ok "the notification endpoint refuses an unauthenticated caller (401)"
else
  no "the notification endpoint returned $code without a token" "It must be 401. Anything else is an open email relay (AH-004)."
fi

# An absent header proves nothing if the request never arrived, so require a
# real response before reading anything into it.
code="$(fetch -H "Origin: https://evil.example" "$BASE/api/health")"
if [ "$code" = "000" ]; then
  no "could not test CORS: no response"
elif [ -z "$(header access-control-allow-origin)" ]; then
  ok "a disallowed origin gets no CORS grant"
else
  no "a disallowed origin was granted CORS" "ALLOWED_ORIGINS must be an exact list; there is no wildcard by design."
fi

if [ "$SCHEME" = "https" ]; then
  code="$(fetch -H "Origin: https://$HOST" "$BASE/api/health")"
  if [ "$code" = "000" ]; then
    no "could not test the site's own origin: no response"
  elif [ "$(header access-control-allow-origin)" = "https://$HOST" ]; then
    ok "the site's own origin is granted CORS"
  else
    no "the site's own origin was not granted CORS" "Set ALLOWED_ORIGINS=https://$HOST exactly, with no trailing slash."
  fi
fi

# ---------------------------------------------------------------------------
head_ "Caching"

if [ "$PROXIED" -eq 0 ]; then
  meh "skipped: cache headers are set by Nginx, which is not in the path here"
else

fetch "$BASE/" >/dev/null
asset="$(grep -oE '/assets/[A-Za-z0-9_.-]+\.js' /tmp/ah-body.$$ | head -1)"
if [ -n "$asset" ]; then
  fetch "$BASE$asset" >/dev/null
  case "$(header cache-control)" in
    *immutable*) ok "fingerprinted assets are cached immutably" ;;
    "") no "no Cache-Control on $asset" ;;
    *) no "Cache-Control on assets is '$(header cache-control)'" "Fingerprinted files should be immutable." ;;
  esac
else
  meh "found no fingerprinted asset to check"
fi

fetch "$BASE/" >/dev/null
case "$(header cache-control)" in
  *no-cache*|*no-store*|*max-age=0*) ok "index.html is not cached" ;;
  "") no "no Cache-Control on index.html" "A cached index.html serves a stale app after a deploy." ;;
  *) no "index.html Cache-Control is '$(header cache-control)'" "It must not be cached, or a deploy does not reach returning visitors." ;;
esac

fi

# ---------------------------------------------------------------------------
printf '\n\033[1m%d passed, %d failed, %d skipped\033[0m\n\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ]
