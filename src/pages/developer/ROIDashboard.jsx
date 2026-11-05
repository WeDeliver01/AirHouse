import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import {
  PageHeader, Button, MetricCard, Card, Chip, Icon, EmptyState, Skeleton, Select,
} from '../../components/stitch'
import { cn } from '../../lib/utils'

const ROI_TONE = (roi) => (roi >= 100 ? 'success' : roi >= 0 ? 'primary' : 'danger')

const DonutGauge = ({ value, max = 200, size = 192 }) => {
  const r = 40
  const c = 2 * Math.PI * r
  const clamped = Math.min(Math.max(value, -max), max)
  const pct = Math.min(Math.abs(clamped) / max, 1)
  const offset = c - pct * c
  const isPositive = value >= 0
  const stroke = isPositive ? '#38675a' : '#ba1a1a'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" className="transform -rotate-90">
        <circle cx="50" cy="50" r={r} fill="transparent" stroke="#dce2f7" strokeWidth="14" />
        <circle
          cx="50" cy="50" r={r} fill="transparent" stroke={stroke} strokeWidth="14"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn('font-headline-lg text-headline-lg font-data-mono',
          isPositive ? 'text-secondary' : 'text-error')}>
          {value >= 0 ? '+' : ''}{value.toFixed(0)}%
        </span>
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">ROI</span>
      </div>
    </div>
  )
}

