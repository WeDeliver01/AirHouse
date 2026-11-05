# AirHouse — Role and Permissions Matrix

**Status:** proposed. This is the intended model, not a description of the
deployed database. Use it as the specification to test the live policies
against while working through AH-009.

## Roles

| Role | Who |
|---|---|
| `anon` | Unauthenticated visitor: marketing pages, marketplace, lead-capture forms |
| `creator` | Content creator applying to and delivering campaigns |
| `developer` | Property developer funding and running campaigns |
| `admin` | Operational staff |
| `super_admin` | Holds financial and privilege authority; listed in `super_admins` |

`admin` and `super_admin` are distinct. Being in `profiles.role = 'admin'` does
not grant financial authority: the financial functions check the
`super_admins` table.

## Legend

**—** no access · **own** only rows the user owns · **R** read · **W** write
· **fn** only through a database function, never a direct table write

---

## Identity

| Resource | anon | creator | developer | admin | super_admin |
|---|---|---|---|---|---|
| `profiles` — own safe fields | — | R/W | R/W | R/W | R/W |
| `profiles` — own `role`, `is_verified`, `is_super_admin` | — | — | — | — | fn |
| `profiles` — other users, private fields | — | — | — | R | R/W |
| `profiles` — public marketplace fields | R | R | R | R | R |
| `super_admins` | — | — | — | R | fn |

The `role`, `is_verified` and `is_super_admin` columns have no client `UPDATE`
grant (migration 017), on top of the trigger from migration 009.

## Campaigns and assignments

| Resource | anon | creator | developer | admin | super_admin |
|---|---|---|---|---|---|
| `campaigns` — published | R | R | R | R | R |
| `campaigns` — own drafts | — | — | R/W own | R | R/W |
| `campaigns` — financial columns | — | — | R own | R | fn |
| `campaign_applications` | — | R/W own | R own campaigns | R | R/W |
| `campaign_assignments` | — | R own | R/W own campaigns | R | R/W |
| `content_submissions` | — | R/W own | R own campaigns | R | R/W |

A creator may submit content only for an assignment they hold; a developer may
review only content on their own campaigns.

## Leads

| Resource | anon | creator | developer | admin | super_admin |
|---|---|---|---|---|---|
| `leads` — create via capture form | W | W | W | W | W |
| `leads` — read | — | attributed own only | R own campaigns | R | R |
| `leads` — update status | — | — | R/W own campaigns | R/W | R/W |

Anonymous insert is required by the product. It must be write-only: an
anonymous visitor must never read back any lead, including their own. Abuse
controls (CAPTCHA, rate limiting, duplicate detection) are still outstanding.

A creator should see *attribution counts* for their own tracking links, not the
enquirer's personal details, unless the developer explicitly shares them.

## Money

| Resource | anon | creator | developer | admin | super_admin |
|---|---|---|---|---|---|
| `wallets` — own | — | R | R | — | R |
| `wallets` — all | — | — | — | — | R |
| `wallets` — any write | — | fn | fn | fn | fn |
| `wallet_transactions` — own | — | R | R | — | R |
| `wallet_transactions` — any write | — | fn | fn | fn | fn |
| `payout_requests` — own | — | R | R | R | R |
| `payout_requests` — create | — | fn | fn | — | fn |
| `payout_requests` — approve/reject | — | — | — | — | fn, not own |
| `financial_operations` | — | R own | R own | — | R |
| `bank_accounts` | — | R/W own | R/W own | — | R |

**No role has a direct write grant on any financial table.** Every movement
goes through the functions in migration 016.

Separation of duties: `process_payout_request()` refuses when the actioning
super admin is the payout's own requester.

## Verification documents

| Resource | anon | creator | developer | admin | super_admin |
|---|---|---|---|---|---|
| `creator_verifications` / `verification_requests` — own | — | R/W own | R/W own | — | R |
| — others | — | — | — | R assigned reviewers | R |
| Identity document files | — | own | own | reviewers | R |

Identity documents are the most sensitive data the platform holds. Buckets must
be private, access time-limited via signed URLs, and every access logged.
**Not yet verified** — see AH-009.

## Messaging, contracts, disputes

| Resource | anon | creator | developer | admin | super_admin |
|---|---|---|---|---|---|
| `messages` | — | participant only | participant only | — | R |
| `contracts` | — | party only | party only | R | R/W |
| `disputes` / `dispute_messages` | — | party only | party only | R assigned | R/W |
| Dispute evidence files | — | party only | party only | R assigned | R |

Contracts are immutable once signed; amendments are new versions. Dispute
resolutions that move money go through `refund_campaign_escrow()` or
`release_campaign_escrow()` and are recorded in `financial_operations`.

---

## Tests this matrix implies

Each row is a test. The ones already automated in `supabase/tests/`:

- [x] A creator cannot release escrow to themselves
- [x] A developer cannot release another developer's campaign escrow
- [x] Escrow cannot be paid to an unassigned creator
- [x] No role holds a write grant on a financial table
- [x] Clients cannot update `profiles.role` / `is_verified` / `is_super_admin`
- [x] Sign-up cannot select a privileged role
- [x] A super admin cannot approve their own payout
- [x] A payout cannot target another user's bank account

Still to automate, as two real accounts rather than grant inspection:

- [ ] A creator cannot read another creator's profile private fields
- [ ] A developer cannot read another developer's leads
- [ ] An anonymous visitor cannot read any lead
- [ ] A creator cannot read another creator's verification documents
- [ ] A non-participant cannot read a message thread or dispute evidence
- [ ] An expired session cannot reach a protected resource
