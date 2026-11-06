-- ============================================================================
-- 018_tenant_isolation.sql
--
-- Completes AH-009: removes the blanket `GRANT ALL ... TO anon, authenticated`
-- installed by quick_setup.sql and fix_auth.sql, and replaces it with an
-- explicit privilege per table derived from what the application actually does.
--
-- WHY
-- ---
-- Migration 017 fixed the financial tables. Every other table in the public
-- schema still carried `ALL` privileges for both the anonymous and the
-- authenticated role, which made Row Level Security the single and only
-- barrier on roughly thirty tables holding personal data: property leads,
-- identity verification records, private messages, dispute evidence and
-- signed contracts. One missing or permissive policy on any of them exposes
-- that table completely.
--
-- HOW THE GRANTS WERE CHOSEN
-- --------------------------
-- Not from the schema, and not from guesswork. Every `.from('<table>')` call
-- in `src/` was enumerated together with the operation chained onto it, and
-- the result is the grant matrix below. A table the client never writes does
-- not get a write grant.
--
-- Anonymous access is limited to exactly four things the public pages need:
--   - SELECT on `campaigns` and `properties`, narrowed by policy to published
--     rows only
--   - SELECT on the `creator_marketplace_public` view
--   - INSERT on `leads`, write-only, so the lead-capture form works
-- Anonymous callers cannot read a single lead back, including their own.
--
-- !! Apply to a restored copy of production first. See MIGRATION_HISTORY.md !!
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Withdraw every blanket privilege.
--
--    Done table by table rather than with a schema-wide REVOKE so that views
--    and any future table are not silently caught by it.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

-- Future tables must not inherit privileges automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- The roles still need to reach the schema itself and the sequences behind
-- any identity columns they are allowed to insert into.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1b. Fail early, and by name, if a table this migration shapes is absent.
--
--     The grant list and the `payments` section below tolerate a missing
--     table. The policy sections that follow do not: they name their table
--     inline, so an absent one aborts the migration partway, after the
--     REVOKE has already run. That leaves a database with privileges removed
--     and policies half-installed, which is worse than not starting.
--
--     Checking up front turns that into one clear message naming exactly
--     what is missing.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(t, ', ' ORDER BY t) INTO v_missing
  FROM unnest(ARRAY[
    'campaigns', 'campaign_assets', 'content_activities', 'escrow_release_rules',
    'escrow_releases', 'invoices', 'lead_activities', 'leads',
    'payment_methods', 'payment_transactions'
  ]) AS t
  WHERE to_regclass('public.' || t) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 018 shapes policies on tables this database does not have: %. '
      'Create them, or guard their sections the way `payments` is guarded.', v_missing;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Re-grant precisely.
--
--    Read-only for everything the client only displays; write only where the
--    client genuinely creates or edits rows. RLS still decides *which* rows.
-- ----------------------------------------------------------------------------

