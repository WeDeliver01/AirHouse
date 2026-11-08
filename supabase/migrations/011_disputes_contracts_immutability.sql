-- ============================================
-- Disputes evidence storage + Contract immutability
-- ============================================
--
-- 1. Create dispute-evidence storage bucket (private)
-- 2. RLS so only involved parties + super admins can read/write evidence
-- 3. Add immutability columns and triggers to contracts
-- 4. Tighten dispute/contract RLS with is_super_admin()
--

-- ============================================
-- 1. dispute-evidence storage bucket
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispute-evidence',
  'dispute-evidence',
  FALSE, -- private bucket; access via signed URLs
  52428800, -- 50MB
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

-- Object paths use the convention: <dispute_id>/<random>-<filename>
-- We use split_part to extract the dispute id from `name` and check
-- whether the caller is the reporter, reported_party, or a super admin.

DROP POLICY IF EXISTS "Dispute evidence: parties can read" ON storage.objects;
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

-- ============================================
-- 2. Tighten dispute RLS so super admins access via is_super_admin()
-- ============================================

DROP POLICY IF EXISTS "Admins can manage all disputes" ON disputes;
CREATE POLICY "Admins can manage all disputes" ON disputes FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage dispute messages" ON dispute_messages;
CREATE POLICY "Admins can manage dispute messages" ON dispute_messages FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to view messages too
DROP POLICY IF EXISTS "Super admins can view dispute messages" ON dispute_messages;
CREATE POLICY "Super admins can view dispute messages" ON dispute_messages FOR SELECT
  USING (is_super_admin(auth.uid()));

-- Allow super admins to view all disputes
DROP POLICY IF EXISTS "Super admins can view all disputes" ON disputes;
CREATE POLICY "Super admins can view all disputes" ON disputes FOR SELECT
  USING (is_super_admin(auth.uid()));

-- Reported party (not just reporter) needs to be able to attach evidence
-- and update non-resolution fields while a case is open.
DROP POLICY IF EXISTS "Reported party can update open disputes" ON disputes;
CREATE POLICY "Reported party can update open disputes" ON disputes FOR UPDATE
  USING (reported_party_id = auth.uid() AND status IN ('open','under_review'))
  WITH CHECK (reported_party_id = auth.uid());

