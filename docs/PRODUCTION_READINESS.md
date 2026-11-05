# AirHouse — Production Readiness Assessment

**Date:** 5 November 2026
**Assessed against:** the production readiness checklist in *Enterprise Readiness: Technical Audit & Engineering Handover*
**Basis:** static review of the source, plus dynamic testing of the migrations against a local PostgreSQL 16 instance. **The deployed environment was not inspected.**

---

## Verdict

**Not enterprise-ready. No-go for a real-money launch.**

**4 of 35 criteria met. 8 partially met. 21 not met. 2 cannot be assessed without access to the live environment.**

The remediation in this branch moves the security and financial-integrity
foundations from *broken* to *sound in code*. It does not move the platform to
ready, for three reasons:

1. **Nothing is verified in production.** Every P0 fix exists only in this
   repository. The deployed database has not been inspected, and the evidence
   suggests it diverged from this migration series some time ago (AH-017).
2. **No payment provider exists.** Six of the eight financial criteria depend
   on an integration that has not been started.
3. **"Tested" is the bar, and the product journeys are not tested.** All eight
   product-functionality criteria ask for tested workflows. There are no
   automated tests for any user journey — only for the units and the database
   layer.

---

## Status key

| Mark | Meaning |
|---|---|
| **Met** | Implemented and verified by evidence cited below |
| **Partial** | Materially advanced, with named gaps |
| **Not met** | Not implemented |
| **Unknown** | Cannot be determined without live access |

---

## Security — 0 met, 4 partial, 1 not met, 1 unknown

| Criterion | Status | Evidence and gap |
|---|---|---|
| No unresolved critical or high-risk vulnerabilities | **Partial** | 13 P0/P1 findings remediated in code; AH-008, AH-009, AH-017, AH-024, AH-025 remain open. None verified against production. |
| Database-level tenant isolation | **Partial** | Financial tables isolated and tested (41 assertions). The other ~30 tables still carry blanket `GRANT ALL` to `anon`/`authenticated` (AH-009), so RLS is the sole barrier on all of them. |
| Verified administrative permissions | **Partial** | Sign-up role escalation closed and tested; privileged `profiles` columns protected; super-admin checks enforced inside the financial functions. Not verified in production, and existing `admin` rows have not been audited for illegitimate grants. |
| Secure storage and document access | **Partial** | `verification-documents` and `dispute-evidence` are correctly declared **private** in migrations 014 and 011. But `supabase/create_storage_buckets.sql` creates avatar policies with **no ownership check** (AH-025), and whether any of this is applied is unknown. |
| MFA for privileged users | **Not met** | No MFA implementation anywhere in the codebase. Settings → Security offers password change only. **The Help Centre tells users 2FA is available and that passwords are breach-checked — neither is true (AH-024).** |
| Independent penetration test | **Unknown / not started** | Should follow Phase 1, not precede it. |

---

## Financial infrastructure — 2 met, 2 partial, 4 not met

| Criterion | Status | Evidence and gap |
|---|---|---|
| Real payment gateway integration | **Not met** | Both provider functions were stubs returning `success: false`. No partial work exists; this is greenfield. |
| Immutable double-entry ledger | **Partial** | Immutability **met**: an append-only trigger blocks `UPDATE`/`DELETE` on `wallet_transactions`, verified by test. Double-entry **not met**: entries are two-sided records, not a chart of accounts. Deliberately deferred until the legal funds flow is settled — see `FINANCIAL_ARCHITECTURE.md`. |
| Atomic financial transactions | **Met** | All movements run inside `SECURITY DEFINER` functions with `SELECT ... FOR UPDATE` locking. Verified: two concurrent R500 releases against R700 escrow — one paid, one refused, single ledger entry. |
| Verified webhooks | **Not met** | No webhook endpoint exists. Depends on provider selection. |
| Duplicate transaction protection | **Met** | Unique idempotency key on `financial_operations`, checked before any work. Verified: replaying a key returns the original result and moves no money; content payments key on the submission id, so double approval is a no-op. |
| Payout reconciliation | **Not met** | No reconciliation job. Depends on provider settlement reports. |
| Refund and dispute handling | **Partial** | `refund_campaign_escrow()` is implemented, super-admin-only and idempotent. Chargebacks are not handled, and there is no rule for a developer charging back after a creator has been paid. |
| Legal review of funds flow | **Not met** | Not started. Should begin now — it gates the ledger design, not the other way round. |

---

## Product functionality — 0 met, 8 not met

Every criterion here asks for a journey that is **tested**. The features
largely exist and are wired to real database records (question 8), but there
are no automated tests for any end-to-end journey. No Playwright, no component
tests, no integration tests above the database layer.

