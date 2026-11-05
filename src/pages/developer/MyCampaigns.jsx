import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader, Button, Card, MetricCard, Chip, Icon, EmptyState, Skeleton,
  Input, Select,
} from '../../components/stitch'
import { formatCurrency } from '../../lib/utils'
import { toast } from 'react-hot-toast'

const STATUS_TONE = {
  active: 'success',
  open: 'primary',
  draft: 'neutral',
  completed: 'secondary',
  cancelled: 'danger',
}

const MyCampaigns = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, draft: 0, totalBudget: 0 })
  const [filter, setFilter] = useState({ status: '', search: '' })

  useEffect(() => {
    if (user?.id) fetchCampaigns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchCampaigns = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('campaigns')
        .select('*, assignments:campaign_assignments(count), leads:leads(count)')
        .eq('developer_id', user.id)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setCampaigns(data || [])

      setStats({
        total: data?.length || 0,
        active: data?.filter((c) => c.status === 'active').length || 0,
        draft: data?.filter((c) => c.status === 'draft').length || 0,
        totalBudget: data?.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0) || 0,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load campaigns')
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const filteredCampaigns = campaigns.filter((c) => {
    if (filter.status && c.status !== filter.status) return false
    if (filter.search
      && !c.title?.toLowerCase().includes(filter.search.toLowerCase())
      && !c.property_name?.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex flex-col gap-gutter">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
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
          title="Couldn't load campaigns"
          description={error}
          action={<Button onClick={fetchCampaigns}>Retry</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Campaigns"
        title="My Campaigns"
        description="Manage your property marketing campaigns."
        actions={(
          <Link to="/developer/campaigns/new">
            <Button variant="primary" icon="add">New Campaign</Button>
          </Link>
        )}
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <MetricCard
          icon="campaign"
          label="Total Campaigns"
          value={<span className="font-data-mono">{stats.total}</span>}
          helper="All-time"
        />
        <MetricCard
          icon="trending_up"
          label="Active"
          value={<span className="font-data-mono">{stats.active}</span>}
          helper="Currently running"
        />
        <MetricCard
          icon="edit_note"
          label="Drafts"
          value={<span className="font-data-mono">{stats.draft}</span>}
          helper="Awaiting publish"
        />
        <MetricCard
          icon="payments"
          label="Total Budget"
          value={<span className="font-data-mono">{formatCurrency(stats.totalBudget)}</span>}
          helper="Across all campaigns"
        />
      </div>

      {/* Filters */}
      <Card className="flex flex-col md:flex-row gap-md md:items-end">
        <div className="flex-1">
          <Input
            label="Search"
            type="text"
            placeholder="Search campaigns…"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <div className="md:w-56">
          <Select
            label="Status"
            value={filter.status}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
      </Card>

      {/* Grid */}
      {filteredCampaigns.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {filteredCampaigns.map((campaign) => (
            <Card
              key={campaign.id}
              padding="none"
              className="overflow-hidden flex flex-col hover:border-primary transition-colors"
            >
              <div className="h-40 bg-primary-container/20 flex items-center justify-center">
                <Icon name="campaign" size={48} className="text-primary/60" />
              </div>

              <div className="p-md flex flex-col gap-md flex-1">
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <h3 className="font-label-lg text-label-lg text-on-surface truncate">
                      {campaign.title || campaign.property_name}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant inline-flex items-center gap-xs mt-xs truncate">
                      <Icon name="location_on" size={14} />
                      <span className="truncate">{campaign.property_location || '—'}</span>
                    </p>
                  </div>
                  <Chip tone={STATUS_TONE[campaign.status] || 'neutral'}>
                    {campaign.status}
                  </Chip>
                </div>

                <div className="grid grid-cols-3 gap-sm py-sm border-y border-outline-variant">
                  <div className="text-center">
                    <p className="font-headline-md text-headline-md text-on-surface font-data-mono">
                      {campaign.assignments?.[0]?.count || 0}
                    </p>
                    <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                      Creators
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="font-headline-md text-headline-md text-secondary font-data-mono">
                      {campaign.leads?.[0]?.count || 0}
                    </p>
                    <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                      Leads
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="font-headline-md text-headline-md text-primary font-data-mono">
                      {formatCurrency(campaign.creator_budget)}
                    </p>
                    <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                      Budget
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-sm mt-auto">
                  <Link to={`/developer/campaigns/${campaign.id}`} className="flex-1 min-w-0">
                    <Button variant="ghost" icon="visibility" className="w-full">View</Button>
                  </Link>
                  {campaign.status === 'draft' && (
                    <Link to={`/developer/campaigns/${campaign.id}/edit`}>
                      <Button variant="ghost" icon="edit" aria-label="Edit campaign" />
                    </Link>
                  )}
                  {(campaign.status === 'open' || campaign.status === 'active') && (
                    <Link to={`/developer/campaigns/${campaign.id}/applications`}>
                      <Button variant="primary" icon="group" aria-label="View applications" />
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon="campaign"
            title="No campaigns yet"
            description="Create your first campaign to start generating leads."
            action={(
              <Link to="/developer/campaigns/new">
                <Button icon="add">Create Campaign</Button>
              </Link>
            )}
          />
        </Card>
      )}
    </div>
  )
}

export default MyCampaigns
