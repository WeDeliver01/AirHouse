import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { resolveTrackingToken } from '../../lib/tracking'
import { LoadingSpinner, ErrorState } from '../../components/ui'

/**
 * First-party outbound redirect: /go/:token
 *
 * The visitor's request carries nothing but an opaque token. The actual
 * destination is resolved entirely server-side (record_tracking_click, in
 * migration 029) from the creator_tracking_links row that token belongs to
 * -- the client never supplies, and never trusts, a redirect URL of its own.
 */
const GoRedirect = () => {
  const { token } = useParams()
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const go = async () => {
      try {
        const result = await resolveTrackingToken(token)
        if (cancelled) return
        if (!result?.destination_url) throw new Error('No destination configured for this link')
        window.location.replace(result.destination_url)
      } catch (e) {
        console.error('Tracking link redirect failed:', e)
        if (!cancelled) setError('This link is no longer valid.')
      }
    }
    if (token) go()
    return () => { cancelled = true }
  }, [token])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <ErrorState message={error} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <LoadingSpinner size="lg" text="Redirecting…" />
    </div>
  )
}

export default GoRedirect
