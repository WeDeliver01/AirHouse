import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingSpinner, ErrorState } from '../../components/ui'

/**
 * Short referral link: /r/:code
 *
 * Creators share airhouse.co.za/r/CRE-XXXXXXXX instead of the long
 * /lead/<campaign uuid>?ref=CRE-XXXXXXXX. The code is resolved to its campaign
 * server-side (resolve_referral_campaign, migration 038, which only answers
 * for live campaigns), then the visitor lands on the normal enquiry page with
 * the code attached so the creator is credited.
 */
const ReferralShortLink = () => {
  const { code } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const resolve = async () => {
      try {
        const { data: campaignId, error: rpcError } = await supabase
          .rpc('resolve_referral_campaign', { p_code: code })
        if (cancelled) return
        if (rpcError) throw rpcError
        if (!campaignId) {
          setError('This link is no longer active.')
          return
        }
        navigate(`/lead/${campaignId}?ref=${encodeURIComponent(code)}`, { replace: true })
      } catch (e) {
        console.error('Referral link lookup failed:', e)
        if (!cancelled) setError('We could not open this link. Please try again.')
      }
    }
    if (code) resolve()
    return () => { cancelled = true }
  }, [code, navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <ErrorState message={error} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <LoadingSpinner size="lg" text="Loading…" />
    </div>
  )
}

export default ReferralShortLink
