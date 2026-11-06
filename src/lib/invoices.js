/**
 * Invoice Generation Service
 * Generates PDF invoices for:
 * - Developer campaign payments
 * - Creator earnings
 * - Payout receipts
 * - Platform fee receipts
 */

import { supabase } from './supabase'
import { PAYMENT_CONFIG } from './payments'
import { CREATOR_HIDDEN_INVOICE_TYPES } from './creatorVisibility'

// ============================================
// INVOICE TEMPLATES
// ============================================

const COMPANY_INFO = {
  name: 'AirHouse (Pty) Ltd',
  registration: '2024/123456/07',
  vatNumber: '4123456789',
  address: '123 Main Street, Sandton, Johannesburg, 2196',
  email: 'billing@airhouse.co.za',
  phone: '+27 11 123 4567',
  website: 'https://airhouse.co.za',
  bankName: 'First National Bank',
  bankAccount: '62123456789',
  bankBranch: '250655',
}

/**
 * Generate a unique invoice number
 */
const generateInvoiceNumber = (type, id) => {
  const prefix = {
    campaign_funding: 'INV-CF',
    creator_payment: 'INV-CP',
    payout: 'INV-PO',
    platform_fee: 'INV-PF',
  }[type] || 'INV'
  
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const shortId = id.slice(0, 8).toUpperCase()
  
  return `${prefix}-${year}${month}-${shortId}`
}

/**
 * Generate invoice data (can be used to render HTML or PDF).
 *
 * @param {string} type - One of 'campaign_funding' | 'creator_payment' | 'payout'
 * @param {string} referenceId
 * @param {object} [options]
 * @param {('creator'|'developer'|'admin')} [options.viewerRole] - When 'creator',
 *   developer-side invoices that expose the 25% platform fee are refused.
 *   The list of refused types lives in src/lib/creatorVisibility.js so every
 *   surface (ledger, CSV, PDF, invoices) shares one policy.
 */
export const generateInvoiceData = async (type, referenceId, options = {}) => {
  const { viewerRole } = options
  if (viewerRole === 'creator' && CREATOR_HIDDEN_INVOICE_TYPES.has(type)) {
    throw new Error(
      `Invoice type "${type}" is not available to creators (it would expose the platform fee).`,
    )
  }

  let invoiceData = {
    invoiceNumber: generateInvoiceNumber(type, referenceId),
    issueDate: new Date().toISOString(),
    dueDate: new Date().toISOString(), // Immediate for platform transactions
    company: COMPANY_INFO,
    type,
    items: [],
    subtotal: 0,
    vat: 0,
    total: 0,
  }

  switch (type) {
    case 'campaign_funding':
      return await generateCampaignFundingInvoice(invoiceData, referenceId)
    case 'creator_payment':
      return await generateCreatorPaymentInvoice(invoiceData, referenceId)
    case 'payout':
      return await generatePayoutReceipt(invoiceData, referenceId)
    default:
      throw new Error(`Unknown invoice type: ${type}`)
  }
}

/**
 * Generate invoice for campaign funding (Developer pays platform)
 */
const generateCampaignFundingInvoice = async (invoiceData, campaignId) => {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select(`
      *,
      developer:profiles!developer_id(*)
    `)
    .eq('id', campaignId)
    .single()

  if (error) throw error

  const platformFee = campaign.platform_fee || (campaign.total_budget * PAYMENT_CONFIG.PLATFORM_FEE_RATE)
  const creatorBudget = campaign.creator_budget || (campaign.total_budget - platformFee)
  const vat = platformFee * 0.15 // 15% VAT on platform fee only

  invoiceData.customer = {
    name: campaign.developer.company_name || campaign.developer.full_name,
    email: campaign.developer.email,
    address: campaign.developer.address || 'Address not provided',
  }

  invoiceData.items = [
    {
      description: `Campaign Funding: ${campaign.title}`,
      details: `Property: ${campaign.property_name}`,
      quantity: 1,
      unitPrice: campaign.total_budget,
      amount: campaign.total_budget,
    },
    {
      description: 'Creator Budget (Held in Escrow)',
      details: 'Funds held until campaign completion',
      quantity: 1,
      unitPrice: -creatorBudget,
      amount: -creatorBudget,
    },
    {
      description: `Platform Fee (${PAYMENT_CONFIG.PLATFORM_FEE_RATE * 100}%)`,
      details: 'AirHouse service fee',
      quantity: 1,
      unitPrice: platformFee,
      amount: platformFee,
    },
  ]

  invoiceData.subtotal = platformFee
  invoiceData.vat = vat
  invoiceData.total = platformFee + vat
  invoiceData.escrowAmount = creatorBudget
  invoiceData.campaign = campaign

  return invoiceData
}

/**
 * Generate payment receipt for creator earnings
 */
