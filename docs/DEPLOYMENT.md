# AirHouse — Deploying to a VPS

Target: **airhouse.co.za**, on a VPS that already serves other sites.

The app runs in Docker bound to `127.0.0.1` only, so it is unreachable from
the internet directly and cannot collide with whatever is already on ports 80
and 443. Your existing Nginx proxies to it.

Nothing here touches your other sites' configuration.

---

## Before you start

You need:

- SSH access, and a user in the `docker` group
- Docker Engine with the Compose plugin (`docker compose version`)
- A free local port — 5000 unless something already has it
- DNS: `airhouse.co.za` and `www.airhouse.co.za` pointing at the VPS
- From Supabase → Settings → API: the project URL, the anon key, and the
  **service role key**
- A Resend API key, from resend.com → API Keys

**Is port 5000 free?**

```bash
sudo ss -ltnp | grep ':5000' || echo "5000 is free"
```

If it is taken, pick another and set `APP_PORT` in the env file *and* the
`upstream` in the Nginx config — they have to agree.

---

## 1. Get the code onto the server

```bash
sudo mkdir -p /srv/airhouse && sudo chown "$USER" /srv/airhouse
git clone https://github.com/WeDeliver01/AirHouse.git /srv/airhouse
cd /srv/airhouse
git checkout claude/youthful-newton-nhsezo
```

## 2. Configure

```bash
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
nano deploy/.env.production
```

Fill in every value marked REQUIRED. The server refuses to start without
them, which is deliberate — a half-configured deployment that boots and then
fails on every request is harder to diagnose than one that refuses outright.

Two things people get wrong here:

- **`VITE_*` values are baked in at build time.** Changing one means
  rebuilding the image, not restarting the container. The deploy script
  handles this; just remember a restart alone will not pick them up.
- **`SUPABASE_SERVICE_ROLE_KEY` bypasses all row-level security.** It belongs
  only in this file, which is `chmod 600` and gitignored. It must never get a
  `VITE_` prefix, or it ends up in the browser bundle.

## 3. Start the container

```bash
./deploy/deploy.sh
```

It builds the image, starts the container, and waits for its health check
before reporting success. If the new container does not come up, the previous
image is still on the host and `./deploy/deploy.sh --rollback` puts it back.

Confirm it is listening locally:

```bash
curl -s http://127.0.0.1:5000/api/health
# {"status":"ok","service":"airhouse-notifications"}
```

## 4. Point Nginx at it

```bash
sudo cp deploy/nginx/airhouse.co.za.conf /etc/nginx/sites-available/
```

**Keep the `.conf` suffix.** Debian's stock `nginx.conf` includes
`sites-enabled/*`, but many hosts include `sites-enabled/*.conf` instead, and
a file named `airhouse.co.za` is then silently ignored -- `nginx -t` passes,
the symlink looks correct, and the site just does not exist. `.conf` matches
both globs. Check which one your host uses:

```bash
sudo grep -rn 'sites-enabled' /etc/nginx/nginx.conf
```

**Use `certbot certonly`, not `certbot --nginx`.** The config file already
names the certificate paths certbot writes, so certbot's nginx *installer*
has nothing to add -- and on a host already serving other sites it may pick a
different server block and rewrite that site's TLS configuration instead. See
"certbot edited the wrong site" below for what that looks like. `certonly`
only writes to `/etc/letsencrypt`.

**And get the certificate before enabling the TLS blocks.** Nginx will not
start if it is pointed at a certificate that does not exist yet.

So, in order. Comment out both `listen 443` server blocks, leaving only the
port 80 block:

```bash
sudo ln -sfn /etc/nginx/sites-available/airhouse.co.za.conf \
             /etc/nginx/sites-enabled/airhouse.co.za.conf
sudo nginx -t && sudo systemctl reload nginx
```

Confirm Nginx actually loaded it, rather than trusting the symlink. `nginx -T`
dumps the configuration as Nginx sees it:

```bash
sudo nginx -T | grep -c airhouse_app
```

Zero means the file is not being included, and you should fix that before
requesting a certificate -- certbot will otherwise find no vhost for the name
and edit another site's file instead.

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d airhouse.co.za -d www.airhouse.co.za \
  --deploy-hook "systemctl reload nginx"
```

The deploy hook is what reloads nginx when the certificate renews in sixty
days. Without it the renewal succeeds and nginx carries on serving the expired
certificate until something restarts it.

Then uncomment the 443 blocks:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` before every reload. It is the difference between catching a typo
and taking every site on the server down.

Note `ln -sfn` rather than `ln -s`: re-running the plain form fails with
`File exists`, which is harmless but looks like an error mid-sequence.

## 5. Tell Supabase about the domain

