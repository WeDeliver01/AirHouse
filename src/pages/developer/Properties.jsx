import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState, EmptyState, Badge } from '../../components/ui'
import { formatCurrency } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import {
  Plus, Home, Search, Bed, Bath, Car, Ruler, MapPin, Edit, Image as ImageIcon,
  LayoutGrid, List as ListIcon, Building2, ExternalLink,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const STATUS_STYLES = {
  draft:    'bg-gray-100 text-gray-700',
  active:   'bg-green-100 text-green-700',
  sold:     'bg-blue-100 text-blue-700',
  archived: 'bg-amber-100 text-amber-700',
}

const Properties = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [properties, setProperties] = useState([])
  const [view, setView] = useState('grid')
  const [filter, setFilter] = useState({ search: '', city: '', status: '' })

  useEffect(() => {
    if (user?.id) load()
  }, [user])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('developer_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setProperties(data || [])
    } catch (e) {
      console.error(e)
      setError('Failed to load properties')
      toast.error('Failed to load properties')
    } finally {
      setLoading(false)
    }
  }

  const filtered = properties.filter(p => {
    if (filter.status && p.status !== filter.status) return false
    if (filter.city && p.location_city !== filter.city) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      const hay = `${p.title || ''} ${p.location_city || ''} ${p.location_suburb || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const cities = [...new Set(properties.map(p => p.location_city).filter(Boolean))].sort()

  const stats = {
    total: properties.length,
    active: properties.filter(p => p.status === 'active').length,
    portfolio: properties.reduce((s, p) => s + (parseFloat(p.price_zar) || 0), 0),
  }

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading properties..." /></div>
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-gray-500 mt-1">Manage your property listings and link them to campaigns.</p>
        </div>
        <Link to="/developer/properties/new">
          <Button variant="primary"><Plus className="w-4 h-4 mr-2" />New Property</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 border border-gray-100 rounded-2xl">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Listings</span>
            <Home className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-1">{stats.active} active</div>
        </div>
        <div className="bg-white p-4 sm:p-5 border border-gray-100 rounded-2xl">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Portfolio Value</span>
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(stats.portfolio)}</div>
          <div className="text-xs text-gray-500 mt-1">Across all listings</div>
        </div>
        <div className="bg-white p-4 sm:p-5 border border-gray-100 rounded-2xl">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cities</span>
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{cities.length}</div>
          <div className="text-xs text-gray-500 mt-1">Unique locations</div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" placeholder="Search title, city, suburb..."
              value={filter.search}
              onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={filter.city}
            onChange={(e) => setFilter(f => ({ ...f, city: e.target.value }))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
          >
            <option value="">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filter.status}
            onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="sold">Sold</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <button
            onClick={() => setView('grid')}
            title="Grid view"
            className={cn('p-2 rounded-lg border', view === 'grid' ? 'bg-primary/10 border-primary text-primary' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('list')}
            title="List view"
            className={cn('p-2 rounded-lg border', view === 'list' ? 'bg-primary/10 border-primary text-primary' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Listings */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Home}
          title={properties.length === 0 ? 'No properties yet' : 'No properties match those filters'}
          description={properties.length === 0
            ? 'Create your first property listing to start linking it to campaigns.'
            : 'Try clearing or adjusting the search and filters.'}
          action={() => { window.location.href = '/developer/properties/new' }}
          actionLabel="New Property"
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filtered.map(p => <PropertyCard key={p.id} property={p} />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Beds / Baths</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {p.photo_urls?.[0]
                            ? <img src={p.photo_urls[0]} alt="" className="w-full h-full object-cover" />
                            : <ImageIcon className="w-5 h-5 text-gray-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{p.title}</div>
                          <div className="text-xs text-gray-500 truncate">/{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {[p.location_suburb, p.location_city].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {p.price_zar ? formatCurrency(p.price_zar) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.bedrooms ?? '—'} / {p.bathrooms ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize', STATUS_STYLES[p.status])}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Link to={`/developer/properties/${p.id}/edit`}>
                          <Button variant="secondary" size="sm"><Edit className="w-3.5 h-3.5 mr-1" />Edit</Button>
                        </Link>
                      </div>
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

const PropertyCard = ({ property: p }) => {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all">
      <div className="relative h-44 w-full bg-gray-100">
        {p.photo_urls?.[0] ? (
          <img src={p.photo_urls[0]} alt={p.title} className={cn('w-full h-full object-cover', p.status === 'sold' && 'grayscale')} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <ImageIcon className="w-12 h-12" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize', STATUS_STYLES[p.status])}>{p.status}</span>
        </div>
        {p.status === 'sold' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-white text-2xl font-extrabold tracking-widest border-4 border-white px-4 py-1 rotate-[-12deg] bg-black/30 rounded">SOLD</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 truncate">{p.title}</h3>
        </div>
        <p className="text-sm text-gray-500 flex items-center gap-1 truncate">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {[p.location_suburb, p.location_city].filter(Boolean).join(', ') || 'Location pending'}
        </p>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-end justify-between">
          <div className="font-bold text-gray-900">
            {p.price_zar ? formatCurrency(p.price_zar) : <span className="text-gray-400">R—</span>}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {p.bedrooms != null && <span className="flex items-center gap-0.5"><Bed className="w-3.5 h-3.5" />{p.bedrooms}</span>}
            {p.bathrooms != null && <span className="flex items-center gap-0.5"><Bath className="w-3.5 h-3.5" />{p.bathrooms}</span>}
            {p.parking != null && <span className="flex items-center gap-0.5"><Car className="w-3.5 h-3.5" />{p.parking}</span>}
            {p.floor_area_sqm != null && <span className="flex items-center gap-0.5"><Ruler className="w-3.5 h-3.5" />{p.floor_area_sqm}m²</span>}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to={`/developer/properties/${p.id}/edit`} className="flex-1">
            <Button variant="secondary" className="w-full"><Edit className="w-3.5 h-3.5 mr-1" />Edit</Button>
          </Link>
          <Link to={`/developer/campaigns/new?property_id=${p.id}`}>
            <Button variant="primary" title="Create campaign for this property">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />Campaign
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Properties
