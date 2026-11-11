/**
 * Dispute helpers — evidence uploads, dispute lifecycle, audit.
 *
 * Storage convention: dispute-evidence/<disputeId>/<timestamp>-<safe-name>
 * RLS in migration 011 enforces only involved parties + super admins can
 * read/write objects under <disputeId>/.
 */

import { supabase } from './supabase'
import { refundCampaignPayment } from './payments'
import { notify } from './notifications'

const BUCKET = 'dispute-evidence'

// ============================================
// Notification helpers
// ============================================
//
// Dispute lifecycle events fan out emails to:
//   - the other party (reporter <-> reported_party)
//   - all active super admins (mediators)
// Email lookup for admins goes through the SECURITY DEFINER RPC
// `get_active_super_admin_emails` (migration 013) because the super_admins
// table is RLS-locked to admins themselves.
//
// All notification calls are best-effort: a failure to fan out emails must
// never break the underlying dispute write that the user just performed.

const DISPUTE_TYPE_LABELS = {
  payment: 'Payment Issue',
  content_quality: 'Content Quality',
  delivery: 'Delivery / Deadline',
  communication: 'Communication',
  other: 'Other',
}

function disputePathFor(role, disputeId) {
  if (role === 'admin') return `/admin/disputes/${disputeId}`
  if (role === 'developer') return `/developer/disputes/${disputeId}`
  return `/creator/disputes/${disputeId}`
}

async function fetchDisputeNotificationContext(disputeId) {
  if (!disputeId) return null
  try {
    const { data: dispute, error } = await supabase
      .from('disputes')
      .select(`
        id, title, status, refund_amount, dispute_type, resolution_notes,
        reporter_id, reported_party_id, campaign_id,
        campaigns(title, property_name),
        reporter:reporter_id(id, full_name, email, role),
        reported_party:reported_party_id(id, full_name, email, role)
      `)
      .eq('id', disputeId)
      .maybeSingle()
    if (error || !dispute) return null

    let adminEmails = []
    try {
      const { data } = await supabase.rpc('get_active_super_admin_emails')
      adminEmails = (data || []).filter(Boolean)
    } catch (e) {
      // Older databases without migration 013 just skip admin fan-out
      console.warn('Could not fetch super admin emails:', e?.message)
    }
    return { dispute, adminEmails }
  } catch (e) {
    console.warn('Could not load dispute notification context:', e?.message)
    return null
  }
}

async function notifyDisputeOpened(disputeId) {
  const ctx = await fetchDisputeNotificationContext(disputeId)
  if (!ctx) return
  const { dispute, adminEmails } = ctx
  const campaignTitle =
    dispute.campaigns?.title || dispute.campaigns?.property_name || 'Campaign'

  const recipients = []
  if (dispute.reported_party?.email) {
    recipients.push({
      email: dispute.reported_party.email,
      name: dispute.reported_party.full_name,
      role: dispute.reported_party.role,
    })
  }
  adminEmails.forEach((email) => {
    if (email && !recipients.some((r) => r.email === email)) {
      recipients.push({ email, name: 'Super Admin', role: 'admin' })
    }
  })

  await Promise.allSettled(
    recipients.map((r) =>
      notify.disputeOpened(r.email, {
        recipientName: r.name,
        reporterName: dispute.reporter?.full_name,
        campaignTitle,
        disputeTitle: dispute.title,
        disputeType:
          DISPUTE_TYPE_LABELS[dispute.dispute_type] || dispute.dispute_type,
        path: disputePathFor(r.role, dispute.id),
      }),
    ),
  )
}

