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
  EmptyState,
  Icon,
} from '../../components/stitch'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { formatCurrency, formatRelativeTime, cn } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import OnboardingWizard from '../../components/onboarding/OnboardingWizard'

const SparklineChart = ({ data, color = '#006c4e', height = 40 }) => {
  if (!data?.length) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data
    .map((val, i) => `${(i / (data.length - 1)) * 100},${100 - ((val - min) / range) * 100}`)
    .join(' ')
  const gid = `cg-${Math.abs(color.split('').reduce((a, c) => a + c.charCodeAt(0), 0))}`
  return (
    <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${points} 100,100`} fill={`url(#${gid})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

const RingProgress = ({ value, size = 96, color = '#38675a' }) => {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const p = (Math.max(0, Math.min(100, value)) / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#dce2f7" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={c}
          strokeDashoffset={c - p}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-headline-md text-headline-md text-on-surface">{value}%</span>
      </div>
    </div>
  )
}

const EarningsBars = ({ data }) => {
  if (!data?.length) return null
  const max = Math.max(...data.map((d) => d.value))
  return (
    <div className="space-y-sm">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-sm">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant w-10">
            {d.label}
          </span>
          <div className="flex-1 h-6 bg-surface-container rounded overflow-hidden">
            <div
              className="h-full bg-primary rounded transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="font-data-mono text-data-mono w-24 text-right text-on-surface">
            {formatCurrency(d.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

const CreatorDashboard = () => {
  const { user, profile, creatorProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    activeAssignments: 0,
    pendingApplications: 0,
    totalLeads: 0,
    totalEarnings: 0,
    walletBalance: 0,
    campaignsCompleted: 0,
  })
  const [assignments, setAssignments] = useState([])
  const [applications, setApplications] = useState([])
  const [availableCampaigns, setAvailableCampaigns] = useState([])
  const [earningsData, setEarningsData] = useState([])

  useEffect(() => {
    if (user?.id) fetchData()
  }, [user, fetchData])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: creatorData } = await supabase
        .from('creator_profiles')
        .select('id, total_leads_generated, campaigns_completed')
        .eq('user_id', user.id)
        .single()

      if (!creatorData) {
        setLoading(false)
        return
      }

      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance, total_earned')
        .eq('user_id', user.id)
        .eq('wallet_type', 'creator')
        .single()

      const { data: assignmentsData } = await supabase
        .from('campaign_assignments')
        .select(
          '*, campaign:campaigns(id, title, property_name, property_location, creator_budget, status, developer:profiles!developer_id(full_name, company_name))',
        )
        .eq('creator_id', creatorData.id)
        .order('assigned_at', { ascending: false })
      setAssignments(assignmentsData || [])

      const { data: appsData } = await supabase
        .from('campaign_applications')
        .select('*, campaign:campaigns(id, title, property_name, creator_budget)')
        .eq('creator_id', creatorData.id)
        .eq('status', 'pending')
        .order('applied_at', { ascending: false })
      setApplications(appsData || [])

      const excludeIds = [
        ...(appsData?.map((a) => a.campaign_id) || []),
        ...(assignmentsData?.map((a) => a.campaign_id) || []),
      ]
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select(
          'id, title, property_name, property_location, creator_budget, developer:profiles!developer_id(full_name, company_name)',
        )
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(6)
      setAvailableCampaigns((campaigns || []).filter((c) => !excludeIds.includes(c.id)))

      if (wallet?.id) {
        const now = new Date()
        const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
        const windowStart = startOfMonth(
          new Date(now.getFullYear(), now.getMonth() - 5, 1),
        )
        const monthBuckets = []
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          monthBuckets.push({
            key: `${d.getFullYear()}-${d.getMonth()}`,
            label: d.toLocaleString('en-US', { month: 'short' }),
            value: 0,
          })
        }

        const { data: txs, error: txError } = await supabase
          .from('wallet_transactions')
          .select('amount, transaction_type, created_at, status')
          .eq('wallet_id', wallet.id)
          .in('transaction_type', ['escrow_release', 'content_payment'])
          .eq('status', 'completed')
          .gt('amount', 0)
          .gte('created_at', windowStart.toISOString())
        if (txError) throw txError

        ;(txs || []).forEach((tx) => {
          const d = new Date(tx.created_at)
          const key = `${d.getFullYear()}-${d.getMonth()}`
          const bucket = monthBuckets.find((b) => b.key === key)
          if (bucket) bucket.value += Number(tx.amount) || 0
        })

        setEarningsData(monthBuckets.map(({ label, value }) => ({ label, value })))
      } else {
        setEarningsData([])
      }

      setStats({
        activeAssignments: assignmentsData?.filter((a) => a.campaign?.status === 'active').length || 0,
        pendingApplications: appsData?.length || 0,
        totalLeads: creatorData.total_leads_generated || 0,
        totalEarnings: wallet?.total_earned || 0,
        walletBalance: wallet?.balance || 0,
        campaignsCompleted: creatorData.campaigns_completed || 0,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  const copyReferralLink = (assignment) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/lead/${assignment.campaign_id}?ref=${assignment.creator_referral_code}`,
    )
    toast.success('Referral link copied')
  }

  const profileCompletion = (() => {
    if (!creatorProfile) return 0
    const fields = [
      creatorProfile.instagram_handle,
      creatorProfile.tiktok_handle,
      creatorProfile.follower_count > 0,
      creatorProfile.niche?.length > 0,
      creatorProfile.location,
      creatorProfile.rate_card && Object.keys(creatorProfile.rate_card).length > 0,
    ]
    return Math.round((fields.filter(Boolean).length / fields.length) * 100)
  })()

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )

  if (error) return <ErrorState message={error} onRetry={fetchData} />

  const isOnboarded = profile?.bio && profile?.full_name
  if (!isOnboarded) {
    return <OnboardingWizard role="creator" profile={profile} onComplete={() => window.location.reload()} />
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'Creator'

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-lg">
      <PageHeader
        eyebrow="Creator Workspace"
        title={`Welcome back, ${firstName}`}
        description="Track your campaigns, earnings, and pipeline at a glance."
        actions={
          <>
            <Link to="/creator/wallet">
              <Button variant="ghost" icon="account_balance_wallet">
                {formatCurrency(stats.walletBalance)}
              </Button>
            </Link>
            <Link to="/creator/campaigns">
              <Button variant="primary" icon="campaign">
                Find Campaigns
              </Button>
            </Link>
          </>
        }
      />

      {/* KPI Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <MetricCard
          label="Wallet Balance"
          value={formatCurrency(stats.walletBalance)}
          helper="Available to withdraw"
          icon="account_balance_wallet"
          trend="+18%"
          trendDirection="positive"
        />
        <MetricCard
          label="Total Earnings"
          value={formatCurrency(stats.totalEarnings)}
          helper="Lifetime earnings"
          icon="payments"
          trend="+24%"
          trendDirection="positive"
        />
        <MetricCard
          label="Total Leads"
          value={stats.totalLeads.toLocaleString()}
          helper="Generated for clients"
          icon="trending_up"
          trend="+32%"
          trendDirection="positive"
        />
        <MetricCard
          label="Campaigns Completed"
          value={stats.campaignsCompleted.toLocaleString()}
          helper={`${stats.activeAssignments} active now`}
          icon="check_circle"
          trendDirection="neutral"
        />
      </div>

      {/* Profile strength + earnings */}
      <div className="grid grid-cols-12 gap-gutter">
        <Card className="col-span-12 lg:col-span-4">
          <div className="flex items-start justify-between mb-md">
            <div>
              <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Profile Strength
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Boost your visibility</h3>
            </div>
            <Link to="/creator/profile">
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-md mb-md">
            <RingProgress value={profileCompletion} />
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              A complete profile helps developers shortlist you faster and unlocks higher-tier campaigns.
            </p>
          </div>

          <ul className="flex flex-col gap-sm">
            {[
              { done: !!creatorProfile?.instagram_handle, label: 'Social handles' },
              { done: creatorProfile?.follower_count > 0, label: 'Follower count' },
              { done: creatorProfile?.niche?.length > 0, label: 'Specializations' },
              { done: !!creatorProfile?.rate_card, label: 'Rate card' },
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-sm">
                <Icon
                  name={item.done ? 'check_circle' : 'radio_button_unchecked'}
                  size={18}
                  className={item.done ? 'text-secondary' : 'text-on-surface-variant'}
                  style={item.done ? { fontVariationSettings: "'FILL' 1" } : undefined}
                />
                <span
                  className={cn(
                    'font-body-md text-body-md',
                    item.done ? 'text-on-surface' : 'text-on-surface-variant',
                  )}
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="col-span-12 lg:col-span-8">
          <div className="flex items-center justify-between mb-md">
            <div>
              <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Recent Earnings
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Monthly breakdown</h3>
            </div>
            <Link
              to="/creator/wallet"
              className="font-label-lg text-label-lg text-primary hover:opacity-80 inline-flex items-center gap-xs"
            >
              View wallet
              <Icon name="arrow_forward" size={16} />
            </Link>
          </div>
          {earningsData.some((d) => d.value > 0) ? (
            <>
              <EarningsBars data={earningsData} />
              <div className="mt-md pt-sm border-t border-outline-variant">
                <SparklineChart data={earningsData.map((d) => d.value)} height={48} />
              </div>
            </>
          ) : (
            <EmptyState
              icon="payments"
              title="No recent earnings"
              description="Earnings from approved content and released escrow over the past six months will appear here."
            />
          )}
        </Card>
      </div>

      {/* Active campaigns */}
      {assignments.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-md">
            <div className="flex items-center gap-sm">
              <span className="w-2 h-2 bg-secondary rounded-full animate-pulse" />
              <h3 className="font-headline-md text-headline-md text-on-surface">Active Campaigns</h3>
            </div>
            <Link
              to="/creator/active"
              className="font-label-lg text-label-lg text-primary hover:opacity-80"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            {assignments.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="bg-surface-container-low border border-outline-variant rounded p-md"
              >
                <div className="flex items-start justify-between gap-sm mb-sm">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-label-lg text-label-lg text-on-surface truncate">
                      {a.campaign?.title}
                    </h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      {a.campaign?.property_location}
                    </p>
                  </div>
                  <Chip tone={a.campaign?.status === 'active' ? 'success' : 'neutral'}>
                    {a.campaign?.status}
                  </Chip>
                </div>
                <div className="flex items-center justify-between gap-sm">
                  <div className="flex flex-wrap gap-sm font-body-sm text-body-sm text-on-surface-variant">
                    <span>
                      Budget:{' '}
                      <span className="font-data-mono text-data-mono text-secondary">
                        {formatCurrency(a.agreed_budget || a.campaign?.creator_budget)}
                      </span>
                    </span>
                    <span>
                      Leads:{' '}
                      <span className="font-data-mono text-data-mono text-on-surface">
                        {a.leads_generated || 0}
                      </span>
                    </span>
                  </div>
                  <div className="flex gap-xs flex-shrink-0">
                    <button
                      onClick={() => copyReferralLink(a)}
                      className="p-xs hover:bg-surface-variant rounded text-on-surface-variant"
                      title="Copy link"
                    >
                      <Icon name="content_copy" size={18} />
                    </button>
                    <Link
                      to={`/creator/active/${a.id}`}
                      className="p-xs hover:bg-surface-variant rounded text-on-surface-variant inline-flex"
                    >
                      <Icon name="visibility" size={18} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pending Applications */}
      {applications.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-md">
            <div className="flex items-center gap-sm text-on-surface">
              <Icon name="schedule" size={20} className="text-on-secondary-container" />
              <h3 className="font-headline-md text-headline-md text-on-surface">
                Pending Applications ({applications.length})
              </h3>
            </div>
          </div>
          <div className="flex flex-col gap-sm">
            {applications.slice(0, 3).map((app) => (
              <div
                key={app.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-sm p-md bg-surface-container-low border border-outline-variant rounded"
              >
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface truncate">
                    {app.campaign?.title}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    {app.campaign?.property_name} • Applied {formatRelativeTime(app.applied_at)}
                  </p>
                </div>
                <div className="flex items-center sm:flex-col sm:items-end gap-sm sm:gap-xs flex-shrink-0">
                  <span className="font-data-mono text-data-mono text-secondary">
                    {formatCurrency(app.campaign?.creator_budget)}
                  </span>
                  <Chip tone="warning">Pending</Chip>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Available campaigns */}
      <Card>
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <Icon name="auto_awesome" size={20} className="text-primary" />
            <h3 className="font-headline-md text-headline-md text-on-surface">New Opportunities</h3>
          </div>
          <Link
            to="/creator/campaigns"
            className="font-label-lg text-label-lg text-primary hover:opacity-80 inline-flex items-center gap-xs"
          >
            Browse all
            <Icon name="arrow_forward" size={16} />
          </Link>
        </div>
        {availableCampaigns.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
            {availableCampaigns.map((c) => (
              <div
                key={c.id}
                className="p-md border border-outline-variant rounded hover:border-outline transition-colors flex flex-col gap-sm"
              >
                <div className="flex justify-between items-start gap-sm">
                  <h4 className="font-label-lg text-label-lg text-on-surface truncate">
                    {c.title || c.property_name}
                  </h4>
                  <span className="font-data-mono text-data-mono text-secondary flex-shrink-0">
                    {formatCurrency(c.creator_budget)}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  {c.property_location}
                </p>
                <div className="flex items-center justify-between gap-sm mt-auto pt-sm border-t border-outline-variant">
                  <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    {c.developer?.company_name || c.developer?.full_name}
                  </p>
                  <Link to={`/creator/campaigns/${c.id}`}>
                    <Button variant="primary" size="sm" iconRight="arrow_forward">
                      Apply
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="campaign"
            title="No new campaigns available"
            description="Check back soon — new opportunities are added daily."
          />
        )}
      </Card>

      {/* New creator empty state */}
      {assignments.length === 0 && applications.length === 0 && availableCampaigns.length === 0 && (
        <Card padding="lg" className="text-center">
          <div className="w-16 h-16 mx-auto mb-md bg-primary-container/20 rounded inline-flex items-center justify-center text-primary">
            <Icon name="campaign" size={32} />
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">
            Ready to start creating?
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-md max-w-md mx-auto">
            Browse available campaigns and apply to start earning.
          </p>
          <Link to="/creator/campaigns">
            <Button variant="primary" size="lg">
              Find Your First Campaign
            </Button>
          </Link>
        </Card>
      )}
    </div>
  )
}

export default CreatorDashboard
