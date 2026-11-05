-- ============================================================================
-- 013: Support tickets — capture Help Centre contact-form submissions in the
--      database so the trust & safety team can track and triage them, instead
--      of relying on a `mailto:` link that opens the user's local email client.
-- ============================================================================
-- The Help page contact form writes one row per submission. Anonymous users
-- (not signed in) can also submit, so we allow public INSERT but never SELECT
-- or UPDATE for non-admins. Only super_admins can read or update tickets.
--
-- The server-side notification handler still emails the support team on insert
-- via Resend, but the row in this table is the source of truth for tracking
-- whether a ticket has been triaged, replied to or resolved.
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT NOT NULL CHECK (char_length(email) <= 254),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  category TEXT,
  source_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'spam')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON support_tickets (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_email
  ON support_tickets (email);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Authenticated users can submit a support ticket. The /help page is behind
-- ProtectedRoute today, so we deliberately disallow anonymous inserts to
-- reduce spam exposure. If we ever expose a public help form we'll add an
-- explicit anon policy here together with rate limiting / CAPTCHA. We also
-- block clients from setting triage fields directly — those are server-side
-- defaults or admin-only updates.
DROP POLICY IF EXISTS "Anyone can submit a support ticket" ON support_tickets;
DROP POLICY IF EXISTS "Authenticated users can submit a support ticket" ON support_tickets;
CREATE POLICY "Authenticated users can submit a support ticket" ON support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'open'
    AND assigned_to IS NULL
    AND resolved_at IS NULL
    AND internal_notes IS NULL
    AND user_id = auth.uid()
  );

-- Authenticated users can see their own tickets (for a future "My requests"
-- page). They cannot edit them.
DROP POLICY IF EXISTS "Users can read their own tickets" ON support_tickets;
CREATE POLICY "Users can read their own tickets" ON support_tickets
  FOR SELECT USING (
    user_id IS NOT NULL AND auth.uid() = user_id
  );

-- Super admins can read and triage all tickets.
DROP POLICY IF EXISTS "Admins can read all tickets" ON support_tickets;
CREATE POLICY "Admins can read all tickets" ON support_tickets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

DROP POLICY IF EXISTS "Admins can update tickets" ON support_tickets;
CREATE POLICY "Admins can update tickets" ON support_tickets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

-- Keep updated_at in sync.
CREATE OR REPLACE FUNCTION support_tickets_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION support_tickets_set_updated_at();

COMMENT ON TABLE support_tickets IS
  'Inbound contact-form submissions from the Help Centre. Public INSERT, admin-only SELECT/UPDATE.';
