import { supabase } from './supabase'

const FEE_RATES = {
  PLATFORM: 0.027,
  PAYOUT: 0.03,
}

const TYPE_META = {
  deposit:          { label: 'Deposit',              kind: 'deposit',       fromRole: 'developer' },
  platform_fee:     { label: 'Platform Fee',         kind: 'commission',    fromRole: 'developer' },
  escrow_lock:      { label: 'Campaign Payment',     kind: 'escrow',        fromRole: 'developer' },
  escrow_release:   { label: 'Campaign Payment',     kind: 'release',       fromRole: 'developer' },
  content_payment:  { label: 'Campaign Payment',     kind: 'earning',       fromRole: 'developer' },
  payout_request:   { label: 'Payout Request',       kind: 'payout',        fromRole: 'platform' },
  payout_fee:       { label: 'Payout Fee',           kind: 'fee',           fromRole: 'platform' },
  refund:           { label: 'Refund',               kind: 'refund',        fromRole: 'platform' },
  adjustment:       { label: 'Adjustment',           kind: 'adjustment',    fromRole: 'platform' },
}

const STATUS_FROM_TX = {
  // Wallet transactions are recorded after they happen, so they're always "Completed"
  // unless the related payout still pending; we infer that below.
  default: { label: 'Completed', color: 'success' },
}

const PLATFORM_PARTY = {
  name: 'AirHouse (Pty) Ltd',
  email: 'billing@airhouse.co.za',
  address: '123 Main Street, Sandton, Johannesburg, 2196',
  id: 'Reg 2024/123456/07',
}

/**
 * Fetch a wallet_transaction with surrounding context (wallet, owner, related campaign,
 * related payout). The Supabase RLS policy on wallet_transactions ensures only the owner
 * (or admins) can see this row.
 *
 * Returns a normalised invoice object suitable for both on-screen rendering and PDF.
 *
 * @param {string} txId
 * @param {object} [options]
 * @param {('creator'|'developer'|'admin')} [options.viewerRole] - Role of the user viewing
 *   the invoice. When 'creator', any developer-side platform commission line items and
 *   summary rows are suppressed and totals are recomputed accordingly.
 */
export async function buildInvoiceFromTransaction(txId, options = {}) {
  if (!txId) throw new Error('Missing transaction ID')
  const { viewerRole } = options

  const { data: tx, error } = await supabase
    .from('wallet_transactions')
    .select(`
      id, wallet_id, transaction_type, amount, fee, net_amount,
      balance_before, balance_after, description, reference_number,
      related_campaign_id, related_payout_id, created_at,
      wallet:wallets ( id, user_id, wallet_type )
    `)
    .eq('id', txId)
    .single()

  if (error) throw error
  if (!tx) throw new Error('Transaction not found')

  // Owner profile (the user this transaction belongs to)
  const ownerId = tx.wallet?.user_id
  let owner = null
  if (ownerId) {
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name, role')
      .eq('id', ownerId)
      .single()
    owner = ownerProfile
  }

  // Optional related campaign + developer
  let campaign = null
  let developer = null
  if (tx.related_campaign_id) {
    const { data: campaignRow } = await supabase
      .from('campaigns')
      .select('id, title, property_name, total_budget, platform_fee, creator_budget, developer_id')
      .eq('id', tx.related_campaign_id)
      .single()
    campaign = campaignRow
    if (campaign?.developer_id && campaign.developer_id !== ownerId) {
      const { data: devProfile } = await supabase
        .from('profiles')
        .select('id, full_name, email, company_name')
        .eq('id', campaign.developer_id)
        .single()
      developer = devProfile
    }
  }

  // Optional related payout
  let payout = null
  if (tx.related_payout_id) {
    const { data: payoutRow } = await supabase
      .from('payout_requests')
      .select(`
        id, amount, payout_fee, net_amount, status, requested_at, processed_at,
        bank_account:bank_accounts ( bank_name, account_number, account_holder_name )
      `)
      .eq('id', tx.related_payout_id)
      .single()
    payout = payoutRow
  }

  return normaliseToInvoice({ tx, owner, campaign, developer, payout, viewerRole })
}

