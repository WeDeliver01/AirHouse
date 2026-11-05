import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Card, Badge, Button, Select, Modal, ModalFooter, LoadingSpinner, ErrorState } from '../../components/ui'
import { formatCurrency, formatDate, formatRelativeTime } from '../../lib/utils'
import { processPayoutRequest } from '../../lib/payments'
import { toast } from 'react-hot-toast'
import { 
  DollarSign, Percent, Users, Lock, ArrowUpRight, Download, Search, 
  Clock, Building2, Wallet, BarChart3, PieChart, Eye, CheckCircle, XCircle
} from 'lucide-react'
import { cn } from '../../lib/utils'

const AdminFinancials = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState({})
  const [transactions, setTransactions] = useState([])
  const [creatorWallets, setCreatorWallets] = useState([])
  const [developerWallets, setDeveloperWallets] = useState([])
  const [payoutRequests, setPayoutRequests] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPayout, setSelectedPayout] = useState(null)
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchAllData() }, [])

  const fetchAllData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch wallets
      const { data: walletsData } = await supabase
        .from('wallets')
        .select('*, user:profiles(id, full_name, role, company_name)')
        .order('balance', { ascending: false })

      setCreatorWallets(walletsData?.filter(w => w.wallet_type === 'creator') || [])
      setDeveloperWallets(walletsData?.filter(w => w.wallet_type === 'developer') || [])

      // Fetch transactions
      const { data: txData } = await supabase
        .from('wallet_transactions')
        .select('*, wallet:wallets(user_id, wallet_type, user:profiles(full_name, role))')
        .order('created_at', { ascending: false })
        .limit(200)
      setTransactions(txData || [])

      // Fetch campaigns
      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select('total_budget, platform_fee, creator_budget, escrow_amount, amount_paid_out')

      // Fetch payouts
      const { data: payoutsData } = await supabase
        .from('payout_requests')
        .select('*, user:profiles(full_name), bank_account:bank_accounts(bank_name, account_number)')
        .order('requested_at', { ascending: false })
      setPayoutRequests(payoutsData || [])

      // Calculate stats
      const totalRevenue = campaignsData?.reduce((s, c) => s + (parseFloat(c.total_budget) || 0), 0) || 0
      const platformFees = campaignsData?.reduce((s, c) => s + (parseFloat(c.platform_fee) || 0), 0) || 0
      const totalEscrow = campaignsData?.reduce((s, c) => s + (parseFloat(c.escrow_amount) || 0), 0) || 0
      const creators = walletsData?.filter(w => w.wallet_type === 'creator') || []
      const developers = walletsData?.filter(w => w.wallet_type === 'developer') || []
      const pendingPayouts = payoutsData?.filter(p => p.status === 'pending') || []

      setStats({
        totalRevenue,
        platformFees,
        totalEscrow,
        totalCreatorBalance: creators.reduce((s, w) => s + (parseFloat(w.balance) || 0), 0),
        totalDeveloperBalance: developers.reduce((s, w) => s + (parseFloat(w.balance) || 0), 0),
        pendingPayoutCount: pendingPayouts.length,
        pendingPayoutAmount: pendingPayouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
        payoutFees: txData?.filter(t => t.transaction_type === 'payout_fee').reduce((s, t) => s + Math.abs(parseFloat(t.fee) || 0), 0) || 0,
      })
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load financial data')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Action a payout request.
   *
   * This previously wrote `payout_requests.status` straight from the browser,
   * which set the status without ever adjusting the wallet -- a rejected
   * payout left the creator's funds stranded in `pending_balance`. It now goes
   * through process_payout_request(), which moves the money, writes the
   * ledger entries and enforces that nobody actions their own request.
   */
  const handlePayoutDecision = async (payoutId, action) => {
    setProcessing(true)
    try {
      await processPayoutRequest(payoutId, user.id, action, '')
      toast.success(action === 'approve' ? 'Payout approved for processing' : 'Payout rejected')
      setShowPayoutModal(false)
      fetchAllData()
    } catch (error) {
      toast.error(error.message || 'Failed to process payout')
    } finally {
      setProcessing(false)
    }
  }

  const exportData = () => {
    const csv = ['Date,User,Type,Amount,Fee,Balance,Reference',
      ...transactions.map(t => `${formatDate(t.created_at)},${t.wallet?.user?.full_name || '-'},${t.transaction_type},${t.amount},${t.fee || 0},${t.balance_after},${t.reference_number || '-'}`)
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    toast.success('Exported')
  }

  const getStatusBadge = (status) => ({
    pending: 'warning', processing: 'primary', completed: 'success', failed: 'danger', cancelled: 'secondary'
  }[status] || 'secondary')

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><LoadingSpinner size="lg" text="Loading..." /></div>
  if (error) return <ErrorState message={error} onRetry={fetchAllData} />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Financial Dashboard</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">Complete audit trail and wallet management.</p>
        </div>
        <Button variant="secondary" onClick={exportData}><Download className="w-4 h-4 mr-2" />Export</Button>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Revenue</span>
            <DollarSign className="w-5 h-5 text-secondary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{formatCurrency(stats.totalRevenue)}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Platform Fees (25%)</span>
            <Percent className="w-5 h-5 text-primary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{formatCurrency(stats.platformFees)}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Creator Balances</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{formatCurrency(stats.totalCreatorBalance)}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex justify-between items-start mb-sm">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">In Escrow</span>
            <Lock className="w-5 h-5 text-tertiary" />
          </div>
          <p className="font-headline-xl text-headline-xl text-on-surface">{formatCurrency(stats.totalEscrow)}</p>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-md text-center">
          <p className="font-headline-md text-headline-md text-on-surface">{formatCurrency(stats.pendingPayoutAmount)}</p>
          <p className="font-label-md text-label-md text-on-surface-variant mt-xs">Pending Payouts ({stats.pendingPayoutCount})</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-md text-center">
          <p className="font-headline-md text-headline-md text-on-surface">{formatCurrency(stats.payoutFees)}</p>
          <p className="font-label-md text-label-md text-on-surface-variant mt-xs">Payout Fees (3%)</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-md text-center">
          <p className="font-headline-md text-headline-md text-on-surface">{formatCurrency(stats.totalDeveloperBalance)}</p>
          <p className="font-label-md text-label-md text-on-surface-variant mt-xs">Developer Balances</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-md text-center">
          <p className="font-headline-md text-headline-md text-on-surface">{transactions.length}</p>
          <p className="font-label-md text-label-md text-on-surface-variant mt-xs">Total Transactions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-outline-variant pb-2 overflow-x-auto">
        {['overview', 'transactions', 'creators', 'developers', 'payouts'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2 rounded-t font-label-lg text-label-lg capitalize transition-colors',
              activeTab === tab
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high')}>
            {tab}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-gutter">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-4 flex items-center gap-2"><PieChart className="w-5 h-5 text-primary" />Revenue Split</h3>
            <div className="space-y-3">
              <div className="flex justify-between p-3 bg-primary-container/10 border border-outline-variant rounded font-body-md text-body-md text-on-surface">
                <span>Platform (25%)</span><span className="font-data-mono text-data-mono">{formatCurrency(stats.platformFees)}</span>
              </div>
              <div className="flex justify-between p-3 bg-secondary-container border border-outline-variant rounded font-body-md text-body-md text-on-secondary-fixed">
                <span>Creators (75%)</span><span className="font-data-mono text-data-mono">{formatCurrency(stats.totalRevenue - stats.platformFees)}</span>
              </div>
              <div className="h-4 rounded flex overflow-hidden bg-surface-container-highest">
                <div className="bg-primary" style={{ width: '25%' }} />
                <div className="bg-secondary" style={{ width: '75%' }} />
              </div>
            </div>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-tertiary" />Pending Payouts</h3>
            {payoutRequests.filter(p => p.status === 'pending').slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-surface border border-outline-variant rounded mb-2">
                <div>
                  <p className="font-label-lg text-label-lg text-on-surface">{p.user?.full_name}</p>
                  <p className="font-label-md text-label-md text-on-surface-variant">{formatRelativeTime(p.requested_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-data-mono text-data-mono text-on-surface">{formatCurrency(p.net_amount)}</p>
                  <Button size="sm" variant="primary" onClick={() => { setSelectedPayout(p); setShowPayoutModal(true) }}>Process</Button>
                </div>
              </div>
            ))}
            {payoutRequests.filter(p => p.status === 'pending').length === 0 && <p className="text-center font-body-sm text-body-sm text-on-surface-variant py-4">No pending payouts</p>}
          </div>
        </div>
      )}

      {/* Transactions */}
      {activeTab === 'transactions' && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
            <input type="text" placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  <th className="py-3 px-md font-medium">Date</th>
                  <th className="py-3 px-md font-medium">User</th>
                  <th className="py-3 px-md font-medium">Type</th>
                  <th className="py-3 px-md font-medium text-right">Amount</th>
                  <th className="py-3 px-md font-medium text-right">Balance</th>
                  <th className="py-3 px-md font-medium">Ref</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
                {transactions.filter(t => !searchQuery || t.wallet?.user?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 50).map(tx => (
                  <tr key={tx.id} className="hover:bg-surface transition-colors">
                    <td className="py-3 px-md text-on-surface-variant font-data-mono text-data-mono">{formatDate(tx.created_at)}</td>
                    <td className="py-3 px-md text-on-surface">{tx.wallet?.user?.full_name || '-'}</td>
                    <td className="py-3 px-md text-on-surface capitalize">{tx.transaction_type.replace(/_/g, ' ')}</td>
                    <td className={cn('py-3 px-md text-right font-data-mono text-data-mono', tx.amount > 0 ? 'text-secondary' : 'text-error')}>{formatCurrency(tx.amount)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">{formatCurrency(tx.balance_after)}</td>
                    <td className="py-3 px-md font-label-md text-label-md text-on-surface-variant">{tx.reference_number?.slice(0, 15) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Creator Wallets */}
      {activeTab === 'creators' && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-4">Creator Wallets ({creatorWallets.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  <th className="py-3 px-md font-medium">Creator</th>
                  <th className="py-3 px-md font-medium text-right">Balance</th>
                  <th className="py-3 px-md font-medium text-right">Earned</th>
                  <th className="py-3 px-md font-medium text-right">Withdrawn</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
                {creatorWallets.map(w => (
                  <tr key={w.id} className="hover:bg-surface transition-colors">
                    <td className="py-3 px-md font-label-lg text-label-lg text-on-surface">{w.user?.full_name || '-'}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-secondary">{formatCurrency(w.balance)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">{formatCurrency(w.total_earned)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">{formatCurrency(w.total_withdrawn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Developer Wallets */}
      {activeTab === 'developers' && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-4">Developer Wallets ({developerWallets.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  <th className="py-3 px-md font-medium">Developer</th>
                  <th className="py-3 px-md font-medium text-right">Balance</th>
                  <th className="py-3 px-md font-medium text-right">Deposited</th>
                  <th className="py-3 px-md font-medium text-right">In Escrow</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
                {developerWallets.map(w => (
                  <tr key={w.id} className="hover:bg-surface transition-colors">
                    <td className="py-3 px-md font-label-lg text-label-lg text-on-surface">{w.user?.company_name || w.user?.full_name || '-'}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-secondary">{formatCurrency(w.balance)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">{formatCurrency(w.total_deposited)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-tertiary">{formatCurrency(w.escrow_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payouts */}
      {activeTab === 'payouts' && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-4">Payout Requests</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  <th className="py-3 px-md font-medium">Creator</th>
                  <th className="py-3 px-md font-medium">Bank</th>
                  <th className="py-3 px-md font-medium text-right">Amount</th>
                  <th className="py-3 px-md font-medium text-right">Fee</th>
                  <th className="py-3 px-md font-medium text-right">Net</th>
                  <th className="py-3 px-md font-medium text-center">Status</th>
                  <th className="py-3 px-md font-medium"></th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
                {payoutRequests.map(p => (
                  <tr key={p.id} className="hover:bg-surface transition-colors">
                    <td className="py-3 px-md font-label-lg text-label-lg text-on-surface">{p.user?.full_name}</td>
                    <td className="py-3 px-md text-on-surface-variant">{p.bank_account?.bank_name} ****{p.bank_account?.account_number?.slice(-4)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">{formatCurrency(p.amount)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-tertiary">{formatCurrency(p.payout_fee)}</td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">{formatCurrency(p.net_amount)}</td>
                    <td className="py-3 px-md text-center"><Badge variant={getStatusBadge(p.status)}>{p.status}</Badge></td>
                    <td className="py-3 px-md">
                      {p.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedPayout(p); setShowPayoutModal(true) }}><Eye className="w-4 h-4" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payout Modal */}
      <Modal isOpen={showPayoutModal} onClose={() => setShowPayoutModal(false)} title="Process Payout">
        {selectedPayout && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-xs text-text-secondary">Creator</p><p className="font-semibold">{selectedPayout.user?.full_name}</p></div>
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-xs text-text-secondary">Amount</p><p className="font-bold text-lg">{formatCurrency(selectedPayout.net_amount)}</p></div>
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-xs text-text-secondary">Bank</p><p className="font-semibold">{selectedPayout.bank_account?.bank_name}</p></div>
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-xs text-text-secondary">Account</p><p className="font-semibold">****{selectedPayout.bank_account?.account_number?.slice(-4)}</p></div>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              Processing this payout will mark it as completed. Ensure the bank transfer has been made.
            </div>
          </div>
        )}
        <ModalFooter>
          <Button variant="danger" onClick={() => handlePayoutDecision(selectedPayout.id, 'reject')} disabled={processing}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
          <Button variant="primary" onClick={() => handlePayoutDecision(selectedPayout.id, 'approve')} isLoading={processing}><CheckCircle className="w-4 h-4 mr-1" />Mark Complete</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default AdminFinancials
