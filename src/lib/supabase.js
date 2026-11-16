import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isProduction = import.meta.env.PROD

/**
 * Fail closed when the backend is not configured (AH-022).
 *
 * This previously fell back to 'https://placeholder.supabase.co', so a
 * misconfigured production build started successfully and then failed on
 * every request with errors that pointed nowhere near the real cause. A
 * deployment missing its configuration should refuse to run, loudly.
 */
if (!supabaseUrl || !supabaseAnonKey) {
  const message =
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
    'in the deployment environment.'

  if (isProduction) {
    throw new Error(message)
  }

  console.error(
    `${message}\n\n` +
      'For local development, copy .env.example to .env and fill in the values ' +
      'from Supabase Dashboard > Settings > API.',
  )
}

export const supabase = createClient(
  // In development the placeholders keep the module importable so the error
  // above is what the developer sees, rather than a constructor throw.
  supabaseUrl || 'https://unconfigured.invalid',
  supabaseAnonKey || 'unconfigured',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  }
)

// ============================================
// AUTH HELPERS
// ============================================

/**
 * Get current authenticated user
 */
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

/**
 * Get current session
 */
export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  return session
}

/**
 * Sign up with email and password
 */
export const signUpWithEmail = async ({ email, password, fullName, role }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
      },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) throw error
  return data
}

/**
 * Sign in with email and password
 */
export const signInWithEmail = async ({ email, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

/**
 * Sign out
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Send password reset email
 */
export const resetPassword = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  if (error) throw error
}

/**
 * Update user password
 */
export const updatePassword = async (newPassword) => {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  if (error) throw error
}

// ============================================
// PROFILE HELPERS
// ============================================

/**
 * Get user profile by ID
 */
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

/**
 * Update user profile
 */
export const updateProfile = async (userId, updates) => {
  // First try to update
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()

  if (error) throw error
  
  // If no rows updated, try to insert
  if (!data || data.length === 0) {
    const { data: insertData, error: insertError } = await supabase
      .from('profiles')
      .upsert({ id: userId, ...updates })
      .select()
    
    if (insertError) throw insertError
    return insertData?.[0]
  }
  
  return data[0]
}

/**
 * Get creator profile by user ID
 */
export const getCreatorProfile = async (userId) => {
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

/**
 * Update creator profile
 */
export const updateCreatorProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('creator_profiles')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Upload avatar image (no compression, maintains quality)
 * Returns the public URL of the uploaded image
 */
export const uploadAvatar = async (userId, file) => {
  const fileExt = file.name.split('.').pop().toLowerCase()
  const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { 
      upsert: true,
      contentType: file.type,
      cacheControl: '0',
    })

  if (uploadError) {
    console.error('Avatar upload error:', uploadError)
    if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
      throw new Error('Storage bucket "avatars" not configured. Please create it in Supabase Dashboard > Storage.')
    }
    if (uploadError.message?.includes('policy')) {
      throw new Error('Storage policy not configured. Please add policies to the "avatars" bucket.')
    }
    throw uploadError
  }

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName)

  const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: cacheBustedUrl })
    .eq('id', userId)

  if (profileError) {
    console.error('Profile update error:', profileError)
    throw new Error('Photo uploaded but failed to save to profile. Please try again.')
  }

  return cacheBustedUrl
}

/**
 * Upload a campaign image or brochure at full quality. Returns
 * { url, path, type, name, size, contentType }.
 *
 * Storage RLS (migration 019) only lets a user write under a first path
 * segment equal to their own user id, so the object path MUST start with
 * `ownerId` -- the signed-in user's id:  <ownerId>/<campaignId>/<file>.
 * Uploading under `<campaignId>/...` is rejected by the bucket policy.
 *
 * @param ownerId    - auth.uid() of the uploader
 * @param campaignId - Campaign ID
 * @param file       - File to upload
 * @param type       - 'image' | 'brochure'
 */
export const uploadCampaignMedia = async (ownerId, campaignId, file, type = 'image') => {
  if (!ownerId) throw new Error('ownerId is required')
  if (!campaignId) throw new Error('campaignId is required')

  const fileExt = (file.name.split('.').pop() || 'bin').toLowerCase()
  const fileName = `${ownerId}/${campaignId}/${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`

  const bucket = 'campaign-media'

  // Upload without compression to maintain 4K quality
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '31536000', // 1 year cache
    })

  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName)

  return {
    url: publicUrl,
    path: fileName,
    type,
    name: file.name,
    size: file.size,
    contentType: file.type,
  }
}

/**
 * Upload multiple campaign files
 */
export const uploadCampaignFiles = async (ownerId, campaignId, files, type = 'image') => {
  return Promise.all(
    files.map(file => uploadCampaignMedia(ownerId, campaignId, file, type))
  )
}

