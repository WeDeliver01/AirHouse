# AirHouse — Verified Security Findings

**Date:** 5 November 2026
**Scope:** Static review of the application source, plus dynamic testing of the
database migrations against a local PostgreSQL 16 instance.
**Status of the deployed environment:** NOT inspected. Everything below is
derived from code. Findings marked **Confirmed** are demonstrable from the
source or were reproduced in a local database; findings marked **Unverified**
need access to the live Supabase project.

This document responds to the uploaded *Enterprise Readiness: Technical Audit
& Engineering Handover*. It confirms most of that audit, corrects two points,
and adds four findings that document did not identify.

---

## Severity

| Priority | Meaning |
|---|---|
| **P0** | Blocks production or real-money launch |
| **P1** | Must be addressed before general availability |
| **P2** | Should be addressed before enterprise expansion |

---

## Summary

| ID | Finding | Priority | Status |
|---|---|---|---|
| AH-001 | Authenticated users can write their own wallet balance | P0 | **Fixed in code** — needs live verification |
| AH-002 | Financial operations are non-atomic and non-idempotent | P0 | **Fixed in code** |
| AH-003 | Sign-up metadata chooses the account role | P0 | **Fixed in code** |
| AH-004 | Notification service is an open email relay | P0 | **Fixed in code** |
| AH-005 | Email credentials coupled to Replit | P1 | **Fixed in code** |
| AH-006 | Server starts without required configuration | P1 | **Fixed in code** |
| AH-007 | HTML injection into outbound email | P1 | **Fixed in code** |
| AH-008 | Developer email exposed to anonymous visitors | P1 | **Open** |
| AH-009 | Blanket `GRANT ALL` to `anon` / `authenticated` | P0 | **Partly fixed** — financial tables only |
| AH-010 | Simulated payment gateway reports success | P0 | **Fixed in code** |
| AH-011 | Campaign funding credits escrow with no payment | P0 | **Fixed in code** (disabled) |
| AH-012 | Default R500 content payment | P0 | **Fixed in code** |
| AH-013 | Developer wallet top-up credits own balance | P0 | **Fixed in code** (disabled) |
| AH-014 | `npm run lint` had no configuration | P2 | **Fixed in code** |
| AH-015 | No automated tests, no CI | P1 | **Fixed in code** |
| AH-016 | Recipient addresses written to logs | P2 | **Fixed in code** |
| AH-017 | Migration history has diverged from the live database | P0 | **Open** — blocks safe deployment |
| AH-018 | Rejected payouts stranded creator funds | P1 | **Fixed in code** |

---

## P0 findings

### AH-001 — Authenticated users can write their own wallet balance
**Confirmed.** `supabase/fix_auth.sql:98`:

```sql
CREATE POLICY "wallets_update" ON wallets FOR UPDATE USING (auth.uid() = user_id);
```

A `FOR UPDATE` policy with a `USING` clause and no `WITH CHECK` restricts
*which rows* may be updated but places no constraint on *the values written*.
Combined with `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`
(`fix_auth.sql:160`), any authenticated user could run:

```js
supabase.from('wallets').update({ balance: 999999999 }).eq('user_id', myUserId)
```

`supabase/quick_setup.sql:82` is worse still — `allow_all_wallets ... USING
(true) WITH CHECK (true)`.

Whichever script produced the live database, the application itself wrote
wallet balances from the browser in five places, so a permissive policy must
exist for the product to function at all. This is the single most serious
finding: it is direct, self-service theft, requiring only a logged-in account
and the browser console.

**Remediation:** migration `017_access_control_hardening.sql` revokes client
write privileges on `wallets`, `wallet_transactions`, `payout_requests` and
`financial_operations`, and leaves no permissive policy on any of them.

**Residual risk:** the deployed policy set has not been inspected. Until
someone runs the verification queries in `docs/MIGRATION_HISTORY.md` against
production, assume this is live.

---

### AH-002 — Financial operations are non-atomic and non-idempotent
**Confirmed.** Every money movement in the original `src/lib/payments.js` was a
sequence of independent client requests. `releaseEscrowToCreator` inserted two
ledger rows, then updated the escrow wallet, then the creator wallet, then the
campaign — four round trips, no transaction. Any failure after the first left
the ledger and the balances permanently disagreeing.

Concurrency was unprotected: two simultaneous releases both read the same
starting balance and both succeeded.

