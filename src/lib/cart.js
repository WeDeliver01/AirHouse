/**
 * The campaign cart: a developer adds a creator's rate-card deliverables to
 * a draft cart, then checks it out into a booked campaign.
 *
 * Cart CRUD runs as plain table operations (RLS keeps a developer to their
 * own cart). Checkout is the one step that creates a campaign, assigns the
 * creator and raises the funding request in a single atomic call -- see
 * checkout_campaign_cart() in supabase/migrations/030_pricing_cart_checkout.sql.
 */

import { supabase } from './supabase'
import { newIdempotencyKey } from './payments'

function rpcError(error, fallback) {
  const message = error?.message || fallback
  return new Error(message.replace(/^.*?:\s*/, '') || fallback)
}

/** The signed-in developer's draft cart for this creator, creating one if needed. */
export async function getOrCreateDraftCart(creatorId) {
  const { data: user } = await supabase.auth.getUser()
  const developerId = user?.user?.id
  if (!developerId) throw new Error('Not signed in')

  const { data: existing, error: findError } = await supabase
    .from('campaign_carts')
    .select('*, items:campaign_cart_items(*)')
    .eq('developer_id', developerId)
    .eq('creator_id', creatorId)
    .eq('status', 'draft')
    .maybeSingle()

  if (findError) throw findError
  if (existing) return existing

  const { data: created, error: createError } = await supabase
    .from('campaign_carts')
    .insert({ developer_id: developerId, creator_id: creatorId })
    .select('*, items:campaign_cart_items(*)')
    .single()

  if (createError) throw createError
  return created
}

export async function getCart(cartId) {
  const { data, error } = await supabase
    .from('campaign_carts')
    .select('*, items:campaign_cart_items(*)')
    .eq('id', cartId)
    .single()

  if (error) throw error
  return data
}

/** Add a rate-card deliverable to the cart, snapshotting its current price. */
export async function addCartItem(cartId, rateCardItem, quantity = 1) {
  const qty = Math.max(1, Math.round(Number(quantity) || 1))

  const { data, error } = await supabase
    .from('campaign_cart_items')
    .insert({
      cart_id: cartId,
      rate_card_id: rateCardItem.id,
      platform: rateCardItem.platform,
      deliverable_type: rateCardItem.deliverable_type,
      label: rateCardItem.label,
      quantity: qty,
      unit_price_cents: rateCardItem.unit_price_cents,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateCartItemQuantity(itemId, quantity) {
  const qty = Math.max(1, Math.round(Number(quantity) || 1))
  const { data, error } = await supabase
    .from('campaign_cart_items')
    .update({ quantity: qty })
    .eq('id', itemId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function removeCartItem(itemId) {
  const { error } = await supabase.from('campaign_cart_items').delete().eq('id', itemId)
  if (error) throw error
  return { success: true }
}

/** Sum of quantity x unit price across a cart's items, in cents. */
export function cartSubtotalCents(cart) {
  return (cart?.items || []).reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0)
}

/**
 * Check the cart out: creates the campaign, assigns the creator, and raises
 * the funding request for the full total. Returns the campaign id so the
 * caller can route straight to the existing funding/payment screen.
 */
export async function checkoutCart(cartId, { title, propertyName, propertyLocation }, options = {}) {
  const { data, error } = await supabase.rpc('checkout_campaign_cart', {
    p_cart_id: cartId,
    p_title: title,
    p_property_name: propertyName || null,
    p_property_location: propertyLocation || null,
    p_idempotency_key: options.idempotencyKey || newIdempotencyKey('checkout'),
  })

  if (error) throw rpcError(error, 'Checkout failed')
  return data
}

export default {
  getOrCreateDraftCart,
  getCart,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
  cartSubtotalCents,
  checkoutCart,
}
