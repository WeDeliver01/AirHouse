# AirHouse — Engineering Documentation

Produced during the Phase 0 enterprise-readiness review, 5 November 2026.

## Read in this order

1. **[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)** — the readiness
   checklist scored line by line with evidence: 29 of 33 criteria met, what
   was found along the way, and the one remaining step. **Start here.**

2. **[DEPLOYMENT.md](DEPLOYMENT.md)** — getting airhouse.co.za live on a VPS
   behind your existing Nginx, and what to check afterwards.

3. **[PHASE_0_REPORT.md](PHASE_0_REPORT.md)** — what was found, what was
   fixed, the effort estimate and the recommended next five working days.

4. **[SECURITY_AUDIT.md](SECURITY_AUDIT.md)** — every finding with an `AH-xxx`
   reference, marked Confirmed or Unverified, including two corrections to the
   original audit and seven findings it did not identify.

5. **[MIGRATION_HISTORY.md](MIGRATION_HISTORY.md)** — why the migration series
   cannot be trusted as a record of the live database, and the read-only
   queries to establish the true state. **Read this before applying anything
   to production.**

6. **[RISK_REGISTER.md](RISK_REGISTER.md)** — tracked risks with impact,
   remediation, evidence, owner and what remains.

7. **[RUNBOOK_OPERATIONS.md](RUNBOOK_OPERATIONS.md)** — the daily and weekly
   work: confirming bank transfers, paying creators, reconciling, verifying
   backups.

8. **[RUNBOOK_INCIDENTS.md](RUNBOOK_INCIDENTS.md)** — what to do when
   something is wrong in production.

9. **[FINANCIAL_ARCHITECTURE.md](FINANCIAL_ARCHITECTURE.md)** — the integrity
   layer that exists, the provider integration that does not, and the
   reconciliation required before enabling payments.

10. **[PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md)** — the intended access
   model, to test the live policies against.

## Running the checks

```bash
npm install

npm run test:all   # lint, unit, database and journey suites together
```

Or individually:

```bash
npm run lint       # ESLint — 0 problems expected
npm test           # 168 unit tests
npm run test:db    # 137 database assertions (needs local PostgreSQL)
npm run test:e2e   # 38 end-to-end journeys
npm run build      # production build
```

`npm run test:db` creates a throwaway PostgreSQL cluster, applies migrations
016 and 017 over a baseline schema, and asserts authorization, idempotency,
ledger immutability, concurrency safety and the grant posture. It does not
touch any Supabase project.

## Two things not to do

- **Do not run `supabase/quick_setup.sql` or `supabase/fix_auth.sql` against a
  shared database.** Both drop existing policies and install permissive ones;
  running either after the hardening migrations silently undoes them.
- **Do not apply migrations 016 or 017 directly to production.** The deployed
  schema has not been confirmed to match this repository. Restore a copy and
  apply there first.
