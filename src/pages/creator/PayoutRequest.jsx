import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader,
  Card,
  Button,
  Chip,
  EmptyState,
  Modal,
  Input,
  Select,
  Icon,
} from '../../components/stitch'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { toast } from 'react-hot-toast'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { notify } from '../../lib/notifications'

const PAYMENT_CONFIG = {
  PAYOUT_FEE_RATE: 0.03,
  MIN_PAYOUT_AMOUNT: 100,
}

const SOUTH_AFRICAN_BANKS = [
  { value: 'fnb', label: 'First National Bank (FNB)' },
  { value: 'standard', label: 'Standard Bank' },
  { value: 'absa', label: 'ABSA' },
  { value: 'nedbank', label: 'Nedbank' },
  { value: 'capitec', label: 'Capitec Bank' },
  { value: 'investec', label: 'Investec' },
  { value: 'discovery', label: 'Discovery Bank' },
  { value: 'tymebank', label: 'TymeBank' },
  { value: 'african', label: 'African Bank' },
  { value: 'other', label: 'Other' },
]

const ACCOUNT_TYPES = [
  { value: 'savings', label: 'Savings Account' },
  { value: 'cheque', label: 'Cheque Account' },
  { value: 'transmission', label: 'Transmission Account' },
]

const STATUS_TONES = {
  pending: { tone: 'warning', label: 'Pending', icon: 'schedule' },
  processing: { tone: 'primary', label: 'Processing', icon: 'sync' },
  completed: { tone: 'success', label: 'Completed', icon: 'check_circle' },
  failed: { tone: 'danger', label: 'Failed', icon: 'cancel' },
  cancelled: { tone: 'neutral', label: 'Cancelled', icon: 'block' },
}

