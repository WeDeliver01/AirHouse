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
- A Resend API key

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
sudo cp deploy/nginx/airhouse.co.za.conf /etc/nginx/sites-available/airhouse.co.za
```

**Get the certificate before enabling the TLS blocks.** Nginx will not start
if it is pointed at a certificate that does not exist yet, and that is the
usual reason a first deploy appears to break the other sites on the box.

Comment out both `listen 443` server blocks, then:

```bash
sudo ln -s /etc/nginx/sites-available/airhouse.co.za /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d airhouse.co.za -d www.airhouse.co.za
```

Uncomment the 443 blocks (or let certbot write its own), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` before every reload. It is the difference between catching a typo
and taking every site on the server down.

## 5. Tell Supabase about the domain

Auth will not work until this is done — email confirmation and password reset
links are built from the Site URL.

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://airhouse.co.za`
- **Redirect URLs:** add
  - `https://airhouse.co.za/auth/callback`
  - `https://airhouse.co.za/auth/reset-password`

Remove any `localhost` entries once you are live.

## 6. Check it

```bash
curl -s https://airhouse.co.za/api/health
```

Then in a browser, as a signed-out visitor:

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

**Image size is about 480MB.** The runtime carries all production
dependencies, including ones only the frontend bundle needs (charting, PDF
generation). Splitting server dependencies out of `package.json` would cut
this substantially. Not urgent, but worth doing if image pulls become slow.

**Card payments stay off.** The platform runs on bank transfer. When a
provider is ready, follow the checklist in `docs/RUNBOOK_OPERATIONS.md`
before flipping the toggle in admin settings.