| Criterion | Status | Note |
|---|---|---|
| Creator onboarding tested | **Not met** | Feature exists; untested. Sign-up role clamping is now covered by a database test. |
| Developer onboarding tested | **Not met** | Feature exists; untested. |
| Campaign lifecycle tested | **Not met** | `campaign_status` is a proper enum, but **no transition enforcement exists** — nothing prevents a completed campaign accepting new assignments, which audit §6.12 explicitly requires. |
| Creator assignment tested | **Not met** | Assignment-before-payment *is* enforced and tested at the database layer; the assignment workflow itself is untested. |
| Content approval tested | **Not met** | Feature exists. The invented R500 default is removed (AH-012). |
| Lead tracking tested | **Not met** | Feature exists; untested. Abuse controls (CAPTCHA, duplicate detection) still absent. |
| Lead attribution tested | **Not met** | `creator_tracking_links` and `src/lib/tracking.js` exist — but the table is defined in `supabase/006_tracking_content.sql`, a **loose file outside the migrations directory**, which compounds AH-017. |
| Contracts and disputes tested | **Not met** | Migration 011 implements contract immutability and a restricted `sign_contract()`. Untested, and that migration's deployment is one of only two with applied evidence. |

---

## Reliability — 1 met, 1 partial, 4 not met, 1 unknown

| Criterion | Status | Evidence and gap |
|---|---|---|
| Automated test suite | **Partial** | 74 unit tests and 41 database assertions, all passing. No component, end-to-end or load tests. A foundation, not coverage. |
| CI/CD pipeline | **Met (CI only)** | `.github/workflows/ci.yml` runs lint, unit tests, build, database integrity, secret scan, dependency audit and production-safety gates. **No CD** — no deployment stage, no migration gating. |
| Staging and production separation | **Not met** | No staging environment. One Supabase project is referenced throughout. Migrations were applied by hand over a pooler connection. |
| Error monitoring | **Not met** | No Sentry or equivalent. The server now emits structured logs with correlation ids, which is a prerequisite, not a solution. |
| Database backups | **Unknown** | No evidence in the repository. Supabase plan-level backups may exist. |
| Successful recovery test | **Not met** | No evidence any restore has ever been performed. An untested backup is not proven recovery. |
| Performance and load testing | **Not met** | None. Known concern: a single 1.7 MB JavaScript chunk (449 kB gzipped). |

---

## Governance — 1 met, 1 partial, 4 not met

| Criterion | Status | Evidence and gap |
|---|---|---|
| POPIA review | **Not met** | Not started. The platform processes creator identity documents and third-party lead personal data — the highest-sensitivity categories. AH-008 is a live disclosure of a developer's email to anonymous visitors. |
| Data retention policies | **Not met** | No retention or deletion workflow. Legal pages exist but no implementation backs them. |
| Incident response procedures | **Not met** | None documented. |
| Administrative audit trails | **Partial** | An `audit_logs` table exists with admin-only read, and `financial_operations` now records every money movement with actor and timestamp. But `audit_logs` is written from the **client** in one place (`src/lib/disputes.js:515`), so it is not a trustworthy record — a client-written audit log can be omitted or forged. |
| Technical documentation | **Met** | This review produced six documents covering architecture, security findings, risk register, financial design, permissions model and migration procedure. Previously the only documents were a stale `ASSESSMENT.md` and setup guides containing contradictory instructions. |
| Production support procedures | **Not met** | None documented. |

---

## Two findings added by this assessment

### AH-024 — Security features are advertised to users but do not exist
**Confirmed. P1 — and a disclosure issue, not only a technical one.**

`src/data/helpContent.json:127` tells users, on a page about an account that
"holds money":

> • Use a unique password — we check new passwords against known breach lists at sign-up and reject ones that are already compromised.
> • Enable two-factor authentication from Settings → Security. We support authenticator apps (Google Authenticator, Authy, 1Password) and SMS as a fallback.
> • Review active sessions in Settings → Security → Devices.

None of the three exists. Settings → Security contains a password-change form
and nothing else; sign-up validation is a client-side regex with an 8-character
minimum. Users may be choosing weaker passwords, or declining to seek other
protections, because they believe controls are in place that are not.

**Fix:** remove the claims now; restore them when the features ship. Implement
MFA via Supabase's native enrolment for privileged accounts first.

### AH-025 — Avatar storage policies have no ownership check
**Confirmed. P1.**

`supabase/create_storage_buckets.sql:54-66` creates:

```sql
CREATE POLICY "Anyone can upload an avatar"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can delete their own avatar"
ON storage.objects FOR DELETE USING (bucket_id = 'avatars');
```