**Remediation:** migration `016_financial_integrity.sql` moves these into
`SECURITY DEFINER` functions that take row locks, re-derive amounts from
stored data, and are keyed by an idempotency token.

**Verified by test:** two concurrent releases of R500 against an escrow holding
R700 — one succeeded, one was refused with *Insufficient escrow balance*, and
the ledger showed a single payment. Replaying an idempotency key returns the
original result without moving money.

---

### AH-003 — Sign-up metadata chooses the account role
**Confirmed, and not identified in the uploaded audit.**

`handle_new_user()` copies the role straight out of client-supplied metadata:

```sql
COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'creator')
```

`raw_user_meta_data` is supplied by whoever calls the sign-up endpoint. The
frontend sanitises it (`AuthContext.jsx:204`), but that is a client-side
control — the Supabase auth API can be called directly with
`{ role: 'admin' }`.

Migration 009 added an `enforce_signup_role` trigger, but it begins:

```sql
IF current_setting('role', true) != 'authenticated' THEN RETURN NEW;
```

The sign-up path runs as `SECURITY DEFINER` under the auth admin role, not
`authenticated`, so the guard does not apply to it. Migration 009 closes role
escalation via `UPDATE`; it does not close it at `INSERT`.

**Remediation:** `017` rewrites `handle_new_user()` to clamp the role to
`creator` or `developer`.

**Verified by test:** a sign-up carrying `{"role":"admin"}` now produces a
`creator` profile; `{"role":"developer"}` is still honoured.

---

### AH-004 — Notification service is an open email relay
**Confirmed.** `server/index.js` had `app.use(cors())` (wildcard), no
authentication on any endpoint, no rate limiting, no batch cap, and accepted
an arbitrary `to` address with arbitrary template data. Anyone on the internet
could send mail from AirHouse's Resend account to any address.

**Remediation:** Supabase token required; recipients restricted to registered
profiles, the caller, or a configured support inbox; CORS allowlist; per-user,
per-IP and public rate limits; batch cap; 64 kB body cap; strict payload
validation.

Public lead capture cannot authenticate, so rather than leaving an open path
it posts only a lead id to `/api/notifications/lead`; the server resolves the
recipient and the body from the stored lead and refuses leads older than ten
minutes.

---

### AH-009 — Blanket `GRANT ALL` to `anon` and `authenticated`
**Confirmed in code; deployment unverified.** Both `quick_setup.sql:129` and
`fix_auth.sql:160` grant `ALL` on every table in `public` to `anon` and
`authenticated`. No migration broadly revokes this; only narrow revokes exist
(`011_marketplace_public_view.sql`, `015_terms_acceptances.sql`).

RLS is enabled on all 37 tables, which is the saving grace — but it makes RLS
the *only* barrier, so a single missing or permissive policy exposes a table
completely.

**Partly remediated.** Migration 017 fixes the financial tables and the
privileged `profiles` columns. It deliberately does **not** blanket-revoke
across all 37 tables: each table's access requirements have not been verified
against the live application, and an indiscriminate revoke would break working
features. Two review views ship with the migration to drive that work:

```sql
SELECT * FROM security_review_permissive_policies;
SELECT * FROM security_review_anon_write_grants;
```

Do the personal-data tables first: `leads`, `creator_verifications`,
`verification_requests`, `messages`, `disputes`, `dispute_messages`,
`contracts`, `bank_accounts`.

---

### AH-010 / AH-011 / AH-012 / AH-013 — Money that was never paid
**All confirmed.**

| | Behaviour |
|---|---|
| AH-010 | `PAYMENT_CONFIG.GATEWAY` was hard-coded to `'test'`; checkout and payout returned `success: true` with no transaction |
| AH-011 | `fundCampaign()` credited a campaign escrow wallet from the browser with no payment taken, and created a **new escrow wallet on every call**, orphaning the previous one and its balance |
| AH-012 | `releaseContentPayment()` used `submission.payment_amount \|\| 500`, inventing a R500 payment nobody agreed |
| AH-013 | `developer/Wallet.jsx` let a developer type any amount and credit their own balance — no payment, no approval |

AH-011's wallet-orphaning and AH-013 were not in the uploaded audit.

**Remediation:** gateway now comes from `VITE_PAYMENT_GATEWAY` and production
builds refuse the simulated gateway. Funding and top-up are disabled until a
provider is integrated. The R500 default is replaced by an explicit error.

---

### AH-017 — Migration history has diverged from the live database
**Confirmed, and the most important operational finding.**

