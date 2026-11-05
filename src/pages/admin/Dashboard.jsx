import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState } from '../../components/ui'
import { formatCurrency, formatRelativeTime } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import {
  ArrowRight, Download, Send, ChevronRight, 
  Wallet, Percent, Megaphone, ShieldCheck, Gavel, Activity,
  CheckCircle, TrendingUp,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const PRIORITY_STYLES = {
  high: 'bg-error-container text-on-error-container border-error/20',
  medium: 'bg-orange-100 text-orange-800 border-orange-200',
  low: 'bg-surface-container-highest text-on-surface border-outline-variant',
}

const ACTIVITY_DOTS = {
  info: 'bg-secondary-fixed-dim',
  alert: 'bg-error',
  success: 'bg-primary-container',
  neutral: 'bg-outline-variant',
}

const MetricCard = ({ label, value, hint, hintTone = 'positive', icon: Icon }) => (
  <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col relative overflow-hidden group">
    <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary-container/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out" />
    <div className="flex justify-between items-start mb-4 relative z-10">
      <span className="font-label-lg text-label-lg text-on-surface-variant">{label}</span>
      <Icon className="w-5 h-5 text-primary-container" />
    </div>
    <div className="relative z-10 mt-auto">
      <h2 className="font-headline-xl text-headline-xl text-on-surface">{value}</h2>
      {hint && (
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 flex items-center gap-1">
          {hintTone === 'positive' && <TrendingUp className="w-3.5 h-3.5 text-secondary" />}
          <span className={cn(hintTone === 'positive' ? 'text-secondary font-medium' : 'text-on-surface-variant')}>
            {hint}
          </span>
        </p>
      )}
    </div>
  </div>
)

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    totalRevenue: 0,
    platformFees: 0,
    activeCampaigns: 0,
    upcomingCampaigns: 0,
    verifiedCreators: 0,
    newCreatorsThisWeek: 0,
  })
  const [disputes, setDisputes] = useState([])
  const [verificationQueue, setVerificationQueue] = useState([])
  const [verificationCount, setVerificationCount] = useState(0)
  const [activity, setActivity] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        { data: campaigns },
        { data: profiles },
        { data: pending },
        { count: verifiedCount },
        { data: disputeRows },
        { data: recentUsers },
        { data: recentCampaigns },
      ] = await Promise.all([
        supabase.from('campaigns').select('total_budget, platform_fee, status, created_at'),
        supabase.from('profiles').select('id, full_name, role, created_at, is_verified'),
        supabase
          .from('profiles')
          .select('id, full_name, role, created_at, avatar_url')
          .eq('is_verified', false)
          .order('created_at', { ascending: false })
          .limit(4),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_verified', true),
        supabase
          .from('disputes')
          .select('id, title, status, dispute_type, created_at, reporter:profiles!reporter_id(full_name), reported:profiles!reported_party_id(full_name)')
          .in('status', ['open', 'under_review'])
          .order('created_at', { ascending: false })
          .limit(5)
          .then((res) => (res.error ? { data: [] } : res)),
        supabase.from('profiles').select('id, full_name, role, created_at').order('created_at', { ascending: false }).limit(2),
        supabase.from('campaigns').select('id, title, created_at').order('created_at', { ascending: false }).limit(2),
      ])

      const totalRevenue = campaigns?.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0) || 0
      const platformFees = campaigns?.reduce((s, c) => s + (parseFloat(c.platform_fee) || 0), 0) || 0
      const activeCampaigns = campaigns?.filter((c) => c.status === 'active').length || 0
      const upcoming = campaigns?.filter((c) => c.status === 'draft' || c.status === 'open').length || 0

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const newCreatorsThisWeek = profiles?.filter(
        (p) => p.role === 'creator' && new Date(p.created_at) >= sevenDaysAgo,
      ).length || 0

      setStats({
        totalRevenue,
        platformFees,
        activeCampaigns,
        upcomingCampaigns: upcoming,
        verifiedCreators: verifiedCount || 0,
        newCreatorsThisWeek,
      })

      setVerificationQueue(pending || [])
      const { count: pendingTotal } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_verified', false)
      setVerificationCount(pendingTotal || 0)

      setDisputes(disputeRows || [])

      const acts = []
      ;(recentUsers || []).forEach((u) =>
        acts.push({
          tone: 'info',
          when: u.created_at,
          message: (
            <>
              New {u.role} signup: <span className="font-medium">{u.full_name}</span>
            </>
          ),
        }),
      )
      ;(recentCampaigns || []).forEach((c) =>
        acts.push({
          tone: 'success',
          when: c.created_at,
          message: (
            <>
              Campaign launched: <span className="font-medium">{c.title}</span>
            </>
          ),
        }),
      )
      ;(disputeRows || []).slice(0, 1).forEach((d) =>
        acts.push({
          tone: 'alert',
          when: d.created_at,
          message: (
            <>
              Dispute opened: <span className="font-medium">{d.title}</span>
            </>
          ),
        }),
      )
      acts.sort((a, b) => new Date(b.when) - new Date(a.when))
      setActivity(acts.slice(0, 5))
    } catch (e) {
      console.error(e)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let code = ''
    for (let i = 0; i < 24; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
    return code
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (inviteSubmitting) return
    setInviteSubmitting(true)
    try {
      const code = generateInviteCode()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const { error: insertError } = await supabase.from('admin_invites').insert({
        invite_code: code,
        email_restriction: inviteEmail || null,
        expires_at: expiresAt.toISOString(),
      })
      if (insertError) throw insertError

      const link = `${window.location.origin}/admin/invite/${code}`
      try {
        await navigator.clipboard.writeText(link)
        toast.success('Invite link copied to clipboard')
      } catch {
        toast.success('Invite link generated')
      }
      setInviteEmail('')
    } catch (e) {
      console.error(e)
      toast.error('Failed to create invite')
    } finally {
      setInviteSubmitting(false)
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading platform overview..." />
      </div>
    )
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  return (
    <div className="space-y-margin">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Platform Overview</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Super Admin global performance and operations.
          </p>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        {/* Top metrics row */}
        <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
          <MetricCard
            label="Total Platform Revenue"
            value={formatCurrency(stats.totalRevenue)}
            hint="Lifetime campaign value"
            hintTone="neutral"
            icon={Wallet}
          />
          <MetricCard
            label="Commission Earned (25%)"
            value={formatCurrency(stats.platformFees)}
            hint="Across all campaigns"
            hintTone="neutral"
            icon={Percent}
          />
          <MetricCard
            label="Active Campaigns"
            value={stats.activeCampaigns.toLocaleString()}
            hint={`${stats.upcomingCampaigns} launching soon`}
            hintTone="neutral"
            icon={Megaphone}
          />
          <MetricCard
            label="Verified Creators"
            value={stats.verifiedCreators.toLocaleString()}
            hint={`+${stats.newCreatorsThisWeek} this week`}
            hintTone="positive"
            icon={ShieldCheck}
          />
        </div>

        {/* Middle: Disputes + Activity (8 cols) */}
        <div className="md:col-span-8 flex flex-col gap-gutter">
          {/* Active Disputes */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col">
            <div className="px-md py-4 border-b border-outline-variant flex justify-between items-center bg-surface/50">
              <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <Gavel className="w-5 h-5 text-error" />
                Active Disputes
              </h3>
              <span className="font-label-md text-label-md text-on-surface-variant">
                {disputes.length} open
              </span>
            </div>
            <div className="overflow-x-auto">
              {disputes.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                      <th className="py-3 px-md font-medium">ID</th>
                      <th className="py-3 px-md font-medium">Parties Involved</th>
                      <th className="py-3 px-md font-medium">Priority</th>
                      <th className="py-3 px-md font-medium">Status</th>
                      <th className="py-3 px-md text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
                    {disputes.map((d) => {
                      const priority = (d.status || 'open') === 'open' ? 'high' : 'medium'
                      return (
                        <tr key={d.id} className="hover:bg-surface transition-colors">
                          <td className="py-3 px-md font-data-mono text-data-mono text-on-surface-variant">
                            #{String(d.id).slice(0, 6)}
                          </td>
                          <td className="py-3 px-md">
                            <div className="flex flex-col">
                              <span className="font-medium text-on-surface">
                                {d.reporter?.full_name || 'Unknown'} vs. {d.reported?.full_name || 'Unknown'}
                              </span>
                              <span className="text-on-surface-variant text-xs">{d.title}</span>
                            </div>
                          </td>
                          <td className="py-3 px-md">
                            <span
                              className={cn(
                                'inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded capitalize',
                                PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium,
                              )}
                            >
                              {priority}
                            </span>
                          </td>
                          <td className="py-3 px-md">
                            <span className="text-on-surface-variant capitalize">
                              {(d.status || 'open').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-md text-right">
                            <span className="inline-flex items-center px-2 py-1 font-label-md text-label-md text-on-surface-variant bg-surface rounded">
                              Awaiting review
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-10 text-on-surface-variant">
                  <CheckCircle className="w-10 h-10 text-secondary mb-2" />
                  <p className="font-body-sm text-body-sm">No active disputes right now.</p>
                </div>
              )}
            </div>
          </div>

          {/* System Activity Log */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col flex-1">
            <div className="px-md py-4 border-b border-outline-variant flex justify-between items-center bg-surface/50">
              <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                System Activity Log
              </h3>
            </div>
            <div className="p-md flex-1">
              {activity.length > 0 ? (
                <div className="relative border-l border-outline-variant ml-3 space-y-6 pb-2">
                  {activity.map((a, i) => (
                    <div key={i} className="relative pl-6">
                      <span
                        className={cn(
                          'absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-surface-container-lowest',
                          ACTIVITY_DOTS[a.tone] || ACTIVITY_DOTS.neutral,
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface-variant">
                          {formatRelativeTime(a.when)}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface">{a.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-on-surface-variant font-body-sm text-body-sm text-center py-6">
                  No recent activity.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right rail: Verification Queue + Invite Admin (4 cols) */}
        <div className="md:col-span-4 flex flex-col gap-gutter">
          {/* Verification Queue */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col">
            <div className="px-md py-4 border-b border-outline-variant bg-surface/50 flex justify-between items-center">
              <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-secondary" />
                Verification Queue
              </h3>
              <span className="bg-secondary-fixed text-on-secondary-fixed text-xs font-bold px-2 py-1 rounded">
                {verificationCount} Pending
              </span>
            </div>
            <div className="p-0">
              <ul className="divide-y divide-outline-variant/60">
                {verificationQueue.length > 0 ? (
                  verificationQueue.map((u) => (
                    <li
                      key={u.id}
                      className="p-md hover:bg-surface transition-colors flex items-center justify-between"
                    >
                      <Link to="/admin/verification" className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface font-bold flex-shrink-0">
                          {(u.full_name || '?')
                            .split(' ')
                            .slice(0, 2)
                            .map((n) => n.charAt(0))
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-body-sm text-body-sm font-medium text-on-surface truncate">
                            {u.full_name || 'Unknown user'}
                          </p>
                          <p className="font-label-md text-label-md text-on-surface-variant capitalize">
                            {u.role} · awaiting verification
                          </p>
                        </div>
                      </Link>
                      <Link
                        to="/admin/verification"
                        className="text-on-surface-variant hover:text-primary transition-colors p-1"
                        aria-label="Review verification"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </li>
                  ))
                ) : (
                  <li className="p-md text-center text-on-surface-variant font-body-sm text-body-sm">
                    All caught up.
                  </li>
                )}
              </ul>
              <div className="p-3 border-t border-outline-variant text-center">
                <Link
                  to="/admin/verification"
                  className="text-primary font-label-md text-label-md hover:underline w-full block"
                >
                  Go to Verification Center
                </Link>
              </div>
            </div>
          </div>

          {/* Invite Admin */}
          <div className="bg-surface-container-highest border border-outline-variant rounded-xl p-md flex flex-col relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
              <ShieldCheck className="w-32 h-32" />
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-1 relative z-10">
              Invite New Admin
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-4 relative z-10">
              Grant platform access to a new team member. Link expires in 7 days.
            </p>
            <form className="space-y-3 relative z-10 mt-auto" onSubmit={handleInvite}>
              <label className="sr-only" htmlFor="invite-email">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="admin@airhouse.co.za (optional)"
                className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-sm text-body-sm text-on-surface transition-colors placeholder:text-on-surface-variant/70"
              />
              <button
                type="submit"
                disabled={inviteSubmitting}
                className="w-full bg-secondary-fixed-dim text-on-secondary-fixed hover:bg-secondary-fixed transition-colors font-label-lg text-label-lg py-2 px-4 rounded flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                {inviteSubmitting ? 'Generating…' : 'Send Invite'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Quick links to other admin areas */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-md">
        <h3 className="font-label-lg text-label-lg text-on-surface uppercase tracking-wider mb-3">
          Operations
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: '/admin/financials', label: 'Financials' },
            { to: '/admin/users', label: 'All Users' },
            { to: '/admin/campaigns', label: 'All Campaigns' },
            { to: '/admin/payments', label: 'Payments' },
          ].map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="flex items-center justify-between p-3 bg-surface-container-lowest border border-outline-variant rounded-lg hover:border-primary/50 hover:shadow-sm transition-all group"
            >
              <span className="font-label-lg text-label-lg text-on-surface">{q.label}</span>
              <ArrowRight className="w-4 h-4 text-on-surface-variant group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
