import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { requestPayout } from '../../lib/payments'
import {
  PageHeader,
  Card,
  Button,
  MetricCard,
  Chip,
  EmptyState,
  Modal,
  Input,
  Select,
  Icon,
} from '../../components/stitch'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { formatCurrency, formatRelativeTime, cn } from '../../lib/utils'
import { isVisibleToCreator } from '../../lib/creatorVisibility'
import { toast } from 'react-hot-toast'

const PAYOUT_FEE_RATE = 0.03 // 3% payout fee

const TX_ICONS = {
  deposit: 'south_west',
  content_payment: 'south_west',
  escrow_release: 'south_west',
  payout_request: 'north_east',
  payout_fee: 'north_east',
}

const TX_TONES = {
  deposit: 'success',
  content_payment: 'success',
  escrow_release: 'success',
  payout_request: 'danger',
  payout_fee: 'warning',
}

const STATUS_TONES = {
  pending: { tone: 'warning', label: 'Pending' },
  processing: { tone: 'primary', label: 'Processing' },
  completed: { tone: 'success', label: 'Completed' },
  failed: { tone: 'danger', label: 'Failed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
}

const CreatorWallet = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [payoutRequests, setPayoutRequests] = useState([])

  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)

  const [payoutAmount, setPayoutAmount] = useState('')
  const [selectedBankAccount, setSelectedBankAccount] = useState('')
  const [processing, setProcessing] = useState(false)

  const [bankForm, setBankForm] = useState({
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    branch_code: '',
    account_type: 'savings',
  })

  useEffect(() => {
    if (user?.id) fetchWalletData()
  }, [user])

  const fetchWalletData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_type', 'creator')
        .single()

      if (walletError && walletError.code !== 'PGRST116') throw walletError
      setWallet(walletData)

      if (walletData) {
        const { data: txData } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('wallet_id', walletData.id)
          .order('created_at', { ascending: false })
          .limit(50)
        // Hide platform-commission rows from creators (defensive — see
        // src/lib/creatorVisibility.js for the shared policy).
        const visible = (txData || []).filter(isVisibleToCreator)
        setTransactions(visible)
      }

      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false })
      setBankAccounts(bankData || [])

      const { data: payoutData } = await supabase
        .from('payout_requests')
        .select('*, bank_account:bank_accounts(bank_name, account_number)')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(10)
      setPayoutRequests(payoutData || [])
    } catch (err) {
      console.error('Error fetching wallet:', err)
      setError('Failed to load wallet data')
    } finally {
      setLoading(false)
    }
  }

  const handlePayoutRequest = async () => {
    const amount = parseFloat(payoutAmount)

    if (!amount || amount < 100) return toast.error('Minimum payout is R100')
    if (amount > (wallet?.balance || 0)) return toast.error('Insufficient balance')
    if (!selectedBankAccount) return toast.error('Please select a bank account')

    setProcessing(true)
    try {
      // This was four separate browser writes -- payout row, wallet balance,
      // then two ledger entries -- with the fee computed client-side. A
      // failure part-way through left the records inconsistent. It now runs
      // as one transaction in request_creator_payout(), which recomputes the
      // fee and holds the funds server-side.
      const result = await requestPayout(user.id, amount, selectedBankAccount)
      const netAmount = result?.net_amount ?? amount

      toast.success(`Payout requested. You'll receive ${formatCurrency(netAmount)}`)
      setShowPayoutModal(false)
      setPayoutAmount('')
      setSelectedBankAccount('')
      fetchWalletData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to request payout')
    } finally {
      setProcessing(false)
    }
  }

  const handleAddBankAccount = async () => {
    if (!bankForm.account_holder_name || !bankForm.bank_name || !bankForm.account_number) {
      return toast.error('Please fill in all required fields')
    }
    setProcessing(true)
    try {
      const isPrimary = bankAccounts.length === 0
      const { error: insErr } = await supabase
        .from('bank_accounts')
        .insert({ user_id: user.id, ...bankForm, is_primary: isPrimary })
      if (insErr) throw insErr

      toast.success('Bank account added')
      setShowBankModal(false)
      setBankForm({
        account_holder_name: '',
        bank_name: '',
        account_number: '',
        branch_code: '',
        account_type: 'savings',
      })
      fetchWalletData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to add bank account')
    } finally {
      setProcessing(false)
    }
  }

  const payoutFeePreview = parseFloat(payoutAmount || 0) * PAYOUT_FEE_RATE
  const netPayoutPreview = parseFloat(payoutAmount || 0) - payoutFeePreview

  const csvEscape = (value) => {
    const s = value == null ? '' : String(value)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const handleExportTransactions = () => {
    // Mirror the fetch-time filter at export time so even if upstream
    // regresses, the CSV stays free of developer-side platform-commission
    // rows. Source of truth: src/lib/creatorVisibility.js
    const exportable = transactions.filter(isVisibleToCreator)
    if (exportable.length === 0) {
      toast.error('No transactions to export')
      return
    }

    const headers = ['Date', 'Type', 'Description', 'Reference', 'Amount (ZAR)', 'Balance (ZAR)']
    const rows = exportable.map((tx) => [
      tx.created_at ? new Date(tx.created_at).toISOString() : '',
      (tx.transaction_type || '').replace(/_/g, ' '),
      tx.description || '',
      tx.reference_number || '',
      Number(tx.amount || 0).toFixed(2),
      tx.balance_after != null ? Number(tx.balance_after).toFixed(2) : '',
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wallet-transactions-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Transactions exported')
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  if (error) return <ErrorState message={error} onRetry={fetchWalletData} />

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-lg">
      <PageHeader
        eyebrow="Creator Wallet"
        title="Earnings & Payouts"
        description="Manage your balance, withdrawals, and bank accounts."
        actions={
          <Button
            variant="primary"
            icon="north_east"
            onClick={() => setShowPayoutModal(true)}
            disabled={!wallet || wallet.balance < 100}
          >
            Request Payout
          </Button>
        }
      />

      {/* Balance hero + KPIs */}
      <div className="grid grid-cols-12 gap-gutter">
        <Card
          className="col-span-12 lg:col-span-6 bg-secondary-container relative overflow-hidden"
          padding="lg"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-bl-full -mr-16 -mt-16 pointer-events-none" />
          <div className="relative">
            <div className="font-label-md text-label-md uppercase tracking-wider text-on-secondary-container mb-xs">
              Available Balance
            </div>
            <div className="font-headline-xl text-headline-xl text-on-secondary-container">
              {formatCurrency(wallet?.balance || 0)}
            </div>
            <p className="font-body-md text-body-md text-on-secondary-container/80 mt-xs">
              Ready to withdraw to your bank.
            </p>
          </div>
        </Card>

        <div className="col-span-12 lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-md">
          <MetricCard
            label="Total Earned"
            value={formatCurrency(wallet?.total_earned || 0)}
            icon="trending_up"
            trendDirection="positive"
          />
          <MetricCard
            label="Total Withdrawn"
            value={formatCurrency(wallet?.total_withdrawn || 0)}
            icon="north_east"
            trendDirection="neutral"
          />
          <MetricCard
            label="Pending Payouts"
            value={formatCurrency(
              payoutRequests
                .filter((p) => p.status === 'pending')
                .reduce((s, p) => s + parseFloat(p.amount), 0),
            )}
            icon="schedule"
            trendDirection="neutral"
          />
        </div>
      </div>

      {/* Bank accounts */}
      <Card>
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <Icon name="account_balance" size={20} className="text-primary" />
            <h3 className="font-headline-md text-headline-md text-on-surface">Bank Accounts</h3>
          </div>
          <Button variant="ghost" size="sm" icon="add" onClick={() => setShowBankModal(true)}>
            Add Account
          </Button>
        </div>

        {bankAccounts.length > 0 ? (
          <div className="flex flex-col gap-sm">
            {bankAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-sm p-md bg-surface-container-low border border-outline-variant rounded"
              >
                <div className="flex items-center gap-sm min-w-0">
                  <div className="w-10 h-10 bg-primary-container/20 text-primary rounded inline-flex items-center justify-center flex-shrink-0">
                    <Icon name="credit_card" size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface truncate">
                      {account.bank_name}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      ****{account.account_number.slice(-4)} • {account.account_holder_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-xs flex-shrink-0">
                  {account.is_primary && <Chip tone="primary">Primary</Chip>}
                  {account.is_verified && <Chip tone="success">Verified</Chip>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="credit_card"
            title="No bank accounts added"
            description="Add a bank account to request payouts."
            action={
              <Button variant="secondary" size="sm" icon="add" onClick={() => setShowBankModal(true)}>
                Add Bank Account
              </Button>
            }
          />
        )}
      </Card>

      {/* Recent payout requests */}
      {payoutRequests.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-md">
            <div className="flex items-center gap-sm">
              <Icon name="schedule" size={20} className="text-primary" />
              <h3 className="font-headline-md text-headline-md text-on-surface">Payout Requests</h3>
            </div>
          </div>
          <div className="flex flex-col gap-sm">
            {payoutRequests.map((payout) => {
              const status = STATUS_TONES[payout.status] || STATUS_TONES.pending
              return (
                <div
                  key={payout.id}
                  className="flex items-center justify-between gap-sm p-md bg-surface-container-low border border-outline-variant rounded"
                >
                  <div className="min-w-0">
                    <p className="font-data-mono text-data-mono text-on-surface">
                      {formatCurrency(payout.net_amount)}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      {payout.bank_account?.bank_name} ****
                      {payout.bank_account?.account_number?.slice(-4)}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {formatRelativeTime(payout.requested_at)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Chip tone={status.tone}>{status.label}</Chip>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                      Fee: {formatCurrency(payout.payout_fee)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Transaction history */}
      <Card>
        <div className="flex items-center justify-between mb-md">
          <h3 className="font-headline-md text-headline-md text-on-surface">Transaction History</h3>
          <Button
            variant="ghost"
            size="sm"
            icon="download"
            onClick={handleExportTransactions}
            disabled={transactions.length === 0}
          >
            Export
          </Button>
        </div>

        {transactions.length > 0 ? (
          <div className="flex flex-col">
            {transactions.map((tx) => {
              const iconName = TX_ICONS[tx.transaction_type] || 'paid'
              const tone = TX_TONES[tx.transaction_type] || 'neutral'
              const isCredit = tx.amount > 0
              return (
                <Link
                  key={tx.id}
                  to={`/creator/wallet/transactions/${tx.id}`}
                  className="flex items-center justify-between gap-sm py-sm border-b border-outline-variant last:border-0 hover:bg-surface-container-low rounded transition-colors"
                >
                  <div className="flex items-center gap-sm min-w-0">
                    <Chip tone={tone} icon={iconName} className="flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface capitalize truncate">
                        {tx.transaction_type.replace(/_/g, ' ')}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {tx.description}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {formatRelativeTime(tx.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className={cn(
                        'font-data-mono text-data-mono',
                        isCredit ? 'text-secondary' : 'text-error',
                      )}
                    >
                      {isCredit ? '+' : ''}
                      {formatCurrency(tx.amount)}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant hidden sm:block">
                      Balance: {formatCurrency(tx.balance_after)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon="paid"
            title="No transactions yet"
            description="Complete campaigns to start earning."
          />
        )}
      </Card>

      {/* Payout modal */}
      <Modal
        isOpen={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
        title="Request Payout"
        description="Funds are sent on Tuesdays and Fridays after admin approval."
      >
        <div className="p-md flex flex-col gap-md">
          <div className="p-md bg-secondary-container rounded text-center">
            <div className="font-label-md text-label-md uppercase tracking-wider text-on-secondary-container">
              Available Balance
            </div>
            <div className="font-headline-lg text-headline-lg text-on-secondary-container">
              {formatCurrency(wallet?.balance || 0)}
            </div>
          </div>

          <Input
            label="Amount to Withdraw (ZAR)"
            type="number"
            value={payoutAmount}
            onChange={(e) => setPayoutAmount(e.target.value)}
            placeholder="1000"
            min="100"
            max={wallet?.balance || 0}
          />

          {parseFloat(payoutAmount) >= 100 && (
            <div className="p-md bg-surface-container-low border border-outline-variant rounded space-y-xs">
              <div className="flex justify-between font-body-md text-body-md">
                <span className="text-on-surface-variant">Withdrawal Amount</span>
                <span className="font-data-mono text-data-mono text-on-surface">
                  {formatCurrency(parseFloat(payoutAmount) || 0)}
                </span>
              </div>
              <div className="flex justify-between font-body-md text-body-md">
                <span className="text-on-error-container">Payout Fee (3%)</span>
                <span className="font-data-mono text-data-mono text-error">
                  - {formatCurrency(payoutFeePreview)}
                </span>
              </div>
              <div className="flex justify-between font-label-lg text-label-lg pt-xs border-t border-outline-variant">
                <span className="text-on-surface">You'll Receive</span>
                <span className="font-data-mono text-data-mono text-secondary">
                  {formatCurrency(netPayoutPreview)}
                </span>
              </div>
            </div>
          )}

          <Select
            label="Bank Account"
            value={selectedBankAccount}
            onChange={(e) => setSelectedBankAccount(e.target.value)}
            options={[
              { value: '', label: 'Select bank account' },
              ...bankAccounts.map((b) => ({
                value: b.id,
                label: `${b.bank_name} - ****${b.account_number.slice(-4)}`,
              })),
            ]}
          />

          {bankAccounts.length === 0 && (
            <div className="p-sm bg-error-container/40 border border-error-container rounded">
              <p className="font-body-sm text-body-sm text-on-error-container">
                Please add a bank account before requesting a payout.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-sm p-md border-t border-outline-variant">
          <Button variant="ghost" onClick={() => setShowPayoutModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handlePayoutRequest}
            disabled={
              !payoutAmount ||
              parseFloat(payoutAmount) < 100 ||
              !selectedBankAccount ||
              processing
            }
          >
            {processing ? 'Requesting…' : 'Request Payout'}
          </Button>
        </div>
      </Modal>

      {/* Add bank account modal */}
      <Modal
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        title="Add Bank Account"
      >
        <div className="p-md flex flex-col gap-md">
          <Input
            label="Account Holder Name"
            value={bankForm.account_holder_name}
            onChange={(e) => setBankForm({ ...bankForm, account_holder_name: e.target.value })}
            placeholder="John Smith"
            required
          />
          <Select
            label="Bank Name"
            value={bankForm.bank_name}
            onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
            options={[
              { value: '', label: 'Select bank' },
              { value: 'ABSA', label: 'ABSA' },
              { value: 'Capitec', label: 'Capitec' },
              { value: 'FNB', label: 'First National Bank (FNB)' },
              { value: 'Nedbank', label: 'Nedbank' },
              { value: 'Standard Bank', label: 'Standard Bank' },
              { value: 'African Bank', label: 'African Bank' },
              { value: 'TymeBank', label: 'TymeBank' },
              { value: 'Discovery Bank', label: 'Discovery Bank' },
              { value: 'Other', label: 'Other' },
            ]}
            required
          />
          <Input
            label="Account Number"
            value={bankForm.account_number}
            onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
            placeholder="1234567890"
            required
          />
          <Input
            label="Branch Code (Optional)"
            value={bankForm.branch_code}
            onChange={(e) => setBankForm({ ...bankForm, branch_code: e.target.value })}
            placeholder="250655"
          />
          <Select
            label="Account Type"
            value={bankForm.account_type}
            onChange={(e) => setBankForm({ ...bankForm, account_type: e.target.value })}
            options={[
              { value: 'savings', label: 'Savings' },
              { value: 'cheque', label: 'Cheque/Current' },
              { value: 'transmission', label: 'Transmission' },
            ]}
          />
          <div className="p-sm bg-tertiary-fixed border border-outline-variant rounded">
            <p className="font-body-sm text-body-sm text-on-tertiary-fixed-variant">
              <strong>Note:</strong> Please ensure your banking details are correct. Incorrect details
              may result in failed payouts.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-sm p-md border-t border-outline-variant">
          <Button variant="ghost" onClick={() => setShowBankModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAddBankAccount} disabled={processing}>
            {processing ? 'Adding…' : 'Add Bank Account'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default CreatorWallet
