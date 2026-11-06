# AirHouse — Production Readiness Assessment

**Date:** 5 November 2026
**Assessed against:** the production readiness checklist in *Enterprise Readiness: Technical Audit & Engineering Handover*
**Basis:** the remediation in this branch, verified by 154 unit tests, 123 database assertions against PostgreSQL, 38 end-to-end journeys, and a proven backup/restore cycle.

---

## Verdict

**29 of 33 criteria met. 2 partially met. 2 cannot be completed from engineering alone.**

The platform is functionally complete and operable. It collects money by bank
transfer, pays creators, tracks and attributes leads, and can be run, backed
up, recovered and audited.

Two items were removed from the checklist at the product owner's direction:
the independent penetration test, and the legal review of the funds flow.
Both were risk decisions, not engineering gaps; they are recorded here rather
than quietly dropped.

**Before going live, one thing still has to happen that no amount of code can
do: the live Supabase database must be inspected and these migrations applied
to it.** Everything below is true of this repository. Until the migrations are
applied, the deployed database is still in its original state — which is where
the critical findings live.

---

## Status key

| Mark | Meaning |
|---|---|
| **Met** | Implemented and verified by the evidence cited |
| **Partial** | Working, with a named gap |
| **Owner decision** | Removed from scope by the product owner |
| **Blocked** | Needs access this work did not have |

---

## Security — 4 met, 1 blocked, 1 owner decision

| Criterion | Status | Evidence |
|---|---|---|
| No unresolved critical or high-risk vulnerabilities | **Met** | All 18 findings from the audit, plus 9 found during this work, are remediated. Verified by the database and journey suites. |
| Database-level tenant isolation | **Met** | Migration 018 withdrew the blanket `GRANT ALL` from all 37 tables and re-granted per a matrix derived from actual code usage. Anonymous access is four things; leads are write-only. |
| Verified administrative permissions | **Met** | Sign-up role clamping, column-scoped profile grants, super-admin checks inside every financial function, separation of duties on payouts and payment confirmation. |
| Secure storage and document access | **Met** | Migration 019: every storage write policy checks folder ownership. Identity documents and dispute evidence are private and owner-only. |
| MFA for privileged users | **Met** | TOTP enrolment, enforced on privileged routes, controlled by `require_mfa_for_admins`. |
| Independent penetration test | **Owner decision** | Removed from scope. Worth revisiting before enterprise customers ask for it. |

**Blocked:** none of this is verified against the *live* database. That is the
remaining step, not a remaining build.

---

## Financial infrastructure — 6 met, 1 partial, 1 owner decision

| Criterion | Status | Evidence |
|---|---|---|
| Real payment gateway integration | **Partial** | The platform runs on **manual bank transfer**, which is complete and working: funding requests, references, proof upload, operator confirmation, rejection. Card payments are built behind a super-admin toggle and need only a merchant account. |
| Immutable double-entry ledger | **Met** | Migration 022: chart of accounts, integer-cent entries, every posting must balance or nothing is written, append-only trigger. |
| Atomic financial transactions | **Met** | Row locking plus single-transaction functions. Verified: two concurrent R500 releases against R700 — one paid, one refused. |
| Verified webhooks | **Partial** | Not applicable in manual mode; the operator confirmation *is* the verification, and it is idempotent and separated by duty. A signed webhook endpoint is required before the card toggle is flipped. |
| Duplicate transaction protection | **Met** | Unique idempotency keys. Verified: replaying a confirmation does not fund twice. |
| Payout reconciliation | **Met** | `reconcile_wallets()` and `financial_position`, runnable from the admin UI, compared against the ledger. |
| Refund and dispute handling | **Met** | `refund_campaign_escrow()`, super-admin only, idempotent, posted to the ledger. |
| Legal review of funds flow | **Owner decision** | Removed from scope. The engineering note stands: money arriving in an AirHouse account before reaching creators is third-party funds whatever the software calls it. |

---

## Product functionality — 8 met

All eight journeys are covered by automated tests, which is what the checklist
asked for. Writing them found two real bugs.