const generateCreatorPaymentInvoice = async (invoiceData, transactionId) => {
  const { data: transaction, error } = await supabase
    .from('wallet_transactions')
    .select(`
      *,
      wallet:wallets(
        user:profiles(*)
      )
    `)
    .eq('id', transactionId)
    .single()

  if (error) throw error

  const creator = transaction.wallet.user

  invoiceData.customer = {
    name: creator.full_name,
    email: creator.email,
    address: creator.address || 'Address not provided',
  }

  invoiceData.items = [
    {
      description: transaction.description,
      details: `Reference: ${transaction.reference_number}`,
      quantity: 1,
      unitPrice: transaction.amount,
      amount: transaction.amount,
    },
  ]

  invoiceData.subtotal = transaction.amount
  invoiceData.vat = 0 // Creator payments are not VAT-able (they're payouts)
  invoiceData.total = transaction.amount
  invoiceData.isReceipt = true

  return invoiceData
}

/**
 * Generate payout receipt
 */
const generatePayoutReceipt = async (invoiceData, payoutId) => {
  const { data: payout, error } = await supabase
    .from('payout_requests')
    .select(`
      *,
      user:profiles(*),
      bank_account:bank_accounts(*)
    `)
    .eq('id', payoutId)
    .single()

  if (error) throw error

  invoiceData.customer = {
    name: payout.user.full_name,
    email: payout.user.email,
    address: payout.user.address || 'Address not provided',
  }

  invoiceData.items = [
    {
      description: 'Payout Request',
      details: `To: ${payout.bank_account.bank_name} ****${payout.bank_account.account_number.slice(-4)}`,
      quantity: 1,
      unitPrice: payout.amount,
      amount: payout.amount,
    },
    {
      description: `Payout Fee (${PAYMENT_CONFIG.PAYOUT_FEE_RATE * 100}%)`,
      details: 'Processing fee',
      quantity: 1,
      unitPrice: -payout.payout_fee,
      amount: -payout.payout_fee,
    },
  ]

  invoiceData.subtotal = payout.amount
  invoiceData.fee = payout.payout_fee
  invoiceData.total = payout.net_amount
  invoiceData.isReceipt = true
  invoiceData.payout = payout

  return invoiceData
}

/**
 * Generate HTML invoice (for display and PDF conversion)
 */