-- --- Granted table by table, skipping what this database does not have -----
--
--    These were plain GRANT statements. Any table absent from a given
--    database aborted the whole migration, which is exactly the situation
--    this series exists to handle: the live schema is NOT guaranteed to match
--    the repository. `payments`, for instance, was created by 001 and later
--    superseded by `payment_transactions`, so a GRANT on it stops a migration
--    that would otherwise be correct.
--
--    Skipping is safe. A table that is not here cannot be exposed, and the
--    blanket REVOKE above has already removed whatever privileges existed.
--    Every skip is announced, so a table missing for the wrong reason is
--    visible rather than silent.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
  v_skipped INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
    ('profiles', 'SELECT', 'authenticated'),
    ('profiles', 'INSERT', 'authenticated'),
    ('creator_profiles', 'SELECT, INSERT, UPDATE', 'authenticated'),
    ('super_admins', 'SELECT', 'authenticated'),
    ('terms_acceptances', 'SELECT, INSERT', 'authenticated'),
    ('campaigns', 'SELECT, INSERT, UPDATE, DELETE', 'authenticated'),
    ('properties', 'SELECT, INSERT, UPDATE, DELETE', 'authenticated'),
    ('campaign_assets', 'SELECT, INSERT, DELETE', 'authenticated'),
    ('campaign_applications', 'SELECT, UPDATE, DELETE', 'authenticated'),
    ('campaign_assignments', 'SELECT, INSERT, UPDATE', 'authenticated'),
    ('content_submissions', 'SELECT, INSERT, UPDATE', 'authenticated'),
    ('content_activities', 'INSERT', 'authenticated'),
    ('escrow_release_rules', 'SELECT', 'authenticated'),
    ('leads', 'SELECT, INSERT, UPDATE, DELETE', 'authenticated'),
    ('lead_activities', 'INSERT', 'authenticated'),
    ('creator_tracking_links', 'SELECT, INSERT, UPDATE', 'authenticated'),
    ('wallets', 'SELECT', 'authenticated'),
    ('wallet_transactions', 'SELECT', 'authenticated'),
    ('payout_requests', 'SELECT', 'authenticated'),
    ('financial_operations', 'SELECT', 'authenticated'),
    ('bank_accounts', 'SELECT, INSERT, DELETE', 'authenticated'),
    ('invoices', 'SELECT, INSERT', 'authenticated'),
    ('payments', 'SELECT', 'authenticated'),
    ('payment_transactions', 'SELECT', 'authenticated'),
    ('payment_methods', 'SELECT', 'authenticated'),
    ('escrow_releases', 'SELECT', 'authenticated'),
    ('creator_verifications', 'SELECT, INSERT', 'authenticated'),
    ('verification_requests', 'SELECT, INSERT, UPDATE', 'authenticated'),
    ('messages', 'SELECT, INSERT, UPDATE', 'authenticated'),
    ('disputes', 'SELECT, INSERT, UPDATE', 'authenticated'),
    ('dispute_messages', 'SELECT, INSERT', 'authenticated'),
    ('contracts', 'SELECT', 'authenticated'),
    ('creator_reviews', 'SELECT, INSERT, DELETE', 'authenticated'),
    ('developer_creator_favorites', 'SELECT, INSERT, DELETE', 'authenticated'),
    ('notifications', 'SELECT', 'authenticated'),
    ('support_tickets', 'INSERT', 'authenticated'),
    ('campaigns', 'SELECT', 'anon'),
    ('properties', 'SELECT', 'anon'),
    ('leads', 'INSERT', 'anon')
    ) AS g(table_name, privileges, role_name)
  LOOP
    IF to_regclass('public.' || r.table_name) IS NULL THEN
      RAISE NOTICE 'skipping grants on %: not present in this database', r.table_name;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    EXECUTE format('GRANT %s ON public.%I TO %I', r.privileges, r.table_name, r.role_name);
  END LOOP;

  IF v_skipped > 0 THEN
    RAISE NOTICE '018: % table(s) in the grant list are not in this database', v_skipped;
  END IF;
END $$;

-- UPDATE on profiles is column-scoped by migration 017 and re-established by
-- 026; it is deliberately absent from the list above.

-- `admin_invites` is reached only through validate_admin_invite() and
-- redeem_admin_invite(); no direct table privilege is required.
-- `audit_logs` is written by the server (migration 021); clients may read
-- nothing and write nothing.
-- `auth_rate_limits` is internal to the database.

DO $$
BEGIN
  EXECUTE 'GRANT SELECT ON public.creator_marketplace_public TO anon, authenticated';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'creator_marketplace_public view not present; skipping grant';
END $$;

-- ----------------------------------------------------------------------------
-- 3. Policies for tables that had none of their own.
--
--    With RLS enabled and no policy a table denies everything, so some of
--    these were failing closed already. Making the intent explicit means a
--    future grant cannot quietly open them.
-- ----------------------------------------------------------------------------

-- Content activity: visible to the submitting creator and the campaign owner.
ALTER TABLE content_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_activities_select" ON content_activities;
CREATE POLICY "content_activities_select" ON content_activities
  FOR SELECT TO authenticated
  USING (
    submission_id IN (
      SELECT cs.id FROM content_submissions cs
      JOIN campaign_assignments ca ON ca.id = cs.assignment_id
      JOIN campaigns c ON c.id = ca.campaign_id
      WHERE ca.creator_id = auth.uid() OR c.developer_id = auth.uid()
    )
    OR fin_is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "content_activities_insert" ON content_activities;
CREATE POLICY "content_activities_insert" ON content_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND submission_id IN (
      SELECT cs.id FROM content_submissions cs
      JOIN campaign_assignments ca ON ca.id = cs.assignment_id
      JOIN campaigns c ON c.id = ca.campaign_id
      WHERE ca.creator_id = auth.uid() OR c.developer_id = auth.uid()
    )
  );

-- Lead activity follows the lead: the owning developer and the attributed
-- creator. Never anonymous.
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_activities_select" ON lead_activities;
CREATE POLICY "lead_activities_select" ON lead_activities
  FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT l.id FROM leads l
      JOIN campaigns c ON c.id = l.campaign_id
      WHERE c.developer_id = auth.uid()
    )
    OR fin_is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "lead_activities_insert" ON lead_activities;
