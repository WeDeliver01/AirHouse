import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState } from '../../components/ui'
import { formatCurrency, cn } from '../../lib/utils'
import {
  Download,
  CalendarRange,
  TrendingUp,
  Wallet,
  Landmark,
  FilterX,
  ArrowRight,
  Users,
  MapPin,
  LineChart as LineIcon,
  BarChart3,
  Activity,
} from 'lucide-react'

const RANGES = [
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: '90d', label: 'Last 90 Days', days: 90 },
  { key: 'ytd', label: 'Year to Date', days: 365 },
]

const monthLabels = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const monthBuckets = (count) => {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`,
      label: monthLabels[d.getMonth()],
      year: d.getFullYear(),
      month: d.getMonth(),
    }
  })
}

const bucketKey = (dateStr) => {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
}

const RevenueLineChart = ({ data, height = 240 }) => {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100
  const h = 100
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - (d.value / max) * h
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <div className="w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-full"
        role="img"
        aria-label="Revenue trend over time"
      >
        <defs>
          <linearGradient id="revfill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38675a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38675a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((g) => (
          <line key={g} x1={0} x2={w} y1={g} y2={g} stroke="#c0c8c4" strokeWidth="0.2" />
        ))}
        <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#revfill)" />
        <polyline
          points={points}
          fill="none"
          stroke="#38675a"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * w
          const y = h - (d.value / max) * h
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="0.9"
              fill="#38675a"
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${d.label}: ${formatCurrency(d.value)}`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="flex justify-between mt-2 px-1 font-label-md text-label-md text-on-surface-variant">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}

