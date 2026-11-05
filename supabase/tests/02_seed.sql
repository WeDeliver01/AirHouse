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

INSERT INTO campaigns (id, developer_id, title, escrow_amount, escrow_wallet_id)
VALUES ('cccccccc-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
        'Test Campaign', 1000.00, 'aaaaaaaa-0000-4000-8000-000000000001');

INSERT INTO campaign_assignments (campaign_id, creator_id)
VALUES ('cccccccc-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222');

INSERT INTO bank_accounts (id, user_id, bank_name, account_number)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','FNB','1234567890');
