-- Seed: one developer, one assigned creator, one unassigned creator,
-- one super admin, and a campaign with R1000 in escrow.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111','dev@example.com'),
  ('22222222-2222-4222-8222-222222222222','creator@example.com'),
  ('33333333-3333-4333-8333-333333333333','outsider@example.com'),
  ('44444444-4444-4444-8444-444444444444','admin@example.com'),
  ('55555555-5555-4555-8555-555555555555','dev2@example.com');

INSERT INTO profiles (id, email, role, full_name) VALUES
  ('11111111-1111-4111-8111-111111111111','dev@example.com','developer','Dev One'),
  ('22222222-2222-4222-8222-222222222222','creator@example.com','creator','Creator One'),
  ('33333333-3333-4333-8333-333333333333','outsider@example.com','creator','Outsider'),
  ('44444444-4444-4444-8444-444444444444','admin@example.com','admin','Admin'),
  ('55555555-5555-4555-8555-555555555555','dev2@example.com','developer','Dev Two');

INSERT INTO super_admins (user_id, is_active)
VALUES ('44444444-4444-4444-8444-444444444444', TRUE);

INSERT INTO wallets (id, user_id, wallet_type, balance) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','escrow',1000.00),
  ('aaaaaaaa-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','creator',0.00),
  ('aaaaaaaa-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','developer',0.00);

-- Funded and running, so assignments and releases are valid against it.
INSERT INTO campaigns (id, developer_id, title, status, escrow_amount, escrow_wallet_id)
VALUES ('cccccccc-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
        'Test Campaign', 'active', 1000.00, 'aaaaaaaa-0000-4000-8000-000000000001');

-- A separate draft campaign, used by the lifecycle assertions so they can walk
-- the state machine from the beginning without disturbing the funded one.
INSERT INTO campaigns (id, developer_id, title, status)
VALUES ('cccccccc-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
        'Lifecycle Campaign', 'draft');

INSERT INTO campaign_assignments (campaign_id, creator_id)
VALUES ('cccccccc-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222');

INSERT INTO bank_accounts (id, user_id, bank_name, account_number)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','FNB','1234567890');

-- Opening balances: the seeded escrow of R1,000 is recorded in the ledger too,
-- so the ledger and the derived wallet balances agree before any test runs.
-- Without this the seed would be money that exists in a wallet but was never
-- accounted for, and reconciliation would (correctly) flag it.
INSERT INTO ledger_entries (transaction_id, account_code, direction, amount_cents, event_type, campaign_id, reference)
SELECT gen_random_uuid(), 'bank', 'debit', 100000, 'opening_balance',
       'cccccccc-0000-4000-8000-000000000001', 'SEED-OPENING';
INSERT INTO ledger_entries (transaction_id, account_code, direction, amount_cents, event_type, campaign_id, reference)
SELECT transaction_id, 'campaign_funds', 'credit', 100000, 'opening_balance',
       'cccccccc-0000-4000-8000-000000000001', 'SEED-OPENING'
FROM ledger_entries WHERE reference = 'SEED-OPENING' AND account_code = 'bank';

-- Fixtures for 11_pricing_checkout_tests.sql: Creator One publishes a rate
-- card, and Dev One has already started a cart against it.
INSERT INTO creator_rate_cards (id, creator_id, platform, deliverable_type, label, unit_price_cents) VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','instagram','reel','Instagram Reel',50000),
  ('eeeeeeee-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','tiktok','video','TikTok Video',80000);

INSERT INTO campaign_carts (id, developer_id, creator_id, status)
VALUES ('dddddddd-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222','draft');

INSERT INTO campaign_cart_items (cart_id, rate_card_id, platform, deliverable_type, label, quantity, unit_price_cents) VALUES
  ('dddddddd-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001','instagram','reel','Instagram Reel',2,50000),
  ('dddddddd-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','tiktok','video','TikTok Video',1,80000);
