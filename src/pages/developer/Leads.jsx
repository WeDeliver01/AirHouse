import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatRelativeTime, formatDate, cn } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import {
  PageHeader, Button, MetricCard, Card, Chip, Icon, EmptyState, Skeleton,
  Modal, Input, Select,
} from '../../components/stitch'

// Stitch design uses 5 columns: new, contacted, qualified, converted, lost.
// DB also has 'negotiating'. We render 5 columns and visually group any
// existing 'negotiating' rows into the Qualified column. Drag-drop writes
// the canonical 5-column stage value, preserving data integrity.
const VISIBLE_STAGES = [
  { id: 'new',        label: 'New',        tone: 'primary',   accent: 'bg-primary-container/30' },
  { id: 'contacted',  label: 'Contacted',  tone: 'tertiary',  accent: 'bg-tertiary-fixed' },
  { id: 'qualified',  label: 'Qualified',  tone: 'secondary', accent: 'bg-secondary-container' },
  { id: 'converted',  label: 'Converted',  tone: 'success',   accent: 'bg-secondary-fixed' },
  { id: 'lost',       label: 'Lost',       tone: 'danger',    accent: 'bg-error-container' },
]

const STAGE_TONE = {
  new: 'primary', contacted: 'tertiary', qualified: 'secondary',
  negotiating: 'secondary', converted: 'success', lost: 'danger',
}

const visibleStageFor = (stage) => (stage === 'negotiating' ? 'qualified' : stage)

