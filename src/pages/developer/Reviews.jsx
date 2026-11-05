import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader, Button, Card, Chip, Modal, Textarea, Icon,
  EmptyState, Skeleton,
} from '../../components/stitch'
import { formatRelativeTime, cn } from '../../lib/utils'

const Avatar = ({ url, name, size = 40 }) => {
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

const StarRow = ({ value, max = 5, size = 16 }) => (
  <div className="inline-flex items-center gap-xs">
    {[...Array(max)].map((_, i) => (
      <Icon
        key={i}
        name={i < value ? 'star' : 'star_border'}
        size={size}
        className={i < value ? 'text-tertiary' : 'text-on-surface-variant'}
      />
    ))}
  </div>
)

const RatingInput = ({ value, onChange, label }) => (
  <div className="flex items-center justify-between gap-md">
    <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
      {label}
    </span>
    <div className="flex gap-xs">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="hover:scale-110 transition-transform"
          aria-label={`Rate ${n} stars`}
        >
          <Icon
            name={n <= value ? 'star' : 'star_border'}
            size={28}
            className={n <= value ? 'text-tertiary' : 'text-on-surface-variant'}
          />
        </button>
      ))}
    </div>
  </div>
)

const ReviewCard = ({ review, onEdit, onDelete, isOwner }) => (
  <Card className="flex flex-col gap-md">
    <div className="flex items-start justify-between gap-md">
      <div className="flex items-center gap-sm min-w-0">
        <Avatar
          url={review.creator_profiles?.profiles?.avatar_url}
          name={review.creator_profiles?.profiles?.full_name}
          size={40}
        />
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface truncate">
            {review.creator_profiles?.profiles?.full_name}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
            {review.campaigns?.title || review.campaigns?.property_name}
          </p>
        </div>
      </div>
      <div className="inline-flex items-center gap-sm shrink-0">
        <StarRow value={review.rating} />
        <span className="font-data-mono font-label-md text-label-md text-on-surface">
          {review.rating}/5
        </span>
      </div>
    </div>

    {review.review_text && (
      <p className="font-body-md text-body-md text-on-surface">{review.review_text}</p>
    )}

    <div className="grid grid-cols-3 gap-sm">
      {[
        { label: 'Communication', value: review.communication_rating },
        { label: 'Quality', value: review.quality_rating },
        { label: 'Timeliness', value: review.timeliness_rating },
      ].map((m) => (
        <div
          key={m.label}
          className="bg-surface-container-low border border-outline-variant rounded p-sm text-center"
        >
          <div className="flex justify-center mb-xs">
            <StarRow value={m.value || 0} size={12} />
          </div>
          <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            {m.label}
          </p>
        </div>
      ))}
    </div>

    <div className="flex items-center justify-between pt-sm border-t border-outline-variant">
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        {formatRelativeTime(review.created_at)}
      </span>
      {isOwner && (
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={() => onEdit(review)}
            className="p-xs text-on-surface-variant hover:text-primary"
            aria-label="Edit review"
          >
            <Icon name="edit" size={16} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(review)}
            className="p-xs text-on-surface-variant hover:text-error"
            aria-label="Delete review"
          >
            <Icon name="delete" size={16} />
          </button>
        </div>
      )}
    </div>
  </Card>
)

