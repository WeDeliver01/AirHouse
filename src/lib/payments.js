/**
 * Payment Gateway Service
 * Handles all payment processing with Yoco/BobPay integration
 * 
 * PAYMENT FLOW:
 * 1. Developer funds campaign → Money goes to Platform → 25% fee taken → 75% to Escrow
 * 2. Creator completes work → Admin approves → Escrow releases to Creator Wallet
 * 3. Creator requests payout → 3% fee taken → Net amount sent to bank
 */

import { supabase } from './supabase'

// ============================================
// CONFIGURATION
// ============================================

export const PAYMENT_CONFIG = {
  PLATFORM_FEE_RATE: 0.25,      // 25% platform commission
  PAYOUT_FEE_RATE: 0.03,        // 3% payout fee
  MIN_PAYOUT_AMOUNT: 100,       // Minimum R100 to withdraw
  CURRENCY: 'ZAR',
  
  // Payment gateway (switch between 'yoco' | 'bobpay' | 'test')
  GATEWAY: 'test',
  
  // Gateway API URLs (to be configured)
  YOCO_API_URL: 'https://online.yoco.com/v1',
  BOBPAY_API_URL: 'https://api.bobpay.co.za/v1',
}

// ============================================
// PAYMENT GATEWAY INTERFACE
// ============================================

/**
 * Initialize a payment checkout session
 * Returns a checkout URL or payment form data
 */
export const createCheckoutSession = async ({
  amount,
  currency = 'ZAR',
  description,
  metadata = {},
  successUrl,
  cancelUrl,
  userId,
}) => {
  const gateway = PAYMENT_CONFIG.GATEWAY

  if (gateway === 'test') {
    // TEST MODE - Simulate successful payment
    return {
      success: true,
      checkoutUrl: null, // No redirect needed in test mode
      sessionId: `test_session_${Date.now()}`,
      testMode: true,
      message: 'Test mode - payment will be simulated',
    }
  }

  if (gateway === 'yoco') {
    // YOCO INTEGRATION
    // Documentation: https://developer.yoco.com/online/checkout
    return await createYocoCheckout({
      amount,
      currency,
      description,
      metadata,
      successUrl,
      cancelUrl,
    })
  }

  if (gateway === 'bobpay') {
    // BOBPAY INTEGRATION
    // Documentation: https://bobpay.co.za/docs
    return await createBobPayCheckout({
      amount,
      currency,
      description,
      metadata,
      successUrl,
      cancelUrl,
    })
  }

  throw new Error(`Unknown payment gateway: ${gateway}`)
}

/**
 * Yoco Checkout Integration (Placeholder)
 */
const createYocoCheckout = async ({ amount, currency, description, metadata, successUrl, cancelUrl }) => {
  // TODO: Implement Yoco API integration
  // const response = await fetch(`${PAYMENT_CONFIG.YOCO_API_URL}/checkouts`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${process.env.YOCO_SECRET_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     amount: Math.round(amount * 100), // Yoco uses cents
  //     currency,
  //     successUrl,
  //     cancelUrl,
  //     metadata,
  //   }),
  // })
  
  console.log('YOCO CHECKOUT - Not yet implemented', { amount, description })
  
  return {
    success: false,
    error: 'Yoco integration not yet configured',
    checkoutUrl: null,
  }
}

/**
 * BobPay Checkout Integration (Placeholder)
 */
const createBobPayCheckout = async ({ amount, currency, description, metadata, successUrl, cancelUrl }) => {
  // TODO: Implement BobPay API integration
  // Documentation: https://bobpay.co.za/docs
  
  console.log('BOBPAY CHECKOUT - Not yet implemented', { amount, description })
  
  return {
    success: false,
    error: 'BobPay integration not yet configured',
    checkoutUrl: null,
  }
}

/**
 * Process a payout to a bank account
 */
export const processPayout = async ({
  amount,
  bankAccount,
  reference,
  userId,
}) => {
  const gateway = PAYMENT_CONFIG.GATEWAY

  if (gateway === 'test') {
    // TEST MODE - Simulate successful payout
    return {
      success: true,
      payoutId: `test_payout_${Date.now()}`,
      testMode: true,
      message: 'Test mode - payout simulated',
    }
  }

  // TODO: Implement actual payout via Yoco/BobPay
  // Most SA payment gateways require manual payouts or bank integration
  
  return {
    success: false,
    error: 'Payout integration not yet configured',
  }
}

