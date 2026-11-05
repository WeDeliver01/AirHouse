-- =============================================================================
-- AirHouse — Production catch-up bundle
-- =============================================================================
-- Combines every migration that was added in code but never applied to the
-- live Supabase project. Safe to re-run: every block uses IF NOT EXISTS,
-- DROP ... IF EXISTS, and ON CONFLICT guards.
--
-- Order matters where one block depends on another:
--   1. properties           (campaigns.property_id depends on properties)
--   2. messages
--   3. disputes/contracts immutability  (must run before dispute-notification RPC)
--   4. marketplace public view + anon column grants
--   5. profile verification rejection columns
--   6. developer-creator favorites
--   7. dispute notifications RPC
--   8. support tickets
--   9. assignment invite notification trigger
--  10. verification requests + bucket
-- =============================================================================


-- =============================================================================
-- 1. PROPERTY LISTINGS  (was 011_property_listings.sql)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE property_status AS ENUM ('draft', 'active', 'sold', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_zar NUMERIC(14,2),
  location_city TEXT,
  location_suburb TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  bedrooms INTEGER,
  bathrooms INTEGER,
  parking INTEGER,
  floor_area_sqm NUMERIC(10,2),
  status property_status NOT NULL DEFAULT 'draft',
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_developer ON properties(developer_id);
CREATE INDEX IF NOT EXISTS idx_properties_status    ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_city      ON properties(location_city);

CREATE OR REPLACE FUNCTION set_properties_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS properties_set_updated_at ON properties;
CREATE TRIGGER properties_set_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION set_properties_updated_at();

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developers manage their own properties" ON properties;
CREATE POLICY "Developers manage their own properties" ON properties
  FOR ALL USING (developer_id = auth.uid()) WITH CHECK (developer_id = auth.uid());

DROP POLICY IF EXISTS "Active properties readable by authenticated" ON properties;
DROP POLICY IF EXISTS "Active properties readable by creators" ON properties;
CREATE POLICY "Active properties readable by creators" ON properties
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'creator')
  );

DROP POLICY IF EXISTS "Super admins full access on properties" ON properties;
CREATE POLICY "Super admins full access on properties" ON properties
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_property ON campaigns(property_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', TRUE)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read property photos" ON storage.objects;
CREATE POLICY "Public read property photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-photos');

DROP POLICY IF EXISTS "Developers upload own property photos" ON storage.objects;
CREATE POLICY "Developers upload own property photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Developers update own property photos" ON storage.objects;
CREATE POLICY "Developers update own property photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Developers delete own property photos" ON storage.objects;
CREATE POLICY "Developers delete own property photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- =============================================================================
-- 2. MESSAGES  (was 011_messages.sql)
-- =============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient_created
  ON messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_sender_created
  ON messages (recipient_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread
  ON messages (recipient_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_campaign
  ON messages (campaign_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
CREATE POLICY "Users can read their own messages" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can send messages as themselves" ON messages;
CREATE POLICY "Users can send messages as themselves" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() <> recipient_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = recipient_id)
  );

DROP POLICY IF EXISTS "Recipients can mark messages read" ON messages;
CREATE POLICY "Recipients can mark messages read" ON messages
  FOR UPDATE USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Admins can read all messages" ON messages;
CREATE POLICY "Admins can read all messages" ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- =============================================================================
-- 3. DISPUTES + CONTRACTS IMMUTABILITY  (was 011_disputes_contracts_immutability.sql)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispute-evidence',
  'dispute-evidence',
  FALSE,
  52428800,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'application/pdf',
    'video/mp4','video/quicktime','video/webm',
    'text/plain','application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Dispute evidence: parties can read"   ON storage.objects;
DROP POLICY IF EXISTS "Dispute evidence: parties can upload" ON storage.objects;
DROP POLICY IF EXISTS "Dispute evidence: parties can delete" ON storage.objects;

CREATE POLICY "Dispute evidence: parties can read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dispute-evidence'
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id::text = split_part(storage.objects.name, '/', 1)
        AND (d.reporter_id = auth.uid() OR d.reported_party_id = auth.uid())
    )
  )
);

