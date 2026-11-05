import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { getVerificationSignedUrl } from '../../lib/verification'
import { notify } from '../../lib/notifications'
import { Modal, ModalFooter, Textarea, Button, LoadingSpinner, ErrorState } from '../../components/ui'
import { formatDate, formatRelativeTime, cn } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import {
  ShieldCheck,
  ShieldX,
  ExternalLink,
  Instagram,
  Youtube,
  Music2,
  Building2,
  Video,
  CheckCircle,
  XCircle,
  FileText,
  Filter,
  Edit3,
  Info,
  Camera,
  Share2,
  BadgeCheck,
  Globe,
  MapPin,
  ImageOff,
  RefreshCw,
  Download,
} from 'lucide-react'

const initials = (name) =>
  (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()

const SignedDocumentPreview = ({ path, alt, fallbackIcon: FallbackIcon = ImageOff, fallbackText, mimeHint }) => {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!path) {
      setUrl(null)
      return undefined
    }
    setLoading(true)
    setError(false)
    getVerificationSignedUrl(path, 600)
      .then((signed) => {
        if (cancelled) return
        if (signed) {
          setUrl(signed)
        } else {
          setError(true)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const isPdf = mimeHint === 'application/pdf' || /\.pdf$/i.test(path || '')

  if (!path) {
    return (
      <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded mb-sm h-44 flex flex-col items-center justify-center text-on-surface-variant text-center p-4">
        <FallbackIcon className="w-8 h-8 mb-2" />
        <p className="font-body-sm text-body-sm">{fallbackText || 'No document uploaded.'}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded mb-sm h-44 flex items-center justify-center">
        <LoadingSpinner size="sm" />
      </div>
    )
  }

  if (error || !url) {
    return (
      <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded mb-sm h-44 flex flex-col items-center justify-center text-on-surface-variant text-center p-4">
        <ImageOff className="w-8 h-8 mb-2" />
        <p className="font-body-sm text-body-sm">Couldn&apos;t load preview.</p>
      </div>
    )
  }

  if (isPdf) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded mb-sm h-44 flex flex-col items-center justify-center text-on-surface-variant text-center p-4">
        <FileText className="w-8 h-8 mb-2 text-primary" />
        <p className="font-body-sm text-body-sm mb-2">PDF document uploaded.</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline font-label-md text-label-md"
        >
          <Download className="w-3.5 h-3.5" /> Open document
        </a>
      </div>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-surface-container-lowest border border-outline-variant rounded overflow-hidden mb-sm h-44 group relative"
      title="Click to open full-size in a new tab"
    >
      <img src={url} alt={alt} className="w-full h-full object-cover object-center" />
      <span className="absolute bottom-1 right-1 bg-black/55 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
        <ExternalLink className="w-3 h-3" /> Open
      </span>
    </a>
  )
}

const AdminVerification = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filterRole, setFilterRole] = useState('all')

  const fetchPending = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: pendingRequests, error: requestsError } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true })

      if (requestsError) throw requestsError

      const userIds = Array.from(new Set((pendingRequests || []).map((r) => r.user_id)))

      let profileMap = new Map()
      let creatorMap = new Map()
      let developerMap = new Map()

      if (userIds.length > 0) {
        const [profilesRes, creatorsRes, developersRes] = await Promise.all([
          supabase
            .from('profiles')
            .select(
              'id, email, full_name, role, avatar_url, company_name, bio, phone, created_at, is_verified, verification_rejected_at, verification_rejection_reason',
            )
            .in('id', userIds),
          supabase
            .from('creator_profiles')
            .select(
              'user_id, instagram_handle, tiktok_handle, youtube_handle, follower_count, niche, portfolio_urls, location, avg_engagement_rate, reliability_score',
            )
            .in('user_id', userIds),
          supabase
            .from('developer_profiles')
            .select('*')
            .in('user_id', userIds)
            .then((res) => (res.error ? { data: [] } : res)),
        ])

        if (profilesRes.error) throw profilesRes.error
        profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]))
        creatorMap = new Map((creatorsRes.data || []).map((r) => [r.user_id, r]))
        developerMap = new Map((developersRes.data || []).map((r) => [r.user_id, r]))
      }

      const enriched = (pendingRequests || []).map((req) => {
        const profile = profileMap.get(req.user_id) || null
        return {
          request: req,
          profile,
          creator: creatorMap.get(req.user_id) || null,
          developer: developerMap.get(req.user_id) || null,
        }
      })

      setRequests(enriched)
      if (enriched.length > 0 && !enriched.find((v) => v.request.id === selectedId)) {
        setSelectedId(enriched[0].request.id)
      } else if (enriched.length === 0) {
        setSelectedId(null)
      }
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Failed to load verification queue')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    fetchPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(
    () =>
      requests.filter((v) => filterRole === 'all' || v.profile?.role === filterRole),
    [requests, filterRole],
  )
  const selected =
    filtered.find((v) => v.request.id === selectedId) || filtered[0] || null

  const advanceSelection = (currentRequestId) => {
    const remaining = requests.filter((v) => v.request.id !== currentRequestId)
    setRequests(remaining)
    setSelectedId(remaining[0]?.request.id || null)
  }

  const sendDecisionEmail = async (item, kind, extra = {}) => {
    const email = item.profile?.email
    if (!email) return
    const dashboardPath = item.profile?.role === 'developer' ? '/developer/dashboard' : '/creator/dashboard'
    const dashboardUrl = `${window.location.origin}${dashboardPath}`
    const payload = {
      userName: item.profile?.full_name || 'there',
      dashboardUrl,
      ...extra,
    }
    try {
      if (kind === 'approved') {
        await notify.verificationApproved(email, payload)
      } else {
        await notify.verificationRejected(email, payload)
      }
    } catch (err) {
      console.warn(`Failed to send ${kind} email:`, err)
    }
  }

  const handleApprove = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    try {
      const trimmedNote = adminNote.trim()
      const nowIso = new Date().toISOString()
      const { data: { user: adminUser } = {} } = await supabase.auth.getUser()

      const { error: requestError } = await supabase
        .from('verification_requests')
        .update({
          status: 'approved',
          reviewer_id: adminUser?.id || null,
          reviewer_notes: trimmedNote || null,
          reviewed_at: nowIso,
        })
        .eq('id', selected.request.id)
      if (requestError) throw requestError

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          is_verified: true,
          verification_rejected_at: null,
          verification_rejection_reason: null,
        })
        .eq('id', selected.request.user_id)
      if (profileError) throw profileError

      sendDecisionEmail(selected, 'approved', { level: selected.request.target_level })

      toast.success('Application approved · user is now verified')
      advanceSelection(selected.request.id)
      setAdminNote('')
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Failed to approve')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }
    if (!selected || submitting) return
    setSubmitting(true)
    try {
      const trimmedReason = rejectionReason.trim()
      const trimmedNote = adminNote.trim()
      const composedReason = trimmedNote
        ? `${trimmedReason}\n\nReviewer note: ${trimmedNote}`
        : trimmedReason
      const nowIso = new Date().toISOString()
      const { data: { user: adminUser } = {} } = await supabase.auth.getUser()

      const { error: requestError } = await supabase
        .from('verification_requests')
        .update({
          status: 'rejected',
          reviewer_id: adminUser?.id || null,
          reviewer_notes: trimmedNote || null,
          rejection_reason: composedReason,
          reviewed_at: nowIso,
        })
        .eq('id', selected.request.id)
      if (requestError) throw requestError

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          verification_rejected_at: nowIso,
          verification_rejection_reason: composedReason,
        })
        .eq('id', selected.request.user_id)
      if (profileError) throw profileError

      sendDecisionEmail(selected, 'rejected', { reason: composedReason })

      toast.success('Application rejected · reason saved to applicant record')
      advanceSelection(selected.request.id)
      setAdminNote('')
      setRejectionReason('')
      setShowRejectModal(false)
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Failed to reject')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading verification queue…" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={fetchPending} />

  return (
    <div className="space-y-md">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            Verification Center
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Review identity, social proof and approve verified status for new creators and developers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-secondary-fixed text-on-secondary-fixed px-3 py-1 rounded font-label-md text-label-md font-bold">
            {requests.length} Pending
          </span>
          <button
            type="button"
            onClick={fetchPending}
            className="p-2 rounded border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors"
            title="Refresh queue"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Side-by-side reviewer */}
      <div className="grid grid-cols-12 gap-gutter min-h-[640px]">
        {/* Queue */}
        <section className="col-span-12 md:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col overflow-hidden">
          <div className="p-md border-b border-outline-variant bg-surface flex justify-between items-center shrink-0">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Review Queue</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                {filtered.length} of {requests.length} pending
              </p>
            </div>
            <div className="relative">
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="appearance-none pl-8 pr-3 py-1.5 bg-surface-container-lowest border border-outline-variant rounded font-label-md text-label-md text-on-surface focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">All</option>
                <option value="creator">Creators</option>
                <option value="developer">Developers</option>
              </select>
              <Filter className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[640px]">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 text-on-surface-variant">
                <ShieldCheck className="w-10 h-10 text-secondary mb-2" />
                <p className="font-body-sm text-body-sm">No pending reviews in this filter.</p>
              </div>
            ) : (
              filtered.map((v) => {
                const active = v.request.id === (selected?.request.id || selectedId)
                const profile = v.profile || {}
                return (
                  <button
                    key={v.request.id}
                    type="button"
                    onClick={() => setSelectedId(v.request.id)}
                    className={cn(
                      'w-full text-left p-sm border-b border-outline-variant transition-colors flex items-start gap-sm border-l-4',
                      active
                        ? 'bg-surface-container-low border-l-primary'
                        : 'bg-surface-container-lowest border-l-transparent hover:bg-surface',
                    )}
                  >
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.full_name}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface font-bold shrink-0">
                        {initials(profile.full_name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h3 className="font-label-lg text-label-lg text-on-surface truncate">
                          {profile.full_name || 'Unnamed user'}
                        </h3>
                        <span className="font-label-md text-label-md text-on-surface-variant ml-2 shrink-0">
                          {formatRelativeTime(v.request.submitted_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-xs mt-1">
                        <span className="bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded font-label-md text-[10px] uppercase">
                          {profile.role || 'unknown'}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                          {profile.role === 'creator'
                            ? v.creator?.location || 'Awaiting verification'
                            : profile.company_name || 'Awaiting verification'}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        {/* Detail */}
        <section className="col-span-12 md:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col overflow-hidden relative">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-on-surface-variant">
              <ShieldCheck className="w-12 h-12 text-secondary mb-3" />
              <p className="font-headline-md text-headline-md text-on-surface">
                Nothing in the queue
              </p>
              <p className="font-body-sm text-body-sm mt-1 max-w-xs">
                When a new verification request arrives, it will appear here for review.
              </p>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="px-md py-sm border-b border-outline-variant bg-surface flex flex-col md:flex-row md:justify-between md:items-center gap-3 shrink-0">
                <div className="flex items-center gap-md min-w-0">
                  {selected.profile?.avatar_url ? (
                    <img
                      src={selected.profile.avatar_url}
                      alt={selected.profile.full_name}
                      className="w-14 h-14 rounded-full object-cover border-2 border-surface-container-high shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface font-bold text-lg border-2 border-surface-container-high shrink-0">
                      {initials(selected.profile?.full_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-sm flex-wrap">
                      <h2 className="font-headline-lg text-headline-lg text-on-surface truncate">
                        {selected.profile?.full_name || 'Unnamed user'}
                      </h2>
                      <span className="bg-surface-container-highest text-on-surface px-2 py-1 rounded font-label-md text-label-md flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-outline" />
                        Awaiting verification · {selected.request.target_level}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-body-sm text-body-sm text-on-surface-variant">
                      <span className="font-data-mono text-data-mono">
                        ID: {String(selected.request.id).slice(0, 8).toUpperCase()}
                      </span>
                      <span>Submitted: {formatDate(selected.request.submitted_at)}</span>
                      {(selected.creator?.location || selected.profile?.company_name) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {selected.creator?.location || selected.profile?.company_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'px-3 py-1 rounded font-label-md text-label-md flex items-center gap-1 capitalize shrink-0 self-start md:self-auto',
                    selected.profile?.role === 'creator'
                      ? 'bg-primary-container/20 text-primary'
                      : 'bg-secondary-container text-on-secondary-fixed',
                  )}
                >
                  {selected.profile?.role === 'creator' ? (
                    <Video className="w-3.5 h-3.5" />
                  ) : (
                    <Building2 className="w-3.5 h-3.5" />
                  )}
                  {selected.profile?.role || 'unknown'}
                </span>
              </div>

              {/* Bento body */}
              <div className="flex-1 overflow-y-auto p-md grid grid-cols-1 md:grid-cols-2 gap-md content-start">
                {/* Identity Document */}
                <div className="md:col-span-1 bg-surface border border-outline-variant rounded p-sm flex flex-col">
                  <div className="flex justify-between items-center mb-sm">
                    <h3 className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                      <BadgeCheck className="w-4 h-4 text-tertiary" />
                      Identity Document
                    </h3>
                    <span className="font-label-md text-label-md text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                      {selected.request.id_document_type
                        ? selected.request.id_document_type.replace(/_/g, ' ')
                        : selected.profile?.role === 'developer'
                        ? 'Company Reg.'
                        : 'ID / Passport'}
                    </span>
                  </div>
                  <SignedDocumentPreview
                    path={selected.request.id_document_path}
                    alt="Submitted identity document"
                    fallbackIcon={FileText}
                    fallbackText="No ID document on file."
                  />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-md font-body-sm text-body-sm">
                    <div className="text-on-surface-variant">Submitted name:</div>
                    <div className="text-on-surface font-data-mono break-words">
                      {selected.profile?.full_name || '—'}
                    </div>
                    {selected.profile?.role === 'developer' && (
                      <>
                        <div className="text-on-surface-variant">Company:</div>
                        <div className="text-on-surface font-data-mono break-words">
                          {selected.profile?.company_name || '—'}
                        </div>
                      </>
                    )}
                    <div className="text-on-surface-variant">Phone:</div>
                    <div className="text-on-surface font-data-mono">
                      {selected.profile?.phone || '—'}
                    </div>
                    <div className="text-on-surface-variant">Joined:</div>
                    <div className="text-on-surface font-data-mono">
                      {selected.profile?.created_at ? formatDate(selected.profile.created_at) : '—'}
                    </div>
                  </div>
                </div>

                {/* Selfie */}
                <div className="md:col-span-1 bg-surface border border-outline-variant rounded p-sm flex flex-col">
                  <div className="flex justify-between items-center mb-sm">
                    <h3 className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                      <Camera className="w-4 h-4 text-tertiary" />
                      Liveness Selfie
                    </h3>
                    <span
                      className={cn(
                        'font-label-md text-label-md px-2 py-0.5 rounded flex items-center gap-1',
                        selected.request.selfie_path
                          ? 'text-secondary bg-secondary-container'
                          : 'text-on-surface-variant bg-surface-container',
                      )}
                    >
                      {selected.request.selfie_path ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> Provided
                        </>
                      ) : (
                        <>
                          <Info className="w-3 h-3" /> Missing
                        </>
                      )}
                    </span>
                  </div>
                  <SignedDocumentPreview
                    path={selected.request.selfie_path}
                    alt="Submitted liveness selfie"
                    fallbackIcon={Camera}
                    fallbackText="No selfie uploaded."
                  />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-body-sm text-body-sm">
                    <div className="text-on-surface-variant">Avatar on profile:</div>
                    <div className="text-on-surface font-data-mono">
                      {selected.profile?.avatar_url ? 'Yes' : 'No'}
                    </div>
                    <div className="text-on-surface-variant">Bio supplied:</div>
                    <div className="text-on-surface font-data-mono">
                      {selected.profile?.bio ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>

                {/* Applicant notes */}
                {selected.request.applicant_notes && (
                  <div className="md:col-span-2 bg-surface border border-outline-variant rounded p-sm">
                    <h3 className="font-label-lg text-label-lg text-on-surface flex items-center gap-2 mb-sm">
                      <FileText className="w-4 h-4 text-tertiary" />
                      Applicant Notes
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                      {selected.request.applicant_notes}
                    </p>
                  </div>
                )}

                {/* Bio */}
                {selected.profile?.bio && (
                  <div className="md:col-span-2 bg-surface border border-outline-variant rounded p-sm">
                    <h3 className="font-label-lg text-label-lg text-on-surface flex items-center gap-2 mb-sm">
                      <FileText className="w-4 h-4 text-tertiary" />
                      Submitted Bio
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                      {selected.profile.bio}
                    </p>
                  </div>
                )}

                {/* Social Proof (creators) */}
                {selected.profile?.role === 'creator' && (
                  <div className="md:col-span-2 bg-surface border border-outline-variant rounded p-sm flex flex-col">
                    <div className="flex justify-between items-center mb-sm">
                      <h3 className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-tertiary" />
                        Social Proof
                      </h3>
                      <span className="font-label-md text-label-md text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                        Self-attested
                      </span>
                    </div>
                    {selected.creator ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {selected.creator.instagram_handle && (
                          <a
                            href={`https://instagram.com/${String(selected.creator.instagram_handle).replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-sm border border-outline-variant rounded bg-surface-container-lowest flex items-center gap-3 hover:border-primary/50 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center text-white shrink-0">
                              <Instagram className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-label-md text-label-md text-on-surface truncate underline decoration-outline-variant block">
                                {selected.creator.instagram_handle}
                              </span>
                              {selected.creator.follower_count > 0 && (
                                <span className="font-data-mono text-data-mono text-on-surface-variant">
                                  {Number(selected.creator.follower_count).toLocaleString()} followers
                                </span>
                              )}
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                          </a>
                        )}
                        {selected.creator.tiktok_handle && (
                          <a
                            href={`https://tiktok.com/@${String(selected.creator.tiktok_handle).replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-sm border border-outline-variant rounded bg-surface-container-lowest flex items-center gap-3 hover:border-primary/50 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white shrink-0">
                              <Music2 className="w-5 h-5" />
                            </div>
                            <span className="font-label-md text-label-md text-on-surface truncate underline decoration-outline-variant">
                              {selected.creator.tiktok_handle}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                          </a>
                        )}
                        {selected.creator.youtube_handle && (
                          <a
                            href={`https://youtube.com/${String(selected.creator.youtube_handle).replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-sm border border-outline-variant rounded bg-surface-container-lowest flex items-center gap-3 hover:border-primary/50 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0">
                              <Youtube className="w-5 h-5" />
                            </div>
                            <span className="font-label-md text-label-md text-on-surface truncate underline decoration-outline-variant">
                              {selected.creator.youtube_handle}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                          </a>
                        )}
                        {!selected.creator.instagram_handle &&
                          !selected.creator.tiktok_handle &&
                          !selected.creator.youtube_handle && (
                            <p className="font-body-sm text-body-sm text-on-surface-variant md:col-span-3">
                              No social handles supplied yet.
                            </p>
                          )}
                      </div>
                    ) : (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Creator profile not yet completed.
                      </p>
                    )}
                  </div>
                )}

                {/* Company Info (Developer) */}
                {selected.profile?.role === 'developer' && (
                  <div className="md:col-span-2 bg-surface border border-outline-variant rounded p-sm flex flex-col">
                    <div className="flex justify-between items-center mb-sm">
                      <h3 className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-tertiary" />
                        Company Information
                      </h3>
                    </div>
                    {selected.profile?.company_name || selected.profile?.bio ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-body-sm text-body-sm">
                        <div className="text-on-surface-variant">Registered name:</div>
                        <div className="text-on-surface font-medium">
                          {selected.profile?.company_name || '—'}
                        </div>
                        <div className="text-on-surface-variant">Phone:</div>
                        <div className="text-on-surface font-data-mono">
                          {selected.profile?.phone || '—'}
                        </div>
                        {selected.developer?.website && (
                          <>
                            <div className="text-on-surface-variant">Website:</div>
                            <a
                              href={selected.developer.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              <Globe className="w-3.5 h-3.5" />
                              {selected.developer.website}
                            </a>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Developer has not provided company information yet.
                      </p>
                    )}
                  </div>
                )}

                {/* Internal Notes */}
                <div className="md:col-span-2 bg-surface border border-outline-variant rounded p-sm">
                  <label
                    className="font-label-lg text-label-lg text-on-surface flex items-center gap-2 mb-2"
                    htmlFor="admin-notes"
                  >
                    <Edit3 className="w-4 h-4 text-tertiary" />
                    Internal Reviewer Notes
                  </label>
                  <textarea
                    id="admin-notes"
                    rows={3}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Add observations regarding document clarity, social profile authenticity, or specific approval conditions…"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none transition-shadow"
                  />
                  <p className="mt-2 font-label-md text-label-md text-on-surface-variant">
                    Notes are saved to the verification request alongside your decision.
                  </p>
                </div>
              </div>

              {/* Sticky Action Footer */}
              <div className="p-md border-t border-outline-variant bg-surface-container-low shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  {!selected.request.id_document_path || !selected.request.selfie_path ? (
                    <>
                      <ShieldX className="w-5 h-5 text-error" />
                      <span className="font-body-sm text-body-sm text-error">
                        Submission missing files — confirm before approving.
                      </span>
                    </>
                  ) : (
                    <>
                      <Info className="w-5 h-5 text-tertiary" />
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Both ID and selfie uploaded. Approve to grant verified status.
                      </span>
                    </>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRejectModal(true)}
                    disabled={submitting}
                    className="px-md py-2 rounded border border-error text-error hover:bg-error-container hover:text-on-error-container transition-colors font-label-lg text-label-lg font-semibold disabled:opacity-60"
                  >
                    Reject Application
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={submitting}
                    className="px-md py-2 rounded bg-secondary text-on-secondary hover:bg-secondary/90 transition-colors font-label-lg text-label-lg font-semibold flex items-center gap-2 shadow-sm disabled:opacity-60"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {submitting ? 'Approving…' : 'Approve & Verify'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Reject Reason Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Rejection Reason"
        size="sm"
      >
        <div className="space-y-4">
          <p className="font-body-md text-body-md text-on-surface-variant">
            Please provide a reason for rejecting this verification request. The applicant will be notified by email.
          </p>
          <Textarea
            label="Reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="e.g., ID image is blurry, selfie does not match ID, document expired…"
            rows={4}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowRejectModal(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleReject} disabled={submitting}>
            {submitting ? 'Rejecting…' : 'Confirm Rejection'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default AdminVerification