/**
 * Storage path of a campaign-media object, given its public URL or its path.
 * Returns null for anything that is not an object in that bucket.
 */
export const campaignMediaPath = (urlOrPath) => {
  if (!urlOrPath) return null
  const marker = '/campaign-media/'
  const idx = urlOrPath.indexOf(marker)
  if (idx !== -1) return urlOrPath.slice(idx + marker.length).split('?')[0]
  return /^[a-z]+:/i.test(urlOrPath) ? null : urlOrPath
}

/**
 * Delete campaign media file, by storage path or public URL.
 */
export const deleteCampaignMedia = async (urlOrPath) => {
  const path = campaignMediaPath(urlOrPath)
  if (!path) return true

  const { error } = await supabase.storage
    .from('campaign-media')
    .remove([path])

  if (error) throw error
  return true
}

// ============================================
// PROPERTY PHOTOS
// Storage bucket: property-photos
// Folder convention: <developer_id>/<property_id>/<filename>
// ============================================

/**
 * Upload a single property photo. Returns { url, path }.
 */
export const uploadPropertyPhoto = async (developerId, propertyId, file) => {
  if (!developerId) throw new Error('developerId is required')
  if (!propertyId) throw new Error('propertyId is required')

  const safeExt = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${developerId}/${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`

  const { error: uploadError } = await supabase.storage
    .from('property-photos')
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '31536000',
    })

  if (uploadError) {
    if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
      throw new Error('Storage bucket "property-photos" is missing. Run migration 011_property_listings.sql.')
    }
    throw uploadError
  }

  const { data: { publicUrl } } = supabase.storage
    .from('property-photos')
    .getPublicUrl(path)

  return { url: publicUrl, path }
}

/**
 * Upload multiple property photos in parallel. Returns array of { url, path }.
 */
export const uploadPropertyPhotos = async (developerId, propertyId, files) => {
  return Promise.all(files.map(f => uploadPropertyPhoto(developerId, propertyId, f)))
}

/**
 * Delete a property photo by full URL or storage path.
 */
export const deletePropertyPhoto = async (urlOrPath) => {
  let path = urlOrPath
  // Strip the public URL prefix if present
  const marker = '/property-photos/'
  const idx = urlOrPath.indexOf(marker)
  if (idx !== -1) {
    path = urlOrPath.slice(idx + marker.length).split('?')[0]
  }

  const { error } = await supabase.storage
    .from('property-photos')
    .remove([path])

  if (error) throw error
  return true
}

// ============================================
// DEVELOPER → CREATOR FAVORITES
// Backed by `developer_creator_favorites` (migration 013).
// RLS scopes every row to the signed-in developer.
// ============================================

/**
 * Fetch the signed-in developer's favourite creator IDs (creator user_id list).
 * Returns an empty array for anonymous users or when none exist.
 */
export const fetchDeveloperFavorites = async (developerId) => {
  if (!developerId) return []
  const { data, error } = await supabase
    .from('developer_creator_favorites')
    .select('creator_id, created_at')
    .eq('developer_id', developerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Add a creator to the signed-in developer's favourites.
 * Idempotent: a duplicate insert (PK violation 23505) is treated as success.
 */
export const addDeveloperFavorite = async (developerId, creatorUserId) => {
  if (!developerId) throw new Error('developerId is required')
  if (!creatorUserId) throw new Error('creatorUserId is required')

  const { error } = await supabase
    .from('developer_creator_favorites')
    .insert({ developer_id: developerId, creator_id: creatorUserId })

  if (error && error.code !== '23505') throw error
}

/**
 * Remove a creator from the signed-in developer's favourites.
 */
export const removeDeveloperFavorite = async (developerId, creatorUserId) => {
  if (!developerId) throw new Error('developerId is required')
  if (!creatorUserId) throw new Error('creatorUserId is required')

  const { error } = await supabase
    .from('developer_creator_favorites')
    .delete()
    .eq('developer_id', developerId)
    .eq('creator_id', creatorUserId)

  if (error) throw error
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if Supabase is properly configured
 */
export const isSupabaseConfigured = () => {
  return supabaseUrl && 
         supabaseAnonKey && 
         !supabaseUrl.includes('placeholder')
}

/**
 * Handle Supabase errors consistently
 */
export const handleSupabaseError = (error) => {
  console.error('Supabase error:', error)
  
  // Map common errors to user-friendly messages
  const errorMessages = {
    'Invalid login credentials': 'Invalid email or password',
    'Email not confirmed': 'Please verify your email before signing in',
    'User already registered': 'An account with this email already exists',
    'Password should be at least 6 characters': 'Password must be at least 6 characters',
    'Email rate limit exceeded': 'Too many attempts. Please try again later',
  }

  return errorMessages[error.message] || error.message || 'An error occurred'
}

export default supabase
