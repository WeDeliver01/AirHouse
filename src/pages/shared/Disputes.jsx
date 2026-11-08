import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../components/stitch'
import { formatRelativeTime } from '../../lib/utils'
import {
  createDispute,
  DISPUTE_STATUS,
  DISPUTE_TYPES,
} from '../../lib/disputes'
import { toast } from 'react-hot-toast'

const rolePathPrefix = (profile) => {
  if (profile?.is_super_admin) return '/admin'
  if (profile?.role === 'developer') return '/developer'
  return '/creator'
}

export default function Disputes() {
  const { user, profile, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [disputes, setDisputes] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [assignments, setAssignments] = useState([])

  const [showNewDispute, setShowNewDispute] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [files, setFiles] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [formData, setFormData] = useState({
    campaignId: '',
    assignmentId: '',
    disputeType: 'payment',
    title: '',
    description: '',
  })

  // ---------- data ----------
  useEffect(() => {
    if (user?.id) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role, isSuperAdmin])

  async function fetchAll() {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('disputes')
        .select(`
          *,
          campaigns(id, title, property_name),
          reporter:reporter_id(full_name, avatar_url),
          reported_party:reported_party_id(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false })

      if (!isSuperAdmin) {
        query = query.or(`reporter_id.eq.${user.id},reported_party_id.eq.${user.id}`)
      }

      const { data: disputeRows, error: dErr } = await query
      if (dErr) throw dErr
      setDisputes(disputeRows || [])

      // Campaign & assignment options for the Report Issue form
      if (profile?.role === 'developer') {
        const { data: campaignsData } = await supabase
          .from('campaigns')
          .select('id, title, property_name, developer_id')
          .eq('developer_id', user.id)
        setCampaigns(campaignsData || [])

        const ids = (campaignsData || []).map((c) => c.id)
        if (ids.length > 0) {
          const { data: assignmentsData } = await supabase
            .from('campaign_assignments')
            .select(
              'id, campaign_id, creator_profiles(user_id, profiles:user_id(full_name))',
            )
            .in('campaign_id', ids)
          setAssignments(assignmentsData || [])
        }
      } else if (profile?.role === 'creator') {
        const { data: cp } = await supabase
          .from('creator_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (cp?.id) {
          const { data: assignmentsData } = await supabase
            .from('campaign_assignments')
            .select(
              'id, campaign_id, campaigns(id, title, property_name, developer_id)',
            )
            .eq('creator_id', cp.id)
          setAssignments(assignmentsData || [])
          setCampaigns(
            (assignmentsData || [])
              .map((a) => a.campaigns)
              .filter(Boolean),
          )
        }
      }
    } catch (e) {
      console.error(e)
      setError('Failed to load disputes')
    } finally {
      setLoading(false)
    }
  }

  // Open prefilled modal when arriving with ?campaign=xxx&assignment=yyy
  useEffect(() => {
    const c = searchParams.get('campaign')
    const a = searchParams.get('assignment')
    if (c) {
      setShowNewDispute(true)
      setFormData((f) => ({
        ...f,
        campaignId: c,
        assignmentId: a || '',
      }))
      // strip the query so reloading the page won't keep reopening it
      const next = new URLSearchParams(searchParams)
      next.delete('campaign')
      next.delete('assignment')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- derived ----------
  const filteredDisputes = useMemo(() => {
    if (statusFilter === 'all') return disputes
    return disputes.filter((d) => d.status === statusFilter)
  }, [disputes, statusFilter])

  const counts = useMemo(() => {
    const c = { all: disputes.length, open: 0, under_review: 0, resolved: 0, closed: 0, escalated: 0 }
    disputes.forEach((d) => {
      if (c[d.status] !== undefined) c[d.status] += 1
    })
    return c
  }, [disputes])

  // ---------- submit ----------
  async function submit() {
    if (!formData.campaignId || !formData.title.trim() || !formData.description.trim()) {
      toast.error('Campaign, title and description are required')
      return
    }
    // Developers must pick which creator (assignment) the issue is against — otherwise
    // reported_party_id would be null and the other party can't see / respond to the case.
    if (profile?.role === 'developer' && !formData.assignmentId) {
      toast.error('Please select which creator the issue is about')
      return
    }
    setSubmitting(true)
    try {
      // Resolve the reported party
      let reportedPartyId = null
      const campaign = campaigns.find((c) => c.id === formData.campaignId)
      if (profile?.role === 'developer') {
        const a = assignments.find((x) => x.id === formData.assignmentId)
        reportedPartyId = a?.creator_profiles?.user_id || null
      } else if (profile?.role === 'creator') {
        reportedPartyId = campaign?.developer_id || null
      }
      if (!reportedPartyId) {
        toast.error('Could not identify the other party. Please pick a different campaign or creator.')
        setSubmitting(false)
        return
      }

      const dispute = await createDispute({
        campaignId: formData.campaignId,
        assignmentId: formData.assignmentId || null,
        reporterId: user.id,
        reportedPartyId,
        disputeType: formData.disputeType,
        title: formData.title.trim(),
        description: formData.description.trim(),
        files,
      })

      toast.success('Dispute filed')
      setShowNewDispute(false)
      setFormData({
        campaignId: '',
        assignmentId: '',
        disputeType: 'payment',
        title: '',
        description: '',
      })
      setFiles([])
      // Send the user straight to the new detail page so they can see it
      navigate(`${rolePathPrefix(profile)}/disputes/${dispute.id}`)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to submit dispute')
    } finally {
      setSubmitting(false)
    }
  }

  function onPickFiles(e) {
    const list = Array.from(e.target.files || [])
    setFiles((prev) => [...prev, ...list])
    e.target.value = ''
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  // ---------- render ----------
  return (
    <div className="space-y-lg">
      <PageHeader
        eyebrow="Trust & Safety"
        title={isSuperAdmin ? 'All Disputes' : 'Dispute Resolution'}
        description={
          isSuperAdmin
            ? 'Mediate active disputes across the platform.'
            : 'Open a case with platform mediation. All evidence is encrypted at rest and only visible to involved parties and Replit super admins.'
        }
        actions={
          !isSuperAdmin && (
            <Button
              variant="primary"
              icon="report"
              onClick={() => setShowNewDispute(true)}
            >
              Report Issue
            </Button>
          )
        }
      />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-sm">
        {[
          ['all', 'All'],
          ['open', 'Open'],
          ['under_review', 'Under Review'],
          ['resolved', 'Resolved'],
          ['closed', 'Closed'],
          ['escalated', 'Escalated'],
        ].map(([key, label]) => {
          const active = statusFilter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={
                'inline-flex items-center gap-xs px-sm py-xs rounded font-label-md text-label-md transition-colors ' +
                (active
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high')
              }
            >
              {label}
              <span className={active ? 'opacity-90' : 'opacity-70'}>
                ({counts[key] ?? 0})
              </span>
            </button>
          )
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-sm">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <EmptyState
            icon="error"
            title="Couldn't load disputes"
            description={error}
            action={
              <Button variant="primary" icon="refresh" onClick={fetchAll}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : filteredDisputes.length === 0 ? (
        <Card>
          <EmptyState
            icon="gavel"
            title={statusFilter === 'all' ? 'No disputes yet' : 'No disputes in this status'}
            description={
              statusFilter === 'all'
                ? 'When something goes wrong with a campaign, file a dispute and Replit super admins will mediate.'
                : 'Try a different filter to see other disputes.'
            }
            action={
              !isSuperAdmin && statusFilter === 'all' ? (
                <Button
                  variant="primary"
                  icon="report"
                  onClick={() => setShowNewDispute(true)}
                >
                  Report an issue
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-sm">
          {filteredDisputes.map((d) => (
            <DisputeListCard
              key={d.id}
              dispute={d}
              currentUserId={user.id}
              onOpen={() =>
                navigate(`${rolePathPrefix(profile)}/disputes/${d.id}`)
              }
            />
          ))}
        </div>
      )}

      {/* Report Issue modal */}
      <Modal
        isOpen={showNewDispute}
        onClose={() => !submitting && setShowNewDispute(false)}
        title="Report an Issue"
        description="A super admin will review your case within two business days."
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowNewDispute(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="send"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit dispute'}
            </Button>
          </>
        }
      >
        <div className="space-y-md">
          <Select
            label="Campaign"
            value={formData.campaignId}
            placeholder="Select a campaign"
            onChange={(e) =>
              setFormData((f) => ({ ...f, campaignId: e.target.value }))
            }
            options={campaigns.map((c) => ({
              value: c.id,
              label: c.title || c.property_name,
            }))}
          />

          {profile?.role === 'developer' && formData.campaignId && (
            (() => {
              const opts = assignments.filter((a) => a.campaign_id === formData.campaignId)
              if (opts.length === 0) {
                return (
                  <p className="font-body-sm text-body-sm text-error">
                    This campaign has no active creators yet, so there is no other party to dispute. Assign a creator before reporting an issue.
                  </p>
                )
              }
              return (
                <Select
                  label="Which creator (required)"
                  value={formData.assignmentId}
                  placeholder="Select the creator the issue is about"
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, assignmentId: e.target.value }))
                  }
                  options={opts.map((a) => ({
                    value: a.id,
                    label:
                      a.creator_profiles?.profiles?.full_name ||
                      'Unknown creator',
                  }))}
                />
              )
            })()
          )}

          <div>
            <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
              Issue type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-sm">
              {DISPUTE_TYPES.map((t) => {
                const active = formData.disputeType === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setFormData((f) => ({ ...f, disputeType: t.id }))
                    }
                    className={
                      'flex items-center gap-sm rounded border px-sm py-sm text-left transition-colors ' +
                      (active
                        ? 'border-secondary bg-secondary-container text-on-secondary-container'
                        : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:border-outline')
                    }
                  >
                    <Icon name={t.icon} size={18} />
                    <span className="font-label-md text-label-md">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <Input
            label="Title"
            placeholder="Brief summary of the issue"
            value={formData.title}
            onChange={(e) =>
              setFormData((f) => ({ ...f, title: e.target.value }))
            }
          />

          <Textarea
            label="Description"
            placeholder="Describe what happened, when, and what outcome you're hoping for."
            rows={5}
            value={formData.description}
            onChange={(e) =>
              setFormData((f) => ({ ...f, description: e.target.value }))
            }
          />

          {/* Evidence */}
          <div>
            <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
              Evidence (optional)
            </label>
            <div className="rounded border border-dashed border-outline-variant bg-surface-container-low p-md">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onPickFiles}
                accept="image/*,application/pdf,video/mp4,video/quicktime,video/webm,text/plain,application/zip,.doc,.docx"
              />
              <div className="flex items-center justify-between gap-sm">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Screenshots, contracts, message threads. Max 50&nbsp;MB per file.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="attach_file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add files
                </Button>
              </div>
              {files.length > 0 && (
                <ul className="mt-sm space-y-xs">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between gap-sm bg-surface-container-lowest rounded px-sm py-xs border border-outline-variant"
                    >
                      <div className="flex items-center gap-sm min-w-0">
                        <Icon name="description" size={16} className="text-on-surface-variant" />
                        <span className="font-body-sm text-body-sm text-on-surface truncate">
                          {f.name}
                        </span>
                        <span className="font-label-md text-label-md text-on-surface-variant shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-on-surface-variant hover:text-on-surface"
                        aria-label="Remove file"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================
// List card
// ============================================

function DisputeListCard({ dispute, currentUserId, onOpen }) {
  const status = DISPUTE_STATUS[dispute.status] || DISPUTE_STATUS.open
  const type = DISPUTE_TYPES.find((t) => t.id === dispute.dispute_type)
  const isReporter = dispute.reporter_id === currentUserId
  const otherName = isReporter
    ? dispute.reported_party?.full_name || 'Other party'
    : dispute.reporter?.full_name || 'Reporter'

  return (
    <Card padding="none" className="hover:border-outline transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left p-md flex items-start gap-md"
      >
        <span className="shrink-0 w-10 h-10 rounded bg-surface-container text-on-surface-variant inline-flex items-center justify-center">
          <Icon name={type?.icon || 'gavel'} size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-sm">
            <div className="min-w-0">
              <h3 className="font-headline-md text-headline-md text-on-surface truncate">
                {dispute.title}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs truncate">
                {dispute.campaigns?.title || dispute.campaigns?.property_name || 'Campaign'} ·{' '}
                {isReporter ? 'You opened' : 'Filed against you'} · {otherName}
              </p>
            </div>
            <Chip tone={status.tone} icon={status.icon}>
              {status.label}
            </Chip>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-sm line-clamp-2">
            {dispute.description}
          </p>
          <div className="mt-sm flex items-center justify-between gap-sm">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Opened {formatRelativeTime(dispute.created_at)}
            </span>
            <span className="font-label-md text-label-md text-secondary inline-flex items-center gap-xs">
              View case
              <Icon name="arrow_forward" size={16} />
            </span>
          </div>
        </div>
      </button>
    </Card>
  )
}
