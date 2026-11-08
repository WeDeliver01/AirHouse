/**
 * Creator Attribution & Tracking Service
 *
 * Handles:
 * - One unique tracking link per creator per campaign assignment
 * - First-party click redirects via /go/:token (destination resolved
 *   server-side -- see record_tracking_click() in migration 029)
 * - Lead/enquiry attribution and scoring
 */

import { supabase } from './supabase'

// ============================================
// TRACKING LINK GENERATION
// ============================================

/**
 * Generate a short, unguessable token for a tracking link.
 */
const generateToken = () => {
  const random = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return random.replace(/-/g, '').slice(0, 12)
}

/**
 * Build the shareable URL for a tracking link.
 *
 * Short-term rental campaigns point outbound (to Airbnb etc.) through the
 * first-party /go/:token redirect, which records the click before sending
 * the visitor on. Everything else points at the public enquiry/landing page
 * with the token attached for attribution.
 */
export const buildTrackingUrl = (link) => {
  const origin = window.location.origin
  if (link.destination_mode === 'redirect') {
    return `${origin}/go/${link.token}`
  }
  return `${origin}/lead/${link.campaign_id}?ref=${link.token}`
}

/**
 * Get or create the single tracking link for a campaign assignment.
 */
export const getOrCreateTrackingLink = async (assignmentId) => {
  const { data: existing } = await supabase
    .from('creator_tracking_links')
    .select('*')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  let link = existing

  if (!link) {
    const { data: assignment, error } = await supabase
      .from('campaign_assignments')
      .select('id, creator_id, campaign:campaigns(id, property_id, property:properties(id, listing_category, external_booking_url))')
      .eq('id', assignmentId)
      .single()

    if (error || !assignment) throw new Error('Assignment not found')

    const { data: created, error: insertError } = await supabase
      .from('creator_tracking_links')
      .insert({
        assignment_id: assignmentId,
        campaign_id: assignment.campaign.id,
        creator_id: assignment.creator_id,
        property_id: assignment.campaign.property_id,
        token: generateToken(),
      })
      .select()
      .single()

    if (insertError) throw insertError
    link = created
  }

  const isShortTermRental = link.property_id
    ? (await supabase.from('properties').select('listing_category').eq('id', link.property_id).maybeSingle())
        .data?.listing_category === 'short_term_rental'
    : false

  return {
    ...link,
    destination_mode: isShortTermRental ? 'redirect' : 'enquiry',
    full_url: buildTrackingUrl({ ...link, destination_mode: isShortTermRental ? 'redirect' : 'enquiry' }),
    clicks: link.clicks_count,
    leads: link.leads_count,
  }
}

/**
 * Resolve a /go/:token request: records the click server-side and returns
 * the destination to redirect the visitor to. The destination is decided
 * entirely in the database (record_tracking_click) -- this never accepts a
 * destination from the caller.
 */
export const resolveTrackingToken = async (token, { referrer } = {}) => {
  const visitorHash = await hashVisitor()
  const { data, error } = await supabase.rpc('record_tracking_click', {
    p_token: token,
    p_visitor_hash: visitorHash,
    p_referrer: referrer || document.referrer || null,
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

/**
 * A lightweight, non-reversible fingerprint used only to dedupe "unique
 * visitors" in analytics. POPIA-conscious: no IP address or stable device
 * ID is sent or stored, just a hash of coarse, already-public request
 * context.
 */
const hashVisitor = async () => {
  try {
    const raw = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  } catch {
    return null
  }
}

/**
 * Credit a tracking link with a lead/enquiry (best-effort; must never fail
 * the enquiry submission itself).
 */
export const creditTrackingLeadByToken = async (token) => {
  if (!token) return
  try {
    await supabase.rpc('increment_link_leads', { p_token: token })
  } catch (e) {
    console.warn('Could not credit tracking link lead count:', e)
  }
}

// ============================================
// LEAD QUALITY SCORING
// ============================================

export const LEAD_STAGES = {
  new: { label: 'New', points: 0, color: 'gray' },
  contacted: { label: 'Contacted', points: 10, color: 'blue' },
  qualified: { label: 'Qualified', points: 50, color: 'yellow' },
  site_visit: { label: 'Site Visit', points: 70, color: 'orange' },
  negotiation: { label: 'Negotiating', points: 85, color: 'purple' },
  converted: { label: 'Converted', points: 100, color: 'green' },
  lost: { label: 'Lost', points: 0, color: 'red' },
}

export const calculateLeadScore = (lead) => {
  let score = 0
  score += LEAD_STAGES[lead.pipeline_stage]?.points || 0
  if (lead.interest_level === 'hot') score += 20
  else if (lead.interest_level === 'warm') score += 10
  return Math.min(score, 100)
}

export const getCreatorLeadStats = async (creatorId, campaignId = null) => {
  let query = supabase
    .from('leads')
    .select('pipeline_stage, created_at')
    .eq('creator_id', creatorId)

  if (campaignId) query = query.eq('campaign_id', campaignId)

  const { data: leads, error } = await query
  if (error) throw error

  const stats = { total: leads.length, byStage: {}, conversionRate: 0 }
  let converted = 0
  leads.forEach((lead) => {
    stats.byStage[lead.pipeline_stage] = (stats.byStage[lead.pipeline_stage] || 0) + 1
    if (lead.pipeline_stage === 'converted') converted++
  })
  stats.conversionRate = leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0
  return stats
}

export default {
  buildTrackingUrl,
  getOrCreateTrackingLink,
  resolveTrackingToken,
  creditTrackingLeadByToken,
  LEAD_STAGES,
  calculateLeadScore,
  getCreatorLeadStats,
}
