# AirHouse — Migration History and Safe Deployment Procedure

**This is the first thing to resolve.** Until the live schema is known, no
migration in this repository should be applied to production — including the
two added by this remediation work.

---

## The problem

The migration series in `supabase/migrations/` is not a reliable record of what
is deployed.

### Evidence from the application code

The strongest signal does not come from the SQL at all. The original
`src/lib/payments.js` wrote:

```js
.update({ balance: ..., pending_balance: ... })   // pending_balance
```

and inserted `wallet_transactions` rows without `net_amount`.

Migration `004_schema_v3_wallets.sql` defines `wallets` with an
`escrow_balance` column and **no** `pending_balance`, and defines
`wallet_transactions.net_amount` as `NOT NULL`. If the live database matched
004, every payout request in the application would have failed.

`quick_setup.sql` defines `wallets` **with** `pending_balance` and creates no
`wallet_transactions` table at all.

**The deployed schema therefore resembles `quick_setup.sql` plus ad-hoc
patches — not the numbered migration series.** This needs confirming, but plan
for it.

### Evidence from the repository

| Problem | Detail |
|---|---|
| Duplicate numbering | Four `011_*`, three `013_*`, two `014_*` files |
| Loose scripts | Nine `.sql` files directly in `supabase/`, outside `migrations/` |
| Destructive scripts in the tree | `quick_setup.sql` drops all policies on `profiles`, `creator_profiles` and `wallets`, then installs `allow_all_*`. `002_reset_schema.sql` resets the schema. |
| Self-declared drift | `_BUNDLED_PRODUCTION_CATCHUP.sql` header: *"Combines every migration that was added in code but never applied to the live Supabase project."* |
| Sparse evidence | Only two migrations have applied-evidence records |

### What is known to be applied

From `supabase/migrations/applied_evidence/`:

| Migration | Applied (UTC) | Project |
|---|---|---|
| `011_disputes_contracts_immutability.sql` | 2026-04-30 03:54 | `dmhhkearepriigdcbrxy` |
| `014_verification_requests.sql` | 2026-04-30 04:25 | `dmhhkearepriigdcbrxy` |

Both were applied by a Replit task agent over the session pooler as role
`postgres`. The status of every other migration is unknown.

### The specific danger

`quick_setup.sql` is written to be re-runnable and ends by installing
`allow_all_profiles`, `allow_all_creator_profiles` and `allow_all_wallets`.
Running it — or any script that includes it — **after** the hardening
migrations would silently undo them, because it drops every existing policy on
those tables first.

Do not run `quick_setup.sql` or `fix_auth.sql` against any shared database
again. They should be deleted or moved to an `archive/` directory once the
live schema is reconciled.

---

## Procedure: establishing the true state

**Start here, and run one command.** `scripts/inspect-database.sh` performs
every check in this section in a single read-only pass and prints a report:

Leave the password out of the URL. The script prompts for it without echoing,
and passes it to `psql` through the environment — a password in a command-line
argument is visible to every user on the machine through `ps`, and stays in
your shell history afterwards.

```bash
./scripts/inspect-database.sh 'postgresql://postgres@db.<ref>.supabase.co:5432/postgres' \
  | tee inspection-$(date -u +%Y%m%d).txt
```

The session is opened with `default_transaction_read_only=on`, so the server
itself rejects any write — the guarantee is PostgreSQL's, not the script's.

**Which connection string.** Supabase offers three, and only two work here:

| | Port | Use it? |
|---|---|---|
| Direct, `db.<ref>.supabase.co` | 5432 | Yes — but IPv6-only on projects created since early 2024 |
| Session pooler, `aws-*.pooler.supabase.com` | 5432 | Yes — IPv4, keeps session settings |
| Transaction pooler | 6543 | **No** — drops session settings, so the read-only guarantee does not hold, and `pg_dump` is unreliable |

If the direct host fails with *could not translate host name* or *network is
unreachable*, the host has no IPv6. That is not a wrong password — switch to
the session pooler string from the dashboard's **Connect** dialog.

