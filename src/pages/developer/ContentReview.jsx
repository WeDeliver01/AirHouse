import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader, Button, Card, Chip, Modal, Input, Textarea, Icon,
  EmptyState, Skeleton,
} from '../../components/stitch'
import { toast } from 'react-hot-toast'
import { formatDate, cn } from '../../lib/utils'
import { notify } from '../../lib/notifications'

const CONTENT_STATUSES = {
  draft:               { label: 'Draft',              tone: 'neutral' },
  submitted:           { label: 'Pending Review',     tone: 'primary' },
  revision_requested:  { label: 'Revision Requested', tone: 'warning' },
  approved:            { label: 'Approved',           tone: 'success' },
  scheduled:           { label: 'Scheduled',          tone: 'tertiary' },
  live:                { label: 'Live',               tone: 'secondary' },
  rejected:            { label: 'Rejected',           tone: 'danger' },
}

const CONTENT_TYPES = [
  { value: 'instagram_post',   label: 'Instagram Post' },
  { value: 'instagram_story',  label: 'Instagram Story' },
  { value: 'instagram_reel',   label: 'Instagram Reel' },
  { value: 'tiktok_video',     label: 'TikTok Video' },
  { value: 'youtube_video',    label: 'YouTube Video' },
  { value: 'youtube_short',    label: 'YouTube Short' },
  { value: 'facebook_post',    label: 'Facebook Post' },
  { value: 'twitter_post',     label: 'Twitter/X Post' },
  { value: 'blog_post',        label: 'Blog Post' },
  { value: 'other',            label: 'Other' },
]

const Avatar = ({ url, name, size = 32 }) => {
  const initial = (name || '?').charAt(0).toUpperCase()
  if (url) {
    return (
      <img
        src={url}
        alt={name || 'avatar'}
        style={{ width: size, height: size }}
        className="rounded object-cover bg-surface-container-high"
      />
    )
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="rounded bg-primary-container/30 text-primary inline-flex items-center justify-center font-label-md"
    >
      {initial}
    </span>
  )
}