const PayoutRequest = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [wallet, setWallet] = useState(null)
  const [bankAccounts, setBankAccounts] = useState([])
  const [payoutHistory, setPayoutHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)

  const [amount, setAmount] = useState('')
  const [selectedBankId, setSelectedBankId] = useState('')

  const [showAddBankModal, setShowAddBankModal] = useState(false)
  const [bankForm, setBankForm] = useState({
    bankName: '',
    accountHolderName: profile?.full_name || '',
    accountNumber: '',
    accountType: 'savings',
    branchCode: '',
  })

  useEffect(() => {
    loadData()
  }, [user.id])

  const loadData = async () => {
    setError(null)
    try {
      const { data: walletData } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single()

      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })

      const { data: history } = await supabase
        .from('payout_requests')
        .select('*, bank_account:bank_accounts(bank_name, account_number)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setWallet(walletData)
      setBankAccounts(accounts || [])
      setPayoutHistory(history || [])

      if (accounts?.length > 0) {
        setSelectedBankId(accounts.find((a) => a.is_default)?.id || accounts[0].id)
      }
    } catch (err) {
      console.error(err)
      setError('Failed to load payout data')
    } finally {
      setLoading(false)
    }
  }

  const handleAddBank = async () => {
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.branchCode) {
      return toast.error('Please fill in all required fields')
    }
    setProcessing(true)
    try {
      const { data, error: insErr } = await supabase
        .from('bank_accounts')
        .insert({
          user_id: user.id,
          bank_name:
            SOUTH_AFRICAN_BANKS.find((b) => b.value === bankForm.bankName)?.label ||
            bankForm.bankName,
          account_holder_name: bankForm.accountHolderName,
          account_number: bankForm.accountNumber,
          account_type: bankForm.accountType,
          branch_code: bankForm.branchCode,
          is_default: bankAccounts.length === 0,
        })
        .select()
        .single()
      if (insErr) throw insErr

      setBankAccounts([...bankAccounts, data])
      setSelectedBankId(data.id)
      setShowAddBankModal(false)
      setBankForm({
        bankName: '',
        accountHolderName: profile?.full_name || '',
        accountNumber: '',
        accountType: 'savings',
        branchCode: '',
      })
      toast.success('Bank account added')
    } catch (err) {
      console.error(err)
      toast.error('Failed to add bank account')
    } finally {
      setProcessing(false)
    }
  }

  const handleRequestPayout = async () => {
    const amountNum = parseFloat(amount)

    if (!amountNum || amountNum < PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT) {
      return toast.error(`Minimum payout is ${formatCurrency(PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT)}`)
    }
    if (amountNum > (wallet?.balance || 0)) return toast.error('Insufficient balance')
    if (!selectedBankId) return toast.error('Please select a bank account')

    setProcessing(true)
    try {
      const payoutFee = amountNum * PAYMENT_CONFIG.PAYOUT_FEE_RATE
      const netAmount = amountNum - payoutFee

      const { data: payout, error: insErr } = await supabase
        .from('payout_requests')
        .insert({
          user_id: user.id,
          wallet_id: wallet.id,
          bank_account_id: selectedBankId,
          amount: amountNum,
          payout_fee: payoutFee,
          net_amount: netAmount,
          status: 'pending',
        })
        .select()
        .single()
      if (insErr) throw insErr

      await supabase
        .from('wallets')
        .update({
          balance: wallet.balance - amountNum,
          pending_balance: (wallet.pending_balance || 0) + amountNum,
        })
        .eq('id', wallet.id)

      toast.success('Payout request submitted')
      notify.payoutRequested(user?.email || profile?.email, {
        creatorName: profile?.full_name,
        amount: amountNum,
      })
      setAmount('')
      loadData()
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to request payout')
    } finally {
      setProcessing(false)
    }
  }

  const fee = (parseFloat(amount) || 0) * PAYMENT_CONFIG.PAYOUT_FEE_RATE
  const net = (parseFloat(amount) || 0) - fee

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  if (error) return <ErrorState message={error} onRetry={loadData} />

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-lg">
      <PageHeader
        eyebrow="Withdraw Funds"
        title="Request Payout"
        description="Withdraw your earnings to a verified South African bank account."
        actions={
          <Button variant="ghost" icon="arrow_back" onClick={() => navigate('/creator/wallet')}>
            Back to Wallet
          </Button>
        }
      />

      <div className="grid grid-cols-12 gap-gutter">
        {/* Main */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-md">
          {/* Balance card */}
          <Card padding="lg" className="bg-secondary-container relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-bl-full -mr-16 -mt-16 pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="font-label-md text-label-md uppercase tracking-wider text-on-secondary-container mb-xs">
                  Available Balance
                </div>
                <div className="font-headline-xl text-headline-xl text-on-secondary-container">
                  {formatCurrency(wallet?.balance || 0)}
                </div>
                {(wallet?.pending_balance || 0) > 0 && (
                  <p className="font-body-sm text-body-sm text-on-secondary-container/80 mt-xs">
                    + {formatCurrency(wallet.pending_balance)} pending
                  </p>
                )}
              </div>
              <div className="w-16 h-16 rounded bg-on-secondary-container/15 inline-flex items-center justify-center text-on-secondary-container">
                <Icon name="account_balance_wallet" size={32} />
              </div>
            </div>
          </Card>

          {/* Payout form */}
          <Card>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">
              Request Payout
            </h3>

            {/* Bank account selection */}
            <div className="mb-md">
              <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Bank Account
              </label>
              {bankAccounts.length > 0 ? (
                <div className="flex flex-col gap-sm">
                  {bankAccounts.map((account) => {
                    const selected = selectedBankId === account.id
                    return (
                      <button
                        type="button"
                        key={account.id}
                        onClick={() => setSelectedBankId(account.id)}
                        className={cn(
                          'flex items-center gap-sm p-md border rounded text-left transition-colors',
                          selected
                            ? 'border-primary bg-primary-container/10'
                            : 'border-outline-variant hover:border-outline',
                        )}
                      >
                        <div
                          className={cn(
                            'w-10 h-10 rounded inline-flex items-center justify-center flex-shrink-0',
                            selected
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-on-surface-variant',
                          )}
                        >
                          <Icon name="account_balance" size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-label-lg text-label-lg text-on-surface truncate">
                            {account.bank_name}
                          </p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                            ****{account.account_number?.slice(-4)} • {account.account_type}
                          </p>
                        </div>
                        {selected && (
                          <Icon
                            name="check_circle"
                            size={20}
                            className="text-primary"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="p-md bg-surface-container-low border border-outline-variant rounded text-center">
                  <Icon name="account_balance" size={24} className="text-on-surface-variant" />
                  <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                    No bank accounts added
                  </p>
                </div>
              )}
              <Button
                variant="ghost"
                className="mt-sm"
                icon="add"
                onClick={() => setShowAddBankModal(true)}
              >
                Add Bank Account
              </Button>
            </div>

            {/* Amount input */}
            <div className="mb-md">
              <label className="block font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-xs">
                Amount to Withdraw
              </label>
              <div className="relative">
                <span className="absolute left-sm top-1/2 -translate-y-1/2 font-data-mono text-on-surface-variant">
                  R
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min={PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT}
                  max={wallet?.balance || 0}
                  className="w-full bg-surface-container-lowest text-on-surface pl-7 pr-sm py-sm rounded border border-outline-variant focus:border-primary focus:outline-none font-body-md text-body-md transition-colors"
                />
              </div>
              <div className="flex justify-between mt-xs font-body-sm text-body-sm">
                <span className="text-on-surface-variant">
                  Min: {formatCurrency(PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT)}
                </span>
                <button
                  type="button"
                  className="text-primary hover:opacity-80 font-label-md text-label-md"
                  onClick={() => setAmount(wallet?.balance?.toString() || '0')}
                >
                  Withdraw All
                </button>
              </div>
            </div>

            {/* Fee breakdown */}
            {parseFloat(amount) > 0 && (
              <div className="bg-surface-container-low border border-outline-variant rounded p-md mb-md space-y-xs">
                <div className="flex justify-between font-body-md text-body-md">
                  <span className="text-on-surface-variant">Withdrawal Amount</span>
                  <span className="font-data-mono text-data-mono text-on-surface">
                    {formatCurrency(parseFloat(amount))}
                  </span>
                </div>
                <div className="flex justify-between font-body-md text-body-md">
                  <span className="text-on-error-container">
                    Processing Fee ({PAYMENT_CONFIG.PAYOUT_FEE_RATE * 100}%)
                  </span>
                  <span className="font-data-mono text-data-mono text-error">
                    -{formatCurrency(fee)}
                  </span>
                </div>
                <div className="flex justify-between font-label-lg text-label-lg pt-sm border-t border-outline-variant">
                  <span className="text-on-surface">You'll Receive</span>
                  <span className="font-data-mono text-data-mono text-secondary">
                    {formatCurrency(net)}
                  </span>
                </div>
              </div>
            )}

            <Button
              variant="primary"
              className="w-full"
              iconRight="arrow_forward"
              onClick={handleRequestPayout}
              disabled={
                !selectedBankId ||
                !amount ||
                parseFloat(amount) < PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT ||
                processing
              }
            >
              {processing ? 'Submitting…' : 'Request Payout'}
            </Button>
          </Card>

          {/* Payout history */}
          <Card>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">
              Payout History
            </h3>
            {payoutHistory.length > 0 ? (
              <div className="flex flex-col gap-sm">
                {payoutHistory.map((payout) => {
                  const status = STATUS_TONES[payout.status] || STATUS_TONES.pending
                  return (
                    <div
                      key={payout.id}
                      className="flex items-center justify-between gap-sm p-md bg-surface-container-low border border-outline-variant rounded"
                    >
                      <div className="flex items-center gap-sm min-w-0">
                        <div
                          className={cn(
                            'w-10 h-10 rounded inline-flex items-center justify-center flex-shrink-0',
                            payout.status === 'completed'
                              ? 'bg-secondary-container text-on-secondary-container'
                              : payout.status === 'failed'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container text-on-surface-variant',
                          )}
                        >
                          <Icon name={status.icon} size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-data-mono text-data-mono text-on-surface">
                            {formatCurrency(payout.amount)}
                          </p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                            {payout.bank_account?.bank_name} ****
                            {payout.bank_account?.account_number?.slice(-4)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Chip tone={status.tone}>{status.label}</Chip>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                          {formatDate(payout.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon="schedule"
                title="No payout history yet"
                description="Your payout requests will appear here."
              />
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-md">
          <Card className="bg-tertiary-fixed">
            <div className="flex items-start gap-sm">
              <Icon
                name="info"
                size={20}
                className="text-on-tertiary-fixed-variant flex-shrink-0 mt-xs"
              />
              <div>
                <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-on-tertiary-fixed-variant">
                  Payout Info
                </h4>
                <ul className="mt-sm flex flex-col gap-xs font-body-sm text-body-sm text-on-tertiary-fixed-variant">
                  <li>• Minimum withdrawal: {formatCurrency(PAYMENT_CONFIG.MIN_PAYOUT_AMOUNT)}</li>
                  <li>• Processing fee: {PAYMENT_CONFIG.PAYOUT_FEE_RATE * 100}%</li>
                  <li>• Processing time: 2-3 business days</li>
                  <li>• Payouts run every Tuesday & Friday</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card>
            <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-on-surface mb-md border-b border-outline-variant pb-sm">
              Earnings Summary
            </h4>
            <div className="flex flex-col gap-sm font-body-md text-body-md">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Total Earned</span>
                <span className="font-data-mono text-data-mono text-on-surface">
                  {formatCurrency(wallet?.total_earned || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Total Withdrawn</span>
                <span className="font-data-mono text-data-mono text-on-surface">
                  {formatCurrency(wallet?.total_withdrawn || 0)}
                </span>
              </div>
              <div className="flex justify-between pt-sm border-t border-outline-variant">
                <span className="text-on-surface">Available</span>
                <span className="font-data-mono text-data-mono text-secondary">
                  {formatCurrency(wallet?.balance || 0)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Add bank modal */}
      <Modal
        isOpen={showAddBankModal}
        onClose={() => setShowAddBankModal(false)}
        title="Add Bank Account"
      >
        <div className="p-md flex flex-col gap-md">
          <Select
            label="Bank"
            options={SOUTH_AFRICAN_BANKS}
            value={bankForm.bankName}
            onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
          />
          <Input
            label="Account Holder Name"
            value={bankForm.accountHolderName}
            onChange={(e) => setBankForm({ ...bankForm, accountHolderName: e.target.value })}
            placeholder="As it appears on your bank account"
          />
          <Input
            label="Account Number"
            value={bankForm.accountNumber}
            onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
            placeholder="Enter account number"
          />
          <div className="grid grid-cols-2 gap-md">
            <Select
              label="Account Type"
              options={ACCOUNT_TYPES}
              value={bankForm.accountType}
              onChange={(e) => setBankForm({ ...bankForm, accountType: e.target.value })}
            />
            <Input
              label="Branch Code"
              value={bankForm.branchCode}
              onChange={(e) => setBankForm({ ...bankForm, branchCode: e.target.value })}
              placeholder="e.g., 250655"
            />
          </div>
          <div className="p-sm bg-error-container/40 border border-error-container rounded">
            <p className="font-body-sm text-body-sm text-on-error-container flex items-start gap-xs">
              <Icon name="warning" size={16} className="flex-shrink-0 mt-xs" />
              <span>
                Please ensure your banking details are correct. Incorrect details may result in
                failed payouts.
              </span>
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-sm p-md border-t border-outline-variant">
          <Button variant="ghost" onClick={() => setShowAddBankModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAddBank} disabled={processing}>
            {processing ? 'Adding…' : 'Add Account'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default PayoutRequest
