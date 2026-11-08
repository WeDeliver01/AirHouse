import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal, ModalFooter, Button, LoadingSpinner, EmptyState, Avatar } from './ui'
import { formatCurrency, cn } from '../lib/utils'
import { toast } from 'react-hot-toast'
import { Briefcase, MapPin, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { notify } from '../lib/notifications'

const INVITABLE_STATUSES = ['open']

const InviteToCampaignModal = ({
  isOpen,
  onClose,
  creatorUserId,
  creatorName,
  creatorAvatarUrl,
}) => {
  const { user, profile } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [creatorProfileId, setCreatorProfileId] = useState(null)
  const [creatorEmail, setCreatorEmail] = useState(null)
  const [existingCampaignIds, setExistingCampaignIds] = useState(new Set())
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen || !user || !creatorUserId) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [campaignsRes, creatorProfileRes, profileRes] = await Promise.all([
          supabase
            .from('campaigns')
            .select('id, title, property_name, property_location, status, creator_budget, deliverables')
            .eq('developer_id', user.id)
            .in('status', INVITABLE_STATUSES)
            .order('created_at', { ascending: false }),
          supabase
            .from('creator_profiles')
            .select('id, user_id')
            .eq('user_id', creatorUserId)
            .single(),
          supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', creatorUserId)
            .single(),
        ])

        if (cancelled) return
        if (campaignsRes.error) throw campaignsRes.error
        if (creatorProfileRes.error) throw creatorProfileRes.error

        const cp = creatorProfileRes.data
        setCreatorProfileId(cp.id)
        setCreatorEmail(profileRes.data?.email || null)

        const campaignList = campaignsRes.data || []
        setCampaigns(campaignList)

        // Detect already-invited campaigns so we can mark them in the UI
        const ids = campaignList.map((c) => c.id)
        let existing = new Set()
        if (ids.length > 0) {
          const { data: existingRows } = await supabase
            .from('campaign_assignments')
            .select('campaign_id')
            .eq('creator_id', cp.id)
            .in('campaign_id', ids)
          existing = new Set((existingRows || []).map((r) => r.campaign_id))
        }
        setExistingCampaignIds(existing)

        // Auto-select first eligible campaign
        const firstEligible = campaignList.find((c) => !existing.has(c.id))
        setSelectedCampaignId(firstEligible?.id || '')
      } catch (err) {
        console.error('Invite modal load error:', err)
        if (!cancelled) setError(err.message || 'Failed to load campaigns')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isOpen, user, creatorUserId])

  // Reset transient state when closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedCampaignId('')
      setError(null)
    }
  }, [isOpen])

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  )

  const handleInvite = async () => {
    if (!selectedCampaign || !creatorProfileId) return
    if (existingCampaignIds.has(selectedCampaign.id)) {
      toast.error(`${creatorName || 'This creator'} is already on that campaign`)
      return
    }

    setSubmitting(true)
    try {
      const { error: insertError } = await supabase
        .from('campaign_assignments')
        .insert({
          campaign_id: selectedCampaign.id,
          creator_id: creatorProfileId,
          agreed_budget: selectedCampaign.creator_budget || null,
          agreed_deliverables: selectedCampaign.deliverables || null,
        })

      if (insertError) {
        // Postgres unique_violation -> duplicate invite
        if (insertError.code === '23505') {
          setExistingCampaignIds((prev) => new Set(prev).add(selectedCampaign.id))
          toast.error(`${creatorName || 'This creator'} is already on that campaign`)
          return
        }
        throw insertError
      }

      // Fire-and-forget email + in-app notification (matches existing assignment flow)
      if (creatorEmail) {
        notify.campaignInvite(creatorEmail, {
          creatorName: creatorName || 'there',
          campaignTitle: selectedCampaign.title || selectedCampaign.property_name || 'your new campaign',
          developerName: profile?.full_name || profile?.company_name || 'A developer',
          budget: selectedCampaign.creator_budget || 0,
        })
      }

      toast.success(`Invited ${creatorName || 'creator'} to ${selectedCampaign.title || selectedCampaign.property_name}`)
      onClose()
    } catch (err) {
      console.error('Invite error:', err)
      toast.error(err.message || 'Failed to send invite')
    } finally {
      setSubmitting(false)
    }
  }

  const eligibleCount = campaigns.filter((c) => !existingCampaignIds.has(c.id)).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite to a campaign"
      description={
        creatorName
          ? `Send ${creatorName} an invite to one of your campaigns.`
          : 'Send this creator an invite to one of your campaigns.'
      }
      size="default"
    >
      <div className="space-y-4">
        {creatorName && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <Avatar src={creatorAvatarUrl} name={creatorName} size="default" />
            <div>
              <p className="font-semibold text-text-primary">{creatorName}</p>
              <p className="text-xs text-text-secondary">Will receive your invite by email</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner size="md" text="Loading your campaigns..." />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No campaigns available"
            description="Create an open campaign first, then come back here to invite creators."
            action={
              <Link to="/developer/campaigns/new">
                <Button variant="primary">Create a campaign</Button>
              </Link>
            }
          />
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              {eligibleCount === 0
                ? 'You\'ve already invited this creator to all of your active campaigns.'
                : 'Choose which campaign you\'d like to invite them to:'}
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {campaigns.map((c) => {
                const alreadyInvited = existingCampaignIds.has(c.id)
                const isSelected = selectedCampaignId === c.id
                return (
                  <label
                    key={c.id}
                    className={cn(
                      'flex items-start gap-3 p-3 border rounded-xl transition-colors',
                      alreadyInvited
                        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                        : isSelected
                          ? 'border-primary bg-primary/5 cursor-pointer'
                          : 'border-gray-200 hover:border-primary/40 cursor-pointer',
                    )}
                  >
                    <input
                      type="radio"
                      name="campaign"
                      value={c.id}
                      checked={isSelected}
                      disabled={alreadyInvited}
                      onChange={() => setSelectedCampaignId(c.id)}
                      className="mt-1 text-primary focus:ring-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-text-primary truncate">
                          {c.title || c.property_name || 'Untitled campaign'}
                        </p>
                        <span
                          className={cn(
                            'text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold',
                            c.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : c.status === 'open'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-text-secondary">
                        {c.property_location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {c.property_location}
                          </span>
                        )}
                        {c.creator_budget && (
                          <span className="font-medium text-emerald-600">
                            {formatCurrency(c.creator_budget)}
                          </span>
                        )}
                      </div>
                      {alreadyInvited && (
                        <p className="text-[11px] text-amber-600 mt-1">Already invited</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </>
        )}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleInvite}
          isLoading={submitting}
          disabled={
            loading ||
            submitting ||
            !selectedCampaignId ||
            existingCampaignIds.has(selectedCampaignId)
          }
        >
          Send invite
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export default InviteToCampaignModal