const ContentReview = () => {
  const { campaignId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('pending')

  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const [reviewAction, setReviewAction] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [revisionChanges, setRevisionChanges] = useState([''])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (campaignId) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: campaignData, error: campError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('developer_id', user.id)
        .single()

      if (campError) throw campError
      setCampaign(campaignData)

      const { data: submissionsData } = await supabase
        .from('content_submissions')
        .select(`
          *,
          assignment:campaign_assignments(
            id,
            creator:creator_profiles(
              id,
              user:profiles(full_name, avatar_url, email)
            )
          )
        `)
        .eq('campaign_id', campaignId)
        .order('submitted_at', { ascending: false })

      setSubmissions(submissionsData || [])
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load content submissions')
      toast.error('Failed to load content')
    } finally {
      setLoading(false)
    }
  }

  const openReviewModal = (submission, action) => {
    setSelectedSubmission(submission)
    setReviewAction(action)
    setFeedback('')
    setRevisionChanges([''])
    setPaymentAmount(submission.payment_amount || '')
    setShowReviewModal(true)
  }

  const addRevisionChange = () => setRevisionChanges([...revisionChanges, ''])

  const updateRevisionChange = (index, value) => {
    const updated = [...revisionChanges]
    updated[index] = value
    setRevisionChanges(updated)
  }

  const removeRevisionChange = (index) => {
    setRevisionChanges(revisionChanges.filter((_, i) => i !== index))
  }

  const handleReview = async () => {
    if (!selectedSubmission || !reviewAction) return

    if ((reviewAction === 'revision' || reviewAction === 'reject') && !feedback) {
      toast.error('Please provide feedback')
      return
    }

    setProcessing(true)
    try {
      const now = new Date().toISOString()
      const updateData = { reviewed_by: user.id, reviewed_at: now }

      if (reviewAction === 'approve') {
        updateData.status = 'approved'
        updateData.approved_at = now
        if (paymentAmount) {
          updateData.payment_amount = parseFloat(paymentAmount)
          updateData.payment_status = 'pending_release'
        }
      } else if (reviewAction === 'revision') {
        const currentHistory = selectedSubmission.revision_history || []
        currentHistory.push({
          version: selectedSubmission.version || 1,
          requested_at: now,
          requested_by: user.id,
          feedback,
          specific_changes: revisionChanges.filter((c) => c.trim()),
        })
        updateData.status = 'revision_requested'
        updateData.revision_feedback = feedback
        updateData.revision_changes = revisionChanges.filter((c) => c.trim())
        updateData.revision_history = currentHistory
      } else if (reviewAction === 'reject') {
        updateData.status = 'rejected'
        updateData.rejection_reason = feedback
      }

      const { error: updateError } = await supabase
        .from('content_submissions')
        .update(updateData)
        .eq('id', selectedSubmission.id)

      if (updateError) throw updateError

      toast.success(
        reviewAction === 'approve' ? 'Content approved!'
          : reviewAction === 'revision' ? 'Revision requested'
            : 'Content rejected',
      )
      if (reviewAction === 'approve') {
        notify.contentApproved(selectedSubmission.assignment?.creator?.user?.email, {
          creatorName: selectedSubmission.assignment?.creator?.user?.full_name,
          campaignTitle: campaign?.title,
          reviewerName: profile?.full_name,
        })
      } else if (reviewAction === 'revision' || reviewAction === 'reject') {
        notify.contentRejected(selectedSubmission.assignment?.creator?.user?.email, {
          creatorName: selectedSubmission.assignment?.creator?.user?.full_name,
          campaignTitle: campaign?.title,
          reviewerName: profile?.full_name,
          feedback,
        })
      }
      setShowReviewModal(false)
      fetchData()
    } catch (e) {
      console.error('Review error:', e)
      toast.error('Failed to submit review')
    } finally {
      setProcessing(false)
    }
  }

  const getStatusMeta = (status) => CONTENT_STATUSES[status] || { label: status, tone: 'neutral' }

  const filteredSubmissions = submissions.filter((s) => {
    if (filter === 'all') return true
    if (filter === 'pending') return s.status === 'submitted'
    if (filter === 'approved') return ['approved', 'live'].includes(s.status)
    if (filter === 'revision') return s.status === 'revision_requested'
    return true
  })

  const stats = {
    total:    submissions.length,
    pending:  submissions.filter((s) => s.status === 'submitted').length,
    approved: submissions.filter((s) => ['approved', 'live'].includes(s.status)).length,
    revision: submissions.filter((s) => s.status === 'revision_requested').length,
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex flex-col gap-gutter">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon="error"
          title="Couldn't load content"
          description={error}
          action={<Button onClick={fetchData}>Retry</Button>}
        />
      </Card>
    )
  }

  const filterTiles = [
    { key: 'all',      label: 'Total',    value: stats.total,    accent: 'text-on-surface' },
    { key: 'pending',  label: 'Pending',  value: stats.pending,  accent: 'text-primary' },
    { key: 'approved', label: 'Approved', value: stats.approved, accent: 'text-secondary' },
    { key: 'revision', label: 'Revision', value: stats.revision, accent: 'text-error' },
  ]

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-gutter">
      <div>
        <button
          type="button"
          onClick={() => navigate(`/developer/campaigns/${campaignId}`)}
          className="inline-flex items-center gap-xs font-label-md text-label-md text-on-surface-variant hover:text-on-surface mb-md"
        >
          <Icon name="arrow_back" size={16} /> Back to Campaign
        </button>
        <PageHeader
          eyebrow="Content"
          title="Content Review"
          description={campaign?.title}
        />
      </div>

      {/* Stat tiles act as filter chips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        {filterTiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => setFilter(tile.key)}
            className={cn(
              'bg-surface border rounded p-md text-left transition-colors',
              filter === tile.key
                ? 'border-primary ambient-shadow'
                : 'border-outline-variant hover:border-outline',
            )}
          >
            <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              {tile.label}
            </p>
            <p className={cn('mt-xs font-headline-lg text-headline-lg font-data-mono', tile.accent)}>
              {tile.value}
            </p>
          </button>
        ))}
      </div>

      {/* Submissions */}
      <div className="flex flex-col gap-md">
        {filteredSubmissions.length === 0 ? (
          <Card>
            <EmptyState
              icon="description"
              title={`No content${filter !== 'all' ? ` (${filter})` : ''}`}
              description="Content submissions will appear here when creators submit their work."
            />
          </Card>
        ) : (
          filteredSubmissions.map((submission) => {
            const status = getStatusMeta(submission.status)
            const creator = submission.assignment?.creator?.user
            return (
              <Card key={submission.id} className="flex flex-col gap-md">
                <div className="flex items-start gap-md">
                  <div className="w-28 h-28 bg-surface-container rounded overflow-hidden flex-shrink-0 border border-outline-variant">
                    {submission.media_urls?.[0] ? (
                      <button
                        type="button"
                        onClick={() => { setSelectedSubmission(submission); setShowDetailModal(true) }}
                        className="w-full h-full"
                      >
                        <img src={submission.media_urls[0]} alt="" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                        <Icon name="description" size={28} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-md mb-xs">
                      <div className="min-w-0">
                        <h3 className="font-label-lg text-label-lg text-on-surface truncate">
                          {submission.title || 'Untitled'}
                        </h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {CONTENT_TYPES.find((t) => t.value === submission.content_type)?.label || submission.content_type}
                        </p>
                      </div>
                      <Chip tone={status.tone}>{status.label}</Chip>
                    </div>

                    {creator && (
                      <div className="flex items-center gap-sm mt-sm">
                        <Avatar url={creator.avatar_url} name={creator.full_name} size={28} />
                        <span className="font-body-md text-body-md text-on-surface">{creator.full_name}</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          • {formatDate(submission.submitted_at)}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-sm mt-md">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="visibility"
                        onClick={() => { setSelectedSubmission(submission); setShowDetailModal(true) }}
                      >
                        View
                      </Button>
                      {submission.status === 'submitted' && (
                        <>
                          <Button variant="primary" size="sm" icon="thumb_up" onClick={() => openReviewModal(submission, 'approve')}>
                            Approve
                          </Button>
                          <Button variant="ghost" size="sm" icon="restart_alt" onClick={() => openReviewModal(submission, 'revision')}>
                            Revision
                          </Button>
                          <Button variant="destructive" size="sm" icon="thumb_down" onClick={() => openReviewModal(submission, 'reject')}>
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Review Modal */}
      <Modal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title={
          reviewAction === 'approve' ? 'Approve Content'
            : reviewAction === 'revision' ? 'Request Revision'
              : 'Reject Content'
        }
        footer={(
          <>
            <Button variant="ghost" onClick={() => setShowReviewModal(false)}>Cancel</Button>
            <Button
              variant={reviewAction === 'approve' ? 'primary' : reviewAction === 'reject' ? 'destructive' : 'secondary'}
              onClick={handleReview}
              disabled={processing}
            >
              {processing
                ? 'Submitting…'
                : reviewAction === 'approve' ? 'Approve'
                  : reviewAction === 'revision' ? 'Request Revision'
                    : 'Reject'}
            </Button>
          </>
        )}
      >
        {selectedSubmission && (
          <div className="flex flex-col gap-md">
            <div className="flex items-center gap-md p-md bg-surface-container-low rounded border border-outline-variant">
              {selectedSubmission.media_urls?.[0] && (
                <img src={selectedSubmission.media_urls[0]} alt="" className="w-16 h-16 object-cover rounded" />
              )}
              <div className="min-w-0">
                <p className="font-label-lg text-label-lg text-on-surface truncate">{selectedSubmission.title}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {CONTENT_TYPES.find((t) => t.value === selectedSubmission.content_type)?.label}
                </p>
              </div>
            </div>

            {reviewAction === 'approve' && (
              <Input
                label="Payment Amount (optional)"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="R"
              />
            )}

            {reviewAction === 'revision' && (
              <>
                <Textarea
                  label="Feedback *"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="What changes are needed?"
                  rows={3}
                />
                <div>
                  <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                    Specific Changes
                  </label>
                  <div className="flex flex-col gap-sm">
                    {revisionChanges.map((change, i) => (
                      <div key={i} className="flex gap-sm items-start">
                        <Input
                          value={change}
                          onChange={(e) => updateRevisionChange(i, e.target.value)}
                          placeholder={`Change ${i + 1}`}
                        />
                        {revisionChanges.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRevisionChange(i)}
                            className="mt-xs text-on-surface-variant hover:text-error"
                            aria-label="Remove change"
                          >
                            <Icon name="close" size={20} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-sm">
                    <Button variant="ghost" size="sm" icon="add" onClick={addRevisionChange}>
                      Add change
                    </Button>
                  </div>
                </div>
              </>
            )}

            {reviewAction === 'reject' && (
              <Textarea
                label="Reason *"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Why is this being rejected?"
                rows={3}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Content Details"
        size="lg"
      >
        {selectedSubmission && (
          <div className="flex flex-col gap-md">
            {selectedSubmission.media_urls?.length > 0 && (
              <div className="grid grid-cols-2 gap-sm">
                {selectedSubmission.media_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt=""
                      className="w-full aspect-video object-cover rounded border border-outline-variant"
                    />
                  </a>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-md">
              <div>
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Title</p>
                <p className="font-body-md text-body-md text-on-surface mt-xs">{selectedSubmission.title}</p>
              </div>
              <div>
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Type</p>
                <p className="font-body-md text-body-md text-on-surface mt-xs">
                  {CONTENT_TYPES.find((t) => t.value === selectedSubmission.content_type)?.label}
                </p>
              </div>
              <div>
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Status</p>
                <div className="mt-xs">
                  <Chip tone={getStatusMeta(selectedSubmission.status).tone}>
                    {getStatusMeta(selectedSubmission.status).label}
                  </Chip>
                </div>
              </div>
              <div>
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Version</p>
                <p className="font-body-md text-body-md text-on-surface mt-xs font-data-mono">
                  {selectedSubmission.version || 1}
                </p>
              </div>
            </div>

            {selectedSubmission.caption && (
              <div>
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">Caption</p>
                <p className="bg-surface-container-low border border-outline-variant p-md rounded font-body-md text-body-md text-on-surface whitespace-pre-wrap">
                  {selectedSubmission.caption}
                </p>
              </div>
            )}

            {selectedSubmission.revision_history?.length > 0 && (
              <div className="border-t border-outline-variant pt-md">
                <p className="font-label-lg text-label-lg text-on-surface mb-sm">Revision History</p>
                <div className="flex flex-col gap-sm">
                  {selectedSubmission.revision_history.map((rev, i) => (
                    <div key={i} className="bg-error-container/40 border border-error-container p-md rounded">
                      <p className="font-label-md text-label-md text-on-error-container">
                        v{rev.version} • {formatDate(rev.requested_at)}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-error-container mt-xs">{rev.feedback}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ContentReview
