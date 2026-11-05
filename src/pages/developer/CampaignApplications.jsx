import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Card, Badge, Button, Modal, ModalFooter, Avatar, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatCurrency, formatRelativeTime } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import { 
  Users, CheckCircle, XCircle, Eye, Instagram, Youtube, MapPin,
  Star, TrendingUp, Briefcase, MessageSquare, ArrowLeft, UserPlus, Flag
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { notify } from '../../lib/notifications'

const CampaignApplications = () => {
  const { campaignId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [applications, setApplications] = useState([])
  const [assignmentByCreator, setAssignmentByCreator] = useState({})
  const [selectedApp, setSelectedApp] = useState(null)
  const [showCreatorModal, setShowCreatorModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignBudget, setAssignBudget] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (campaignId) fetchData()
  }, [campaignId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch campaign
      const { data: campaignData, error: campError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()

      if (campError) throw campError
      setCampaign(campaignData)
      setAssignBudget(campaignData.creator_budget?.toString() || '')

      // Fetch applications with creator profiles
      const { data: appsData, error: appsError } = await supabase
        .from('campaign_applications')
        .select(`
          *,
          creator:creator_profiles(
            id,
            user_id,
            instagram_handle,
            tiktok_handle,
            youtube_handle,
            follower_count,
            niche,
            location,
            campaigns_completed,
            total_leads_generated,
            reliability_score,
            rate_card,
            portfolio_urls,
            profiles:profiles(full_name, avatar_url, bio, email)
          )
        `)
        .eq('campaign_id', campaignId)
        .order('applied_at', { ascending: false })

      if (appsError) throw appsError
      setApplications(appsData || [])

      // Fetch active assignments for this campaign so the Report button can deep-link
      // to a dispute pre-filled with both campaign AND assignment id (so the reported
      // party can be resolved unambiguously when the dispute is filed).
      const { data: assignmentRows } = await supabase
        .from('campaign_assignments')
        .select('id, creator_id')
        .eq('campaign_id', campaignId)
      const map = {}
      ;(assignmentRows || []).forEach((row) => {
        map[row.creator_id] = row.id
      })
      setAssignmentByCreator(map)
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load applications')
      toast.error('Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  const updateApplicationStatus = async (appId, status) => {
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('campaign_applications')
        .update({ 
          status, 
          responded_at: new Date().toISOString() 
        })
        .eq('id', appId)

      if (error) throw error

      setApplications(applications.map(a => 
        a.id === appId ? { ...a, status, responded_at: new Date().toISOString() } : a
      ))
      toast.success(`Application ${status}`)
      setShowCreatorModal(false)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to update application')
    } finally {
      setProcessing(false)
    }
  }

  const assignCreator = async () => {
    if (!selectedApp || !assignBudget) {
      toast.error('Please enter a budget')
      return
    }

    setProcessing(true)
    try {
      // Create assignment
      const { error: assignError } = await supabase
        .from('campaign_assignments')
        .insert({
          campaign_id: campaignId,
          creator_id: selectedApp.creator.id,
          agreed_budget: parseFloat(assignBudget),
          agreed_deliverables: campaign.deliverables,
        })

      if (assignError) throw assignError

      // Update application status
      await supabase
        .from('campaign_applications')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', selectedApp.id)

      // Update campaign status
      await supabase
        .from('campaigns')
        .update({ status: 'active' })
        .eq('id', campaignId)

      toast.success('Creator assigned successfully!')
      notify.campaignAssigned(selectedApp.creator?.profiles?.email, { creatorName: selectedApp.creator?.profiles?.full_name, campaignTitle: campaign.title || campaign.property_name, developerName: profile?.full_name, budget: assignBudget })
      setShowAssignModal(false)
      setShowCreatorModal(false)
      navigate(`/developer/campaigns/${campaignId}`)
    } catch (error) {
      console.error('Error:', error)
      toast.error(error.message || 'Failed to assign creator')
    } finally {
      setProcessing(false)
    }
  }

  const getStatusBadge = (status) => {
    const config = {
      pending: { variant: 'warning', label: 'Pending' },
      accepted: { variant: 'success', label: 'Accepted' },
      rejected: { variant: 'danger', label: 'Rejected' },
      invited: { variant: 'primary', label: 'Invited' },
    }
    return config[status] || { variant: 'secondary', label: status }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-text-secondary">{campaign?.title} • {applications.length} applications</p>
        </div>
      </div>

      {/* Campaign Summary */}
      <Card className="bg-gray-50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-semibold">{campaign?.property_name}</h2>
            <p className="text-sm text-text-secondary">{campaign?.property_location}</p>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-text-secondary">Creator Budget</p>
              <p className="font-bold text-success">{formatCurrency(campaign?.creator_budget)}</p>
            </div>
            <div>
              <p className="text-text-secondary">Deliverables</p>
              <p className="font-bold">{campaign?.deliverables?.length || 0} items</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Applications List */}
      {applications.length > 0 ? (
        <div className="space-y-4">
          {applications.map((app) => {
            const status = getStatusBadge(app.status)
            const creator = app.creator
            const profile = creator?.profiles

            return (
              <Card key={app.id} className="hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Avatar 
                      src={profile?.avatar_url} 
                      alt={profile?.full_name}
                      size="lg"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{profile?.full_name || 'Creator'}</h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                        {creator?.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{creator.location}
                          </span>
                        )}
                        {creator?.follower_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />{(creator.follower_count / 1000).toFixed(1)}K
                          </span>
                        )}
                        {creator?.instagram_handle && (
                          <span className="flex items-center gap-1">
                            <Instagram className="w-3 h-3" />@{creator.instagram_handle}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary mt-1">
                        Applied {formatRelativeTime(app.applied_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <p className="text-text-secondary">Campaigns</p>
                      <p className="font-semibold">{creator?.campaigns_completed || 0}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-text-secondary">Leads</p>
                      <p className="font-semibold">{creator?.total_leads_generated || 0}</p>
                    </div>
                    <Button 
                      variant="primary" 
                      size="sm"
                      onClick={() => { setSelectedApp(app); setShowCreatorModal(true) }}
                    >
                      <Eye className="w-4 h-4 mr-1" />Review
                    </Button>
                    {app.status === 'accepted' && assignmentByCreator[app.creator?.id] && (
                      <Link
                        to={`/developer/disputes?campaign=${campaignId}&assignment=${assignmentByCreator[app.creator.id]}`}
                        title="Report an issue with this creator"
                      >
                        <Button variant="secondary" size="sm">
                          <Flag className="w-4 h-4 mr-1" />Report
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>

                {app.pitch_message && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-text-secondary mb-1">Pitch:</p>
                    <p className="text-sm">{app.pitch_message}</p>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="No applications yet"
          description="Applications will appear here when creators apply"
        />
      )}

      {/* Creator Detail Modal */}
      <Modal
        isOpen={showCreatorModal}
        onClose={() => setShowCreatorModal(false)}
        title="Review Application"
        size="lg"
      >
        {selectedApp && (
          <div className="space-y-6">
            {/* Creator Header */}
            <div className="flex items-center gap-4">
              <Avatar 
                src={selectedApp.creator?.profiles?.avatar_url} 
                alt={selectedApp.creator?.profiles?.full_name}
                size="xl"
              />
              <div>
                <h3 className="text-xl font-semibold">{selectedApp.creator?.profiles?.full_name}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                  {selectedApp.creator?.location && (
                    <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{selectedApp.creator.location}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <Users className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="font-bold">{((selectedApp.creator?.follower_count || 0) / 1000).toFixed(1)}K</p>
                <p className="text-xs text-text-secondary">Followers</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <Briefcase className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="font-bold">{selectedApp.creator?.campaigns_completed || 0}</p>
                <p className="text-xs text-text-secondary">Campaigns</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="font-bold">{selectedApp.creator?.total_leads_generated || 0}</p>
                <p className="text-xs text-text-secondary">Leads</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <Star className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="font-bold">{selectedApp.creator?.reliability_score || 100}%</p>
                <p className="text-xs text-text-secondary">Score</p>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex flex-wrap gap-2">
              {selectedApp.creator?.instagram_handle && (
                <a href={`https://instagram.com/${selectedApp.creator.instagram_handle}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-pink-50 text-pink-600 rounded-lg text-sm">
                  <Instagram className="w-4 h-4" />@{selectedApp.creator.instagram_handle}
                </a>
              )}
              {selectedApp.creator?.youtube_handle && (
                <a href={`https://youtube.com/@${selectedApp.creator.youtube_handle}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm">
                  <Youtube className="w-4 h-4" />{selectedApp.creator.youtube_handle}
                </a>
              )}
            </div>

            {/* Niches */}
            {selectedApp.creator?.niche?.length > 0 && (
              <div>
                <p className="text-sm text-text-secondary mb-2">Specializations</p>
                <div className="flex flex-wrap gap-2">
                  {selectedApp.creator.niche.map((n, i) => (
                    <Badge key={i} variant="secondary">{n}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Pitch */}
            {selectedApp.pitch_message && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-text-secondary mb-1 flex items-center gap-1">
                  <MessageSquare className="w-4 h-4" />Application Pitch
                </p>
                <p>{selectedApp.pitch_message}</p>
              </div>
            )}

            {/* Rate Card */}
            {selectedApp.creator?.rate_card && Object.keys(selectedApp.creator.rate_card).length > 0 && (
              <div>
                <p className="text-sm text-text-secondary mb-2">Rate Card</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selectedApp.creator.rate_card).map(([key, value]) => (
                    <div key={key} className="flex justify-between p-2 bg-gray-50 rounded-lg text-sm">
                      <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="font-semibold">{formatCurrency(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <ModalFooter>
          {selectedApp?.status === 'pending' && (
            <>
              <Button 
                variant="secondary" 
                onClick={() => updateApplicationStatus(selectedApp.id, 'rejected')}
                disabled={processing}
              >
                <XCircle className="w-4 h-4 mr-2" />Reject
              </Button>
              <Button 
                variant="primary" 
                onClick={() => setShowAssignModal(true)}
                disabled={processing}
              >
                <UserPlus className="w-4 h-4 mr-2" />Assign Creator
              </Button>
            </>
          )}
          {selectedApp?.status !== 'pending' && (
            <Button variant="secondary" onClick={() => setShowCreatorModal(false)}>Close</Button>
          )}
        </ModalFooter>
      </Modal>

      {/* Assign Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign Creator to Campaign"
      >
        <div className="space-y-4">
          <p className="text-text-secondary">
            You're about to assign <strong>{selectedApp?.creator?.profiles?.full_name}</strong> to this campaign.
          </p>
          <div>
            <label className="label">Agreed Budget (ZAR)</label>
            <input
              type="number"
              value={assignBudget}
              onChange={(e) => setAssignBudget(e.target.value)}
              className="input"
              placeholder="Enter agreed budget"
            />
            <p className="text-xs text-text-secondary mt-1">
              Campaign creator budget: {formatCurrency(campaign?.creator_budget)}
            </p>
          </div>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <p className="text-amber-800">
              Once assigned, the creator will receive a unique referral link and can start working on deliverables.
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAssignModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={assignCreator} isLoading={processing}>
            <CheckCircle className="w-4 h-4 mr-2" />Confirm Assignment
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default CampaignApplications
