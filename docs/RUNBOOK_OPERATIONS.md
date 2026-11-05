# AirHouse — Production Operations

The routine work of running the platform: confirming payments, paying
creators, keeping the books straight, and the checks that catch a problem
before a customer does.

---

## Daily

### Confirm incoming payments

Developers fund campaigns by EFT. Money is not credited until somebody
confirms it against the bank statement.

1. Open **Admin → Confirm Payments**.
2. For each request, find the reference (`AH-XXXXXXXX`) on the statement.
3. Check the **amount matches exactly**. A short payment is not a payment —
   reject it with a reason, and the developer can resubmit.
4. Click **Confirm received**, entering the statement line reference.

Confirming creates the campaign's funds and cannot be undone. A mistake has
to be corrected with a refund, which is deliberate friction.

You cannot confirm your own payment. The database refuses it, not just the
button.

### Check the books

```sql
SELECT ledger_is_balanced();   -- must be true
SELECT * FROM reconcile_wallets();  -- must return no rows
```

Or press **Run reconciliation** on the same screen. Any discrepancy is a
stop-work item: follow `RUNBOOK_INCIDENTS.md` rather than carrying on.

### Glance at errors

Open Sentry. You are looking for anything new or anything rising, not for
zero — a low background of noise is normal.

---

## Weekly

### Pay creators

1. **Admin → Financials → Payout requests**, filtered to pending.
2. For each, confirm the creator is verified and has a bank account on
   their profile.
3. Approve in the product **first**, which moves the request to
   `processing` and posts the accounting entries.
4. Make the EFT for the **net** amount (the fee is already deducted).
5. Record the bank reference against the request.

Approving your own payout is refused. If you are the only operator
available and a payout is yours, it waits.

### Verify a backup

```bash
./scripts/backup-database.sh "$PRODUCTION_DATABASE_URL" ./backup
./scripts/restore-test.sh ./backup/airhouse-<stamp>.dump
```

Do not skip the restore. A dump that has never been restored is a hope.

### Review privileged access

```sql
SELECT p.email, p.role, s.is_active AS super_admin, p.created_at
FROM profiles p
LEFT JOIN super_admins s ON s.user_id = p.id
WHERE p.role = 'admin' OR s.user_id IS NOT NULL
ORDER BY p.created_at DESC;
```

Anyone who no longer needs it loses it the same day.

---

## Monthly

### Retention

```sql
SELECT * FROM retention_report();
```

For each table listed, confirm the period is still right, then:

```sql
SELECT apply_retention('<table>');
```

Financial and accountability records are refused by design. That is
correct — do not work around it.

### Dependency vulnerabilities

```bash
npm audit --audit-level=high
```

Fix or record a decision for each one. "We looked and chose not to act" is
an acceptable outcome; silence is not.

### Access and configuration review

```sql
SELECT * FROM security_review_anon_write_grants;
SELECT * FROM security_review_permissive_policies;
SELECT key, value, updated_at, updated_by FROM platform_settings ORDER BY updated_at DESC;
```

Nothing should have changed without a reason you can name.

---

## Switching on card payments

Only once a provider is integrated and tested. Until then the platform runs
on bank transfer and works fully.

Before flipping it:

- [ ] Provider account live, with **payouts** supported, not just collections
- [ ] Webhook endpoint deployed, signature verification tested with a
      deliberately bad signature
- [ ] A real test payment collected, confirmed by webhook, and reconciled
- [ ] A duplicate webhook proven not to double-credit
- [ ] A refund processed end to end

Then **Admin → Settings → How payments are collected → Enable card
payments**. The change is audited. To go back, switch to bank transfer;
payments already in flight with the provider still settle.

---

## Common requests

### A developer says they paid but the campaign is not funded

Check the reference is on the statement. If it is not, the money has not
arrived — bank transfers are not instant. If it is, confirm it; the delay
was ours.

### A creator cannot request a payout

Check in order: is the balance above the minimum; is a bank account saved;
is the account verified; is a previous request still pending. The error
message names the reason.

### Someone asks for their data

```sql
-- Export: the person can do this themselves from their settings.
-- Erasure, once you have verified who they are:
SELECT erase_user_data('<user-id>', 'subject request <reference>');
```

Erasure refuses while the account holds a balance, because erasing would
strand money that belongs to them. Settle it first.

Financial and accountability records are retained and severed from the
person rather than deleted. Tell the requester that plainly; it is a lawful
basis, not an evasion.

### An admin has lost their second factor

There is no self-service reset, deliberately. Verify who they are by a
channel other than email, then remove the factor in the Supabase dashboard
under Authentication → Users, and have them enrol again immediately.

---

## Deploying

Staging goes out on every merge to `main`. Production is manual:

**Actions → Deploy → Run workflow → production**

It will refuse without production configuration, takes a backup before
migrating, and requires an approval. Do not add a path around any of those.

After deploying:

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5;
SELECT ledger_is_balanced();
```

Then load the site as a signed-out visitor and submit a test enquiry on a
staging campaign. The build passing is not the same as the product working.
