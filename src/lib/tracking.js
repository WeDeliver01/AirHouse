/**
 * Creator Attribution & Tracking Service
 * 
 * Handles:
 * - Single unique tracking link per creator per campaign
 * - UTM parameter generation and parsing
 * - Lead attribution and scoring
 */

import { supabase } from './supabase'

// ============================================
// TRACKING LINK GENERATION
// ============================================

/**
 * Generate a unique tracking code for a creator on a campaign
 */
export const generateTrackingCode = (creatorId, campaignId) => {
  const creatorPart = creatorId.replace(/-/g, '').substring(0, 4).toUpperCase()
  const campaignPart = campaignId.replace(/-/g, '').substring(0, 4).toUpperCase()
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4)
  return `${creatorPart}${campaignPart}${timestamp}`
}

/**
 * Generate full tracking URL with UTM parameters
 */
export const generateTrackingUrl = ({
  baseUrl,
  trackingCode,
}) => {
  const url = new URL(baseUrl)
  
  // Main tracking identifier - simple and clean
  url.searchParams.set('ref', trackingCode)
  
  return url.toString()
}

/**
 * Get or create single tracking link for a campaign assignment
 */
export const getOrCreateTrackingLink = async (assignmentId) => {
  // Check if link already exists
  const { data: existing } = await supabase
    .from('creator_tracking_links')
    .select('*')
    .eq('assignment_id', assignmentId)
    .single()
  
  if (existing) {
    return existing
  }

  // Get assignment details
  const { data: assignment, error } = await supabase
    .from('campaign_assignments')
    .select(`
      id,
      creator_id,
      campaign:campaigns(id, title, landing_page_url, property_name)
    `)
    .eq('id', assignmentId)
    .single()

  if (error || !assignment) throw new Error('Assignment not found')

  const baseUrl = assignment.campaign.landing_page_url || 
    `${window.location.origin}/lead/${assignment.campaign.id}`
  
  // Generate tracking code
  const trackingCode = generateTrackingCode(assignment.creator_id, assignment.campaign.id)

  // Create single link
  const { data: link, error: insertError } = await supabase
    .from('creator_tracking_links')
    .insert({
      assignment_id: assignmentId,
      campaign_id: assignment.campaign.id,
      creator_id: assignment.creator_id,
      tracking_code: trackingCode,
      full_url: generateTrackingUrl({
        baseUrl,
        campaignId: assignment.campaign.id,
        trackingCode,
      }),
      clicks: 0,
      leads: 0,
    })
    .select()
    .single()

  if (insertError) throw insertError
  
  // Update assignment with tracking code
  await supabase
    .from('campaign_assignments')
    .update({ unique_referral_url: trackingCode })
    .eq('id', assignmentId)

  return link
}

/**
 * Record a link click
 */
export const recordLinkClick = async (trackingCode) => {
  const { error } = await supabase.rpc('increment_link_clicks', {
    p_tracking_code: trackingCode
  })
  
  if (error) console.error('Failed to record click:', error)
}

/**
 * Parse tracking code from URL
 */
export const parseTrackingCode = (urlString) => {
  try {
    const url = new URL(urlString)
    return url.searchParams.get('ref')
  } catch {
    return null
  }
}

// ============================================
// LEAD ATTRIBUTION
// ============================================

/**
 * Attribute a lead to a creator based on tracking code
 */
