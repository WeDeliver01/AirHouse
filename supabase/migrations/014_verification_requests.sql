-- ============================================================================
-- 014: Live verification queue — replace the demo data on the admin verification
--      reviewer with a real applicant pipeline that stores ID document and
--      liveness selfie uploads in private Supabase Storage and persists the
--      reviewer's approve/reject decision.
-- ============================================================================
-- The admin Verification Center previously showed every profile where
-- is_verified = false and rendered a placeholder for the ID document and
-- selfie. To actually moderate users we need:
--
--   * A new private storage bucket `verification-documents` that only the
--     applicant (write + read own files) and super admins (read all) can
--     access.
--   * A `verification_requests` table that captures one submission per
--     applicant attempt, including the storage paths to the ID and selfie,
--     the requested verification level, and the reviewer's decision.
--   * RLS policies that allow applicants to insert their own pending request,
--     read their own history, and let super admins read/update everything.
--
-- The actual side-effect of an approval (flipping profiles.is_verified) is
-- handled by the existing super-admin RLS + privilege-escalation trigger
-- machinery — the admin client updates `profiles.is_verified = true` from
-- the same code path that updates verification_requests, so no new database
-- trigger is needed here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Storage bucket — private, image only, modest size cap (10 MB per file)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  FALSE, -- private; access only via signed URLs from the admin reviewer
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Drop existing policies if a previous attempt was made
DROP POLICY IF EXISTS "Applicants upload own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Applicants read own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Applicants update own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Applicants delete own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Super admins read all verification docs" ON storage.objects;

-- File path convention: <user_id>/<filename>. The first path segment must
-- equal auth.uid() so an authenticated user can only act on their own folder.
CREATE POLICY "Applicants upload own verification docs" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Applicants read own verification docs" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Applicants update own verification docs" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Applicants delete own verification docs" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Super admins can read every uploaded verification document so they can
-- review ID + selfie regardless of which applicant uploaded it.
CREATE POLICY "Super admins read all verification docs" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

-- ---------------------------------------------------------------------------
-- Verification requests table
-- ---------------------------------------------------------------------------
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

-- Only one open (pending) request per user at a time. Re-submission after a
-- rejection is allowed because rejected rows do not match this predicate.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_verification_requests_open_per_user
  ON verification_requests (user_id)
  WHERE status = 'pending';

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Applicants can submit a new pending request for themselves. They cannot set
-- reviewer fields directly (those are server-side / admin-only).
DROP POLICY IF EXISTS "Applicants insert own verification request" ON verification_requests;
CREATE POLICY "Applicants insert own verification request" ON verification_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewer_id IS NULL
    AND reviewer_notes IS NULL
    AND rejection_reason IS NULL
    AND reviewed_at IS NULL
  );

-- Applicants can read their own request history.
DROP POLICY IF EXISTS "Applicants read own verification requests" ON verification_requests;
CREATE POLICY "Applicants read own verification requests" ON verification_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Applicants can cancel their own pending request (e.g. to re-upload).
DROP POLICY IF EXISTS "Applicants cancel own pending request" ON verification_requests;
CREATE POLICY "Applicants cancel own pending request" ON verification_requests
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('pending', 'cancelled'));

-- Super admins can read every request (for the moderation queue).
DROP POLICY IF EXISTS "Super admins read all verification requests" ON verification_requests;
CREATE POLICY "Super admins read all verification requests" ON verification_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

-- Super admins can record their decision (approve / reject).
DROP POLICY IF EXISTS "Super admins update verification requests" ON verification_requests;
CREATE POLICY "Super admins update verification requests" ON verification_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_super_admin = TRUE)
    )
  );

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION verification_requests_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verification_requests_updated_at ON verification_requests;
CREATE TRIGGER trg_verification_requests_updated_at
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION verification_requests_set_updated_at();

COMMENT ON TABLE verification_requests IS
  'Identity verification submissions awaiting admin review. One pending row per user; storage paths reference private bucket "verification-documents".';
COMMENT ON COLUMN verification_requests.id_document_path IS
  'Storage path inside the verification-documents bucket for the uploaded ID document.';
COMMENT ON COLUMN verification_requests.selfie_path IS
  'Storage path inside the verification-documents bucket for the uploaded liveness selfie.';
COMMENT ON COLUMN verification_requests.target_level IS
  'Verification tier the applicant is requesting (basic / standard / premium / gold).';