const DeveloperLeads = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState({ total: 0, new: 0, converted: 0, conversionRate: 0 })
  const [filter, setFilter] = useState({ stage: '', campaign: '', search: '' })
  const [campaigns, setCampaigns] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

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
        .select('id, title, property_name')
        .eq('developer_id', user.id)
      setCampaigns(campaignsData || [])

      const campaignIds = campaignsData?.map((c) => c.id) || []
      if (campaignIds.length === 0) {
        setLeads([])
        setLoading(false)
        return
      }

      const { data: leadsData } = await supabase
        .from('leads')
        .select(
          `*, campaign:campaigns(id, title, property_name), creator:creator_profiles(id, user:profiles(full_name))`,
        )
        .in('campaign_id', campaignIds)
        .order('created_at', { ascending: false })

      setLeads(leadsData || [])
      const total = leadsData?.length || 0
      const newLeads = leadsData?.filter((l) => l.pipeline_stage === 'new').length || 0
      const converted = leadsData?.filter((l) => l.pipeline_stage === 'converted').length || 0
      setStats({
        total, new: newLeads, converted,
        conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
      })
    } catch (e) {
      console.error(e)
      setError('Failed to load leads')
      toast.error('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }

  // Visual-only update with optimistic state — no analytics math touched.
  const updateLeadStage = async (leadId, newStage) => {
    const previous = leads
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: newStage } : l)),
    )
    try {
      const { error: rpcError } = await supabase
        .from('leads')
        .update({ pipeline_stage: newStage, updated_at: new Date().toISOString() })
        .eq('id', leadId)
      if (rpcError) throw rpcError
      toast.success(`Moved to ${newStage}`)
    } catch (e) {
      // RLS rejection or other failure — roll back
      setLeads(previous)
      toast.error(e.message?.includes('row-level security')
        ? 'Not allowed to move that lead.'
        : 'Failed to update lead')
    }
  }

  const filteredLeads = leads.filter((l) => {
    if (filter.stage && visibleStageFor(l.pipeline_stage) !== filter.stage) return false
    if (filter.campaign && l.campaign_id !== filter.campaign) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      if (!l.lead_name?.toLowerCase().includes(q) && !l.lead_email?.toLowerCase().includes(q)) {
        return false
      }
    }
    return true
  })

  const leadsByStage = VISIBLE_STAGES.reduce((acc, s) => {
    acc[s.id] = filteredLeads.filter((l) => visibleStageFor(l.pipeline_stage) === s.id)
    return acc
  }, {})

  const onDragStart = (e, leadId) => {
    setDraggedId(leadId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leadId)
  }
  const onDragEnd = () => {
    setDraggedId(null)
    setDragOverStage(null)
  }
  const onDragOver = (e, stageId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStage !== stageId) setDragOverStage(stageId)
  }
  const onDragLeave = (e, stageId) => {
    if (e.currentTarget === e.target && dragOverStage === stageId) setDragOverStage(null)
  }
  const onDrop = (e, stageId) => {
    e.preventDefault()
    setDragOverStage(null)
    const id = e.dataTransfer.getData('text/plain') || draggedId
    if (!id) return
    const lead = leads.find((l) => l.id === id)
    if (!lead) return
    const currentVisible = visibleStageFor(lead.pipeline_stage)
    if (currentVisible === stageId) return
    updateLeadStage(id, stageId)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-md">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-md">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72" />)}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <Card>
        <EmptyState
          icon="error"
          title="Couldn't load leads"
          description={error}
          action={<Button onClick={fetchData}>Retry</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Pipeline"
        title="Sales Pipeline"
        description="Drag leads between columns to update their stage. Stage changes obey row-level access."
        actions={(
          <Select
            value=""
            onChange={() => {}}
            className="min-w-[160px]"
            options={[
              { value: '', label: 'Last 30 Days' },
              { value: '7', label: 'Last 7 Days' },
              { value: 'all', label: 'All Time' },
            ]}
          />
        )}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        <MetricCard icon="trending_up" label="Total Leads"
          value={<span className="font-data-mono">{stats.total}</span>} />
        <MetricCard icon="schedule" label="New"
          value={<span className="font-data-mono">{stats.new}</span>}
          helper="Awaiting first contact" />
        <MetricCard icon="task_alt" label="Converted"
          value={<span className="font-data-mono">{stats.converted}</span>}
          trendDirection="positive" />
        <MetricCard icon="percent" label="Conversion Rate"
          value={<span className="font-data-mono">{stats.conversionRate}%</span>}
          helper={`${stats.converted} of ${stats.total}`} />
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col md:flex-row gap-sm items-stretch md:items-end">
          <div className="flex-1">
            <Input
              label="Search"
              placeholder="Search by lead name or email…"
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <div className="md:w-56">
            <Select
              label="Campaign"
              value={filter.campaign}
              onChange={(e) => setFilter((f) => ({ ...f, campaign: e.target.value }))}
            >
              <option value="">All Campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.title || c.property_name}</option>
              ))}
            </Select>
          </div>
          <div className="md:w-44">
            <Select
              label="Stage"
              value={filter.stage}
              onChange={(e) => setFilter((f) => ({ ...f, stage: e.target.value }))}
            >
              <option value="">All Stages</option>
              {VISIBLE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {/* Pipeline */}
      <div className="overflow-x-auto pb-md -mx-md px-md">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-sm min-w-[680px] lg:min-w-0">
          {VISIBLE_STAGES.map((stage) => {
            const items = leadsByStage[stage.id] || []
            const isOver = dragOverStage === stage.id
            return (
              <div
                key={stage.id}
                onDragOver={(e) => onDragOver(e, stage.id)}
                onDragLeave={(e) => onDragLeave(e, stage.id)}
                onDrop={(e) => onDrop(e, stage.id)}
                className={cn(
                  'bg-surface border rounded flex flex-col transition-colors',
                  isOver ? 'border-primary bg-primary-container/10' : 'border-outline-variant',
                )}
              >
                <div className={cn('px-sm py-sm border-b border-outline-variant flex items-center justify-between', stage.accent)}>
                  <span className="font-label-lg text-label-lg text-on-surface uppercase tracking-wider">{stage.label}</span>
                  <span className="font-data-mono font-label-md text-label-md text-on-surface bg-surface-container-lowest px-xs rounded">
                    {items.length}
                  </span>
                </div>
                <div className="p-sm flex flex-col gap-sm min-h-[120px] max-h-[560px] overflow-y-auto">
                  {items.length === 0 && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant text-center py-md">
                      Drop leads here
                    </p>
                  )}
                  {items.map((lead) => (
                    <article
                      key={lead.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, lead.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => { setSelectedLead(lead); setShowDetailModal(true) }}
                      className={cn(
                        'bg-surface-container-lowest border border-outline-variant rounded p-sm cursor-grab active:cursor-grabbing hover:border-primary transition-colors',
                        draggedId === lead.id && 'opacity-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-xs mb-xs">
                        <p className="font-label-lg text-label-lg text-on-surface truncate">
                          {lead.lead_name}
                        </p>
                        <Icon name="drag_indicator" size={16} className="text-on-surface-variant flex-shrink-0" />
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {lead.lead_email}
                      </p>
                      <div className="flex items-center justify-between mt-sm">
                        <span className="font-label-md text-label-md text-on-surface-variant font-data-mono">
                          {formatRelativeTime(lead.created_at)}
                        </span>
                        {lead.pipeline_stage === 'negotiating' && (
                          <Chip tone="tertiary">negotiating</Chip>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Lead Details"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setShowDetailModal(false)}>Close</Button>
            {selectedLead && (
              <a href={`mailto:${selectedLead.lead_email}`}>
                <Button icon="mail">Send Email</Button>
              </a>
            )}
          </>
        )}
      >
        {selectedLead && (
          <div className="flex flex-col gap-md">
            <div className="flex items-start gap-md">
              <div className="w-16 h-16 rounded bg-primary-container/30 text-primary inline-flex items-center justify-center font-headline-md">
                {selectedLead.lead_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-headline-md text-headline-md text-on-surface truncate">
                  {selectedLead.lead_name}
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant truncate">
                  {selectedLead.campaign?.title || 'Direct lead'}
                </p>
                <div className="flex flex-wrap gap-sm mt-sm">
                  <a href={`mailto:${selectedLead.lead_email}`}
                    className="inline-flex items-center gap-xs font-label-md text-label-md text-primary hover:underline">
                    <Icon name="mail" size={14} />{selectedLead.lead_email}
                  </a>
                  {selectedLead.lead_phone && (
                    <a href={`tel:${selectedLead.lead_phone}`}
                      className="inline-flex items-center gap-xs font-label-md text-label-md text-primary hover:underline">
                      <Icon name="phone" size={14} />{selectedLead.lead_phone}
                    </a>
                  )}
                </div>
              </div>
              <Chip tone={STAGE_TONE[selectedLead.pipeline_stage] || 'neutral'}>
                {selectedLead.pipeline_stage}
              </Chip>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Campaign</p>
                <p className="font-label-lg text-label-lg text-on-surface mt-xs truncate">
                  {selectedLead.campaign?.title || '—'}
                </p>
              </div>
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Created</p>
                <p className="font-data-mono font-label-lg text-label-lg text-on-surface mt-xs">
                  {formatDate(selectedLead.created_at)}
                </p>
              </div>
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Referred by</p>
                <p className="font-label-lg text-label-lg text-on-surface mt-xs truncate">
                  {selectedLead.creator?.user?.full_name || 'Direct'}
                </p>
              </div>
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Interest</p>
                <p className="font-label-lg text-label-lg text-on-surface mt-xs capitalize">
                  {selectedLead.interest_level || 'Warm'}
                </p>
              </div>
            </div>

            {selectedLead.notes && (
              <div className="bg-surface-container-low rounded p-sm border border-outline-variant">
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">Notes</p>
                <p className="font-body-sm text-body-sm text-on-surface">{selectedLead.notes}</p>
              </div>
            )}

            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-sm">
                Move to stage
              </p>
              <div className="flex flex-wrap gap-xs">
                {VISIBLE_STAGES.map((s) => {
                  const isCurrent = visibleStageFor(selectedLead.pipeline_stage) === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrent) updateLeadStage(selectedLead.id, s.id)
                        setShowDetailModal(false)
                      }}
                      className={cn(
                        'px-sm py-xs rounded font-label-md text-label-md uppercase tracking-wider transition-colors',
                        isCurrent
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-low text-on-surface border border-outline-variant hover:border-primary',
                      )}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default DeveloperLeads
