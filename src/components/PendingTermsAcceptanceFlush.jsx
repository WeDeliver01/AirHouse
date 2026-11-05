import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STORAGE_KEY = 'airhouse:pending-terms-acceptance:v1'

/**
 * Stash an acceptance intent at registration time when we may not yet be
 * authenticated (email-confirmation signups). The flusher below will then
 * write the row once the user is actually signed in.
 */
export const stashPendingTermsAcceptance = (payload) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...payload,
      stashedAt: new Date().toISOString(),
    }))
  } catch { /* storage may be disabled */ }
}

/**
 * Mounted once near the app root. When an auth session exists and there is a
 * stashed acceptance, write the audit row and clear the stash. RLS only
 * allows the authenticated user to insert their own row.
 */
const PendingTermsAcceptanceFlush = () => {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return
    let raw
    try { raw = window.localStorage.getItem(STORAGE_KEY) } catch { return }
    if (!raw) return
    let payload
    try { payload = JSON.parse(raw) } catch { window.localStorage.removeItem(STORAGE_KEY); return }
    ;(async () => {
      try {
        const { error } = await supabase.from('terms_acceptances').insert({
          user_id: user.id,
          role: payload.role,
          terms_version: payload.terms_version,
          privacy_version: payload.privacy_version,
          role_agreement_key: payload.role_agreement_key,
          role_agreement_version: payload.role_agreement_version,
          user_agent: payload.user_agent || null,
        })
        if (!error) window.localStorage.removeItem(STORAGE_KEY)
      } catch (e) {
        console.warn('Pending terms acceptance flush failed:', e?.message || e)
      }
    })()
  }, [user?.id])

  return null
}

export default PendingTermsAcceptanceFlush
