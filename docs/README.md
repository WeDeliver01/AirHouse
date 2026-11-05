# AirHouse — Engineering Documentation

Produced during the Phase 0 enterprise-readiness review, 5 November 2026.

## Read in this order

1. **[PHASE_0_REPORT.md](PHASE_0_REPORT.md)** — what was found, what was
   fixed, answers to the eleven handover questions, effort estimate and the
   recommended next five days. Start here.

2. **[SECURITY_AUDIT.md](SECURITY_AUDIT.md)** — every finding with an `AH-xxx`
   reference, marked Confirmed or Unverified, including two corrections to the
   original audit and six findings it did not identify.

3. **[MIGRATION_HISTORY.md](MIGRATION_HISTORY.md)** — why the migration series
   cannot be trusted as a record of the live database, and the read-only
   queries to establish the true state. **Read this before applying anything
   to production.**

4. **[RISK_REGISTER.md](RISK_REGISTER.md)** — tracked risks with impact,
   remediation, evidence, owner and what remains.

5. **[FINANCIAL_ARCHITECTURE.md](FINANCIAL_ARCHITECTURE.md)** — the integrity
   layer that exists, the provider integration that does not, and the
   reconciliation required before enabling payments.

6. **[PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md)** — the intended access
   model, to test the live policies against.

## Running the checks

```bash
npm install

npm run lint       # ESLint — 0 errors expected
npm test           # 74 unit tests
npm run test:db    # 41 database assertions (needs local PostgreSQL)
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
