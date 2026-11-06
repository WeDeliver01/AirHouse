# AirHouse — Technical Risk Register

**Opened:** 5 November 2026
**Owner column:** unassigned entries need an owner at the first engineering
review. "Senior engineer" means whoever holds the remediation mandate.

Status values: `Open` · `Code fixed, unverified in production` · `Closed`

A fix that exists only in this repository is **not closed**. Several P0 items
below are remediated in code but may still be live in the deployed database,
because the deployed database has not been inspected.

---

## P0 — blocks real-money launch

### AH-001 — Authenticated users can write their own wallet balance
| | |
|---|---|
| **Impact** | Direct theft. A logged-in user sets their own balance and withdraws it. No special tooling needed. |
| **Cause** | `FOR UPDATE` policy with `USING` and no `WITH CHECK`, plus `GRANT ALL` to `authenticated`. |
| **Remediation** | `supabase/migrations/017_access_control_hardening.sql` |
| **Evidence** | 41-assertion suite: no client write grants or permissive policies remain on financial tables. |
| **Status** | Code fixed, unverified in production |
| **Owner** | Senior engineer |
| **Due** | Before any further production use |
| **Remaining** | Confirm the live policy set; apply 017 to a restored copy, then production. |

### AH-002 — Financial operations non-atomic and non-idempotent
| | |
|---|---|
| **Impact** | Ledger and balances disagree after a partial failure; concurrent requests pay twice. |
| **Remediation** | `016_financial_integrity.sql` |
| **Evidence** | Concurrency test: two simultaneous R500 releases against R700 escrow — one succeeded, one refused, single payment recorded. Idempotent replay verified. |
| **Status** | Code fixed, unverified in production |
| **Owner** | Senior engineer |

### AH-003 — Sign-up metadata chooses the account role
| | |
|---|---|
| **Impact** | Account takeover of the platform. Anyone calling the Supabase auth API directly with `{"role":"admin"}` gets an admin profile. |
| **Remediation** | `017` clamps the role in `handle_new_user()`. |
| **Evidence** | Test: `{"role":"admin"}` produces a `creator`. |
| **Status** | Code fixed, unverified in production |
| **Owner** | Senior engineer |
| **Remaining** | Audit existing `profiles` rows for roles that were never legitimately granted. |

### AH-004 — Notification service is an open email relay
| | |
|---|---|
| **Impact** | Anyone can send mail from AirHouse's Resend account to any address. Domain reputation loss, phishing in AirHouse's name, provider suspension. |
| **Remediation** | Auth, recipient authorization, CORS allowlist, rate limits, batch and body caps. |
| **Status** | Code fixed |
| **Owner** | Senior engineer |
| **Remaining** | Set `ALLOWED_ORIGINS`, `SUPPORT_INBOX_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY` in the deployment. Check Resend logs for prior abuse. |

### AH-009 — Blanket `GRANT ALL` to `anon` and `authenticated`
| | |
|---|---|
| **Impact** | RLS is the only barrier on all 37 tables. One missing policy exposes a table outright. |
| **Remediation** | `017` covers financial tables and privileged `profiles` columns only. |
| **Status** | **Open** for the remaining ~30 tables |
| **Owner** | Senior engineer |
| **Remaining** | Work through `security_review_permissive_policies` and `security_review_anon_write_grants`. Personal-data tables first: `leads`, `creator_verifications`, `verification_requests`, `messages`, `disputes`, `dispute_messages`, `contracts`, `bank_accounts`. |

### AH-010 / AH-011 / AH-013 — Money that was never paid
| | |
|---|---|
| **Impact** | Simulated gateway reported success; campaign funding and wallet top-up credited balances with no payment taken. Platform liability for funds that do not exist. |
| **Remediation** | Fail-closed gateway; funding and top-up disabled. |
| **Status** | Code fixed |
| **Owner** | Senior engineer |
| **Remaining** | **Reconcile existing balances.** If the platform has been used, some balances may represent money never received. Audit `wallet_transactions` for `deposit` rows with no provider reference before enabling payments. |

### AH-012 — Default R500 content payment
| | |
|---|---|
| **Impact** | Approving content with no agreed amount paid a creator R500 from escrow. |
| **Status** | Code fixed |
| **Remaining** | Audit historical releases for R500 amounts that were never agreed. |