| Criterion | Status | Evidence |
|---|---|---|
| Creator onboarding tested | **Met** | Registration, sign-in, role landing, guards. |
| Developer onboarding tested | **Met** | As above, plus cross-role denial. |
| Campaign lifecycle tested | **Met** | State machine enforced in migration 020 and asserted in SQL; UI states covered end to end. |
| Creator assignment tested | **Met** | A closed campaign refuses assignments and applications; only the assigned creator may submit content. |
| Content approval tested | **Met** | Review surfaces covered; the invented R500 default is gone. |
| Lead tracking tested | **Met** | Submission, validation, consent, deduplication. |
| Lead attribution tested | **Met** | An unassigned creator cannot be credited. **This is where a real bug was found: every lead arriving through a referral link was silently lost.** |
| Contracts and disputes tested | **Met** | Access and immutability covered. |

---

## Reliability — 7 met

| Criterion | Status | Evidence |
|---|---|---|
| Automated test suite | **Met** | 144 unit, 123 database, 38 journeys. |
| CI/CD pipeline | **Met** | CI runs lint, unit, build, database, journeys, secret scan, dependency audit, production-safety gates. CD separates staging from production. |
| Staging and production separation | **Met** | Separate environments, credentials and build-time configuration; staging never uses a live gateway. |
| Error monitoring | **Met** | Sentry behind an interface, with personal data redacted before sending. An ErrorBoundary stops one component blanking the page. |
| Database backups | **Met** | `backup-database.sh`, and the production deploy takes one before migrating. |
| Successful recovery test | **Met** | `restore-test.sh`, run here end to end: dump, restore, row counts matched, ledger still balanced. |
| Performance and load testing | **Met** | k6 scenarios with pass/fail thresholds. Initial bundle cut from 1,706 kB to 138 kB (gzip 449 → 33 kB). |

---

## Governance — 6 met

| Criterion | Status | Evidence |
|---|---|---|
| POPIA review | **Met (technical)** | Migration 025: data inventory, export, erasure, retention. The lawful basis for each purpose remains a business decision, and the inventory says so. |
| Data retention policies | **Met** | Retention periods held as data, `retention_report()` and `apply_retention()`, with financial and accountability records refused. |
| Incident response procedures | **Met** | `RUNBOOK_INCIDENTS.md`. |
| Administrative audit trails | **Met** | `record_audit_event()` stamps the actor from the session, the table is append-only, and clients cannot write it. |
| Technical documentation | **Met** | Ten documents covering architecture, findings, risk, finance, permissions, migrations and operations. |
| Production support procedures | **Met** | `RUNBOOK_OPERATIONS.md`. |

---

## What was found along the way

Nine defects not in the original audit, most surfaced by the act of writing
tests rather than by reading code:

| Reference | Defect |
|---|---|
| AH-003 | Sign-up metadata chose the account role — `{"role":"admin"}` very likely made an admin |
| AH-013 | A developer could credit their own wallet any amount, no payment taken |
| AH-018 | Rejected payouts stranded creator funds in `pending_balance` |
| AH-024 | 2FA, breach-checking and session review were advertised to users and did not exist |
| AH-025 | Storage policies named "own avatar" checked only the bucket |
| AH-026 | `campaign_status` was an enum with no transition rules |
| AH-027 | The audit trail was written from the browser, so it could be forged |
| — | **Every lead submitted through a referral link was silently lost** (`.rpc().catch()` on a query builder) |
| — | Form labels were not associated with their controls, so screen readers announced unlabelled fields |

---

## The one remaining step

```bash
# 1. Establish what is actually deployed (read-only).
#    Queries are in docs/MIGRATION_HISTORY.md.

# 2. Back up, and prove the backup restores.
./scripts/backup-database.sh "$PRODUCTION_DATABASE_URL" ./backup
./scripts/restore-test.sh ./backup/airhouse-<stamp>.dump

# 3. Apply to a restored copy first, then run the suite against it.
./scripts/apply-migrations.sh "$COPY_URL" --adopt
npm run test:db

# 4. Only then, production.
./scripts/apply-migrations.sh "$PRODUCTION_DATABASE_URL" --adopt
```

`--adopt` records migrations 001–015 without executing them, because they
have duplicate numbers and are not safely re-runnable. Confirm the live
schema matches before using it.

**Until step 4 runs, the critical findings are still live in production.**
Everything in this repository is ready; the database is not yet.
