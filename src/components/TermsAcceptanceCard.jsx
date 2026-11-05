import { useEffect, useState } from 'react'
import { ShieldCheck, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/**
 * Settings card showing the most recent terms_acceptances row for the
 * authenticated user — used for compliance audit display.
 */
const TermsAcceptanceCard = () => {
  const { user } = useAuth()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!user?.id) { setLoading(false); return }
    ;(async () => {
      try {
        const { data } = await supabase
          .from('terms_acceptances')
          .select('*')
          .eq('user_id', user.id)
          .order('accepted_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (active) setRow(data || null)
      } catch (_) { /* table may not exist yet — fail silent */ }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [user?.id])

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-emerald-700" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Terms acceptance</h2>
          <p className="text-sm text-gray-500">A record of the policy versions you've agreed to.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : row ? (
        <div className="text-sm text-gray-700 space-y-1">
          <p><strong>Accepted on:</strong> {new Date(row.accepted_at).toLocaleString('en-ZA')}</p>
          <p><strong>Terms version:</strong> {row.terms_version}</p>
          <p><strong>Privacy version:</strong> {row.privacy_version}</p>
          {row.role_agreement_key && (
            <p><strong>{row.role_agreement_key} version:</strong> {row.role_agreement_version}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No acceptance record on file yet. Newly registered accounts and users created before this feature
          launched may not have a record.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/legal/terms" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <FileText className="w-4 h-4" /> Terms of Service
        </a>
        <a href="/legal/privacy" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <FileText className="w-4 h-4" /> Privacy Policy
        </a>
        <a href="/legal" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <FileText className="w-4 h-4" /> All policies
        </a>
      </div>
    </div>
  )
}

export default TermsAcceptanceCard
