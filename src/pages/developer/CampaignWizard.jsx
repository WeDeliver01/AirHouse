import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase, uploadCampaignMedia, deleteCampaignMedia } from '../../lib/supabase'
import { toast } from 'react-hot-toast'
import { formatCurrency, cn } from '../../lib/utils'
import {
  PageHeader, Button, Card, Chip, Icon, Input, Textarea, Select,
} from '../../components/stitch'

const PLATFORM_FEE_RATE = 0.25
const MAX_IMAGE_SIZE = 50 * 1024 * 1024
const MAX_BROCHURE_SIZE = 100 * 1024 * 1024

const STEPS = [
  { id: 1, title: 'Property Details', icon: 'apartment' },
  { id: 2, title: 'Media & Brochures', icon: 'image' },
  { id: 3, title: 'Campaign Goals', icon: 'target' },
  { id: 4, title: 'Budget & Timeline', icon: 'paid' },
  { id: 5, title: 'Deliverables', icon: 'list_alt' },
  { id: 6, title: 'Review & Launch', icon: 'rocket_launch' },
]

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment Complex' },
  { value: 'townhouse', label: 'Townhouse Development' },
  { value: 'house', label: 'Single Family Homes' },
  { value: 'mixed', label: 'Mixed-Use Development' },
  { value: 'commercial', label: 'Commercial Property' },
  { value: 'luxury', label: 'Luxury Estate' },
]

const TARGET_AUDIENCES = [
  'First-time buyers', 'Young professionals', 'Families', 'Investors',
  'Retirees', 'Students', 'High-net-worth individuals',
]