-- ============================================
-- 3. Contract immutability columns
-- ============================================

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terms_hash TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_terms_hash TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS creator_signature_ip TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS developer_signature_ip TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS creator_signature_type TEXT
  CHECK (creator_signature_type IN ('typed','drawn'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS developer_signature_type TEXT
  CHECK (developer_signature_type IN ('typed','drawn'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- Tighten contract RLS for super admins
DROP POLICY IF EXISTS "Admins can manage all contracts" ON contracts;
CREATE POLICY "Admins can manage all contracts" ON contracts FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- ============================================
-- 4. Immutability trigger
-- ============================================
--
-- Once a contract is fully signed (status='signed'), every column on the row
-- is locked. Super admins are NOT exempt — signed contracts are immutable for
-- legal defensibility. Mutual rescission must be modelled as a separate row
-- (e.g. a follow-up cancelled contract referencing this one) rather than
-- mutating the signed record.

CREATE OR REPLACE FUNCTION enforce_contract_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Strict immutability: once status='signed', NO column can change and the
  -- row cannot transition to any other status. Mutual rescission must be
  -- recorded as a separate artifact (e.g. a follow-up "cancelled" contract
  -- referencing this one) rather than mutating the signed row.
  IF OLD.status = 'signed' THEN
    IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
      RAISE EXCEPTION 'Signed contracts are immutable; no fields may be changed (contract_id=%)', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Prevent backdated signatures: signed_at and *_signed_at must not be in future
  IF NEW.creator_signed_at IS NOT NULL AND NEW.creator_signed_at > NOW() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Signature timestamp cannot be in the future';
  END IF;
  IF NEW.developer_signed_at IS NOT NULL AND NEW.developer_signed_at > NOW() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Signature timestamp cannot be in the future';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4b. Signature authenticity trigger
-- ============================================
--
-- Defense-in-depth: even though the sign_contract() RPC is the only intended
-- write path, this trigger ensures that ANY direct UPDATE that touches a
-- signature field can only set it for the party that matches auth.uid().
-- A creator cannot forge the developer's signature and vice versa.

CREATE OR REPLACE FUNCTION enforce_contract_signature_authenticity()
RETURNS TRIGGER AS $$
DECLARE
  caller UUID := auth.uid();
  creator_user UUID;
BEGIN
  -- Server-role / migration writes (no JWT) bypass the check.
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the user behind this contract's creator_profile
  SELECT user_id INTO creator_user
  FROM creator_profiles
  WHERE id = NEW.creator_id;

  -- Creator-side signature fields can only be set by the creator's own user
  IF (NEW.creator_signature IS DISTINCT FROM OLD.creator_signature
      OR NEW.creator_signed_at IS DISTINCT FROM OLD.creator_signed_at
      OR NEW.creator_signature_ip IS DISTINCT FROM OLD.creator_signature_ip
      OR NEW.creator_signature_type IS DISTINCT FROM OLD.creator_signature_type)
     AND caller IS DISTINCT FROM creator_user THEN
    RAISE EXCEPTION 'Only the contract creator may set the creator signature'
      USING ERRCODE = '42501';
  END IF;

  -- Developer-side signature fields can only be set by the developer
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

-- ============================================
-- 4c. sign_contract RPC (server-side authoritative signing)
-- ============================================
--
-- Clients MUST go through this RPC to sign a contract. It:
--   * resolves the caller's role from auth.uid()
--   * writes signature data ONLY to the columns owned by that role
--   * rejects re-signing (cannot overwrite an existing signature)
--   * recomputes status: pending_creator / pending_developer / signed
--   * snapshots the signed_terms_hash when both sides have signed
--
-- Returns the updated contract row.

CREATE OR REPLACE FUNCTION sign_contract(
  p_contract_id UUID,
  p_signature TEXT,
  p_signature_type TEXT,   -- 'typed' | 'drawn'
  p_signature_ip TEXT,
  p_terms_hash TEXT
)
RETURNS contracts
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Lock the row for the duration of this transaction
  SELECT * INTO contract FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF contract.status = 'signed' THEN
    RAISE EXCEPTION 'Contract is already fully signed and cannot be modified'
      USING ERRCODE = '42501';
  END IF;
  IF contract.status IN ('cancelled','expired') THEN
    RAISE EXCEPTION 'Contract is % and cannot be signed', contract.status
      USING ERRCODE = '42501';
  END IF;

  -- Optional integrity check: if the client computed a terms hash, make sure
  -- it matches what would be stored. We trust the caller's hash as long as
  -- it's a 64-char hex; we record it on the row so anyone can re-verify.
  IF p_terms_hash IS NOT NULL AND length(p_terms_hash) <> 64 THEN
    RAISE EXCEPTION 'terms_hash must be a 64-character SHA-256 hex digest';
  END IF;

  -- Determine role
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

  -- Re-read for status calculation
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

-- Block hard deletes of signed contracts
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

-- ============================================
-- 5. Update updated_at on contracts/disputes
-- ============================================

DROP TRIGGER IF EXISTS update_contracts_updated_at ON contracts;
CREATE TRIGGER update_contracts_updated_at
BEFORE UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_disputes_updated_at ON disputes;
CREATE TRIGGER update_disputes_updated_at
BEFORE UPDATE ON disputes
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_disputes_assignment ON disputes(assignment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_campaign ON disputes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id);
CREATE INDEX IF NOT EXISTS idx_contracts_creator ON contracts(creator_id);
CREATE INDEX IF NOT EXISTS idx_contracts_developer ON contracts(developer_id);
