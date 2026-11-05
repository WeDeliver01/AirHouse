import { supabase } from './supabase'

const HOUR_MS = 1000 * 60 * 60
const RESPONSE_FETCH_LIMIT = 500
const RESPONSE_CAP_HOURS = 7 * 24

export const fetchAvgResponseHours = async (userId) => {
  if (!userId) return null
  const { data, error } = await supabase
    .from('messages')
    .select('sender_id, recipient_id, created_at')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: true })
    .limit(RESPONSE_FETCH_LIMIT)

  if (error || !data || data.length === 0) return null

  const byPartner = new Map()
  for (const m of data) {
    const partnerId = m.sender_id === userId ? m.recipient_id : m.sender_id
    if (!byPartner.has(partnerId)) byPartner.set(partnerId, [])
    byPartner.get(partnerId).push(m)
  }

  const responseHours = []
  for (const conv of byPartner.values()) {
    let pendingIncomingAt = null
    for (const m of conv) {
      if (m.recipient_id === userId) {
        if (pendingIncomingAt === null) pendingIncomingAt = new Date(m.created_at).getTime()
      } else if (pendingIncomingAt !== null) {
        const diffHours = (new Date(m.created_at).getTime() - pendingIncomingAt) / HOUR_MS
        if (diffHours >= 0 && diffHours <= RESPONSE_CAP_HOURS) responseHours.push(diffHours)
        pendingIncomingAt = null
      }
    }
  }

  if (responseHours.length === 0) return null
  const sum = responseHours.reduce((a, b) => a + b, 0)
  return sum / responseHours.length
}

export const communicationScoreFromHours = (avgHours) => {
  if (avgHours == null) return null
  if (avgHours <= 1) return 100
  if (avgHours >= 72) return 40
  const score = 100 - ((avgHours - 1) / (72 - 1)) * 60
  return Math.round(score)
}

export const fetchPunctualityRate = async (creatorProfileId) => {
  if (!creatorProfileId) return { rate: null, completed: 0, onTime: 0 }
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('id, completed_at, is_completed, campaigns!inner(end_date)')
    .eq('creator_id', creatorProfileId)
    .eq('is_completed', true)
    .not('completed_at', 'is', null)

  if (error || !data) return { rate: null, completed: 0, onTime: 0 }

  const eligible = data.filter((a) => a.campaigns?.end_date)
  if (eligible.length === 0) return { rate: null, completed: 0, onTime: 0 }

  const onTime = eligible.filter((a) => {
    const deadline = new Date(`${a.campaigns.end_date}T23:59:59`).getTime()
    return new Date(a.completed_at).getTime() <= deadline
  }).length

  return {
    rate: Math.round((onTime / eligible.length) * 100),
    completed: eligible.length,
    onTime,
  }
}
