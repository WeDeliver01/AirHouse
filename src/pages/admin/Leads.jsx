import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Modal, ModalFooter, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatRelativeTime, formatDate } from '../../lib/utils'
import { 
  TrendingUp, Search, Eye, Mail, Phone, Download, Target,
  UserCheck, Clock
} from 'lucide-react'
import { cn } from '../../lib/utils'

const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'negotiating', 'converted', 'lost']
const STAGE_COLORS = {
  new: 'bg-secondary-container text-on-secondary-fixed',
  contacted: 'bg-tertiary-fixed text-on-surface',
  qualified: 'bg-primary-container/20 text-primary',
  negotiating: 'bg-surface-container-highest text-on-surface',
  converted: 'bg-secondary text-on-secondary',
  lost: 'bg-error-container text-on-error-container',
}

const AdminLeads = () => {
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState({ total: 0, new: 0, converted: 0, conversionRate: 0 })
  const [filter, setFilter] = useState({ stage: '', search: '' })
  const [error, setError] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { fetchLeads() }, [])

  const fetchLeads = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('leads')
        .select(`*, campaign:campaigns(id, title, property_name, developer:profiles!developer_id(full_name, company_name)), creator:creator_profiles(id, user:profiles(full_name))`)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLeads(data || [])
      
      const total = data?.length || 0
      const newLeads = data?.filter(l => l.pipeline_stage === 'new').length || 0
      const converted = data?.filter(l => l.pipeline_stage === 'converted').length || 0
      setStats({ total, new: newLeads, converted, conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0 })
    } catch (e) {
      setError('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = leads.filter(l => {
    if (filter.stage && l.pipeline_stage !== filter.stage) return false
    if (filter.search && !l.lead_name?.toLowerCase().includes(filter.search.toLowerCase()) &&
        !l.lead_email?.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchLeads} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">All Leads</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">Platform-wide lead pipeline overview.</p>
        </div>
        <Button variant="secondary"><Download className="w-4 h-4 mr-2" />Export</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Leads</span>
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.total}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">New Leads</span>
            <Clock className="w-5 h-5 text-tertiary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.new}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Converted</span>
            <UserCheck className="w-5 h-5 text-secondary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.converted}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Conversion Rate</span>
            <Target className="w-5 h-5 text-primary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.conversionRate}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input
            type="text" placeholder="Search leads..."
            value={filter.search} onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <select value={filter.stage} onChange={(e) => setFilter(f => ({ ...f, stage: e.target.value }))}
          className="px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary">
          <option value="">All Stages</option>
          {PIPELINE_STAGES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>

      {/* Leads Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-md font-medium">Lead</th>
                <th className="py-3 px-md font-medium">Campaign</th>
                <th className="py-3 px-md font-medium">Developer</th>
                <th className="py-3 px-md font-medium">Referred By</th>
                <th className="py-3 px-md font-medium text-center">Stage</th>
                <th className="py-3 px-md font-medium">Date</th>
                <th className="py-3 px-md font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
              {filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-surface transition-colors">
                  <td className="py-3 px-md">
                    <div>
                      <p className="font-label-lg text-label-lg text-on-surface">{lead.lead_name}</p>
                      <p className="font-label-md text-label-md text-on-surface-variant">{lead.lead_email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-md text-on-surface">{lead.campaign?.title || lead.campaign?.property_name}</td>
                  <td className="py-3 px-md text-on-surface">{lead.campaign?.developer?.company_name || lead.campaign?.developer?.full_name}</td>
                  <td className="py-3 px-md text-on-surface-variant">{lead.creator?.user?.full_name || 'Direct'}</td>
                  <td className="py-3 px-md text-center">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded font-label-md text-label-md capitalize', STAGE_COLORS[lead.pipeline_stage])}>
                      {lead.pipeline_stage}
                    </span>
                  </td>
                  <td className="py-3 px-md text-on-surface-variant font-data-mono text-data-mono">{formatRelativeTime(lead.created_at)}</td>
                  <td className="py-3 px-md text-right">
                    <Button variant="secondary" size="sm" onClick={() => { setSelectedLead(lead); setShowModal(true) }}>
                      <Eye className="w-4 h-4 mr-1" />View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLeads.length === 0 && (
          <EmptyState icon={TrendingUp} title="No leads found" description="There are no leads matching your filters." />
        )}
      </div>

      {/* Lead Detail Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Lead Details" size="lg">
        {selectedLead && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/40 rounded-2xl flex items-center justify-center text-2xl font-bold text-primary">
                {selectedLead.lead_name?.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900">{selectedLead.lead_name}</h3>
                <div className="flex gap-4 mt-2">
                  <a href={`mailto:${selectedLead.lead_email}`} className="flex items-center gap-1 text-sm text-primary hover:underline">
                    <Mail className="w-4 h-4" />{selectedLead.lead_email}
                  </a>
                  {selectedLead.lead_phone && (
                    <a href={`tel:${selectedLead.lead_phone}`} className="flex items-center gap-1 text-sm text-primary hover:underline">
                      <Phone className="w-4 h-4" />{selectedLead.lead_phone}
                    </a>
                  )}
                </div>
              </div>
              <span className={cn('px-3 py-1 rounded-full text-sm font-semibold capitalize', STAGE_COLORS[selectedLead.pipeline_stage])}>
                {selectedLead.pipeline_stage}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs text-gray-500">Campaign</p>
                <p className="font-semibold">{selectedLead.campaign?.title}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs text-gray-500">Developer</p>
                <p className="font-semibold">{selectedLead.campaign?.developer?.company_name || selectedLead.campaign?.developer?.full_name}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs text-gray-500">Referred By</p>
                <p className="font-semibold">{selectedLead.creator?.user?.full_name || 'Direct'}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs text-gray-500">Created</p>
                <p className="font-semibold">{formatDate(selectedLead.created_at)}</p>
              </div>
            </div>

            {selectedLead.notes && (
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs text-gray-500 mb-2">Notes</p>
                <p className="text-sm text-gray-700">{selectedLead.notes}</p>
              </div>
            )}
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Close</Button>
          {selectedLead && (
            <a href={`mailto:${selectedLead.lead_email}`}>
              <Button variant="primary"><Mail className="w-4 h-4 mr-2" />Send Email</Button>
            </a>
          )}
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default AdminLeads