export const generateInvoiceHTML = (invoiceData) => {
  const isReceipt = invoiceData.isReceipt

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${isReceipt ? 'Receipt' : 'Invoice'} ${invoiceData.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Helvetica Neue', Arial, sans-serif; 
      font-size: 14px; 
      line-height: 1.5;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .logo { font-size: 28px; font-weight: bold; color: #6B9B8C; }
    .logo-subtitle { font-size: 12px; color: #666; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 32px; color: #333; margin-bottom: 5px; }
    .invoice-number { font-size: 14px; color: #666; }
    
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { width: 45%; }
    .party-title { font-size: 12px; color: #999; text-transform: uppercase; margin-bottom: 8px; }
    .party-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .party-details { font-size: 13px; color: #666; }
    
    .dates { display: flex; gap: 40px; margin-bottom: 30px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
    .date-item { }
    .date-label { font-size: 12px; color: #999; text-transform: uppercase; }
    .date-value { font-size: 14px; font-weight: 500; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { 
      text-align: left; 
      padding: 12px 8px; 
      border-bottom: 2px solid #6B9B8C; 
      font-size: 12px; 
      text-transform: uppercase; 
      color: #666;
    }
    td { padding: 16px 8px; border-bottom: 1px solid #eee; }
    .item-description { font-weight: 500; }
    .item-details { font-size: 12px; color: #666; margin-top: 4px; }
    .text-right { text-align: right; }
    
    .totals { margin-left: auto; width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .total-row.final { 
      border-top: 2px solid #333; 
      margin-top: 8px; 
      padding-top: 12px;
      font-size: 18px;
      font-weight: bold;
    }
    
    .footer { 
      margin-top: 60px; 
      padding-top: 20px; 
      border-top: 1px solid #eee; 
      font-size: 12px; 
      color: #666;
    }
    .bank-details { 
      background: #f8f9fa; 
      padding: 15px; 
      border-radius: 8px; 
      margin-top: 20px;
    }
    .bank-details h4 { margin-bottom: 10px; color: #333; }
    .bank-row { display: flex; gap: 20px; }
    .bank-item { }
    .bank-label { font-size: 11px; color: #999; text-transform: uppercase; }
    .bank-value { font-weight: 500; }
    
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-paid { background: #d4edda; color: #155724; }
    .status-pending { background: #fff3cd; color: #856404; }
    
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">🏠 AirHouse</div>
      <div class="logo-subtitle">Creator-Developer Marketplace</div>
    </div>
    <div class="invoice-title">
      <h1>${isReceipt ? 'RECEIPT' : 'TAX INVOICE'}</h1>
      <div class="invoice-number">${invoiceData.invoiceNumber}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-title">From</div>
      <div class="party-name">${invoiceData.company.name}</div>
      <div class="party-details">
        ${invoiceData.company.address}<br>
        VAT: ${invoiceData.company.vatNumber}<br>
        ${invoiceData.company.email}
      </div>
    </div>
    <div class="party">
      <div class="party-title">${isReceipt ? 'Paid To' : 'Bill To'}</div>
      <div class="party-name">${invoiceData.customer.name}</div>
      <div class="party-details">
        ${invoiceData.customer.email}<br>
        ${invoiceData.customer.address}
      </div>
    </div>
  </div>

  <div class="dates">
    <div class="date-item">
      <div class="date-label">${isReceipt ? 'Payment Date' : 'Issue Date'}</div>
      <div class="date-value">${new Date(invoiceData.issueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    ${!isReceipt ? `
    <div class="date-item">
      <div class="date-label">Due Date</div>
      <div class="date-value">${new Date(invoiceData.dueDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    ` : ''}
    <div class="date-item">
      <div class="date-label">Status</div>
      <div class="date-value">
        <span class="status-badge ${isReceipt ? 'status-paid' : 'status-pending'}">
          ${isReceipt ? 'PAID' : 'DUE'}
        </span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${invoiceData.items.map(item => `
        <tr>
          <td>
            <div class="item-description">${item.description}</div>
            ${item.details ? `<div class="item-details">${item.details}</div>` : ''}
          </td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">R ${Math.abs(item.unitPrice).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
          <td class="text-right">${item.amount < 0 ? '-' : ''}R ${Math.abs(item.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row">
      <span>Subtotal</span>
      <span>R ${invoiceData.subtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
    </div>
    ${invoiceData.vat > 0 ? `
    <div class="total-row">
      <span>VAT (15%)</span>
      <span>R ${invoiceData.vat.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
    </div>
    ` : ''}
    ${invoiceData.fee ? `
    <div class="total-row">
      <span>Processing Fee</span>
      <span>-R ${invoiceData.fee.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
    </div>
    ` : ''}
    <div class="total-row final">
      <span>Total ${isReceipt ? 'Paid' : 'Due'}</span>
      <span>R ${invoiceData.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
    </div>
    ${invoiceData.escrowAmount ? `
    <div class="total-row" style="color: #666; font-size: 13px; margin-top: 12px;">
      <span>Escrow Amount</span>
      <span>R ${invoiceData.escrowAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
    </div>
    ` : ''}
  </div>

  ${!isReceipt ? `
  <div class="bank-details">
    <h4>Payment Details</h4>
    <div class="bank-row">
      <div class="bank-item">
        <div class="bank-label">Bank</div>
        <div class="bank-value">${invoiceData.company.bankName}</div>
      </div>
      <div class="bank-item">
        <div class="bank-label">Account Number</div>
        <div class="bank-value">${invoiceData.company.bankAccount}</div>
      </div>
      <div class="bank-item">
        <div class="bank-label">Branch Code</div>
        <div class="bank-value">${invoiceData.company.bankBranch}</div>
      </div>
      <div class="bank-item">
        <div class="bank-label">Reference</div>
        <div class="bank-value">${invoiceData.invoiceNumber}</div>
      </div>
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p><strong>Thank you for your business!</strong></p>
    <p style="margin-top: 8px;">
      For questions about this ${isReceipt ? 'receipt' : 'invoice'}, please contact ${invoiceData.company.email}
    </p>
    <p style="margin-top: 20px; font-size: 11px; color: #999;">
      ${invoiceData.company.name} | Reg: ${invoiceData.company.registration} | VAT: ${invoiceData.company.vatNumber}
    </p>
  </div>
</body>
</html>
`
}

/**
 * Save invoice to database.
 *
 * NOT USED, AND IT NO LONGER WORKS. Nothing in the application calls this,
 * and migration 026 revokes INSERT on `invoices` from browser roles, so it
 * now fails rather than succeeding quietly.
 *
 * That is deliberate. As written it takes the total, the VAT, the customer
 * and a status of 'paid' from the caller, so wiring it up would let any
 * signed-in user file a settled invoice for any amount against anyone.
 *
 * An invoice describes a payment the ledger has already recorded, so it
 * should be produced server-side from that record. Do not re-enable this by
 * restoring the grant.
 */
export const saveInvoice = async (invoiceData) => {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceData.invoiceNumber,
      type: invoiceData.type,
      customer_id: invoiceData.customer?.id,
      customer_name: invoiceData.customer?.name,
      customer_email: invoiceData.customer?.email,
      subtotal: invoiceData.subtotal,
      vat: invoiceData.vat || 0,
      total: invoiceData.total,
      status: invoiceData.isReceipt ? 'paid' : 'pending',
      issued_at: invoiceData.issueDate,
      due_at: invoiceData.dueDate,
      paid_at: invoiceData.isReceipt ? invoiceData.issueDate : null,
      metadata: {
        items: invoiceData.items,
        campaign: invoiceData.campaign,
        payout: invoiceData.payout,
      },
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get invoices for a user
 */
export const getUserInvoices = async (userId) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', userId)
    .order('issued_at', { ascending: false })

  if (error) throw error
  return data || []
}

export default {
  generateInvoiceData,
  generateInvoiceHTML,
  saveInvoice,
  getUserInvoices,
}
