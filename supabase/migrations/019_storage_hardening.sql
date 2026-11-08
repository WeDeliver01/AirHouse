-- ============================================================================
-- 019_storage_hardening.sql
--
-- Closes AH-025 and settles the conflicting storage policy definitions in the
-- repository.
--
-- WHY
-- ---
-- `supabase/create_storage_buckets.sql` creates policies whose names claim an
-- ownership check that their bodies do not perform:
--
--     CREATE POLICY "Anyone can delete their own avatar"
--     ON storage.objects FOR DELETE USING (bucket_id = 'avatars');
--
-- The predicate tests only the bucket, so any caller reaching that bucket can
-- overwrite or delete any user's avatar -- defacement, and an impersonation
-- vector on a marketplace where the avatar is part of a creator's identity.
--
-- `SUPABASE_SETUP.md` documents the correct stricter form. The repository
-- therefore carried two conflicting policy sets with the weaker one in the
-- runnable script. This migration makes the stricter form authoritative.
--
-- CONVENTION
-- ----------
-- Every object in a user-owned bucket is stored under a first path segment
-- equal to the owner's user id:  <auth.uid()>/<filename>
-- `storage.foldername(name)` returns the path segments, so `[1]` is that id.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Bucket privacy.
--
--    Buckets holding identity documents or dispute evidence must never be
--    public. Asserted here so a later `ON CONFLICT DO UPDATE` in an older
--    script cannot flip them back.
-- ----------------------------------------------------------------------------

UPDATE storage.buckets SET public = FALSE
WHERE id IN ('verification-documents', 'dispute-evidence');

-- Avatars, campaign media and property photos are deliberately public to read.
UPDATE storage.buckets SET public = TRUE
WHERE id IN ('avatars', 'campaign-media', 'property-photos');

-- ----------------------------------------------------------------------------
-- 2. Replace the policies that only checked bucket_id.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Avatar images are publicly accessible"   ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar"             ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update their own avatar"      ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete their own avatar"      ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar"             ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar"             ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly accessible"         ON storage.objects;

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- 3. Campaign media: the owning developer writes, anyone may read.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Campaign media is publicly accessible"        ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update campaign media"             ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete campaign media"             ON storage.objects;

CREATE POLICY "campaign_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'campaign-media');

CREATE POLICY "campaign_media_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "campaign_media_owner_modify" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'campaign-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "campaign_media_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campaign-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- 4. Verification documents: the most sensitive data the platform holds.
--
--    The owner may upload and read their own. Nobody else reads them through
--    a policy -- reviewers go through a signed URL minted server-side, so each
--    access is deliberate, time-limited and attributable.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "verification_docs_owner_insert" ON storage.objects;
CREATE POLICY "verification_docs_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "verification_docs_owner_read" ON storage.objects;
CREATE POLICY "verification_docs_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- No UPDATE policy: a submitted identity document is not editable in place.
-- No DELETE policy for ordinary users: retention is handled by the server-side
-- deletion workflow (see migration 024), so a user cannot destroy evidence
-- mid-review.

-- ----------------------------------------------------------------------------
-- 5. Dispute evidence: parties to the dispute only, via signed URLs.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "dispute_evidence_party_insert" ON storage.objects;
CREATE POLICY "dispute_evidence_party_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "dispute_evidence_owner_read" ON storage.objects;
CREATE POLICY "dispute_evidence_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispute-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- 6. Property photos: the owning developer writes, anyone may read.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "property_photos_public_read" ON storage.objects;
CREATE POLICY "property_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-photos');

DROP POLICY IF EXISTS "property_photos_owner_write" ON storage.objects;
CREATE POLICY "property_photos_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "property_photos_owner_delete" ON storage.objects;
CREATE POLICY "property_photos_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- 7. Review helper.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW security_review_storage AS
SELECT
  b.id            AS bucket,
  b.public        AS is_public,
  p.policyname,
  p.cmd,
  p.qual          AS using_clause,
  p.with_check
FROM storage.buckets b
LEFT JOIN pg_policies p
  ON p.schemaname = 'storage'
 AND p.tablename  = 'objects'
 AND (p.qual LIKE '%' || b.id || '%' OR p.with_check LIKE '%' || b.id || '%')
ORDER BY b.id, p.policyname;

COMMIT;