const DeveloperReviews = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviews, setReviews] = useState([])
  const [pendingReviews, setPendingReviews] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingReview, setEditingReview] = useState(null)
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [formData, setFormData] = useState({
    rating: 0,
    communicationRating: 0,
    qualityRating: 0,
    timelinessRating: 0,
    reviewText: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user?.id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: reviewsData } = await supabase
        .from('creator_reviews')
        .select(`
          *,
          campaigns(title, property_name),
          creator_profiles(id, user_id, profiles:user_id(full_name, avatar_url))
        `)
        .eq('developer_id', user.id)
        .order('created_at', { ascending: false })
      setReviews(reviewsData || [])

      const { data: assignments } = await supabase
        .from('campaign_assignments')
        .select(`
          id, status, campaign_id,
          campaigns!inner(id, title, property_name, developer_id),
          creator_profiles!inner(id, user_id, profiles:user_id(full_name, avatar_url))
        `)
        .eq('campaigns.developer_id', user.id)
        .eq('status', 'completed')

      const reviewedCreators = new Set(reviewsData?.map((r) => `${r.campaign_id}-${r.creator_id}`))
      const pending = assignments?.filter(
        (a) => !reviewedCreators.has(`${a.campaign_id}-${a.creator_profiles.id}`),
      ) || []
      setPendingReviews(pending)
    } catch (e) {
      console.error(e)
      setError('Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }

  const openReviewModal = (assignment) => {
    setSelectedAssignment(assignment)
    setFormData({
      rating: 0,
      communicationRating: 0,
      qualityRating: 0,
      timelinessRating: 0,
      reviewText: '',
    })
    setEditingReview(null)
    setShowModal(true)
  }

  const openEditModal = (review) => {
    setEditingReview(review)
    setFormData({
      rating: review.rating,
      communicationRating: review.communication_rating || 0,
      qualityRating: review.quality_rating || 0,
      timelinessRating: review.timeliness_rating || 0,
      reviewText: review.review_text || '',
    })
    setShowModal(true)
  }

  const submitReview = async () => {
    if (formData.rating === 0) return
    setSubmitting(true)
    try {
      const payload = {
        rating: formData.rating,
        communication_rating: formData.communicationRating,
        quality_rating: formData.qualityRating,
        timeliness_rating: formData.timelinessRating,
        review_text: formData.reviewText,
        updated_at: new Date().toISOString(),
      }

      if (editingReview) {
        await supabase.from('creator_reviews').update(payload).eq('id', editingReview.id)
      } else {
        await supabase.from('creator_reviews').insert({
          ...payload,
          campaign_id: selectedAssignment.campaign_id,
          creator_id: selectedAssignment.creator_profiles.id,
          developer_id: user.id,
        })
      }

      setShowModal(false)
      fetchData()
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  const deleteReview = async (review) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this review?')) return
    try {
      await supabase.from('creator_reviews').delete().eq('id', review.id)
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-gutter">
        <Skeleton className="h-12 w-64" />
        <div className="grid md:grid-cols-2 gap-gutter">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon="error"
          title="Couldn't load reviews"
          description={error}
          action={<Button onClick={fetchData}>Retry</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Feedback"
        title="Creator Reviews"
        description="Rate creators after campaign completion."
      />

      {pendingReviews.length > 0 && (
        <Card className={cn('flex flex-col gap-md ambient-shadow border-primary')}>
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface inline-flex items-center gap-sm">
              <Icon name="rate_review" size={20} className="text-primary" />
              Pending Reviews
            </h3>
            <Chip tone="primary">
              <span className="font-data-mono">{pendingReviews.length}</span>
            </Chip>
          </div>
          <div className="flex flex-col gap-sm">
            {pendingReviews.slice(0, 3).map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-sm bg-surface-container-low border border-outline-variant p-sm rounded"
              >
                <div className="flex items-center gap-sm min-w-0">
                  <Avatar
                    url={assignment.creator_profiles?.profiles?.avatar_url}
                    name={assignment.creator_profiles?.profiles?.full_name}
                    size={32}
                  />
                  <div className="min-w-0">
                    <p className="font-label-md text-label-md text-on-surface truncate">
                      {assignment.creator_profiles?.profiles?.full_name}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      {assignment.campaigns?.title}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="primary" onClick={() => openReviewModal(assignment)}>
                  Write Review
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {reviews.length === 0 ? (
        <Card>
          <EmptyState
            icon="star"
            title="No reviews yet"
            description="Complete a campaign to leave a review for your creators."
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-gutter">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isOwner
              onEdit={openEditModal}
              onDelete={deleteReview}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingReview ? 'Edit Review' : 'Write Review'}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={submitReview}
              disabled={submitting || formData.rating === 0}
            >
              {submitting ? 'Submitting…' : 'Submit Review'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-md">
          {selectedAssignment && !editingReview && (
            <div className="flex items-center gap-sm p-sm bg-surface-container-low border border-outline-variant rounded">
              <Avatar
                url={selectedAssignment.creator_profiles?.profiles?.avatar_url}
                name={selectedAssignment.creator_profiles?.profiles?.full_name}
                size={40}
              />
              <div className="min-w-0">
                <p className="font-label-lg text-label-lg text-on-surface truncate">
                  {selectedAssignment.creator_profiles?.profiles?.full_name}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  {selectedAssignment.campaigns?.title}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-sm divide-y divide-outline-variant">
            {[
              { key: 'rating',                label: 'Overall Rating' },
              { key: 'communicationRating',   label: 'Communication' },
              { key: 'qualityRating',         label: 'Content Quality' },
              { key: 'timelinessRating',      label: 'Timeliness' },
            ].map((field, i) => (
              <div key={field.key} className={cn(i > 0 && 'pt-sm')}>
                <RatingInput
                  label={field.label}
                  value={formData[field.key]}
                  onChange={(v) => setFormData((f) => ({ ...f, [field.key]: v }))}
                />
              </div>
            ))}
          </div>

          <Textarea
            label="Review (optional)"
            placeholder="Share your experience working with this creator…"
            value={formData.reviewText}
            onChange={(e) => setFormData((f) => ({ ...f, reviewText: e.target.value }))}
            rows={3}
          />
        </div>
      </Modal>
    </div>
  )
}

export default DeveloperReviews
