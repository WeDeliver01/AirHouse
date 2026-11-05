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
| **Remaining** | Move `RESEND_API_KEY` into the host's secret manager and remove any Replit connector reliance. |

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
