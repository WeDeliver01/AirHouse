/**
 * Manual bank-transfer payments.
 *
 * The platform collects money by EFT and pays it out by EFT. A developer is
 * given a reference to quote, pays into the platform's bank account, and an
 * operator confirms receipt against the bank statement.
 *
 * The confirmation is the only event that creates funds. A developer saying
 * they have paid does not move anything -- that distinction is the whole
 * point of this flow, and it is enforced in the database, not here.
 *
 * Card payments run through the same `payment_intents` table once
 * `payments_mode` is switched to "gateway" in super-admin settings.
 */

import { supabase } from './supabase'
import { newIdempotencyKey } from './payments'

/** Bank details shown to a developer so they can make the transfer. */
export const PLATFORM_BANK_DETAILS = {
  accountName: import.meta.env?.VITE_BANK_ACCOUNT_NAME || 'AirHouse (Pty) Ltd',
  bank: import.meta.env?.VITE_BANK_NAME || 'First National Bank',
  accountNumber: import.meta.env?.VITE_BANK_ACCOUNT_NUMBER || '',
  branchCode: import.meta.env?.VITE_BANK_BRANCH_CODE || '',
  accountType: 'Cheque',
}

/** True when the bank details needed to instruct a payer are configured. */
export const bankDetailsConfigured = () =>
  Boolean(PLATFORM_BANK_DETAILS.accountNumber && PLATFORM_BANK_DETAILS.branchCode)

function rpcError(error, fallback) {
  const message = error?.message || fallback
  return new Error(message.replace(/^.*?:\s*/, '') || fallback)
}

/** Read a platform setting. Returns the fallback if it is not configured. */
export async function getPlatformSetting(key, fallback = null) {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error || !data) return fallback
  return data.value
}

/** Which collection mode the platform is running in: 'manual' or 'gateway'. */
export async function getPaymentsMode() {
  return (await getPlatformSetting('payments_mode', 'manual')) || 'manual'
}

/**
 * Raise a funding request for a campaign.
 *
 * Creates no money. Returns the reference the developer must quote on their
 * transfer, so the operator can match it to a line on the bank statement.
 */
export async function createPaymentIntent(campaignId, amountRands, options = {}) {
  const amountCents = Math.round(Number(amountRands) * 100)

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Amount must be greater than zero')
  }

  const { data, error } = await supabase.rpc('create_payment_intent', {
    p_campaign_id: campaignId,
    p_amount_cents: amountCents,
    p_idempotency_key: options.idempotencyKey || newIdempotencyKey('intent'),
  })

  if (error) throw rpcError(error, 'Could not create the funding request')
  return data
}

/**
 * Tell the platform the transfer has been made, attaching proof.
 *
 * Still creates no money: this only moves the request into the operator's
 * review queue.
 */
export async function submitPaymentProof(paymentIntentId, { proofPath, bankReference }) {
  const { data, error } = await supabase.rpc('submit_payment_proof', {
    p_payment_intent_id: paymentIntentId,
    p_proof_object_path: proofPath || null,
    p_bank_reference: bankReference || null,
  })

  if (error) throw rpcError(error, 'Could not submit proof of payment')
  return data
}

/**
 * Confirm that money actually arrived. Super admins only, and never for
 * one's own payment -- both enforced by the database function.
 */
export async function confirmManualPayment(paymentIntentId, bankReference, options = {}) {
  const { data, error } = await supabase.rpc('confirm_manual_payment', {
    p_payment_intent_id: paymentIntentId,
    p_bank_reference: bankReference || null,
    // Keyed on the intent, so a double click cannot fund a campaign twice.
    p_idempotency_key: options.idempotencyKey || `confirm-${paymentIntentId}`,
  })

  if (error) throw rpcError(error, 'Could not confirm the payment')
  return data
}

/** Reject a payment that never arrived or cannot be matched to a statement. */
export async function rejectManualPayment(paymentIntentId, reason) {
  const { data, error } = await supabase.rpc('reject_manual_payment', {
    p_payment_intent_id: paymentIntentId,
    p_reason: reason || null,
  })

  if (error) throw rpcError(error, 'Could not reject the payment')
  return data
}

/** Payment requests raised by the signed-in developer. */
export async function listMyPaymentIntents() {
  const { data, error } = await supabase
    .from('payment_intents')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/** Everything waiting on an operator. */
export async function listPendingPaymentIntents() {
  const { data, error } = await supabase
    .from('payment_intents')
    .select('*, payer:profiles!payer_id(full_name, email, company_name), campaign:campaigns(title)')
    .in('status', ['awaiting_payment', 'under_review'])
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Upload proof of payment to the private proofs area of the user's own
 * folder. The path convention is `<user id>/...`, which is what the storage
 * policies check.
 */
export async function uploadPaymentProof(userId, paymentIntentId, file) {
  const extension = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${userId}/payment-proofs/${paymentIntentId}.${extension}`

  const { error } = await supabase.storage
    .from('verification-documents')
    .upload(path, file, { upsert: true })

  if (error) throw error
  return path
}

/** Run the reconciliation report. Super admins only. */
export async function runReconciliation() {
  const { data, error } = await supabase.rpc('run_reconciliation')
  if (error) throw rpcError(error, 'Could not run reconciliation')
  return data
}

export default {
  PLATFORM_BANK_DETAILS,
  bankDetailsConfigured,
  getPaymentsMode,
  getPlatformSetting,
  createPaymentIntent,
  submitPaymentProof,
  confirmManualPayment,
  rejectManualPayment,
  listMyPaymentIntents,
  listPendingPaymentIntents,
  uploadPaymentProof,
  runReconciliation,
}