function normaliseToInvoice({ tx, owner, campaign, developer, payout, viewerRole }) {
  // Hide platform commission from creators; developers/admins keep it.
  const hidePlatformFee = viewerRole === 'creator'

  // Defensive sanitised invoice if a creator ever loads a platform_fee tx.
  if (hidePlatformFee && tx.transaction_type === 'platform_fee') {
    const safeAmount = Math.abs(Number(tx.amount) || 0)
    return {
      invoiceNumber: 'INV-' + String(tx.id).slice(0, 8).toUpperCase(),
      issueDate: tx.created_at,
      datePaid: tx.created_at,
      statusLabel: 'Completed',
      statusColor: 'success',
      isReceipt: false,
      type: 'adjustment',
      typeLabel: 'Adjustment',
      fromLabel: 'Issued By (AirHouse)',
      toLabel: 'Bill To (Creator)',
      from: PLATFORM_PARTY,
      to: owner
        ? { name: owner.full_name || 'AirHouse User', email: owner.email }
        : { name: 'AirHouse User' },
      items: [{ description: 'Adjustment', details: null, amount: safeAmount }],
      summary: [{ label: 'Adjustment', value: safeAmount }],
      total: safeAmount,
      totalLabel: 'Total (ZAR)',
      referenceNumber: tx.reference_number,
      description: null,
      rawTransaction: null,
      campaign: null,
      payout: null,
    }
  }

  const meta = TYPE_META[tx.transaction_type] || TYPE_META.adjustment
  const ownerParty = owner
    ? {
        name: owner.company_name || owner.full_name,
        email: owner.email,
        address: owner.role === 'developer' ? 'Developer · AirHouse Platform' : 'Creator · AirHouse Platform',
        id: owner.id?.slice(0, 8)?.toUpperCase(),
      }
    : { name: 'AirHouse User' }

  // Decide invoice direction (who is "Bill From" / "Bill To")
  let from, to, fromLabel, toLabel
  if (meta.fromRole === 'developer' && developer) {
    from = {
      name: developer.company_name || developer.full_name,
      email: developer.email,
      id: developer.id?.slice(0, 8)?.toUpperCase(),
    }
    to = ownerParty
    fromLabel = 'Bill From (Developer)'
    toLabel = 'Bill To (Creator)'
  } else if (meta.fromRole === 'developer') {
    from = PLATFORM_PARTY
    to = ownerParty
    fromLabel = 'Issued By (AirHouse)'
    toLabel = owner?.role === 'creator' ? 'Bill To (Creator)' : 'Bill To (Developer)'
  } else {
    from = PLATFORM_PARTY
    to = ownerParty
    fromLabel = 'Issued By (AirHouse)'
    toLabel = owner?.role === 'creator' ? 'Bill To (Creator)' : 'Bill To (Developer)'
  }

  // Line items + summary
  const grossAmount = Math.abs(Number(tx.amount) || 0)
  const fee = Math.abs(Number(tx.fee) || 0)
  const net = Math.abs(Number(tx.net_amount) || (grossAmount - fee))

  const items = []
  const summary = []

  if (campaign && (tx.transaction_type === 'platform_fee' ||
                   tx.transaction_type === 'escrow_release' ||
                   tx.transaction_type === 'content_payment')) {
    const isCreatorEarning = hidePlatformFee && (
      tx.transaction_type === 'escrow_release' ||
      tx.transaction_type === 'content_payment'
    )
    items.push({
      description: campaign.title || 'Campaign Engagement',
      details: campaign.property_name
        ? `Property: ${campaign.property_name}`
        : null,
      amount: grossAmount,
    })
    summary.push({
      label: isCreatorEarning ? 'Earnings Released' : 'Gross Service Fee',
      value: grossAmount,
    })
    if (!hidePlatformFee && (tx.transaction_type === 'platform_fee' || fee > 0)) {
      const feeAmount = tx.transaction_type === 'platform_fee' ? grossAmount : (grossAmount * FEE_RATES.PLATFORM)
      summary.push({
        label: `Platform Commission (${Math.round(FEE_RATES.PLATFORM * 100)}%)`,
        value: -feeAmount,
        color: 'error',
      })
    }
  } else if (tx.transaction_type === 'payout_request' && payout) {
    items.push({
      description: 'Bank Payout Request',
      details: payout.bank_account
        ? `${payout.bank_account.bank_name} • ****${(payout.bank_account.account_number || '').slice(-4)}`
        : null,
      amount: Math.abs(Number(payout.amount) || grossAmount),
    })
    const payoutFee = Math.abs(Number(payout.payout_fee) || 0)
    summary.push({ label: 'Withdrawal Amount', value: Math.abs(Number(payout.amount) || grossAmount) })
    if (payoutFee > 0) {
      summary.push({
        label: `Payout Fee (${Math.round(FEE_RATES.PAYOUT * 100)}%)`,
        value: -payoutFee,
        color: 'error',
      })
    }
  } else if (tx.transaction_type === 'payout_fee' && payout) {
    items.push({
      description: 'Payout Processing Fee',
      details: `Linked to payout ${(payout.id || '').slice(0, 8).toUpperCase()}`,
      amount: grossAmount,
    })
    summary.push({ label: 'Fee Amount', value: grossAmount })
  } else if (tx.transaction_type === 'deposit') {
    items.push({
      description: 'Wallet Top-Up',
      details: tx.reference_number ? `Reference: ${tx.reference_number}` : null,
      amount: grossAmount,
    })
    summary.push({ label: 'Deposit Amount', value: grossAmount })
  } else if (tx.transaction_type === 'refund') {
    items.push({
      description: 'Refund Issued',
      details: tx.description,
      amount: grossAmount,
    })
    summary.push({ label: 'Refund Amount', value: grossAmount })
  } else {
    // Generic / adjustment / escrow_lock fallback
    items.push({
      description: meta.label,
      details: tx.description,
      amount: grossAmount,
    })
    summary.push({ label: meta.label, value: grossAmount })
    if (fee > 0) {
      summary.push({ label: 'Fee', value: -fee, color: 'error' })
    }
  }

  // Compute total
  const total = summary.reduce((acc, s) => acc + Number(s.value || 0), 0) || net || grossAmount

  // Determine status
  const status = (() => {
    if (payout) {
      const map = {
        pending:   { label: 'Pending',   color: 'warning' },
        processing:{ label: 'Processing',color: 'warning' },
        completed: { label: 'Completed', color: 'success' },
        failed:    { label: 'Failed',    color: 'error' },
        cancelled: { label: 'Cancelled', color: 'error' },
      }
      return map[payout.status] || STATUS_FROM_TX.default
    }
    return STATUS_FROM_TX.default
  })()

  return {
    invoiceNumber: 'INV-' + String(tx.id).slice(0, 8).toUpperCase(),
    issueDate: tx.created_at,
    datePaid: status.color === 'success' ? (payout?.processed_at || tx.created_at) : null,
    statusLabel: status.label,
    statusColor: status.color,
    isReceipt: meta.kind === 'payout' || meta.kind === 'fee' || meta.kind === 'earning',
    type: tx.transaction_type,
    typeLabel: meta.label,
    fromLabel,
    toLabel,
    from,
    to,
    items,
    summary,
    total: Math.abs(total),
    totalLabel: meta.kind === 'payout' ? 'Net Payout (ZAR)' : 'Total (ZAR)',
    referenceNumber: tx.reference_number,
    description: tx.description,
    rawTransaction: tx,
    campaign,
    payout,
  }
}
