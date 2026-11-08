/**
 * Single source of truth for what the platform must NEVER show to creators
 * across on-screen views (ledger), downloadable artefacts (CSV/PDF), and
 * generated invoices.
 *
 * Keep this list minimal and authoritative — every consumer that touches
 * creator-visible wallet/transaction data should import from here so a
 * regression in one place can't bypass the rule everywhere else.
 */

// Wallet transaction types that disclose developer-side platform commission.
// Creators must never see these rows.
export const CREATOR_HIDDEN_TX_TYPES = new Set(['platform_fee'])

// Invoice types that bake the 25% platform commission into the document
// itself (line items, totals, VAT). These should never be generated for a
// creator viewer.
export const CREATOR_HIDDEN_INVOICE_TYPES = new Set([
  'campaign_funding',
  'platform_fee',
])

/**
 * @param {{transaction_type?: string}} tx
 * @returns {boolean} true if the transaction is safe to expose to a creator.
 */
export const isVisibleToCreator = (tx) =>
  !CREATOR_HIDDEN_TX_TYPES.has(tx?.transaction_type)