const CategoriesBarChart = ({ data, height = 220 }) => {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-on-surface-variant font-body-sm text-body-sm"
        style={{ height }}
      >
        No category data yet — creators have not declared niches.
      </div>
    )
  }
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-3" style={{ minHeight: height }}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="font-label-md text-label-md text-on-surface w-32 truncate" title={d.label}>
            {d.label}
          </span>
          <div className="flex-1 h-5 bg-surface-container-highest rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-container rounded transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="font-data-mono text-data-mono text-on-surface w-14 text-right">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const MauChart = ({ data, height = 200 }) => {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end h-full"
            title={`${d.label}: ${d.value} active users`}
          >
            <div
              className="w-full bg-gradient-to-t from-secondary-fixed-dim to-secondary rounded-t transition-all duration-500"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 4 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 font-label-md text-label-md text-on-surface-variant">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">{d.label}</span>
        ))}
      </div>
    </div>
  )
}

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [range, setRange] = useState('30d')
  const [data, setData] = useState({
    gmv: 0,
    revenue: 0,
    creatorBudgetTotal: 0,
    creatorPayoutsTotal: 0,
    feeShare: 0,
    creatorShare: 0,
    revenueIsRealised: false,
    leadsTotal: 0,
    convertedTotal: 0,
    benchmarkConversionPct: 0,
    revenueTrend: [],
    categories: [],
    mau: [],
    topCreators: [],
    topRegions: [],
  })

  const selectedRange = RANGES.find((r) => r.key === range) || RANGES[0]

  useEffect(() => { fetchData() /* eslint-disable-next-line */ }, [range])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const sinceDate = new Date(Date.now() - selectedRange.days * 24 * 60 * 60 * 1000)
      const since = sinceDate.toISOString()
      // Trailing-30-day benchmark window (the 30 days immediately before `sinceDate`).
      const benchmarkSince = new Date(
        sinceDate.getTime() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString()

      const [
        { data: campaigns, error: cErr },
        { data: leads, error: lErr },
        { data: creators, error: crErr },
        { data: assignments, error: aErr },
        { data: walletTx, error: wErr },
      ] = await Promise.all([
        supabase
          .from('campaigns')
          .select('id, total_budget, platform_fee, creator_budget, created_at, property_location'),
        supabase
          .from('leads')
          .select('id, pipeline_stage, status, created_at, creator_id, campaign_id'),
        supabase
          .from('creator_profiles')
          .select(
            'id, user_id, niche, location, follower_count, total_leads_generated, campaigns_completed, profiles:user_id(full_name, avatar_url)',
          ),
        supabase
          .from('campaign_assignments')
          .select(
            'id, creator_id, leads_generated, assigned_at, agreed_budget, amount_earned, amount_paid',
          ),
        supabase
          .from('wallet_transactions')
          .select('amount, transaction_type, created_at')
          .in('transaction_type', ['platform_fee', 'escrow_release', 'content_payment']),
      ])
      if (cErr) throw cErr
      if (lErr) throw lErr
      if (crErr) throw crErr
      if (aErr) throw aErr
      if (wErr) throw wErr

      const campaignsInRange = (campaigns || []).filter((c) => c.created_at >= since)

      const gmv = campaignsInRange.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0)
      const contractedFees = campaignsInRange.reduce(
        (s, c) => s + (parseFloat(c.platform_fee) || 0),
        0,
      )
      const creatorBudgetTotal = campaignsInRange.reduce(
        (s, c) => s + (parseFloat(c.creator_budget) || 0),
        0,
      )

      // Realised revenue = sum of platform_fee wallet ledger lines in range.
      // Falls back to the contracted fee column when no wallet activity exists
      // yet (e.g. fresh installs with seeded campaigns but no money flow). The
      // UI surfaces which mode is in use so the figures aren't ambiguous.
      const txInRange = (walletTx || []).filter((t) => t.created_at >= since)
      const realisedFees = txInRange
        .filter((t) => t.transaction_type === 'platform_fee')
        .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0)
      const realisedCreatorPayouts = txInRange
        .filter(
          (t) =>
            t.transaction_type === 'escrow_release' ||
            t.transaction_type === 'content_payment',
        )
        .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0)
      const revenueIsRealised = realisedFees > 0 || realisedCreatorPayouts > 0
      const revenue = revenueIsRealised ? realisedFees : contractedFees
      const creatorPayoutsTotal = realisedCreatorPayouts

      // Derive the actual fee/creator share from the data so the labels reflect
      // reality rather than a hardcoded multiplier. Use the SAME source as the
      // displayed revenue / payout figures so the percentages match the values
      // shown beside them.
      const shareFee = revenueIsRealised ? realisedFees : contractedFees
      const shareCreator = revenueIsRealised
        ? realisedCreatorPayouts
        : creatorBudgetTotal
      const splitDenom = shareFee + shareCreator
      const feeShare = splitDenom > 0 ? (shareFee / splitDenom) * 100 : 0
      const creatorShare = splitDenom > 0 ? (shareCreator / splitDenom) * 100 : 0

      const leadsInRange = (leads || []).filter((l) => l.created_at >= since)
      const convertedTotal = leadsInRange.filter((l) => l.pipeline_stage === 'converted').length
      const leadsTotal = leadsInRange.length

      // Benchmark: trailing 30-day platform-wide conversion rate immediately
      // before the selected window — so admins can see whether the current
      // window is over- or under-performing.
      const benchmarkLeads = (leads || []).filter(
        (l) => l.created_at >= benchmarkSince && l.created_at < since,
      )
      const benchmarkConverted = benchmarkLeads.filter(
        (l) => l.pipeline_stage === 'converted',
      ).length
      const benchmarkConversionPct = benchmarkLeads.length
        ? (benchmarkConverted / benchmarkLeads.length) * 100
        : 0

      // Revenue trend by month — pick bucket count by range. Prefer real
      // platform_fee wallet ledger lines when present, falling back to the
      // contracted campaign fee for buckets with no realised activity yet.
      const trendBuckets = monthBuckets(selectedRange.days <= 30 ? 6 : 12)
      const trendIndex = new Map(trendBuckets.map((b, i) => [b.key, i]))
      const trend = trendBuckets.map((b) => ({ label: b.label, value: 0 }))
      const realisedFeeTx = (walletTx || []).filter(
        (t) => t.transaction_type === 'platform_fee',
      )
      if (realisedFeeTx.length > 0) {
        realisedFeeTx.forEach((t) => {
          const idx = trendIndex.get(bucketKey(t.created_at))
          if (idx === undefined) return
          trend[idx].value += Math.abs(parseFloat(t.amount) || 0)
        })
      } else {
        (campaigns || []).forEach((c) => {
          const idx = trendIndex.get(bucketKey(c.created_at))
          if (idx === undefined) return
          trend[idx].value += parseFloat(c.platform_fee) || 0
        })
      }

      // Top creator categories — explode niche arrays, weight by leads_generated when available
      const categoryCounts = new Map()
      ;(creators || []).forEach((c) => {
        const niches = Array.isArray(c.niche) ? c.niche : []
        const weight = (c.total_leads_generated || 0) + 1 // 1 = counted creator + leads bonus
        niches.forEach((n) => {
          const key = String(n).trim()
          if (!key) return
          categoryCounts.set(key, (categoryCounts.get(key) || 0) + weight)
        })
      })
      const categories = Array.from(categoryCounts.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)

      // MAU — distinct active users per month from leads.creator_id and assignments.creator_id
      const mauBuckets = monthBuckets(6)
      const mauIndex = new Map(mauBuckets.map((b, i) => [b.key, i]))
      const mauSets = mauBuckets.map(() => new Set())
      ;(leads || []).forEach((l) => {
        if (!l.creator_id) return
        const idx = mauIndex.get(bucketKey(l.created_at))
        if (idx === undefined) return
        mauSets[idx].add(`c:${l.creator_id}`)
      })
      ;(assignments || []).forEach((a) => {
        if (!a.creator_id || !a.assigned_at) return
        const idx = mauIndex.get(bucketKey(a.assigned_at))
        if (idx === undefined) return
        mauSets[idx].add(`c:${a.creator_id}`)
      })
      ;(campaigns || []).forEach((c) => {
        // Developer activity proxy: a developer who launched a campaign that month is "active"
        // Use the campaign id as part of the key prefixed differently to avoid collisions.
        const idx = mauIndex.get(bucketKey(c.created_at))
        if (idx === undefined) return
        mauSets[idx].add(`d:${c.id}`)
      })
      const mau = mauBuckets.map((b, i) => ({ label: b.label, value: mauSets[i].size }))

      // Top regions — aggregate campaigns launched in the selected window by
      // property_location, weight by leads from that campaign that also fell in
      // the window. Creator location is folded in only as a small tiebreaker so
      // hubs with active creators but no in-range campaign still surface.
      const leadCountByCampaign = new Map()
      leadsInRange.forEach((l) => {
        if (!l.campaign_id) return
        leadCountByCampaign.set(
          l.campaign_id,
          (leadCountByCampaign.get(l.campaign_id) || 0) + 1,
        )
      })
      const regionCounts = new Map()
      campaignsInRange.forEach((c) => {
        const raw = (c.property_location || '').trim()
        if (!raw) return
        // Use the first segment of the location (e.g. "Cape Town" from "Cape Town, Western Cape")
        const region = raw.split(',')[0].trim() || raw
        const weight = 1 + (leadCountByCampaign.get(c.id) || 0)
        regionCounts.set(region, (regionCounts.get(region) || 0) + weight)
      })
      ;(creators || []).forEach((c) => {
        const raw = (c.location || '').trim()
        if (!raw) return
        const region = raw.split(',')[0].trim() || raw
        regionCounts.set(region, (regionCounts.get(region) || 0) + 1)
      })
      const topRegions = Array.from(regionCounts.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)

      // Per-creator ROI: total earnings vs. budget allocated to their
      // assignments — scoped to assignments made inside the selected window so
      // it stays consistent with the rest of the in-range KPIs. Aggregated
      // from real `campaign_assignments` rows so the figure reflects money
      // actually flowing through the platform rather than a random number.
      const assignmentsInRange = (assignments || []).filter(
        (a) => a.assigned_at && a.assigned_at >= since,
      )
      const creatorBudgetAgg = new Map()
      assignmentsInRange.forEach((a) => {
        if (!a.creator_id) return
        const cur = creatorBudgetAgg.get(a.creator_id) || { allocated: 0, earned: 0 }
        cur.allocated += parseFloat(a.agreed_budget) || 0
        cur.earned += parseFloat(a.amount_earned) || 0
        creatorBudgetAgg.set(a.creator_id, cur)
      })

      // Top creators by real total_leads_generated
      const topCreators = (creators || [])
        .map((c) => {
          const agg = creatorBudgetAgg.get(c.id) || { allocated: 0, earned: 0 }
          return {
            id: c.id,
            full_name: c.profiles?.full_name || 'Unnamed creator',
            avatar_url: c.profiles?.avatar_url || null,
            location: c.location || 'Location not set',
            follower_count: c.follower_count || 0,
            leads: c.total_leads_generated || 0,
            campaigns_completed: c.campaigns_completed || 0,
            allocatedBudget: agg.allocated,
            earnings: agg.earned,
            roi: agg.allocated > 0 ? (agg.earned / agg.allocated) * 100 : null,
          }
        })
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 5)

      setData({
        gmv,
        revenue,
        creatorBudgetTotal,
        creatorPayoutsTotal,
        feeShare,
        creatorShare,
        revenueIsRealised,
        leadsTotal,
        convertedTotal,
        benchmarkConversionPct,
        revenueTrend: trend,
        categories,
        mau,
        topCreators,
        topRegions,
      })
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const conversionPct = useMemo(
    () => (data.leadsTotal ? (data.convertedTotal / data.leadsTotal) * 100 : 0),
    [data.leadsTotal, data.convertedTotal],
  )
  const conversionDash = 289
  const conversionOffset = conversionDash - (Math.min(conversionPct, 100) / 100) * conversionDash

  const exportCsv = () => {
    const rows = [
      ['Section', 'Label', 'Value'],
      ['Range', selectedRange.label, ''],
      ['Summary', 'Total GMV', data.gmv],
      ['Summary', 'Total Revenue (platform fee)', data.revenue],
      ['Summary', 'Platform Fee Share %', data.feeShare.toFixed(2)],
      ['Summary', 'Total Creator Budget', data.creatorBudgetTotal],
      ['Summary', 'Creator Share %', data.creatorShare.toFixed(2)],
      ['Summary', 'Creator Payouts (realised)', data.creatorPayoutsTotal],
      ['Summary', 'Leads (in range)', data.leadsTotal],
      ['Summary', 'Converted Leads', data.convertedTotal],
      ['Summary', 'Lead Conversion %', conversionPct.toFixed(2)],
      ['Summary', 'Benchmark Conversion % (prior 30d)', data.benchmarkConversionPct.toFixed(2)],
      ...data.revenueTrend.map((r) => ['Revenue Trend', r.label, r.value]),
      ...data.categories.map((r) => ['Top Creator Categories', r.label, r.value]),
      ...data.topRegions.map((r) => ['Top Regions', r.label, r.value]),
      ...data.mau.map((r) => ['Monthly Active Users', r.label, r.value]),
      ...data.topCreators.flatMap((r) => [
        ['Top Creators', `${r.full_name} — leads`, r.leads],
        [
          'Top Creators',
          `${r.full_name} — ROI %`,
          r.roi !== null ? r.roi.toFixed(2) : '',
        ],
      ]),
    ]
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `airhouse-analytics-${range}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading platform analytics…" />
      </div>
    )
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  return (
    <div className="space-y-md">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-margin border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Analytics Dashboard</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            Platform-wide financial and user performance metrics — pulled live from your data.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <div className="flex items-center bg-secondary-container text-on-secondary-fixed border border-secondary-container rounded font-label-lg text-label-lg overflow-hidden">
            <span className="px-3 py-2 flex items-center gap-2">
              <CalendarRange className="w-4 h-4" />
            </span>
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={cn(
                  'px-3 py-2 transition-colors',
                  range === r.key
                    ? 'bg-secondary-fixed-dim text-on-secondary-fixed'
                    : 'hover:bg-secondary-fixed/40',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-md">
        <div className="md:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col justify-between">
          <div className="flex justify-between items-start mb-sm">
            <h3 className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wider">
              Total GMV
            </h3>
            <div className="bg-primary-container/20 text-on-primary-container p-1 rounded">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="font-headline-xl text-headline-xl text-on-surface mb-xs">
              {formatCurrency(data.gmv)}
            </div>
            <div className="flex items-center gap-1 text-secondary">
              <TrendingUp className="w-4 h-4" />
              <span className="font-data-mono text-data-mono">
                Gross merchandise value · {selectedRange.label.toLowerCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="md:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col justify-between">
          <div className="flex justify-between items-start mb-sm">
            <h3 className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wider">
              Platform Revenue
            </h3>
            <div className="bg-surface-container text-on-surface-variant p-1 rounded">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-xs">
              <div className="font-headline-xl text-headline-xl text-on-surface">
                {formatCurrency(data.revenue)}
              </div>
              <span
                className="font-label-md text-label-md text-on-surface-variant"
                title={
                  data.revenueIsRealised
                    ? 'Sourced from realised platform_fee wallet ledger lines.'
                    : 'No wallet activity yet — falling back to contracted campaign fees.'
                }
              >
                {data.revenueIsRealised ? 'realised' : 'contracted'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-label-md text-label-md text-on-surface-variant">
                <span>
                  Platform fee
                  {data.feeShare > 0 ? ` (${data.feeShare.toFixed(1)}%)` : ''}
                </span>
                <span className="font-data-mono">{formatCurrency(data.revenue)}</span>
              </div>
              <div className="flex justify-between font-label-md text-label-md text-on-surface-variant">
                <span>
                  Creator budget
                  {data.creatorShare > 0 ? ` (${data.creatorShare.toFixed(1)}%)` : ''}
                </span>
                <span className="font-data-mono">{formatCurrency(data.creatorBudgetTotal)}</span>
              </div>
              {data.creatorPayoutsTotal > 0 && (
                <div className="flex justify-between font-label-md text-label-md text-on-surface-variant">
                  <span>Paid out to creators</span>
                  <span className="font-data-mono">
                    {formatCurrency(data.creatorPayoutsTotal)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col justify-between">
          <div className="flex justify-between items-start mb-sm">
            <h3 className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wider">
              Lead Conversion
            </h3>
            <div className="bg-surface-container text-on-surface-variant p-1 rounded">
              <FilterX className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end gap-md">
            <div className="flex-1">
              <div className="font-headline-xl text-headline-xl text-on-surface mb-xs">
                {conversionPct.toFixed(1)}%
              </div>
              <div className="font-label-md text-label-md text-on-surface-variant">
                {data.convertedTotal}/{data.leadsTotal} leads converted
              </div>
              <div className="font-label-md text-label-md text-on-surface-variant mt-1">
                {data.benchmarkConversionPct > 0 ? (
                  <>
                    Benchmark{' '}
                    <span className="font-data-mono text-on-surface">
                      {data.benchmarkConversionPct.toFixed(1)}%
                    </span>
                    <span
                      className={cn(
                        'ml-1',
                        conversionPct >= data.benchmarkConversionPct
                          ? 'text-secondary'
                          : 'text-error',
                      )}
                    >
                      ({conversionPct >= data.benchmarkConversionPct ? '+' : ''}
                      {(conversionPct - data.benchmarkConversionPct).toFixed(1)} pts)
                    </span>
                    <span className="ml-1">vs. prior 30d</span>
                  </>
                ) : (
                  <span>No prior 30d benchmark yet</span>
                )}
              </div>
            </div>
            <div className="w-24 h-24 rounded-full border-4 border-surface-container flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {data.benchmarkConversionPct > 0 && (
                  <circle
                    className="text-on-surface-variant/40"
                    cx="50"
                    cy="50"
                    fill="none"
                    r="46"
                    stroke="currentColor"
                    strokeDasharray="2 3"
                    strokeDashoffset={
                      conversionDash -
                      (Math.min(data.benchmarkConversionPct, 100) / 100) * conversionDash
                    }
                    strokeWidth="2"
                  >
                    <title>Benchmark (prior 30d): {data.benchmarkConversionPct.toFixed(1)}%</title>
                  </circle>
                )}
                <circle
                  className="text-primary"
                  cx="50"
                  cy="50"
                  fill="none"
                  r="46"
                  stroke="currentColor"
                  strokeDasharray={conversionDash}
                  strokeDashoffset={conversionOffset}
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </svg>
              <span className="font-label-md text-label-md text-primary text-center">
                {data.leadsTotal === 0 ? 'No data' : `${conversionPct.toFixed(0)}%`}
              </span>
            </div>
          </div>
        </div>

        {/* Revenue trend (line) */}
        <div className="md:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <LineIcon className="w-5 h-5 text-primary" />
              Platform Revenue Trend
            </h3>
            <span className="font-label-md text-label-md text-on-surface-variant">
              Monthly platform fees
            </span>
          </div>
          {data.revenueTrend.some((d) => d.value > 0) ? (
            <RevenueLineChart data={data.revenueTrend} height={240} />
          ) : (
            <div className="h-60 flex items-center justify-center text-on-surface-variant font-body-sm text-body-sm">
              No revenue recorded in the selected window yet.
            </div>
          )}
        </div>

        {/* Top Creators */}
        <div className="md:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col">
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Top Creators
            </h3>
            <Link
              to="/admin/users"
              className="text-primary font-label-md text-label-md hover:underline"
            >
              View All
            </Link>
          </div>
          <div className="flex-1 flex flex-col gap-sm">
            {data.topCreators.length === 0 && (
              <div className="text-on-surface-variant font-body-sm text-body-sm py-6 text-center">
                No creator activity yet.
              </div>
            )}
            {data.topCreators.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-sm border border-outline-variant rounded bg-surface transition-colors hover:bg-surface-container-low"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {c.avatar_url ? (
                    <img
                      src={c.avatar_url}
                      alt={c.full_name}
                      className="w-10 h-10 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-tertiary-fixed flex items-center justify-center text-on-surface font-bold uppercase">
                      {(c.full_name || '?').charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface truncate">
                      {c.full_name}
                    </p>
                    <p className="font-label-md text-label-md text-on-surface-variant truncate">
                      {c.location}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="font-data-mono text-data-mono text-on-surface">{c.leads} leads</p>
                  <p className="font-label-md text-label-md text-secondary">
                    {c.campaigns_completed} campaigns
                  </p>
                  {c.roi !== null && c.allocatedBudget > 0 ? (
                    <p
                      className="font-label-md text-label-md text-on-surface-variant"
                      title={`Earned ${formatCurrency(c.earnings)} of ${formatCurrency(
                        c.allocatedBudget,
                      )} allocated`}
                    >
                      ROI {c.roi.toFixed(0)}%
                    </p>
                  ) : (
                    <p className="font-label-md text-label-md text-on-surface-variant">
                      ROI —
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top creator categories (bar) */}
        <div className="md:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Top Creator Categories
            </h3>
            <span className="font-label-md text-label-md text-on-surface-variant">
              By creators × leads
            </span>
          </div>
          <CategoriesBarChart data={data.categories} height={220} />
        </div>

        {/* Top regions (bar) */}
        <div className="md:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <MapPin className="w-5 h-5 text-tertiary" />
              Top Regions
            </h3>
            <span className="font-label-md text-label-md text-on-surface-variant">
              Campaigns × leads · creator hubs
            </span>
          </div>
          {data.topRegions.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-on-surface-variant font-body-sm text-body-sm">
              No regional activity in the selected range.
            </div>
          ) : (
            <CategoriesBarChart data={data.topRegions} height={220} />
          )}
        </div>

        {/* Monthly active users */}
        <div className="md:col-span-12 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <Activity className="w-5 h-5 text-secondary" />
              Monthly Active Users
            </h3>
            <span className="font-label-md text-label-md text-on-surface-variant">
              Creator + developer activity
            </span>
          </div>
          {data.mau.some((d) => d.value > 0) ? (
            <MauChart data={data.mau} height={200} />
          ) : (
            <div className="h-52 flex items-center justify-center text-on-surface-variant font-body-sm text-body-sm">
              No active users tracked in the last 6 months.
            </div>
          )}
        </div>

        {/* Footer link */}
        <div className="md:col-span-12 bg-surface-container-low border border-outline-variant rounded-xl p-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h3 className="font-label-lg text-label-lg text-on-surface uppercase tracking-wider">
              Need a deeper dive?
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Open the financial workbench for line-item revenue, payouts and dispute reporting.
            </p>
          </div>
          <Link
            to="/admin/financials"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded font-label-lg text-label-lg hover:bg-primary/90 transition-colors"
          >
            Open Financials
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default AdminAnalytics