const DELIVERABLE_TEMPLATES = [
  { type: 'instagram_reel',  label: 'Instagram Reel',    description: '30-60s vertical video' },
  { type: 'instagram_post',  label: 'Instagram Post',    description: 'Carousel or single image' },
  { type: 'instagram_story', label: 'Instagram Stories', description: 'Series of story slides' },
  { type: 'tiktok_video',    label: 'TikTok Video',      description: 'Engaging short-form video' },
  { type: 'youtube_short',   label: 'YouTube Short',     description: 'Vertical short video' },
  { type: 'youtube_video',   label: 'YouTube Video',     description: 'Full property tour' },
  { type: 'blog_post',       label: 'Blog/Article',      description: 'Written content with images' },
  { type: 'drone_footage',   label: 'Drone Footage',     description: 'Aerial property shots' },
]

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CommissionBreakdown = ({ totalBudget }) => {
  const budget = parseFloat(totalBudget) || 0
  if (budget < 5000) return null
  const platformFee = budget * PLATFORM_FEE_RATE
  const creatorBudget = budget - platformFee
  return (
    <Card className="bg-surface-container-low">
      <div className="flex items-start gap-sm mb-sm">
        <Icon name="info" size={20} className="text-primary flex-shrink-0 mt-xs" />
        <div>
          <p className="font-label-lg text-label-lg text-on-surface">Budget Breakdown</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Your campaign budget includes a 25% platform listing fee.
          </p>
        </div>
      </div>
      <dl className="flex flex-col gap-xs font-body-sm text-body-sm">
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Total Campaign Budget</dt>
          <dd className="font-data-mono text-on-surface">{formatCurrency(budget)}</dd>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <dt>Platform Listing Fee (25%)</dt>
          <dd className="font-data-mono">−{formatCurrency(platformFee)}</dd>
        </div>
        <div className="border-t border-outline-variant pt-xs flex justify-between">
          <dt className="font-label-lg text-label-lg text-on-surface">Creator Budget</dt>
          <dd className="font-data-mono font-label-lg text-label-lg text-secondary">
            {formatCurrency(creatorBudget)}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

const CampaignWizard = () => {
  const { campaignId } = useParams()
  const [searchParams] = useSearchParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const isEditing = !!campaignId
  const imageInputRef = useRef(null)
  const brochureInputRef = useRef(null)

  const [formData, setFormData] = useState({
    title: '', property_name: '', property_location: '', property_type: '', description: '',
    target_audience: [], campaign_objectives: '', key_selling_points: '',
    total_budget: '', start_date: '', end_date: '', payment_structure: 'milestone',
    deliverables: [], content_guidelines: '', brand_assets_url: '', landing_page_url: '',
    property_id: '',
  })

  // Available properties owned by this developer
  const [propertyOptions, setPropertyOptions] = useState([])
  const [loadingProperties, setLoadingProperties] = useState(true)

  const [propertyImages, setPropertyImages] = useState([])
  const [brochures, setBrochures] = useState([])
  const [pendingImageFiles, setPendingImageFiles] = useState([])
  const [pendingBrochureFiles, setPendingBrochureFiles] = useState([])
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (profile && profile.role !== 'developer' && profile.role !== 'admin') {
      toast.error('Only developers can create campaigns')
      navigate('/')
    }
  }, [profile, navigate])

  // Load this developer's properties for the linker
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const load = async () => {
      setLoadingProperties(true)
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('id, title, slug, location_city, location_suburb, status, photo_urls, description, price_zar, bedrooms, bathrooms, parking, floor_area_sqm')
          .eq('developer_id', user.id)
          .order('created_at', { ascending: false })
        if (error) throw error
        if (!cancelled) setPropertyOptions(data || [])
      } catch (e) {
        // Properties feature is optional — ignore failure (e.g., migration not yet run)
        console.warn('Could not load properties for linker:', e)
        if (!cancelled) setPropertyOptions([])
      } finally {
        if (!cancelled) setLoadingProperties(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  // Pre-select a property from URL ?property_id=... for new campaigns
  useEffect(() => {
    if (isEditing) return
    const pid = searchParams.get('property_id')
    if (!pid) return
    if (formData.property_id) return
    if (propertyOptions.length === 0) return
    const match = propertyOptions.find(p => p.id === pid)
    if (match) applyPropertyToBriefing(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyOptions])

  const applyPropertyToBriefing = (property) => {
    setFormData(prev => {
      const loc = [property.location_suburb, property.location_city].filter(Boolean).join(', ')
      return {
        ...prev,
        property_id: property.id,
        // Only fill empty fields — never overwrite developer-entered values
        property_name: prev.property_name || property.title || '',
        property_location: prev.property_location || loc,
        description: prev.description || property.description || '',
      }
    })
  }

  const handlePropertySelect = (id) => {
    if (!id) {
      setFormData(prev => ({ ...prev, property_id: '' }))
      return
    }
    const match = propertyOptions.find(p => p.id === id)
    if (match) applyPropertyToBriefing(match)
  }

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const toggleAudience = (audience) => {
    const current = formData.target_audience
    updateField('target_audience', current.includes(audience)
      ? current.filter((a) => a !== audience)
      : [...current, audience])
  }

  const addDeliverable = (template) => {
    const existing = formData.deliverables.find((d) => d.type === template.type)
    if (existing) {
      updateField('deliverables', formData.deliverables.map((d) =>
        d.type === template.type ? { ...d, quantity: d.quantity + 1 } : d))
    } else {
      updateField('deliverables', [...formData.deliverables, { ...template, quantity: 1 }])
    }
  }
  const updateDeliverableQty = (type, qty) => {
    if (qty <= 0) updateField('deliverables', formData.deliverables.filter((d) => d.type !== type))
    else updateField('deliverables', formData.deliverables.map((d) =>
      d.type === type ? { ...d, quantity: qty } : d))
  }

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`); return false
      }
      if (file.size > MAX_IMAGE_SIZE) {
        toast.error(`${file.name} exceeds 50MB limit`); return false
      }
      return true
    })
    const newPreviews = validFiles.map((file) => ({
      file, previewUrl: URL.createObjectURL(file), name: file.name, size: file.size,
    }))
    setPendingImageFiles((prev) => [...prev, ...newPreviews])
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const handleBrochureSelect = (e) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter((file) => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name} must be PDF or image`); return false
      }
      if (file.size > MAX_BROCHURE_SIZE) {
        toast.error(`${file.name} exceeds 100MB limit`); return false
      }
      return true
    })
    const newPreviews = validFiles.map((file) => ({
      file, name: file.name, size: file.size, type: file.type,
    }))
    setPendingBrochureFiles((prev) => [...prev, ...newPreviews])
    if (brochureInputRef.current) brochureInputRef.current.value = ''
  }

  const removePendingImage = (index) => {
    setPendingImageFiles((prev) => {
      const next = [...prev]
      URL.revokeObjectURL(next[index].previewUrl)
      next.splice(index, 1)
      return next
    })
  }
  const removePendingBrochure = (index) => {
    setPendingBrochureFiles((prev) => {
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
  }
  const removeUploadedImage = async (index) => {
    try {
      const image = propertyImages[index]
      if (image.path) await deleteCampaignMedia(image.path)
      setPropertyImages((prev) => prev.filter((_, i) => i !== index))
    } catch {
      toast.error('Failed to delete image')
    }
  }
  const removeUploadedBrochure = async (index) => {
    try {
      const brochure = brochures[index]
      if (brochure.path) await deleteCampaignMedia(brochure.path)
      setBrochures((prev) => prev.filter((_, i) => i !== index))
    } catch {
      toast.error('Failed to delete brochure')
    }
  }

  const validateStep = (step) => {
    const newErrors = {}
    if (step === 1) {
      if (!formData.title.trim()) newErrors.title = 'Required'
      if (!formData.property_name.trim()) newErrors.property_name = 'Required'
      if (!formData.property_location.trim()) newErrors.property_location = 'Required'
      if (!formData.property_type) newErrors.property_type = 'Required'
    }
    if (step === 2) {
      if (propertyImages.length === 0 && pendingImageFiles.length === 0) {
        newErrors.images = 'Upload at least one property image'
      }
    }
    if (step === 3 && formData.target_audience.length === 0) {
      newErrors.target_audience = 'Select at least one'
    }
    if (step === 4) {
      const budget = parseFloat(formData.total_budget)
      if (!formData.total_budget || isNaN(budget)) newErrors.total_budget = 'Required'
      else if (budget < 5000) newErrors.total_budget = 'Minimum R5,000'
      if (!formData.start_date) newErrors.start_date = 'Required'
      if (!formData.end_date) newErrors.end_date = 'Required'
    }
    if (step === 5 && formData.deliverables.length === 0) {
      newErrors.deliverables = 'Add at least one'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const nextStep = () => validateStep(currentStep) && setCurrentStep((p) => Math.min(p + 1, 6))
  const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1))

  const handleSubmit = async (status = 'draft') => {
    if (!validateStep(currentStep)) return
    if (!user?.id) { toast.error('Please log in'); return }
    setLoading(true)
    try {
      const totalBudget = parseFloat(formData.total_budget)
      const platformFee = totalBudget * PLATFORM_FEE_RATE
      const creatorBudget = totalBudget - platformFee
      const campaignData = {
        developer_id: user.id,
        title: formData.title,
        description: formData.description,
        property_name: formData.property_name,
        property_location: formData.property_location,
        property_type: formData.property_type,
        target_audience: formData.target_audience,
        campaign_objectives: formData.campaign_objectives,
        key_selling_points: formData.key_selling_points,
        total_budget: totalBudget,
        platform_fee: platformFee,
        creator_budget: creatorBudget,
        start_date: formData.start_date,
        end_date: formData.end_date,
        payment_structure: formData.payment_structure,
        deliverables: formData.deliverables,
        content_guidelines: formData.content_guidelines,
        brand_assets_url: formData.brand_assets_url,
        landing_page_url: formData.landing_page_url,
        property_id: formData.property_id || null,
        status,
      }
      let savedCampaignId = campaignId
      if (isEditing) {
        const { error } = await supabase.from('campaigns').update(campaignData).eq('id', campaignId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('campaigns').insert([campaignData]).select().single()
        if (error) throw error
        savedCampaignId = data.id
      }
      if (pendingImageFiles.length > 0) {
        setUploadingMedia(true)
        for (const item of pendingImageFiles) {
          try {
            const result = await uploadCampaignMedia(savedCampaignId, item.file, 'image')
            setPropertyImages((prev) => [...prev, result])
          } catch (e) { console.error('Image upload error:', e) }
        }
        setPendingImageFiles([])
      }
      if (pendingBrochureFiles.length > 0) {
        for (const item of pendingBrochureFiles) {
          try {
            const result = await uploadCampaignMedia(savedCampaignId, item.file, 'brochure')
            setBrochures((prev) => [...prev, result])
          } catch (e) { console.error('Brochure upload error:', e) }
        }
        setPendingBrochureFiles([])
      }
      const mediaUrls = {
        property_images: [
          ...propertyImages,
          ...pendingImageFiles.map((f) => ({ url: f.previewUrl, name: f.name })),
        ].map((i) => i.url),
        brochure_urls: brochures.map((b) => b.url),
      }
      await supabase.from('campaigns').update(mediaUrls).eq('id', savedCampaignId)
      toast.success(status === 'open' ? 'Campaign published!' : 'Campaign saved as draft')
      navigate('/developer/campaigns')
    } catch (e) {
      console.error('Submit error:', e)
      toast.error('Failed to save campaign')
    } finally {
      setLoading(false)
      setUploadingMedia(false)
    }
  }

  return (
    <div className="flex flex-col gap-gutter max-w-5xl mx-auto w-full">
      <PageHeader
        eyebrow={isEditing ? 'Edit Campaign' : 'Create Campaign'}
        title={isEditing ? 'Update your campaign' : 'Launch a new campaign'}
        description="Move through each step to complete your property marketing brief."
      />

      {/* Progress steps */}
      <div className="overflow-x-auto -mx-md px-md">
        <div className="flex gap-xs min-w-max">
          {STEPS.map((step) => {
            const state = currentStep === step.id ? 'current' : currentStep > step.id ? 'done' : 'upcoming'
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setCurrentStep(step.id)}
                className={cn(
                  'flex items-center gap-xs px-sm py-xs rounded font-label-md text-label-md uppercase tracking-wider transition-colors border',
                  state === 'current' && 'bg-primary text-on-primary border-primary',
                  state === 'done'    && 'bg-secondary-container text-on-secondary-container border-transparent',
                  state === 'upcoming'&& 'bg-surface-container-low text-on-surface-variant border-outline-variant',
                )}
              >
                <Icon name={state === 'done' ? 'check' : step.icon} size={16} />
                <span className="hidden sm:inline">{step.title}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Card className="flex flex-col gap-md">
        {/* Step 1 */}
        {currentStep === 1 && (
          <div className="flex flex-col gap-md">
            <h2 className="font-headline-md text-headline-md text-on-surface">Property Details</h2>

            {/* Link to existing Property */}
            <Card className="bg-primary-container/20 flex flex-col gap-sm">
              <div className="flex items-start gap-sm">
                <Icon name="home" className="text-primary mt-xs" size={20} />
                <div className="flex-1 min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface">Link a Property (optional)</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Pick a property listing to auto-fill the briefing fields below.
                  </p>
                </div>
              </div>

              {loadingProperties ? (
                <div className="font-body-sm text-body-sm text-on-surface-variant italic">Loading properties…</div>
              ) : propertyOptions.length === 0 ? (
                <div className="font-body-sm text-body-sm text-on-surface-variant">
                  You haven’t added any properties yet.{' '}
                  <Link to="/developer/properties/new" className="text-primary font-medium underline">
                    Create your first property
                  </Link>
                  .
                </div>
              ) : (
                <Select
                  label="Existing Property"
                  value={formData.property_id}
                  onChange={(e) => handlePropertySelect(e.target.value)}
                >
                  <option value="">— No linked property —</option>
                  {propertyOptions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.location_city ? ` — ${p.location_city}` : ''}
                      {p.status !== 'active' ? ` (${p.status})` : ''}
                    </option>
                  ))}
                </Select>
              )}

              {formData.property_id && (() => {
                const linked = propertyOptions.find(p => p.id === formData.property_id)
                if (!linked) return null
                const loc = [linked.location_suburb, linked.location_city].filter(Boolean).join(', ')
                return (
                  <div className="flex items-center gap-sm p-sm bg-surface rounded border border-outline-variant">
                    <div className="w-12 h-12 rounded bg-surface-container-low overflow-hidden flex-shrink-0 flex items-center justify-center border border-outline-variant">
                      {linked.photo_urls?.[0]
                        ? <img src={linked.photo_urls[0]} alt="" className="w-full h-full object-cover" />
                        : <Icon name="home" size={24} className="text-on-surface-variant" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface truncate">{linked.title}</p>
                      <div className="flex items-center gap-xs">
                        <Chip tone="primary" icon="location_on" className="py-0 px-xs h-5">
                          <span className="truncate max-w-[150px]">{loc || 'Location pending'}</span>
                        </Chip>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePropertySelect('')}
                      className="text-error hover:bg-error-container/10"
                    >
                      <Icon name="close" size={18} className="mr-xs" />
                      Unlink
                    </Button>
                  </div>
                )
              })()}
            </Card>

            <Input label="Campaign Title *" value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="e.g., Modern Living at The Gardens" error={errors.title} />
            <div className="grid md:grid-cols-2 gap-sm">
              <Input label="Property / Development Name *" value={formData.property_name}
                onChange={(e) => updateField('property_name', e.target.value)}
                placeholder="e.g., The Gardens Estate" error={errors.property_name} />
              <Input label="Location *" value={formData.property_location}
                onChange={(e) => updateField('property_location', e.target.value)}
                placeholder="e.g., Sandton, Johannesburg" error={errors.property_location} />
            </div>
            <Select label="Property Type *" value={formData.property_type}
              onChange={(e) => updateField('property_type', e.target.value)}
              error={errors.property_type}>
              <option value="">Select type</option>
              {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Textarea label="Description" value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe the property and what makes it unique…" rows={4} />
          </div>
        )}

        {/* Step 2 */}
        {currentStep === 2 && (
          <div className="flex flex-col gap-md">
            <h2 className="font-headline-md text-headline-md text-on-surface">Property Images & Brochures</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Files are stored at full resolution. Images up to 4K, brochures up to 100MB.
            </p>

            <div>
              <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Property Images *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-sm mb-sm">
                {propertyImages.map((img, i) => (
                  <div key={`uploaded-${i}`} className="relative aspect-square rounded overflow-hidden border border-outline-variant group">
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeUploadedImage(i)}
                      className="absolute top-xs right-xs p-xs bg-error text-on-error rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <Icon name="delete" size={16} />
                    </button>
                  </div>
                ))}
                {pendingImageFiles.map((img, i) => (
                  <div key={`pending-${i}`} className="relative aspect-square rounded overflow-hidden border border-primary border-dashed group">
                    <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover opacity-70" />
                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                      <span className="font-label-md text-label-md text-primary uppercase tracking-wider">Pending</span>
                    </div>
                    <button type="button" onClick={() => removePendingImage(i)}
                      className="absolute top-xs right-xs p-xs bg-error text-on-error rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => imageInputRef.current?.click()}
                  className="aspect-square rounded border-2 border-dashed border-outline-variant hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-xs">
                  <Icon name="upload" size={28} className="text-on-surface-variant" />
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Add Images</span>
                </button>
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
              {errors.images && <p className="font-body-sm text-body-sm text-error mt-xs">{errors.images}</p>}
            </div>

            <div>
              <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Brochures & Documents
              </label>
              <div className="flex flex-col gap-xs mb-sm">
                {brochures.map((doc, i) => (
                  <div key={`uploaded-${i}`} className="flex items-center gap-sm p-sm bg-surface-container-low rounded border border-outline-variant">
                    <Icon name="picture_as_pdf" size={28} className="text-error" />
                    <div className="flex-1 min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface truncate">{doc.name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant font-data-mono">
                        {formatFileSize(doc.size)}
                      </p>
                    </div>
                    <button type="button" onClick={() => removeUploadedBrochure(i)}
                      className="p-xs text-error hover:bg-error-container rounded">
                      <Icon name="delete" size={18} />
                    </button>
                  </div>
                ))}
                {pendingBrochureFiles.map((doc, i) => (
                  <div key={`pending-${i}`} className="flex items-center gap-sm p-sm bg-primary-container/10 rounded border border-primary/30">
                    <Icon name="picture_as_pdf" size={28} className="text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface truncate">{doc.name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant font-data-mono">
                        {formatFileSize(doc.size)} — pending upload
                      </p>
                    </div>
                    <button type="button" onClick={() => removePendingBrochure(i)}
                      className="p-xs text-error hover:bg-error-container rounded">
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => brochureInputRef.current?.click()}
                className="w-full p-md border-2 border-dashed border-outline-variant hover:border-primary hover:bg-primary/5 rounded transition-colors flex items-center justify-center gap-sm">
                <Icon name="upload" size={20} className="text-on-surface-variant" />
                <span className="font-label-lg text-label-lg text-on-surface-variant">
                  Upload Brochure or Document
                </span>
              </button>
              <input ref={brochureInputRef} type="file" accept=".pdf,image/*" multiple onChange={handleBrochureSelect} className="hidden" />
            </div>

            <Card className="bg-error-container/30">
              <p className="font-body-sm text-body-sm text-on-surface">
                <span className="font-label-lg text-label-lg uppercase tracking-wider mr-xs">Quality note:</span>
                All uploads keep their original resolution. Use high-resolution source files for the best results.
              </p>
            </Card>
          </div>
        )}

        {/* Step 3 */}
        {currentStep === 3 && (
          <div className="flex flex-col gap-md">
            <h2 className="font-headline-md text-headline-md text-on-surface">Campaign Goals</h2>
            <div>
              <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Target Audience *
              </label>
              <div className="flex flex-wrap gap-xs">
                {TARGET_AUDIENCES.map((a) => {
                  const active = formData.target_audience.includes(a)
                  return (
                    <button key={a} type="button" onClick={() => toggleAudience(a)}
                      className={cn(
                        'px-sm py-xs rounded font-label-md text-label-md uppercase tracking-wider transition-colors border',
                        active
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container-low text-on-surface border-outline-variant hover:border-primary',
                      )}>
                      {a}
                    </button>
                  )
                })}
              </div>
              {errors.target_audience && <p className="font-body-sm text-body-sm text-error mt-xs">{errors.target_audience}</p>}
            </div>
            <Textarea label="Campaign Objectives" value={formData.campaign_objectives}
              onChange={(e) => updateField('campaign_objectives', e.target.value)}
              placeholder="What do you want to achieve? e.g., Generate 50 qualified leads…" rows={3} />
            <Textarea label="Key Selling Points" value={formData.key_selling_points}
              onChange={(e) => updateField('key_selling_points', e.target.value)}
              placeholder="List the main features creators should highlight…" rows={3} />
          </div>
        )}

        {/* Step 4 */}
        {currentStep === 4 && (
          <div className="flex flex-col gap-md">
            <h2 className="font-headline-md text-headline-md text-on-surface">Budget &amp; Timeline</h2>
            <Input label="Total Campaign Budget (ZAR) *" type="number" value={formData.total_budget}
              onChange={(e) => updateField('total_budget', e.target.value)}
              placeholder="e.g., 50000" error={errors.total_budget} />
            <CommissionBreakdown totalBudget={formData.total_budget} />
            <div className="grid md:grid-cols-2 gap-sm">
              <Input label="Start Date *" type="date" value={formData.start_date}
                onChange={(e) => updateField('start_date', e.target.value)} error={errors.start_date} />
              <Input label="End Date *" type="date" value={formData.end_date}
                onChange={(e) => updateField('end_date', e.target.value)} error={errors.end_date} />
            </div>
          </div>
        )}

        {/* Step 5 */}
        {currentStep === 5 && (
          <div className="flex flex-col gap-md">
            <h2 className="font-headline-md text-headline-md text-on-surface">Content Deliverables</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
              {DELIVERABLE_TEMPLATES.map((t) => (
                <button key={t.type} type="button" onClick={() => addDeliverable(t)}
                  className="p-sm border border-outline-variant rounded hover:border-primary hover:bg-primary/5 transition-colors text-left">
                  <p className="font-label-lg text-label-lg text-on-surface">{t.label}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">{t.description}</p>
                </button>
              ))}
            </div>

            {formData.deliverables.length > 0 && (
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                  Selected Deliverables
                </label>
                {formData.deliverables.map((d) => (
                  <div key={d.type} className="flex items-center justify-between p-sm bg-surface-container-low rounded border border-outline-variant">
                    <span className="font-label-lg text-label-lg text-on-surface">{d.label}</span>
                    <div className="flex items-center gap-xs">
                      <button type="button" onClick={() => updateDeliverableQty(d.type, d.quantity - 1)}
                        className="w-8 h-8 rounded bg-surface-container hover:bg-surface-container-high">−</button>
                      <span className="w-8 text-center font-data-mono">{d.quantity}</span>
                      <button type="button" onClick={() => updateDeliverableQty(d.type, d.quantity + 1)}
                        className="w-8 h-8 rounded bg-surface-container hover:bg-surface-container-high">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {errors.deliverables && <p className="font-body-sm text-body-sm text-error">{errors.deliverables}</p>}

            <Textarea label="Content Guidelines" value={formData.content_guidelines}
              onChange={(e) => updateField('content_guidelines', e.target.value)}
              placeholder="Specific requirements, brand voice, hashtags, mentions…" rows={3} />
          </div>
        )}

        {/* Step 6 */}
        {currentStep === 6 && (
          <div className="flex flex-col gap-md">
            <h2 className="font-headline-md text-headline-md text-on-surface">Review &amp; Launch</h2>
            <div className="grid md:grid-cols-2 gap-md">
              <div className="flex flex-col gap-sm">
                <ReviewItem label="Campaign" value={formData.title} />
                <ReviewItem label="Property"
                  value={(
                    <>
                      <span>{formData.property_name}</span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant">
                        {formData.property_location}
                      </span>
                    </>
                  )} />
                <ReviewItem label="Timeline"
                  value={`${formData.start_date} → ${formData.end_date}`}
                  mono />
              </div>
              <div className="flex flex-col gap-sm">
                <Card className="bg-secondary-container/40">
                  <p className="font-label-md text-label-md text-on-secondary-container uppercase tracking-wider">
                    Creator Budget
                  </p>
                  <p className="font-headline-lg text-headline-lg text-on-secondary-container font-data-mono mt-xs">
                    {formatCurrency((parseFloat(formData.total_budget) || 0) * (1 - PLATFORM_FEE_RATE))}
                  </p>
                </Card>
                <ReviewItem label="Media"
                  value={`${propertyImages.length + pendingImageFiles.length} images, ${brochures.length + pendingBrochureFiles.length} brochures`}
                  mono />
                <ReviewItem label="Deliverables"
                  value={`${formData.deliverables.reduce((a, d) => a + d.quantity, 0)} pieces of content`}
                  mono />
              </div>
            </div>

            <div className="flex flex-wrap gap-xs">
              {formData.target_audience.map((a) => <Chip key={a} tone="primary">{a}</Chip>)}
            </div>

            {uploadingMedia && (
              <Card className="bg-primary-container/20">
                <p className="font-label-lg text-label-lg text-on-surface">Uploading media files…</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Hold on while we upload your high-quality images and brochures.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-md pt-md border-t border-outline-variant">
          {currentStep > 1 ? (
            <Button variant="ghost" icon="chevron_left" onClick={prevStep}>Back</Button>
          ) : <div />}
          {currentStep < 6 ? (
            <Button variant="primary" iconRight="chevron_right" onClick={nextStep}>Next</Button>
          ) : (
            <div className="flex gap-xs">
              <Button variant="ghost" onClick={() => handleSubmit('draft')} disabled={loading}>
                Save Draft
              </Button>
              <Button variant="primary" icon="rocket_launch" onClick={() => handleSubmit('open')}
                disabled={loading || uploadingMedia}>
                Publish Campaign
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

const ReviewItem = ({ label, value, mono }) => (
  <Card className="bg-surface-container-low">
    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">{label}</p>
    <div className={cn('mt-xs font-label-lg text-label-lg text-on-surface', mono && 'font-data-mono')}>
      {value || '—'}
    </div>
  </Card>
)

export default CampaignWizard
