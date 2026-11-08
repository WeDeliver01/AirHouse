import { supabase } from './supabase'

const BUCKET = 'verification-documents'

const sanitizeFileName = (name) =>
  String(name || 'upload')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'upload'

const buildPath = (userId, kind, file) => {
  const ext = (file.name?.split('.').pop() || '').toLowerCase()
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const safeBase = sanitizeFileName(file.name?.replace(/\.[^.]+$/, ''))
  return `${userId}/${kind}-${stamp}-${rand}-${safeBase}${ext ? `.${ext}` : ''}`
}

/**
 * Upload an ID document or selfie to the private verification bucket.
 * Returns the storage path that should be persisted on the verification request.
 */
export const uploadVerificationFile = async (userId, kind, file) => {
  if (!userId) throw new Error('Missing user id for verification upload')
  if (!file) throw new Error('No file provided for verification upload')
  if (!['id_document', 'selfie'].includes(kind)) {
    throw new Error(`Unsupported verification document kind: ${kind}`)
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File is too large — please upload an image under 10MB.')
  }

  const path = buildPath(userId, kind, file)
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: '0',
  })
  if (error) {
    if (
      error.message?.toLowerCase().includes('bucket') ||
      error.message?.toLowerCase().includes('not found')
    ) {
      throw new Error(
        'Verification storage bucket is not configured. Apply migration 014 in Supabase.',
      )
    }
    throw error
  }
  return path
}

/**
 * Submit a verification request. The caller must have already uploaded both
 * documents and provide their storage paths.
 */
export const submitVerificationRequest = async ({
  userId,
  targetLevel = 'basic',
  idDocumentPath,
  idDocumentType,
  selfiePath,
  applicantNotes,
}) => {
  if (!userId) throw new Error('Missing user id')
  if (!idDocumentPath) throw new Error('Missing ID document upload')
  if (!selfiePath) throw new Error('Missing selfie upload')

  const payload = {
    user_id: userId,
    target_level: targetLevel,
    id_document_path: idDocumentPath,
    id_document_type: idDocumentType || null,
    selfie_path: selfiePath,
    applicant_notes: applicantNotes?.trim() || null,
    status: 'pending',
  }

  const { data, error } = await supabase
    .from('verification_requests')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Look up the most recent verification request for a user (used by the
 * onboarding wizard to skip the upload step if one is already pending).
 */
export const fetchLatestVerificationRequest = async (userId) => {
  if (!userId) return null
  const { data, error } = await supabase
    .from('verification_requests')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && error.code !== 'PGRST116') {
    console.warn('fetchLatestVerificationRequest:', error.message)
    return null
  }
  return data || null
}

/**
 * Create a short-lived signed URL for a verification document path. Used by
 * the admin reviewer because the bucket is private.
 */
export const getVerificationSignedUrl = async (path, expiresInSeconds = 600) => {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error) {
    console.warn('Signed URL error:', error.message)
    return null
  }
  return data?.signedUrl || null
}
