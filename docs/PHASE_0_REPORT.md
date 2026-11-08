# AirHouse — Phase 0: Discovery and Initial Remediation

**Date:** 5 November 2026
**Prepared for:** Airhouse Product Team
**In response to:** *Enterprise Readiness: Technical Audit & Engineering Handover* (4 November 2026)

---

## 1. Headline

I agree with the audit's recommendation: **keep the architecture, fix the
engineering.** React, Supabase and Express are a reasonable foundation. The
problems are not architectural taste — they are specific, identifiable defects.

I also agree with the no-go for a real-money launch, and I would put it more
strongly in one respect. The audit assessed authorization as "critical review
required". Having read the policies and the application code together, the
position is more definite than that:

> **An authenticated user could very likely set their own wallet balance to
> any number and withdraw it.** Not through a subtle flaw — through a single
> line in the browser console.

I cannot confirm it is live, because the deployed database was not inspected.
But the application itself wrote wallet balances from the browser in five
places, which means a permissive policy must exist for the product to work at
all. Treat it as live until the verification queries in
`docs/MIGRATION_HISTORY.md` prove otherwise.

Two further defects of the same class were not in the audit:
- Sign-up metadata chose the account role, so calling the Supabase auth API
  directly with `{"role":"admin"}` very likely created an admin (AH-003).
- A developer could credit their own wallet any amount with no payment taken
  (AH-013).

---

## 2. What was done

### Discovery
- Inventoried the codebase: 203 files, 37 database tables, 20 migration files.
- Read and verified every finding in the uploaded audit against the source.
- Confirmed 14 findings, corrected 2, and added 7 the audit did not identify.

### Remediation (four commits)

| Area | Change |
|---|---|
| Notification service | Authentication, recipient authorization, CORS allowlist, rate limits, batch and body caps, payload validation, de-Replit credentials, central HTML escaping, PII out of logs |
| Financial integrity | `016_financial_integrity.sql` — atomic, idempotent, row-locking functions; append-only ledger; non-negative balance constraint; operation audit table |
| Access control | `017_access_control_hardening.sql` — client write privileges revoked on financial tables; permissive wallet policies removed; privileged profile columns protected; sign-up role clamped |
| Client payment layer | All money operations routed through the database functions; fail-closed gateway; invented amounts and unpaid credits removed |
| Testing and CI | 74 unit tests, 41 database assertions, GitHub Actions pipeline with lint, tests, build, secret scan, dependency audit and production-safety gates |

### Evidence

Everything below was run, not asserted:

```
ESLint                   0 errors (143 pre-existing warnings)
Vitest                   74 passed / 74
Database integrity       41 passed / 41
Production build         succeeds
Concurrency test         2 simultaneous releases -> 1 paid, 1 refused
```

The database suite runs against a throwaway PostgreSQL instance with a shim
for `auth.uid()`, so it needs no Supabase project:

```bash
npm run test:db
```

---

## 3. A note on how the repository was found

The GitHub repository `WeDeliver01/AirHouse` contained **no application
source** — only design screenshots, reference zips, a PDF and planning notes.
The application came from the uploaded `airhouse-site-codebase.zip`.

I committed that codebase as a baseline first, so the remediation is reviewable
as a diff. If the repository was expected to already hold the application, that
discrepancy is worth understanding — it suggests deployment has been happening
from somewhere other than this repository, which matters for AH-017.

---

## 4. Answers to the eleven questions

**1. Which Supabase project is the authoritative production database?**
`dmhhkearepriigdcbrxy.supabase.co`, from the applied-evidence records and the
supplied environment file. Whether it is the *only* project is unconfirmed —
I had no dashboard access.

**2. Have `quick_setup.sql` or `fix_auth.sql` ever been executed against a
shared or production database?**
Not provable from the repository, but the evidence points to yes. The
application wrote a `pending_balance` column that only `quick_setup.sql`
defines, and omitted the `NOT NULL` `net_amount` that migration 004 requires.
The live schema therefore resembles the `quick_setup.sql` lineage. **This is
the single most important question to settle**, because both scripts install
permissive policies and blanket grants.

**3. Are any real users, property leads or creator verification documents
currently stored?**
Unknown — requires database access. Section 6 of
`docs/MIGRATION_HISTORY.md` has the counting queries. This determines whether
this is a clean fix or a live incident.

**4. Is any real payment or payout functionality currently enabled?**
No. The gateway was hard-coded to `test`, and both provider integrations were
stubs. No real money has moved. But balances may exist that were never backed
by payment (AH-011, AH-013) — those need reconciling before payments are
switched on.

