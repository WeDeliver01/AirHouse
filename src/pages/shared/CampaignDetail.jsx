import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Card, Button, Badge, Avatar, Modal, ModalFooter, Textarea, EmptyState, StatCard, LoadingSpinner, ErrorState } from '../../components/ui'
import { toast } from 'react-hot-toast'
import { formatDate, formatCurrency } from '../../lib/utils'
import { Building2, MapPin, DollarSign, Users, TrendingUp, FileText, ArrowLeft, Edit, UserPlus, Copy, Image, Download, ChevronLeft, ChevronRight, X, Home, Bed, Bath, Car, Ruler } from 'lucide-react'

const CampaignDetail = () => {
  const { campaignId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const isCreator = profile?.role === 'creator'
  const isDeveloper = profile?.role === 'developer'

  const [campaign, setCampaign] = useState(null)
  const [applications, setApplications] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [applying, setApplying] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [pitchMessage, setPitchMessage] = useState('')
  const [selectedImageIndex, setSelectedImageIndex] = useState(null)

  useEffect(() => {
    const fetchCampaign = async () => {
      setError(null)
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select(`*, developer:profiles!developer_id (id, full_name, company_name, avatar_url), assignment:campaign_assignments (id, creator:creator_profiles (id, user:profiles (id, full_name, avatar_url))), property:properties (id, title, slug, location_city, location_suburb, bedrooms, bathrooms, parking, floor_area_sqm, price_zar, photo_urls, status)`)
          .eq('id', campaignId)
          .single()

        if (error) throw error
        setCampaign(data)

        if (isDeveloper) {
          const { data: appsData } = await supabase.from('campaign_applications').select(`*, creator:creator_profiles (id, follower_count, user:profiles (id, full_name, avatar_url))`).eq('campaign_id', campaignId)
          setApplications(appsData || [])
          const { data: leadsData } = await supabase.from('leads').select('*').eq('campaign_id', campaignId)
          setLeads(leadsData || [])
        }
      } catch (err) {
        console.error('Error:', err)
        setError('Failed to load campaign')
      } finally {
        setLoading(false)
      }
    }
    fetchCampaign()
  }, [campaignId, isDeveloper])

  const handleApply = async () => {
    if (!pitchMessage.trim()) { toast.error('Please write a pitch'); return }
    setApplying(true)
    try {
      const { data: cp } = await supabase.from('creator_profiles').select('id').eq('user_id', user.id).single()
      if (!cp) { toast.error('Complete your profile first'); return }
      const { error } = await supabase.from('campaign_applications').insert({ campaign_id: campaignId, creator_id: cp.id, pitch_message: pitchMessage, status: 'pending' })
      if (error) throw error
      toast.success('Application submitted!')
      setShowApplyModal(false)
    } catch (error) {
      toast.error(error.code === '23505' ? 'Already applied' : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  const getStatusBadge = (status) => ({ draft: { variant: 'secondary', label: 'Draft' }, open: { variant: 'primary', label: 'Open' }, active: { variant: 'success', label: 'Active' }, completed: { variant: 'success', label: 'Completed' } }[status] || { variant: 'secondary', label: status })

  const propertyImages = campaign?.property_images || []
  const brochureUrls = campaign?.brochure_urls || []

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />
  if (!campaign) return <EmptyState icon={Building2} title="Campaign not found" description="The campaign you're looking for doesn't exist or has been removed." action={() => navigate(-1)} actionLabel="Go Back" />

  const statusBadge = getStatusBadge(campaign.status)
  const deliverables = campaign.deliverables || []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900"><ArrowLeft className="w-4 h-4" />Back</button>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{campaign.title}</h1>
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-gray-500 text-sm">
            <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{campaign.property_name}</span>
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{campaign.property_location}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {isCreator && campaign.status === 'open' && <Button variant="primary" onClick={() => setShowApplyModal(true)}><UserPlus className="w-4 h-4 mr-2" />Apply</Button>}
          {isDeveloper && campaign.developer_id === user.id && (
            <>
              <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/lead/${campaignId}`); toast.success('Link copied!') }}><Copy className="w-4 h-4 mr-2" />Copy Lead Link</Button>
              <Link to={`/developer/campaigns/${campaignId}/edit`}><Button variant="secondary"><Edit className="w-4 h-4 mr-2" />Edit</Button></Link>
            </>
          )}
        </div>
      </div>

      {/* Linked Property */}
      {campaign.property && (
        <Card>
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Home className="w-5 h-5 text-primary" />
              Linked Property
            </h2>
            {isDeveloper && campaign.developer_id === user.id && (
              <Link to={`/developer/properties/${campaign.property.id}/edit`}>
                <Button variant="secondary" size="sm">
                  <Edit className="w-3.5 h-3.5 mr-1" />Edit Property
                </Button>
              </Link>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-56 h-40 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
              {campaign.property.photo_urls?.[0] ? (
                <img
                  src={campaign.property.photo_urls[0]}
                  alt={campaign.property.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <Image className="w-10 h-10" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-lg truncate">{campaign.property.title}</h3>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {[campaign.property.location_suburb, campaign.property.location_city]
                  .filter(Boolean)
                  .join(', ') || 'Location pending'}
              </p>
              <div className="text-sm text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                {campaign.property.bedrooms != null && (
                  <span className="flex items-center gap-1"><Bed className="w-4 h-4" />{campaign.property.bedrooms} beds</span>
                )}
                {campaign.property.bathrooms != null && (
                  <span className="flex items-center gap-1"><Bath className="w-4 h-4" />{campaign.property.bathrooms} baths</span>
                )}
                {campaign.property.parking != null && (
                  <span className="flex items-center gap-1"><Car className="w-4 h-4" />{campaign.property.parking} parking</span>
                )}
                {campaign.property.floor_area_sqm != null && (
                  <span className="flex items-center gap-1"><Ruler className="w-4 h-4" />{campaign.property.floor_area_sqm}m²</span>
                )}
              </div>
              {campaign.property.price_zar != null && (
                <div className="mt-3 text-xl font-bold text-gray-900">
                  {formatCurrency(campaign.property.price_zar)}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Property Images Gallery */}
      {propertyImages.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Image className="w-5 h-5 text-primary" />
            Property Images
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {propertyImages.map((url, index) => (
              <div 
                key={index} 
                className="aspect-video rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-gray-100"
                onClick={() => setSelectedImageIndex(index)}
              >
                <img src={url} alt={`Property ${index + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Brochures / Documents */}
      {brochureUrls.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Brochures & Documents
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {brochureUrls.map((url, index) => {
              const isPdf = url.toLowerCase().includes('.pdf')
              const fileName = url.split('/').pop()
              return (
                <a 
                  key={index} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isPdf ? 'bg-red-100' : 'bg-blue-100'}`}>
                    {isPdf ? (
                      <FileText className="w-6 h-6 text-red-600" />
                    ) : (
                      <Image className="w-6 h-6 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{fileName || `Document ${index + 1}`}</p>
                    <p className="text-sm text-gray-500">{isPdf ? 'PDF Document' : 'Image'}</p>
                  </div>
                  <Download className="w-5 h-5 text-gray-400" />
                </a>
              )
            })}
          </div>
        </Card>
      )}

      {isDeveloper && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Budget" value={formatCurrency(campaign.creator_budget || campaign.total_budget)} icon={DollarSign} />
          <StatCard label="Applications" value={applications.length} icon={Users} />
          <StatCard label="Leads" value={leads.length} icon={TrendingUp} />
          <StatCard label="CPL" value={leads.length > 0 ? formatCurrency((campaign.creator_budget || campaign.total_budget) / leads.length) : 'N/A'} icon={DollarSign} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-lg font-semibold mb-3">About This Campaign</h2>
            <p className="text-gray-600 whitespace-pre-line">{campaign.description || 'No description provided.'}</p>
            
            {campaign.key_selling_points && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="font-medium mb-2">Key Selling Points</h3>
                <p className="text-gray-600 whitespace-pre-line">{campaign.key_selling_points}</p>
              </div>
            )}

            {campaign.campaign_objectives && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="font-medium mb-2">Campaign Objectives</h3>
                <p className="text-gray-600 whitespace-pre-line">{campaign.campaign_objectives}</p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold mb-3">Deliverables</h2>
            {deliverables.length > 0 ? (
              <div className="space-y-2">
                {deliverables.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3"><FileText className="w-5 h-5 text-primary" /><div><p className="font-medium">{item.label}</p><p className="text-xs text-gray-500">{item.description}</p></div></div>
                    <Badge variant="secondary">×{item.quantity || 1}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-gray-500">No deliverables defined.</p>}
          </Card>

          {campaign.content_guidelines && (
            <Card>
              <h2 className="text-lg font-semibold mb-3">Content Guidelines</h2>
              <p className="text-gray-600 whitespace-pre-line">{campaign.content_guidelines}</p>
            </Card>
          )}

          {isDeveloper && applications.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold mb-3">Applications ({applications.length})</h2>
              <div className="space-y-3">
                {applications.map(app => (
                  <div key={app.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Avatar name={app.creator?.user?.full_name} src={app.creator?.user?.avatar_url} />
                      <div><p className="font-medium">{app.creator?.user?.full_name}</p><p className="text-xs text-gray-500">{app.creator?.follower_count?.toLocaleString()} followers</p></div>
                    </div>
                    <Badge variant={app.status === 'pending' ? 'warning' : 'success'}>{app.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="font-semibold mb-2">Creator Budget</h3>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(campaign.creator_budget || campaign.total_budget)}</p>
          </Card>
          <Card>
            <h3 className="font-semibold mb-3">Posted By</h3>
            <div className="flex items-center gap-3">
              <Avatar name={campaign.developer?.company_name || campaign.developer?.full_name} src={campaign.developer?.avatar_url} />
              <div><p className="font-medium">{campaign.developer?.company_name || campaign.developer?.full_name}</p><p className="text-xs text-gray-500">Developer</p></div>
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold mb-3">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Start</span><span>{campaign.start_date ? formatDate(campaign.start_date) : 'TBD'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">End</span><span>{campaign.end_date ? formatDate(campaign.end_date) : 'TBD'}</span></div>
            </div>
          </Card>
          {campaign.target_audience && campaign.target_audience.length > 0 && (
            <Card>
              <h3 className="font-semibold mb-3">Target Audience</h3>
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(campaign.target_audience) ? campaign.target_audience : [campaign.target_audience]).map((audience, i) => (
                  <Badge key={i} variant="secondary">{audience}</Badge>
                ))}
              </div>
            </Card>
          )}
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

      <Modal isOpen={showApplyModal} onClose={() => setShowApplyModal(false)} title="Apply to Campaign">
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl"><h4 className="font-medium">{campaign.title}</h4><p className="text-sm text-gray-500">{campaign.property_name} • {formatCurrency(campaign.creator_budget || campaign.total_budget)}</p></div>
          <Textarea label="Your Pitch" value={pitchMessage} onChange={e => setPitchMessage(e.target.value)} placeholder="Why you're perfect for this campaign..." rows={6} />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowApplyModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleApply} isLoading={applying}>Submit</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default CampaignDetail