**Never paste a database password into a chat, an issue or a commit.** If one
is exposed, rotate it immediately: Project Settings → Database → Reset
database password. Nothing in this application uses it — the frontend uses the
anon key and the server uses the service role key — so rotating it costs
nothing.

The report answers, in order: whether this database has ever been managed by
`apply-migrations.sh`; which of the hardening migrations are already present;
every permissive policy; every table a browser client can write to directly;
any table with RLS off; which `wallets` lineage is deployed; how many rows are
in each table that matters; who holds admin or super-admin; and the total
balance recorded.

The individual queries are below, for running by hand or adapting.

### 1. Capture the schema

```bash
pg_dump --schema-only --no-owner --no-privileges \
  "postgresql://postgres:<password>@<host>:5432/postgres" \
  > production_schema.sql
```

### 2. List every policy

```sql
SELECT schemaname, tablename, policyname, cmd,
       qual AS using_clause, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Look for: `qual = 'true'`, `with_check = 'true'`, any policy named
`allow_all_*`, and any `FOR UPDATE` policy whose `with_check` is null.

### 3. List every grant

```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
ORDER BY table_name, grantee;
```

Every row here is a table a client can write directly.

### 4. Confirm tables RLS is not enabled on

```sql
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
```

Should return zero rows.

### 5. Check the wallet schema variant

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'wallets'
ORDER BY ordinal_position;
```

`pending_balance` present and `escrow_balance` absent indicates the
`quick_setup.sql` lineage.

### 6. Check for data

```sql
SELECT 'profiles' AS t, count(*) FROM profiles
UNION ALL SELECT 'leads', count(*) FROM leads
UNION ALL SELECT 'campaigns', count(*) FROM campaigns
UNION ALL SELECT 'wallet_transactions', count(*) FROM wallet_transactions
UNION ALL SELECT 'payout_requests', count(*) FROM payout_requests
UNION ALL SELECT 'creator_verifications', count(*) FROM creator_verifications;
```

This determines whether the remediation is a clean fix or a live incident. Any
non-trivial count in `wallet_transactions` or `payout_requests` means balances
must be reconciled before payments are enabled.

### 7. Look for roles that were never legitimately granted

```sql
SELECT p.id, p.email, p.role, p.created_at
FROM profiles p
WHERE p.role = 'admin'
   OR COALESCE(p.is_super_admin, false) = true
ORDER BY p.created_at;
```

Given AH-003, any admin not recognised should be treated as a compromise.

---

## Procedure: applying the new migrations

Once the above is complete:

1. **Back up, and verify the backup restores.** A backup that has never been
   restored is not proven recovery.
2. **Restore a copy** into a separate Supabase project or a local PostgreSQL
   instance.
3. **Run the suite** against that copy:
   ```bash
   npm run test:db
   ```
   It applies `016` and `017` and asserts 41 properties.
4. **Apply `016` then `017`** to the restored copy, in that order — `017`
   depends on `fin_is_super_admin()` from `016`.
5. **Re-run the read-only queries** above against the copy. Expect:
   - zero rows from `security_review_anon_write_grants` for `wallets`,
     `wallet_transactions`, `payout_requests`, `financial_operations`
   - zero permissive policies on those tables
6. **Exercise the application** against the copy: sign up, create a campaign,
   submit a lead, request a payout. Anything that was relying on a permissive
   policy will fail here — which is the point of doing it on a copy.
7. **Apply to production** in a maintenance window, in a single transaction,
   with a fresh backup taken immediately beforehand.

---

## Target state

- One ordered, gap-free migration series with no duplicate numbers.
- Every migration recorded in a `schema_migrations` table in the database, so
  "what is applied" is a query rather than an archaeology exercise.
- `quick_setup.sql`, `fix_auth.sql` and the other loose scripts archived out of
  the way.
- Migrations applied only through CI, never by hand over a pooler connection.
