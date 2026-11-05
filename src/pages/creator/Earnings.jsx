import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Card,
  Badge,
  StatCard,
  LoadingSpinner,
  ErrorState,
  EmptyState,
} from '../../components/ui'
import { formatCurrency, formatDate } from '../../lib/utils'
import { isVisibleToCreator } from '../../lib/creatorVisibility'
import { DollarSign, CheckCircle, Clock, TrendingUp } from 'lucide-react'

// Wallet credit types that represent real campaign earnings for a creator.
// (Mirrors the dashboard's earnings query and stays defensively aligned with
// `isVisibleToCreator` so platform_fee rows can never bleed in.)
const EARNING_TX_TYPES = new Set(['escrow_release', 'content_payment'])

const CreatorEarnings = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [, setWallet] = useState(null)
  const [earningTxs, setEarningTxs] = useState([])
  const [completedPayouts, setCompletedPayouts] = useState([])
  const [campaignsById, setCampaignsById] = useState({})

  useEffect(() => {
    if (user?.id) fetchEarnings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const fetchEarnings = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Creator wallet
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_type', 'creator')
        .single()
      if (walletError && walletError.code !== 'PGRST116') throw walletError
      setWallet(walletData)

      if (!walletData) {
        setEarningTxs([])
        setCompletedPayouts([])
        setCampaignsById({})
        return
      }

      // 2. Earning credits (escrow_release / content_payment, completed, +ve)
      const { data: txData, error: txError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', walletData.id)
        .in('transaction_type', Array.from(EARNING_TX_TYPES))
        .eq('status', 'completed')
        .gt('amount', 0)
        .order('created_at', { ascending: true })
      if (txError) throw txError
      // Defence-in-depth: drop any rows the creator must never see.
      const earnings = (txData || []).filter(isVisibleToCreator)
      setEarningTxs(earnings)

      // 3. Completed payouts (sorted oldest → newest for FIFO matching).
      // Scope to this specific creator wallet so any future second wallet
      // (e.g. an additional payout-capable wallet on the same user) doesn't
      // mix into the FIFO match.
      const { data: payoutData, error: payoutError } = await supabase
        .from('payout_requests')
        .select('id, amount, status, completed_at, processed_at, requested_at')
        .eq('user_id', user.id)
        .eq('wallet_id', walletData.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: true, nullsFirst: false })
      if (payoutError) throw payoutError
      setCompletedPayouts(payoutData || [])

      // 4. Campaign titles for ledger display
      const campaignIds = Array.from(
        new Set(
          earnings
            .map((tx) => tx.metadata?.campaign_id)
            .filter(Boolean),
        ),
      )
      if (campaignIds.length > 0) {
        const { data: camps, error: campError } = await supabase
          .from('campaigns')
          .select('id, title, property_name')
          .in('id', campaignIds)
        if (campError) throw campError
        const map = {}
        ;(camps || []).forEach((c) => {
          map[c.id] = c
        })
        setCampaignsById(map)
      } else {
        setCampaignsById({})
      }
    } catch (err) {
      console.error('Error loading earnings:', err)
      setError('Failed to load your earnings history.')
    } finally {
      setLoading(false)
    }
  }

  // FIFO match: completed payouts cover earlier earnings first. An earning
  // is "Paid" once cumulative completed payouts cover it; the payout date
  // is the completed_at of the payout that finished covering it.
  const ledger = useMemo(() => {
    const payoutPool = completedPayouts.map((p) => ({
      remaining: Number(p.amount) || 0,
      date: p.completed_at || p.processed_at || p.requested_at || null,
    }))
    let idx = 0

    return earningTxs.map((tx) => {
      const campaign = campaignsById[tx.metadata?.campaign_id]
      const earned = new Date(tx.created_at)
      let toCover = Number(tx.amount) || 0
      let payoutDate = null

      while (toCover > 0 && idx < payoutPool.length) {
        const slot = payoutPool[idx]
        if (slot.remaining <= 0) {
          idx += 1
          continue
        }
        const used = Math.min(toCover, slot.remaining)
        slot.remaining -= used
        toCover -= used
        payoutDate = slot.date
        if (slot.remaining <= 0) idx += 1
      }

      return {
        id: tx.id,
        campaign:
          campaign?.title ||
          campaign?.property_name ||
          tx.description ||
          'Campaign earning',
        period: earned.toLocaleString('en-ZA', {
          month: 'short',
          year: 'numeric',
        }),
        amount: Number(tx.amount) || 0,
        status: toCover === 0 ? 'paid' : 'pending',
        payout_date: toCover === 0 ? payoutDate : null,
      }
    })
  }, [earningTxs, completedPayouts, campaignsById])

  const totals = useMemo(() => {
    const totalEarnings = earningTxs.reduce(
      (sum, tx) => sum + (Number(tx.amount) || 0),
      0,
    )
    const paidOut = completedPayouts.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0,
    )
    // "Pending" = earned but not yet paid out to a bank account.
    // Clamp at 0 so manual adjustments (e.g. refunds) can't show negatives.
    const pending = Math.max(totalEarnings - paidOut, 0)
    return { totalEarnings, paidOut, pending }
  }, [earningTxs, completedPayouts])

  // Display the ledger newest-first while keeping the FIFO match above
  // (which needs ascending order to be correct).
  const displayLedger = useMemo(
    () => [...ledger].reverse(),
    [ledger],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading your earnings..." />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchEarnings} />
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Earnings & Payouts
        </h1>
        <p className="text-text-secondary mt-1">
          Transparent record of your campaign earnings and payouts
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Earnings"
          value={formatCurrency(totals.totalEarnings)}
          icon={TrendingUp}
        />
        <StatCard
          label="Paid Out"
          value={formatCurrency(totals.paidOut)}
          icon={CheckCircle}
        />
        <StatCard
          label="Pending"
          value={formatCurrency(totals.pending)}
          icon={Clock}
        />
      </div>

      {/* Payment Ledger */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Payment Ledger
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Each entry reflects a completed campaign earning. Status flips to
          "Paid" once a bank payout has covered it.
        </p>

        {displayLedger.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No earnings yet"
            description="Once a developer releases payment for one of your campaigns, it will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payout Date</th>
                </tr>
              </thead>
              <tbody>
                {displayLedger.map((payment) => (
                  <tr key={payment.id}>
                    <td className="font-medium">{payment.campaign}</td>
                    <td className="text-text-secondary">{payment.period}</td>
                    <td className="font-bold">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td>
                      <Badge
                        variant={
                          payment.status === 'paid' ? 'success' : 'warning'
                        }
                      >
                        {payment.status === 'paid' ? 'Paid' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="text-text-secondary">
                      {payment.payout_date
                        ? formatDate(payment.payout_date)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payout Policy Notice */}
      <Card className="notice">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary mb-1">
              Payout Policy
            </h3>
            <p className="text-sm text-text-secondary">
              Payments are processed within 7–14 business days after campaign
              deliverables are approved. Pending amounts reflect approved but
              unpaid campaigns.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default CreatorEarnings
