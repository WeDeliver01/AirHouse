// Saving a user's own profile.
//
// PostgREST answers "Cannot coerce the result to a single JSON object" when a
// write that asks for exactly one row back (`.single()`) touches zero rows.
// For profiles that happens when the row was never provisioned at signup, or
// when the live table's policies/grants silently stop the owner updating it.
// Nothing here uses `.single()` on a write: zero rows is handled explicitly.
//
// The preferred path is the save_my_profile() RPC (migration 034), which
// writes only the caller's own self-service columns and provisions missing
// rows. If that migration has not been applied yet, we fall back to direct
// table writes.

export const PROFILE_FIELDS = ['full_name', 'avatar_url', 'company_name', 'bio', 'phone']
export const CREATOR_FIELDS = [
  'instagram_handle', 'tiktok_handle', 'youtube_handle', 'follower_count', 'niche',
  'portfolio_urls', 'past_collaborations', 'rate_card', 'location', 'is_available',
  'avg_engagement_rate',
]

export const pick = (obj, keys) => {
  const out = {}
  for (const key of keys) {
    if (obj && key in obj) out[key] = obj[key]
  }
  return out
}

export const isMissingRpc = (err) =>
  err?.code === 'PGRST202' ||
  err?.code === '42883' ||
  /could not find the function|function .* does not exist/i.test(err?.message || '')

const missingColumn = (err) => {
  if (!err?.message?.includes('column') || !err.message.includes('schema cache')) return null
  return err.message.match(/'(\w+)' column/)?.[1] || null
}

/**
 * Update the caller's profiles row, creating it if it is missing.
 * Returns the saved row (or the fields written, if the row isn't readable back).
 */
export async function writeProfileRow(supabase, user, fields) {
  const sanitized = pick(fields, PROFILE_FIELDS)
  if (Object.keys(sanitized).length === 0) throw new Error('No valid fields to update')

  let { data: rows, error } = await supabase
    .from('profiles')
    .update(sanitized)
    .eq('id', user.id)
    .select()

  // A column the code knows about but the live database lacks: drop it, retry.
  const badField = missingColumn(error)
  if (badField && badField in sanitized) {
    console.warn(`Field '${badField}' not in DB, retrying without it`)
    delete sanitized[badField]
    if (Object.keys(sanitized).length === 0) throw new Error('No valid fields to update')
    const retry = await supabase
      .from('profiles')
      .update(sanitized)
      .eq('id', user.id)
      .select()
    rows = retry.data
    error = retry.error
  }
  if (error) throw error
  if (rows?.length) return rows[0]

  // Zero rows updated. Either the row is missing, or it exists and we may not
  // update it. Tell those apart before doing anything else.
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (lookupError) throw lookupError

  if (existing) {
    throw new Error(
      'Your profile exists but the database refused the update. ' +
      'Apply migration 034_save_my_profile_rpc.sql, or contact support.'
    )
  }

  const fullName =
    (sanitized.full_name || '').trim() ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'User'
  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: user.id, email: user.email, ...sanitized, full_name: fullName })
    .select()
  if (insertError) throw insertError
  return inserted?.[0] || { id: user.id, email: user.email, ...sanitized, full_name: fullName }
}

/** Update the caller's creator_profiles row, creating it if it is missing. */
export async function writeCreatorRow(supabase, user, fields) {
  const sanitized = pick(fields, CREATOR_FIELDS)
  if (Object.keys(sanitized).length === 0) throw new Error('No valid fields to update')

  const { data: rows, error } = await supabase
    .from('creator_profiles')
    .update(sanitized)
    .eq('user_id', user.id)
    .select()
  if (error) throw error
  if (rows?.length) return rows[0]

  const { data: existing, error: lookupError } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (lookupError) throw lookupError

  if (existing) {
    throw new Error(
      'Your creator profile exists but the database refused the update. ' +
      'Apply migration 034_save_my_profile_rpc.sql, or contact support.'
    )
  }

  const { data: inserted, error: insertError } = await supabase
    .from('creator_profiles')
    .insert({ user_id: user.id, ...sanitized })
    .select()
  if (insertError) throw insertError
  return inserted?.[0] || { user_id: user.id, ...sanitized }
}

/**
 * Save profile fields and (optionally) creator fields for the signed-in user.
 * Returns { profile, creator_profile }.
 */
export async function saveMyProfile(supabase, user, profileFields = {}, creatorFields = null) {
  if (!user) throw new Error('No user logged in')

  const p_profile = pick(profileFields, ['full_name', 'bio', 'phone', 'company_name'])
  const p_creator = creatorFields ? pick(creatorFields, CREATOR_FIELDS) : null

  const { data, error } = await supabase.rpc('save_my_profile', { p_profile, p_creator })
  if (!error) return data || {}
  if (!isMissingRpc(error)) throw error

  // Migration 034 not applied yet: write the tables directly.
  const result = { profile: null, creator_profile: null }
  if (Object.keys(p_profile).length) {
    result.profile = await writeProfileRow(supabase, user, p_profile)
  }
  if (p_creator && Object.keys(p_creator).length) {
    result.creator_profile = await writeCreatorRow(supabase, user, p_creator)
  }
  return result
}
