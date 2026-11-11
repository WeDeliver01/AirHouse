import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Card, Button, Input, LoadingSpinner, ErrorState } from '../../components/ui'
import { toast } from 'react-hot-toast'
import { Building2, User, Mail, Phone, MapPin, CheckCircle, ExternalLink } from 'lucide-react'
import { recordPageView, recordOutboundClick } from '../../lib/siteAnalytics'
import { formatCurrency } from '../../lib/utils'

const TYPE_LABEL = {
  getaway_stay: 'Getaway Stay',
  apartment: 'Apartment',
  house: 'House',
}

/**
 * A property's own, unique public URL: airhouse.co.za/:slug.
 *
 * This is the link meant to go on a social/search ad for one specific
 * listing. Unlike /lead/:campaignId, it needs no campaign — it resolves a
 * property directly (migration 031) so every listing gets a URL the moment
 * it's created, whether or not it's ever attached to a creator campaign.
 *
 * Short-term rentals redirect on to the external booking platform, but only
 * after this page records that the visitor passed through AirHouse first.
 * Everything else captures the enquiry inline.
 */
const ListingLanding = () => {
  const { slug } = useParams()
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '', consent: false })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('properties')
          .select(`
            id, slug, title, description, price_zar, location_city, location_suburb,
            bedrooms, bathrooms, property_type, listing_category,
            nightly_rate, guest_capacity, external_booking_url, booking_platform,
            photo_urls, developer_id,
            developer:profiles!developer_id (full_name, company_name)
          `)
          .eq('slug', slug)
          .eq('status', 'active')
          .maybeSingle()

        if (error) throw error
        if (!data) {
          setNotFound(true)
          return
        }
        setProperty(data)
        recordPageView(`/${slug}`, data.id)
      } catch (e) {
        console.error('Error loading listing:', e)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    if (slug) load()
  }, [slug])

  const isShortTermRental = property?.listing_category === 'short_term_rental'
  const canRedirect = isShortTermRental && !!property?.external_booking_url

  const browseUrl = property ? `/properties?type=${property.property_type}` : '/properties'
  const typeLabel = property ? (TYPE_LABEL[property.property_type] || 'Properties') : ''

  const handleContinueToBook = () => {
    if (!property) return
    setRedirecting(true)
    recordOutboundClick(property.id, `/${slug}`)
    // Give the analytics write a brief head start before navigating away;
    // it is fire-and-forget either way, this just improves delivery odds.
    setTimeout(() => {
      window.location.href = property.external_booking_url
    }, 150)
  }

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const CONSENT_TEXT =
    'I agree that my details may be shared with this listing’s developer so they can contact me about it.'

  const validate = () => {
    const next = {}
    if (!formData.name.trim()) next.name = 'Name is required'
    if (!formData.email.trim()) next.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) next.email = 'Please enter a valid email'
    if (!formData.phone.trim()) next.phone = 'Phone number is required'
    if (!formData.consent) next.consent = 'Please agree to be contacted about this listing'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate() || !property) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('leads').insert({
        property_id: property.id,
        lead_name: formData.name,
        lead_email: formData.email,
        lead_phone: formData.phone,
        notes: formData.message || null,
        source_url: window.location.href,
        status: 'new',
        pipeline_stage: 'new',
        consent_given: true,
        consent_text: CONSENT_TEXT,
      })
      if (error) throw error
      setSubmitted(true)
    } catch (err) {
      console.error('Error submitting enquiry:', err)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading listing…" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <ErrorState title="Listing not found" message="This listing link is no longer available." />
      </div>
    )
  }

  const photo = property.photo_urls?.[0]

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          {photo ? (
            <img src={photo} alt={property.title} className="w-full max-h-80 object-cover rounded-2xl mb-6" />
          ) : (
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-on-surface">{property.title}</h1>
          <p className="text-on-surface-variant flex items-center justify-center gap-1 mt-1">
            <MapPin className="w-4 h-4" />
            {[property.location_suburb, property.location_city].filter(Boolean).join(', ') || 'Location pending'}
          </p>
          {property.developer && (
            <p className="text-sm text-on-surface-variant mt-2">
              Listed by {property.developer.company_name || property.developer.full_name}
            </p>
          )}
          <p className="text-lg font-semibold text-on-surface mt-3">
            {isShortTermRental
              ? (property.nightly_rate ? `${formatCurrency(property.nightly_rate)}/night` : 'Rate on request')
              : (property.price_zar ? formatCurrency(property.price_zar) : 'Price on request')}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {property.description && (
              <Card>
                <h3 className="font-semibold mb-3">About This Listing</h3>
                <p className="text-on-surface-variant text-sm whitespace-pre-line">{property.description}</p>
              </Card>
            )}
            <Card>
              <Link to={browseUrl}>
                <Button variant="secondary" className="w-full">
                  Browse other {typeLabel.toLowerCase()} listings
                </Button>
              </Link>
            </Card>
          </div>

          <Card>
            {canRedirect ? (
              submitted ? null : (
                <>
                  <h2 className="text-lg font-semibold mb-1">Ready to book?</h2>
                  <p className="text-sm text-on-surface-variant mb-6">
                    You'll continue on {property.booking_platform || 'our booking partner'} to complete your booking.
                  </p>
                  <Button
                    variant="primary"
                    className="w-full"
                    isLoading={redirecting}
                    onClick={handleContinueToBook}
                  >
                    Continue to book on {property.booking_platform || 'booking site'}
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </>
              )
            ) : submitted ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-on-surface mb-2">Thank You!</h2>
                <p className="text-on-surface-variant mb-6">
                  Your enquiry has been received. The developer will contact you shortly.
                </p>
                <Link to={browseUrl}>
                  <Button variant="secondary" className="w-full">
                    Browse other {typeLabel.toLowerCase()} listings
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-1">Request Information</h2>
                <p className="text-sm text-on-surface-variant mb-6">
                  Fill in your details and we'll get back to you about this listing.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <User className="absolute left-3 top-9 w-5 h-5 text-on-surface-variant" />
                    <Input
                      label="Full Name"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      error={errors.name}
                      className="pl-10"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-9 w-5 h-5 text-on-surface-variant" />
                    <Input
                      label="Email Address"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      error={errors.email}
                      className="pl-10"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3 top-9 w-5 h-5 text-on-surface-variant" />
                    <Input
                      label="Phone Number"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      error={errors.phone}
                      className="pl-10"
                      required
                    />
                  </div>
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.consent}
                        onChange={(e) => updateField('consent', e.target.checked)}
                        className="mt-1 w-4 h-4 rounded accent-primary shrink-0"
                      />
                      <span className="text-sm text-on-surface-variant">
                        {CONSENT_TEXT}{' '}
                        <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline">
                          Privacy Policy
                        </a>
                      </span>
                    </label>
                    {errors.consent && <p className="text-sm text-error mt-1">{errors.consent}</p>}
                  </div>
                  <Button type="submit" variant="primary" className="w-full" isLoading={submitting}>
                    Submit Enquiry
                  </Button>
                </form>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ListingLanding
