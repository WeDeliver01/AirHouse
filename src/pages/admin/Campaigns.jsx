import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency} from '../../lib/utils'
import { 
  Megaphone, Search, Eye, MapPin, DollarSign, TrendingUp,
  Download, CheckCircle
} from 'lucide-react'
import { cn } from '../../lib/utils'

const AdminCampaigns = () => {
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, totalBudget: 0, totalLeads: 0 })
  const [filter, setFilter] = useState({ status: '', search: '' })
  const [error, setError] = useState(null)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { fetchCampaigns() }, [])

  const fetchCampaigns = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`*, developer:profiles!developer_id(full_name, company_name), assignments:campaign_assignments(count), leads:leads(count)`)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCampaigns(data || [])
      
      const totalLeads = data?.reduce((s, c) => s + (c.leads?.[0]?.count || 0), 0) || 0
      setStats({
        total: data?.length || 0,
        active: data?.filter(c => c.status === 'active').length || 0,
        totalBudget: data?.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0) || 0,
        totalLeads,
      })
    } catch (e) {
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => ({
    active: 'bg-secondary-container text-on-secondary-fixed',
    open: 'bg-primary-container/20 text-primary',
    draft: 'bg-surface-container-highest text-on-surface-variant',
    completed: 'bg-tertiary-fixed text-on-surface',
    cancelled: 'bg-error-container text-on-error-container',
  }[status] || 'bg-surface-container-highest text-on-surface-variant')

  const filteredCampaigns = campaigns.filter(c => {
    if (filter.status && c.status !== filter.status) return false
    if (filter.search && !c.title?.toLowerCase().includes(filter.search.toLowerCase()) &&
        !c.property_name?.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchCampaigns} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">All Campaigns</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">Manage all platform campaigns and monitor their performance.</p>
        </div>
        <Button variant="secondary"><Download className="w-4 h-4 mr-2" />Export</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Campaigns</span>
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.total}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Active</span>
            <CheckCircle className="w-5 h-5 text-secondary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.active}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Budget</span>
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{formatCurrency(stats.totalBudget)}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Leads</span>
            <TrendingUp className="w-5 h-5 text-secondary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{stats.totalLeads}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input
            type="text" placeholder="Search campaigns..."
            value={filter.search} onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <select value={filter.status} onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
          className="px-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Campaigns Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-md font-medium">Campaign</th>
                <th className="py-3 px-md font-medium">Developer</th>
                <th className="py-3 px-md font-medium text-right">Budget</th>
                <th className="py-3 px-md font-medium text-center">Creators</th>
                <th className="py-3 px-md font-medium text-center">Leads</th>
                <th className="py-3 px-md font-medium text-center">Status</th>
                <th className="py-3 px-md font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
              {filteredCampaigns.map(campaign => (
                <tr key={campaign.id} className="hover:bg-surface transition-colors">
                  <td className="py-3 px-md">
                    <div>
                      <p className="font-label-lg text-label-lg text-on-surface">{campaign.title || campaign.property_name}</p>
                      <p className="font-label-md text-label-md text-on-surface-variant flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{campaign.property_location}
                      </p>
                    </div>
                  </td>
                  <td className="py-3 px-md text-on-surface">
                    {campaign.developer?.company_name || campaign.developer?.full_name}
                  </td>
                  <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">
                    {formatCurrency(campaign.total_budget)}
                  </td>
                  <td className="py-3 px-md text-center font-data-mono text-data-mono text-on-surface">{campaign.assignments?.[0]?.count || 0}</td>
                  <td className="py-3 px-md text-center font-data-mono text-data-mono text-primary">{campaign.leads?.[0]?.count || 0}</td>
                  <td className="py-3 px-md text-center">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded font-label-md text-label-md capitalize', getStatusColor(campaign.status))}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="py-3 px-md text-right">
                    <Link to={`/admin/campaigns/${campaign.id}`}>
                      <Button variant="secondary" size="sm"><Eye className="w-4 h-4 mr-1" />View</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCampaigns.length === 0 && (
          <EmptyState icon={Megaphone} title="No campaigns found" description="There are no campaigns matching your filters." />
        )}
      </div>
    </div>
  )
}

export default AdminCampaigns
