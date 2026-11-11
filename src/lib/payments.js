/**
 * Payment and wallet client.
 *
 * IMPORTANT -- read before changing anything here.
 *
 * This module no longer moves money. Every balance-changing operation is a
 * call to a database function that runs in a single transaction, takes row
 * locks, re-derives the amounts from stored data and enforces authorization
 * itself (see supabase/migrations/016_financial_integrity.sql and
 * 030_pricing_cart_checkout.sql).
 *
 * The browser is not trusted to decide:
 *   - how much a creator is paid,
 *   - whether a payment succeeded,
 *   - what a wallet balance becomes.
 *
 * There is no escrow and no 75/25 revenue split. A campaign is priced from
 * the creator's rate card at checkout (see cart.js / pricing.js); once an
 * operator confirms the payment, the creator is credited 97.3% of it
 * directly and the platform keeps a flat 2.7% transaction fee. Nothing is
 * held back pending content approval.
 *
 * If you need a new financial operation, add a function to migration 016 (or
 * a later financial migration) and call it from here. Do not write to
 * `wallets`, `wallet_transactions` or `payout_requests` directly -- those
 * grants have been revoked and the write will be refused.
 */

import { supabase } from './supabase'

// ============================================
// CONFIGURATION
// ============================================

const GATEWAY_FROM_ENV = import.meta.env?.VITE_PAYMENT_GATEWAY || 'test'
const IS_PRODUCTION = Boolean(import.meta.env?.PROD)

/**
 * Production builds refuse the simulated gateway.
 *
 * The previous default was a hard-coded 'test' gateway whose checkout and
 * payout calls returned success without any money moving. Shipping that to
 * production would show users confirmed payments and payouts that never
 * happened (AH-010).
 */
export const PAYMENT_CONFIG = {
  PLATFORM_FEE_RATE: 0.027, // 2.7% platform transaction fee, taken at checkout
  PAYOUT_FEE_RATE: 0.03, // 3% payout fee
  MIN_PAYOUT_AMOUNT: 100, // Minimum R100 to withdraw
  CURRENCY: 'ZAR',

  GATEWAY: GATEWAY_FROM_ENV,

  YOCO_API_URL: 'https://online.yoco.com/v1',
  BOBPAY_API_URL: 'https://api.bobpay.co.za/v1',
}

/** True when the configured gateway only simulates payments. */
export const isSimulatedGateway = () => PAYMENT_CONFIG.GATEWAY === 'test'

/**
 * Throw if a real-money operation is attempted while no real gateway is
 * configured. Called at the top of every entry point that would otherwise
 * report a successful payment.
 */
function assertRealGatewayAvailable(operation) {
  if (!isSimulatedGateway()) return

  if (IS_PRODUCTION) {
    throw new Error(
      `${operation} is unavailable: no payment provider is configured. ` +
        'The simulated gateway cannot be used in production.',
    )
  }
}

