import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Badge, Button, Select, StatCard, LoadingSpinner, ErrorState, EmptyState,
} from '../../components/ui'
import { formatCurrency, formatDate } from '../../lib/utils'
import { toast } from 'react-hot-toast'
import {
  DollarSign, Clock, CheckCircle, Search, Download,
  CreditCard, Users, AlertCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// Wallet ledger entries that represent "creator payments". The legacy
// `payments` table no longer exists — it was replaced by `wallets`,
// `wallet_transactions` and `payout_requests` in migration 004. This page
// surfaces the same idea (admin oversight of money owed/paid to creators)
// using the immutable wallet ledger.
const PAYMENT_TYPES = ['content_payment', 'escrow_release', 'payout_request', 'adjustment']

const TYPE_LABELS = {
  content_payment: 'Content Payment',
  escrow_release:  'Escrow Release',
  payout_request:  'Payout to Bank',
  adjustment:      'Adjustment',
}

const STATUS_FILTERS = [
  { value: '',          label: 'All Statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending',   label: 'Pending' },
  { value: 'failed',    label: 'Failed' },
]

const statusColor = (status) => {
  switch (status) {
    case 'completed': return 'bg-secondary text-on-secondary'
    case 'pending':   return 'bg-tertiary-fixed text-on-surface'
    case 'failed':    return 'bg-error-container text-on-error-container'
    default:          return 'bg-surface-container text-on-surface-variant'
  }
}

const AdminPayments = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: txError } = await supabase
        .from('wallet_transactions')
        .select(`
          id, transaction_type, amount, fee, net_amount, status,
          description, reference_number, created_at,
          related_campaign_id, related_assignment_id,
          wallet:wallets!wallet_transactions_wallet_id_fkey(
            wallet_type,
            user:profiles(id, full_name, role, company_name)
          )
        `)
        .in('transaction_type', PAYMENT_TYPES)
        .order('created_at', { ascending: false })
        .limit(500)

      if (txError) throw txError
      setTransactions(data || [])
    } catch (err) {
      console.error('Admin Payments load failed:', err)
      setError('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return transactions.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false
      if (typeFilter && t.transaction_type !== typeFilter) return false
      if (!q) return true
      const name = t.wallet?.user?.full_name?.toLowerCase() || ''
      const ref  = t.reference_number?.toLowerCase() || ''
      const desc = t.description?.toLowerCase() || ''
      return name.includes(q) || ref.includes(q) || desc.includes(q)
    })
  }, [transactions, statusFilter, typeFilter, searchQuery])

  const stats = useMemo(() => {
    const sum = (arr) => arr.reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0)
    return {
      total:     sum(transactions),
      pending:   sum(transactions.filter(t => t.status === 'pending')),
      completed: sum(transactions.filter(t => t.status === 'completed')),
      payouts:   sum(transactions.filter(t => t.transaction_type === 'payout_request')),
    }
  }, [transactions])

  const exportCsv = () => {
    if (!filtered.length) {
      toast.error('Nothing to export')
      return
    }
    const rows = [
      ['Date', 'User', 'Type', 'Amount', 'Fee', 'Status', 'Reference', 'Description'],
      ...filtered.map(t => [
        formatDate(t.created_at),
        `"${t.wallet?.user?.full_name || '-'}"`,
        TYPE_LABELS[t.transaction_type] || t.transaction_type,
        t.amount,
        t.fee || 0,
        t.status,
        t.reference_number || '-',
        `"${(t.description || '').replace(/"/g, "'")}"`,
      ].join(','))
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Payments</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Read-only view of every creator-facing money movement on the platform.
            Use Financials to action payouts.
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          <Download className="w-4 h-4 mr-2" />Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Movement" value={formatCurrency(stats.total)} icon={CreditCard} />
        <StatCard label="Pending" value={formatCurrency(stats.pending)} icon={Clock} />
        <StatCard label="Completed" value={formatCurrency(stats.completed)} icon={CheckCircle} />
        <StatCard label="Payouts" value={formatCurrency(stats.payouts)} icon={AlertCircle} />
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search user, reference or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <Select
            options={[
              { value: '', label: 'All Types' },
              ...PAYMENT_TYPES.map(t => ({ value: t, label: TYPE_LABELS[t] }))
            ]}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="sm:w-48"
          />
          <Select
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="sm:w-40"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  <th className="py-3 px-md font-medium">User</th>
                  <th className="py-3 px-md font-medium">Type</th>
                  <th className="py-3 px-md font-medium text-right">Amount</th>
                  <th className="py-3 px-md font-medium text-right">Fee</th>
                  <th className="py-3 px-md font-medium text-center">Status</th>
                  <th className="py-3 px-md font-medium">Reference</th>
                  <th className="py-3 px-md font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/60">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-surface transition-colors">
                    <td className="py-3 px-md">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-container/20 rounded-full flex items-center justify-center">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-label-lg text-label-lg text-on-surface">
                            {tx.wallet?.user?.full_name || '-'}
                          </p>
                          <p className="font-label-md text-label-md text-on-surface-variant capitalize">
                            {tx.wallet?.wallet_type || tx.wallet?.user?.role || ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-md">
                      <Badge variant="secondary">
                        {TYPE_LABELS[tx.transaction_type] || tx.transaction_type}
                      </Badge>
                    </td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface">
                      {formatCurrency(tx.amount)}
                    </td>
                    <td className="py-3 px-md text-right font-data-mono text-data-mono text-on-surface-variant">
                      {tx.fee ? formatCurrency(tx.fee) : '-'}
                    </td>
                    <td className="py-3 px-md text-center">
                      <span className={cn(
                        'font-label-md text-label-md px-3 py-1 rounded inline-flex items-center capitalize',
                        statusColor(tx.status),
                      )}>
                        {tx.status || 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-md font-data-mono text-data-mono text-on-surface-variant">
                      {tx.reference_number || '-'}
                    </td>
                    <td className="py-3 px-md font-data-mono text-data-mono text-on-surface-variant">
                      {formatDate(tx.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <EmptyState
            icon={DollarSign}
            title="No payments yet"
            description="Wallet transactions for content payments, escrow releases and payouts will appear here as soon as activity begins."
          />
        </div>
      )}
    </div>
  )
}

export default AdminPayments