Auth will not work until this is done — email confirmation and password reset
links are built from the Site URL.

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://airhouse.co.za`
- **Redirect URLs:** add
  - `https://airhouse.co.za/auth/callback`
  - `https://airhouse.co.za/auth/reset-password`

Remove any `localhost` entries once you are live.

## 6. Prove email works

The platform tells developers about new leads by email, so this is worth
checking explicitly rather than discovering from a developer who never heard
about an enquiry.

Run it inside the container, which already has the settings and the
dependencies:

```bash
docker compose --env-file deploy/.env.production \
  exec app node scripts/test-email.mjs <your-own-inbox>
```

Use a real inbox you can open, not a placeholder: `example.com` and friends
are reserved by IANA and every provider refuses them. **Before a sending
domain is verified, Resend delivers only to the address that owns the Resend
account**, so that is the address to test with first.

**Do not load the env file into your shell to run this on the host** (`. deploy/.env.production`).
That hands the configuration file to bash, so an ordinary value such as
`RESEND_FROM_EMAIL=AirHouse <admin@airhouse.co.za>` is a syntax error on the
`<`. `deploy.sh` parses the file properly and compose passes the settings to
the container, so neither has that problem -- but a shell `source` does, and
the host has no `node_modules` either.

It sends one real message through the same code path the server uses, and
reports the provider's own words on failure.

**A valid key is not enough.** Resend refuses to send from a domain you have
not verified, so until `airhouse.co.za` is verified under Resend → Domains
every send is rejected -- the site looks fine and `notification_failed`
appears in the container logs. Add the DKIM and SPF records Resend gives you.

To send before that is done, set `RESEND_FROM_EMAIL=onboarding@resend.dev`.
That works immediately but only reaches the address that owns the Resend
account, so it is for your own testing and nothing else.

If mail arrives only in spam, the domain still needs those SPF and DKIM
records. Email will "work" without them and be filtered anyway.

## 7. Check it

```bash
./scripts/verify-deployment.sh
```

That checks the things a user would notice: the proxy reaches the container,
the home page and deep links are served, the certificate is valid and how long
it has left, http and www redirect to the canonical host, the security headers
and CSP are present, the notification endpoint refuses an unauthenticated
caller, a foreign origin gets no CORS grant, fingerprinted assets are cached
immutably and `index.html` is not. It exits non-zero if any of that is wrong,
so it can be used after every deploy.

Point it at the container to separate a proxy problem from an app problem:

```bash
./scripts/verify-deployment.sh http://127.0.0.1:5000
```

The TLS, header and caching checks are Nginx's work, so they are skipped for
that target rather than reported as failures.

The script cannot judge whether the product works, so then, in a browser, as
a signed-out visitor:

- The home page loads
- Register, and confirm the email link points at `airhouse.co.za`
- Sign in, and land on the right dashboard
- Submit a test enquiry on a lead-capture URL

The build passing is not the same as the product working.

---

## The database

**The deploy does not touch the database, deliberately.**

Your Supabase project is still in its original state, which means the
critical findings in `docs/SECURITY_AUDIT.md` are live. Deploying this code
against an unmigrated database gives you the new frontend on the old,
permissive backend — the worst of both.

Work through `docs/MIGRATION_HISTORY.md` before taking real traffic. In
short:

```bash
# 1. Read-only: find out what is actually deployed.
# 2. Back up, and prove the backup restores.
./scripts/backup-database.sh "$PRODUCTION_DATABASE_URL" ./backup
./scripts/restore-test.sh ./backup/airhouse-<stamp>.dump

# 3. Apply to a restored copy first and run the suite against it.
./scripts/apply-migrations.sh "$COPY_URL" --adopt
npm run test:db

# 4. Only then, production.
./scripts/apply-migrations.sh "$PRODUCTION_DATABASE_URL" --adopt
```

`--adopt` records migrations 001–015 without executing them, because they
carry duplicate numbers and are not safely re-runnable.

---

## Day to day

```bash
./deploy/deploy.sh             # deploy the current checkout
./deploy/deploy.sh --status    # what is running
./deploy/deploy.sh --rollback  # back to the previous image

docker compose --env-file deploy/.env.production logs -f app
```

To deploy a new version:

```bash
cd /srv/airhouse && git pull && ./deploy/deploy.sh
```

Downtime is roughly a second: the container stops in about 200ms because the
server handles SIGTERM and finishes in-flight requests rather than being
killed.

---

## When it goes wrong

**The container will not start.**

```bash
docker compose --env-file deploy/.env.production logs --tail 50 app
```

`Missing required configuration: ...` means exactly what it says — fill those
in. That message is the feature working.

**`deploy/.env.production: line NN: syntax error near unexpected token`**

