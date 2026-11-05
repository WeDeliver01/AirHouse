import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Button, Badge, Modal, Input, LoadingSpinner, ErrorState, EmptyState } from '../../components/ui'
import { formatRelativeTime } from '../../lib/utils'
import { 
  Shield, CheckCircle, Clock, XCircle, Instagram, 
  Award, AlertCircle, FileText, Camera
} from 'lucide-react'
import { cn } from '../../lib/utils'

const verificationTypes = [
  { 
    id: 'id_verification', 
    name: 'ID Verification', 
    icon: FileText, 
    description: 'Verify your identity with a government-issued ID',
    badge: 'ID Verified'
  },
  { 
    id: 'social_proof', 
    name: 'Social Media Verification', 
    icon: Instagram, 
    description: 'Connect and verify your social media accounts',
    badge: 'Social Verified'
  },
  { 
    id: 'portfolio', 
    name: 'Portfolio Review', 
    icon: Camera, 
    description: 'Submit your best work for review',
    badge: 'Portfolio Reviewed'
  }
]

const CreatorVerification = () => {
  const { creatorProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [verifications, setVerifications] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [selectedType, setSelectedType] = useState(null)
  const [formData, setFormData] = useState({
    socialPlatform: 'instagram',
    socialHandle: '',
    followerCount: '',
    documentUrl: ''
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (creatorProfile?.id) fetchVerifications()
  }, [creatorProfile])

  const fetchVerifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase
        .from('creator_verifications')
        .select('*')
        .eq('creator_id', creatorProfile.id)
        .order('created_at', { ascending: false })
      setVerifications(data || [])
    } catch (e) {
      console.error(e)
      setError('Failed to load verification data')
    } finally {
      setLoading(false)
    }
  }

  const submitVerification = async () => {
    if (!selectedType || !creatorProfile?.id) return
    setSubmitting(true)
    try {
      const payload = {
        creator_id: creatorProfile.id,
        verification_type: selectedType.id,
        status: 'pending'
      }

      if (selectedType.id === 'social_proof') {
        payload.social_platform = formData.socialPlatform
        payload.social_handle = formData.socialHandle
        payload.follower_count = parseInt(formData.followerCount) || 0
      } else if (selectedType.id === 'id_verification' || selectedType.id === 'portfolio') {
        payload.document_url = formData.documentUrl
      }

      const { error } = await supabase.from('creator_verifications').insert(payload)
      if (error) throw error

      setShowModal(false)
      setSelectedType(null)
      setFormData({ socialPlatform: 'instagram', socialHandle: '', followerCount: '', documentUrl: '' })
      fetchVerifications()
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: { variant: 'warning', icon: Clock, text: 'Pending Review' },
      approved: { variant: 'success', icon: CheckCircle, text: 'Approved' },
      rejected: { variant: 'error', icon: XCircle, text: 'Rejected' },
      expired: { variant: 'secondary', icon: AlertCircle, text: 'Expired' }
    }
    const s = styles[status] || styles.pending
    return (
      <Badge variant={s.variant} className="flex items-center gap-1">
        <s.icon className="w-3 h-3" />{s.text}
      </Badge>
    )
  }

  const getVerificationLevel = () => {
    const approved = verifications.filter(v => v.status === 'approved').length
    if (approved >= 3) return { level: 'gold', label: 'Gold Verified', color: 'text-yellow-600' }
    if (approved >= 2) return { level: 'silver', label: 'Silver Verified', color: 'text-gray-500' }
    if (approved >= 1) return { level: 'bronze', label: 'Bronze Verified', color: 'text-amber-700' }
    return { level: 'none', label: 'Not Verified', color: 'text-gray-400' }
  }

  const verificationLevel = getVerificationLevel()

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>

  if (error) return <ErrorState message={error} onRetry={fetchVerifications} />

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verification Center</h1>
          <p className="text-gray-500 mt-1">Build trust with verified credentials</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-primary/10 to-teal-50 rounded-2xl p-6 border border-primary/20">
        <div className="flex items-center gap-4">
          <div className={cn('w-16 h-16 rounded-full flex items-center justify-center',
            verificationLevel.level === 'gold' ? 'bg-yellow-100' :
            verificationLevel.level === 'silver' ? 'bg-gray-100' :
            verificationLevel.level === 'bronze' ? 'bg-amber-100' : 'bg-gray-50'
          )}>
            <Award className={cn('w-8 h-8', verificationLevel.color)} />
          </div>
          <div>
            <h3 className={cn('text-xl font-bold', verificationLevel.color)}>{verificationLevel.label}</h3>
            <p className="text-gray-600">
              {verifications.filter(v => v.status === 'approved').length} of {verificationTypes.length} verifications completed
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap">
          {verifications.filter(v => v.status === 'approved').map(v => (
            <Badge key={v.id} variant="success" className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {verificationTypes.find(t => t.id === v.verification_type)?.badge}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {verificationTypes.map(type => {
          const existing = verifications.find(v => v.verification_type === type.id)
          const Icon = type.icon
          return (
            <div key={type.id} className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                {existing && getStatusBadge(existing.status)}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{type.name}</h3>
              <p className="text-sm text-gray-500 mb-4">{type.description}</p>
              {existing ? (
                <div className="text-xs text-gray-400">
                  Submitted {formatRelativeTime(existing.created_at)}
                  {existing.reviewer_notes && (
                    <p className="mt-2 text-gray-600 bg-gray-50 p-2 rounded">
                      Note: {existing.reviewer_notes}
                    </p>
                  )}
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setSelectedType(type)
                    setShowModal(true)
                  }}
                >
                  Start Verification
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Verification History</h3>
        {verifications.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No verifications submitted yet"
            description="Complete verifications above to build trust with developers"
          />
        ) : (
          <div className="space-y-3">
            {verifications.map(v => (
              <div key={v.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium">{verificationTypes.find(t => t.id === v.verification_type)?.name}</p>
                    <p className="text-xs text-gray-400">{formatRelativeTime(v.created_at)}</p>
                  </div>
                </div>
                {getStatusBadge(v.status)}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={`${selectedType?.name}`}>
        <div className="space-y-4">
          {selectedType?.id === 'social_proof' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
                <select
                  value={formData.socialPlatform}
                  onChange={(e) => setFormData(f => ({ ...f, socialPlatform: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="twitter">Twitter/X</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Handle/Username</label>
                <Input
                  placeholder="@yourusername"
                  value={formData.socialHandle}
                  onChange={(e) => setFormData(f => ({ ...f, socialHandle: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Follower Count</label>
                <Input
                  type="number"
                  placeholder="e.g. 10000"
                  value={formData.followerCount}
                  onChange={(e) => setFormData(f => ({ ...f, followerCount: e.target.value }))}
                />
              </div>
            </>
          )}
          {(selectedType?.id === 'id_verification' || selectedType?.id === 'portfolio') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {selectedType?.id === 'id_verification' ? 'Upload ID Document' : 'Portfolio URL'}
              </label>
              <Input
                placeholder={selectedType?.id === 'id_verification' ? 'Document URL or file link' : 'https://yourportfolio.com'}
                value={formData.documentUrl}
                onChange={(e) => setFormData(f => ({ ...f, documentUrl: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">
                {selectedType?.id === 'id_verification' 
                  ? 'Upload your ID to a secure file sharing service and paste the link'
                  : 'Link to your portfolio website or work samples'}
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submitVerification} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit for Review'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default CreatorVerification