// ============================================
// WALLET OPERATIONS
// ============================================

/**
 * Get or create wallet for a user
 */
export const getOrCreateWallet = async (userId, walletType = 'creator') => {
  // First try to get existing wallet
  const { data: existing } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_type', walletType)
    .single()

  if (existing) return existing

  // Create new wallet
  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      wallet_type: walletType,
      balance: 0,
      pending_balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      currency: PAYMENT_CONFIG.CURRENCY,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get wallet balance for a user
 */
export const getWalletBalance = async (userId) => {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

/**
 * Get wallet transactions
 */
export const getWalletTransactions = async (userId, limit = 50) => {
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .single()

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
 * Fund a campaign (Developer pays)
 * Flow: Developer → Platform Fee (25%) → Escrow (75%)
 */
export const fundCampaign = async (campaignId, developerId, amount) => {
  const platformFee = amount * PAYMENT_CONFIG.PLATFORM_FEE_RATE
  const escrowAmount = amount - platformFee

  // Get developer wallet
  const developerWallet = await getOrCreateWallet(developerId, 'developer')

  // Get or create platform wallet (admin user or system)
  const { data: platformWallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('wallet_type', 'platform')
    .single()

  // Create escrow wallet for this campaign
  const { data: escrowWallet, error: escrowError } = await supabase
    .from('wallets')
    .insert({
      user_id: developerId, // Owned by developer but locked
      wallet_type: 'escrow',
      balance: 0,
      currency: PAYMENT_CONFIG.CURRENCY,
      metadata: { campaign_id: campaignId },
    })
    .select()
    .single()

  if (escrowError) throw escrowError

  const referenceNumber = `FUND-${campaignId.slice(0, 8)}-${Date.now()}`

  // Record transactions
  const transactions = [
    // Developer deposit
    {
      wallet_id: developerWallet.id,
      transaction_type: 'deposit',
      amount: amount,
      balance_before: developerWallet.balance,
      balance_after: developerWallet.balance + amount,
      description: `Campaign funding deposit`,
      reference_number: `${referenceNumber}-DEP`,
      metadata: { campaign_id: campaignId },
    },
    // Platform fee
    {
      wallet_id: developerWallet.id,
      transaction_type: 'platform_fee',
      amount: -platformFee,
      balance_before: developerWallet.balance + amount,
      balance_after: developerWallet.balance + amount - platformFee,
      description: `Platform fee (25%)`,
      reference_number: `${referenceNumber}-FEE`,
      metadata: { campaign_id: campaignId, fee_rate: PAYMENT_CONFIG.PLATFORM_FEE_RATE },
    },
    // Escrow lock
    {
      wallet_id: developerWallet.id,
      transaction_type: 'escrow_lock',
      amount: -escrowAmount,
      balance_before: developerWallet.balance + amount - platformFee,
      balance_after: developerWallet.balance,
      description: `Funds locked in escrow for campaign`,
      reference_number: `${referenceNumber}-ESC`,
      metadata: { campaign_id: campaignId, escrow_wallet_id: escrowWallet.id },
    },
    // Escrow receive
    {
      wallet_id: escrowWallet.id,
      transaction_type: 'escrow_lock',
      amount: escrowAmount,
      balance_before: 0,
      balance_after: escrowAmount,
      description: `Campaign escrow funded`,
      reference_number: `${referenceNumber}-ESC-IN`,
      metadata: { campaign_id: campaignId },
    },
  ]

  // Insert all transactions
  const { error: txError } = await supabase
    .from('wallet_transactions')
    .insert(transactions)

  if (txError) throw txError

  // Update escrow wallet balance
  await supabase
    .from('wallets')
    .update({ balance: escrowAmount })
    .eq('id', escrowWallet.id)

  // Update campaign with escrow info
  await supabase
    .from('campaigns')
    .update({
      escrow_amount: escrowAmount,
      escrow_wallet_id: escrowWallet.id,
      funded_at: new Date().toISOString(),
      status: 'open',
    })
    .eq('id', campaignId)

  return {
    success: true,
    platformFee,
    escrowAmount,
    escrowWalletId: escrowWallet.id,
    referenceNumber,
  }
}

// ============================================
// ESCROW RELEASE TRIGGERS
// ============================================

/**
 * Release escrow to creator (triggered by content approval)
 * 
 * Triggers:
 * 1. Content approved by developer
 * 2. Milestone completed
 * 3. Campaign completed
 * 4. Admin manual release
 */
export const releaseEscrowToCreator = async ({
  campaignId,
  creatorId,
  amount,
  reason,
  releasedBy,
  metadata = {},
}) => {
  // Get campaign with escrow info
  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('*, escrow_wallet:wallets!escrow_wallet_id(*)')
    .eq('id', campaignId)
    .single()

  if (campError) throw campError
  if (!campaign.escrow_wallet_id) throw new Error('Campaign has no escrow wallet')

  const escrowWallet = campaign.escrow_wallet
  if (escrowWallet.balance < amount) {
    throw new Error(`Insufficient escrow balance. Available: R${escrowWallet.balance}, Requested: R${amount}`)
  }

  // Get creator wallet
  const creatorWallet = await getOrCreateWallet(creatorId, 'creator')

  const referenceNumber = `REL-${campaignId.slice(0, 8)}-${Date.now()}`

  // Create transactions
  const transactions = [
    // Escrow release (debit)
    {
      wallet_id: escrowWallet.id,
      transaction_type: 'escrow_release',
      amount: -amount,
      balance_before: escrowWallet.balance,
      balance_after: escrowWallet.balance - amount,
      description: `Escrow release: ${reason}`,
      reference_number: `${referenceNumber}-OUT`,
      metadata: { campaign_id: campaignId, creator_id: creatorId, reason, ...metadata },
      created_by: releasedBy,
    },
    // Creator receive (credit)
    {
      wallet_id: creatorWallet.id,
      transaction_type: 'escrow_release',
      amount: amount,
      balance_before: creatorWallet.balance,
      balance_after: creatorWallet.balance + amount,
      description: `Payment received: ${reason}`,
      reference_number: `${referenceNumber}-IN`,
      metadata: { campaign_id: campaignId, reason, ...metadata },
      created_by: releasedBy,
    },
  ]

  const { error: txError } = await supabase
    .from('wallet_transactions')
    .insert(transactions)

  if (txError) throw txError

  // Update wallet balances
  await supabase
    .from('wallets')
    .update({ balance: escrowWallet.balance - amount })
    .eq('id', escrowWallet.id)

  await supabase
    .from('wallets')
    .update({ 
      balance: creatorWallet.balance + amount,
      total_earned: (creatorWallet.total_earned || 0) + amount,
    })
    .eq('id', creatorWallet.id)

  // Update campaign escrow amount
  await supabase
    .from('campaigns')
    .update({ 
      escrow_amount: escrowWallet.balance - amount,
      amount_paid_out: (campaign.amount_paid_out || 0) + amount,
    })
    .eq('id', campaignId)

  return {
    success: true,
    amount,
    referenceNumber,
    newEscrowBalance: escrowWallet.balance - amount,
    newCreatorBalance: creatorWallet.balance + amount,
  }
}

/**
 * Refund unspent campaign escrow back to the developer's wallet.
 *
 * Used by super admins when resolving a dispute in the developer's favour
 * (or for partial refunds): money is debited from the campaign escrow wallet
 * and credited to the developer's own wallet, with a wallet_transactions
 * record on each side and the campaign's escrow_amount adjusted.
 */
export const refundEscrowToDeveloper = async ({
  campaignId,
  developerId,
  amount,
  reason,
  releasedBy,
  metadata = {},
}) => {
  if (!amount || amount <= 0) throw new Error('Refund amount must be greater than zero')

  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('*, escrow_wallet:wallets!escrow_wallet_id(*)')
    .eq('id', campaignId)
    .single()

  if (campError) throw campError
  if (!campaign.escrow_wallet_id) throw new Error('Campaign has no escrow wallet')

  const escrowWallet = campaign.escrow_wallet
  if (escrowWallet.balance < amount) {
    throw new Error(
      `Insufficient escrow balance. Available: R${escrowWallet.balance}, Requested: R${amount}`,
    )
  }

  const developerWallet = await getOrCreateWallet(developerId, 'developer')
  const referenceNumber = `REF-${campaignId.slice(0, 8)}-${Date.now()}`

  const { error: txError } = await supabase.from('wallet_transactions').insert([
    {
      wallet_id: escrowWallet.id,
      transaction_type: 'refund',
      amount: -amount,
      balance_before: escrowWallet.balance,
      balance_after: escrowWallet.balance - amount,
      description: `Escrow refund: ${reason}`,
      reference_number: `${referenceNumber}-OUT`,
      metadata: { campaign_id: campaignId, developer_id: developerId, reason, ...metadata },
      created_by: releasedBy,
    },
    {
      wallet_id: developerWallet.id,
      transaction_type: 'refund',
      amount: amount,
      balance_before: developerWallet.balance,
      balance_after: developerWallet.balance + amount,
      description: `Refund received: ${reason}`,
      reference_number: `${referenceNumber}-IN`,
      metadata: { campaign_id: campaignId, reason, ...metadata },
      created_by: releasedBy,
    },
  ])
  if (txError) throw txError

  await supabase
    .from('wallets')
    .update({ balance: escrowWallet.balance - amount })
    .eq('id', escrowWallet.id)

  await supabase
    .from('wallets')
    .update({ balance: developerWallet.balance + amount })
    .eq('id', developerWallet.id)

  await supabase
    .from('campaigns')
    .update({ escrow_amount: escrowWallet.balance - amount })
    .eq('id', campaignId)

  return {
    success: true,
    amount,
    referenceNumber,
    newEscrowBalance: escrowWallet.balance - amount,
    newDeveloperBalance: developerWallet.balance + amount,
  }
}

/**
 * Release payment for approved content
 */
export const releaseContentPayment = async (contentSubmissionId, approvedBy) => {
  const { data: submission, error } = await supabase
    .from('content_submissions')
    .select(`
      *,
      assignment:campaign_assignments(
        id,
        creator_id,
        campaign:campaigns(id, title, creator_budget)
      )
    `)
    .eq('id', contentSubmissionId)
    .single()

  if (error) throw error
  if (!submission) throw new Error('Content submission not found')

  // Calculate payment based on content type or fixed rate
  const paymentAmount = submission.payment_amount || 500 // Default R500 per content piece

  return await releaseEscrowToCreator({
    campaignId: submission.assignment.campaign.id,
    creatorId: submission.assignment.creator_id,
    amount: paymentAmount,
    reason: `Content approved: ${submission.content_type}`,
    releasedBy: approvedBy,
    metadata: { content_submission_id: contentSubmissionId },
  })
}

// ============================================
// PAYOUT SYSTEM
// ============================================

/**
 * Request a payout (Creator withdraws to bank)
 */
export const requestPayout = async (userId, amount, bankAccountId) => {
  if (amount < PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT) {
    throw new Error(`Minimum payout amount is R${PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT}`)
  }

  // Get wallet
  const wallet = await getWalletBalance(userId)
  if (!wallet) throw new Error('Wallet not found')
  if (wallet.balance < amount) {
    throw new Error(`Insufficient balance. Available: R${wallet.balance}`)
  }

  // Get bank account
  const { data: bankAccount, error: bankError } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('id', bankAccountId)
    .eq('user_id', userId)
    .single()

  if (bankError || !bankAccount) throw new Error('Bank account not found')

  // Calculate fees
  const payoutFee = amount * PAYMENT_CONFIG.PAYOUT_FEE_RATE
  const netAmount = amount - payoutFee

  // Create payout request
  const { data: payout, error: payoutError } = await supabase
    .from('payout_requests')
    .insert({
      user_id: userId,
      wallet_id: wallet.id,
      bank_account_id: bankAccountId,
      amount: amount,
      payout_fee: payoutFee,
      net_amount: netAmount,
      status: 'pending',
    })
    .select()
    .single()

  if (payoutError) throw payoutError

  // Deduct from wallet (move to pending)
  const referenceNumber = `PAY-${payout.id.slice(0, 8)}`

  await supabase
    .from('wallet_transactions')
    .insert({
      wallet_id: wallet.id,
      transaction_type: 'payout_request',
      amount: -amount,
      balance_before: wallet.balance,
      balance_after: wallet.balance - amount,
      description: `Payout request to ${bankAccount.bank_name} ****${bankAccount.account_number.slice(-4)}`,
      reference_number: referenceNumber,
      metadata: { payout_id: payout.id, bank_account_id: bankAccountId },
    })

  await supabase
    .from('wallets')
    .update({ 
      balance: wallet.balance - amount,
      pending_balance: (wallet.pending_balance || 0) + amount,
    })
    .eq('id', wallet.id)

  return {
    success: true,
    payoutId: payout.id,
    amount,
    payoutFee,
    netAmount,
    referenceNumber,
    status: 'pending',
  }
}

/**
 * Process a payout (Admin action)
 */
export const processPayoutRequest = async (payoutId, adminId, action, notes = '') => {
  const { data: payout, error } = await supabase
    .from('payout_requests')
    .select('*, wallet:wallets(*), bank_account:bank_accounts(*)')
    .eq('id', payoutId)
    .single()

  if (error) throw error
  if (payout.status !== 'pending') throw new Error('Payout is not pending')

  if (action === 'approve') {
    // Process the actual payout via payment gateway
    const payoutResult = await processPayout({
      amount: payout.net_amount,
      bankAccount: payout.bank_account,
      reference: `PAY-${payoutId.slice(0, 8)}`,
      userId: payout.user_id,
    })

    // Update payout status
    await supabase
      .from('payout_requests')
      .update({
        status: payoutResult.success ? 'completed' : 'processing',
        processed_by: adminId,
        processed_at: new Date().toISOString(),
        completed_at: payoutResult.success ? new Date().toISOString() : null,
        payment_reference: payoutResult.payoutId,
        notes,
      })
      .eq('id', payoutId)

    // Update wallet
    await supabase
      .from('wallets')
      .update({
        pending_balance: payout.wallet.pending_balance - payout.amount,
        total_withdrawn: (payout.wallet.total_withdrawn || 0) + payout.net_amount,
      })
      .eq('id', payout.wallet_id)

    // Record payout fee transaction
    await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id: payout.wallet_id,
        transaction_type: 'payout_fee',
        amount: -payout.payout_fee,
        balance_before: payout.wallet.balance,
        balance_after: payout.wallet.balance,
        description: `Payout fee (${PAYMENT_CONFIG.PAYOUT_FEE_RATE * 100}%)`,
        reference_number: `PAY-${payoutId.slice(0, 8)}-FEE`,
        metadata: { payout_id: payoutId },
        created_by: adminId,
      })

    return { success: true, status: 'completed' }
  }

  if (action === 'reject') {
    // Refund to wallet
    await supabase
      .from('wallets')
      .update({
        balance: payout.wallet.balance + payout.amount,
        pending_balance: payout.wallet.pending_balance - payout.amount,
      })
      .eq('id', payout.wallet_id)

    // Record refund transaction
    await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id: payout.wallet_id,
        transaction_type: 'refund',
        amount: payout.amount,
        balance_before: payout.wallet.balance,
        balance_after: payout.wallet.balance + payout.amount,
        description: `Payout request rejected: ${notes}`,
        reference_number: `PAY-${payoutId.slice(0, 8)}-REF`,
        metadata: { payout_id: payoutId, reason: notes },
        created_by: adminId,
      })

    await supabase
      .from('payout_requests')
      .update({
        status: 'cancelled',
        processed_by: adminId,
        processed_at: new Date().toISOString(),
        failure_reason: notes,
        notes,
      })
      .eq('id', payoutId)

    return { success: true, status: 'cancelled' }
  }

  throw new Error('Invalid action')
}

/**
 * Get payout history for a user
 */
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

/**
 * Add a bank account for payouts
 */
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

/**
 * Get user's bank accounts
 */
export const getBankAccounts = async (userId) => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Delete a bank account
 */
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
  createCheckoutSession,
  getOrCreateWallet,
  getWalletBalance,
  getWalletTransactions,
  fundCampaign,
  releaseEscrowToCreator,
  releaseContentPayment,
  requestPayout,
  processPayoutRequest,
  getPayoutHistory,
  addBankAccount,
  getBankAccounts,
  deleteBankAccount,
}
