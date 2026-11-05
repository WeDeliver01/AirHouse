/**
 * Content Workflow Service
 * 
 * Handles:
 * - Content submission & approval flow
 * - Asset delivery from developers to creators
 * - Revision tracking
 * - Content calendar scheduling
 */

import { supabase } from './supabase'
import { releaseContentPayment } from './payments'

// ============================================
// CONTENT STATUS FLOW
// ============================================

export const CONTENT_STATUSES = {
  draft: { label: 'Draft', color: 'gray', description: 'Creator is working on content' },
  submitted: { label: 'Submitted', color: 'blue', description: 'Awaiting developer review' },
  revision_requested: { label: 'Revision Requested', color: 'yellow', description: 'Developer requested changes' },
  approved: { label: 'Approved', color: 'green', description: 'Content approved, ready to post' },
  scheduled: { label: 'Scheduled', color: 'purple', description: 'Scheduled for posting' },
  live: { label: 'Live', color: 'cyan', description: 'Content is published' },
  rejected: { label: 'Rejected', color: 'red', description: 'Content was rejected' },
}

export const CONTENT_TYPES = [
  { value: 'instagram_post', label: 'Instagram Post', icon: '📸' },
  { value: 'instagram_story', label: 'Instagram Story', icon: '📱' },
  { value: 'instagram_reel', label: 'Instagram Reel', icon: '🎬' },
  { value: 'tiktok_video', label: 'TikTok Video', icon: '🎵' },
  { value: 'youtube_video', label: 'YouTube Video', icon: '▶️' },
  { value: 'youtube_short', label: 'YouTube Short', icon: '📺' },
  { value: 'facebook_post', label: 'Facebook Post', icon: '👍' },
  { value: 'twitter_post', label: 'Twitter/X Post', icon: '🐦' },
  { value: 'blog_post', label: 'Blog Post', icon: '📝' },
  { value: 'other', label: 'Other', icon: '📄' },
]

// ============================================
// CONTENT SUBMISSION
// ============================================

/**
 * Create a new content submission
 */