Despite the names, neither checks ownership. Any caller able to reach the
bucket can overwrite or delete **any** user's avatar.

`SUPABASE_SETUP.md` documents the correct stricter version using
`auth.uid()::text = (storage.foldername(name))[1]`. The repository therefore
contains two conflicting policy sets, and the weaker one is in the runnable
script — another instance of AH-017.

---

## Answers to the eleven questions

Fuller reasoning in `PHASE_0_REPORT.md` §4.

**1. Authoritative production Supabase project?**
`dmhhkearepriigdcbrxy.supabase.co`, per the applied-evidence records and the
supplied environment file. Whether it is the only project is unconfirmed.

**2. Have `quick_setup.sql` or `fix_auth.sql` run against a shared database?**
Not provable from the repository, but the evidence points to **yes**. The
application wrote a `pending_balance` column that only `quick_setup.sql`
defines, and omitted the `NOT NULL` `net_amount` that migration 004 requires.
**This is the most important question to settle** — both scripts install
permissive policies and blanket grants.

**3. Do real users, leads or verification documents exist?**
**Unknown.** Requires database access; counting queries are in
`MIGRATION_HISTORY.md` §6. This determines whether this is a clean fix or a
live incident.

**4. Is real payment or payout functionality enabled?**
**No.** The gateway was hard-coded to `test` and both integrations were stubs.
No real money has moved. But balances may exist that were never backed by
payment (AH-011, AH-013) and must be reconciled first.

**5. Which payment provider, and what payouts does it support?**
**Undecided.** Choose on whether it supports programmatic payouts to
third-party bank accounts, not on collection features. Several South African
gateways do not, which would force a manual dual-approved payout process — a
materially different design. Get it in writing before committing.

**6. Where is the application hosted?**
**Indeterminate.** Replit markers throughout (`REPLIT_CONNECTORS_HOSTNAME`,
`REPLIT_DEV_DOMAIN`), migrations applied by a "Replit task agent",
`vite.config.js` sets `allowedHosts: true`. The email path's Replit coupling is
removed; the hosting decision is open.

**7. Backup and restoration arrangement?**
**No evidence of either.** Assume none until proven.

**8. Are major workflows connected to real database records?**
**Mostly yes** — more than `ASSESSMENT.md` suggests; that document is stale.
The gaps were not demo data but integrity: multi-table operations without a
transaction, and amounts the client decided.

**9. Outstanding technical debt and constraints?**
Migration drift (AH-017) blocks everything else. Then: no payment provider; no
MFA; rate limits that do not survive multiple instances; no staging, monitoring
or backups; no campaign state-transition enforcement; a client-written audit
log; a 1.7 MB JavaScript chunk; 143 lint warnings.

**10. Effort to a controlled production launch?**
**12–18 weeks** for one experienced full-stack engineer with Supabase and
payments experience:

| Phase | Effort |
|---|---|
| Phase 0 completion — live verification, schema reconciliation, deploy migrations | 1–2 weeks |
| Phase 1 — remaining RLS work, storage, MFA, lead abuse controls | 3–4 weeks |
| Phase 2 — payment provider, webhooks, reconciliation, payouts | 4–6 weeks |
| Phase 3 — workflow verification and end-to-end tests | 2–3 weeks |
| Phase 4 — monitoring, backups, DR, background processing | 2–3 weeks |

Excludes the penetration test (2–3 weeks with retest), legal review of the
funds flow, and POPIA work — all three should run in parallel from Phase 2.
Add **2–4 weeks** if question 3 reveals real data needing reconciliation.

**11. Is a rebuild warranted?**
**No.** The defects are specific and fixable, and the highest-severity ones are
already fixed in code. A rebuild would discard working product surface and
reintroduce the same class of mistake.

---

## The shortest path to each remaining category

**Security** — settle AH-017, then verify AH-001 and AH-003 against production.
Work through AH-009 for the remaining tables. Implement MFA via Supabase's
native enrolment and remove the false Help Centre claims (AH-024). Book the
penetration test only after Phase 1 closes.

**Financial** — select the provider on payout capability. Start the legal
review **now**, in parallel: it determines the chart of accounts, so building
double-entry first risks modelling an impermissible arrangement. Reconcile
existing balances before enabling anything.

**Product** — add Playwright and cover the eight journeys. Add campaign
state-transition enforcement at the database layer; an enum without transition
rules is not a lifecycle.

**Reliability** — a staging project is the highest-value single step: it makes
every subsequent migration safe. Then Sentry, then a backup whose restore has
actually been tested.

**Governance** — move `audit_logs` writes server-side so the trail cannot be
forged. Start the POPIA inventory alongside the Phase 1 RLS work, since both
require classifying the same tables.
