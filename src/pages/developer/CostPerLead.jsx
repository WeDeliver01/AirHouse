import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader, Button, Card, MetricCard, Chip, Modal, Input, Textarea,
  Select, Icon, EmptyState, Skeleton,
} from '../../components/stitch'
import { formatCurrency, cn } from '../../lib/utils'

const CostPerLead = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [leads, setLeads] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [selectedCampaign, setSelectedCampaign] = useState('all')
  const [period, setPeriod] = useState('30')
  const [stats, setStats] = useState({})
  const [feedbackModal, setFeedbackModal] = useState({ open: false, lead: null })
  const [feedback, setFeedback] = useState({ rating: 0, text: '', saleAmount: '' })

  useEffect(() => {
    if (user?.id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedCampaign, period])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select('id, title, property_name, total_budget, status')
        .eq('developer_id', user.id)
      setCampaigns(campaignsData || [])

      const campaignIds = selectedCampaign === 'all'
        ? (campaignsData?.map((c) => c.id) || [])
        : [selectedCampaign]

      if (campaignIds.length === 0) {
        setLeads([])
        setStats({})
        setLoading(false)
        return
      }

      const { data: leadsData } = await supabase
        .from('leads')
        .select(`
          *,
          campaigns!inner(title, property_name, total_budget),
          creator_profiles(id, user_id, profiles:user_id(full_name, avatar_url))
        `)
        .in('campaign_id', campaignIds)
        .order('created_at', { ascending: false })

      const fetched = leadsData || []
      setLeads(fetched)

      const totalBudget = selectedCampaign === 'all'
        ? campaignsData?.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0) || 0
        : parseFloat(campaignsData?.find((c) => c.id === selectedCampaign)?.total_budget || 0)

      const totalLeads = fetched.length
      const convertedLeads = fetched.filter((l) => l.pipeline_stage === 'converted').length
      const totalRevenue = fetched.reduce((s, l) => s + (parseFloat(l.sale_amount) || 0), 0)

      setStats({
        totalLeads,
        convertedLeads,
        conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0,
        totalBudget,
        totalRevenue,
        costPerLead: totalLeads > 0 ? totalBudget / totalLeads : 0,
        costPerConversion: convertedLeads > 0 ? totalBudget / convertedLeads : 0,
        roi: totalBudget > 0 ? ((totalRevenue - totalBudget) / totalBudget) * 100 : 0,
        avgLeadValue: convertedLeads > 0 ? totalRevenue / convertedLeads : 0,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load cost per lead data')
    } finally {
      setLoading(false)
    }
  }

  const submitFeedback = async () => {
    if (!feedbackModal.lead) return
    try {
      const updates = {
        feedback_rating: feedback.rating,
        developer_feedback: feedback.text,
        sale_amount: feedback.saleAmount ? parseFloat(feedback.saleAmount) : null,
        pipeline_stage: feedback.saleAmount ? 'converted' : feedbackModal.lead.pipeline_stage,
        converted_at: feedback.saleAmount ? new Date().toISOString() : null,
      }
      await supabase.from('leads').update(updates).eq('id', feedbackModal.lead.id)
      setFeedbackModal({ open: false, lead: null })
      setFeedback({ rating: 0, text: '', saleAmount: '' })
      fetchData()
    } catch (e) {
      console.error(e)
    }
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
          title="Couldn't load analytics"
          description={error}
          action={<Button onClick={fetchData}>Retry</Button>}
        />
      </Card>
    )
  }

  const hasLeads = (stats.totalLeads || 0) > 0
  const cplEfficient = hasLeads && stats.costPerLead < 500
  const roiPositive = (stats.roi || 0) >= 0

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Analytics"
        title="Cost Per Lead"
        description="Track real costs and ROI for each lead."
        actions={(
          <Button variant="ghost" icon="download">Export</Button>
        )}
      />

      {/* Filters */}
      <Card className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Select
          label="Campaign"
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
        >
          <option value="all">All Campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.title || c.property_name}</option>
          ))}
        </Select>
        <Select
          label="Period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <MetricCard
          icon="payments"
          label="Cost Per Lead"
          value={<span className="font-data-mono">{formatCurrency(stats.costPerLead || 0)}</span>}
          trend={hasLeads ? (cplEfficient ? 'Efficient' : 'High') : undefined}
          trendDirection={hasLeads ? (cplEfficient ? 'positive' : 'negative') : undefined}
          helper={!hasLeads ? 'No leads yet' : undefined}
        />
        <MetricCard
          icon="adjust"
          label="Cost Per Conversion"
          value={<span className="font-data-mono">{formatCurrency(stats.costPerConversion || 0)}</span>}
          helper={`${stats.convertedLeads || 0} conversions`}
        />
        <MetricCard
          icon="trending_up"
          label="Total Revenue"
          value={<span className="font-data-mono">{formatCurrency(stats.totalRevenue || 0)}</span>}
          helper={`Avg ${formatCurrency(stats.avgLeadValue || 0)} per sale`}
        />
        <MetricCard
          icon={roiPositive ? 'north_east' : 'south_east'}
          label="ROI"
          value={(
            <span className={cn('font-data-mono', roiPositive ? 'text-secondary' : 'text-error')}>
              {roiPositive ? '+' : ''}{(stats.roi || 0).toFixed(1)}%
            </span>
          )}
          helper={`Budget: ${formatCurrency(stats.totalBudget || 0)}`}
          trend={roiPositive ? 'Profitable' : 'At a loss'}
          trendDirection={roiPositive ? 'positive' : 'negative'}
        />
      </div>

      {/* Lead Details */}
      <Card className="flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-on-surface">Lead Details</h3>
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            {leads.length} leads
          </span>
        </div>

        {leads.length === 0 ? (
          <EmptyState
            icon="payments"
            title="No leads found"
            description="Leads will appear here once your campaigns start generating them."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Lead</th>
                  <th className="text-left py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Campaign</th>
                  <th className="text-left py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Creator</th>
                  <th className="text-center py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Status</th>
                  <th className="text-right py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Cost</th>
                  <th className="text-right py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Sale Amount</th>
                  <th className="text-center py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Feedback</th>
                  <th className="text-right py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                    <td className="py-sm">
                      <p className="font-label-lg text-label-lg text-on-surface">{lead.lead_name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{lead.lead_email}</p>
                    </td>
                    <td className="py-sm font-body-md text-body-md text-on-surface-variant">
                      {lead.campaigns?.title || lead.campaigns?.property_name}
                    </td>
                    <td className="py-sm font-body-md text-body-md text-on-surface">
                      {lead.creator_profiles?.profiles?.full_name || '—'}
                    </td>
                    <td className="py-sm text-center">
                      <Chip tone={lead.pipeline_stage === 'converted' ? 'success' : 'neutral'}>
                        {lead.pipeline_stage || lead.status}
                      </Chip>
                    </td>
                    <td className="py-sm text-right font-data-mono text-body-md text-on-surface">
                      {lead.cost_per_lead ? formatCurrency(lead.cost_per_lead) : '—'}
                    </td>
                    <td className="py-sm text-right font-data-mono text-body-md text-secondary">
                      {lead.sale_amount ? formatCurrency(lead.sale_amount) : '—'}
                    </td>
                    <td className="py-sm text-center">
                      {lead.feedback_rating ? (
                        <div className="inline-flex items-center justify-center gap-xs">
                          {[...Array(5)].map((_, i) => (
                            <Icon
                              key={i}
                              name={i < lead.feedback_rating ? 'star' : 'star_border'}
                              size={14}
                              className={i < lead.feedback_rating ? 'text-tertiary' : 'text-on-surface-variant'}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="py-sm text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="chat"
                        onClick={() => {
                          setFeedbackModal({ open: true, lead })
                          setFeedback({
                            rating: lead.feedback_rating || 0,
                            text: lead.developer_feedback || '',
                            saleAmount: lead.sale_amount || '',
                          })
                        }}
                      >
                        Feedback
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Feedback Modal */}
      <Modal
        isOpen={feedbackModal.open}
        onClose={() => setFeedbackModal({ open: false, lead: null })}
        title="Lead Feedback"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setFeedbackModal({ open: false, lead: null })}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitFeedback}>Save Feedback</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-md">
          <div>
            <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
              Lead Quality Rating
            </label>
            <div className="flex gap-xs">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFeedback((f) => ({ ...f, rating: n }))}
                  className="hover:scale-110 transition-transform"
                  aria-label={`Rate ${n} stars`}
                >
                  <Icon
                    name={n <= feedback.rating ? 'star' : 'star_border'}
                    size={32}
                    className={n <= feedback.rating ? 'text-tertiary' : 'text-on-surface-variant'}
                  />
                </button>
              ))}
            </div>
          </div>
          <Input
            label="Sale Amount (if converted)"
            type="number"
            placeholder="Enter sale amount"
            value={feedback.saleAmount}
            onChange={(e) => setFeedback((f) => ({ ...f, saleAmount: e.target.value }))}
          />
          <Textarea
            label="Feedback Notes"
            placeholder="Add notes about this lead…"
            value={feedback.text}
            onChange={(e) => setFeedback((f) => ({ ...f, text: e.target.value }))}
            rows={3}
          />
        </div>
      </Modal>
    </div>
  )
}

export default CostPerLead
