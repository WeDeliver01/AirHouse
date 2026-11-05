import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency } from '../../lib/utils'
import {
  Home, Search, Bed, Bath, Car, Ruler, MapPin, Image as ImageIcon,
  ArrowRight, X,
} from 'lucide-react'

const PRICE_RANGES = [
  { label: 'Any price',         min: null, max: null },
  { label: 'Under R1m',         min: 0,    max: 1_000_000 },
  { label: 'R1m – R2.5m',       min: 1_000_000, max: 2_500_000 },
  { label: 'R2.5m – R5m',       min: 2_500_000, max: 5_000_000 },
  { label: 'R5m – R10m',        min: 5_000_000, max: 10_000_000 },
  { label: 'R10m+',             min: 10_000_000, max: null },
]

const Properties = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [properties, setProperties] = useState([])
  const [filter, setFilter] = useState({ search: '', city: '', bedrooms: '', priceIdx: '0' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, slug, title, price_zar, location_city, location_suburb, bedrooms, bathrooms, parking, floor_area_sqm, photo_urls, created_at')
        .eq('status', 'active')
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

  const cities = useMemo(
    () => [...new Set(properties.map(p => p.location_city).filter(Boolean))].sort(),
    [properties],
  )
  const bedroomOptions = useMemo(
    () => [...new Set(properties.map(p => p.bedrooms).filter(b => b != null))].sort((a, b) => a - b),
    [properties],
  )

  const priceRange = PRICE_RANGES[parseInt(filter.priceIdx, 10)] || PRICE_RANGES[0]

  const filtered = properties.filter(p => {
    if (filter.city && p.location_city !== filter.city) return false
    if (filter.bedrooms !== '' && String(p.bedrooms ?? '') !== String(filter.bedrooms)) return false
    if (priceRange.min != null && (parseFloat(p.price_zar) || 0) < priceRange.min) return false
    if (priceRange.max != null && (parseFloat(p.price_zar) || 0) > priceRange.max) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      if (!`${p.title || ''}`.toLowerCase().includes(q)) return false
    }
    return true
  })

  const filtersActive = filter.search || filter.city || filter.bedrooms !== '' || filter.priceIdx !== '0'
  const clearFilters = () => setFilter({ search: '', city: '', bedrooms: '', priceIdx: '0' })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading properties..." />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Browse Properties</h1>
        <p className="text-gray-500 mt-1">
          Get to know the developments behind the campaigns. Use these listings to research
          the property before applying or producing content.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title..."
              value={filter.search}
              onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={filter.city}
            onChange={(e) => setFilter(f => ({ ...f, city: e.target.value }))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filter.bedrooms}
            onChange={(e) => setFilter(f => ({ ...f, bedrooms: e.target.value }))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Any bedrooms</option>
            {bedroomOptions.map(b => (
              <option key={b} value={b}>{b} {b === 1 ? 'bedroom' : 'bedrooms'}</option>
            ))}
          </select>
          <select
            value={filter.priceIdx}
            onChange={(e) => setFilter(f => ({ ...f, priceIdx: e.target.value }))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {PRICE_RANGES.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <span>Showing {filtered.length} of {properties.length} active {properties.length === 1 ? 'property' : 'properties'}</span>
          {filtersActive && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-primary hover:underline">
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Listings */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Home}
          title={properties.length === 0 ? 'No properties yet' : 'No properties match those filters'}
          description={properties.length === 0
            ? 'Developers haven\'t listed any active properties yet. Check back soon.'
            : 'Try clearing or adjusting the search and filters.'}
          action={filtersActive ? clearFilters : undefined}
          actionLabel={filtersActive ? 'Clear filters' : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filtered.map(p => <PropertyCard key={p.id} property={p} />)}
        </div>
      )}
    </div>
  )
}

const PropertyCard = ({ property: p }) => (
  <Link
    to={`/creator/properties/${p.slug}`}
    className="block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all group"
  >
    <div className="relative h-44 w-full bg-gray-100">
      {p.photo_urls?.[0] ? (
        <img src={p.photo_urls[0]} alt={p.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          <ImageIcon className="w-12 h-12" />
        </div>
      )}
      {p.photo_urls?.length > 1 && (
        <span className="absolute bottom-3 right-3 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
          {p.photo_urls.length} photos
        </span>
      )}
    </div>
    <div className="p-4">
      <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">{p.title}</h3>
      <p className="text-sm text-gray-500 flex items-center gap-1 truncate mt-0.5">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        {[p.location_suburb, p.location_city].filter(Boolean).join(', ') || 'Location pending'}
      </p>
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-end justify-between">
        <div className="font-bold text-gray-900">
          {p.price_zar ? formatCurrency(p.price_zar) : <span className="text-gray-400">R—</span>}
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap justify-end">
          {p.bedrooms != null && <span className="flex items-center gap-0.5"><Bed className="w-3.5 h-3.5" />{p.bedrooms}</span>}
          {p.bathrooms != null && <span className="flex items-center gap-0.5"><Bath className="w-3.5 h-3.5" />{p.bathrooms}</span>}
          {p.parking != null && <span className="flex items-center gap-0.5"><Car className="w-3.5 h-3.5" />{p.parking}</span>}
          {p.floor_area_sqm != null && <span className="flex items-center gap-0.5"><Ruler className="w-3.5 h-3.5" />{p.floor_area_sqm}m²</span>}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-primary text-sm font-medium">
        View property <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  </Link>
)

export default Properties
