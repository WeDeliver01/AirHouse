import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import {
  PageHeader, Button, MetricCard, Card, Chip, Icon, EmptyState, Skeleton,
} from '../../components/stitch'

const daysBetween = (a, b) => {
  if (!a || !b) return null
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

const deadlineTone = (days) => {
  if (days === null || days === undefined) return 'neutral'
  if (days <= 3) return 'danger'
  if (days <= 7) return 'warning'
  return 'success'
}

const DeveloperAssignments = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pendingApps, setPendingApps] = useState([])
  const [activeAssignments, setActiveAssignments] = useState([])
  const [history, setHistory] = useState([])

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
        .select('id, title, property_name, property_location, end_date, creator_budget, status')
        .eq('developer_id', user.id)
      const campaignIds = campaignsData?.map((c) => c.id) || []
      if (campaignIds.length === 0) {
        setPendingApps([])
        setActiveAssignments([])
        setHistory([])
        return
      }

      const { data: appsData } = await supabase
        .from('campaign_applications')
        .select(`
          id, status, applied_at, pitch_message,
          campaign:campaigns(id, title, property_name, property_location, creator_budget),
          creator:creator_profiles(id, profiles:profiles(full_name, avatar_url))
        `)
        .in('campaign_id', campaignIds)
        .eq('status', 'pending')
        .order('applied_at', { ascending: false })
      setPendingApps(appsData || [])

      const { data: assignsData } = await supabase
        .from('campaign_assignments')
        .select(`
          id, agreed_budget, agreed_deliverables, assigned_at, is_completed,
          completed_at, leads_generated, amount_paid,
          campaign:campaigns(id, title, property_name, property_location, end_date, status),
          creator:creator_profiles(id, profiles:profiles(full_name, avatar_url))
        `)
        .in('campaign_id', campaignIds)
        .order('assigned_at', { ascending: false })

      const active = (assignsData || []).filter((a) => !a.is_completed)
      const done = (assignsData || []).filter((a) => a.is_completed)
      setActiveAssignments(active)
      setHistory(done)
    } catch (e) {
      console.error(e)
      setError('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  const totalActive = pendingApps.length + activeAssignments.length
  const upcoming = activeAssignments.filter((a) => {
    const days = daysBetween(new Date(), a.campaign?.end_date)
    return days !== null && days <= 7
  }).length

  if (loading) {
    return (
      <div className="flex flex-col gap-md">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-2 gap-md">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
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
          title="Couldn't load assignments"
          description={error}
          action={<Button onClick={fetchData}>Retry</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Workflow"
        title="Creator Assignments"
        description="Manage applications, active campaigns, and submission history."
        actions={(
          <>
            <Link to="/developer/creators">
              <Button variant="ghost" icon="group_search">Find Creators</Button>
            </Link>
            <Link to="/developer/campaigns/new">
              <Button variant="primary" icon="add">New Campaign</Button>
            </Link>
          </>
        )}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
        <MetricCard
          icon="mail"
          label="Pending Applications"
          value={<span className="font-data-mono">{pendingApps.length}</span>}
          helper="Awaiting your review"
        />
        <MetricCard
          icon="campaign"
          label="Active Assignments"
          value={<span className="font-data-mono">{activeAssignments.length}</span>}
          helper={`${totalActive} workflows total`}
        />
        <MetricCard
          icon="schedule"
          label="Upcoming Deadlines"
          value={<span className="font-data-mono">{upcoming}</span>}
          helper="Within 7 days"
          trendDirection={upcoming > 0 ? 'negative' : 'neutral'}
          trend={upcoming > 0 ? 'attention' : 'on track'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* Pending applications */}
        <div className="lg:col-span-4 flex flex-col gap-sm">
          <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-xs">
            <Icon name="mail" size={20} className="text-primary" />
            Pending Applications
          </h3>
          {pendingApps.length === 0 ? (
            <Card>
              <EmptyState
                icon="inbox"
                title="No pending applications"
                description="When creators apply you'll see them here."
              />
            </Card>
          ) : (
            pendingApps.map((app) => (
              <div
                key={app.id}
                className="bg-surface border border-outline-variant rounded p-md flex flex-col gap-sm relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-primary-container" />
                <div className="flex justify-between items-start gap-sm">
                  <div className="min-w-0">
                    <h4 className="font-label-lg text-label-lg text-on-surface truncate">
                      {app.campaign?.title || app.campaign?.property_name}
                    </h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      {app.creator?.profiles?.full_name || 'Creator'}
                    </p>
                  </div>
                  <Chip tone="primary">New</Chip>
                </div>
                <div className="flex items-end justify-between mt-xs">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Budget</p>
                    <p className="font-data-mono text-on-surface">{formatCurrency(app.campaign?.creator_budget || 0)}</p>
                  </div>
                  <Link to={`/developer/campaigns/${app.campaign?.id}/applications`}>
                    <Button size="sm">Review</Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Active assignments */}
        <div className="lg:col-span-8 flex flex-col gap-sm">
          <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-xs">
            <Icon name="campaign" size={20} className="text-primary" />
            Active Assignments
          </h3>
          {activeAssignments.length === 0 ? (
            <Card>
              <EmptyState
                icon="campaign"
                title="No active assignments"
                description="Once you assign a creator, the workflow appears here."
              />
            </Card>
          ) : (
            activeAssignments.map((a) => {
              const deadline = a.campaign?.end_date
              const days = deadline ? daysBetween(new Date(), deadline) : null
              const tone = deadlineTone(days)
              return (
                <Link key={a.id} to={`/developer/assignments/${a.id}`} className="block">
                  <Card className="flex flex-col gap-sm hover:border-primary transition-colors">
                    <div className="flex items-center justify-between gap-sm pb-sm border-b border-outline-variant">
                      <div className="flex items-center gap-sm min-w-0">
                        <div className="w-12 h-12 rounded bg-surface-container-high text-primary inline-flex items-center justify-center">
                          <Icon name="apartment" size={24} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-headline-md text-headline-md text-on-surface truncate">
                            {a.campaign?.title || a.campaign?.property_name}
                          </h4>
                          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                            {a.creator?.profiles?.full_name || 'Creator'} • {a.campaign?.property_location || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {deadline && (
                          <>
                            <p className={cn(
                              'font-label-md text-label-md uppercase tracking-wider',
                              tone === 'danger' ? 'text-error' : tone === 'warning' ? 'text-on-error-container' : 'text-on-surface-variant',
                            )}>
                              Deadline {formatDate(deadline)}
                            </p>
                            <p className="font-data-mono text-on-surface">
                              {days !== null && days >= 0 ? `${days} days left` : 'Overdue'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-sm">
                      <div className="col-span-2">
                        <div className="flex justify-between font-label-md text-label-md text-on-surface-variant mb-xs">
                          <span>Leads generated</span>
                          <span className="font-data-mono text-on-surface">{a.leads_generated || 0}</span>
                        </div>
                        <div className="w-full bg-surface-variant rounded-full h-2">
                          <div
                            className="bg-primary-container h-2 rounded-full"
                            style={{
                              width: `${Math.min(((a.leads_generated || 0) / 50) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Budget</p>
                        <p className="font-data-mono text-on-surface">{formatCurrency(a.agreed_budget || 0)}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              )
            })
          )}
        </div>

        {/* Submission history */}
        <div className="lg:col-span-12 flex flex-col gap-sm">
          <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-xs">
            <Icon name="history" size={20} className="text-primary" />
            Submission History
          </h3>
          <Card padding="none" className="overflow-hidden">
            {history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      {['Campaign', 'Creator', 'Completed', 'Leads', 'Paid'].map((h, i) => (
                        <th key={h}
                          className={cn(
                            'p-sm font-label-md text-label-md text-on-surface-variant uppercase tracking-wider',
                            i >= 2 ? 'text-right' : 'text-left',
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((a) => (
                      <tr key={a.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low transition-colors">
                        <td className="p-sm font-label-lg text-label-lg text-on-surface">
                          <Link to={`/developer/assignments/${a.id}`} className="hover:underline">
                            {a.campaign?.title || a.campaign?.property_name}
                          </Link>
                        </td>
                        <td className="p-sm text-on-surface-variant">
                          {a.creator?.profiles?.full_name || 'Creator'}
                        </td>
                        <td className="p-sm text-right font-data-mono text-on-surface-variant">
                          {a.completed_at ? formatDate(a.completed_at) : '—'}
                        </td>
                        <td className="p-sm text-right font-data-mono text-on-surface">
                          {a.leads_generated || 0}
                        </td>
                        <td className="p-sm text-right font-data-mono text-secondary">
                          {formatCurrency(a.amount_paid || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="history"
                title="No completed work yet"
                description="Completed assignments appear here once creators wrap up."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DeveloperAssignments
