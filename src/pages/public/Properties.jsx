import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { EmptyState, ErrorState, LoadingSpinner } from '../../components/ui'
import { cn, formatCurrency } from '../../lib/utils'
import { Home as HomeIcon } from 'lucide-react'

const CATEGORIES = [
  { value: 'all', label: 'All stays & homes' },
  { value: 'getaway_stay', label: 'Getaway Stays' },
  { value: 'apartment', label: 'Apartments' },
  { value: 'house', label: 'Houses' },
]

const Properties = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [properties, setProperties] = useState([])
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, slug, title, price_zar, location_city, location_suburb, bedrooms, bathrooms, property_type, listing_category, nightly_rate, guest_capacity, photo_urls, created_at')
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
    () => [...new Set(properties.map((p) => p.location_city).filter(Boolean))].sort(),
    [properties],
  )

  const filtered = properties.filter((p) => {
    if (category !== 'all' && p.property_type !== category) return false
    if (city && p.location_city !== city) return false
    if (search && !p.title?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const countsByCategory = useMemo(() => {
    const counts = { all: properties.length }
    for (const c of CATEGORIES) {
      if (c.value === 'all') continue
      counts[c.value] = properties.filter((p) => p.property_type === c.value).length
    }
    return counts
  }, [properties])

  return (
    <div className="bg-background min-h-[calc(100vh-4rem)]">
      {/* Hero / search */}
      <section className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="max-w-3xl">
            <span className="inline-block font-label-md text-label-md uppercase tracking-wider text-primary bg-primary-fixed px-3 py-1 rounded-full mb-3">
              Properties
            </span>
            <h1 className="font-headline-xl text-3xl sm:text-4xl font-bold text-on-surface mb-3">
              Explore stays and homes on AirHouse
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Getaway stays, apartments, and houses listed by our developers —
              browse what's actually on the platform.
            </p>
          </div>

          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search by title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-surface border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            {cities.length > 0 && (
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="px-4 py-3 bg-surface border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          {/* Category tabs */}
          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c.value
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    'px-4 py-2 rounded-full font-label-lg text-label-lg border transition-colors',
                    active
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                  )}
                >
                  {c.label}
                  {countsByCategory[c.value] != null && (
                    <span className={cn('ml-1.5', active ? 'opacity-80' : 'opacity-60')}>
                      {countsByCategory[c.value]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error ? (
          <ErrorState title="Couldn't load properties" message={error} onRetry={load} />
        ) : loading ? (
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner size="lg" text="Loading properties…" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={HomeIcon}
            title={properties.length === 0 ? 'No properties listed yet' : 'No properties match those filters'}
            description={properties.length === 0
              ? "Developers haven't listed any active properties yet. Check back soon."
              : 'Try a different category, city, or search term.'}
          />
        ) : (
          <>
            <p className="font-label-md text-label-md text-on-surface-variant mb-4">
              {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {filtered.map((p) => <PropertyCard key={p.id} property={p} />)}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

const CATEGORY_LABEL = {
  getaway_stay: 'Getaway Stay',
  apartment: 'Apartment',
  house: 'House',
}

const PropertyCard = ({ property: p }) => (
  <article className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/40 transition-all">
    <div className="relative h-44 w-full bg-surface-container">
      {p.photo_urls?.[0] ? (
        <img src={p.photo_urls[0]} alt={p.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-outline">
          <span className="material-symbols-outlined text-[40px]">home_work</span>
        </div>
      )}
      <span className="absolute top-3 left-3 bg-surface-container-lowest/90 text-on-surface font-label-md text-label-md px-2.5 py-1 rounded-full">
        {CATEGORY_LABEL[p.property_type] || 'House'}
      </span>
      {p.listing_category === 'short_term_rental' && (
        <span className="absolute top-3 right-3 bg-primary text-on-primary font-label-md text-label-md px-2.5 py-1 rounded-full">
          Short-Term Rental
        </span>
      )}
    </div>
    <div className="p-4">
      <h3 className="font-label-lg text-label-lg text-on-surface truncate">{p.title}</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 truncate mt-0.5">
        <span className="material-symbols-outlined text-[16px]">location_on</span>
        {[p.location_suburb, p.location_city].filter(Boolean).join(', ') || 'Location pending'}
      </p>
      <div className="mt-3 pt-3 border-t border-outline-variant flex items-end justify-between">
        <div className="font-label-lg text-label-lg text-on-surface font-bold">
          {p.listing_category === 'short_term_rental'
            ? (p.nightly_rate ? `${formatCurrency(p.nightly_rate)}/night` : <span className="text-on-surface-variant font-normal">Rate on request</span>)
            : (p.price_zar ? formatCurrency(p.price_zar) : <span className="text-on-surface-variant font-normal">Rate on request</span>)}
        </div>
        <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2">
          {p.listing_category === 'short_term_rental' && p.guest_capacity != null && (
            <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[16px]">group</span>{p.guest_capacity}</span>
          )}
          {p.bedrooms != null && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[16px]">bed</span>{p.bedrooms}</span>}
          {p.bathrooms != null && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[16px]">bathtub</span>{p.bathrooms}</span>}
        </div>
      </div>
    </div>
  </article>
)

export default Properties
