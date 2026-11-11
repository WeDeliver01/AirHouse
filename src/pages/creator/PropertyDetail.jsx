import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Button, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency } from '../../lib/utils'
import {
  ArrowLeft, Bed, Bath, Car, Ruler, MapPin, Image as ImageIcon,
  Building2, Megaphone, ArrowRight, Calendar,
} from 'lucide-react'

const PropertyDetail = () => {
  const { slug } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [property, setProperty] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [activePhoto, setActivePhoto] = useState(0)

  useEffect(() => { load() }, [slug, load])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActivePhoto(0)
    try {
      const { data: prop, error: propErr } = await supabase
        .from('properties')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .maybeSingle()
      if (propErr) throw propErr
      if (!prop) {
        setProperty(null)
        setCampaigns([])
        return
      }
      setProperty(prop)

      const { data: camps, error: campErr } = await supabase
        .from('campaigns')
        .select('id, title, property_location, property_type, creator_budget, status, end_date, developer:profiles!developer_id(full_name, company_name, avatar_url)')
        .eq('property_id', prop.id)
        .in('status', ['open', 'active'])
        .order('created_at', { ascending: false })
      if (campErr) throw campErr
      setCampaigns(camps || [])
    } catch (e) {
      console.error(e)
      setError('Failed to load property')
    } finally {
      setLoading(false)
    }
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading property..." />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={load} />

  if (!property) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={Building2}
          title="Property not found"
          description="This property may have been removed or is no longer active."
        />
      </div>
    )
  }

  const photos = property.photo_urls || []
  const heroPhoto = photos[activePhoto]
  const locationLabel = [property.location_suburb, property.location_city].filter(Boolean).join(', ')

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{property.title}</h1>
          {locationLabel && (
            <p className="text-gray-500 mt-1 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 shrink-0" />
              {locationLabel}
            </p>
          )}
        </div>
        {property.price_zar && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Asking price</p>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{formatCurrency(property.price_zar)}</p>
          </div>
        )}
      </div>

      {/* Photo gallery */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="relative w-full aspect-[16/9] bg-gray-100">
          {heroPhoto ? (
            <img src={heroPhoto} alt={property.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <ImageIcon className="w-16 h-16" />
            </div>
          )}
        </div>
        {photos.length > 1 && (
          <div className="p-3 flex gap-2 overflow-x-auto">
            {photos.map((url, i) => (
              <button
                key={url + i}
                onClick={() => setActivePhoto(i)}
                className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border-2 shrink-0 ${
                  i === activePhoto ? 'border-primary' : 'border-transparent hover:border-gray-300'
                }`}
              >
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Stat icon={Bed} label="Bedrooms" value={property.bedrooms ?? '—'} />
        <Stat icon={Bath} label="Bathrooms" value={property.bathrooms ?? '—'} />
        <Stat icon={Car} label="Parking" value={property.parking ?? '—'} />
        <Stat icon={Ruler} label="Floor area" value={property.floor_area_sqm != null ? `${property.floor_area_sqm} m²` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">About this property</h2>
            {property.description ? (
              <p className="text-gray-700 whitespace-pre-line leading-relaxed">{property.description}</p>
            ) : (
              <p className="text-gray-500 italic">The developer hasn't added a description yet.</p>
            )}
          </section>

          {/* Campaigns */}
          <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary" />
                Campaigns for this property
              </h2>
              <span className="text-xs text-gray-500">{campaigns.length} active</span>
            </div>

            {campaigns.length === 0 ? (
              <p className="text-sm text-gray-500">
                No active campaigns are linked to this property right now. Check back soon — new
                opportunities are posted regularly.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {campaigns.map(c => (
                  <li key={c.id}>
                    <Link
                      to={`/creator/campaigns/${c.id}`}
                      className="flex items-center gap-4 py-3 group hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-primary/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 group-hover:text-primary transition-colors truncate">
                          {c.title}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                          <span className="capitalize">{c.status}</span>
                          {c.developer?.company_name || c.developer?.full_name ? (
                            <span className="truncate">
                              by {c.developer.company_name || c.developer.full_name}
                            </span>
                          ) : null}
                          {c.end_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(c.end_date).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-emerald-600">{formatCurrency(c.creator_budget)}</p>
                        <p className="text-[11px] text-gray-400">creator budget</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Location</h3>
            <p className="text-sm text-gray-700 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                {property.location_suburb && <>{property.location_suburb}<br /></>}
                {property.location_city || 'City unspecified'}
              </span>
            </p>
            {property.latitude != null && property.longitude != null && (
              <a
                href={`https://www.google.com/maps?q=${property.latitude},${property.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary text-sm font-medium mt-3 hover:underline"
              >
                Open in Maps <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">At a glance</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Price" value={property.price_zar ? formatCurrency(property.price_zar) : '—'} />
              <Row label="Bedrooms" value={property.bedrooms ?? '—'} />
              <Row label="Bathrooms" value={property.bathrooms ?? '—'} />
              <Row label="Parking" value={property.parking ?? '—'} />
              <Row label="Floor area" value={property.floor_area_sqm != null ? `${property.floor_area_sqm} m²` : '—'} />
            </dl>
          </section>

          <Link to="/creator/properties">
            <Button variant="secondary" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-1" /> All properties
            </Button>
          </Link>
        </aside>
      </div>
    </div>
  )
}

const BackLink = () => (
  <Link to="/creator/properties" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary transition-colors">
    <ArrowLeft className="w-4 h-4" /> Back to properties
  </Link>
)

const Stat = ({ icon: Icon, label, value }) => (
  <div className="bg-white p-4 border border-gray-100 rounded-2xl">
    <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
      <Icon className="w-4 h-4 text-primary" />
      {label}
    </div>
    <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
  </div>
)

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between gap-2">
    <dt className="text-gray-500">{label}</dt>
    <dd className="font-medium text-gray-900">{value}</dd>
  </div>
)

export default PropertyDetail