### AH-017 — Migration history diverged from the live database
| | |
|---|---|
| **Impact** | Any migration applied blind could fail midway, or silently reintroduce the permissive `quick_setup.sql` policies. This blocks deploying every other fix. |
| **Status** | **Open** |
| **Owner** | Senior engineer |
| **Due** | First, before any other deployment |
| **Remaining** | Dump the live schema, reconcile against this repository, establish a single ordered series. See `docs/MIGRATION_HISTORY.md`. |

---

## P1 — before general availability

### AH-008 — Developer email exposed to anonymous visitors
| | |
|---|---|
| **Impact** | Personal data disclosed to unauthenticated visitors. POPIA relevant. |
| **Status** | **Open** |
| **Remediation** | Remove `email` from the public campaign query in `LeadCapture.jsx:72`. No longer needed now that lead notifications are server-side. |

### AH-005 / AH-006 / AH-007 / AH-016 — Server robustness and email safety
| | |
|---|---|
| **Status** | Code fixed |
| **Remaining** | Keep `RESEND_API_KEY` in `deploy/.env.production` at mode 600 and nowhere else. The Replit connector lookup remains an opt-in fallback that is inert off Replit. |

### AH-015 — Testing and CI
| | |
|---|---|
| **Status** | Code fixed — foundation only |
| **Remaining** | No frontend component tests, no end-to-end tests, no load tests. Add Playwright for the core journeys. |

### AH-018 — Rejected payouts stranded creator funds
| | |
|---|---|
| **Status** | Code fixed |
| **Remaining** | Audit `payout_requests` with status `failed`/`cancelled` for balances never returned, and correct them with reversing ledger entries — never by editing history. |

### AH-024 — MFA and breach-checking advertised to users but absent
| | |
|---|---|
| **Impact** | Users may choose weaker passwords or forgo other protection believing 2FA, breach-checking and session review exist. None do. A disclosure problem on a page that states the account "holds money", as well as a missing control. |
| **Cause** | `src/data/helpContent.json:127` describes features never built. Settings → Security offers only a password change. |
| **Status** | **Open** |
| **Owner** | Senior engineer / product |
| **Remaining** | Remove the claims now. Implement MFA via Supabase native enrolment for privileged accounts, which also closes the checklist's "MFA for privileged users". |

### AH-025 — Avatar storage policies have no ownership check
| | |
|---|---|
| **Impact** | Any caller reaching the `avatars` bucket can overwrite or delete any user's avatar. Defacement and impersonation. |
| **Cause** | `supabase/create_storage_buckets.sql:54-66` — policies named "own avatar" that check only `bucket_id`. `SUPABASE_SETUP.md` documents the correct stricter form; the weaker one is in the runnable script. |
| **Status** | **Open** |
| **Owner** | Senior engineer |
| **Remaining** | Replace with the `storage.foldername(name))[1] = auth.uid()` form, and reconcile the two conflicting versions as part of AH-017. Sensitive buckets (`verification-documents`, `dispute-evidence`) are correctly private and are not affected. |

### AH-026 — Campaign lifecycle has no transition enforcement
| | |
|---|---|
| **Impact** | `campaign_status` is a well-formed enum but nothing prevents an invalid transition, so a completed or cancelled campaign can still accept assignments — explicitly called out in audit §6.12. |
| **Status** | **Open** |
| **Owner** | Senior engineer |
| **Remaining** | Enforce transitions in a database trigger, matching the pattern used by the financial functions. |

### AH-027 — Audit log is written from the client
| | |
|---|---|
| **Impact** | `src/lib/disputes.js:515` inserts into `audit_logs` from the browser. A client-written audit trail can be omitted, delayed or forged, so it cannot be relied on for an investigation or dispute. |
| **Status** | **Open** |
| **Owner** | Senior engineer |
| **Remaining** | Move audit writes server-side, as `financial_operations` already does for money movements, and revoke client `INSERT` on `audit_logs`. |

### AH-033 — Migrating would have locked the only administrator out
| | |
|---|---|
| **Impact** | Before this work, "is this user an admin?" was answered from `profiles.role` or `profiles.is_super_admin` — fields on a row the user owns, which is AH-003. 016 replaced that with `fin_is_super_admin()`, reading the separate `super_admins` table, and 018 and 026 use it in every policy granting staff access. Nothing carried the existing administrators across. On the live project the single admin holds `role = 'admin'` and `is_super_admin = true` on its profile and has **no row in `super_admins`**, so after migrating it would have lost payout processing, manual payment confirmation, the `payments_mode` setting and every staff read — with no way back, because 018 also revokes the client write grant on `super_admins`. Recovery would have required the database password. |
| **Status** | **Fixed** — migration `027_super_admin_continuity.sql` back-fills `super_admins` from the old markers, names every account it promotes, and raises rather than finish with zero active super admins. |
| **Owner** | Senior engineer |
| **Evidence** | Reproduced on a local database carrying the live project's exact state: after 016–026, `fin_is_super_admin()` returned **false** for the admin account; after 027 it returns **true**. Re-running 027 promotes nothing and leaves one row, so it is idempotent. |
| **Remaining** | Anyone the migration names was able to set `is_super_admin` on their own profile while AH-001 and AH-003 were live. Review the list; deactivate with `UPDATE super_admins SET is_active = FALSE WHERE ...`. For this project the single account was confirmed as the owner's. |