**5. Which payment provider, and what payout mechanisms does it support?**
Undecided. My recommendation: choose on whether the provider supports
**programmatic payouts to third-party bank accounts**, not on collection
features. Several South African gateways do not, which would force a manual,
dual-approved payout process — a materially different design. Confirm in
writing before committing.

**6. Where is the application currently hosted?**
Indeterminate. The code carries Replit markers (`REPLIT_CONNECTORS_HOSTNAME`,
`REPLIT_DEV_DOMAIN`), migrations were applied by a "Replit task agent", and
`vite.config.js` sets `allowedHosts: true`. Replit coupling has been removed
from the email path; the hosting decision is yours.

**7. What is the current backup and restoration arrangement?**
No evidence of either in the repository. Assume none until proven. Supabase's
automatic backups may exist on the plan, but an untested backup is not proven
recovery.

**8. Are all major workflows connected to real database records?**
Mostly yes — more so than `ASSESSMENT.md` suggests; that document is stale.
The pages query Supabase properly. The gaps are not demo data but integrity:
operations that wrote several tables without a transaction, and amounts the
client decided.

**9. What are the outstanding technical debts and architectural constraints?**
Migration drift (AH-017) is the one that blocks everything else. Then: no
payment provider, rate limits that do not survive multiple instances, no
monitoring or backups, a 1.7 MB single JavaScript chunk, and 143 lint warnings.

**10. What is the estimated engineering effort to a controlled production
launch?**
Assuming one experienced full-stack engineer with Supabase and payments
experience:

| Phase | Effort |
|---|---|
| Phase 0 completion — live verification, schema reconciliation, deploy the two migrations | 1–2 weeks |
| Phase 1 — remaining RLS work across ~30 tables, storage, admin MFA, lead abuse controls | 3–4 weeks |
| Phase 2 — payment provider, webhooks, reconciliation, payouts | 4–6 weeks |
| Phase 3 — workflow verification end to end | 2–3 weeks |
| Phase 4 — monitoring, backups, DR, background processing | 2–3 weeks |
| **To a controlled launch** | **12–18 weeks** |

Excludes: independent penetration test (2–3 weeks including retest), legal
review of the funds flow, and POPIA work. Both should run in parallel from
Phase 2, not at the end.

The largest uncertainty is question 3. If real user data and balances exist,
add 2–4 weeks for reconciliation and possible breach-notification obligations.

**11. (Implicit) Is a rebuild warranted?**
No. The defects are specific and fixable, and the fixes are largely done. A
rebuild would discard working product surface and reintroduce the same class of
mistakes.

---

## 5. What I could not do

This was a static review plus local database testing. I had no access to the
Supabase project, the hosting environment, git history or deployment logs.

Unaddressed, and needing live access:

1. The actual deployed RLS policies and grants (AH-001, AH-009)
2. Storage bucket privacy, especially verification documents
3. Whether credentials are exposed in git history or deployment logs
4. Whether real users, leads or documents exist
5. Backup existence and restore verification
6. POPIA posture

**The two migrations in this branch must not be applied to production until
the live schema is dumped and reconciled.** They are written defensively and
tested locally, but the deployed schema is unconfirmed.

---

## 6. Recommended next five working days

| Day | Work |
|---|---|
| 1 | Run the read-only queries in `docs/MIGRATION_HISTORY.md` against production. Settle questions 1–3. Take a backup and **test the restore**. |
| 2 | If AH-001 or AH-003 are live: treat as an incident. Audit `profiles` for illegitimate admin roles and `wallet_transactions` for unbacked credits. |
| 3 | Restore a copy, apply `016` and `017` to it, run `npm run test:db`, exercise the app against the copy. |
| 4 | Apply to production in a maintenance window. Re-run the verification queries. Remove `email` from the public lead-capture query (AH-008). |
| 5 | Begin AH-009 for the remaining tables, personal-data tables first. Set up error monitoring. |

A note on sequencing: the audit's ten-day plan puts financial architecture on
day 5. I would not start it until day 3's verification is done, because if the
live database turns out to carry permissive wallet policies with real balances
behind them, that becomes the priority over new architecture.

---

## 7. One caution about this work

Everything I fixed, I verified — but I verified it against a *local*
PostgreSQL instance built from the migration files, not against your database.
The suite proves the migrations are correct and do what they claim. It does
not prove they will apply cleanly to a schema I have never seen.

Given the drift evidence in AH-017, expect at least one surprise when `016` or
`017` first meets the real schema. That is why every step above routes through
a restored copy first. Please don't shortcut it.