const RoiBars = ({ data, height = 160 }) => {
  if (!data?.length) return null
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)
  return (
    <div className="flex items-end justify-between gap-sm" style={{ height }}>
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-xs min-w-0">
          <div className="relative w-full flex justify-center">
            <div
              className={cn(
                'w-full max-w-[40px] rounded-sm transition-all',
                item.value >= 0 ? 'bg-primary' : 'bg-error',
              )}
              style={{ height: `${Math.max((Math.abs(item.value) / max) * (height - 32), 8)}px` }}
              title={`${item.label}: ${item.value.toFixed(1)}%`}
            />
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant truncate w-full text-center">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}

const ROIDashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('all')
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats] = useState({})

  useEffect(() => {
    if (user?.id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, period])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select('id, title, property_name, total_budget, status, created_at')
        .eq('developer_id', user.id)

      const campaignIds = campaignsData?.map((c) => c.id) || []
      let leadsData = []
      if (campaignIds.length > 0) {
        const { data } = await supabase
          .from('leads')
          .select('id, campaign_id, pipeline_stage, sale_amount, created_at')
          .in('campaign_id', campaignIds)
        leadsData = data || []
      }

      const enriched = campaignsData?.map((c) => {
        const cLeads = leadsData.filter((l) => l.campaign_id === c.id)
        const converted = cLeads.filter((l) => l.pipeline_stage === 'converted')
        const totalRevenue = cLeads.reduce((s, l) => s + (parseFloat(l.sale_amount) || 0), 0)
        const budget = parseFloat(c.total_budget) || 0
        const roi = budget > 0 ? ((totalRevenue - budget) / budget) * 100 : 0
        const costPerLead = cLeads.length > 0 ? budget / cLeads.length : 0
        return {
          ...c,
          totalLeads: cLeads.length,
          convertedLeads: converted.length,
          totalRevenue,
          roi,
          costPerLead,
          profit: totalRevenue - budget,
          conversionRate: cLeads.length > 0 ? (converted.length / cLeads.length) * 100 : 0,
        }
      }) || []

      setCampaigns(enriched.sort((a, b) => b.roi - a.roi))

      const totalBudget = enriched.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0)
      const totalRevenue = enriched.reduce((s, c) => s + c.totalRevenue, 0)
      const totalLeads = enriched.reduce((s, c) => s + c.totalLeads, 0)
      const totalConversions = enriched.reduce((s, c) => s + c.convertedLeads, 0)
      const profitableCampaigns = enriched.filter((c) => c.roi > 0).length

      setStats({
        totalBudget,
        totalRevenue,
        totalProfit: totalRevenue - totalBudget,
        overallROI: totalBudget > 0 ? ((totalRevenue - totalBudget) / totalBudget) * 100 : 0,
        totalLeads,
        totalConversions,
        conversionRate: totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0,
        profitableCampaigns,
        totalCampaigns: enriched.length,
        avgCostPerLead: totalLeads > 0 ? totalBudget / totalLeads : 0,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load ROI data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-md">
        <Skeleton className="h-12 w-72" />
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
          title="Couldn't load ROI"
          description={error}
          action={<Button onClick={fetchData}>Retry</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Marketing Performance"
        title="ROI &amp; Analytics"
        description="Strategic overview of your campaign spend, lead value, and conversion efficiency."
        actions={(
          <>
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="min-w-[160px]"
              options={[
                { value: 'all', label: 'All Time' },
                { value: '90', label: 'Last 90 Days' },
                { value: '30', label: 'Last 30 Days' },
              ]}
            />
            <Button variant="ghost" icon="download">Export</Button>
          </>
        )}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <MetricCard
          icon="account_balance"
          label="Total Investment"
          value={<span className="font-data-mono">{formatCurrency(stats.totalBudget)}</span>}
          helper={`${stats.totalCampaigns} campaigns`}
        />
        <MetricCard
          icon="monetization_on"
          label="Lead Value Realised"
          value={<span className="font-data-mono">{formatCurrency(stats.totalRevenue)}</span>}
          trend={stats.totalProfit >= 0 ? `+${formatCurrency(stats.totalProfit)}` : formatCurrency(stats.totalProfit)}
          trendDirection={stats.totalProfit >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          icon="percent"
          label="Return on Investment"
          value={(
            <span className={cn('font-data-mono', stats.overallROI >= 0 ? 'text-secondary' : 'text-error')}>
              {stats.overallROI >= 0 ? '+' : ''}{stats.overallROI?.toFixed(1) ?? 0}%
            </span>
          )}
          trend={`${stats.profitableCampaigns}/${stats.totalCampaigns} profitable`}
          trendDirection={stats.overallROI >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          icon="ads_click"
          label="Avg Cost Per Lead"
          value={<span className="font-data-mono">{formatCurrency(stats.avgCostPerLead || 0)}</span>}
          helper={`${stats.totalLeads} leads total`}
        />
      </div>

      {/* Bento: ROI bars + gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <Card className="lg:col-span-2 flex flex-col gap-md">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Campaign ROI Comparison</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Top campaigns by return</p>
            </div>
            <Icon name="bar_chart" size={20} className="text-on-surface-variant" />
          </div>
          {campaigns.length > 0 ? (
            <RoiBars
              data={campaigns.slice(0, 8).map((c) => ({
                label: (c.title || c.property_name || 'Campaign').slice(0, 12),
                value: c.roi,
              }))}
              height={200}
            />
          ) : (
            <EmptyState icon="bar_chart" title="No data yet" description="ROI charts appear once campaigns launch." />
          )}
        </Card>

        <Card className="flex flex-col items-center gap-md">
          <div className="w-full flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Overall Performance</h3>
            <Icon name="donut_large" size={20} className="text-on-surface-variant" />
          </div>
          <DonutGauge value={stats.overallROI || 0} max={200} />
          <div className="grid grid-cols-2 gap-sm w-full">
            <div className="bg-surface-container-low rounded p-sm border border-outline-variant text-center">
              <p className="font-data-mono font-headline-md text-headline-md text-on-surface">
                {formatCurrency(stats.totalBudget)}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Invested</p>
            </div>
            <div className="bg-surface-container-low rounded p-sm border border-outline-variant text-center">
              <p className="font-data-mono font-headline-md text-headline-md text-secondary">
                {formatCurrency(stats.totalRevenue)}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Revenue</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Detailed table */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-md border-b border-outline-variant flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-on-surface">Campaign Performance</h3>
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
            {campaigns.length} rows
          </span>
        </div>
        {campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {['Campaign', 'Budget', 'Revenue', 'Profit', 'ROI', 'Leads', 'Conv.', 'Status'].map((h, i) => (
                    <th key={h}
                      className={cn(
                        'p-sm font-label-md text-label-md text-on-surface-variant uppercase tracking-wider',
                        i === 0 ? 'text-left' : 'text-right',
                      )}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low transition-colors">
                    <td className="p-sm font-label-lg text-label-lg text-on-surface">
                      {c.title || c.property_name}
                    </td>
                    <td className="p-sm text-right font-data-mono text-on-surface-variant">
                      {formatCurrency(c.total_budget)}
                    </td>
                    <td className="p-sm text-right font-data-mono text-on-surface">
                      {formatCurrency(c.totalRevenue)}
                    </td>
                    <td className={cn('p-sm text-right font-data-mono',
                      c.profit >= 0 ? 'text-secondary' : 'text-error')}>
                      {c.profit >= 0 ? '+' : ''}{formatCurrency(c.profit)}
                    </td>
                    <td className="p-sm text-right">
                      <Chip tone={ROI_TONE(c.roi)}>
                        <span className="font-data-mono">
                          {c.roi >= 0 ? '+' : ''}{c.roi.toFixed(0)}%
                        </span>
                      </Chip>
                    </td>
                    <td className="p-sm text-right font-data-mono text-on-surface">{c.totalLeads}</td>
                    <td className="p-sm text-right font-data-mono text-on-surface">{c.conversionRate.toFixed(0)}%</td>
                    <td className="p-sm text-right">
                      <Chip tone={c.status === 'active' ? 'success' : 'neutral'}>{c.status}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="trending_up"
            title="No campaigns yet"
            description="Launch a campaign to start tracking ROI."
          />
        )}
      </Card>
    </div>
  )
}

export default ROIDashboard