export const createContentSubmission = async ({
  assignmentId,
  contentType,
  title,
  description,
  mediaUrls = [],
  caption = '',
  scheduledFor = null,
}) => {
  // Get assignment details
  const { data: assignment, error: assignError } = await supabase
    .from('campaign_assignments')
    .select('id, creator_id, campaign_id')
    .eq('id', assignmentId)
    .single()

  if (assignError) throw assignError

  const { data, error } = await supabase
    .from('content_submissions')
    .insert({
      assignment_id: assignmentId,
      campaign_id: assignment.campaign_id,
      creator_id: assignment.creator_id,
      content_type: contentType,
      title,
      description,
      media_urls: mediaUrls,
      caption,
      status: 'draft',
      scheduled_for: scheduledFor,
      version: 1,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Submit content for review
 */
export const submitContentForReview = async (submissionId, creatorNotes = '') => {
  const { data, error } = await supabase
    .from('content_submissions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      creator_notes: creatorNotes,
    })
    .eq('id', submissionId)
    .select()
    .single()

  if (error) throw error

  // Log activity
  await logContentActivity(submissionId, 'submitted', 'Content submitted for review')

  return data
}

/**
 * Request revision on content
 */
export const requestRevision = async (submissionId, reviewerId, feedback, specificChanges = []) => {
  // Get current submission
  const { data: current } = await supabase
    .from('content_submissions')
    .select('version, revision_history')
    .eq('id', submissionId)
    .single()

  const revisionHistory = current?.revision_history || []
  revisionHistory.push({
    version: current.version,
    requested_at: new Date().toISOString(),
    requested_by: reviewerId,
    feedback,
    specific_changes: specificChanges,
  })

  const { data, error } = await supabase
    .from('content_submissions')
    .update({
      status: 'revision_requested',
      revision_feedback: feedback,
      revision_changes: specificChanges,
      revision_history: revisionHistory,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select()
    .single()

  if (error) throw error

  // Log activity
  await logContentActivity(submissionId, 'revision_requested', feedback, { 
    reviewer_id: reviewerId,
    changes: specificChanges 
  })

  return data
}

/**
 * Resubmit content after revision
 */
export const resubmitContent = async (submissionId, updates = {}) => {
  const { data: current } = await supabase
    .from('content_submissions')
    .select('version')
    .eq('id', submissionId)
    .single()

  const { data, error } = await supabase
    .from('content_submissions')
    .update({
      ...updates,
      status: 'submitted',
      version: (current?.version || 1) + 1,
      submitted_at: new Date().toISOString(),
      revision_feedback: null,
      revision_changes: null,
    })
    .eq('id', submissionId)
    .select()
    .single()

  if (error) throw error

  await logContentActivity(submissionId, 'resubmitted', `Resubmitted version ${data.version}`)

  return data
}

/**
 * Approve content
 */
export const approveContent = async (submissionId, reviewerId, paymentAmount = null) => {
  const { data, error } = await supabase
    .from('content_submissions')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      payment_amount: paymentAmount,
      payment_status: paymentAmount ? 'pending_release' : null,
    })
    .eq('id', submissionId)
    .select(`
      *,
      assignment:campaign_assignments(
        creator_id,
        campaign:campaigns(id, title)
      )
    `)
    .single()

  if (error) throw error

  await logContentActivity(submissionId, 'approved', 'Content approved', { reviewer_id: reviewerId })

  // Trigger payment if amount is set
  if (paymentAmount && paymentAmount > 0) {
    try {
      await releaseContentPayment(submissionId, reviewerId)
    } catch (e) {
      console.error('Payment release failed:', e)
    }
  }

  return data
}

/**
 * Reject content
 */
export const rejectContent = async (submissionId, reviewerId, reason) => {
  const { data, error } = await supabase
    .from('content_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select()
    .single()

  if (error) throw error

  await logContentActivity(submissionId, 'rejected', reason, { reviewer_id: reviewerId })

  return data
}

/**
 * Mark content as live
 */
export const markContentLive = async (submissionId, liveUrl, postedAt = null) => {
  const { data, error } = await supabase
    .from('content_submissions')
    .update({
      status: 'live',
      live_url: liveUrl,
      posted_at: postedAt || new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select()
    .single()

  if (error) throw error

  await logContentActivity(submissionId, 'live', `Content live at ${liveUrl}`)

  return data
}

/**
 * Log content activity
 */
const logContentActivity = async (submissionId, activityType, description, metadata = {}) => {
  await supabase
    .from('content_activities')
    .insert({
      submission_id: submissionId,
      activity_type: activityType,
      description,
      metadata,
    })
}

// ============================================
// ASSET DELIVERY
// ============================================

/**
 * Upload campaign asset (developer provides to creators)
 */
export const uploadCampaignAsset = async (campaignId, file, assetType, description = '') => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${campaignId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('campaign-assets')
    .upload(fileName, file)

  if (uploadError) throw uploadError

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('campaign-assets')
    .getPublicUrl(fileName)

  // Save asset record
  const { data, error } = await supabase
    .from('campaign_assets')
    .insert({
      campaign_id: campaignId,
      asset_type: assetType, // 'image', 'video', 'document', 'logo', 'guideline'
      file_name: file.name,
      file_url: publicUrl,
      file_size: file.size,
      mime_type: file.type,
      description,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get campaign assets
 */
export const getCampaignAssets = async (campaignId) => {
  const { data, error } = await supabase
    .from('campaign_assets')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Delete campaign asset
 */
export const deleteCampaignAsset = async (assetId) => {
  // Get asset to find file path
  const { data: asset } = await supabase
    .from('campaign_assets')
    .select('file_url')
    .eq('id', assetId)
    .single()

  if (asset) {
    // Extract path from URL and delete from storage
    const path = asset.file_url.split('/campaign-assets/')[1]
    if (path) {
      await supabase.storage.from('campaign-assets').remove([path])
    }
  }

  const { error } = await supabase
    .from('campaign_assets')
    .delete()
    .eq('id', assetId)

  if (error) throw error
  return { success: true }
}

// ============================================
// CONTENT CALENDAR
// ============================================

/**
 * Schedule content for posting
 */
export const scheduleContent = async (submissionId, scheduledFor, notes = '') => {
  const { data, error } = await supabase
    .from('content_submissions')
    .update({
      status: 'scheduled',
      scheduled_for: scheduledFor,
      schedule_notes: notes,
    })
    .eq('id', submissionId)
    .select()
    .single()

  if (error) throw error

  await logContentActivity(submissionId, 'scheduled', `Scheduled for ${scheduledFor}`)

  return data
}

/**
 * Get content calendar for a campaign
 */
export const getCampaignContentCalendar = async (campaignId, startDate, endDate) => {
  const { data, error } = await supabase
    .from('content_submissions')
    .select(`
      *,
      creator:creator_profiles(
        id,
        user:profiles(full_name, avatar_url)
      )
    `)
    .eq('campaign_id', campaignId)
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', startDate)
    .lte('scheduled_for', endDate)
    .order('scheduled_for', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Get creator's content calendar
 */
export const getCreatorContentCalendar = async (creatorId, startDate, endDate) => {
  const { data, error } = await supabase
    .from('content_submissions')
    .select(`
      *,
      campaign:campaigns(id, title, property_name)
    `)
    .eq('creator_id', creatorId)
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', startDate)
    .lte('scheduled_for', endDate)
    .order('scheduled_for', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Get upcoming content deadlines
 */
export const getUpcomingDeadlines = async (userId, role, days = 7) => {
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + days)

  let query = supabase
    .from('content_submissions')
    .select(`
      *,
      campaign:campaigns(id, title),
      creator:creator_profiles(user:profiles(full_name))
    `)
    .lte('scheduled_for', endDate.toISOString())
    .gte('scheduled_for', new Date().toISOString())
    .in('status', ['approved', 'scheduled'])
    .order('scheduled_for', { ascending: true })

  if (role === 'creator') {
    query = query.eq('creator_id', userId)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

// ============================================
// CONTENT STATS
// ============================================

/**
 * Get content submission stats for a campaign
 */
export const getCampaignContentStats = async (campaignId) => {
  const { data, error } = await supabase
    .from('content_submissions')
    .select('status, content_type')
    .eq('campaign_id', campaignId)

  if (error) throw error

  const stats = {
    total: data.length,
    byStatus: {},
    byType: {},
  }

  data.forEach(item => {
    stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1
    stats.byType[item.content_type] = (stats.byType[item.content_type] || 0) + 1
  })

  return stats
}

/**
 * Get creator's content performance
 */
export const getCreatorContentPerformance = async (creatorId) => {
  const { data, error } = await supabase
    .from('content_submissions')
    .select('status, payment_status, payment_amount')
    .eq('creator_id', creatorId)

  if (error) throw error

  const stats = {
    total: data.length,
    approved: 0,
    pending: 0,
    revisions: 0,
    rejected: 0,
    totalEarned: 0,
    approvalRate: 0,
  }

  data.forEach(item => {
    if (item.status === 'approved' || item.status === 'live') {
      stats.approved++
      if (item.payment_status === 'paid' && item.payment_amount) {
        stats.totalEarned += parseFloat(item.payment_amount)
      }
    } else if (item.status === 'submitted') {
      stats.pending++
    } else if (item.status === 'revision_requested') {
      stats.revisions++
    } else if (item.status === 'rejected') {
      stats.rejected++
    }
  })

  stats.approvalRate = stats.total > 0 
    ? Math.round((stats.approved / stats.total) * 100) 
    : 0

  return stats
}

export default {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  createContentSubmission,
  submitContentForReview,
  requestRevision,
  resubmitContent,
  approveContent,
  rejectContent,
  markContentLive,
  uploadCampaignAsset,
  getCampaignAssets,
  deleteCampaignAsset,
  scheduleContent,
  getCampaignContentCalendar,
  getCreatorContentCalendar,
  getUpcomingDeadlines,
  getCampaignContentStats,
  getCreatorContentPerformance,
}
