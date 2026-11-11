import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../components/stitch'
import { formatRelativeTime, formatCurrency } from '../../lib/utils'
import {
  DISPUTE_STATUS,
  DISPUTE_TYPES,
  attachEvidence,
  getEvidenceSignedUrls,
  resolveDispute,
  sendDisputeMessage,
} from '../../lib/disputes'
import { toast } from 'react-hot-toast'

const rolePathPrefix = (profile) => {
  if (profile?.is_super_admin) return '/admin'
  if (profile?.role === 'developer') return '/developer'
  return '/creator'
}

export default function DisputeDetail() {
  const { disputeId } = useParams()
  const { user, profile, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const messagesEndRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dispute, setDispute] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [messages, setMessages] = useState([])
  const [evidenceLinks, setEvidenceLinks] = useState([])
  const [escrow, setEscrow] = useState(null)
  const [creatorWalletBalance, setCreatorWalletBalance] = useState(0)
  const [contract, setContract] = useState(null)

  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploadingEvidence, setUploadingEvidence] = useState(false)

  const [showResolve, setShowResolve] = useState(false)
  const [resolveData, setResolveData] = useState({
    status: 'resolved',
    notes: '',
    escrowAction: 'none',
    escrowAmount: '',
  })
  const [resolving, setResolving] = useState(false)

  // ---------- load ----------
  useEffect(() => {
    if (disputeId) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const { data: disputeRow, error: dErr } = await supabase
        .from('disputes')
        .select(`
          *,
          campaigns(
            id, title, property_name, property_location, total_budget,
            escrow_amount, amount_paid_out, status, developer_id
          ),
          reporter:reporter_id(id, full_name, avatar_url, role),
          reported_party:reported_party_id(id, full_name, avatar_url, role),
          resolver:resolved_by(full_name)
        `)
        .eq('id', disputeId)
        .maybeSingle()
      if (dErr) throw dErr
      if (!disputeRow) {
        setError('Dispute not found, or you no longer have access to it.')
        setLoading(false)
        return
      }
      setDispute(disputeRow)
      setCampaign(disputeRow.campaigns || null)
      setEscrow(
        disputeRow.campaigns
          ? {
              total_budget: Number(disputeRow.campaigns.total_budget || 0),
              escrow_amount: Number(disputeRow.campaigns.escrow_amount || 0),
              amount_paid_out: Number(disputeRow.campaigns.amount_paid_out || 0),
              status: disputeRow.campaigns.status,
            }
          : null,
      )

      // Assignment context (deliverables / agreed budget)
      if (disputeRow.assignment_id) {
        const { data: aRow } = await supabase
          .from('campaign_assignments')
          .select(
            'id, creator_id, agreed_budget, agreed_deliverables, amount_paid, leads_generated, content_submitted, content_approved',
          )
          .eq('id', disputeRow.assignment_id)
          .maybeSingle()
        setAssignment(aRow || null)

        // There is no escrow to refund from any more: a refund claws the
        // amount back out of the creator's own wallet, so the admin needs
        // to see what is actually available there.
        if (aRow?.creator_id) {
          const { data: walletRow } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', aRow.creator_id)
            .eq('wallet_type', 'creator')
            .maybeSingle()
          setCreatorWalletBalance(Number(walletRow?.balance || 0))
        }
      }

      // Related contract (if any)
      const { data: contractRow } = await supabase
        .from('contracts')
        .select('id, title, status, total_value, signed_at')
        .eq('campaign_id', disputeRow.campaign_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setContract(contractRow || null)

      await loadMessages()
      await refreshEvidence(disputeRow.evidence_urls || [])
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to load dispute')
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('dispute_messages')
      .select('*, sender:sender_id(full_name, avatar_url, role)')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  async function refreshEvidence(paths) {
    if (!paths || paths.length === 0) {
      setEvidenceLinks([])
      return
    }
    const links = await getEvidenceSignedUrls(paths, 60 * 30) // 30 min
    setEvidenceLinks(links)
  }

  // ---------- actions ----------
  async function send() {
    if (!newMessage.trim()) return
    setSending(true)
    try {
      await sendDisputeMessage(disputeId, user.id, newMessage, isSuperAdmin)
      setNewMessage('')
      await loadMessages()
    } catch (e) {
      toast.error(e.message || 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  async function onPickFiles(e) {
    const list = Array.from(e.target.files || [])
    e.target.value = ''
    if (list.length === 0) return
    setUploadingEvidence(true)
    try {
      const merged = await attachEvidence(disputeId, list)
      setDispute((d) => ({ ...d, evidence_urls: merged }))
      await refreshEvidence(merged)
      toast.success(`${list.length} file${list.length === 1 ? '' : 's'} attached`)
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploadingEvidence(false)
    }
  }

  async function submitResolution() {
    if (!resolveData.status) return
    setResolving(true)
    try {
      const result = await resolveDispute({
        disputeId,
        adminId: user.id,
        status: resolveData.status,
        notes: resolveData.notes,
        escrowAction: resolveData.escrowAction || 'none',
        escrowAmount: resolveData.escrowAction !== 'none'
          ? Number(resolveData.escrowAmount) || 0
          : 0,
        campaignId: campaign?.id || dispute?.campaign_id || null,
        creatorId: assignment?.creator_id || null,
      })
      setDispute((d) => ({ ...d, ...result.dispute }))
      // Reload escrow totals so the side panel reflects the movement
      if (result.escrow) {
        await loadAll()
      } else {
        await loadMessages()
      }
      setShowResolve(false)
      toast.success(
        result.escrow
          ? `Dispute updated and R${result.escrow.amount.toFixed(2)} moved`
          : 'Dispute updated',
      )
    } catch (e) {
      toast.error(e.message || 'Could not update dispute')
    } finally {
      setResolving(false)
    }
  }

  // ---------- derived ----------
  const status = useMemo(
    () => (dispute ? DISPUTE_STATUS[dispute.status] || DISPUTE_STATUS.open : null),
    [dispute],
  )
  const type = useMemo(
    () => (dispute ? DISPUTE_TYPES.find((t) => t.id === dispute.dispute_type) : null),
    [dispute],
  )
  const isClosed = dispute && ['resolved', 'closed'].includes(dispute.status)
  // A refund claws money back out of the creator's wallet, so it can never
  // exceed what the creator was actually paid for this campaign, or what
  // is still sitting in their wallet (whichever is smaller).
  const escrowAvailable = escrow
    ? Math.max(0, Math.min(escrow.amount_paid_out, creatorWalletBalance))
    : 0

  const timeline = useMemo(() => {
    if (!dispute) return []
    const items = [
      {
        id: 'created',
        ts: dispute.created_at,
        icon: 'flag',
        title: 'Dispute opened',
        body: `${dispute.reporter?.full_name || 'Reporter'} filed this case.`,
      },
    ]
    messages.forEach((m) => {
      items.push({
        id: m.id,
        ts: m.created_at,
        icon: m.is_admin_message ? 'gavel' : 'forum',
        title: m.is_admin_message
          ? `Super admin · ${m.sender?.full_name || 'Replit'}`
          : m.sender?.full_name || 'Message',
        body: m.message,
        admin: m.is_admin_message,
      })
    })
    if (dispute.resolved_at) {
      items.push({
        id: 'resolved',
        ts: dispute.resolved_at,
        icon: 'check_circle',
        title: `Marked ${dispute.status}`,
        body:
          dispute.resolution_notes ||
          (dispute.resolver?.full_name
            ? `Resolved by ${dispute.resolver.full_name}`
            : 'Resolution recorded.'),
        admin: true,
      })
    }
    items.sort((a, b) => new Date(a.ts) - new Date(b.ts))
    return items
  }, [dispute, messages])

  // ---------- render ----------
  if (loading) {
    return (
      <div className="space-y-md">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !dispute) {
    return (
      <Card>
        <EmptyState
          icon="error"
          title="Couldn't open this dispute"
          description={error || 'It may have been resolved or removed.'}
          action={
            <Button
              variant="primary"
              icon="arrow_back"
              onClick={() => navigate(`${rolePathPrefix(profile)}/disputes`)}
            >
              Back to disputes
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between gap-sm">
        <Link
          to={`${rolePathPrefix(profile)}/disputes`}
          className="inline-flex items-center gap-xs font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface"
        >
          <Icon name="arrow_back" size={18} />
          All disputes
        </Link>
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
          Case #{dispute.id.slice(0, 8)}
        </span>
      </div>

      <PageHeader
        eyebrow={type?.label || 'Dispute'}
        title={dispute.title}
        description={`${campaign?.title || campaign?.property_name || 'Campaign'} · Opened ${formatRelativeTime(
          dispute.created_at,
        )}`}
        actions={
          <Chip tone={status.tone} icon={status.icon}>
            {status.label}
          </Chip>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Left column: parties + escrow */}
        <div className="space-y-md lg:col-span-1">
          <Card>
            <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-sm">
              Parties
            </div>
            <PartyRow
              label="Reporter"
              name={dispute.reporter?.full_name}
              role={dispute.reporter?.role}
            />
            <div className="my-sm h-px bg-outline-variant" />
            <PartyRow
              label="Reported"
              name={dispute.reported_party?.full_name || '—'}
              role={dispute.reported_party?.role}
            />
          </Card>

          {escrow && (
            <Card>
              <div className="flex items-center justify-between mb-sm">
                <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                  Payment status
                </div>
                <Chip tone="primary" icon="payments">
                  {campaign?.status || 'campaign'}
                </Chip>
              </div>
              <DataRow
                label="Total budget"
                value={formatCurrency(escrow.total_budget)}
              />
              <DataRow
                label="Paid to creator"
                value={formatCurrency(escrow.amount_paid_out)}
              />
              <DataRow
                label="Available to claw back"
                value={formatCurrency(escrowAvailable)}
                emphasis
              />
              {dispute.refund_amount ? (
                <div className="mt-sm rounded bg-secondary-container text-on-secondary-container px-sm py-sm font-body-sm text-body-sm">
                  Refund authorised: {formatCurrency(dispute.refund_amount)}
                </div>
              ) : null}
            </Card>
          )}

          {assignment && (
            <Card>
              <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-sm">
                Assignment
              </div>
              <DataRow
                label="Creator"
                value={assignment.creator_profiles?.profiles?.full_name || '—'}
              />
              <DataRow
                label="Agreed budget"
                value={formatCurrency(assignment.agreed_budget || 0)}
              />
              <DataRow
                label="Paid so far"
                value={formatCurrency(assignment.amount_paid || 0)}
              />
              <DataRow
                label="Content approved"
                value={`${assignment.content_approved || 0} / ${
                  assignment.content_submitted || 0
                }`}
              />
            </Card>
          )}

          {contract && (
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                    Linked contract
                  </div>
                  <div className="font-body-md text-body-md text-on-surface">
                    {contract.title}
                  </div>
                </div>
                <Chip tone={contract.status === 'signed' ? 'success' : 'warning'}>
                  {contract.status}
                </Chip>
              </div>
              <Link
                to={`${rolePathPrefix(profile)}/contracts`}
                className="mt-sm inline-flex items-center gap-xs font-label-lg text-label-lg text-secondary"
              >
                Open contract
                <Icon name="arrow_forward" size={16} />
              </Link>
            </Card>
          )}
        </div>

        {/* Right column: timeline + messages */}
        <div className="space-y-md lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-sm">
              <div className="font-headline-md text-headline-md text-on-surface">
                Case timeline
              </div>
              <span className="font-label-md text-label-md text-on-surface-variant">
                {timeline.length} event{timeline.length === 1 ? '' : 's'}
              </span>
            </div>
            <ol className="space-y-md">
              {timeline.map((t) => (
                <li key={t.id} className="flex gap-md">
                  <span
                    className={
                      'shrink-0 mt-1 w-8 h-8 rounded inline-flex items-center justify-center ' +
                      (t.admin
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container text-on-surface-variant')
                    }
                  >
                    <Icon name={t.icon} size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-sm">
                      <span className="font-label-lg text-label-lg text-on-surface">
                        {t.title}
                      </span>
                      <span className="font-label-md text-label-md text-on-surface-variant">
                        {formatRelativeTime(t.ts)}
                      </span>
                    </div>
                    {t.body && (
                      <p className="font-body-md text-body-md text-on-surface mt-xs whitespace-pre-wrap">
                        {t.body}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <div ref={messagesEndRef} />
          </Card>

          {/* Reply box */}
          {!isClosed && (
            <Card>
              <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-sm">
                Reply
              </div>
              <Textarea
                rows={3}
                placeholder="Add a message visible to the other party and the super admin."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <div className="mt-sm flex justify-end">
                <Button
                  variant="primary"
                  icon="send"
                  onClick={send}
                  disabled={sending || !newMessage.trim()}
                >
                  {sending ? 'Sending…' : isSuperAdmin ? 'Reply as super admin' : 'Send message'}
                </Button>
              </div>
            </Card>
          )}

          {/* Evidence gallery */}
          <Card>
            <div className="flex items-center justify-between mb-sm">
              <div className="font-headline-md text-headline-md text-on-surface">
                Evidence
              </div>
              {!isClosed && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={onPickFiles}
                    accept="image/*,application/pdf,video/mp4,video/quicktime,video/webm,text/plain,application/zip,.doc,.docx"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="upload_file"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingEvidence}
                  >
                    {uploadingEvidence ? 'Uploading…' : 'Add evidence'}
                  </Button>
                </>
              )}
            </div>
            {evidenceLinks.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No evidence has been attached to this case yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-sm">
                {evidenceLinks.map((e) => (
                  <EvidenceTile key={e.path} item={e} />
                ))}
              </div>
            )}
          </Card>

          {/* Super admin resolution panel */}
          {isSuperAdmin && (
            <Card>
              <div className="flex items-center justify-between mb-sm">
                <div>
                  <div className="font-headline-md text-headline-md text-on-surface">
                    Mediation
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                    Update the case status, leave resolution notes, and authorise refunds from escrow.
                  </p>
                </div>
                <Button
                  variant="primary"
                  icon="gavel"
                  onClick={() => setShowResolve(true)}
                >
                  Update case
                </Button>
              </div>

              {dispute.resolution_notes && (
                <div className="rounded bg-surface-container-low border border-outline-variant p-sm">
                  <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                    Latest resolution notes
                  </div>
                  <p className="mt-xs font-body-md text-body-md text-on-surface whitespace-pre-wrap">
                    {dispute.resolution_notes}
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Resolution modal */}
      <Modal
        isOpen={showResolve}
        onClose={() => !resolving && setShowResolve(false)}
        title="Update dispute"
        description="Status changes are recorded in the audit log and posted to the case timeline."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowResolve(false)}
              disabled={resolving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="check"
              onClick={submitResolution}
              disabled={resolving}
            >
              {resolving ? 'Saving…' : 'Save update'}
            </Button>
          </>
        }
      >
        <div className="space-y-md">
          <Select
            label="New status"
            value={resolveData.status}
            onChange={(e) =>
              setResolveData((r) => ({ ...r, status: e.target.value }))
            }
            options={[
              { value: 'under_review', label: 'Under review' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed (no fault found)' },
              { value: 'escalated', label: 'Escalated to legal' },
            ]}
          />
          <Textarea
            label="Resolution notes"
            rows={4}
            placeholder="Summarise the decision, who is responsible for what, and any follow-up actions."
            value={resolveData.notes}
            onChange={(e) =>
              setResolveData((r) => ({ ...r, notes: e.target.value }))
            }
          />
          <Select
            label="Refund action"
            value={resolveData.escrowAction}
            onChange={(e) =>
              setResolveData((r) => ({ ...r, escrowAction: e.target.value }))
            }
            options={[
              { value: 'none', label: 'No payment movement' },
              {
                value: 'refund_developer',
                label: assignment
                  ? 'Refund developer (claw back from creator’s wallet)'
                  : 'Refund developer (no assignment — unavailable)',
              },
            ]}
            helperText={
              !assignment && resolveData.escrowAction === 'refund_developer'
                ? 'This dispute has no creator assignment, so there is no wallet to refund from.'
                : `Available to claw back: ${formatCurrency(escrowAvailable)}`
            }
          />
          {resolveData.escrowAction !== 'none' && (
            <Input
              label={`Amount (max ${formatCurrency(escrowAvailable)})`}
              type="number"
              min="0"
              step="0.01"
              max={escrowAvailable}
              placeholder="0.00"
              value={resolveData.escrowAmount}
              onChange={(e) =>
                setResolveData((r) => ({ ...r, escrowAmount: e.target.value }))
              }
              error={
                resolveData.escrowAmount &&
                Number(resolveData.escrowAmount) > escrowAvailable
                  ? `Cannot exceed what is available to claw back (${formatCurrency(escrowAvailable)})`
                  : undefined
              }
              helperText="The amount is clawed back from the creator's wallet and credited to the developer immediately when you save. A wallet transaction is recorded on each side and the dispute audit log captures the reference number."
            />
          )}
        </div>
      </Modal>
    </div>
  )
}

// ============================================
// Sub-components
// ============================================

function PartyRow({ label, name, role }) {
  return (
    <div className="flex items-center gap-sm">
      <span className="w-10 h-10 rounded-full bg-surface-container text-on-surface-variant inline-flex items-center justify-center font-headline-md text-headline-md">
        {(name || '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
          {label}
        </div>
        <div className="font-body-md text-body-md text-on-surface truncate">
          {name || '—'}
        </div>
        {role && (
          <div className="font-body-sm text-body-sm text-on-surface-variant capitalize">
            {role}
          </div>
        )}
      </div>
    </div>
  )
}

function DataRow({ label, value, emphasis }) {
  return (
    <div className="flex items-center justify-between py-xs">
      <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
      <span
        className={
          emphasis
            ? 'font-headline-md text-headline-md text-on-surface'
            : 'font-body-md text-body-md text-on-surface'
        }
      >
        {value}
      </span>
    </div>
  )
}

function EvidenceTile({ item }) {
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(item.name || '')
  const isVideo = /\.(mp4|webm|mov)$/i.test(item.name || '')
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="group block rounded border border-outline-variant overflow-hidden bg-surface-container-lowest hover:border-outline transition-colors"
    >
      <div className="aspect-video bg-surface-container flex items-center justify-center overflow-hidden">
        {isImage ? (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
        ) : isVideo ? (
          <Icon name="play_circle" size={36} className="text-on-surface-variant" />
        ) : (
          <Icon name="description" size={36} className="text-on-surface-variant" />
        )}
      </div>
      <div className="p-sm flex items-center justify-between gap-xs">
        <span className="font-body-sm text-body-sm text-on-surface truncate">
          {item.name}
        </span>
        <Icon name="open_in_new" size={16} className="text-on-surface-variant shrink-0" />
      </div>
    </a>
  )
}
