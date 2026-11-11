import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { cn } from '../../lib/utils'
import { CalendarRange, Users, Activity, LogIn, UserPlus, MousePointerClick, Route as RouteIcon } from 'lucide-react'

const RANGES = [
  { key: '7d', label: 'Last 7 Days', days: 7 },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: '90d', label: 'Last 90 Days', days: 90 },
]

const RankedBars = ({ data, height = 220, max }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-on-surface-variant font-body-sm text-body-sm" style={{ height }}>
        No activity in this range yet.
      </div>
    )
  }
  const localMax = max || Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-3" style={{ minHeight: height }}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="font-label-md text-label-md text-on-surface w-48 truncate" title={d.label}>{d.label}</span>
          <div className="flex-1 h-5 bg-surface-container-highest rounded overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-primary-container rounded transition-all duration-500" style={{ width: `${(d.value / localMax) * 100}%` }} />
          </div>
          <span className="font-data-mono text-data-mono text-on-surface w-14 text-right">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

const DailyBars = ({ data, height = 180 }) => {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="flex items-end justify-between gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.label}: ${d.value}`}>
            <div className="w-full bg-gradient-to-t from-secondary-fixed-dim to-secondary rounded-t transition-all duration-500" style={{ height: `${(d.value / max) * 100}%`, minHeight: 2 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 font-label-md text-label-md text-on-surface-variant">
        {data.map((d, i) => (i % Math.ceil(data.length / 8) === 0 ? <span key={i}>{d.label}</span> : <span key={i} />))}
      </div>
    </div>
  )
}

const MetricCard = ({ label, value, icon: Icon }) => (
  <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col justify-between">
    <div className="flex justify-between items-start mb-sm">
      <h3 className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wider">{label}</h3>
      <div className="bg-primary-container/20 text-on-primary-container p-1 rounded"><Icon className="w-5 h-5" /></div>
    </div>
    <div className="font-headline-xl text-headline-xl text-on-surface">{value}</div>
  </div>
)

const EVENT_LIMIT = 10000

const AdminTraffic = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [range, setRange] = useState('30d')
  const [events, setEvents] = useState([])

  const selectedRange = RANGES.find((r) => r.key === range) || RANGES[1]

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const since = new Date(Date.now() - selectedRange.days * 24 * 60 * 60 * 1000).toISOString()
      const { data, error: err } = await supabase
        .from('site_events')
        .select('session_id, visitor_id, event_type, path, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(EVENT_LIMIT)
      if (err) throw err
      setEvents(data || [])
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Failed to load traffic data')
    } finally {
      setLoading(false)
    }
  }, [selectedRange.days])

  useEffect(() => { fetchData() }, [fetchData])

  const stats = useMemo(() => {
    const pageviews = events.filter((e) => e.event_type === 'pageview')
    const logins = events.filter((e) => e.event_type === 'login')
    const signups = events.filter((e) => e.event_type === 'signup')
    const outbound = events.filter((e) => e.event_type === 'outbound_click')

    const sessions = new Set(events.map((e) => e.session_id))
    const visitors = new Set(events.map((e) => e.visitor_id))

    // Top pages visited.
    const pathCounts = new Map()
    pageviews.forEach((e) => {
      const key = e.path || '(unknown)'
      pathCounts.set(key, (pathCounts.get(key) || 0) + 1)
    })
    const topPaths = Array.from(pathCounts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    // "Where people get stuck" — the last page a session visited before
    // going quiet. A session that exits heavily on one path is a place
    // visitors are dropping off, not converting onward.
    const lastPathBySession = new Map()
    pageviews.forEach((e) => {
      const existing = lastPathBySession.get(e.session_id)
      if (!existing || e.created_at > existing.created_at) {
        lastPathBySession.set(e.session_id, { path: e.path || '(unknown)', created_at: e.created_at })
      }
    })
    const exitCounts = new Map()
    lastPathBySession.forEach(({ path }) => {
      exitCounts.set(path, (exitCounts.get(path) || 0) + 1)
    })
    const topExitPaths = Array.from(exitCounts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    // Sessions per day.
    const dayBuckets = new Map()
    const dayKey = (iso) => iso.slice(0, 10)
    const sessionsSeenPerDay = new Map()
    events.forEach((e) => {
      const d = dayKey(e.created_at)
      if (!sessionsSeenPerDay.has(d)) sessionsSeenPerDay.set(d, new Set())
      sessionsSeenPerDay.get(d).add(e.session_id)
    })
    Array.from(sessionsSeenPerDay.keys()).sort().forEach((d) => {
      dayBuckets.set(d, sessionsSeenPerDay.get(d).size)
    })
    const dailySessions = Array.from(dayBuckets.entries()).map(([label, value]) => ({
      label: label.slice(5), // MM-DD
      value,
    }))

    return {
      totalPageviews: pageviews.length,
      totalSessions: sessions.size,
      totalVisitors: visitors.size,
      totalLogins: logins.length,
      totalSignups: signups.length,
      totalOutbound: outbound.length,
      topPaths,
      topExitPaths,
      dailySessions,
    }
  }, [events])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading site traffic…" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  return (
    <div className="space-y-md">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-margin border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Site Traffic</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            Every visitor to the platform — sessions, logins, where they go, and where they stop.
          </p>
        </div>
        <div className="flex items-center bg-secondary-container text-on-secondary-fixed border border-secondary-container rounded font-label-lg text-label-lg overflow-hidden">
          <span className="px-3 py-2 flex items-center gap-2"><CalendarRange className="w-4 h-4" /></span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn('px-3 py-2 transition-colors', range === r.key ? 'bg-secondary-fixed-dim text-on-secondary-fixed' : 'hover:bg-secondary-fixed/40')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-md">
        <div className="md:col-span-3"><MetricCard label="Sessions" value={stats.totalSessions} icon={Activity} /></div>
        <div className="md:col-span-3"><MetricCard label="Unique Visitors" value={stats.totalVisitors} icon={Users} /></div>
        <div className="md:col-span-3"><MetricCard label="Page Views" value={stats.totalPageviews} icon={RouteIcon} /></div>
        <div className="md:col-span-3"><MetricCard label="Outbound Clicks" value={stats.totalOutbound} icon={MousePointerClick} /></div>
        <div className="md:col-span-6"><MetricCard label="Logins" value={stats.totalLogins} icon={LogIn} /></div>
        <div className="md:col-span-6"><MetricCard label="Sign Ups" value={stats.totalSignups} icon={UserPlus} /></div>

        <div className="md:col-span-12 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-md flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Sessions Over Time
          </h3>
          <DailyBars data={stats.dailySessions} height={180} />
        </div>

        <div className="md:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Most Visited Pages</h3>
          <RankedBars data={stats.topPaths} height={240} />
        </div>

        <div className="md:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Where Visitors Drop Off</h3>
          <p className="font-label-md text-label-md text-on-surface-variant mb-sm">
            The last page seen in a session — a heavy cluster here is a page people get stuck on or leave from.
          </p>
          <RankedBars data={stats.topExitPaths} height={240} />
        </div>
      </div>
    </div>
  )
}

export default AdminTraffic
