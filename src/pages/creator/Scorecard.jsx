import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader,
  Card,
  Button,
  MetricCard,
  Chip,
  Icon,
} from '../../components/stitch'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { formatCurrency, cn } from '../../lib/utils'
import {
  fetchAvgResponseHours,
  communicationScoreFromHours,
  fetchPunctualityRate,
} from '../../lib/reliability'

const TIER_DEFS = [
  { name: 'Platinum', min: 95, color: 'text-on-tertiary-container', bg: 'bg-tertiary-fixed', icon: 'workspace_premium' },
  { name: 'Gold',     min: 85, color: 'text-on-secondary-container', bg: 'bg-secondary-container', icon: 'workspace_premium' },
  { name: 'Silver',   min: 70, color: 'text-on-surface',             bg: 'bg-surface-container-high', icon: 'shield' },
  { name: 'Bronze',   min: 0,  color: 'text-on-surface-variant',     bg: 'bg-surface-variant', icon: 'shield' },
]
const tierFor = (score) => TIER_DEFS.find((t) => score >= t.min) || TIER_DEFS[TIER_DEFS.length - 1]

const ScoreRing = ({ value, max = 100, size = 180, color = '#FD550A' }) => {
  const r = (size - 16) / 2
  const c = 2 * Math.PI * r
  const p = (value / max) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4e7e7" strokeWidth="14" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeDasharray={c}
          strokeDashoffset={c - p}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-headline-xl text-headline-xl text-on-surface">{value}</span>
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
          out of {max}
        </span>
      </div>
    </div>
  )
}

const RingProgress = ({ value, size = 110, color = '#FD550A' }) => {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const p = (Math.max(0, Math.min(100, value)) / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4e7e7" strokeWidth="12" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={c}
          strokeDashoffset={c - p}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-headline-md text-headline-md text-on-surface">{Math.round(value)}%</span>
      </div>
    </div>
  )
}

