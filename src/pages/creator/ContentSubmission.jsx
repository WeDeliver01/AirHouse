import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  PageHeader,
  Card,
  Button,
  Chip,
  EmptyState,
  Modal,
  Input,
  Textarea,
  Select,
  Icon,
} from '../../components/stitch'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { toast } from 'react-hot-toast'
import { formatDate, formatCurrency, cn } from '../../lib/utils'
import { getOrCreateTrackingLink } from '../../lib/tracking'
import { CONTENT_TYPES, CONTENT_STATUSES } from '../../lib/content'
import CreatorTrackingLinks from '../../components/CreatorTrackingLinks'

const ContentSubmission = () => {
  const { assignmentId } = useParams()
  const navigate = useNavigate()

  const [assignment, setAssignment] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [campaignAssets, setCampaignAssets] = useState([])
  const [trackingLinks, setTrackingLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('content')

  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [editingSubmission, setEditingSubmission] = useState(null)

  const [newSubmission, setNewSubmission] = useState({
    title: '',
    content_type: '',
    caption: '',
    media_urls: [],
    scheduled_for: '',
    notes: '',
  })

  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [mediaPreview, setMediaPreview] = useState([])
  const [dragActive, setDragActive] = useState(false)

  const fetchData = useCallback(async () => {
    if (!assignmentId) return
    setError(null)
    try {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('campaign_assignments')
        .select(`
          *,
          campaign:campaigns (
            id, title, property_name, property_location,
            deliverables, status, creator_budget, content_guidelines,
            property_images, brochure_urls, key_selling_points
          )
        `)
        .eq('id', assignmentId)
        .single()
      if (assignmentError) throw assignmentError
      setAssignment(assignmentData)

      const { data: submissionsData } = await supabase
        .from('content_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .order('created_at', { ascending: false })
      setSubmissions(submissionsData || [])

      if (assignmentData?.campaign?.id) {
        const { data: assets } = await supabase
          .from('campaign_assets')
          .select('*')
          .eq('campaign_id', assignmentData.campaign.id)
          .order('created_at', { ascending: false })
        setCampaignAssets(assets || [])
      }

      try {
        const link = await getOrCreateTrackingLink(assignmentId)
        setTrackingLinks(link ? [link] : [])
      } catch (e) {
        console.error('Error loading tracking link:', e)
      }
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load assignment data')
    } finally {
      setLoading(false)
    }
  }, [assignmentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return
    setUploadingMedia(true)
    const uploadedUrls = []
    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${assignmentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('content-submissions')
          .upload(fileName, file)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage
          .from('content-submissions')
          .getPublicUrl(fileName)
        uploadedUrls.push(publicUrl)
      }
      setNewSubmission((prev) => ({
        ...prev,
        media_urls: [...prev.media_urls, ...uploadedUrls],
      }))
      setMediaPreview((prev) => [...prev, ...uploadedUrls])
      toast.success('Media uploaded')
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Failed to upload media')
    } finally {
      setUploadingMedia(false)
    }
  }

  const handleMediaUpload = (e) => uploadFiles(Array.from(e.target.files || []))

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    uploadFiles(Array.from(e.dataTransfer.files || []))
  }

  const removeMedia = (index) => {
    setNewSubmission((prev) => ({
      ...prev,
      media_urls: prev.media_urls.filter((_, i) => i !== index),
    }))
    setMediaPreview((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!newSubmission.title || !newSubmission.content_type) {
      return toast.error('Please fill in required fields')
    }
    setSubmitting(true)
    try {
      const submissionData = {
        assignment_id: assignmentId,
        campaign_id: assignment.campaign.id,
        creator_id: assignment.creator_id,
        title: newSubmission.title,
        content_type: newSubmission.content_type,
        caption: newSubmission.caption,
        media_urls: newSubmission.media_urls,
        creator_notes: newSubmission.notes,
        scheduled_for: newSubmission.scheduled_for || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        version: 1,
      }
      if (editingSubmission) {
        const { error: upErr } = await supabase
          .from('content_submissions')
          .update({ ...submissionData, version: (editingSubmission.version || 1) + 1 })
          .eq('id', editingSubmission.id)
        if (upErr) throw upErr
        toast.success('Content resubmitted')
      } else {
        const { error: insErr } = await supabase
          .from('content_submissions')
          .insert(submissionData)
        if (insErr) throw insErr
        toast.success('Content submitted for review')
      }
      setShowSubmitModal(false)
      resetForm()
      fetchData()
    } catch (err) {
      console.error('Submit error:', err)
      toast.error('Failed to submit content')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setNewSubmission({
      title: '',
      content_type: '',
      caption: '',
      media_urls: [],
      scheduled_for: '',
      notes: '',
    })
    setMediaPreview([])
    setEditingSubmission(null)
  }

  const openEditModal = (submission) => {
    setEditingSubmission(submission)
    setNewSubmission({
      title: submission.title || '',
      content_type: submission.content_type || '',
      caption: submission.caption || '',
      media_urls: submission.media_urls || [],
      scheduled_for: submission.scheduled_for?.split('T')[0] || '',
      notes: submission.creator_notes || '',
    })
    setMediaPreview(submission.media_urls || [])
    setShowSubmitModal(true)
  }

  const markAsLive = async (submission) => {
    const liveUrl = prompt('Enter the live URL where this content is posted:')
    if (!liveUrl) return
    try {
      await supabase
        .from('content_submissions')
        .update({
          status: 'live',
          live_url: liveUrl,
          posted_at: new Date().toISOString(),
        })
        .eq('id', submission.id)
      toast.success('Content marked as live')
      fetchData()
    } catch {
      toast.error('Failed to update')
    }
  }

  const STATUS_TONE_MAP = {
    gray: 'neutral',
    blue: 'primary',
    yellow: 'warning',
    green: 'success',
    red: 'danger',
    purple: 'primary',
    cyan: 'primary',
  }
  const getStatusChip = (status) => {
    const config = CONTENT_STATUSES[status] || { label: status, color: 'gray' }
    return { tone: STATUS_TONE_MAP[config.color] || 'neutral', label: config.label }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  if (!assignment) {
    return (
      <Card>
        <EmptyState
          icon="article"
          title="Assignment not found"
          description="This assignment doesn't exist or you don't have access."
          action={
            <Button variant="primary" onClick={() => navigate('/creator/active')}>
              Back to Campaigns
            </Button>
          }
        />
      </Card>
    )
  }

  const { campaign } = assignment
  const deliverables = campaign?.deliverables || []
  const totalDeliverables = deliverables.reduce((sum, d) => sum + (d.quantity || 1), 0)
  const submittedCount = submissions.filter((s) => s.status !== 'draft').length
  const approvedCount = submissions.filter((s) => ['approved', 'live'].includes(s.status)).length

  const tabs = [
    { id: 'content', label: 'Content', count: submissions.length, icon: 'article' },
    { id: 'assets', label: 'Assets', count: campaignAssets.length, icon: 'image' },
    { id: 'links', label: 'Tracking Links', count: trackingLinks.length, icon: 'link' },
    { id: 'guidelines', label: 'Guidelines', icon: 'rule' },
  ]

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-lg">
      <PageHeader
        eyebrow={`${campaign.property_name || 'Campaign'} • ${campaign.property_location || ''}`}
        title={campaign.title}
        description="Submit, edit, and track content for this active campaign."
        actions={
          <>
            <Button variant="ghost" icon="arrow_back" onClick={() => navigate('/creator/active')}>
              Active Campaigns
            </Button>
            <Button variant="primary" icon="add" onClick={() => setShowSubmitModal(true)}>
              Submit Content
            </Button>
          </>
        }
      />

      {/* Progress KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
        <Card padding="md">
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
            Submitted
          </div>
          <div className="font-headline-lg text-headline-lg text-on-surface">
            {submittedCount}
            <span className="font-body-md text-body-md text-on-surface-variant">
              {' '}
              / {totalDeliverables || '—'}
            </span>
          </div>
          <div className="mt-sm h-1.5 bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{
                width: `${
                  totalDeliverables ? Math.min(100, (submittedCount / totalDeliverables) * 100) : 0
                }%`,
              }}
            />
          </div>
        </Card>
        <Card padding="md">
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
            Approved
          </div>
          <div className="font-headline-lg text-headline-lg text-secondary">{approvedCount}</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
            Ready for posting
          </div>
        </Card>
        <Card padding="md">
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
            Budget
          </div>
          <div className="font-headline-lg text-headline-lg text-on-surface">
            {formatCurrency(campaign.creator_budget || 0)}
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
            Released on approval
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-outline-variant">
        <div className="flex gap-md overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'pb-sm pt-xs font-label-lg text-label-lg border-b-2 transition-colors inline-flex items-center gap-xs whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon name={tab.icon} size={18} />
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'ml-xs px-xs rounded font-label-md text-label-md',
                    activeTab === tab.id
                      ? 'bg-primary-container/20 text-primary'
                      : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content tab */}
      {activeTab === 'content' && (
        <div className="flex flex-col gap-md">
          {submissions.length === 0 ? (
            <Card>
              <EmptyState
                icon="article"
                title="No content submitted yet"
                description="Start creating content for this campaign and submit it for review."
                action={
                  <Button variant="primary" icon="add" onClick={() => setShowSubmitModal(true)}>
                    Submit Your First Content
                  </Button>
                }
              />
            </Card>
          ) : (
            submissions.map((submission) => {
              const status = getStatusChip(submission.status)
              return (
                <Card key={submission.id}>
                  <div className="flex items-start gap-md">
                    {/* Thumbnail */}
                    <div className="w-24 h-24 bg-surface-container rounded overflow-hidden flex-shrink-0 border border-outline-variant">
                      {submission.media_urls?.[0] ? (
                        <img
                          src={submission.media_urls[0]}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                          <Icon name="article" size={32} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-sm">
                        <div className="min-w-0">
                          <h3 className="font-headline-md text-headline-md text-on-surface truncate">
                            {submission.title || 'Untitled'}
                          </h3>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            {CONTENT_TYPES.find((t) => t.value === submission.content_type)?.label ||
                              submission.content_type}
                            {submission.scheduled_for && (
                              <span> • Scheduled: {formatDate(submission.scheduled_for)}</span>
                            )}
                          </p>
                        </div>
                        <Chip tone={status.tone}>{status.label}</Chip>
                      </div>

                      {submission.caption && (
                        <p className="font-body-sm text-body-sm text-on-surface mt-sm line-clamp-2">
                          {submission.caption}
                        </p>
                      )}

                      {submission.status === 'revision_requested' && submission.revision_feedback && (
                        <div className="mt-sm p-sm bg-error-container/40 border border-error-container rounded">
                          <p className="font-label-md text-label-md text-on-error-container">
                            Revision Requested
                          </p>
                          <p className="font-body-sm text-body-sm text-on-error-container mt-xs">
                            {submission.revision_feedback}
                          </p>
                          {submission.revision_changes?.length > 0 && (
                            <ul className="mt-xs flex flex-col gap-xs">
                              {submission.revision_changes.map((change, i) => (
                                <li
                                  key={i}
                                  className="font-body-sm text-body-sm text-on-error-container flex items-center gap-xs"
                                >
                                  <span className="w-1.5 h-1.5 bg-on-error-container rounded-full" />
                                  {change}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-xs mt-md">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="visibility"
                          onClick={() => {
                            setSelectedSubmission(submission)
                            setShowDetailModal(true)
                          }}
                        >
                          View
                        </Button>
                        {['draft', 'revision_requested'].includes(submission.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="edit"
                            onClick={() => openEditModal(submission)}
                          >
                            Edit & Resubmit
                          </Button>
                        )}
                        {submission.status === 'approved' && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon="open_in_new"
                            onClick={() => markAsLive(submission)}
                          >
                            Mark as Live
                          </Button>
                        )}
                        {submission.live_url && (
                          <a href={submission.live_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" icon="open_in_new">
                              View Live
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* Assets tab */}
      {activeTab === 'assets' && (
        <Card>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-xs">Campaign Assets</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-md">
            Provided by the developer for use in your content.
          </p>

          {campaignAssets.length === 0 && !campaign.property_images?.length ? (
            <EmptyState
              icon="image"
              title="No assets provided yet"
              description="The developer hasn't uploaded reference media for this campaign."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
              {campaign.property_images?.map((url, index) => (
                <a
                  key={`img-${index}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square bg-surface-container rounded overflow-hidden hover:opacity-90 transition-opacity border border-outline-variant"
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
              {campaignAssets.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square bg-surface-container rounded overflow-hidden hover:opacity-90 transition-opacity border border-outline-variant flex items-center justify-center"
                >
                  {asset.mime_type?.startsWith('image/') ? (
                    <img src={asset.file_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-sm">
                      <Icon name="article" size={24} className="text-on-surface-variant" />
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate mt-xs">
                        {asset.file_name}
                      </p>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}

          {campaign.brochure_urls?.length > 0 && (
            <div className="mt-md pt-md border-t border-outline-variant">
              <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-on-surface mb-sm">
                Brochures & Documents
              </h4>
              <div className="flex flex-col gap-sm">
                {campaign.brochure_urls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-sm p-sm bg-surface-container-low border border-outline-variant rounded hover:bg-surface-variant transition-colors"
                  >
                    <Icon name="download" size={20} className="text-on-surface-variant" />
                    <span className="font-body-sm text-body-sm text-on-surface truncate">
                      {url.split('/').pop()}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'links' && <CreatorTrackingLinks assignmentId={assignmentId} />}

      {activeTab === 'guidelines' && (
        <Card>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-md">
            Content Guidelines
          </h3>
          {campaign.content_guidelines ? (
            <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap">
              {campaign.content_guidelines}
            </p>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No specific guidelines provided.
            </p>
          )}

          {campaign.key_selling_points && (
            <div className="mt-md pt-md border-t border-outline-variant">
              <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-on-surface mb-sm">
                Key Selling Points
              </h4>
              <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap">
                {campaign.key_selling_points}
              </p>
            </div>
          )}

          {deliverables.length > 0 && (
            <div className="mt-md pt-md border-t border-outline-variant">
              <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-on-surface mb-sm">
                Required Deliverables
              </h4>
              <div className="flex flex-col gap-sm">
                {deliverables.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-sm p-sm bg-surface-container-low border border-outline-variant rounded"
                  >
                    <div className="min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface truncate">
                        {d.label}
                      </p>
                      {d.description && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                          {d.description}
                        </p>
                      )}
                    </div>
                    <Chip tone="neutral">×{d.quantity || 1}</Chip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Submit modal */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => {
          setShowSubmitModal(false)
          resetForm()
        }}
        title={editingSubmission ? 'Edit & Resubmit Content' : 'Submit Content for Review'}
        description="Add your post details, attach media, and send to the developer for approval."
        size="lg"
      >
        <div className="p-md flex flex-col gap-md max-h-[70vh] overflow-y-auto">
          <Input
            label="Title *"
            value={newSubmission.title}
            onChange={(e) => setNewSubmission({ ...newSubmission, title: e.target.value })}
            placeholder="e.g., Instagram Reel - Property Tour"
          />
          <Select
            label="Content Type *"
            options={CONTENT_TYPES}
            placeholder="Choose a content type"
            value={newSubmission.content_type}
            onChange={(e) => setNewSubmission({ ...newSubmission, content_type: e.target.value })}
          />
          <Textarea
            label="Caption / Description"
            value={newSubmission.caption}
            onChange={(e) => setNewSubmission({ ...newSubmission, caption: e.target.value })}
            placeholder="The caption you'll use when posting…"
            rows={4}
          />

          {/* Media dropzone */}
          <div>
            <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
              Media Files
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                'border-2 border-dashed rounded p-md text-center transition-colors',
                dragActive
                  ? 'border-primary bg-primary-container/10'
                  : 'border-outline-variant bg-surface-container-low',
              )}
            >
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleMediaUpload}
                className="hidden"
                id="media-upload"
                disabled={uploadingMedia}
              />
              <label htmlFor="media-upload" className="cursor-pointer block">
                {uploadingMedia ? (
                  <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                ) : (
                  <>
                    <div className="w-12 h-12 mx-auto rounded bg-primary-container/20 text-primary inline-flex items-center justify-center mb-sm">
                      <Icon name="cloud_upload" size={28} />
                    </div>
                    <p className="font-label-lg text-label-lg text-on-surface">
                      Drop files or <span className="text-primary">browse</span>
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                      Images and videos up to 100MB each
                    </p>
                  </>
                )}
              </label>
            </div>

            {mediaPreview.length > 0 && (
              <div className="flex gap-sm mt-sm flex-wrap">
                {mediaPreview.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt=""
                      className="w-20 h-20 object-cover rounded border border-outline-variant"
                    />
                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      className="absolute -top-xs -right-xs w-5 h-5 bg-error text-on-error rounded-full opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center"
                      aria-label="Remove"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Input
            label="Scheduled Post Date (Optional)"
            type="date"
            value={newSubmission.scheduled_for}
            onChange={(e) => setNewSubmission({ ...newSubmission, scheduled_for: e.target.value })}
          />

          <Textarea
            label="Notes for Developer"
            value={newSubmission.notes}
            onChange={(e) => setNewSubmission({ ...newSubmission, notes: e.target.value })}
            placeholder="Any additional notes or questions…"
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-sm p-md border-t border-outline-variant">
          <Button
            variant="ghost"
            onClick={() => {
              setShowSubmitModal(false)
              resetForm()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="send"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : editingSubmission ? 'Resubmit' : 'Submit for Review'}
          </Button>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Content Details"
        size="lg"
      >
        {selectedSubmission && (
          <div className="p-md flex flex-col gap-md max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                {selectedSubmission.title}
              </h3>
              <Chip tone={getStatusChip(selectedSubmission.status).tone}>
                {getStatusChip(selectedSubmission.status).label}
              </Chip>
            </div>
            {selectedSubmission.media_urls?.length > 0 && (
              <div className="grid grid-cols-2 gap-sm">
                {selectedSubmission.media_urls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-full aspect-square object-cover rounded border border-outline-variant"
                  />
                ))}
              </div>
            )}
            {selectedSubmission.caption && (
              <div>
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                  Caption
                </p>
                <p className="font-body-md text-body-md text-on-surface mt-xs whitespace-pre-wrap">
                  {selectedSubmission.caption}
                </p>
              </div>
            )}
            {selectedSubmission.revision_history?.length > 0 && (
              <div className="border-t border-outline-variant pt-md">
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-sm">
                  Revision History
                </p>
                <div className="flex flex-col gap-sm">
                  {selectedSubmission.revision_history.map((rev, i) => (
                    <div
                      key={i}
                      className="font-body-sm text-body-sm bg-surface-container-low border border-outline-variant p-sm rounded"
                    >
                      <p className="text-on-surface-variant">
                        Version {rev.version} — {formatDate(rev.requested_at)}
                      </p>
                      <p className="text-on-surface mt-xs">{rev.feedback}</p>
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

export default ContentSubmission