export const attributeLead = async (leadId, trackingCode) => {
  if (!trackingCode) return null

  // Find the tracking link
  const { data: link } = await supabase
    .from('creator_tracking_links')
    .select('*, assignment:campaign_assignments(*)')
    .eq('tracking_code', trackingCode)
    .single()

  if (!link) return null

  // Update lead with attribution
  await supabase
    .from('leads')
    .update({
      creator_id: link.creator_id,
      tracking_code: trackingCode,
      attributed_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  // Increment lead count on link
  await supabase
    .from('creator_tracking_links')
    .update({ leads: (link.leads || 0) + 1 })
    .eq('id', link.id)

  return link
}

// ============================================
// LEAD QUALITY SCORING
// ============================================

/**
 * Lead quality stages with point values
 */
export const LEAD_STAGES = {
  new: { label: 'New', points: 0, color: 'gray' },
  contacted: { label: 'Contacted', points: 10, color: 'blue' },
  engaged: { label: 'Engaged', points: 25, color: 'cyan' },
  qualified: { label: 'Qualified', points: 50, color: 'yellow' },
  site_visit: { label: 'Site Visit', points: 70, color: 'orange' },
  offer_made: { label: 'Offer Made', points: 85, color: 'purple' },
  converted: { label: 'Converted', points: 100, color: 'green' },
  lost: { label: 'Lost', points: 0, color: 'red' },
}

/**
 * Calculate lead quality score based on various factors
 */
export const calculateLeadScore = (lead) => {
  let score = 0
  
  // Stage points
  score += LEAD_STAGES[lead.pipeline_stage]?.points || 0
  
  // Interest level bonus
  if (lead.interest_level === 'hot') score += 20
  else if (lead.interest_level === 'warm') score += 10
  
  // Response time bonus (if contacted quickly)
  if (lead.first_response_at && lead.created_at) {
    const responseHours = (new Date(lead.first_response_at) - new Date(lead.created_at)) / (1000 * 60 * 60)
    if (responseHours < 1) score += 15
    else if (responseHours < 24) score += 10
    else if (responseHours < 48) score += 5
  }
  
  // Engagement bonus
  if (lead.email_opened) score += 5
  if (lead.link_clicked) score += 10
  if (lead.documents_viewed) score += 10
  
  // Budget indicator
  if (lead.budget_confirmed) score += 15
  
  return Math.min(score, 100) // Cap at 100
}

/**
 * Update lead stage and recalculate score
 */
export const updateLeadStage = async (leadId, newStage, notes = '') => {
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (error) throw error

  const previousStage = lead.pipeline_stage
  const updatedLead = { ...lead, pipeline_stage: newStage }
  const newScore = calculateLeadScore(updatedLead)

  // Update lead
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      pipeline_stage: newStage,
      quality_score: newScore,
      stage_updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (updateError) throw updateError

  // Log stage change
  await supabase
    .from('lead_activities')
    .insert({
      lead_id: leadId,
      activity_type: 'stage_change',
      description: `Stage changed from ${previousStage} to ${newStage}`,
      metadata: { previous_stage: previousStage, new_stage: newStage, notes },
    })

  return { ...updatedLead, quality_score: newScore }
}

/**
 * Get lead conversion stats for a creator
 */
export const getCreatorLeadStats = async (creatorId, campaignId = null) => {
  let query = supabase
    .from('leads')
    .select('pipeline_stage, quality_score, created_at')
    .eq('creator_id', creatorId)

  if (campaignId) {
    query = query.eq('campaign_id', campaignId)
  }

  const { data: leads, error } = await query

  if (error) throw error

  const stats = {
    total: leads.length,
    byStage: {},
    avgScore: 0,
    conversionRate: 0,
  }

  let totalScore = 0
  let converted = 0

  leads.forEach(lead => {
    stats.byStage[lead.pipeline_stage] = (stats.byStage[lead.pipeline_stage] || 0) + 1
    totalScore += lead.quality_score || 0
    if (lead.pipeline_stage === 'converted') converted++
  })

  stats.avgScore = leads.length > 0 ? Math.round(totalScore / leads.length) : 0
  stats.conversionRate = leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0

  return stats
}

export default {
  generateTrackingCode,
  generateTrackingUrl,
  getOrCreateTrackingLink,
  recordLinkClick,
  parseTrackingCode,
  attributeLead,
  LEAD_STAGES,
  calculateLeadScore,
  updateLeadStage,
  getCreatorLeadStats,
}
