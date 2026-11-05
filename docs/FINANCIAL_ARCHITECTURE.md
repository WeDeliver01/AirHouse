# AirHouse — Financial Architecture

**Status:** the integrity layer described in part 1 is implemented and tested.
The provider integration in part 2 is not built, and funding and payouts are
disabled until it is.

---

## Principles

1. **The browser is never authoritative.** It cannot decide an amount, a
   balance, or whether a payment succeeded.
2. **Every movement is atomic.** One transaction, or nothing.
3. **Every movement is idempotent.** A retry or duplicate webhook cannot move
   money twice.
4. **The ledger is append-only.** Mistakes are corrected with a reversing
   entry, never by editing history.
5. **Money only enters the system from a verified provider event.** Not from a
   redirect, and not from a client call.

---

## Part 1 — Integrity layer (implemented)

### Functions

All in `supabase/migrations/016_financial_integrity.sql`. Each is
`SECURITY DEFINER` with `SET search_path = public, pg_temp`, takes row locks
before reading balances, and checks authorization itself.

| Function | Who may call it | What it guarantees |
|---|---|---|
| `release_campaign_escrow` | Campaign's developer, or super admin | Creator is assigned; escrow holds the amount; both ledger sides and all balances move together |
| `refund_campaign_escrow` | Super admin | Developer derived from the campaign, not supplied by the caller |
| `request_creator_payout` | Wallet owner | Fee recomputed server-side; bank account belongs to the caller; balance hold is atomic |
| `process_payout_request` | Super admin, **not the requester** | Separation of duties; rejection returns funds and writes a reversing entry |

### Idempotency

Every function takes an idempotency key. Before doing any work it checks
`financial_operations`:

```sql
v_existing := fin_existing_operation(p_idempotency_key);
IF v_existing IS NOT NULL THEN
  RETURN v_existing || jsonb_build_object('replayed', true);
END IF;
```

The key is `UNIQUE`, so two concurrent calls with the same key cannot both
insert. Content payments key on the submission id, so approving twice is a
no-op.

### Concurrency

Rows are locked with `SELECT ... FOR UPDATE` before balances are read. A second
concurrent transaction blocks until the first commits, then re-reads the
updated balance and fails its sufficiency check.

**Verified:** two simultaneous R500 releases against an escrow holding R700 —
one succeeded, one was refused, and the ledger recorded a single payment.

### Invariants enforced by the database

- `CHECK (balance >= 0 AND pending_balance >= 0)` — balances cannot go negative
- `BEFORE UPDATE OR DELETE` trigger on `wallet_transactions` — append-only
- `UNIQUE (idempotency_key)` on `financial_operations`
- No client write grant on any financial table

---

## Part 2 — Provider integration (not built)

### Current state

Both gateway functions were stubs returning `success: false`. There is no
partial integration to finish. The simulated `test` gateway is refused in
production builds.

### Required flow — collections

```
Developer clicks Fund
  -> server creates a payment intent with the provider
     (secret key server-side only; never in the browser bundle)
  -> developer completes payment on the provider's page
  -> provider POSTs a SIGNED webhook to AirHouse
  -> server verifies the signature
  -> server checks the event id against financial_operations (idempotency)
  -> server calls a credit_campaign_escrow() function in one transaction
  -> campaign escrow is funded
```

**The redirect back from the provider is not proof of payment.** It is
user-controllable. Only the verified webhook credits escrow.

### What still needs deciding

1. **Which provider**, chosen on capability rather than brand. Confirm in
   writing that it supports **programmatic payouts to third-party bank
   accounts**, not only collections. Many South African gateways do not, and
   that changes the payout design fundamentally — possibly to a manual,
   dual-approved bank process.
2. **Webhook endpoint** with signature verification, replay protection and an
   event log.
3. **Reconciliation**: a scheduled job comparing internal balances against
   provider settlement reports, alerting on any discrepancy.
4. **Refunds and chargebacks**, including what happens when a developer charges
   back after a creator has already been paid.

### Outstanding design question: double-entry

The current ledger is a two-sided `wallet_transactions` record, which is
adequate for the present model. The uploaded audit recommends a full
double-entry ledger with an explicit chart of accounts.

That is the right destination, but it should be designed **after** the legal
funds flow is settled, because the chart of accounts depends on whether
AirHouse holds the money, the provider does, or a third-party escrow agent
does. Building it first risks modelling an arrangement that turns out not to
be permissible.

---

## Before enabling real payments

Reconciliation of what already exists comes first:

- [ ] Audit `wallet_transactions` for `deposit` rows with no provider
      reference — these are balances credited without money being received
      (AH-011, AH-013)
- [ ] Audit escrow releases for the R500 default amount (AH-012)
- [ ] Audit `payout_requests` in `failed`/`cancelled` status for funds never
      returned to the creator (AH-018)
- [ ] Correct every discrepancy with reversing entries, never by editing rows

Then the acceptance criteria from the uploaded audit:

- [ ] A developer can fund a campaign through the selected provider
- [ ] The provider confirms payment through a verified webhook
- [ ] The campaign balance updates atomically
- [ ] An approved assignment makes a creator eligible for payment
- [ ] A payout is initiated through a supported mechanism
- [ ] The internal ledger reconciles against provider settlement
- [ ] A duplicate event cannot produce a second payout

**Legal:** before AirHouse holds or controls money belonging to developers or
creators, obtain South African legal advice on the funds flow, payment
intermediary arrangements and any licensing obligations. Calling a feature a
"wallet" or "escrow" does not make the arrangement permissible.