The strongest evidence is in the application code itself: `payments.js` wrote a
`pending_balance` column that migration 004 does not define, and omitted the
`NOT NULL` `net_amount` column that it does. The code therefore matches
`quick_setup.sql`'s simpler schema, not the numbered migration series.

Supporting evidence:
- Four files numbered `011_`, three numbered `013_`, two numbered `014_`.
- Nine loose `.sql` files outside `migrations/`, including the destructive
  `quick_setup.sql` and `fix_auth.sql`.
- `_BUNDLED_PRODUCTION_CATCHUP.sql` states in its header that it "combines
  every migration that was added in code but never applied to the live
  Supabase project".
- Only two migrations have applied-evidence records (011 and 014, both applied
  2026-04-30 to project `dmhhkearepriigdcbrxy`).

**Nothing further should be applied to production until the live schema is
dumped and compared.** See `docs/MIGRATION_HISTORY.md`.

---

## P1 findings

### AH-005 — Email credentials coupled to Replit
`server/email.js` fetched the Resend key from a Replit connector endpoint and
threw *"Authentication token not available"* anywhere else. **Fixed:**
`RESEND_API_KEY` is the primary source; the Replit lookup is an opt-in
fallback.

### AH-006 — Server starts without required configuration
The server came up regardless of missing secrets and failed at request time.
**Fixed:** `validateConfig()` throws at startup in production.

### AH-007 — HTML injection into outbound email
Most templates interpolated values directly (`<p>Hi ${creatorName},</p>`).
Only the newer support and dispute templates escaped. A creator whose display
name contained markup could inject content into mail sent to a developer.
**Fixed:** all template data is escaped centrally in `sendNotification`.

### AH-008 — Developer email exposed to anonymous visitors
**Open.** `src/pages/public/LeadCapture.jsx:72` selects
`developer:profiles!developer_id (full_name, company_name, avatar_url, email)`
on a public, unauthenticated page. Any visitor to a lead-capture URL can read
the developer's email address from the network response.

This also conflicts with `011_marketplace_public_view.sql`, which revokes
`anon` SELECT on `profiles` — suggesting either that migration is not applied,
or this page is already broken for anonymous users. Resolve both together.

**Recommended fix:** drop `email` from the public query; it is no longer needed
now that notifications are raised server-side.

### AH-015 — No automated tests, no CI
**Fixed:** 74 unit tests, 41 database assertions, and a CI pipeline.

### AH-018 — Rejected payouts stranded creator funds
**Confirmed, not in the uploaded audit.** Admin → Financials actioned payouts
by writing `payout_requests.status` directly, never touching the wallet. A
rejected payout left the creator's money in `pending_balance` with no way back.
**Fixed** by routing through `process_payout_request()`.

---

## P2 findings

### AH-014 — `npm run lint` had no configuration
`package.json` declared a lint script but no ESLint config file existed, so the
command errored out. It had never run. **Fixed**, revealing 143 warnings and 9
errors, including a `return` inside a `finally` block in `Marketplace.jsx`.

### AH-016 — Recipient addresses written to logs
`server/email.js` logged every recipient address. **Fixed:** structured logs
carry the template type and a correlation id, not personal data.

---

## Corrections to the uploaded audit

**1. Demo mode is already gated.** Section 3.6 states demo authentication
"must never accidentally become available in production". It already cannot:

```js
const DEMO_MODE = !checkSupabaseConfig() && !IS_PRODUCTION
```

A production build has `import.meta.env.PROD === true`, so demo mode is off
regardless of configuration. The real weakness nearby is different:
`src/lib/supabase.js` falls back to `'https://placeholder.supabase.co'` when
configuration is missing, so a misconfigured build starts and fails opaquely
rather than refusing to start. Worth fixing, but it is not the described risk.

**2. "Yoco and Bob Pay contain unfinished integration logic"** understates it.
Both functions were stubs that logged to the console and returned
`success: false`. There is no partial integration to complete — this is
greenfield work.

---

## What still requires live access

Nothing in this document inspected the running system. These remain open:

1. Which Supabase project is authoritative, and whether `quick_setup.sql` or
   `fix_auth.sql` were ever run against it.
2. The actual RLS policies and grants in production (AH-001, AH-009).
3. Storage bucket privacy, particularly verification documents.
4. Whether real users, leads or verification documents already exist.
5. Git history and deployment logs for exposed credentials.
6. Whether backups exist and have ever been restored.
