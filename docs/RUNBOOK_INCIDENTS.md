# AirHouse — Incident Response

For when something is wrong in production. Written to be followed under
pressure, so each step is an action rather than a principle.

**First rule: stop the bleeding before you diagnose.** A platform that is
down costs less than one that is quietly paying the wrong people.

---

## Severity

| Level | Means | Response |
|---|---|---|
| **SEV1** | Money is moving incorrectly, personal data is exposed, or the platform is down | Immediately, whatever the hour |
| **SEV2** | A core journey is broken (sign-up, lead capture, payouts) | Within the hour, working hours |
| **SEV3** | A feature is degraded with a workaround | Next working day |
| **SEV4** | Cosmetic or minor | Next planned work |

If you are unsure between two levels, take the higher one.

---

## The first ten minutes

1. **Declare it.** Say in the team channel: what is wrong, which severity,
   that you are the incident lead. One named person decides; others help.
2. **Start a log.** Timestamp every action and finding as you go. Memory is
   not reliable afterwards, and the log becomes the review.
3. **Decide whether to stop the money.** If there is *any* doubt about
   financial correctness, do this before investigating:

   ```sql
   -- Stop new funding being accepted.
   SELECT set_platform_setting('payments_mode', '"manual"');
   ```

   Then check the ledger:

   ```sql
   SELECT ledger_is_balanced();
   SELECT * FROM financial_position;
   SELECT * FROM reconcile_wallets();
   ```

   `ledger_is_balanced()` returning false is a SEV1 regardless of what else
   is happening.
4. **Capture the evidence before changing anything.**

   ```bash
   ./scripts/backup-database.sh "$PRODUCTION_DATABASE_URL" ./incident-$(date -u +%Y%m%d)
   ```

---

## By symptom

### Balances look wrong, or the ledger does not balance

Do **not** correct a balance by editing it. The ledger is append-only by
design, and a manual edit destroys the evidence of what happened.

```sql
-- Where the two views disagree.
SELECT * FROM reconcile_wallets();

-- The movements behind a given campaign or person.
SELECT * FROM ledger_entries
WHERE campaign_id = '<id>' ORDER BY created_at;

-- Everything a given operation did.
SELECT * FROM financial_operations
WHERE idempotency_key = '<key>';
```

Correct only with a reversing entry, through the normal functions. If none
fits, stop and get a second person before writing anything.

### A payment was confirmed in error

A confirmed payment cannot be unconfirmed; that is deliberate. Post a refund:

```sql
SELECT refund_campaign_escrow('<campaign-id>', <amount>, 'confirmed in error', '<idempotency-key>');
```

If funds have already been released to a creator, the money has left that
campaign. Settle it as a commercial matter and record the decision in
`audit_logs` with `record_audit_event`.

### Suspected unauthorised access

1. Check who holds privilege and when they got it:

   ```sql
   SELECT p.id, p.email, p.role, p.created_at,
          EXISTS (SELECT 1 FROM super_admins s WHERE s.user_id = p.id AND s.is_active) AS super_admin
   FROM profiles p
   WHERE p.role = 'admin' OR COALESCE(p.is_super_admin, false);
   ```

   Any admin you do not recognise is an incident, not a surprise. AH-003
   made this reachable through sign-up metadata before it was fixed.

2. Review what they did:

   ```sql
   SELECT * FROM audit_logs WHERE user_id = '<id>' ORDER BY created_at DESC LIMIT 200;
   SELECT * FROM financial_operations WHERE actor_id = '<id>' ORDER BY created_at DESC;
   ```

3. Revoke, then force re-authentication:

   ```sql
   UPDATE super_admins SET is_active = FALSE WHERE user_id = '<id>';
   ```

   Then revoke sessions in the Supabase dashboard under Authentication →
   Users, and require MFA re-enrolment.

### Personal data may have been exposed

Treat as SEV1 and assume POPIA notification obligations until shown
otherwise.

1. Close the hole first — revoke the grant or policy that allowed it.
2. Establish scope: which table, which rows, how long it was reachable.
3. Record it:

   ```sql
   SELECT record_audit_event('data_exposure_investigated', '<table>', NULL,
     '{"scope":"...","duration":"...","closed_at":"..."}'::jsonb);
   ```
4. Hand the scope assessment to whoever owns privacy. The notification
   decision is theirs, and it is time-bound — do not sit on it.

### Email is being abused

The notification service is authenticated and rate limited, but check:

```bash
# Rejected recipients and rate-limit hits in the service logs
grep -E 'recipient_rejected|Rate limit' <log-source>
```

If abuse is confirmed, rotate `RESEND_API_KEY` immediately and tighten
`RATE_LIMIT_MAX_PER_USER`. Both take effect on restart.

### The site is down

1. Is it the frontend or Supabase? Check the Supabase status page first.
2. `GET /api/health` on the notification service.
3. If a deploy caused it, roll back to the previous release. Rolling
   forward under pressure is how one incident becomes two.
4. If a migration caused it, restore from the pre-deploy backup — the
   production deploy job uploads one as an artifact for exactly this.

---

## Recovery

```bash
# Prove the backup before you rely on it.
./scripts/restore-test.sh ./backup/airhouse-<stamp>.dump
```

**RPO — how much data can be lost:** 24 hours on Supabase's daily backups.
If that is too much for a platform handling money, enable point-in-time
recovery and revise this to minutes.

**RTO — how long to restore:** target 4 hours. This is only real once a
restore has been rehearsed against production-sized data; until then treat
it as an estimate.

Both targets are proposals. Confirm them against what the business can
actually tolerate.

---

## Afterwards

Within three working days, write up:

- What happened, in plain language, with a timeline.
- What the user-visible impact was, and for how long.
- Why it happened — the actual cause, not the first thing that broke.
- What was done to recover.
- What will stop it recurring, with an owner and a date.

Blame the system, not the person. A review that makes someone the cause
teaches everyone to be quiet next time, which is how a SEV2 becomes a SEV1.

Every fix from a review gets a test. If it cannot be tested, say so and
explain what will catch it instead.
