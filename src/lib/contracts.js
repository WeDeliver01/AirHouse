/**
 * Contract signing helpers.
 *
 * - hashContractTerms: deterministic SHA-256 over the legal payload so that
 *   tampering with the terms after a signature would break the hash check.
 * - getClientIP: best-effort lookup via ipify; failures degrade gracefully
 *   and we record `unknown` rather than blocking the signature.
 * - signContract: writes signature + ip + timestamp + hash; once both
 *   parties have signed, status flips to 'signed' and the database trigger
 *   in migration 011 makes the row immutable.
 */

import { supabase } from './supabase'

// ============================================
// Hashing
// ============================================

/**
 * Stable JSON stringify (sorted keys) so the same logical contract always
 * produces the same hash regardless of property insertion order.
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
}

/**
 * Build the canonical legal payload for a contract and return its SHA-256
 * digest as a lowercase hex string.
 */
export async function hashContractTerms(contract) {
  const payload = stableStringify({
    terms: contract.terms || '',
    deliverables: contract.deliverables || [],
    payment_terms: contract.payment_terms || {},
    total_value: contract.total_value !== undefined ? Number(contract.total_value) : 0,
    start_date: contract.start_date || null,
    end_date: contract.end_date || null,
  })

  const enc = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', enc)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ============================================
// Client IP (best-effort, no PII storage beyond IP itself)
// ============================================

let _cachedIp = null
let _cachedAt = 0
const IP_TTL_MS = 5 * 60 * 1000

export async function getClientIP() {
  const now = Date.now()
  if (_cachedIp && now - _cachedAt < IP_TTL_MS) return _cachedIp
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) throw new Error('ipify status ' + res.status)
    const json = await res.json()
    _cachedIp = json?.ip || 'unknown'
  } catch (e) {
    console.warn('Could not resolve client IP:', e.message)
    _cachedIp = 'unknown'
  }
  _cachedAt = now
  return _cachedIp
}

// ============================================
// Signing
// ============================================

/**
 * Sign a contract on behalf of the calling user.
 *
 * The role (creator vs developer) is determined SERVER-SIDE by the
 * `sign_contract` Postgres RPC by matching `auth.uid()` to either
 * `creator_profiles.user_id` or `contracts.developer_id`. Clients cannot
 * forge a counterparty signature: the role argument is intentionally not
 * trusted on the wire.
 *
 * @param {object} params
 * @param {object} params.contract        the full contract row
 * @param {string} params.signature       data URL (drawn) or typed name
 * @param {'drawn'|'typed'} params.signatureType
 * @returns {Promise<object>} the updated contract row
 */
export async function signContract({ contract, signature, signatureType }) {
  if (!contract?.id) throw new Error('contract is required')
  if (!signature) throw new Error('signature is required')
  if (!['drawn', 'typed'].includes(signatureType)) throw new Error('invalid signatureType')

  const [hash, ip] = await Promise.all([
    hashContractTerms(contract),
    getClientIP(),
  ])

  const { data, error } = await supabase.rpc('sign_contract', {
    p_contract_id: contract.id,
    p_signature: signature,
    p_signature_type: signatureType,
    p_signature_ip: ip,
    p_terms_hash: hash,
  })
  if (error) throw error
  // Supabase returns the row as either an object or a single-element array
  // depending on RPC return shape — normalise to a single row.
  return Array.isArray(data) ? data[0] : data
}

/**
 * Verify a signed contract: re-compute the hash from the current row and
 * compare with the snapshot taken when both parties signed.
 */
export async function verifyContractIntegrity(contract) {
  if (!contract?.signed_terms_hash) return { ok: false, reason: 'not signed' }
  const current = await hashContractTerms(contract)
  return current === contract.signed_terms_hash
    ? { ok: true }
    : { ok: false, reason: 'terms hash mismatch' }
}

export const CONTRACT_STATUS = {
  draft:             { label: 'Draft',              tone: 'neutral',   icon: 'edit_document' },
  pending_creator:   { label: 'Awaiting Creator',   tone: 'warning',   icon: 'schedule' },
  pending_developer: { label: 'Awaiting Developer', tone: 'warning',   icon: 'schedule' },
  signed:            { label: 'Signed',             tone: 'success',   icon: 'task_alt' },
  expired:           { label: 'Expired',            tone: 'danger',    icon: 'event_busy' },
  cancelled:         { label: 'Cancelled',          tone: 'neutral',   icon: 'cancel' },
}
