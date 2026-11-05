import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  confirmManualPayment, listPendingPaymentIntents, rejectManualPayment, runReconciliation,
} from '../../lib/manualPayments'
import {
  Card, Button, Badge, Modal, ModalFooter, LoadingSpinner, ErrorState,
} from '../../components/ui'
import { formatCurrency, formatDate } from '../../lib/utils'
import { toast } from 'react-hot-toast'

/**
 * Operator queue for manual bank payments.
 *
 * A developer raises a funding request and transfers the money quoting a
 * reference. Nothing is funded until somebody here matches that reference
 * against a line on the bank statement and confirms it.
 *
 * Two controls are enforced by the database rather than this screen: only a
 * super admin may confirm, and nobody may confirm their own payment.
 */
const PaymentConfirmations = () => {
  const { user } = useAuth()

  const [intents, setIntents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [selected, setSelected] = useState(null)
  const [bankReference, setBankReference] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [mode, setMode] = useState('confirm')
  const [reconciliation, setReconciliation] = useState(null)
  const [proofUrl, setProofUrl] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setIntents(await listPendingPaymentIntents())
    } catch (err) {
      console.error('Failed to load payment queue:', err)
      setError('Could not load the payment queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** Proof documents live in a private bucket, so mint a short-lived URL. */
  const openProof = async (intent) => {
    if (!intent.proof_object_path) return
    try {
      const { data, error: signError } = await supabase.storage
        .from('verification-documents')
        .createSignedUrl(intent.proof_object_path, 300)
      if (signError) throw signError
      setProofUrl(data.signedUrl)
      window.open(data.signedUrl, '_blank', 'noopener')
    } catch (err) {
      console.error('Could not open proof:', err)
      toast.error('Could not open the proof of payment')
    }
  }

  const handleConfirm = async () => {
    if (!selected) return
    setProcessing(true)
    try {
      const result = await confirmManualPayment(selected.id, bankReference)
      if (result?.replayed) {
        toast('This payment was already confirmed.', { icon: 'ℹ️' })
      } else {
        toast.success(
          `Confirmed ${formatCurrency(result.amount_cents / 100)} — ` +
          `${formatCurrency(result.campaign_funds_cents / 100)} to the campaign.`,
        )
      }
      setSelected(null)
      setBankReference('')
      load()
    } catch (err) {
      toast.error(err.message || 'Could not confirm the payment')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!selected) return
    if (!rejectReason.trim()) {
      toast.error('Give a reason so the payer knows what to do next')
      return
    }
    setProcessing(true)
    try {
      await rejectManualPayment(selected.id, rejectReason)
      toast.success('Payment rejected')
      setSelected(null)
      setRejectReason('')
      load()
    } catch (err) {
      toast.error(err.message || 'Could not reject the payment')
    } finally {
      setProcessing(false)
    }
  }

  const handleReconcile = async () => {
    setProcessing(true)
    try {
      const result = await runReconciliation()
      setReconciliation(result)
      if (result.balanced && (result.discrepancies?.length ?? 0) === 0) {
        toast.success('Ledger balances and wallets agree')
      } else {
        toast.error('Reconciliation found a discrepancy — investigate before moving more money')
      }
    } catch (err) {
      toast.error(err.message || 'Could not run reconciliation')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payment confirmations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Match each reference against the bank statement before confirming. Confirming
            is what creates the campaign&rsquo;s funds.
          </p>
        </div>
        <Button variant="secondary" onClick={handleReconcile} disabled={processing}>
          Run reconciliation
        </Button>
      </div>

      {reconciliation && (
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <Badge variant={reconciliation.balanced ? 'success' : 'danger'}>
              {reconciliation.balanced ? 'Ledger balanced' : 'LEDGER OUT OF BALANCE'}
            </Badge>
            <span className="text-sm text-gray-500">
              {(reconciliation.discrepancies?.length ?? 0)} discrepancy(ies)
            </span>
          </div>
          {reconciliation.position && (
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Cash held</p>
                <p className="font-mono text-gray-900">
                  {formatCurrency((reconciliation.position.cash_held_cents || 0) / 100)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Campaign funds</p>
                <p className="font-mono text-gray-900">
                  {formatCurrency((reconciliation.position.campaign_funds_cents || 0) / 100)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Owed to creators</p>
                <p className="font-mono text-gray-900">
                  {formatCurrency((reconciliation.position.owed_to_creators_cents || 0) / 100)}
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {intents.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">Nothing waiting for confirmation.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-3 pr-4">Reference</th>
                <th className="py-3 pr-4">Payer</th>
                <th className="py-3 pr-4">Campaign</th>
                <th className="py-3 pr-4 text-right">Amount</th>
                <th className="py-3 pr-4">Raised</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3" />
              </tr>
            </thead>
            <tbody>
              {intents.map((intent) => {
                const isOwnPayment = intent.payer_id === user?.id
                return (
                  <tr key={intent.id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 font-mono text-gray-900">{intent.reference}</td>
                    <td className="py-3 pr-4">
                      {intent.payer?.company_name || intent.payer?.full_name || '—'}
                    </td>
                    <td className="py-3 pr-4">{intent.campaign?.title || '—'}</td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {formatCurrency(intent.amount_cents / 100)}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{formatDate(intent.created_at)}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={intent.status === 'under_review' ? 'warning' : 'default'}>
                        {intent.status === 'under_review' ? 'Proof submitted' : 'Awaiting payment'}
                      </Badge>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      {intent.proof_object_path && (
                        <Button variant="ghost" onClick={() => openProof(intent)}>
                          Proof
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        disabled={isOwnPayment}
                        title={isOwnPayment ? 'You cannot confirm your own payment' : undefined}
                        onClick={() => {
                          setSelected(intent)
                          setMode('confirm')
                          setBankReference(intent.bank_reference || '')
                        }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={mode === 'confirm' ? 'Confirm payment received' : 'Reject payment'}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Reference</span>
                <span className="font-mono">{selected.reference}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Amount</span>
                <span className="font-mono">{formatCurrency(selected.amount_cents / 100)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Payer</span>
                <span>{selected.payer?.full_name || '—'}</span>
              </div>
            </div>

            {mode === 'confirm' ? (
              <>
                <p className="text-sm text-gray-600">
                  Only confirm once you can see this amount on the bank statement against
                  the reference above. Confirming creates the campaign&rsquo;s funds and
                  cannot be undone — a mistake has to be corrected with a refund.
                </p>
                <label className="text-sm font-medium text-gray-700" htmlFor="bank-ref-admin">
                  Bank statement reference
                </label>
                <input
                  id="bank-ref-admin"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  placeholder="Line reference from the statement"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </>
            ) : (
              <>
                <label className="text-sm font-medium text-gray-700" htmlFor="reject-reason">
                  Why is this being rejected?
                </label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. No matching deposit found on the statement"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </>
            )}
          </div>
        )}

        <ModalFooter>
          {mode === 'confirm' ? (
            <>
              <Button variant="danger" onClick={() => setMode('reject')} disabled={processing}>
                Reject instead
              </Button>
              <Button variant="primary" onClick={handleConfirm} isLoading={processing}>
                Confirm received
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setMode('confirm')} disabled={processing}>
                Back
              </Button>
              <Button variant="danger" onClick={handleReject} isLoading={processing}>
                Reject payment
              </Button>
            </>
          )}
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default PaymentConfirmations