async function notifyDisputeNewMessage(disputeId, senderId, message) {
  const ctx = await fetchDisputeNotificationContext(disputeId)
  if (!ctx) return
  const { dispute, adminEmails } = ctx
  const campaignTitle =
    dispute.campaigns?.title || dispute.campaigns?.property_name || 'Campaign'

  let senderEmail = null
  let senderName = 'Someone'
  try {
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', senderId)
      .maybeSingle()
    senderEmail = senderProfile?.email || null
    if (senderProfile?.full_name) senderName = senderProfile.full_name
  } catch {
    /* fall through with defaults */
  }
  const senderIsAdmin = senderEmail
    ? adminEmails.includes(senderEmail)
    : false

  const recipients = []
  const pushUnique = (rec) => {
    if (!rec.email) return
    if (rec.email === senderEmail) return
    if (recipients.some((r) => r.email === rec.email)) return
    recipients.push(rec)
  }
  pushUnique({
    email: dispute.reporter?.email,
    name: dispute.reporter?.full_name,
    role: dispute.reporter?.role,
  })
  pushUnique({
    email: dispute.reported_party?.email,
    name: dispute.reported_party?.full_name,
    role: dispute.reported_party?.role,
  })
  adminEmails.forEach((email) =>
    pushUnique({ email, name: 'Super Admin', role: 'admin' }),
  )

  await Promise.allSettled(
    recipients.map((r) =>
      notify.disputeMessage(r.email, {
        recipientName: r.name,
        senderName,
        isAdmin: senderIsAdmin,
        campaignTitle,
        disputeTitle: dispute.title,
        message,
        path: disputePathFor(r.role, dispute.id),
      }),
    ),
  )
}

async function notifyDisputeStatusChange(disputeId, status) {
  if (!['resolved', 'closed', 'escalated'].includes(status)) return
  const ctx = await fetchDisputeNotificationContext(disputeId)
  if (!ctx) return
  const { dispute, adminEmails } = ctx
  const campaignTitle =
    dispute.campaigns?.title || dispute.campaigns?.property_name || 'Campaign'

  // Build the recipient set: reporter (the task's primary requirement) plus
  // the reported party and active admins so the system message that closes
  // the case still notifies "both parties + admins" — the resolveDispute
  // path suppresses the per-message email so this is the single source of
  // truth for the resolution event.
  const recipients = []
  const pushUnique = (rec) => {
    if (!rec.email) return
    if (recipients.some((r) => r.email === rec.email)) return
    recipients.push(rec)
  }
  pushUnique({
    email: dispute.reporter?.email,
    name: dispute.reporter?.full_name,
    role: dispute.reporter?.role,
    audience: 'reporter',
  })
  pushUnique({
    email: dispute.reported_party?.email,
    name: dispute.reported_party?.full_name,
    role: dispute.reported_party?.role,
    audience: 'reported_party',
  })
  adminEmails.forEach((email) =>
    pushUnique({ email, name: 'Super Admin', role: 'admin', audience: 'admin' }),
  )

  await Promise.allSettled(
    recipients.map((r) =>
      notify.disputeResolved(r.email, {
        recipientName: r.name,
        status,
        disputeTitle: dispute.title,
        campaignTitle,
        notes: dispute.resolution_notes,
        refundAmount: dispute.refund_amount,
        path: disputePathFor(r.role, dispute.id),
        audience: r.audience,
      }),
    ),
  )
}

// ============================================
// Evidence upload
// ============================================

const sanitizeName = (name) =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)

/**
 * Upload one or more evidence files for a dispute.
 * Returns the storage paths so they can be saved on disputes.evidence_urls.
 *
 * @param {string} disputeId
 * @param {File[]} files
 * @returns {Promise<string[]>} array of storage paths (NOT public urls)
 */