### AH-032 — A browser could file a settled invoice for any amount
| | |
|---|---|
| **Impact** | 018 granted `INSERT` on `invoices` to `authenticated`. The only caller, `saveInvoice()` in `src/lib/invoices.js`, takes the total, VAT, customer and a status of `paid` from its argument, so a signed-in user could have filed a settled invoice for any amount against any customer. It is dead code — nothing in the application calls it — so nothing was exploited, but the grant was live and the function was one import away from being used. |
| **Status** | **Fixed** — `026` revokes `INSERT` on `invoices` from both browser roles and refuses to finish if any client role still holds a write grant on a money or privilege table. The function carries a comment saying why it fails and not to restore the grant. |
| **Owner** | Senior engineer |
| **Evidence** | `scripts/rehearse-migrations.sh` found it: the rehearsal asserts zero client write grants across `wallets`, `wallet_transactions`, `payout_requests`, `super_admins`, `audit_logs`, `admin_invites`, `escrow_holds`, `escrow_releases`, `invoices`, `payment_transactions` and `ledger_entries`, and failed on this one. |
| **Remaining** | Invoices should be generated server-side from the ledger entry they describe. Until then the product has no invoice-creation path at all. |

### AH-031 — The row-level policies were never tested, and three were broken
| | |
|---|---|
| **Impact** | Found by rehearsing 016–025 against the live schema. Every test in the database suite ran as the database owner, who bypasses RLS, and no table sets `FORCE ROW LEVEL SECURITY` — so 123 assertions passed without the policies behind AH-001, AH-008 and AH-009 ever being evaluated. Three defects survived: **(a)** 018's blanket `REVOKE ALL` removed the column-level UPDATE grants 017 places on `profiles` and re-granted only SELECT and INSERT, so no user could edit their own profile; **(b)** neither migration dropped the pre-existing `allow_all_profiles` / `allow_all_creator_profiles` policies, and because PostgreSQL combines permissive policies with OR, one surviving `USING (true)` granted everything — any signed-in user could read every profile and edit any creator profile; **(c)** 016 revoked `EXECUTE` on `fin_is_super_admin` from `authenticated` while 018 used it in eight policies, so those policies raised *permission denied* for the very users they were written for. |
| **Status** | **Fixed** — migration `026_profile_policy_repair.sql`. |
| **Owner** | Senior engineer |
| **Evidence** | `supabase/tests/10_rls_as_client_tests.sql` — 14 assertions that `SET ROLE` to `authenticated` and `anon`, covering profile ownership, role escalation, wallet writes, payout approval, `super_admins` insertion, audit-log deletion and anonymous access. Suite is now 137 passing. Verified against a local PostgreSQL 16 carrying the same object set as the live project. |
| **Remaining** | The other tables' policies now have client-role coverage only where these tests reach. Extend `10_rls_as_client_tests.sql` as each area is touched. |

### AH-030 — The production bundle rendered nothing
| | |
|---|---|
| **Impact** | The deployed site served a blank page. The `manualChunks` configuration added for AH-023 matched React with `id.includes('/react/')`, leaving React's own dependencies in `vendor`, so `react` imported `vendor` while `vendor` imported `react`. ES modules in a cycle evaluate one side before the other's exports exist, so a library calling `React.memo` at module scope got `undefined` and nothing mounted. Every server-side signal was green throughout: the HTML and assets returned 200, TLS, the proxy and the health check were all correct, and `verify-deployment.sh` passed 15 of 16. |
| **Status** | **Fixed** — React, react-dom, scheduler and react-is ship in one chunk; only leaf libraries get their own. |
| **Owner** | Senior engineer |
| **Evidence** | Reproduced in Chromium against the built output (`#root` empty, `Cannot read properties of undefined (reading 'memo')`), and confirmed fixed (20,604 characters rendered, no console errors). `scripts/check-bundle.mjs` and `scripts/smoke-built-app.mjs` were both run against the broken build and both fail on it. |
| **Remaining** | None for this defect. The wider lesson is recorded in AH-015: the journey suite runs against the Vite dev server, which serves unbundled modules, so no test had ever opened the production build. The smoke test now does, in CI. |

