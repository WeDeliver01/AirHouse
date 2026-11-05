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
-- 2. Re-grant precisely.
--
--    Read-only for everything the client only displays; write only where the
--    client genuinely creates or edits rows. RLS still decides *which* rows.
-- ----------------------------------------------------------------------------

-- --- Identity ---------------------------------------------------------------
GRANT SELECT                   ON public.profiles                     TO authenticated;
GRANT INSERT                   ON public.profiles                     TO authenticated;
-- UPDATE on profiles is column-scoped by migration 017; do not widen it here.
GRANT SELECT, INSERT, UPDATE   ON public.creator_profiles             TO authenticated;
GRANT SELECT                   ON public.super_admins                 TO authenticated;
GRANT SELECT, INSERT           ON public.terms_acceptances            TO authenticated;

-- --- Campaigns and delivery -------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties             TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.campaign_assets        TO authenticated;
GRANT SELECT, UPDATE, DELETE         ON public.campaign_applications  TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.campaign_assignments   TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.content_submissions    TO authenticated;
GRANT INSERT                         ON public.content_activities     TO authenticated;
GRANT SELECT                         ON public.escrow_release_rules   TO authenticated;

-- --- Leads ------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads                  TO authenticated;
GRANT INSERT                         ON public.lead_activities        TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.creator_tracking_links TO authenticated;

-- --- Money (read-only; all writes go through the functions in 016) ----------
GRANT SELECT                   ON public.wallets                      TO authenticated;
GRANT SELECT                   ON public.wallet_transactions          TO authenticated;
GRANT SELECT                   ON public.payout_requests              TO authenticated;
GRANT SELECT                   ON public.financial_operations         TO authenticated;
GRANT SELECT, INSERT, DELETE   ON public.bank_accounts                TO authenticated;
GRANT SELECT, INSERT           ON public.invoices                     TO authenticated;
GRANT SELECT                   ON public.payments                     TO authenticated;
GRANT SELECT                   ON public.payment_transactions         TO authenticated;
GRANT SELECT                   ON public.payment_methods              TO authenticated;
GRANT SELECT                   ON public.escrow_releases              TO authenticated;

-- --- Trust, safety and communication ----------------------------------------
GRANT SELECT, INSERT           ON public.creator_verifications        TO authenticated;
GRANT SELECT, INSERT, UPDATE   ON public.verification_requests        TO authenticated;
GRANT SELECT, INSERT, UPDATE   ON public.messages                     TO authenticated;
GRANT SELECT, INSERT, UPDATE   ON public.disputes                     TO authenticated;
GRANT SELECT, INSERT           ON public.dispute_messages             TO authenticated;
GRANT SELECT                   ON public.contracts                    TO authenticated;
GRANT SELECT, INSERT, DELETE   ON public.creator_reviews              TO authenticated;
GRANT SELECT, INSERT, DELETE   ON public.developer_creator_favorites  TO authenticated;
GRANT SELECT                   ON public.notifications                TO authenticated;
GRANT INSERT                   ON public.support_tickets              TO authenticated;

-- `admin_invites` is reached only through validate_admin_invite() and
-- redeem_admin_invite(); no direct table privilege is required.
-- `audit_logs` is written by the server (migration 021); clients may read
-- nothing and write nothing.
-- `auth_rate_limits` is internal to the database.

-- --- Anonymous: the four things the public pages need -----------------------
GRANT SELECT ON public.campaigns  TO anon;
GRANT SELECT ON public.properties TO anon;
GRANT INSERT ON public.leads      TO anon;   -- write-only; no SELECT

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
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select" ON payments;
CREATE POLICY "payments_select" ON payments
  FOR SELECT TO authenticated
  USING (
    assignment_id IN (
      SELECT ca.id FROM campaign_assignments ca
      JOIN campaigns c ON c.id = ca.campaign_id
      WHERE ca.creator_id = auth.uid() OR c.developer_id = auth.uid()
    )
    OR fin_is_super_admin(auth.uid())
  );

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
