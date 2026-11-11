/**
 * Creator rate cards and checkout pricing.
 *
 * A creator prices their own deliverables (platform + type), a developer
 * builds a cart from one creator's rate card, and checkout charges the cart
 * subtotal plus a flat 2.7% platform transaction fee -- see
 * supabase/migrations/030_pricing_cart_checkout.sql. There is no 75/25
 * revenue split and no escrow hold: the creator is paid the remaining 97.3%
 * directly once the payment is confirmed.
 */

import { supabase } from './supabase'

export const PLATFORM_FEE_RATE = 0.027

export const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'x', label: 'X' },
  { value: 'other', label: 'Other' },
]

export const DELIVERABLE_TYPES = [
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'feed_post', label: 'Feed Post' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'video', label: 'Video' },
  { value: 'short', label: 'Short' },
  { value: 'live_stream', label: 'Live Stream' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'other', label: 'Other' },
]

/** Split a subtotal (rand) into the platform's 2.7% fee and the creator's share. */
export function computeCheckoutTotals(subtotal) {
  const sub = Number(subtotal) || 0
  const platformFee = Math.round(sub * PLATFORM_FEE_RATE * 100) / 100
  const creatorAmount = Math.round((sub - platformFee) * 100) / 100
  return { subtotal: sub, platformFee, creatorAmount, total: sub }
}

/** The signed-in creator's own rate card, including inactive rows. */
export async function listMyRateCard() {
  const { data: user } = await supabase.auth.getUser()
  const userId = user?.user?.id
  if (!userId) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('creator_rate_cards')
    .select('*')
    .eq('creator_id', userId)
    .order('platform', { ascending: true })
    .order('deliverable_type', { ascending: true })

  if (error) throw error
  return data || []
}

/** A creator's published (active) rate card, as seen by a developer. */
export async function listCreatorRateCard(creatorId) {
  const { data, error } = await supabase
    .from('creator_rate_cards')
    .select('*')
    .eq('creator_id', creatorId)
    .eq('is_active', true)
    .order('platform', { ascending: true })

  if (error) throw error
  return data || []
}

/** Create or update one rate-card line (platform + deliverable type is unique per creator). */
export async function upsertRateCardItem(item) {
  const { data: user } = await supabase.auth.getUser()
  const userId = user?.user?.id
  if (!userId) throw new Error('Not signed in')

  const priceRands = Number(item.unitPrice)
  if (!Number.isFinite(priceRands) || priceRands <= 0) {
    throw new Error('Price must be greater than zero')
  }

  const payload = {
    creator_id: userId,
    platform: item.platform,
    deliverable_type: item.deliverableType,
    label: item.label || `${item.platform} ${item.deliverableType}`,
    description: item.description || null,
    unit_price_cents: Math.round(priceRands * 100),
    is_active: item.isActive !== false,
  }
  if (item.id) payload.id = item.id

  const { data, error } = await supabase
    .from('creator_rate_cards')
    .upsert(payload, { onConflict: 'creator_id,platform,deliverable_type' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteRateCardItem(id) {
  const { error } = await supabase.from('creator_rate_cards').delete().eq('id', id)
  if (error) throw error
  return { success: true }
}

export default {
  PLATFORM_FEE_RATE,
  PLATFORMS,
  DELIVERABLE_TYPES,
  computeCheckoutTotals,
  listMyRateCard,
  listCreatorRateCard,
  upsertRateCardItem,
  deleteRateCardItem,
}
