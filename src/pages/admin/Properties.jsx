import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency } from '../../lib/utils'
import { Home, Search, MapPin, Image as ImageIcon, Megaphone } from 'lucide-react'
import { cn } from '../../lib/utils'

const STATUS_STYLES = {
  draft:    'bg-surface-container-highest text-on-surface-variant',
  active:   'bg-secondary-container text-on-secondary-fixed',
  sold:     'bg-primary-container/20 text-primary',
  archived: 'bg-error-container text-on-error-container',
}

const AdminProperties = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [properties, setProperties] = useState([])
  const [filter, setFilter] = useState({ status: '', search: '' })

  useEffect(() => { fetchProperties() }, [])

  const fetchProperties = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*, developer:profiles!developer_id(full_name, company_name), campaigns(count)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setProperties(data || [])
    } catch (e) {
      console.error(e)
      setError('Failed to load properties')
    } finally {
      setLoading(false)
    }
  }

  const filtered = properties.filter(p => {
    if (filter.status && p.status !== filter.status) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      const hay = `${p.title || ''} ${p.location_city || ''} ${p.location_suburb || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const stats = {
    total: properties.length,
    active: properties.filter(p => p.status === 'active').length,
    withoutCampaign: properties.filter(p => !(p.campaigns?.[0]?.count)).length,
  }

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading properties..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchProperties} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">All Properties</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Every property listing on the platform, including ones not yet linked to a campaign.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Properties</span>
          <div className="text-2xl font-bold text-on-surface mt-sm">{stats.total}</div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Active</span>
          <div className="text-2xl font-bold text-on-surface mt-sm">{stats.active}</div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Without a Campaign</span>
          <div className="text-2xl font-bold text-on-surface mt-sm">{stats.withoutCampaign}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search title, city, suburb..."
            value={filter.search}
            onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-xl text-sm bg-surface focus:outline-none"
          />
        </div>
        <select
          value={filter.status}
          onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 border border-outline-variant rounded-xl text-sm bg-surface focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="sold">Sold</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Home}
          title={properties.length === 0 ? 'No properties yet' : 'No properties match those filters'}
          description={properties.length === 0
            ? 'No developer has created a property listing yet.'
            : 'Try clearing or adjusting the search and filters.'}
        />
      ) : (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-left text-xs uppercase text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Developer</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-surface-container/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-surface-container overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {p.photo_urls?.[0]
                            ? <img src={p.photo_urls[0]} alt="" className="w-full h-full object-cover" />
                            : <ImageIcon className="w-4 h-4 text-on-surface-variant" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-on-surface truncate">{p.title}</div>
                          <div className="text-xs text-on-surface-variant truncate">/{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {p.developer?.company_name || p.developer?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {[p.location_suburb, p.location_city].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface font-medium">
                      {p.price_zar ? formatCurrency(p.price_zar) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize', STATUS_STYLES[p.status])}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {p.campaigns?.[0]?.count ? (
                        <Link to={`/admin/campaigns`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Megaphone className="w-3.5 h-3.5" />{p.campaigns[0].count}
                        </Link>
                      ) : (
                        <span className="text-on-surface-variant">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminProperties
