import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { LoadingSpinner, ErrorState } from '../../components/ui'
import { buildInvoiceFromTransaction } from '../../lib/transactionInvoice'
import { downloadInvoicePdf } from '../../lib/invoicePdf'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'
import toast from 'react-hot-toast'

const STATUS_PILL = {
  success: 'bg-secondary-container text-on-secondary-container border-secondary-fixed-dim',
  warning: 'bg-surface-variant text-on-surface-variant border-outline-variant',
  error:   'bg-error-container text-on-error-container border-error',
}

const fmtZAR = (n) =>
  new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(n) || 0))

const fmtDate = (d) => {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(new Date(d))
  } catch {
    return String(d)
  }
}

const TransactionInvoiceDetail = ({ backTo }) => {
  const { txId } = useParams()
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()
  const viewerRole = profile?.role
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Wait for auth so creators never briefly see the developer invoice.
    if (authLoading || !viewerRole) {
      setLoading(true)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    buildInvoiceFromTransaction(txId, { viewerRole })
      .then((data) => { if (!cancelled) setInvoice(data) })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError(err.message || 'Could not load invoice')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [txId, viewerRole, authLoading])

  const handleDownload = () => {
    if (!invoice) return
    try {
      downloadInvoicePdf(invoice, `${invoice.invoiceNumber}.pdf`)
    } catch (err) {
      console.error(err)
      toast.error('Could not generate PDF')
    }
  }

  const handlePrint = () => window.print()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading invoice…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-md">
        <ErrorState message={error} onRetry={() => navigate(0)} />
        <div className="mt-md text-center">
          <button
            onClick={() => navigate(backTo || -1)}
            className="font-label-md text-primary hover:text-on-primary-container"
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  if (!invoice) return null

  return (
    <div className="w-full max-w-4xl mx-auto print:max-w-full">
      {/* Toolbar (hidden in print) */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-sm mb-base print:hidden">
        <Link
          to={backTo || '..'}
          className="flex items-center gap-2 text-primary hover:text-on-primary-container transition-colors font-label-md text-label-md w-fit"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to wallet
        </Link>
        <div className="flex gap-sm">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 border border-outline-variant px-4 py-2 rounded-lg bg-surface hover:bg-surface-container transition-colors font-label-md text-label-md text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            Print
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-colors font-label-md text-label-md"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download PDF
          </button>
        </div>
      </div>

      {/* Invoice document */}
      <div className="bg-surface w-full border border-outline-variant rounded-xl p-md sm:p-lg shadow-sm flex flex-col gap-md relative overflow-hidden print:shadow-none print:border-0">
        <div className="absolute top-0 left-0 w-full h-2 bg-primary" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start border-b border-outline-variant pb-md gap-md">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-1">
              {invoice.isReceipt ? 'Receipt' : 'Invoice'}
            </h2>
            <p className="font-data-mono text-data-mono text-tertiary">#{invoice.invoiceNumber}</p>
            <p className="font-label-md text-label-md text-on-surface-variant mt-1">
              Type: {invoice.typeLabel}
            </p>
          </div>
          <div className="text-right">
            <div className={cn(
              'inline-flex items-center gap-1 px-3 py-1 rounded mb-2 border',
              STATUS_PILL[invoice.statusColor] || STATUS_PILL.success
            )}>
              <span className="material-symbols-outlined text-[14px]">
                {invoice.statusColor === 'error'
                  ? 'cancel'
                  : invoice.statusColor === 'warning'
                    ? 'schedule'
                    : 'check_circle'}
              </span>
              <span className="font-label-md text-label-md uppercase">{invoice.statusLabel}</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <span className="font-label-md text-label-md">Date Issued:</span> {fmtDate(invoice.issueDate)}
            </p>
            {invoice.datePaid && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                <span className="font-label-md text-label-md">Date Paid:</span> {fmtDate(invoice.datePaid)}
              </p>
            )}
            {invoice.referenceNumber && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                <span className="font-label-md text-label-md">Reference:</span> {invoice.referenceNumber}
              </p>
            )}
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <div className="bg-surface-container p-md rounded-lg border border-outline-variant/50">
            <h3 className="font-label-lg text-label-lg text-primary mb-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">domain</span>
              {invoice.fromLabel}
            </h3>
            <p className="font-body-md text-body-md text-on-surface font-semibold">{invoice.from?.name}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {invoice.from?.email && <>{invoice.from.email}<br /></>}
              {invoice.from?.address && <>{invoice.from.address}<br /></>}
              {invoice.from?.id && <>ID: {invoice.from.id}</>}
            </p>
          </div>
          <div className="bg-surface-container p-md rounded-lg border border-outline-variant/50">
            <h3 className="font-label-lg text-label-lg text-tertiary mb-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">person</span>
              {invoice.toLabel}
            </h3>
            <p className="font-body-md text-body-md text-on-surface font-semibold">{invoice.to?.name}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {invoice.to?.email && <>{invoice.to.email}<br /></>}
              {invoice.to?.address && <>{invoice.to.address}<br /></>}
              {invoice.to?.id && <>ID: {invoice.to.id}</>}
            </p>
          </div>
        </div>

        {/* Line items */}
        <div className="mt-base">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-outline-variant">
                <th className="py-sm px-2 font-label-md text-label-md text-tertiary uppercase tracking-wider">Description</th>
                <th className="py-sm px-2 font-label-md text-label-md text-tertiary text-right uppercase tracking-wider">Amount (ZAR)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={idx} className="border-b border-outline-variant/50">
                  <td className="py-sm px-2">
                    <p className="font-semibold text-on-surface">{item.description}</p>
                    {item.details && (
                      <p className="text-tertiary text-xs mt-1">{item.details}</p>
                    )}
                  </td>
                  <td className="py-sm px-2 text-right font-data-mono text-data-mono text-on-surface">
                    {item.amount < 0 ? '-' : ''}{fmtZAR(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="flex justify-end mt-base">
          <div className="w-full md:w-1/2 bg-surface-container-lowest p-md rounded-lg border border-outline-variant">
            {invoice.summary.map((s, i) => (
              <div
                key={i}
                className="flex justify-between py-2 border-b border-outline-variant/40 last:border-0"
              >
                <span className={cn(
                  'font-body-sm text-body-sm flex items-center gap-1',
                  s.color === 'error' ? 'text-error' : 'text-on-surface-variant'
                )}>
                  {s.label}
                </span>
                <span className={cn(
                  'font-data-mono text-data-mono',
                  s.color === 'error' ? 'text-error' : 'text-on-surface'
                )}>
                  {s.value < 0 ? '-' : ''}{fmtZAR(s.value)}
                </span>
              </div>
            ))}
            <div className="flex justify-between py-sm mt-2 border-t-2 border-primary">
              <span className="font-label-lg text-label-lg text-primary">{invoice.totalLabel}</span>
              <span className="font-headline-md text-headline-md text-primary">
                R {fmtZAR(invoice.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-md pt-base border-t border-outline-variant/30 flex flex-col sm:flex-row justify-between items-center gap-base text-center sm:text-left">
          <div className="flex items-center gap-2 text-tertiary">
            <span className="material-symbols-outlined text-[20px] text-primary">verified_user</span>
            <span className="font-label-md text-label-md uppercase tracking-wider">
              Institutional-grade trust
            </span>
          </div>
          <div className="font-label-md text-label-md text-outline">
            AirHouse (Pty) Ltd · Reg 2024/123456/07
          </div>
        </div>
      </div>
    </div>
  )
}

export default TransactionInvoiceDetail
