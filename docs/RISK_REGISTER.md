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
| **Impact** | Anyone can send mail through AirHouse's mail relay to any address. Domain reputation loss, phishing in AirHouse's name, provider suspension. |
| **Remediation** | Auth, recipient authorization, CORS allowlist, rate limits, batch and body caps. |
| **Status** | Code fixed |
| **Owner** | Senior engineer |
| **Remaining** | Set `ALLOWED_ORIGINS`, `SUPPORT_INBOX_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY` in the deployment. Check the mail relay's sending logs for prior abuse. |

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
| **Remaining** | None. The Replit connector and the provider SDK are both removed; email is plain SMTP, configured in `deploy/.env.production` at mode 600. |

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

### AH-029 — Vulnerable dependencies shipped in the production image
| | |
|---|---|
| **Impact** | Found while adding the SMTP transport. The production dependency tree carried 11 advisories, one critical: `proxy-addr` was vulnerable to IP spoofing via an IPv4-mapped IPv6 trust subnet — directly on the `trust proxy` path AH-028 had just enabled, so the rate-limit key could be forged after all. Also `body-parser` (size enforcement silently disabled by an invalid limit), `qs`, `lodash`, `dompurify` and `ws`. |
| **Status** | **Fixed** — `proxy-addr` 2.0.8, `body-parser` 1.20.9, `qs` pinned to 6.17.1 through an override because Express pins a vulnerable range. Production tree down to 2 moderate from 11 including 1 critical. |
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
