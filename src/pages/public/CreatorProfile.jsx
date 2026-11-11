import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { cn, formatDate, formatNumber } from '../../lib/utils'
import { computeBadges } from '../../lib/badges'
import { LoadingSpinner, ErrorState, Avatar } from '../../components/ui'
import {
  Card,
  Button,
  Chip,
  EmptyState,
  Icon,
} from '../../components/stitch'
import InviteToCampaignModal from '../../components/InviteToCampaignModal'

const StarRating = ({ rating, max = 5 }) => (
  <div className="flex gap-xs">
    {Array.from({ length: max }, (_, i) => (
      <Icon
        key={i}
        name="star"
        size={18}
        className={i < rating ? 'text-secondary-fixed-dim' : 'text-outline-variant'}
        style={i < rating ? { fontVariationSettings: "'FILL' 1" } : undefined}
      />
    ))}
  </div>
)

const SOCIAL_ICONS = {
  instagram: 'photo_camera',
  tiktok: 'movie',
  youtube: 'play_circle',
  twitter: 'chat',
  x: 'chat',
  facebook: 'group',
  linkedin: 'business_center',
  website: 'language',
}

const CreatorProfile = () => {
  const { creatorId } = useParams()
  const { isAuthenticated, isDeveloper } = useAuth()
  const [profile, setProfile] = useState(null)
  const [creatorProfile, setCreatorProfile] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [reviews, setReviews] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    const fetchCreatorData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Whitelisted profile fields — DO NOT add fields here.
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, bio, role, created_at, is_verified, location')
          .eq('id', creatorId)
          .eq('role', 'creator')
          .single()

        if (profileError) {
          if (profileError.code === 'PGRST116') {
            setProfile(null)
            setLoading(false)
            return
          }
          throw profileError
        }

        setProfile(profileData)

        const { data: creatorRow } = await supabase
          .from('creator_profiles')
          .select(
            'id, user_id, content_types, specialties, social_links, campaigns_completed, total_leads_generated, reliability_score, portfolio_urls',
          )
          .eq('user_id', creatorId)
          .single()

        if (creatorRow) setCreatorProfile(creatorRow)

        // assignments and submissions key on creator_profiles.id, not user id
        const profileScopedId = creatorRow?.id
        const [assignmentsRes, reviewsRes, submissionsRes] = await Promise.all([
          profileScopedId
            ? supabase
                .from('campaign_assignments')
                .select(
                  '*, campaign:campaigns(title, property_name, property_location, status, property_type)',
                )
                .eq('creator_id', profileScopedId)
            : Promise.resolve({ data: [] }),
          supabase
            .from('creator_reviews')
            .select('*, reviewer:profiles!reviewer_id(full_name, avatar_url, company_name)')
            .eq('creator_id', creatorId)
            .order('created_at', { ascending: false }),
          profileScopedId
            ? supabase
                .from('content_submissions')
                .select('id, status')
                .eq('creator_id', profileScopedId)
            : Promise.resolve({ data: [] }),
        ])

        if (assignmentsRes.data) setAssignments(assignmentsRes.data)
        if (reviewsRes.data) setReviews(reviewsRes.data)
        if (submissionsRes.data) setSubmissions(submissionsRes.data)
      } catch (err) {
        console.error('Error fetching creator profile:', err)
        setError(err.message || 'Failed to load creator profile')
      } finally {
        setLoading(false)
      }
    }

    if (creatorId) fetchCreatorData()
  }, [creatorId])

  const handleShare = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const completedCampaigns = assignments.filter((a) => a.is_completed).length
  const totalLeads = assignments.reduce((sum, a) => sum + (a.leads_generated || 0), 0)
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : null

  // Submissions read is best-effort under existing RLS — anonymous /
  // unrelated viewers see zero rows, so the Perfectionist badge only
  // surfaces publicly for viewers who can already see the submissions.
  const totalSubmissions = submissions.length
  const approvedSubmissions = submissions.filter((s) => s.status === 'approved').length
  const contentApprovalRate =
    totalSubmissions > 0 ? Math.round((approvedSubmissions / totalSubmissions) * 100) : 100

  // Stats use the publicly-readable canonical fields on creator_profiles.
  // Earnings are intentionally not read here, so earnings-based badges
  // (Top Earner) stay locked publicly.
  const badgeStats = {
    reliabilityScore: creatorProfile?.reliability_score ?? 100,
    campaignsCompleted: creatorProfile?.campaigns_completed ?? completedCampaigns,
    totalLeads: creatorProfile?.total_leads_generated ?? totalLeads,
    contentApprovalRate,
    totalSubmissions,
  }
  const earnedBadges = computeBadges(badgeStats).filter((b) => b.unlocked)

  const statusTone = (status) => {
    switch (status) {
      case 'completed': return 'success'
      case 'active': return 'primary'
      case 'draft': return 'neutral'
      default: return 'neutral'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner size="lg" text="Loading creator profile..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1280px] mx-auto px-md py-lg">
        <ErrorState
          title="Failed to load profile"
          message={error}
          onRetry={() => window.location.reload()}
        />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-[1280px] mx-auto px-md py-lg">
        <Card>
          <EmptyState
            icon="person_off"
            title="Creator not found"
            description="This creator profile doesn't exist or is no longer available."
            action={
              <Link to="/properties">
                <Button variant="primary">Browse Properties</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <main className="flex-1 w-full max-w-[1280px] mx-auto px-md py-lg flex flex-col gap-lg">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-sm">
        <Link
          to="/properties"
          className="inline-flex items-center gap-xs font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Icon name="arrow_back" size={18} />
          Back to Properties
        </Link>
        <div className="flex items-center gap-xs">
          {isDeveloper ? (
            <Button
              variant="primary"
              size="sm"
              icon="person_add"
              onClick={() => setInviteOpen(true)}
            >
              Invite to Campaign
            </Button>
          ) : !isAuthenticated ? (
            <Link to="/login">
              <Button variant="primary" size="sm" icon="person_add">
                Sign in to Invite
              </Button>
            </Link>
          ) : null}
          <Button variant="ghost" size="sm" icon="share" onClick={handleShare}>
            {copied ? 'Link Copied' : 'Share Profile'}
          </Button>
        </div>
      </div>

      {/* Hero */}
      <Card padding="lg" className="relative overflow-hidden">
        <div className="relative flex flex-col md:flex-row gap-lg items-start">
          <Avatar
            src={profile.avatar_url}
            name={profile.full_name}
            size="xl"
            className="w-32 h-32 text-3xl border-4 border-surface-container-lowest shadow-sm flex-shrink-0"
          />
          <div className="flex-1 flex flex-col gap-md min-w-0">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-sm mb-xs">
                  <h1 className="font-headline-xl text-headline-xl text-on-surface truncate">
                    {profile.full_name}
                  </h1>
                  {profile.is_verified && (
                    <Icon
                      name="verified"
                      size={28}
                      className="text-secondary flex-shrink-0"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                      title="Verified Creator"
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-sm font-body-sm text-body-sm text-on-surface-variant">
                  {profile.location && (
                    <span className="inline-flex items-center gap-xs">
                      <Icon name="location_on" size={16} />
                      {profile.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-xs">
                    <Icon name="event" size={16} />
                    Joined {formatDate(profile.created_at, { month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            {profile.bio && (
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl leading-relaxed">
                {profile.bio}
              </p>
            )}

            {creatorProfile?.specialties?.length > 0 && (
              <div className="flex flex-wrap gap-xs">
                {creatorProfile.specialties.map((s, i) => (
                  <Chip key={i} tone="primary">
                    {s}
                  </Chip>
                ))}
              </div>
            )}

            {creatorProfile?.social_links && Object.keys(creatorProfile.social_links).length > 0 && (
              <div className="flex flex-wrap items-center gap-sm pt-xs">
                {Object.entries(creatorProfile.social_links).map(
                  ([platform, url]) =>
                    url && (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-xs bg-surface border border-outline-variant px-sm py-xs rounded text-on-surface hover:border-outline transition-colors"
                      >
                        <Icon
                          name={SOCIAL_ICONS[platform.toLowerCase()] || 'link'}
                          size={18}
                          className="text-tertiary"
                        />
                        <span className="font-data-mono text-data-mono capitalize">{platform}</span>
                      </a>
                    ),
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Stats bento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
        <Card padding="md">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Campaigns Delivered
          </span>
          <div className="font-headline-xl text-headline-xl text-on-surface mt-xs">
            {completedCampaigns}
          </div>
        </Card>
        <Card padding="md">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Leads Generated
          </span>
          <div className="flex items-baseline gap-xs mt-xs">
            <span className="font-headline-xl text-headline-xl text-on-surface">
              {formatNumber(totalLeads)}
            </span>
            <Icon
              name="trending_up"
              size={18}
              className="text-secondary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            />
          </div>
        </Card>
        <Card padding="md">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Client Rating
          </span>
          <div className="flex items-center gap-xs mt-xs">
            <span className="font-headline-xl text-headline-xl text-on-surface">
              {avgRating || '—'}
            </span>
            {avgRating && (
              <Icon
                name="star"
                size={20}
                className="text-secondary-fixed-dim"
                style={{ fontVariationSettings: "'FILL' 1" }}
              />
            )}
          </div>
        </Card>
        <Card padding="md">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Reviews
          </span>
          <div className="font-headline-xl text-headline-xl text-on-surface mt-xs">
            {reviews.length}
          </div>
        </Card>
      </div>

      {/* Trust & Achievements */}
      {earnedBadges.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-sm mb-md pb-sm border-b border-outline-variant">
            <div className="flex items-center gap-sm">
              <Icon
                name="workspace_premium"
                size={24}
                className="text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              />
              <h2 className="font-headline-lg text-headline-lg text-on-surface">
                Trust & Achievements
              </h2>
            </div>
            <Chip tone="success" icon="verified">
              {earnedBadges.length} earned
            </Chip>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-md">
            {earnedBadges.map((b) => (
              <div
                key={b.id}
                className={cn(
                  'rounded p-md flex flex-col items-center text-center border',
                  b.accent,
                )}
                title={b.description}
              >
                <div className="w-14 h-14 rounded-full bg-surface-container-lowest/70 flex items-center justify-center mb-sm">
                  <Icon
                    name={b.icon}
                    size={28}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  />
                </div>
                <h4 className="font-headline-md text-headline-md leading-tight">
                  {b.title}
                </h4>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* About */}
      {profile.bio && (
        <Card>
          <h2 className="font-headline-lg text-headline-lg text-on-surface pb-sm border-b border-outline-variant mb-md">
            About
          </h2>
          <p className="font-body-md text-body-md text-on-surface whitespace-pre-line leading-relaxed">
            {profile.bio}
          </p>
        </Card>
      )}

      {/* Past campaigns */}
      <section className="flex flex-col gap-md">
        <h2 className="font-headline-lg text-headline-lg text-on-surface pb-sm border-b border-outline-variant">
          Campaign Portfolio
        </h2>
        {assignments.length === 0 ? (
          <Card>
            <EmptyState
              icon="work"
              title="No campaigns yet"
              description="This creator hasn't completed any campaigns yet."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {assignments.map((assignment) => (
              <Card key={assignment.id} padding="md" className="flex flex-col">
                <div className="flex items-start justify-between gap-sm mb-sm">
                  <h3 className="font-headline-md text-headline-md text-on-surface text-lg leading-tight line-clamp-2">
                    {assignment.campaign?.title || 'Untitled Campaign'}
                  </h3>
                  <Chip tone={statusTone(assignment.campaign?.status)}>
                    {assignment.campaign?.status || 'Unknown'}
                  </Chip>
                </div>
                {assignment.campaign?.property_name && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {assignment.campaign.property_name}
                  </p>
                )}
                {assignment.campaign?.property_location && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs mt-xs">
                    <Icon name="location_on" size={16} />
                    {assignment.campaign.property_location}
                  </p>
                )}
                <div className="flex items-center justify-between mt-md pt-sm border-t border-outline-variant">
                  {assignment.campaign?.property_type ? (
                    <Chip tone="neutral">{assignment.campaign.property_type}</Chip>
                  ) : (
                    <span />
                  )}
                  {assignment.leads_generated > 0 && (
                    <span className="inline-flex items-center gap-xs font-data-mono text-data-mono text-secondary">
                      <Icon name="trending_up" size={16} />
                      {assignment.leads_generated} leads
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="flex flex-col gap-md">
        <h2 className="font-headline-lg text-headline-lg text-on-surface pb-sm border-b border-outline-variant">
          Developer Testimonials
        </h2>
        {reviews.length === 0 ? (
          <Card>
            <EmptyState
              icon="star"
              title="No reviews yet"
              description="This creator hasn't received any reviews yet."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {reviews.map((review) => (
              <Card key={review.id} className="flex flex-col gap-sm">
                <StarRating rating={review.rating || 0} />
                {review.comment && (
                  <blockquote className="font-body-md text-body-md text-on-surface italic flex-1">
                    “{review.comment}”
                  </blockquote>
                )}
                <div
                  className={cn(
                    'mt-sm pt-sm border-t border-outline-variant flex items-center gap-sm',
                  )}
                >
                  <Avatar
                    src={review.reviewer?.avatar_url}
                    name={review.reviewer?.full_name || 'Anonymous'}
                    size="default"
                  />
                  <div className="min-w-0">
                    <div className="font-label-lg text-label-lg text-on-surface truncate">
                      {review.reviewer?.full_name || 'Anonymous'}
                    </div>
                    {review.reviewer?.company_name && (
                      <div className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {review.reviewer.company_name}
                      </div>
                    )}
                    <div className="font-body-sm text-body-sm text-on-surface-variant">
                      {formatDate(review.created_at)}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <InviteToCampaignModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        creatorUserId={creatorId}
        creatorName={profile.full_name}
        creatorAvatarUrl={profile.avatar_url}
      />
    </main>
  )
}

export default CreatorProfile
