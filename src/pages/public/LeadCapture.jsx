import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Card, Button, Input, Textarea, Select, LoadingSpinner, ErrorState, SmartImage } from '../../components/ui'
import { toast } from 'react-hot-toast'
import { 
  Building2, User, Mail, Phone, CheckCircle, 
  MapPin, ChevronLeft, ChevronRight, X, Download, FileText, Image
} from 'lucide-react'
import { notifyNewLead } from '../../lib/notifications'
import { creditTrackingLeadByToken } from '../../lib/tracking'
import {
  LEAD_INTENTS, INTEREST_LEVELS, TIMELINE_OPTIONS, TIMELINE_LABEL, BUDGET_FIELD, defaultIntentFor,
} from '../../lib/leadDetails'

const LeadCaptureForm = () => {
  const { campaignId } = useParams()
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref')

  const [campaign, setCampaign] = useState(null)
  const isAccommodation = campaign?.property?.listing_category === 'short_term_rental'
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(null)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    interest_level: 'warm',
    // null until the visitor picks; until then the listing's default applies.
    intent: null,
    timeline: '',
    budget: '',
    message: '',
    check_in_date: '',
    check_out_date: '',
    guest_count: '',
    consent: false,
    // Honeypot: a real person never fills this in because it is hidden.
    // Automated form-fillers populate every field they find. Its name and
    // label deliberately match none of the browser autofill heuristics
    // (company, organisation, website, url, ...): an earlier
    // "company_website" field was being filled by Chrome autofill, which
    // made genuine enquiries look like bots and silently discarded them.
    ah_hp_field: '',
  })

  // Rent or buy. Apartments are usually rented (sometimes bought), so the
  // visitor says which; the timeline and budget questions follow the answer.
  const intent = formData.intent || defaultIntentFor({
    listingCategory: campaign?.property?.listing_category,
    propertyType: campaign?.property_type,
  })
  const chooseIntent = (next) => {
    if (next === intent) return
    // Timeline options differ between renting and buying.
    setFormData((prev) => ({ ...prev, intent: next, timeline: '' }))
  }

  // Used to reject submissions that arrive implausibly fast for a human.
  const [formLoadedAt] = useState(() => Date.now())
  const [errors, setErrors] = useState({})
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    const fetchCampaign = async () => {
      if (!campaignId) {
        setLoading(false)
        return
      }

      setFetchError(null)
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select(`
            id, 
            title, 
            property_name, 
            property_location, 
            property_type,
            description,
            referral_code,
            property_images,
            brochure_urls,
            key_selling_points,
            property:properties(listing_category, external_booking_url, nightly_rate, guest_capacity, booking_platform),
            developer:profiles!developer_id (full_name, company_name, avatar_url)
          `)
          .eq('id', campaignId)
          .single()

        if (error) throw error
        setCampaign(data)
      } catch (err) {
        console.error('Error fetching campaign:', err)
        setFetchError('Failed to load campaign details')
      } finally {
        setLoading(false)
      }
    }

    fetchCampaign()
  }, [campaignId])

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.consent) {
      newErrors.consent = 'Please agree to be contacted about this property'
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required'
    }

    if (isAccommodation && formData.check_in_date && formData.check_out_date
        && formData.check_out_date <= formData.check_in_date) {
      newErrors.check_out_date = 'Check-out must be after check-in'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const CONSENT_TEXT =
    'I agree that my details may be shared with this developer so they can ' +
    'contact me about this property.'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    // Bot protection. Neither check inconveniences a real visitor, and both
    // are cheap compared with a CAPTCHA round trip. The server-side rules in
    // migration 024 are the real defence; these just cut the obvious noise.
    if (formData.ah_hp_field) {
      // Honeypot filled: silently accept so the bot does not learn why.
      setSubmitted(true)
      return
    }

    if (Date.now() - formLoadedAt < 2000) {
      toast.error('Please take a moment to check your details before submitting.')
      return
    }

    setSubmitting(true)

    try {
      // Attribution is resolved in the database (migration 038) from the
      // referral code below. Anonymous visitors are not allowed to read
      // creator_tracking_links or campaign_assignments, so a lookup here
      // always came back empty and creators were never credited. The
      // validate_lead trigger still drops any creator not actually assigned
      // to this campaign.

      // The id is generated here rather than read back from the insert.
      // Anonymous visitors may INSERT into leads but are (deliberately) not
      // allowed to SELECT them (migration 018), and Postgres applies SELECT
      // policies to INSERT ... RETURNING -- so asking PostgREST to return the
      // new row made every anonymous enquiry fail with an RLS error.
      const leadId = crypto.randomUUID()

      const leadData = {
        id: leadId,
        campaign_id: campaignId,
        referral_code: refCode || campaign?.referral_code,
        tracking_token: refCode || null,
        lead_name: formData.name,
        lead_email: formData.email,
        lead_phone: formData.phone,
        interest_level: formData.interest_level,
        check_in_date: isAccommodation ? (formData.check_in_date || null) : null,
        check_out_date: isAccommodation ? (formData.check_out_date || null) : null,
        guest_count: isAccommodation && formData.guest_count ? Number(formData.guest_count) : null,
        notes: JSON.stringify({
          ...(isAccommodation ? {} : { intent }),
          timeline: formData.timeline,
          budget: formData.budget,
          message: formData.message,
        }),
        source_url: window.location.href,
        status: 'new',
        pipeline_stage: 'new',
        consent_given: true,
        consent_text: CONSENT_TEXT,
      }

      const { error } = await supabase.from('leads').insert(leadData)

      if (error) throw error

      if (refCode) {
        creditTrackingLeadByToken(refCode)
      }

      // The developer's notification is raised server-side from the stored
      // lead, so this public page never supplies a recipient address or email
      // content. Failure to notify must not fail the visitor's submission.
      notifyNewLead(leadId)
      setSubmitted(true)
    } catch (error) {
      console.error('Error submitting lead:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const propertyImages = campaign?.property_images || []
  const brochureUrls = campaign?.brochure_urls || []

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (fetchError) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><ErrorState message={fetchError} onRetry={() => window.location.reload()} /></div>

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Thank You!
          </h2>
          <p className="text-gray-600 mb-6">
            Your enquiry has been received. A representative from{' '}
            <strong>{campaign?.developer?.company_name || campaign?.developer?.full_name}</strong>{' '}
            will contact you shortly.
          </p>
          {campaign && (
            <div className="p-4 bg-gray-50 rounded-xl text-left">
              <p className="text-sm text-gray-500">Property of Interest:</p>
              <p className="font-semibold">{campaign.property_name}</p>
              <p className="text-sm text-gray-500">{campaign.property_location}</p>
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Campaign Header */}
        {campaign && (
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {campaign.property_name}
            </h1>
            <p className="text-gray-500 flex items-center justify-center gap-1 mt-1">
              <MapPin className="w-4 h-4" />
              {campaign.property_location}
            </p>
            {campaign.developer && (
              <p className="text-sm text-gray-500 mt-2">
                by {campaign.developer.company_name || campaign.developer.full_name}
              </p>
            )}
          </div>
        )}

        {/* Property Images Gallery */}
        {propertyImages.length > 0 && (
          <Card className="mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {propertyImages.slice(0, 4).map((url, index) => (
                <div 
                  key={index} 
                  className="aspect-video rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-gray-100 relative"
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <SmartImage src={url} alt={`Property ${index + 1}`} width={300} className="w-full h-full object-cover" />
                  {index === 3 && propertyImages.length > 4 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-semibold text-lg">+{propertyImages.length - 4} more</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Property Info */}
          <div className="space-y-6">
            {/* Property Description */}
            {campaign?.description && (
              <Card>
                <h3 className="font-semibold mb-3">About This Property</h3>
                <p className="text-gray-600 text-sm whitespace-pre-line">
                  {campaign.description}
                </p>
              </Card>
            )}

            {/* Key Selling Points */}
            {campaign?.key_selling_points && (
              <Card>
                <h3 className="font-semibold mb-3">Key Features</h3>
                <p className="text-gray-600 text-sm whitespace-pre-line">
                  {campaign.key_selling_points}
                </p>
              </Card>
            )}

            {/* Brochures */}
            {brochureUrls.length > 0 && (
              <Card>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Download Brochure
                </h3>
                <div className="space-y-2">
                  {brochureUrls.map((url, index) => {
                    const isPdf = url.toLowerCase().includes('.pdf')
                    const fileName = url.split('/').pop()
                    return (
                      <a 
                        key={index} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isPdf ? 'bg-red-100' : 'bg-blue-100'}`}>
                          {isPdf ? (
                            <FileText className="w-5 h-5 text-red-600" />
                          ) : (
                            <Image className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{fileName || `Brochure ${index + 1}`}</p>
                          <p className="text-xs text-gray-500">{isPdf ? 'PDF' : 'Image'}</p>
                        </div>
                        <Download className="w-5 h-5 text-gray-400" />
                      </a>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Right Column - Lead Form */}
          <Card>
            <h2 className="text-lg font-semibold mb-1">
              {isAccommodation ? 'Enquire About This Stay' : 'Request Information'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {isAccommodation
                ? "Tell us your dates and we'll get back to you with availability."
                : "Fill in your details and we'll get back to you with more information."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="relative">
                <User className="absolute left-3 top-9 w-5 h-5 text-gray-400" />
                <Input
                  label="Full Name"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="John Smith"
                  error={errors.name}
                  className="pl-10"
                  required
                />
              </div>

              {/* Email */}
              <div className="relative">
                <Mail className="absolute left-3 top-9 w-5 h-5 text-gray-400" />
                <Input
                  label="Email Address"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="john@example.com"
                  error={errors.email}
                  className="pl-10"
                  required
                />
              </div>

              {/* Phone */}
              <div className="relative">
                <Phone className="absolute left-3 top-9 w-5 h-5 text-gray-400" />
                <Input
                  label="Phone Number"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+27 XX XXX XXXX"
                  error={errors.phone}
                  className="pl-10"
                  required
                />
              </div>

              {isAccommodation ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Check-in"
                      type="date"
                      value={formData.check_in_date}
                      onChange={(e) => updateField('check_in_date', e.target.value)}
                    />
                    <Input
                      label="Check-out"
                      type="date"
                      value={formData.check_out_date}
                      onChange={(e) => updateField('check_out_date', e.target.value)}
                      error={errors.check_out_date}
                    />
                  </div>
                  <Input
                    label="Number of Guests"
                    type="number"
                    min="1"
                    value={formData.guest_count}
                    onChange={(e) => updateField('guest_count', e.target.value)}
                    placeholder="e.g., 4"
                  />
                </>
              ) : (
                <>
                  {/* Rent or buy */}
                  <fieldset>
                    <legend className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">
                      Are you looking to rent or buy?
                    </legend>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup">
                      {LEAD_INTENTS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={intent === option.value}
                          onClick={() => chooseIntent(option.value)}
                          className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                            intent === option.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {/* Interest Level */}
                  <Select
                    label="How interested are you?"
                    options={INTEREST_LEVELS[intent]}
                    value={formData.interest_level}
                    onChange={(e) => updateField('interest_level', e.target.value)}
                  />

                  {/* Timeline */}
                  <Select
                    label={TIMELINE_LABEL[intent]}
                    options={TIMELINE_OPTIONS[intent]}
                    value={formData.timeline}
                    onChange={(e) => updateField('timeline', e.target.value)}
                  />

                  {/* Budget */}
                  <Input
                    label={BUDGET_FIELD[intent].label}
                    value={formData.budget}
                    onChange={(e) => updateField('budget', e.target.value)}
                    placeholder={BUDGET_FIELD[intent].placeholder}
                  />
                </>
              )}

              {/* Message */}
              <Textarea
                label="Message (Optional)"
                value={formData.message}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="Any specific questions or requirements?"
                rows={3}
              />

              {/* Honeypot: hidden from people, visible to naive bots. */}
              <div aria-hidden="true" className="absolute left-[-9999px] w-px h-px overflow-hidden">
                <label htmlFor="ah_hp_field">Leave this empty</label>
                <input
                  id="ah_hp_field"
                  name="ah_hp_field"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={formData.ah_hp_field}
                  onChange={(e) => updateField('ah_hp_field', e.target.value)}
                />
              </div>

              {/* Consent */}
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.consent}
                    onChange={(e) => updateField('consent', e.target.checked)}
                    className="mt-1 w-4 h-4 rounded accent-primary shrink-0"
                  />
                  <span className="text-sm text-gray-600">
                    {CONSENT_TEXT}{' '}
                    <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline">
                      Privacy Policy
                    </a>
                  </span>
                </label>
                {errors.consent && (
                  <p className="text-sm text-red-600 mt-1">{errors.consent}</p>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                isLoading={submitting}
              >
                Submit Enquiry
              </Button>

              {/* Privacy Note (POPIA) */}
              <p className="text-xs text-gray-500 text-center">
                By submitting this form you consent to AirHouse and the property developer contacting you about this listing,
                in line with our{' '}
                <a href="/legal/privacy" target="_blank" rel="noreferrer" className="text-primary underline">Privacy Policy</a>.
                Your information is processed under POPIA. You can withdraw consent or request deletion at any time by emailing
                <a href="mailto:privacy@airhouse.co.za" className="text-primary underline"> privacy@airhouse.co.za</a>.
              </p>
            </form>
          </Card>
        </div>
      </div>

      {/* Image Lightbox */}
      {selectedImageIndex !== null && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setSelectedImageIndex(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300" onClick={() => setSelectedImageIndex(null)}>
            <X className="w-8 h-8" />
          </button>
          {propertyImages.length > 1 && (
            <>
              <button 
                className="absolute left-4 text-white hover:text-gray-300 p-2"
                onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(prev => prev > 0 ? prev - 1 : propertyImages.length - 1) }}
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button 
                className="absolute right-4 text-white hover:text-gray-300 p-2"
                onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(prev => prev < propertyImages.length - 1 ? prev + 1 : 0) }}
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}
          <img 
            src={propertyImages[selectedImageIndex]} 
            alt={`Property ${selectedImageIndex + 1}`} 
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 text-white text-sm">
            {selectedImageIndex + 1} / {propertyImages.length}
          </div>
        </div>
      )}
    </div>
  )
}

export default LeadCaptureForm