Fixed. The deploy script used to read the config file by executing it as a
shell script, so a value containing a bracket or an angle bracket -- a company
name like `AirHouse (Pty) Ltd`, or `AirHouse <notifications@airhouse.co.za>`
-- was a syntax error, and the message named neither the setting nor the
problem. The file is now parsed properly and both forms work unquoted. If you
see this, you are on an older checkout: `git pull`.

**`line NN: KEY has a comment after its value`**

An unquoted value with a trailing `# comment` means two different things to
the shell and to docker compose, so the script refuses rather than guess. Move
the comment to its own line, or quote the value.

**certbot edited the wrong site, and now nginx will not start.**

Symptom, after `certbot --nginx` on a host with other sites:

```
Successfully deployed certificate for airhouse.co.za to /etc/nginx/sites-enabled/default.conf
We were unable to restart web server
nginx: [emerg] no "ssl_certificate" is defined for the "listen ... quic" directive in ...
```

Certbot chose another server block -- often the catch-all in `default.conf` --
and rewrote it. A failed *reload* leaves the previously loaded configuration
serving, so the other sites are still up; a *restart* or a reboot will read
the broken file and take all of them down. So do not restart nginx until
`nginx -t` passes.

The certificate itself is fine and already at the path this config expects.
Only the nginx edits need undoing:

```bash
sudo nginx -t                      # confirm it is still failing, and where
ls -t /var/lib/letsencrypt/backups # certbot's own backup of what it changed
```

Restore the edited file from that backup, or revert its server block by hand,
then check what else certbot touched -- it may have repointed another domain
at the AirHouse certificate:

```bash
sudo grep -n 'server_name\|ssl_certificate' /etc/nginx/sites-enabled/default.conf
```

Every site should still name its own certificate. Then uncomment the 443
blocks in the AirHouse config, `sudo nginx -t`, and reload.

**502 Bad Gateway from Nginx.**

The proxy cannot reach the container. Check it is listening and that the port
in the Nginx `upstream` matches `APP_PORT`:

```bash
curl -s http://127.0.0.1:5000/api/health
sudo ss -ltnp | grep 5000
```

**The site loads but nothing works, and the console shows CORS errors.**

`ALLOWED_ORIGINS` does not include the origin you are browsing from. It must
be the exact origin, `https://airhouse.co.za`, with no trailing slash. There
is no wildcard fallback by design.

**The page is served but stays blank, and the console shows a thrown error
about Supabase not being configured.**

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are baked into the bundle at
build time, and `src/lib/supabase.js` throws on purpose when they are absent
in a production build rather than falling back to a placeholder. A throw at
module scope means nothing renders at all — the HTML and the assets still
serve with a 200, so the proxy, TLS and health checks all look correct.

Confirm what actually went into the bundle:

```bash
docker compose --env-file deploy/.env.production \
  exec app sh -c 'grep -oE "https://[a-z0-9]+\.supabase\.co" dist/assets/*.js | head -3'
```

Nothing back means the build args were empty. Rebuild — a restart will not
pick them up:

```bash
./deploy/deploy.sh
```

**The page is served but stays blank, and the console shows a Content
Security Policy violation.**

The CSP allows `connect-src` to `https://*.supabase.co` only. A Supabase
custom domain, or any other API the app talks to, has to be added to the
`Content-Security-Policy` line in `deploy/nginx/airhouse.co.za.conf`.

**Auth emails link to localhost.**

Step 5 was skipped. Fix the Site URL in Supabase.

**The frontend is talking to the wrong Supabase project.**

`VITE_SUPABASE_URL` is baked into the bundle, so a restart will not change it.
Rebuild: `./deploy/deploy.sh`.

**Out of disk.**

Container logs are capped at 10MB × 5 files, so the usual culprit is old
images:

```bash
docker image prune -a -f
```

---

## Notes

**One container, no replicas.** The rate limiter counts in a single process's
memory, so running two replicas doubles the effective limit (AH-019 in the
risk register). Before scaling out, move those counters to a shared store.

**The app trusts exactly one proxy: Nginx on this machine.** That is what
`TRUST_PROXY=loopback` means, and it is why per-IP rate limiting sees real
visitor addresses rather than `127.0.0.1`. If you ever put Cloudflare or
another CDN in front of Nginx, `$remote_addr` becomes the CDN's edge and this
has to name the CDN's address ranges instead -- otherwise every visitor
arriving through the CDN shares one rate-limit bucket (AH-028).

**Image size is about 480MB.** The runtime carries all production
dependencies, including ones only the frontend bundle needs (charting, PDF
generation). Splitting server dependencies out of `package.json` would cut
this substantially. Not urgent, but worth doing if image pulls become slow.

**Card payments stay off.** The platform runs on bank transfer. When a
provider is ready, follow the checklist in `docs/RUNBOOK_OPERATIONS.md`
before flipping the toggle in admin settings.
