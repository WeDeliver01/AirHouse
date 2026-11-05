import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  PageHeader, Button, Card, MetricCard, Chip, Select, Icon,
  EmptyState, Skeleton,
} from '../../components/stitch'
import { formatNumber, cn } from '../../lib/utils'

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
      className="rounded bg-primary-container/30 text-primary inline-flex items-center justify-center font-label-lg"
    >
      {initial}
    </span>
  )
}

const CreatorRankings = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creators, setCreators] = useState([])
  const [sortBy, setSortBy] = useState('leads')
  const [sortDir, setSortDir] = useState('desc')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchCreators()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, filter])

  const fetchCreators = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: creatorsData } = await supabase
        .from('creator_profiles')
        .select(`
          *,
          profiles:user_id(full_name, avatar_url, is_verified)
        `)

      const creatorIds = creatorsData?.map((c) => c.id) || []

      const { data: reviewsData } = await supabase
        .from('creator_reviews')
        .select('creator_id, rating, communication_rating, quality_rating, timeliness_rating')
        .in('creator_id', creatorIds)

      const { data: assignmentsData } = await supabase
        .from('campaign_assignments')
        .select('creator_id, status, campaign_id')
        .in('creator_id', creatorIds)

      const enriched = creatorsData?.map((creator) => {
        const reviews = reviewsData?.filter((r) => r.creator_id === creator.id) || []
        const assignments = assignmentsData?.filter((a) => a.creator_id === creator.id) || []
        const completedCampaigns = assignments.filter((a) => a.status === 'completed').length
        const avgRating = reviews.length > 0
          ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
          : 0

        return {
          ...creator,
          avgRating,
          reviewCount: reviews.length,
          completedCampaigns,
          score: (
            (creator.total_leads_generated || 0) * 10
            + (creator.reliability_score || 0) * 5
            + avgRating * 20
            + completedCampaigns * 15
          ),
        }
      }) || []

      let sorted = [...enriched]
      if (sortBy === 'leads') {
        sorted.sort((a, b) => (sortDir === 'desc'
          ? (b.total_leads_generated || 0) - (a.total_leads_generated || 0)
          : (a.total_leads_generated || 0) - (b.total_leads_generated || 0)))
      } else if (sortBy === 'rating') {
        sorted.sort((a, b) => (sortDir === 'desc' ? b.avgRating - a.avgRating : a.avgRating - b.avgRating))
      } else if (sortBy === 'campaigns') {
        sorted.sort((a, b) => (sortDir === 'desc'
          ? b.completedCampaigns - a.completedCampaigns
          : a.completedCampaigns - b.completedCampaigns))
      } else if (sortBy === 'score') {
        sorted.sort((a, b) => (sortDir === 'desc' ? b.score - a.score : a.score - b.score))
      }

      if (filter === 'verified') {
        sorted = sorted.filter((c) => c.profiles?.is_verified || c.verification_level !== 'none')
      } else if (filter === 'top10') {
        sorted = sorted.slice(0, 10)
      }

      setCreators(sorted)
    } catch (e) {
      console.error(e)
      setError('Failed to load creator rankings')
    } finally {
      setLoading(false)
    }
  }

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
  }

  const getRankBadge = (index) => {
    if (index === 0) {
      return <Icon name="workspace_premium" size={24} className="text-tertiary" />
    }
    if (index === 1) {
      return <Icon name="military_tech" size={24} className="text-on-surface-variant" />
    }
    if (index === 2) {
      return <Icon name="military_tech" size={24} className="text-tertiary/70" />
    }
    return (
      <span className="font-label-md text-label-md font-data-mono text-on-surface-variant">
        #{index + 1}
      </span>
    )
  }

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
          title="Couldn't load rankings"
          description={error}
          action={<Button onClick={fetchCreators}>Retry</Button>}
        />
      </Card>
    )
  }

  const SortableHeader = ({ field, label, align = 'center' }) => (
    <th
      className={cn(
        'py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant cursor-pointer hover:text-on-surface',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
      )}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-xs">
        {label}
        <Icon
          name={sortBy === field ? (sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward') : 'unfold_more'}
          size={12}
        />
      </span>
    </th>
  )

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Performance"
        title="Creator Rankings"
        description="See who's actually delivering results."
        actions={(
          <div className="w-48">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Creators</option>
              <option value="verified">Verified Only</option>
              <option value="top10">Top 10</option>
            </Select>
          </div>
        )}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <Card className="ambient-shadow flex flex-col gap-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Top Performer
            </span>
            <Icon name="emoji_events" size={20} className="text-tertiary" />
          </div>
          <p className="font-headline-md text-headline-md text-on-surface truncate">
            {creators[0]?.profiles?.full_name || 'N/A'}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            <span className="font-data-mono">{creators[0]?.total_leads_generated || 0}</span> leads generated
          </p>
        </Card>
        <MetricCard
          icon="group"
          label="Total Creators"
          value={<span className="font-data-mono">{creators.length}</span>}
          helper="In the leaderboard"
        />
        <MetricCard
          icon="star"
          label="Avg Rating"
          value={(
            <span className="font-data-mono">
              {creators.length > 0
                ? (creators.reduce((s, c) => s + c.avgRating, 0) / creators.length).toFixed(1)
                : '0.0'}
            </span>
          )}
          helper="Across all creators"
        />
        <MetricCard
          icon="adjust"
          label="Total Leads"
          value={(
            <span className="font-data-mono">
              {formatNumber(creators.reduce((s, c) => s + (c.total_leads_generated || 0), 0))}
            </span>
          )}
          helper="Lifetime"
        />
      </div>

      {/* Rankings Table */}
      <Card>
        {creators.length === 0 ? (
          <EmptyState
            icon="group"
            title="No creators found"
            description="Creator rankings will appear once creators join the platform."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant w-12">
                    Rank
                  </th>
                  <th className="text-left py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                    Creator
                  </th>
                  <SortableHeader field="score" label="Score" />
                  <SortableHeader field="leads" label="Leads" />
                  <SortableHeader field="campaigns" label="Campaigns" />
                  <SortableHeader field="rating" label="Rating" />
                  <th className="text-center py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                    Reliability
                  </th>
                  <th className="text-center py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {creators.map((creator, index) => (
                  <tr
                    key={creator.id}
                    className={cn(
                      'border-b border-outline-variant last:border-0 hover:bg-surface-container-low',
                      index < 3 && 'bg-tertiary-fixed/20',
                    )}
                  >
                    <td className="py-md">{getRankBadge(index)}</td>
                    <td className="py-md">
                      <div className="flex items-center gap-sm">
                        <Avatar
                          url={creator.profiles?.avatar_url}
                          name={creator.profiles?.full_name}
                          size={40}
                        />
                        <div>
                          <p className="font-label-lg text-label-lg text-on-surface inline-flex items-center gap-sm">
                            {creator.profiles?.full_name || 'Unnamed creator'}
                            {(creator.profiles?.is_verified || creator.verification_level !== 'none') && (
                              <Chip tone="success">Verified</Chip>
                            )}
                          </p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant font-data-mono">
                            {formatNumber(creator.follower_count || 0)} followers
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-md text-center">
                      <span className="inline-flex items-center px-sm py-xs bg-primary-container/20 text-primary font-label-md text-label-md font-data-mono rounded">
                        {Math.round(creator.score)}
                      </span>
                    </td>
                    <td className="py-md text-center font-data-mono text-body-md text-on-surface">
                      {creator.total_leads_generated || 0}
                    </td>
                    <td className="py-md text-center font-data-mono text-body-md text-on-surface">
                      {creator.completedCampaigns}
                    </td>
                    <td className="py-md text-center">
                      <div className="inline-flex items-center justify-center gap-xs">
                        <Icon
                          name="star"
                          size={14}
                          className={creator.avgRating >= 1 ? 'text-tertiary' : 'text-on-surface-variant'}
                        />
                        <span className="font-data-mono text-body-md text-on-surface">
                          {creator.avgRating.toFixed(1)}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          ({creator.reviewCount})
                        </span>
                      </div>
                    </td>
                    <td className="py-md text-center">
                      <div className="w-full max-w-[80px] mx-auto bg-surface-container rounded h-2">
                        <div
                          className="bg-secondary h-2 rounded"
                          style={{ width: `${Math.min(creator.reliability_score || 0, 100)}%` }}
                        />
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant font-data-mono">
                        {creator.reliability_score || 0}%
                      </span>
                    </td>
                    <td className="py-md text-center">
                      <Chip tone={creator.is_available ? 'success' : 'neutral'}>
                        {creator.is_available ? 'Available' : 'Busy'}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default CreatorRankings