### AH-029 — Vulnerable dependencies shipped in the production image
| | |
|---|---|
| **Impact** | Found while reviewing the dependency tree. The production dependency tree carried 11 advisories, one critical: `proxy-addr` was vulnerable to IP spoofing via an IPv4-mapped IPv6 trust subnet — directly on the `trust proxy` path AH-028 had just enabled, so the rate-limit key could be forged after all. Also `body-parser` (size enforcement silently disabled by an invalid limit), `qs`, `lodash`, `dompurify` and `ws`. |
| **Status** | **Fixed** — `proxy-addr` 2.0.8, `body-parser` 1.20.9, `qs` pinned to 6.17.1 through an override because Express pins a vulnerable range, `resend` 6.37.0. Production tree down to 2 moderate from 11 including 1 critical. |
| **Owner** | Senior engineer |
| **Evidence** | `npm audit --omit=dev`. |
| **Remaining** | `react-router` 6 has an open-redirect advisory (backslash in `<Link>` and `useNavigate`) fixed only in 7.x, which is a breaking migration and deliberately not done mid-deploy. Audit every `navigate()` call that takes a user-supplied value, then schedule the upgrade. No automated check runs this yet — `npm audit --omit=dev` belongs in CI. |

### AH-028 — Rate limiting saw the proxy, not the visitor
| | |
|---|---|
| **Impact** | Found while deploying. Express was not configured to trust the reverse proxy, so `req.ip` was `127.0.0.1` on every request behind Nginx. Both IP limiters key on `req.ip`, so the entire internet shared one bucket: the public lead endpoint's budget of five submissions a minute was the budget for the whole platform, and a single noisy source locked out every genuine enquiry. `req.secure` was also false on HTTPS. |
| **Status** | **Fixed** — `app.set('trust proxy', config.trustProxy)`, defaulting to `loopback`. |
| **Owner** | Senior engineer |
| **Evidence** | `server/__tests__/trustProxy.test.js`. Proves the real address is used, and that a caller sending its own `X-Forwarded-For` cannot shift the bucket — Nginx's `$proxy_add_x_forwarded_for` appends the true peer last and Express reads from the right. A test also pins why the value is not `true`, which would take the attacker-controlled left-most entry. |
| **Remaining** | If a CDN is ever placed in front of Nginx, `TRUST_PROXY` must name its address ranges, or every visitor through the CDN shares a bucket again. |

### AH-019 — Rate limits are per process
| | |
|---|---|
| **Impact** | Limits are enforced in one process's memory. With more than one instance the effective limit multiplies; a restart clears counters. |
| **Status** | **Open** — accepted for a single instance |
| **Remaining** | Move to a shared store before horizontal scaling. |

### AH-020 — No payment provider integration
| | |
|---|---|
| **Impact** | Funding and payouts are disabled, so the commercial model cannot operate. |
| **Status** | **Open** — blocks revenue, not security |
| **Remaining** | Select a provider, confirm it supports **payouts** and not only collections, implement server-side with signed webhooks. |

---

## P2 — before enterprise expansion

### AH-014 — Lint had no configuration
**Code fixed.** 143 warnings remain; burn down incrementally.

### AH-021 — No monitoring, backups or disaster recovery evidence
**Open.** No error tracking, no backup verification, no RPO/RTO targets. A
backup that has never been restored is not proven recovery.

### AH-022 — `supabase.js` falls back to a placeholder URL
**Open.** A misconfigured build starts and fails opaquely instead of refusing
to start. Mirror the server's `validateConfig()` behaviour.

### AH-023 — Bundle size
**Open.** A single 1.7 MB JavaScript chunk (449 kB gzipped). Code-split before
optimising anything else.

---

## Items requiring access this review did not have

These cannot be assessed from source and have no status yet:

| Area | Question |
|---|---|
| Storage | Are verification-document buckets private, and are their policies correct? |
| Secrets | Has any key been committed to git history or exposed in deployment logs? |
| Data | Do real users, leads or verification documents already exist? |
| Backups | Do backups exist, and has a restore ever been tested? |
| POPIA | Is there a personal-data inventory, retention policy and breach procedure? |
| Dependencies | `npm audit` results against the installed tree. |
