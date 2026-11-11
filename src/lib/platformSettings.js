import { supabase } from './supabase'

/** Read a platform setting. Returns the fallback if it is not configured. */
export async function getPlatformSetting(key, fallback = null) {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error || !data) return fallback
  return data.value
}

/** Change a platform setting. Super admins only, enforced in the database. */
export async function setPlatformSetting(key, value) {
  const { data, error } = await supabase.rpc('set_platform_setting', {
    p_key: key,
    p_value: JSON.stringify(value),
  })
  if (error) throw new Error(error.message?.replace(/^.*?:\s*/, '') || 'Could not change setting')
  return data
}

/** Whether new signups must complete the ID-document + selfie upload step. */
export async function getRequireIdentityVerification() {
  return Boolean(await getPlatformSetting('require_identity_verification', false))
}
