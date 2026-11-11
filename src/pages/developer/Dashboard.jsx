import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatRelativeTime } from '../../lib/utils'
import {
  PageHeader, Button, MetricCard, Card, Chip, Icon, EmptyState, Skeleton,
} from '../../components/stitch'
import OnboardingWizard from '../../components/onboarding/OnboardingWizard'

const STAGE_TONE = {
  new: 'primary',
  contacted: 'tertiary',
  qualified: 'secondary',
  negotiating: 'tertiary',
  converted: 'success',
  lost: 'danger',
}

const SparklineChart = ({ data, color = '#015D47', height = 36 }) => {
  if (!data?.length) return null
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const points = data
    .map((val, i) => `${(i / (data.length - 1)) * 100},${100 - ((val - min) / range) * 100}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
      <polygon points={`0,100 ${points} 100,100`} fill={color} fillOpacity="0.15" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const MiniBarChart = ({ data, height = 96 }) => {
  if (!data?.length) return null
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-xs" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-xs">
          <div
            className="w-full bg-primary-container/40 hover:bg-primary-container transition-colors rounded-sm"
            style={{ height: `${Math.max((d.value / max) * (height - 24), 4)}px` }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="font-label-md text-label-md text-on-surface-variant">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

const DeveloperDashboard = () => {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    campaigns: 0, activeCreators: 0, totalLeads: 0, newLeads: 0,
    walletBalance: 0, escrowBalance: 0, totalSpent: 0,
  })
  const [campaigns, setCampaigns] = useState([])
  const [recentLeads, setRecentLeads] = useState([])
  const [weeklyLeads, setWeeklyLeads] = useState([])

  useEffect(() => {
    if (user?.id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select('*, assignments:campaign_assignments(count), leads:leads(count)')
        .eq('developer_id', user.id)
        .order('created_at', { ascending: false })
      setCampaigns(campaignsData || [])

      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance, escrow_balance, total_deposited')
        .eq('user_id', user.id).eq('wallet_type', 'developer').single()

      const campaignIds = campaignsData?.map((c) => c.id) || []
      let totalLeads = 0, newLeads = 0

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - 6)
      const weekBuckets = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        return { date: d, label: dayLabels[d.getDay()], value: 0 }
      })

      if (campaignIds.length > 0) {
        const { count: leadsCount } = await supabase
          .from('leads').select('*', { count: 'exact', head: true })
          .in('campaign_id', campaignIds)
        const { count: newCount } = await supabase
          .from('leads').select('*', { count: 'exact', head: true })
          .in('campaign_id', campaignIds).eq('pipeline_stage', 'new')
        totalLeads = leadsCount || 0
        newLeads = newCount || 0

        const { data: recent } = await supabase.from('leads')
          .select('id, lead_name, lead_email, pipeline_stage, created_at, campaign:campaigns(title)')
          .in('campaign_id', campaignIds)
          .order('created_at', { ascending: false }).limit(5)
        setRecentLeads(recent || [])

        const { data: weeklyLeadRows, error: weeklyLeadsError } = await supabase
          .from('leads')
          .select('created_at')
          .in('campaign_id', campaignIds)
          .gte('created_at', weekStart.toISOString())
        if (weeklyLeadsError) {
          console.error('Failed to load weekly leads', weeklyLeadsError)
        } else {
          weeklyLeadRows?.forEach((row) => {
            const created = new Date(row.created_at)
            created.setHours(0, 0, 0, 0)
            const idx = Math.floor((created - weekStart) / (24 * 60 * 60 * 1000))
            if (idx >= 0 && idx < 7) weekBuckets[idx].value += 1
          })
        }
      }

      setWeeklyLeads(weekBuckets.map(({ label, value }) => ({ label, value })))

      const activeCreators = campaignsData?.reduce(
        (sum, c) => sum + (c.assignments?.[0]?.count || 0), 0,
      ) || 0

      setStats({
        campaigns: campaignsData?.length || 0,
        activeCampaigns: campaignsData?.filter((c) => c.status === 'active').length || 0,
        activeCreators, totalLeads, newLeads,
        walletBalance: wallet?.balance || 0,
        escrowBalance: wallet?.escrow_balance || 0,
        totalSpent: wallet?.total_deposited || 0,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const isOnboarded = profile?.bio && profile?.full_name && profile?.company_name

  if (loading) {
    return (
      <div className="flex flex-col gap-md">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
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
          title="Couldn't load dashboard"
          description={error}
          action={<Button onClick={fetchData}>Retry</Button>}
        />
      </Card>
    )
  }
  if (!isOnboarded) {
    return <OnboardingWizard role="developer" profile={profile} onComplete={() => window.location.reload()} />
  }

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Developer Portal"
        title={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'there'}`}
        description="Here's your campaign performance overview."
        actions={(
          <>
            <Link to="/developer/wallet">
              <Button variant="ghost" icon="account_balance_wallet">Wallet</Button>
            </Link>
            <Link to="/developer/campaigns/new">
              <Button variant="primary" icon="add">New Campaign</Button>
            </Link>
          </>
        )}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <MetricCard
          icon="trending_up"
          label="Total Leads"
          value={<span className="font-data-mono">{stats.totalLeads}</span>}
          helper={`${stats.newLeads} new`}
          trend="+24%"
          trendDirection="positive"
        />
        <MetricCard
          icon="campaign"
          label="Active Campaigns"
          value={<span className="font-data-mono">{stats.activeCampaigns ?? 0}</span>}
          helper={`${stats.campaigns} total`}
          trend="+2"
          trendDirection="positive"
        />
        <MetricCard
          icon="group"
          label="Active Creators"
          value={<span className="font-data-mono">{stats.activeCreators}</span>}
          helper="Currently producing"
          trend="+3"
          trendDirection="positive"
        />
        <Link to="/developer/wallet">
          <MetricCard
            icon="account_balance_wallet"
            label="Wallet Balance"
            value={<span className="font-data-mono">{formatCurrency(stats.walletBalance)}</span>}
            helper={`${formatCurrency(stats.escrowBalance)} in escrow`}
          />
        </Link>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <Card className="lg:col-span-2 flex flex-col gap-md">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Leads This Week</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Daily lead acquisition</p>
            </div>
            <Link to="/developer/leads"
              className="font-label-md text-label-md text-primary hover:underline inline-flex items-center gap-xs">
              View all
              <Icon name="arrow_forward" size={14} />
            </Link>
          </div>
          <MiniBarChart data={weeklyLeads} />
          <div className="grid grid-cols-3 gap-md pt-md border-t border-outline-variant">
            <div>
              <p className="font-headline-md text-headline-md text-on-surface font-data-mono">{stats.totalLeads}</p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total</p>
            </div>
            <div>
              <p className="font-headline-md text-headline-md text-primary font-data-mono">{stats.newLeads}</p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">New</p>
            </div>
            <div>
              <p className="font-headline-md text-headline-md text-secondary font-data-mono">
                {stats.totalLeads ? Math.round((stats.newLeads / stats.totalLeads) * 100) : 0}%
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Fresh ratio</p>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-md">
          <h3 className="font-headline-md text-headline-md text-on-surface">Campaign Mix</h3>
          <SparklineChart data={[2, 3, 2, 4, 3, 5, 4, 6, 5, 4, 6, 7]} />
          <div className="grid grid-cols-3 gap-sm">
            <div className="bg-surface-container-low rounded p-sm text-center border border-outline-variant">
              <p className="font-headline-md text-headline-md text-secondary font-data-mono">
                {campaigns.filter((c) => c.status === 'active').length}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Active</p>
            </div>
            <div className="bg-surface-container-low rounded p-sm text-center border border-outline-variant">
              <p className="font-headline-md text-headline-md text-on-surface font-data-mono">
                {campaigns.filter((c) => c.status === 'completed').length}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Done</p>
            </div>
            <div className="bg-surface-container-low rounded p-sm text-center border border-outline-variant">
              <p className="font-headline-md text-headline-md text-on-surface-variant font-data-mono">
                {campaigns.filter((c) => c.status === 'draft').length}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Draft</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent leads + active campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        <Card className="flex flex-col gap-md">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Recent Leads</h3>
            <Link to="/developer/leads"
              className="font-label-md text-label-md text-primary hover:underline">View all</Link>
          </div>
          {recentLeads.length > 0 ? (
            <div className="flex flex-col divide-y divide-outline-variant">
              {recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  to="/developer/leads"
                  className="flex items-center justify-between py-sm hover:bg-surface-container-low rounded transition-colors px-sm -mx-sm"
                >
                  <div className="flex items-center gap-sm min-w-0">
                    <div className="w-10 h-10 rounded bg-primary-container/30 text-primary inline-flex items-center justify-center font-label-lg">
                      {lead.lead_name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface truncate">{lead.lead_name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {lead.campaign?.title || 'Direct'} • {formatRelativeTime(lead.created_at)}
                      </p>
                    </div>
                  </div>
                  <Chip tone={STAGE_TONE[lead.pipeline_stage] || 'neutral'}>
                    {lead.pipeline_stage}
                  </Chip>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="trending_up"
              title="No leads yet"
              description="Leads from your campaigns will appear here once creators start producing."
            />
          )}
        </Card>

        <Card className="flex flex-col gap-md">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Your Campaigns</h3>
            <Link to="/developer/campaigns"
              className="font-label-md text-label-md text-primary hover:underline">View all</Link>
          </div>
          {campaigns.slice(0, 4).length > 0 ? (
            <div className="flex flex-col divide-y divide-outline-variant">
              {campaigns.slice(0, 4).map((c) => (
                <Link key={c.id} to={`/developer/campaigns/${c.id}`}
                  className="flex items-center justify-between py-sm hover:bg-surface-container-low rounded transition-colors px-sm -mx-sm">
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface truncate">
                      {c.title || c.property_name}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      {c.property_location || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <Chip tone={c.status === 'active' ? 'success' : c.status === 'open' ? 'primary' : 'neutral'}>
                      {c.status}
                    </Chip>
                    <p className="font-data-mono font-label-md text-label-md text-on-surface-variant mt-xs">
                      {c.leads?.[0]?.count || 0} leads
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="campaign"
              title="No campaigns yet"
              description="Create your first campaign to start receiving applications."
              action={(
                <Link to="/developer/campaigns/new">
                  <Button icon="add">Create Campaign</Button>
                </Link>
              )}
            />
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="bg-surface-container-low">
        <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-sm">
          {[
            { to: '/developer/campaigns/new', label: 'Create Campaign', icon: 'add_box' },
            { to: '/developer/creators',      label: 'Find Creators',  icon: 'group_search' },
            { to: '/developer/leads',         label: 'Manage Leads',   icon: 'view_kanban' },
            { to: '/developer/assignments',   label: 'Assignments',    icon: 'assignment' },
            { to: '/developer/wallet',        label: 'Add Funds',      icon: 'account_balance_wallet' },
            { to: '/developer/campaigns',     label: 'Browse Campaigns', icon: 'campaign' },
          ].map((a) => (
            <Link key={a.to} to={a.to}
              className="flex items-center justify-between p-md bg-surface border border-outline-variant rounded hover:border-primary transition-colors group">
              <span className="flex items-center gap-sm font-label-lg text-label-lg text-on-surface">
                <Icon name={a.icon} size={20} className="text-primary" />
                {a.label}
              </span>
              <Icon name="arrow_forward" size={18} className="text-on-surface-variant group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default DeveloperDashboard