export async function uploadDisputeEvidence(disputeId, files) {
  if (!disputeId) throw new Error('disputeId is required')
  if (!files || files.length === 0) return []

  const paths = []
  for (const file of files) {
    const safe = sanitizeName(file.name || 'evidence')
    const path = `${disputeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (error) throw error
    paths.push(path)
  }
  return paths
}

/**
 * Get a short-lived signed URL for an evidence object.
 * @param {string} path  storage path (<disputeId>/...)
 * @param {number} expiresIn seconds (default 1h)
 */
export async function getEvidenceSignedUrl(path, expiresIn = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) {
    console.warn('Could not create signed URL for', path, error.message)
    return null
  }
  return data?.signedUrl || null
}

/**
 * Resolve a list of evidence paths to signed URLs.
 * Bad paths are silently dropped (returns shorter array).
 */
export async function getEvidenceSignedUrls(paths = [], expiresIn = 3600) {
  const out = []
  for (const p of paths) {
    const url = await getEvidenceSignedUrl(p, expiresIn)
    if (url) out.push({ path: p, url, name: p.split('/').pop() })
  }
  return out
}

// ============================================
// Dispute lifecycle
// ============================================

/**
 * Create a dispute and attach uploaded evidence in a single flow.
 * Returns the inserted dispute row.
 */
export async function createDispute({
  campaignId,
  assignmentId,
  reporterId,
  reportedPartyId,
  disputeType,
  title,
  description,
  files = [],
}) {
  if (!campaignId || !reporterId || !title || !description || !disputeType) {
    throw new Error('Missing required dispute fields')
  }

  const { data: dispute, error } = await supabase
    .from('disputes')
    .insert({
      campaign_id: campaignId,
      assignment_id: assignmentId || null,
      reporter_id: reporterId,
      reported_party_id: reportedPartyId || null,
      dispute_type: disputeType,
      title,
      description,
      status: 'open',
    })
    .select()
    .single()

  if (error) throw error

  if (files.length > 0) {
    try {
      const paths = await uploadDisputeEvidence(dispute.id, files)
      const { error: updErr } = await supabase
        .from('disputes')
        .update({ evidence_urls: paths })
        .eq('id', dispute.id)
      if (updErr) throw updErr
      dispute.evidence_urls = paths
    } catch (uploadErr) {
      // Best-effort: surface the error but do not roll back the dispute row;
      // the user can attach evidence later from the detail page.
      console.error('Evidence upload failed:', uploadErr)
      // Still try to notify the other party + admins about the new case before
      // re-throwing so they aren't left in the dark by a partial failure.
      notifyDisputeOpened(dispute.id).catch(() => {})
      throw new Error(
        `Dispute created (${dispute.id}) but evidence upload failed: ${uploadErr.message}`,
      )
    }
  }

  // Best-effort fan-out: notify the reported party and any active super admins
  // that a new case has been opened. Errors are swallowed by the helper.
  notifyDisputeOpened(dispute.id).catch(() => {})

  return dispute
}

/**
 * Append additional evidence to an existing dispute.
 */
export async function attachEvidence(disputeId, files) {
  if (!files || files.length === 0) return []
  const newPaths = await uploadDisputeEvidence(disputeId, files)
  const { data: existing } = await supabase
    .from('disputes')
    .select('evidence_urls')
    .eq('id', disputeId)
    .single()
  const merged = [...(existing?.evidence_urls || []), ...newPaths]
  const { error } = await supabase
    .from('disputes')
    .update({ evidence_urls: merged })
    .eq('id', disputeId)
  if (error) throw error
  return merged
}

/**
 * Append a message to a dispute thread.
 *
 * @param {string} disputeId
 * @param {string} senderId
 * @param {string} message
 * @param {boolean} isAdmin       Whether to flag the message as a super admin
 *                                post (rendered with the gavel badge).
 * @param {object} [options]
 * @param {boolean} [options.notify=true]
 *   When true (the default) we email both parties + admins about the new
 *   message. The dispute resolver passes `false` so the system message it
 *   appends to the timeline does not double up with the resolution email.
 */
export async function sendDisputeMessage(
  disputeId,
  senderId,
  message,
  isAdmin = false,
  { notify: shouldNotify = true } = {},
) {
  const trimmed = (message || '').trim()
  if (!trimmed) return null
  const { data, error } = await supabase
    .from('dispute_messages')
    .insert({
      dispute_id: disputeId,
      sender_id: senderId,
      message: trimmed,
      is_admin_message: isAdmin,
    })
    .select()
    .single()
  if (error) throw error
  if (shouldNotify) {
    notifyDisputeNewMessage(disputeId, senderId, trimmed).catch(() => {})
  }
  return data
}

// ============================================
// Resolution (super admin only — RLS enforces)
// ============================================

/**
 * Resolve / close / escalate a dispute and (optionally) refund the
 * developer. Super-admin only — RLS enforces who may write to disputes.
 *
 * There is no escrow to move any more: the creator was paid in full at
 * checkout, so the only financial action a dispute can take is
 * 'refund_developer', which claws the disputed amount back out of the
 * creator's wallet. 'none' records the outcome without moving money.
 *
 * The refund runs FIRST. If it fails (e.g. the creator has already
 * withdrawn more than the refund amount) the dispute row is not updated, so
 * the admin can fix the amount and retry without leaving the case in an
 * inconsistent half-resolved state.
 *
 * @param {object} params
 * @param {string} params.disputeId
 * @param {string} params.adminId
 * @param {'resolved'|'closed'|'escalated'|'under_review'} params.status
 * @param {string} params.notes
 * @param {'none'|'refund_developer'} [params.escrowAction]
 * @param {number} [params.escrowAmount]  amount in ZAR to refund
 * @param {string} [params.campaignId]    required for refund_developer
 * @param {string} [params.creatorId]     required for refund_developer (whose wallet is clawed back)
 */
export async function resolveDispute({
  disputeId,
  adminId,
  status,
  notes,
  escrowAction = 'none',
  escrowAmount = 0,
  campaignId = null,
  creatorId = null,
}) {
  if (!disputeId || !adminId || !status) {
    throw new Error('disputeId, adminId, status are required')
  }

  // ---- 1. Refund (optional) ----
  let escrowResult = null
  const amount = Number(escrowAmount) || 0
  if (escrowAction !== 'none') {
    if (escrowAction !== 'refund_developer') {
      throw new Error(`Unknown dispute action: ${escrowAction}`)
    }
    if (!campaignId) throw new Error('campaignId is required to refund the developer')
    if (!creatorId) throw new Error('creatorId is required to refund the developer')
    if (amount <= 0) throw new Error('Refund amount must be greater than zero')
    escrowResult = await refundCampaignPayment({
      campaignId,
      creatorId,
      amount,
      reason: `Dispute resolution: ${disputeId}`,
    })
  }

  // ---- 2. Dispute record ----
  const updates = {
    status,
    resolution_notes: notes || null,
  }

  if (status === 'resolved' || status === 'closed') {
    updates.resolved_by = adminId
    updates.resolved_at = new Date().toISOString()
  }
  if (amount > 0) {
    updates.refund_amount = amount
  }

  const { data, error } = await supabase
    .from('disputes')
    .update(updates)
    .eq('id', disputeId)
    .select()
    .single()
  if (error) throw error

  // ---- 3. Audit log (best-effort) ----
  try {
    await supabase.from('audit_logs').insert({
      user_id: adminId,
      user_role: 'admin',
      action: `dispute.${status}`,
      entity_type: 'dispute',
      entity_id: disputeId,
      new_values: updates,
      metadata: {
        refund_amount: updates.refund_amount ?? null,
        escrow_action: escrowAction,
        escrow_amount: amount,
        escrow_reference: escrowResult?.referenceNumber || null,
      },
    })
  } catch (e) {
    console.warn('Audit log failed for dispute resolution:', e.message)
  }

  // ---- 4. System message in the thread ----
  // Skip the per-message email fan-out here; the explicit resolution email
  // below already covers the reporter, and the parties can see the system
  // message in the timeline next time they open the case.
  try {
    await sendDisputeMessage(
      disputeId,
      adminId,
      buildResolutionMessage(status, notes, escrowAction, amount),
      true,
      { notify: false },
    )
  } catch (e) {
    console.warn('Resolution system message failed:', e.message)
  }

  // ---- 5. Resolution email to the reporter ----
  // Only fires for resolved / closed / escalated; helper guards against
  // intermediate states like under_review.
  notifyDisputeStatusChange(disputeId, status).catch(() => {})

  return { dispute: data, escrow: escrowResult }
}

function buildResolutionMessage(status, notes, escrowAction, amount) {
  const lines = [`Status changed to: ${status}`]
  if (escrowAction === 'refund_developer' && amount > 0) {
    lines.push(`Refund to developer (clawed back from creator): R ${amount.toFixed(2)}`)
  }
  if (notes) lines.push(`Notes: ${notes}`)
  return lines.join('\n')
}

export const ESCROW_ACTIONS = {
  none:              { label: 'No payment movement',              tone: 'neutral' },
  refund_developer:  { label: 'Refund developer (claw back from creator)', tone: 'warning' },
}

export const DISPUTE_TYPES = [
  { id: 'payment', label: 'Payment Issue', icon: 'payments' },
  { id: 'content_quality', label: 'Content Quality', icon: 'image' },
  { id: 'delivery', label: 'Delivery / Deadline', icon: 'schedule' },
  { id: 'communication', label: 'Communication', icon: 'forum' },
  { id: 'other', label: 'Other', icon: 'help' },
]

export const DISPUTE_STATUS = {
  open: { label: 'Open', tone: 'warning', icon: 'warning' },
  under_review: { label: 'Under Review', tone: 'tertiary', icon: 'gavel' },
  resolved: { label: 'Resolved', tone: 'success', icon: 'check_circle' },
  closed: { label: 'Closed', tone: 'neutral', icon: 'lock' },
  escalated: { label: 'Escalated', tone: 'danger', icon: 'priority_high' },
}
