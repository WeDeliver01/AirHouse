import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import {
  PageHeader, Button, Card, Chip, Icon, EmptyState, Skeleton,
} from '../../components/stitch'

const STATUS_TONE = {
  active: 'success',
  open: 'primary',
  completed: 'success',
  paused: 'warning',
  draft: 'neutral',
  cancelled: 'danger',
}

const AssignmentDetail = () => {
  const { assignmentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assignment, setAssignment] = useState(null)

  useEffect(() => {
    if (assignmentId && user?.id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, user])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('campaign_assignments')
        .select(`
          *,
          campaign:campaigns(
            id, title, property_name, property_location, property_type, description,
            creator_budget, total_budget, start_date, end_date, status, deliverables,
            content_guidelines, target_audience, key_selling_points,
            developer:profiles!developer_id(full_name, company_name, avatar_url)
          ),
          creator:creator_profiles(
            id, instagram_handle, follower_count, location, campaigns_completed,
            reliability_score, profiles:profiles(full_name, avatar_url, bio)
          )
        `)
        .eq('id', assignmentId)
        .single()
      if (fetchError) throw fetchError
      setAssignment(data)
    } catch (e) {
      console.error(e)
      setError(e.message?.includes('row-level security')
        ? 'You don’t have access to this assignment.'
        : 'Failed to load assignment')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-md">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (error || !assignment) {
    return (
      <Card>
        <EmptyState
          icon="error"
          title="Assignment unavailable"
          description={error || 'Assignment not found'}
          action={<Button onClick={() => navigate('/developer/assignments')}>Back to Assignments</Button>}
        />
      </Card>
    )
  }

  const c = assignment.campaign || {}
  const creator = assignment.creator || {}
  const creatorProfile = creator.profiles || {}
  const deliverables = Array.isArray(c.deliverables) ? c.deliverables : []
  const heroImage = c.property_images?.[0] // optional

  return (
    <div className="flex flex-col gap-gutter">
      {/* Breadcrumb */}
      <Link
        to="/developer/assignments"
        className="inline-flex items-center gap-xs font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors"
      >
        <Icon name="arrow_back" size={16} />
        Back to Assignments
      </Link>

      <PageHeader
        eyebrow={c.status === 'completed' ? 'Completed' : 'Active Assignment'}
        title={c.title || c.property_name || 'Assignment'}
        description={c.property_location ? `${c.property_type ? `${c.property_type} • ` : ''}${c.property_location}` : undefined}
        actions={(
          <>
            <Link to={`/developer/campaigns/${c.id}`}>
              <Button variant="ghost" icon="visibility">View Campaign</Button>
            </Link>
            <Link to={`/developer/campaigns/${c.id}/content`}>
              <Button variant="primary" icon="movie">Review Content</Button>
            </Link>
          </>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* Main column */}
        <div className="lg:col-span-8 flex flex-col gap-gutter">
          {/* Hero / objective */}
          <Card padding="none" className="overflow-hidden ambient-shadow">
            {heroImage ? (
              <div className="h-[260px] w-full bg-surface-container-high relative">
                <img
                  src={heroImage}
                  alt={c.property_name || 'Property'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-md left-md bg-surface/90 backdrop-blur-sm px-sm py-xs rounded border border-outline-variant inline-flex items-center gap-xs">
                  <Icon name="location_on" size={16} className="text-primary" />
                  <span className="font-label-md text-label-md text-on-surface">
                    {c.property_location || 'Location TBC'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-[160px] w-full bg-surface-container-high flex items-center justify-center">
                <Icon name="apartment" size={48} className="text-on-surface-variant" />
              </div>
            )}
            <div className="p-md">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-sm">Campaign Objective</h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                {c.description || 'No description provided yet.'}
              </p>
              {c.key_selling_points && (
                <div className="mt-md p-sm rounded bg-surface-container-low border border-outline-variant">
                  <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">
                    Key selling points
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface">{c.key_selling_points}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Deliverables */}
          <Card>
            <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-md">
              <h3 className="font-headline-md text-headline-md text-on-surface">Required Deliverables</h3>
              {c.end_date && (
                <Chip tone="primary">
                  <span className="font-data-mono">Due {formatDate(c.end_date)}</span>
                </Chip>
              )}
            </div>
            {deliverables.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                {deliverables.map((d, i) => (
                  <div key={i} className="border border-outline-variant rounded p-sm flex gap-sm items-start bg-surface-bright">
                    <div className="bg-surface-container p-xs rounded text-primary inline-flex">
                      <Icon name={
                        d.type?.includes('video') ? 'videocam'
                          : d.type?.includes('reel') ? 'movie'
                          : d.type?.includes('photo') ? 'photo_camera'
                          : 'task_alt'
                      } size={20} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-label-lg text-label-lg text-on-surface">
                        {(d.quantity || 1)}× {d.label || d.type}
                      </h4>
                      {d.description && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                          {d.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-body-sm text-body-sm text-on-surface-variant">No deliverables defined.</p>
            )}
          </Card>

          {/* Content guidelines */}
          {c.content_guidelines && (
            <Card>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-sm">Content Guidelines</h3>
              <p className="font-body-md text-body-md text-on-surface-variant whitespace-pre-line">
                {c.content_guidelines}
              </p>
            </Card>
          )}
        </div>

        {/* Sidebar column */}
        <div className="lg:col-span-4 flex flex-col gap-gutter">
          {/* Commercial terms */}
          <Card>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Commercial Terms</h3>
            <div className="flex items-baseline justify-between border-b border-outline-variant pb-sm mb-sm">
              <span className="font-body-md text-body-md text-on-surface-variant">Agreed Budget</span>
              <span className="font-headline-lg text-headline-lg text-primary font-data-mono">
                {formatCurrency(assignment.agreed_budget || c.creator_budget || 0)}
              </span>
            </div>
            <ul className="flex flex-col gap-sm">
              <li className="flex items-center gap-sm font-body-sm text-body-sm text-on-surface-variant">
                <Icon name="check_circle" size={20} className="text-primary" />
                Paid {formatCurrency(assignment.amount_paid || 0)} so far
              </li>
              <li className="flex items-center gap-sm font-body-sm text-body-sm text-on-surface-variant">
                <Icon name="check_circle" size={20} className="text-primary" />
                {assignment.leads_generated || 0} leads delivered
              </li>
              <li className="flex items-center gap-sm font-body-sm text-body-sm text-on-surface-variant">
                <Icon name="check_circle" size={20} className="text-primary" />
                Status: <Chip tone={STATUS_TONE[c.status] || 'neutral'}>{c.status}</Chip>
              </li>
            </ul>
          </Card>

          {/* Creator profile */}
          <Card>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-sm">
              Creator
            </p>
            <div className="flex items-center gap-sm mb-md">
              {creatorProfile.avatar_url ? (
                <img
                  src={creatorProfile.avatar_url}
                  alt={creatorProfile.full_name || 'Creator'}
                  className="w-12 h-12 rounded object-cover border border-outline-variant"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-primary-container/30 text-primary inline-flex items-center justify-center font-label-lg">
                  {(creatorProfile.full_name || '?').charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <h4 className="font-label-lg text-label-lg text-on-surface truncate">
                  {creatorProfile.full_name || 'Creator'}
                </h4>
                <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  {creator.location || 'Location undisclosed'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-xs">
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant text-center">
                <p className="font-data-mono font-label-lg text-label-lg text-on-surface">
                  {((creator.follower_count || 0) / 1000).toFixed(1)}K
                </p>
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Reach</p>
              </div>
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant text-center">
                <p className="font-data-mono font-label-lg text-label-lg text-on-surface">
                  {creator.campaigns_completed || 0}
                </p>
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Campaigns</p>
              </div>
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant text-center">
                <p className="font-data-mono font-label-lg text-label-lg text-secondary">
                  {creator.reliability_score || 100}%
                </p>
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Score</p>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Timeline</h3>
            <div className="relative border-l border-outline-variant ml-sm pl-md flex flex-col gap-md">
              <TimelinePoint label="Assignment Created" date={assignment.assigned_at} />
              <TimelinePoint label="Campaign Start" date={c.start_date} muted={!c.start_date} />
              <TimelinePoint label="Final Delivery" date={c.end_date} muted={!c.end_date} />
              <TimelinePoint
                label="Completed"
                date={assignment.completed_at}
                muted={!assignment.is_completed}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

const TimelinePoint = ({ label, date, muted }) => (
  <div className={cn('relative', muted && 'opacity-60')}>
    <div className={cn(
      'absolute -left-[27px] top-[6px] w-3 h-3 rounded-full border',
      muted
        ? 'bg-surface-variant border-outline-variant'
        : 'bg-primary border-primary',
    )} />
    <h4 className="font-label-lg text-label-lg text-on-surface">{label}</h4>
    <p className="font-body-sm text-body-sm text-on-surface-variant font-data-mono">
      {date ? formatDate(date) : 'Pending'}
    </p>
  </div>
)

export default AssignmentDetail