CREATE POLICY "Dispute evidence: parties can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'dispute-evidence'
  AND auth.uid() IS NOT NULL
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id::text = split_part(storage.objects.name, '/', 1)
        AND (d.reporter_id = auth.uid() OR d.reported_party_id = auth.uid())
    )
  )
);

CREATE POLICY "Dispute evidence: parties can delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'dispute-evidence'
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id::text = split_part(storage.objects.name, '/', 1)
        AND d.reporter_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins can manage all disputes" ON disputes;
CREATE POLICY "Admins can manage all disputes" ON disputes FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage dispute messages" ON dispute_messages;
CREATE POLICY "Admins can manage dispute messages" ON dispute_messages FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can view dispute messages" ON dispute_messages;
CREATE POLICY "Super admins can view dispute messages" ON dispute_messages FOR SELECT
  USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can view all disputes" ON disputes;
CREATE POLICY "Super admins can view all disputes" ON disputes FOR SELECT
  USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Reported party can update open disputes" ON disputes;
CREATE POLICY "Reported party can update open disputes" ON disputes FOR UPDATE
  USING (reported_party_id = auth.uid() AND status IN ('open','under_review'))
  WITH CHECK (reported_party_id = auth.uid());

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terms_hash TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_terms_hash TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS creator_signature_ip TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS developer_signature_ip TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS creator_signature_type TEXT
  CHECK (creator_signature_type IN ('typed','drawn'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS developer_signature_type TEXT
  CHECK (developer_signature_type IN ('typed','drawn'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Admins can manage all contracts" ON contracts;
CREATE POLICY "Admins can manage all contracts" ON contracts FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION enforce_contract_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
      RAISE EXCEPTION 'Signed contracts are immutable; no fields may be changed (contract_id=%)', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.creator_signed_at IS NOT NULL AND NEW.creator_signed_at > NOW() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Signature timestamp cannot be in the future';
  END IF;
  IF NEW.developer_signed_at IS NOT NULL AND NEW.developer_signed_at > NOW() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Signature timestamp cannot be in the future';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_contract_signature_authenticity()
RETURNS TRIGGER AS $$
DECLARE
  caller UUID := auth.uid();
  creator_user UUID;
BEGIN
  IF caller IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO creator_user FROM creator_profiles WHERE id = NEW.creator_id;

  IF (NEW.creator_signature IS DISTINCT FROM OLD.creator_signature
      OR NEW.creator_signed_at IS DISTINCT FROM OLD.creator_signed_at
      OR NEW.creator_signature_ip IS DISTINCT FROM OLD.creator_signature_ip
      OR NEW.creator_signature_type IS DISTINCT FROM OLD.creator_signature_type)
     AND caller IS DISTINCT FROM creator_user THEN
    RAISE EXCEPTION 'Only the contract creator may set the creator signature'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.developer_signature IS DISTINCT FROM OLD.developer_signature
      OR NEW.developer_signed_at IS DISTINCT FROM OLD.developer_signed_at
      OR NEW.developer_signature_ip IS DISTINCT FROM OLD.developer_signature_ip
      OR NEW.developer_signature_type IS DISTINCT FROM OLD.developer_signature_type)
     AND caller IS DISTINCT FROM NEW.developer_id THEN
    RAISE EXCEPTION 'Only the contract developer may set the developer signature'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_contract_signature_authenticity ON contracts;
CREATE TRIGGER trigger_enforce_contract_signature_authenticity
BEFORE UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION enforce_contract_signature_authenticity();

CREATE OR REPLACE FUNCTION sign_contract(
  p_contract_id UUID,
  p_signature TEXT,
  p_signature_type TEXT,
  p_signature_ip TEXT,
  p_terms_hash TEXT
)
RETURNS contracts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  contract contracts%ROWTYPE;
  creator_user UUID;
  is_creator BOOLEAN := FALSE;
  is_developer BOOLEAN := FALSE;
  new_status contract_status;
  now_ts TIMESTAMPTZ := NOW();
  result contracts%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_signature IS NULL OR length(trim(p_signature)) = 0 THEN
    RAISE EXCEPTION 'Signature is required';
  END IF;
  IF p_signature_type NOT IN ('typed','drawn') THEN
    RAISE EXCEPTION 'signature_type must be typed or drawn';
  END IF;

  SELECT * INTO contract FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;
  IF contract.status = 'signed' THEN
    RAISE EXCEPTION 'Contract is already fully signed and cannot be modified'
      USING ERRCODE = '42501';
  END IF;
  IF contract.status IN ('cancelled','expired') THEN
    RAISE EXCEPTION 'Contract is % and cannot be signed', contract.status
      USING ERRCODE = '42501';
  END IF;
  IF p_terms_hash IS NOT NULL AND length(p_terms_hash) <> 64 THEN
    RAISE EXCEPTION 'terms_hash must be a 64-character SHA-256 hex digest';
  END IF;

  SELECT user_id INTO creator_user FROM creator_profiles WHERE id = contract.creator_id;
  IF caller = creator_user THEN
    is_creator := TRUE;
  ELSIF caller = contract.developer_id THEN
    is_developer := TRUE;
  ELSE
    RAISE EXCEPTION 'Only the contract''s creator or developer may sign it'
      USING ERRCODE = '42501';
  END IF;

  IF is_creator THEN
    IF contract.creator_signature IS NOT NULL THEN
      RAISE EXCEPTION 'Creator has already signed this contract';
    END IF;
    UPDATE contracts SET
      creator_signature      = p_signature,
      creator_signed_at      = now_ts,
      creator_signature_ip   = COALESCE(p_signature_ip, 'unknown'),
      creator_signature_type = p_signature_type,
      terms_hash             = COALESCE(terms_hash, p_terms_hash)
    WHERE id = p_contract_id;
  ELSIF is_developer THEN
    IF contract.developer_signature IS NOT NULL THEN
      RAISE EXCEPTION 'Developer has already signed this contract';
    END IF;
    UPDATE contracts SET
      developer_signature      = p_signature,
      developer_signed_at      = now_ts,
      developer_signature_ip   = COALESCE(p_signature_ip, 'unknown'),
      developer_signature_type = p_signature_type,
      terms_hash               = COALESCE(terms_hash, p_terms_hash)
    WHERE id = p_contract_id;
  END IF;

  SELECT * INTO contract FROM contracts WHERE id = p_contract_id FOR UPDATE;

  IF contract.creator_signature IS NOT NULL AND contract.developer_signature IS NOT NULL THEN
    new_status := 'signed';
    UPDATE contracts SET
      status = new_status,
      signed_at = now_ts,
      signed_terms_hash = COALESCE(p_terms_hash, contract.terms_hash)
    WHERE id = p_contract_id;
  ELSIF contract.creator_signature IS NOT NULL THEN
    new_status := 'pending_developer';
    UPDATE contracts SET status = new_status WHERE id = p_contract_id;
  ELSE
    new_status := 'pending_creator';
    UPDATE contracts SET status = new_status WHERE id = p_contract_id;
  END IF;

  SELECT * INTO result FROM contracts WHERE id = p_contract_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION sign_contract(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_contract(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP TRIGGER IF EXISTS trigger_enforce_contract_immutability ON contracts;
CREATE TRIGGER trigger_enforce_contract_immutability
BEFORE UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION enforce_contract_immutability();

CREATE OR REPLACE FUNCTION prevent_signed_contract_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Signed contracts cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_signed_contract_delete ON contracts;
CREATE TRIGGER trigger_prevent_signed_contract_delete
BEFORE DELETE ON contracts
FOR EACH ROW EXECUTE FUNCTION prevent_signed_contract_delete();

DROP TRIGGER IF EXISTS update_contracts_updated_at ON contracts;
CREATE TRIGGER update_contracts_updated_at
BEFORE UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_disputes_updated_at ON disputes;
CREATE TRIGGER update_disputes_updated_at
BEFORE UPDATE ON disputes
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_disputes_assignment      ON disputes(assignment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_campaign        ON disputes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id);
CREATE INDEX IF NOT EXISTS idx_contracts_creator        ON contracts(creator_id);
CREATE INDEX IF NOT EXISTS idx_contracts_developer      ON contracts(developer_id);


-- =============================================================================
-- 4. MARKETPLACE PUBLIC VIEW  (was 011_marketplace_public_view.sql)
-- =============================================================================

DROP POLICY IF EXISTS "Public can view creator marketplace profiles" ON public.creator_profiles;
CREATE POLICY "Public can view creator marketplace profiles"
  ON public.creator_profiles FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can view creator profile cards" ON public.profiles;
CREATE POLICY "Public can view creator profile cards"
  ON public.profiles FOR SELECT TO anon USING (role = 'creator');

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, role, full_name, avatar_url, company_name, bio, is_verified, created_at, updated_at
) ON public.profiles TO anon;

REVOKE SELECT ON public.creator_profiles FROM anon;
GRANT SELECT (
  id, user_id, instagram_handle, tiktok_handle, youtube_handle, follower_count,
  niche, portfolio_urls, rate_card, location, is_available,
  avg_engagement_rate, reliability_score, campaigns_completed, total_leads_generated,
  created_at, updated_at
) ON public.creator_profiles TO anon;

DROP VIEW IF EXISTS public.creator_marketplace_public CASCADE;

CREATE VIEW public.creator_marketplace_public
WITH (security_invoker = true) AS
SELECT
  cp.id                            AS creator_profile_id,
  cp.user_id                       AS user_id,
  p.full_name                      AS full_name,
  p.avatar_url                     AS avatar_url,
  p.bio                            AS bio,
  COALESCE(p.is_verified, false)   AS is_verified,
  cp.location                      AS location,
  cp.niche                         AS niche,
  cp.follower_count                AS follower_count,
  cp.instagram_handle              AS instagram_handle,
  cp.tiktok_handle                 AS tiktok_handle,
  cp.youtube_handle                AS youtube_handle,
  cp.reliability_score             AS reliability_score,
  cp.campaigns_completed           AS campaigns_completed,
  cp.total_leads_generated         AS total_leads_generated,
  cp.is_available                  AS is_available,
  cp.created_at                    AS created_at,
  cp.rate_card                     AS rate_card,
  (
    SELECT MIN(value::numeric)
    FROM jsonb_each_text(cp.rate_card)
    WHERE value ~ '^[0-9]+(\.[0-9]+)?$' AND value::numeric > 0
  ) AS min_rate_zar,
  (
    SELECT MAX(value::numeric)
    FROM jsonb_each_text(cp.rate_card)
    WHERE value ~ '^[0-9]+(\.[0-9]+)?$' AND value::numeric > 0
  ) AS max_rate_zar
FROM public.creator_profiles cp
JOIN public.profiles p ON p.id = cp.user_id
WHERE p.role = 'creator';

GRANT SELECT ON public.creator_marketplace_public TO anon, authenticated;


-- =============================================================================
-- 5. VERIFICATION REJECTION COLUMNS  (was 012_verification_rejections.sql)
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verification_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_rejected_at
  ON profiles(verification_rejected_at)
  WHERE verification_rejected_at IS NOT NULL;


-- =============================================================================
-- 6. DEVELOPER -> CREATOR FAVORITES  (was 013_developer_creator_favorites.sql)
-- =============================================================================

CREATE TABLE IF NOT EXISTS developer_creator_favorites (
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (developer_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_dcf_developer ON developer_creator_favorites(developer_id);
CREATE INDEX IF NOT EXISTS idx_dcf_creator   ON developer_creator_favorites(creator_id);

ALTER TABLE developer_creator_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developers read own favorites" ON developer_creator_favorites;
CREATE POLICY "Developers read own favorites" ON developer_creator_favorites
  FOR SELECT USING (developer_id = auth.uid());

DROP POLICY IF EXISTS "Developers add own favorites" ON developer_creator_favorites;
CREATE POLICY "Developers add own favorites" ON developer_creator_favorites
  FOR INSERT
  WITH CHECK (
    developer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles d WHERE d.id = auth.uid() AND d.role = 'developer')
    AND EXISTS (SELECT 1 FROM profiles c WHERE c.id = creator_id AND c.role = 'creator')
  );

DROP POLICY IF EXISTS "Developers remove own favorites" ON developer_creator_favorites;
CREATE POLICY "Developers remove own favorites" ON developer_creator_favorites
  FOR DELETE USING (developer_id = auth.uid());

DROP POLICY IF EXISTS "Super admins full access on developer_creator_favorites" ON developer_creator_favorites;
CREATE POLICY "Super admins full access on developer_creator_favorites" ON developer_creator_favorites
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));


-- =============================================================================
-- 7. DISPUTE NOTIFICATIONS RPC  (was 013_dispute_notifications.sql)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_active_super_admin_emails()
RETURNS TEXT[]
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(email), ARRAY[]::TEXT[])
  FROM super_admins
  WHERE is_active = TRUE AND email IS NOT NULL AND email <> '';
$$;

REVOKE ALL ON FUNCTION get_active_super_admin_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_active_super_admin_emails() TO authenticated;


-- =============================================================================
-- 8. SUPPORT TICKETS  (was 013_support_tickets.sql)
-- =============================================================================

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

DROP POLICY IF EXISTS "Anyone can submit a support ticket" ON support_tickets;
DROP POLICY IF EXISTS "Authenticated users can submit a support ticket" ON support_tickets;
CREATE POLICY "Authenticated users can submit a support ticket" ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'open'
    AND assigned_to IS NULL
    AND resolved_at IS NULL
    AND internal_notes IS NULL
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can read their own tickets" ON support_tickets;
CREATE POLICY "Users can read their own tickets" ON support_tickets
  FOR SELECT USING (user_id IS NOT NULL AND auth.uid() = user_id);

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

CREATE OR REPLACE FUNCTION support_tickets_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION support_tickets_set_updated_at();


-- =============================================================================
-- 9. ASSIGNMENT INVITE NOTIFICATION TRIGGER  (was 014_assignment_invite_notifications.sql)
-- =============================================================================

CREATE OR REPLACE FUNCTION notify_creator_on_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_user_id UUID;
  campaign_title TEXT;
  developer_name TEXT;
BEGIN
  SELECT user_id INTO creator_user_id
  FROM creator_profiles WHERE id = NEW.creator_id;

  IF creator_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT
    COALESCE(c.title, c.property_name, 'a new campaign'),
    COALESCE(p.full_name, p.company_name, 'A developer')
  INTO campaign_title, developer_name
  FROM campaigns c
  LEFT JOIN profiles p ON p.id = c.developer_id
  WHERE c.id = NEW.campaign_id;

  INSERT INTO notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    creator_user_id,
    'campaign_assigned',
    'New campaign invite',
    developer_name || ' invited you to ' || campaign_title,
    '/creator/campaigns',
    jsonb_build_object('campaign_id', NEW.campaign_id, 'assignment_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_creator_on_assignment_trigger ON campaign_assignments;
CREATE TRIGGER notify_creator_on_assignment_trigger
  AFTER INSERT ON campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION notify_creator_on_assignment();


-- =============================================================================
-- 10. VERIFICATION REQUESTS  (was 014_verification_requests.sql)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "Applicants upload own verification docs"   ON storage.objects;
DROP POLICY IF EXISTS "Applicants read own verification docs"     ON storage.objects;
DROP POLICY IF EXISTS "Applicants update own verification docs"   ON storage.objects;
DROP POLICY IF EXISTS "Applicants delete own verification docs"   ON storage.objects;
DROP POLICY IF EXISTS "Super admins read all verification docs"   ON storage.objects;

CREATE POLICY "Applicants upload own verification docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Applicants read own verification docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Applicants update own verification docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Applicants delete own verification docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Super admins read all verification docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_level TEXT NOT NULL DEFAULT 'basic'
    CHECK (target_level IN ('basic', 'standard', 'premium', 'gold')),
  id_document_path TEXT NOT NULL,
  id_document_type TEXT,
  selfie_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  applicant_notes TEXT,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewer_notes TEXT,
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_status_submitted
  ON verification_requests (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_requests_user
  ON verification_requests (user_id, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_verification_requests_open_per_user
  ON verification_requests (user_id) WHERE status = 'pending';

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicants insert own verification request" ON verification_requests;
CREATE POLICY "Applicants insert own verification request" ON verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewer_id IS NULL
    AND reviewer_notes IS NULL
    AND rejection_reason IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS "Applicants read own verification requests" ON verification_requests;
CREATE POLICY "Applicants read own verification requests" ON verification_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Applicants cancel own pending request" ON verification_requests;
CREATE POLICY "Applicants cancel own pending request" ON verification_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('pending', 'cancelled'));

DROP POLICY IF EXISTS "Super admins read all verification requests" ON verification_requests;
CREATE POLICY "Super admins read all verification requests" ON verification_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

DROP POLICY IF EXISTS "Super admins update verification requests" ON verification_requests;
CREATE POLICY "Super admins update verification requests" ON verification_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

CREATE OR REPLACE FUNCTION verification_requests_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verification_requests_updated_at ON verification_requests;
CREATE TRIGGER trg_verification_requests_updated_at
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION verification_requests_set_updated_at();


-- =============================================================================
-- DONE — verify by running:
--   SELECT COUNT(*) FROM properties;                  -- should not error
--   SELECT COUNT(*) FROM messages;                    -- should not error
--   SELECT COUNT(*) FROM developer_creator_favorites; -- should not error
--   SELECT COUNT(*) FROM support_tickets;             -- should not error
--   SELECT COUNT(*) FROM verification_requests;       -- should not error
-- =============================================================================
-- 015_terms_acceptances.sql
-- Audit trail of who accepted which policy versions, when and from where.
-- Required for Yoco / BobPay underwriting and for POPIA accountability.

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('creator', 'developer', 'admin')),
  terms_version text not null,
  privacy_version text not null,
  role_agreement_key text,
  role_agreement_version text,
  user_agent text,
  ip_address inet,
  accepted_at timestamptz not null default now()
);

create index if not exists terms_acceptances_user_id_idx
  on public.terms_acceptances (user_id);
create index if not exists terms_acceptances_accepted_at_idx
  on public.terms_acceptances (accepted_at desc);

alter table public.terms_acceptances enable row level security;

-- Insert: only as the authenticated user themselves.
drop policy if exists "terms_acceptances_insert_self" on public.terms_acceptances;
create policy "terms_acceptances_insert_self" on public.terms_acceptances
  for insert
  with check (auth.uid() = user_id);

-- Select: only your own rows. (Admins read via service role.)
drop policy if exists "terms_acceptances_select_self" on public.terms_acceptances;
create policy "terms_acceptances_select_self" on public.terms_acceptances
  for select
  using (auth.uid() = user_id);

-- Immutable record — no updates or deletes from the client.
revoke update, delete on public.terms_acceptances from anon, authenticated;