CREATE POLICY "lead_activities_insert" ON lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND lead_id IN (
      SELECT l.id FROM leads l
      JOIN campaigns c ON c.id = l.campaign_id
      WHERE c.developer_id = auth.uid()
    )
  );

-- Saved payment methods belong to one user and nobody else.
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_methods_select_own" ON payment_methods;
CREATE POLICY "payment_methods_select_own" ON payment_methods
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR fin_is_super_admin(auth.uid()));

-- Gateway transactions are readable by their owner, written only by the server.
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_transactions_select_own" ON payment_transactions;
CREATE POLICY "payment_transactions_select_own" ON payment_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR fin_is_super_admin(auth.uid()));

-- Campaign assets: the owning developer, plus creators assigned to the campaign.
ALTER TABLE campaign_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign_assets_select" ON campaign_assets;
CREATE POLICY "campaign_assets_select" ON campaign_assets
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
    OR campaign_id IN (SELECT campaign_id FROM campaign_assignments WHERE creator_id = auth.uid())
    OR fin_is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "campaign_assets_write" ON campaign_assets;
CREATE POLICY "campaign_assets_write" ON campaign_assets
  FOR INSERT TO authenticated
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

DROP POLICY IF EXISTS "campaign_assets_delete" ON campaign_assets;
CREATE POLICY "campaign_assets_delete" ON campaign_assets
  FOR DELETE TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid()));

-- Release rules are configuration a developer reads for their own campaigns.
ALTER TABLE escrow_release_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "escrow_release_rules_select" ON escrow_release_rules;
CREATE POLICY "escrow_release_rules_select" ON escrow_release_rules
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
    OR fin_is_super_admin(auth.uid())
  );

ALTER TABLE escrow_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "escrow_releases_select" ON escrow_releases;
CREATE POLICY "escrow_releases_select" ON escrow_releases
  FOR SELECT TO authenticated
  USING (
    creator_id = auth.uid()
    OR campaign_id IN (SELECT id FROM campaigns WHERE developer_id = auth.uid())
    OR fin_is_super_admin(auth.uid())
  );

-- Invoices belong to the customer named on them.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_select_own" ON invoices;
CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR fin_is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "invoices_insert_own" ON invoices;
CREATE POLICY "invoices_insert_own" ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Milestone payments follow the assignment.
--
-- `payments` is guarded because it does not exist everywhere: 001 created it
-- and a later migration superseded it with `payment_transactions`, so a
-- database on the newer lineage has no such table and the unguarded
-- statements below aborted the whole migration.
DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL THEN
    RAISE NOTICE 'payments table not present (superseded by payment_transactions); skipping its policies';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE payments ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "payments_select" ON payments';
  EXECUTE $policy$
    CREATE POLICY "payments_select" ON payments
      FOR SELECT TO authenticated
      USING (
        assignment_id IN (
          SELECT ca.id FROM campaign_assignments ca
          JOIN campaigns c ON c.id = ca.campaign_id
          WHERE ca.creator_id = auth.uid() OR c.developer_id = auth.uid()
        )
        OR fin_is_super_admin(auth.uid())
      )
  $policy$;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Leads are write-only for anonymous visitors.
--
--    The capture form must work without an account, but an anonymous caller
--    must never read a lead back -- not even one they just submitted.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "leads_insert_public" ON leads;
CREATE POLICY "leads_insert_public" ON leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- Only against a campaign that is actually accepting leads.
    campaign_id IN (SELECT id FROM campaigns WHERE status IN ('open', 'active'))
  );

-- ----------------------------------------------------------------------------
-- 5. Public reads are narrowed to published rows.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "campaigns_select_public" ON campaigns;
CREATE POLICY "campaigns_select_public" ON campaigns
  FOR SELECT TO anon
  USING (status IN ('open', 'active'));

DO $$
BEGIN
  EXECUTE $p$
    DROP POLICY IF EXISTS "properties_select_public" ON properties;
    CREATE POLICY "properties_select_public" ON properties
      FOR SELECT TO anon
      USING (status = 'active');
  $p$;
EXCEPTION WHEN undefined_column OR undefined_object THEN
  RAISE NOTICE 'properties.status not present in the expected form; review manually';
END $$;

-- ----------------------------------------------------------------------------
-- 6. Verification view for the acceptance tests.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW security_review_table_grants AS
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

REVOKE ALL ON security_review_table_grants FROM anon, authenticated;

COMMIT;
