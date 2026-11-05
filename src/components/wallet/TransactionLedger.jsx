import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { CREATOR_HIDDEN_TX_TYPES } from '../../lib/creatorVisibility'
import { format } from 'date-fns'

const TYPE_META = {
  deposit:         { label: 'Deposit',          icon: 'arrow_downward',   tone: 'positive', filter: 'income' },
  content_payment: { label: 'Content Payment',  icon: 'star',             tone: 'positive', filter: 'income' },
  escrow_release:  { label: 'Escrow Release',   icon: 'lock_open',        tone: 'positive', filter: 'income' },
  refund:          { label: 'Refund',           icon: 'replay',           tone: 'positive', filter: 'income' },
  platform_fee:    { label: 'Platform Fee',     icon: 'percent',          tone: 'neutral',  filter: 'fees' },
  payout_fee:      { label: 'Payout Fee',       icon: 'percent',          tone: 'neutral',  filter: 'fees' },
  escrow_lock:     { label: 'Escrow Lock',      icon: 'lock',             tone: 'neutral',  filter: 'escrow' },
  payout_request:  { label: 'Payout Request',   icon: 'arrow_upward',     tone: 'negative', filter: 'expense' },
  adjustment:      { label: 'Adjustment',       icon: 'tune',             tone: 'neutral',  filter: 'fees' },
}

const FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'income',  label: 'Income' },
  { id: 'expense', label: 'Withdrawals' },
  { id: 'escrow',  label: 'Escrow' },
  { id: 'fees',    label: 'Fees' },
]

const TONE_CHIP = {
  positive: 'bg-secondary-container text-on-secondary-container',
  negative: 'bg-error-container text-on-error-container',
  neutral:  'bg-surface-variant text-on-surface-variant',
}

const TONE_AMOUNT = {
  positive: 'text-secondary',
  negative: 'text-error',
  neutral:  'text-on-surface',
}

const fmtZAR = (n) =>
  new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(n) || 0))

/**
 * Stitch-styled financial ledger.
 *
 * @param {object[]} transactions - wallet_transactions rows
 * @param {string}   detailBasePath - route prefix where /:txId resolves to invoice detail
 *                                    e.g. "/creator/wallet/transactions"
 * @param {string=}  emptyMessage
 */
const TransactionLedger = ({
  transactions = [],
  detailBasePath,
  emptyMessage = 'No transactions yet.',
  viewerRole,
}) => {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Creators never see developer-side platform commission. Even if the
  // ledger is rendered against a wallet that somehow contains those rows.
  const isCreator = viewerRole === 'creator'

  const visibleTransactions = useMemo(() => {
    if (!isCreator) return transactions
    return transactions.filter((tx) => !CREATOR_HIDDEN_TX_TYPES.has(tx.transaction_type))
  }, [transactions, isCreator])

  // If a creator has no remaining "fees" rows after hiding platform fees,
  // drop the Fees chip entirely so it doesn't render an empty filter.
  const visibleFilters = useMemo(() => {
    if (!isCreator) return FILTERS
    const hasFees = visibleTransactions.some(
      (t) => (TYPE_META[t.transaction_type]?.filter) === 'fees',
    )
    return hasFees ? FILTERS : FILTERS.filter((f) => f.id !== 'fees')
  }, [visibleTransactions, isCreator])

  // If the active filter just got hidden (e.g. Fees chip removed for a creator),
  // reset back to "all" instead of leaving a stale, invisible filter selected.
  useEffect(() => {
    if (!visibleFilters.some((f) => f.id === filter)) {
      setFilter('all')
    }
  }, [visibleFilters, filter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return visibleTransactions.filter((tx) => {
      const meta = TYPE_META[tx.transaction_type] || TYPE_META.adjustment
      if (filter !== 'all' && meta.filter !== filter) return false
      if (q) {
        const hay = [
          meta.label,
          tx.description,
          tx.reference_number,
          tx.transaction_type,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [visibleTransactions, filter, search])

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
      <div className="p-md border-b border-outline-variant flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">receipt_long</span>
            Financial Ledger
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            All wallet activity. Tap a row for an itemised invoice you can download.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference or note…"
            className="w-full bg-surface-container pl-9 pr-3 py-2 border border-outline-variant rounded-lg outline-none text-body-sm placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-md pt-md flex flex-wrap gap-2">
        {visibleFilters.map((f) => {
          const active = filter === f.id
          const count = f.id === 'all'
            ? visibleTransactions.length
            : visibleTransactions.filter((t) => (TYPE_META[t.transaction_type]?.filter) === f.id).length
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-full font-label-md text-label-md border transition-colors',
                active
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
              )}
            >
              {f.label}
              <span className={cn(
                'ml-1 px-1.5 rounded-full text-[10px] leading-tight',
                active ? 'bg-on-primary/20' : 'bg-surface-container-highest text-on-surface-variant'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="p-md">
        {filtered.length === 0 ? (
          <div className="text-center py-xl">
            <span className="material-symbols-outlined text-[44px] text-outline">receipt_long</span>
            <p className="mt-sm font-body-md text-on-surface">{emptyMessage}</p>
            <p className="font-body-sm text-on-surface-variant">
              {filter !== 'all' || search
                ? 'No transactions match the current filters.'
                : 'Activity will appear here once you have wallet movement.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant/60">
            {filtered.map((tx) => {
              const meta = TYPE_META[tx.transaction_type] || TYPE_META.adjustment
              const amount = Number(tx.amount) || 0
              const tone = amount > 0 ? 'positive' : amount < 0 ? 'negative' : meta.tone
              const linkTo = detailBasePath ? `${detailBasePath}/${tx.id}` : null
              const RowEl = linkTo ? Link : 'div'
              const rowProps = linkTo ? { to: linkTo } : {}

              return (
                <li key={tx.id}>
                  <RowEl
                    {...rowProps}
                    className={cn(
                      'flex items-center gap-sm py-3 px-2 -mx-2 rounded-lg transition-colors',
                      linkTo && 'hover:bg-surface-container-low cursor-pointer'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                      TONE_CHIP[tone]
                    )}>
                      <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-label-lg text-label-lg text-on-surface truncate">
                          {meta.label}
                        </p>
                        {tx.reference_number && (
                          <span className="font-data-mono text-[10px] uppercase tracking-wide text-outline truncate hidden sm:inline">
                            {tx.reference_number}
                          </span>
                        )}
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {tx.description || meta.label}
                      </p>
                      <p className="font-label-md text-label-md text-outline">
                        {tx.created_at ? format(new Date(tx.created_at), 'd MMM yyyy · h:mm a') : ''}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={cn(
                        'font-headline-md text-base font-semibold tabular-nums',
                        TONE_AMOUNT[tone]
                      )}>
                        {amount > 0 ? '+' : amount < 0 ? '-' : ''}R {fmtZAR(amount)}
                      </p>
                      {tx.balance_after != null && (
                        <p className="font-label-md text-label-md text-outline hidden sm:block">
                          Bal R {fmtZAR(tx.balance_after)}
                        </p>
                      )}
                    </div>

                    {linkTo && (
                      <span className="material-symbols-outlined text-outline text-[20px] hidden md:inline">
                        chevron_right
                      </span>
                    )}
                  </RowEl>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

export default TransactionLedger