const CreatorScorecard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    reliabilityScore: 100,
    campaignsCompleted: 0,
    totalLeads: 0,
    totalEarnings: 0,
    avgResponseTime: null,
    communicationScore: null,
    contentApprovalRate: null,
    onTimeDelivery: null,
    punctualityCompleted: 0,
    campaignCompletionRate: null,
    totalSubmissions: 0,
    totalAssignments: 0,
    completedAssignments: 0,
  })

  useEffect(() => {
    if (user?.id) fetchData()
  }, [user, fetchData])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: creator } = await supabase
        .from('creator_profiles')
        .select('id, reliability_score, campaigns_completed, total_leads_generated')
        .eq('user_id', user.id)
        .single()

      const { data: wallet } = await supabase
        .from('wallets')
        .select('total_earned')
        .eq('user_id', user.id)
        .eq('wallet_type', 'creator')
        .single()

      const { data: submissions } = await supabase
        .from('content_submissions')
        .select('id, status, submitted_at, approved_at, created_at')
        .eq('creator_id', user.id)

      const totalSubmissions = submissions?.length || 0
      const approvedFirst = submissions?.filter((s) => s.status === 'approved').length || 0
      const approvalRate = totalSubmissions > 0 ? Math.round((approvedFirst / totalSubmissions) * 100) : 100

      let totalAssignments = 0
      let completedAssignments = 0
      if (creator?.id) {
        const [{ count: total }, { count: done }] = await Promise.all([
          supabase
            .from('campaign_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('creator_id', creator.id),
          supabase
            .from('campaign_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('creator_id', creator.id)
            .eq('is_completed', true),
        ])
        totalAssignments = total || 0
        completedAssignments = done || 0
      }
      const campaignCompletionRate = totalAssignments > 0
        ? Math.round((completedAssignments / totalAssignments) * 100)
        : null

      const [avgResponseHours, punctuality] = await Promise.all([
        fetchAvgResponseHours(user.id),
        fetchPunctualityRate(creator?.id),
      ])

      setStats({
        reliabilityScore: creator?.reliability_score || 100,
        campaignsCompleted: creator?.campaigns_completed || 0,
        totalLeads: creator?.total_leads_generated || 0,
        totalEarnings: wallet?.total_earned || 0,
        avgResponseTime: avgResponseHours,
        communicationScore: communicationScoreFromHours(avgResponseHours),
        contentApprovalRate: totalSubmissions > 0 ? approvalRate : null,
        onTimeDelivery: punctuality.rate,
        punctualityCompleted: punctuality.completed,
        campaignCompletionRate,
        totalSubmissions,
        totalAssignments,
        completedAssignments,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load scorecard data')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  const scoreColor = (s) => (s >= 90 ? '#FD550A' : s >= 70 ? '#ca8a04' : '#ba1a1a')
  const scoreLabel = (s) => (s >= 90 ? 'Excellent' : s >= 70 ? 'Good' : 'Needs Improvement')

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  const tier = tierFor(stats.reliabilityScore)
  const nextTier = [...TIER_DEFS].reverse().find((t) => t.min > stats.reliabilityScore)

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-lg">
      <PageHeader
        eyebrow="Performance"
        title="Reliability Scorecard"
        description="Your trust score reflects on-time delivery, content quality, and developer feedback."
        actions={
          <>
            <Link to="/creator/achievements">
              <Button variant="ghost" icon="workspace_premium">
                Badges
              </Button>
            </Link>
            <Link to="/creator/profile">
              <Button variant="secondary" icon="edit">
                Edit Profile
              </Button>
            </Link>
          </>
        }
      />

      {/* Hero score + Tier */}
      <div className="grid grid-cols-12 gap-gutter">
        <Card className="col-span-12 lg:col-span-8">
          <div className="flex flex-col md:flex-row items-center gap-lg">
            <ScoreRing
              value={stats.reliabilityScore}
              max={100}
              color={scoreColor(stats.reliabilityScore)}
            />
            <div className="flex-1 text-center md:text-left">
              <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Reliability Score
              </div>
              <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">
                {scoreLabel(stats.reliabilityScore)}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                Calculated from completed assignments, on-time deliveries, and content approval rate.
                Maintain a high score to unlock premium campaigns.
              </p>
              <div className="flex flex-wrap gap-sm mt-md justify-center md:justify-start">
                <Chip tone="success" icon="check_circle">
                  {stats.totalSubmissions} submissions
                </Chip>
                <Chip tone="primary" icon="task_alt">
                  {stats.totalAssignments} assignments
                </Chip>
              </div>
            </div>
          </div>
        </Card>

        {/* Tier Card */}
        <Card className={cn('col-span-12 lg:col-span-4', tier.bg)}>
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-surface-container-lowest border-4 border-surface-container-lowest/40 flex items-center justify-center mb-sm shadow-sm">
              <Icon name={tier.icon} size={40} className={tier.color} style={{ fontVariationSettings: "'FILL' 1" }} />
            </div>
            <div className={cn('font-label-md text-label-md uppercase tracking-widest mb-xs', tier.color)}>
              Current Tier
            </div>
            <h3 className={cn('font-headline-lg text-headline-lg', tier.color)}>{tier.name}</h3>
            {nextTier ? (
              <>
                <div className="mt-md w-full">
                  <div className="flex justify-between font-label-md text-label-md mb-xs">
                    <span className={tier.color}>{tier.name}</span>
                    <span className={tier.color}>{nextTier.name}</span>
                  </div>
                  <div className="h-2 bg-surface-container-lowest/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-on-surface/70 rounded-full transition-all duration-700"
                      style={{
                        width: `${
                          ((stats.reliabilityScore - tier.min) / (nextTier.min - tier.min)) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <p className={cn('font-body-sm text-body-sm mt-sm', tier.color)}>
                  {nextTier.min - stats.reliabilityScore} pts to <strong>{nextTier.name}</strong>
                </p>
              </>
            ) : (
              <p className={cn('font-body-sm text-body-sm mt-sm', tier.color)}>
                Top tier achieved — keep delivering excellence.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <MetricCard
          label="Campaigns Completed"
          value={stats.campaignsCompleted.toLocaleString()}
          helper="Lifetime"
          icon="campaign"
          trendDirection="neutral"
        />
        <MetricCard
          label="Total Leads"
          value={stats.totalLeads.toLocaleString()}
          helper="Generated for developers"
          icon="trending_up"
          trendDirection="positive"
        />
        <MetricCard
          label="Total Earnings"
          value={formatCurrency(stats.totalEarnings)}
          helper="Lifetime earnings"
          icon="payments"
          trendDirection="positive"
        />
        <MetricCard
          label="Avg Response Time"
          value={stats.avgResponseTime != null ? `${stats.avgResponseTime.toFixed(1)}h` : '—'}
          helper={stats.avgResponseTime != null ? 'To developer messages' : 'No conversations yet'}
          icon="schedule"
          trendDirection="neutral"
        />
      </div>

      {/* Performance metrics */}
      <div className="grid grid-cols-12 gap-gutter">
        <Card className="col-span-12 md:col-span-4">
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
            Quality
          </div>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Content Approval</h3>
          <div className="flex items-center justify-center py-sm">
            <RingProgress value={stats.contentApprovalRate ?? 0} color="#FD550A" />
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant text-center mt-sm">
            {stats.contentApprovalRate != null
              ? `${stats.contentApprovalRate}% of your content is approved on first submission.`
              : 'Submit content to start tracking approval rate.'}
          </p>
        </Card>

        <Card className="col-span-12 md:col-span-4">
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
            Reliability
          </div>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-md">On-Time Delivery</h3>
          <div className="flex items-center justify-center py-sm">
            <RingProgress value={stats.onTimeDelivery ?? 0} color="#015D47" />
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant text-center mt-sm">
            {stats.onTimeDelivery != null
              ? `${stats.onTimeDelivery}% of deliverables submitted on time across ${stats.punctualityCompleted} campaign${stats.punctualityCompleted === 1 ? '' : 's'}.`
              : 'Complete campaigns with deadlines to track punctuality.'}
          </p>
        </Card>

        <Card className="col-span-12 md:col-span-4">
          <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
            Breakdown
          </div>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Score Components</h3>
          <div className="flex flex-col gap-sm">
            {[
              { label: 'Campaign Completion', value: stats.campaignCompletionRate },
              { label: 'Content Quality', value: stats.contentApprovalRate },
              { label: 'Communication', value: stats.communicationScore },
              { label: 'Punctuality', value: stats.onTimeDelivery },
            ].map((m, i) => (
              <div key={i}>
                <div className="flex justify-between mb-xs">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{m.label}</span>
                  <span className="font-data-mono text-data-mono text-on-surface">
                    {m.value != null ? `${m.value}%` : '—'}
                  </span>
                </div>
                <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${m.value ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tips */}
      <Card>
        <div className="flex items-start justify-between mb-md gap-sm">
          <div>
            <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
              Coaching
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface">
              Tips to lift your score
            </h3>
          </div>
          <Link to="/creator/achievements">
            <Button variant="ghost" size="sm" iconRight="arrow_forward">
              View badges
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          {[
            { icon: 'forum', title: 'Respond Quickly', desc: 'Reply to developer messages within 24 hours.' },
            { icon: 'auto_awesome', title: 'Submit Quality Content', desc: 'Follow brand guidelines carefully.' },
            { icon: 'event_available', title: 'Meet Deadlines', desc: 'Deliver on or before due dates.' },
          ].map((t, i) => (
            <div key={i} className="bg-surface-container-low border border-outline-variant rounded p-md">
              <div className="w-10 h-10 rounded bg-primary-container/20 text-primary inline-flex items-center justify-center mb-sm">
                <Icon name={t.icon} size={20} />
              </div>
              <p className="font-label-lg text-label-lg text-on-surface">{t.title}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">{t.desc}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default CreatorScorecard
