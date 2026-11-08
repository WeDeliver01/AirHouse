import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  PageHeader, Button, Card, MetricCard, Chip, Modal, Input, Icon,
  EmptyState, Skeleton,
} from '../../components/stitch'
import { formatCurrency } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import TransactionLedger from '../../components/wallet/TransactionLedger'

const STATUS_TONE = {
  active: 'success',
  open: 'primary',
  draft: 'neutral',
  completed: 'secondary',
  cancelled: 'danger',
}

const DeveloperWallet = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (user?.id) fetchWalletData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchWalletData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_type', 'developer')
        .single()

      if (walletError && walletError.code !== 'PGRST116') throw walletError

      // Wallets are provisioned by the signup trigger and, where needed, by
      // the financial functions. The client no longer creates them: it has no
      // INSERT privilege on `wallets`, and a browser-created wallet was a way
      // to attach a wallet row to an arbitrary user_id.
      const currentWallet = walletData
      setWallet(currentWallet)

      if (currentWallet) {
        const { data: txData } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('wallet_id', currentWallet.id)
          .order('created_at', { ascending: false })
          .limit(50)

        setTransactions(txData || [])
      }

      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select('id, title, property_name, total_budget, platform_fee, creator_budget, escrow_amount, amount_paid_out, status')
        .eq('developer_id', user.id)
        .order('created_at', { ascending: false })

      setCampaigns(campaignsData || [])
    } catch (err) {
      console.error('Error fetching wallet:', err)
      setError('Failed to load wallet data')
      toast.error('Failed to load wallet')
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount)

    if (!amount || amount < 1000) {
      toast.error('Minimum deposit is R1,000')
      return
    }

    setProcessing(true)
    try {
      // This used to write the new balance straight to the wallet from the
      // browser, so a developer could credit themselves any amount without a
      // payment ever being taken. A deposit may only be recorded by the
      // server once the payment provider has confirmed settlement, so there
      // is nothing safe to do here until that integration exists (AH-013).
      throw new Error(
        'Wallet top-up is unavailable: no payment provider is configured yet.',
      )
    } catch (e) {
      console.error('Error:', e)
      toast.error(e.message || 'Failed to process deposit')
    } finally {
      setProcessing(false)
    }
  }

  const totalEscrowed = campaigns.reduce((sum, c) => sum + (parseFloat(c.escrow_amount) || 0), 0)
  const totalPaidOut = campaigns.reduce((sum, c) => sum + (parseFloat(c.amount_paid_out) || 0), 0)
  const totalPlatformFees = campaigns.reduce((sum, c) => sum + (parseFloat(c.platform_fee) || 0), 0)
  const totalBudgetSum = campaigns.reduce((sum, c) => sum + (parseFloat(c.total_budget) || 0), 0)

  if (loading) {
    return (
      <div className="flex flex-col gap-gutter">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon="error"
          title="Couldn't load wallet"
          description={error}
          action={<Button onClick={fetchWalletData}>Retry</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Treasury"
        title="Campaign Wallet"
        description="Manage your campaign funds and escrow."
        actions={(
          <Button variant="primary" icon="add" onClick={() => setShowDepositModal(true)}>
            Add Funds
          </Button>
        )}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <MetricCard
          icon="account_balance_wallet"
          label="Available Balance"
          value={<span className="font-data-mono">{formatCurrency(wallet?.balance || 0)}</span>}
          helper="Ready to deploy"
        />
        <MetricCard
          icon="lock"
          label="In Escrow"
          value={<span className="font-data-mono">{formatCurrency(wallet?.escrow_balance || totalEscrowed)}</span>}
          helper="Locked for campaigns"
        />
        <MetricCard
          icon="south_west"
          label="Total Deposited"
          value={<span className="font-data-mono">{formatCurrency(wallet?.total_deposited || 0)}</span>}
          helper="Lifetime top-ups"
        />
        <MetricCard
          icon="north_east"
          label="Paid to Creators"
          value={<span className="font-data-mono">{formatCurrency(totalPaidOut)}</span>}
          helper="Released from escrow"
        />
      </div>

      {/* How escrow works */}
      <Card className="bg-surface-container-low flex flex-col gap-md">
        <div className="flex items-start gap-sm">
          <span className="w-9 h-9 rounded bg-primary-container/30 text-primary inline-flex items-center justify-center shrink-0">
            <Icon name="info" size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-headline-md text-headline-md text-on-surface">How escrow works</h3>
            <ul className="mt-sm flex flex-col gap-xs font-body-sm text-body-sm text-on-surface-variant">
              <li>• When you create a campaign, the creator budget is locked in escrow.</li>
              <li>• A 25% platform fee is deducted immediately from your deposit.</li>
              <li>• Funds are released to creators when their content is approved and live.</li>
              <li>• Unused escrow is refunded when campaigns are completed or cancelled.</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Campaign Funds */}
      <Card className="flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-on-surface inline-flex items-center gap-sm">
            <Icon name="lock" size={20} className="text-primary" />
            Campaign Funds
          </h3>
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}
          </span>
        </div>

        {campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Campaign</th>
                  <th className="text-right py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Total</th>
                  <th className="text-right py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Platform Fee</th>
                  <th className="text-right py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">In Escrow</th>
                  <th className="text-right py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Paid Out</th>
                  <th className="text-center py-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-outline-variant last:border-0">
                    <td className="py-sm">
                      <p className="font-label-lg text-label-lg text-on-surface">{campaign.title}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{campaign.property_name}</p>
                    </td>
                    <td className="py-sm text-right font-data-mono text-body-md text-on-surface">
                      {formatCurrency(campaign.total_budget)}
                    </td>
                    <td className="py-sm text-right font-data-mono text-body-md text-on-surface-variant">
                      {formatCurrency(campaign.platform_fee)}
                    </td>
                    <td className="py-sm text-right font-data-mono text-body-md text-primary">
                      {formatCurrency(campaign.escrow_amount || 0)}
                    </td>
                    <td className="py-sm text-right font-data-mono text-body-md text-secondary">
                      {formatCurrency(campaign.amount_paid_out || 0)}
                    </td>
                    <td className="py-sm text-center">
                      <Chip tone={STATUS_TONE[campaign.status] || 'neutral'}>
                        {campaign.status}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-container-low">
                  <td className="py-sm font-label-lg text-label-lg text-on-surface">Total</td>
                  <td className="py-sm text-right font-data-mono text-on-surface">{formatCurrency(totalBudgetSum)}</td>
                  <td className="py-sm text-right font-data-mono text-on-surface-variant">{formatCurrency(totalPlatformFees)}</td>
                  <td className="py-sm text-right font-data-mono text-primary">{formatCurrency(totalEscrowed)}</td>
                  <td className="py-sm text-right font-data-mono text-secondary">{formatCurrency(totalPaidOut)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="lock"
            title="No campaigns yet"
            description="Create a campaign to start using escrow."
          />
        )}
      </Card>

      {/* Financial Ledger */}
      <TransactionLedger
        transactions={transactions}
        detailBasePath="/developer/wallet/transactions"
        emptyMessage="No transactions yet"
        viewerRole="developer"
      />

      {/* Deposit Modal */}
      <Modal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        title="Add Funds"
        description="Top up your wallet so you can fund new campaigns."
        footer={(
          <>
            <Button variant="ghost" onClick={() => setShowDepositModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon="credit_card"
              onClick={handleDeposit}
              disabled={!depositAmount || parseFloat(depositAmount) < 1000 || processing}
            >
              {processing ? 'Processing…' : `Add ${depositAmount ? formatCurrency(parseFloat(depositAmount)) : 'Funds'}`}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-md">
          <div className="p-md bg-surface-container-low rounded border border-outline-variant text-center">
            <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Current Balance
            </p>
            <p className="font-headline-lg text-headline-lg text-on-surface font-data-mono mt-xs">
              {formatCurrency(wallet?.balance || 0)}
            </p>
          </div>

          <Input
            label="Amount to Deposit (ZAR)"
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="10000"
            min="1000"
            helperText="Minimum deposit: R1,000"
          />

          <div className="p-md bg-surface-container-low rounded border border-outline-variant">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <span className="font-label-lg text-label-lg text-on-surface">Demo Mode:</span>{' '}
              In production this connects to a payment gateway. For now, funds are added instantly for testing.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default DeveloperWallet
