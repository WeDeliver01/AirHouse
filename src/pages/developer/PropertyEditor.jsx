import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  supabase,
  uploadPropertyPhotos,
  deletePropertyPhoto,
} from '../../lib/supabase'
import { Button, Input, Textarea, Select, LoadingSpinner } from '../../components/ui'
import { toast } from 'react-hot-toast'
import {
  ArrowLeft, Upload, X, GripVertical, ChevronUp, ChevronDown, Trash2, Save, Image as ImageIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const MAX_PHOTO_SIZE = 25 * 1024 * 1024 // 25MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'sold', label: 'Sold' },
  { value: 'archived', label: 'Archived' },
]

const slugify = (text) => {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

const numericOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const PropertyEditor = () => {
  const { propertyId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEditing = !!propertyId

  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const [form, setForm] = useState({
    title: '',
    slug: '',
    description: '',
    price_zar: '',
    location_city: '',
    location_suburb: '',
    latitude: '',
    longitude: '',
    bedrooms: '',
    bathrooms: '',
    parking: '',
    floor_area_sqm: '',
    status: 'draft',
  })
  const [slugTouched, setSlugTouched] = useState(false)

  // Photos: array of { url, path?, isNew?, file? }
  const [photos, setPhotos] = useState([])
  // Track removed uploaded paths for deletion on save
  const [removedPaths, setRemovedPaths] = useState([])

  useEffect(() => {
    if (!isEditing) return
    const load = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('id', propertyId)
          .single()
        if (error) throw error
        if (!data) throw new Error('Property not found')

        setForm({
          title: data.title || '',
          slug: data.slug || '',
          description: data.description || '',
          price_zar: data.price_zar ?? '',
          location_city: data.location_city || '',
          location_suburb: data.location_suburb || '',
          latitude: data.latitude ?? '',
          longitude: data.longitude ?? '',
          bedrooms: data.bedrooms ?? '',
          bathrooms: data.bathrooms ?? '',
          parking: data.parking ?? '',
          floor_area_sqm: data.floor_area_sqm ?? '',
          status: data.status || 'draft',
        })
        setSlugTouched(true)
        setPhotos((data.photo_urls || []).map(url => ({ url })))
      } catch (e) {
        console.error(e)
        toast.error('Failed to load property')
        navigate('/developer/properties')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [propertyId, isEditing, navigate])

  const updateField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-fill slug from title until user manually edits the slug
      if (field === 'title' && !slugTouched) {
        next.slug = slugify(value)
      }
      return next
    })
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  // Photo handlers
  const onSelectFiles = (e) => {
    const files = Array.from(e.target.files || [])
    const valid = []
    for (const f of files) {
      if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
        toast.error(`${f.name} must be JPG, PNG or WebP`)
        continue
      }
      if (f.size > MAX_PHOTO_SIZE) {
        toast.error(`${f.name} exceeds 25MB`)
        continue
      }
      valid.push({
        url: URL.createObjectURL(f),
        isNew: true,
        file: f,
      })
    }
    setPhotos(prev => [...prev, ...valid])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = (index) => {
    setPhotos(prev => {
      const item = prev[index]
      if (item?.isNew) {
        try { URL.revokeObjectURL(item.url) } catch (_) {}
      } else if (item?.url) {
        setRemovedPaths(rp => [...rp, item.url])
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const movePhoto = (from, to) => {
    if (to < 0 || to >= photos.length) return
    setPhotos(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const validate = () => {
    const e = {}
    if (!form.title.trim()) e.title = 'Title is required'
    if (!form.slug.trim()) e.slug = 'Slug is required'
    else if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Use lowercase letters, numbers and hyphens only'
    if (form.price_zar !== '' && Number(form.price_zar) < 0) e.price_zar = 'Must be positive'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!user?.id) { toast.error('Please log in'); return }
    if (!validate()) return

    setSaving(true)
    try {
      const payload = {
        developer_id: user.id,
        title: form.title.trim(),
        slug: form.slug.trim(),
        description: form.description || null,
        price_zar: numericOrNull(form.price_zar),
        location_city: form.location_city || null,
        location_suburb: form.location_suburb || null,
        latitude: numericOrNull(form.latitude),
        longitude: numericOrNull(form.longitude),
        bedrooms: numericOrNull(form.bedrooms),
        bathrooms: numericOrNull(form.bathrooms),
        parking: numericOrNull(form.parking),
        floor_area_sqm: numericOrNull(form.floor_area_sqm),
        status: form.status,
      }

      // Step 1: insert/update the row to get an id
      let savedId = propertyId
      if (isEditing) {
        const { error } = await supabase
          .from('properties')
          .update(payload)
          .eq('id', propertyId)
        if (error) throw error
      } else {
        // Start with empty photo_urls; we'll set them after upload
        const { data, error } = await supabase
          .from('properties')
          .insert([{ ...payload, photo_urls: [] }])
          .select()
          .single()
        if (error) throw error
        savedId = data.id
      }

      // Step 2: upload any new photos
      const newFiles = photos.filter(p => p.isNew && p.file).map(p => p.file)
      let uploadedByFile = []
      if (newFiles.length > 0) {
        uploadedByFile = await uploadPropertyPhotos(user.id, savedId, newFiles)
      }

      // Step 3: build the ordered photo_urls array preserving user order
      const uploadedQueue = [...uploadedByFile]
      const finalUrls = photos.map(p => {
        if (p.isNew) {
          const next = uploadedQueue.shift()
          return next ? next.url : null
        }
        return p.url
      }).filter(Boolean)

      // Step 4: persist final photo URLs
      const { error: photoErr } = await supabase
        .from('properties')
        .update({ photo_urls: finalUrls })
        .eq('id', savedId)
      if (photoErr) throw photoErr

      // Step 5: best-effort delete removed photos from storage
      if (removedPaths.length > 0) {
        await Promise.all(removedPaths.map(async (url) => {
          try { await deletePropertyPhoto(url) } catch (e) { console.warn('Delete photo failed', e) }
        }))
      }

      toast.success(isEditing ? 'Property updated' : 'Property created')
      navigate('/developer/properties')
    } catch (e) {
      console.error(e)
      const msg = e?.message || 'Failed to save property'
      if (msg.toLowerCase().includes('duplicate') && msg.toLowerCase().includes('slug')) {
        setErrors(prev => ({ ...prev, slug: 'Slug already in use — try another' }))
        toast.error('Slug already in use')
      } else {
        toast.error(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEditing) return
    if (!window.confirm('Delete this property? Linked campaigns will be unlinked.')) return
    setSaving(true)
    try {
      // Best-effort delete photos from storage
      await Promise.all((photos || []).map(async (p) => {
        if (p.isNew) return
        try { await deletePropertyPhoto(p.url) } catch (e) { console.warn(e) }
      }))
      const { error } = await supabase.from('properties').delete().eq('id', propertyId)
      if (error) throw error
      toast.success('Property deleted')
      navigate('/developer/properties')
    } catch (e) {
      console.error(e)
      toast.error('Failed to delete property')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading property..." /></div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/developer/properties" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
              {isEditing ? 'Edit Property' : 'New Property'}
            </h1>
            <p className="text-gray-500 text-sm truncate">
              {isEditing ? 'Update the listing details and photos.' : 'Fill in the details to create a new property listing.'}
            </p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 space-y-6">
        {/* Basic */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Basic Info</h2>
          <Input label="Title *" value={form.title} onChange={(e) => updateField('title', e.target.value)}
            placeholder="e.g., The Gardens Estate" error={errors.title} />
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Slug *"
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); updateField('slug', e.target.value) }}
              placeholder="the-gardens-estate"
              helperText="Used in URLs. Lowercase letters, numbers and hyphens only."
              error={errors.slug}
            />
            <Select label="Status" value={form.status} onChange={(e) => updateField('status', e.target.value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <Textarea label="Description" value={form.description} onChange={(e) => updateField('description', e.target.value)}
            placeholder="Describe the property, finishes, lifestyle, amenities..." rows={5} />
        </section>

        {/* Pricing */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Pricing</h2>
          <Input label="Asking price (ZAR)" type="number" min="0" value={form.price_zar}
            onChange={(e) => updateField('price_zar', e.target.value)} placeholder="e.g., 4500000"
            error={errors.price_zar} />
        </section>

        {/* Location */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Location</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="City" value={form.location_city} onChange={(e) => updateField('location_city', e.target.value)} placeholder="e.g., Cape Town" />
            <Input label="Suburb" value={form.location_suburb} onChange={(e) => updateField('location_suburb', e.target.value)} placeholder="e.g., Sea Point" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Latitude" type="number" step="0.0000001" value={form.latitude}
              onChange={(e) => updateField('latitude', e.target.value)} placeholder="-33.9249" />
            <Input label="Longitude" type="number" step="0.0000001" value={form.longitude}
              onChange={(e) => updateField('longitude', e.target.value)} placeholder="18.4241" />
          </div>
        </section>

        {/* Specs */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Specifications</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Bedrooms" type="number" min="0" value={form.bedrooms}
              onChange={(e) => updateField('bedrooms', e.target.value)} placeholder="3" />
            <Input label="Bathrooms" type="number" min="0" value={form.bathrooms}
              onChange={(e) => updateField('bathrooms', e.target.value)} placeholder="2" />
            <Input label="Parking" type="number" min="0" value={form.parking}
              onChange={(e) => updateField('parking', e.target.value)} placeholder="2" />
            <Input label="Floor area (m²)" type="number" min="0" step="0.01" value={form.floor_area_sqm}
              onChange={(e) => updateField('floor_area_sqm', e.target.value)} placeholder="120" />
          </div>
        </section>

        {/* Photos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Photos</h2>
            <span className="text-xs text-gray-500">First photo becomes the cover. Reorder with the arrows.</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((p, i) => (
              <div key={`${p.url}-${i}`} className={cn(
                'relative aspect-square rounded-xl overflow-hidden border group',
                p.isNew ? 'border-primary border-dashed' : 'border-gray-200'
              )}>
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-semibold bg-primary text-white rounded">
                    COVER
                  </span>
                )}
                {p.isNew && (
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 text-[10px] font-semibold bg-amber-500 text-white rounded">
                    PENDING
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => movePhoto(i, i - 1)} disabled={i === 0}
                    className="p-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50" title="Move left">
                    <ChevronUp className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                  <button type="button" onClick={() => movePhoto(i, i + 1)} disabled={i === photos.length - 1}
                    className="p-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50" title="Move right">
                    <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-gray-500"
            >
              <Upload className="w-8 h-8" />
              <span className="text-sm">Add Photos</span>
              <span className="text-[11px] text-gray-400">JPG, PNG, WebP · 25MB</span>
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onSelectFiles} />
        </section>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3">
        <div>
          {isEditing && (
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              <Trash2 className="w-4 h-4 mr-2" />Delete
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/developer/properties">
            <Button variant="secondary" disabled={saving}>Cancel</Button>
          </Link>
          <Button variant="primary" onClick={handleSave} isLoading={saving}>
            <Save className="w-4 h-4 mr-2" />{isEditing ? 'Save Changes' : 'Create Property'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default PropertyEditor