/** Idempotency keys make a retried request safe to replay. */
export function newIdempotencyKey(prefix = 'op') {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

/** Normalise a PostgREST RPC error into something a caller can show. */
function rpcError(error, fallback) {
  const message = error?.message || fallback
  // Postgres RAISE EXCEPTION messages arrive prefixed; strip the noise.
  return new Error(message.replace(/^.*?:\s*/, '') || fallback)
}

// ============================================
// PAYMENT GATEWAY INTERFACE
// ============================================

/**
 * Initialise a payment checkout session.
 *
 * Neither provider integration is implemented. Until one is, this returns an
 * explicit failure rather than a fake success.
 */
export const createCheckoutSession = async ({
  amount,
  currency = 'ZAR',
  description,
  metadata = {},
  successUrl,
  cancelUrl,
}) => {
  assertRealGatewayAvailable('Checkout')

  if (isSimulatedGateway()) {
    return {
      success: false,
      simulated: true,
      checkoutUrl: null,
      error:
        'Payments are running against the simulated gateway. No money will move. ' +
        'Configure VITE_PAYMENT_GATEWAY and the provider integration before accepting payments.',
    }
  }

  if (PAYMENT_CONFIG.GATEWAY === 'yoco') {
    return createYocoCheckout({ amount, currency, description, metadata, successUrl, cancelUrl })
  }

  if (PAYMENT_CONFIG.GATEWAY === 'bobpay') {
    return createBobPayCheckout({ amount, currency, description, metadata, successUrl, cancelUrl })
  }

  throw new Error(`Unknown payment gateway: ${PAYMENT_CONFIG.GATEWAY}`)
}

/**
 * Yoco checkout -- NOT IMPLEMENTED.
 *
 * A real implementation must run server-side so the secret key is never in
 * the browser bundle, and must confirm the payment from a signed webhook
 * rather than from the redirect. See docs/FINANCIAL_ARCHITECTURE.md.
 */
const createYocoCheckout = async () => ({
  success: false,
  error: 'Yoco integration is not implemented.',
  checkoutUrl: null,
})

/** BobPay checkout -- NOT IMPLEMENTED. Same constraints as Yoco above. */
const createBobPayCheckout = async () => ({
  success: false,
  error: 'BobPay integration is not implemented.',
  checkoutUrl: null,
})

/** Bank payout execution -- NOT IMPLEMENTED. */
export const processPayout = async () => ({
  success: false,
  error: 'Payout integration is not implemented.',
})

// ============================================
// WALLET READS
// ============================================

/**
 * Read a user's wallet. Wallets are created by the signup trigger and by the
 * database functions; the client no longer creates them.
 */
export const getWalletBalance = async (userId) => {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const getWalletTransactions = async (userId, limit = 50) => {
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!wallet) return []

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// ============================================
// CAMPAIGN FUNDING
// ============================================

/**
 * Fund a campaign.
 *
 * DISABLED pending a real payment provider.
 *
 * A campaign is funded by raising a payment intent against it (see
 * createPaymentIntent() in manualPayments.js, or via cart.js's checkoutCart()
 * for a rate-card booking) and having an operator confirm the transfer.
 * Crediting money must happen server-side, only after a provider webhook or
 * an operator has confirmed settlement, which is why this now refuses rather
 * than silently creating funds (AH-010, AH-011).
 */
export const fundCampaign = async () => {
  throw new Error(
    'Campaign funding is disabled until a payment provider is integrated. ' +
      'Funds may only be credited by the server after a verified provider webhook or ' +
      'an operator-confirmed bank transfer.',
  )
}

// ============================================
// REFUNDS
// ============================================

/**
 * Claw back a campaign payment and refund the developer.
 *
 * There is no escrow to refund from any more: the creator was already paid
 * in full at checkout, so this pulls the disputed amount back out of the
 * creator's own wallet balance. It fails cleanly if the creator has already
 * withdrawn more than the refund amount -- see refund_campaign_payment() in
 * supabase/migrations/030_pricing_cart_checkout.sql. Super admins only.
 */
export const refundCampaignPayment = async ({
  campaignId,
  creatorId,
  amount,
  reason,
  idempotencyKey,
}) => {
  if (!campaignId || !creatorId) throw new Error('campaignId and creatorId are required')
  if (!amount || amount <= 0) throw new Error('Refund amount must be greater than zero')

  const { data, error } = await supabase.rpc('refund_campaign_payment', {
    p_campaign_id: campaignId,
    p_creator_id: creatorId,
    p_amount: amount,
    p_reason: reason || 'Dispute resolution',
    p_idempotency_key: idempotencyKey || newIdempotencyKey('refund'),
  })

  if (error) throw rpcError(error, 'Refund failed')
  return data
}

// ============================================
// PAYOUTS
// ============================================

/**
 * Request a payout. The fee, the minimum and the balance hold are all applied
 * by request_creator_payout(); nothing here is authoritative.
 */
export const requestPayout = async (userId, amount, bankAccountId, options = {}) => {
  if (!bankAccountId) throw new Error('A bank account is required')

  const { data, error } = await supabase.rpc('request_creator_payout', {
    p_amount: amount,
    p_bank_account_id: bankAccountId,
    p_idempotency_key: options.idempotencyKey || newIdempotencyKey('payout'),
  })

  if (error) throw rpcError(error, 'Payout request failed')
  return data
}

/**
 * Approve or reject a payout request. Super admins only, and never one's own
 * request -- both enforced by the database function.
 */
export const processPayoutRequest = async (payoutId, _adminId, action, notes = '', options = {}) => {
  if (!['approve', 'reject'].includes(action)) {
    throw new Error('Action must be approve or reject')
  }

  const { data, error } = await supabase.rpc('process_payout_request', {
    p_payout_id: payoutId,
    p_action: action,
    p_notes: notes,
    p_idempotency_key: options.idempotencyKey || newIdempotencyKey('process-payout'),
    p_provider_reference: options.providerReference || null,
  })

  if (error) throw rpcError(error, 'Payout processing failed')
  return data
}

export const getPayoutHistory = async (userId) => {
  const { data, error } = await supabase
    .from('payout_requests')
    .select('*, bank_account:bank_accounts(bank_name, account_number)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// ============================================
// BANK ACCOUNTS
// ============================================

export const addBankAccount = async (userId, bankDetails) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      user_id: userId,
      bank_name: bankDetails.bankName,
      account_holder_name: bankDetails.accountHolderName,
      account_number: bankDetails.accountNumber,
      account_type: bankDetails.accountType || 'savings',
      branch_code: bankDetails.branchCode,
      is_default: bankDetails.isDefault || false,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export const getBankAccounts = async (userId) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })

  if (error) throw error
  return data || []
}

export const deleteBankAccount = async (userId, bankAccountId) => {
  const { error } = await supabase
    .from('bank_accounts')
    .delete()
    .eq('id', bankAccountId)
    .eq('user_id', userId)

  if (error) throw error
  return { success: true }
}

export default {
  PAYMENT_CONFIG,
  isSimulatedGateway,
  newIdempotencyKey,
  createCheckoutSession,
  getWalletBalance,
  getWalletTransactions,
  fundCampaign,
  refundCampaignPayment,
  requestPayout,
  processPayoutRequest,
  getPayoutHistory,
  addBankAccount,
  getBankAccounts,
  deleteBankAccount,
}
