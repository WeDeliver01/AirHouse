import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { PAYMENT_CONFIG, createCheckoutSession } from '../../lib/payments'
import {
  PLATFORM_BANK_DETAILS, bankDetailsConfigured, createPaymentIntent,
  getPaymentsMode, submitPaymentProof, uploadPaymentProof,
} from '../../lib/manualPayments'
import { generateInvoiceData, generateInvoiceHTML } from '../../lib/invoices'
import {
  PageHeader, Button, Card, Chip, Modal, Icon, EmptyState, Skeleton,
} from '../../components/stitch'
import { toast } from 'react-hot-toast'
import { formatCurrency } from '../../lib/utils'

const FundCampaign = () => {
  const { campaignId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [invoiceData, setInvoiceData] = useState(null)
  const [paymentIntent, setPaymentIntent] = useState(null)
  const [proofSubmitted, setProofSubmitted] = useState(false)
  const [bankReference, setBankReference] = useState('')

  useEffect(() => {
    fetchCampaign()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  const fetchCampaign = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('developer_id', user.id)
        .single()

      if (fetchError) throw fetchError
      setCampaign(data)
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load campaign details')
      toast.error('Campaign not found')
    } finally {
      setLoading(false)
    }
  }

  const calculateFees = () => {
    if (!campaign) return { total: 0, platformFee: 0, creatorBudget: 0 }
    const total = campaign.total_budget || 0
    const platformFee = total * PAYMENT_CONFIG.PLATFORM_FEE_RATE
    const creatorBudget = total - platformFee
    return { total, platformFee, creatorBudget }
  }

  const { total, platformFee, creatorBudget } = calculateFees()

  const handleFundCampaign = async () => {
    setProcessing(true)
    try {
      const mode = await getPaymentsMode()

      if (mode === 'gateway') {
        const session = await createCheckoutSession({
          amount: total,
          currency: 'ZAR',
          description: `Campaign Funding: ${campaign.title}`,
          metadata: { campaignId, userId: user.id },
          successUrl: `${window.location.origin}/developer/campaigns/${campaignId}/funding/success`,
          cancelUrl: `${window.location.origin}/developer/campaigns/${campaignId}/funding`,
        })

        if (!session.checkoutUrl) {
          throw new Error(session.error || 'Could not start the card payment')
        }
        window.location.href = session.checkoutUrl
        return
      }

      // Manual bank transfer: raise a request and show the payer a reference
      // to quote. Nothing is funded until an operator confirms the money
      // arrived, so this does not mark the campaign as paid.
      const result = await createPaymentIntent(campaignId, total, {
        idempotencyKey: `intent-${campaignId}-${total}`,
      })
      setPaymentIntent(result)
      toast.success('Funding request created. Follow the transfer instructions below.')
    } catch (e) {
      console.error('Funding error:', e)
      toast.error(e.message || 'Could not start funding')
    } finally {
      setProcessing(false)
      setShowConfirmModal(false)
    }
  }

  const handleUploadProof = async (file) => {
    if (!paymentIntent) return
    setProcessing(true)
    try {
      const path = await uploadPaymentProof(user.id, paymentIntent.payment_intent_id, file)
      await submitPaymentProof(paymentIntent.payment_intent_id, {
        proofPath: path,
        bankReference: bankReference || paymentIntent.reference,
      })
      setProofSubmitted(true)
      toast.success('Proof received. We will confirm once the funds reflect.')
    } catch (e) {
      console.error('Proof upload failed:', e)
      toast.error(e.message || 'Could not upload proof of payment')
    } finally {
      setProcessing(false)
    }
  }

  const handleViewInvoice = async () => {
    // Generated on demand from the funded campaign rather than held in state
    // from a client-side funding step that no longer exists.
    let data = invoiceData
    if (!data) {
      try {
        data = await generateInvoiceData('campaign_funding', campaignId)
        setInvoiceData(data)
      } catch (err) {
        console.error('Could not build the invoice:', err)
        toast.error('Could not generate the invoice')
        return
      }
    }
    const html = generateInvoiceHTML(data)
    const newWindow = window.open('', '_blank')
    newWindow.document.write(html)
    newWindow.document.close()
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-gutter">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon="error"
          title="Couldn't load campaign"
          description={error}
          action={<Button onClick={fetchCampaign}>Retry</Button>}
        />
      </Card>
    )
  }

  // The campaign is funded once an operator has confirmed the transfer, so
  // that is what this screen keys off. `fundingComplete` was a local flag set
  // by the old client-side funding path, which no longer exists.
  const isFunded = Boolean(campaign.funded_at) || Number(campaign.escrow_amount) > 0

  if (isFunded) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="flex flex-col items-center text-center gap-md py-lg">
          <span className="w-20 h-20 rounded bg-secondary-container text-on-secondary-container inline-flex items-center justify-center">
            <Icon name="check_circle" size={40} />
          </span>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Campaign Funded</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
              Your campaign &ldquo;{campaign.title}&rdquo; has been funded and is now live.
            </p>
          </div>

          <div className="w-full bg-surface-container-low border border-outline-variant rounded p-md text-left">
            <h3 className="font-label-lg text-label-lg text-on-surface mb-sm">Funding Summary</h3>
            <div className="flex flex-col gap-sm">
              <div className="flex justify-between font-body-md text-body-md">
                <span className="text-on-surface-variant">Total Paid</span>
                <span className="text-on-surface font-data-mono">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between font-body-md text-body-md">
                <span className="text-on-surface-variant">Platform Fee (25%)</span>
                <span className="text-on-surface-variant font-data-mono">{formatCurrency(platformFee)}</span>
              </div>
              <div className="flex justify-between font-body-md text-body-md pt-sm border-t border-outline-variant">
                <span className="text-on-surface">Creator Budget (Escrow)</span>
                <span className="text-secondary font-data-mono">{formatCurrency(creatorBudget)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-sm justify-center">
            <Button variant="ghost" icon="description" onClick={handleViewInvoice}>
              View Invoice
            </Button>
            <Button
              variant="primary"
              iconRight="arrow_forward"
              onClick={() => navigate(`/developer/campaigns/${campaignId}`)}
            >
              View Campaign
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Payment"
        title="Fund Campaign"
        description="Complete payment to launch your campaign."
      />

      {paymentIntent ? (
        <Card className="flex flex-col gap-md">
          <div className="flex items-start gap-sm">
            <span className="w-10 h-10 rounded bg-primary-container text-on-primary-container inline-flex items-center justify-center shrink-0">
              <Icon name="account_balance" size={20} />
            </span>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                Transfer {formatCurrency(total)} to complete funding
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                Quote the reference below so we can match your payment. Your campaign
                goes live once we confirm the funds have cleared.
              </p>
            </div>
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded p-md">
            <div className="flex justify-between items-center mb-sm pb-sm border-b border-outline-variant">
              <span className="font-label-lg text-label-lg text-on-surface-variant">Reference</span>
              <span className="font-data-mono text-title-md text-primary">{paymentIntent.reference}</span>
            </div>
            {bankDetailsConfigured() ? (
              <div className="flex flex-col gap-xs font-body-md text-body-md">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Account name</span>
                  <span className="text-on-surface">{PLATFORM_BANK_DETAILS.accountName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Bank</span>
                  <span className="text-on-surface">{PLATFORM_BANK_DETAILS.bank}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Account number</span>
                  <span className="text-on-surface font-data-mono">{PLATFORM_BANK_DETAILS.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Branch code</span>
                  <span className="text-on-surface font-data-mono">{PLATFORM_BANK_DETAILS.branchCode}</span>
                </div>
              </div>
            ) : (
              <p className="font-body-md text-body-md text-error">
                Bank details are not configured yet. Contact support for transfer instructions,
                quoting reference {paymentIntent.reference}.
              </p>
            )}
          </div>

          {proofSubmitted ? (
            <div className="bg-secondary-container text-on-secondary-container rounded p-md flex items-center gap-sm">
              <Icon name="schedule" size={20} />
              <p className="font-body-md text-body-md">
                Proof received. We will confirm as soon as the funds reflect, usually within
                one business day.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-sm">
              <label className="font-label-lg text-label-lg text-on-surface" htmlFor="bank-ref">
                Your bank&rsquo;s reference (optional)
              </label>
              <input
                id="bank-ref"
                type="text"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="e.g. FNB payment 12345"
                className="w-full rounded border border-outline bg-surface px-md py-sm font-body-md text-body-md text-on-surface"
              />
              <label className="font-label-lg text-label-lg text-on-surface" htmlFor="proof-file">
                Upload proof of payment
              </label>
              <input
                id="proof-file"
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                disabled={processing}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUploadProof(file)
                }}
                className="font-body-md text-body-md text-on-surface-variant"
              />
            </div>
          )}
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-gutter">
        {/* Main column */}
        <div className="lg:col-span-2 flex flex-col gap-gutter">
          {/* Campaign info */}
          <Card>
            <div className="flex items-start gap-md">
              <span className="w-12 h-12 rounded bg-primary-container/30 text-primary inline-flex items-center justify-center shrink-0">
                <Icon name="apartment" size={24} />
              </span>
              <div className="min-w-0">
                <h2 className="font-headline-md text-headline-md text-on-surface">{campaign.title}</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">{campaign.property_name}</p>
                <div className="mt-sm">
                  <Chip tone="warning">Pending Funding</Chip>
                </div>
              </div>
            </div>
          </Card>

          {/* Payment breakdown */}
          <Card className="flex flex-col gap-md">
            <h3 className="font-headline-md text-headline-md text-on-surface">Payment Breakdown</h3>

            <div className="flex flex-col">
              <div className="flex justify-between items-center py-md border-b border-outline-variant">
                <div>
                  <p className="font-label-lg text-label-lg text-on-surface">Campaign Budget</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Total amount for creator payments</p>
                </div>
                <span className="font-headline-md text-headline-md text-on-surface font-data-mono">
                  {formatCurrency(total)}
                </span>
              </div>

              <div className="flex justify-between items-center py-md border-b border-outline-variant">
                <div>
                  <p className="font-label-lg text-label-lg text-on-surface-variant">Platform Fee (25%)</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">AirHouse service fee</p>
                </div>
                <span className="font-body-md text-body-md text-on-surface-variant font-data-mono">
                  -{formatCurrency(platformFee)}
                </span>
              </div>

              <div className="flex justify-between items-center py-md bg-secondary-container/40 -mx-md px-md rounded mt-md">
                <div>
                  <p className="font-label-lg text-label-lg text-on-secondary-container">Creator Budget</p>
                  <p className="font-body-sm text-body-sm text-on-secondary-container/80">
                    Held in escrow until work is completed
                  </p>
                </div>
                <span className="font-headline-md text-headline-md text-on-secondary-container font-data-mono">
                  {formatCurrency(creatorBudget)}
                </span>
              </div>
            </div>

            <div className="bg-surface-container-low border border-outline-variant rounded p-md flex gap-sm">
              <Icon name="info" size={18} className="text-primary shrink-0 mt-xs" />
              <div className="font-body-sm text-body-sm text-on-surface">
                <p className="font-label-lg text-label-lg text-on-surface">How escrow works</p>
                <p className="text-on-surface-variant mt-xs">
                  75% of your payment is held securely. Funds are released to creators only when they complete
                  approved work (content or qualified leads).
                </p>
              </div>
            </div>
          </Card>

          {/* Payment method */}
          <Card className="flex flex-col gap-md">
            <h3 className="font-headline-md text-headline-md text-on-surface">Payment Method</h3>

            {PAYMENT_CONFIG.GATEWAY === 'test' ? (
              <div className="bg-error-container/40 border border-error-container rounded p-md">
                <div className="inline-flex items-center gap-sm font-label-lg text-label-lg text-on-error-container mb-xs">
                  <Icon name="warning" size={18} />
                  Test Mode
                </div>
                <p className="font-body-sm text-body-sm text-on-error-container">
                  Payment gateway is in test mode. No real payment will be processed.
                  Click &ldquo;Fund Campaign&rdquo; to simulate a successful payment.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-sm">
                <div className="flex items-center gap-sm p-md border border-outline-variant rounded hover:border-primary cursor-pointer transition-colors">
                  <Icon name="credit_card" size={24} className="text-on-surface-variant" />
                  <div>
                    <p className="font-label-lg text-label-lg text-on-surface">Credit / Debit Card</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">Visa, Mastercard, Amex</p>
                  </div>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant inline-flex items-center gap-xs">
                  <Icon name="lock" size={14} />
                  Secure payment powered by {PAYMENT_CONFIG.GATEWAY === 'yoco' ? 'Yoco' : 'BobPay'}
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-gutter">
          <Card className="flex flex-col gap-md">
            <h3 className="font-headline-md text-headline-md text-on-surface">Order Summary</h3>

            <div className="flex flex-col gap-sm font-body-md text-body-md">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Campaign Budget</span>
                <span className="font-data-mono text-on-surface">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Platform Fee</span>
                <span className="font-data-mono text-on-surface">{formatCurrency(platformFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">VAT (15%)</span>
                <span className="font-data-mono text-on-surface">{formatCurrency(platformFee * 0.15)}</span>
              </div>
              <div className="border-t border-outline-variant pt-sm flex justify-between font-label-lg text-label-lg">
                <span className="text-on-surface">Total</span>
                <span className="font-data-mono text-on-surface">
                  {formatCurrency(total + (platformFee * 0.15))}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              icon="lock"
              className="w-full"
              onClick={() => setShowConfirmModal(true)}
              disabled={processing}
            >
              {processing ? 'Processing…' : 'Fund Campaign'}
            </Button>

            <div className="inline-flex items-center justify-center gap-xs font-body-sm text-body-sm text-on-surface-variant">
              <Icon name="shield" size={14} />
              Secure & encrypted payment
            </div>
          </Card>

          <Card className="bg-surface-container-low flex flex-col gap-sm">
            <h4 className="font-label-lg text-label-lg text-on-surface inline-flex items-center gap-sm">
              <Icon name="account_balance_wallet" size={18} className="text-primary" />
              Escrow Protection
            </h4>
            <ul className="flex flex-col gap-sm font-body-sm text-body-sm text-on-surface-variant">
              <li className="flex items-start gap-sm">
                <Icon name="check_circle" size={16} className="text-secondary mt-xs shrink-0" />
                <span>Funds held securely until work is approved</span>
              </li>
              <li className="flex items-start gap-sm">
                <Icon name="check_circle" size={16} className="text-secondary mt-xs shrink-0" />
                <span>You control when payments are released</span>
              </li>
              <li className="flex items-start gap-sm">
                <Icon name="check_circle" size={16} className="text-secondary mt-xs shrink-0" />
                <span>Refund protection for undelivered work</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Payment"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setShowConfirmModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleFundCampaign} disabled={processing}>
              {processing ? 'Processing…' : 'Confirm & Pay'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-md">
          <p className="font-body-md text-body-md text-on-surface-variant">
            You are about to fund the campaign &ldquo;{campaign?.title}&rdquo; with:
          </p>

          <div className="bg-surface-container-low border border-outline-variant rounded p-md flex flex-col gap-sm">
            <div className="flex justify-between font-body-md text-body-md">
              <span className="text-on-surface">Total Payment</span>
              <span className="font-label-lg text-label-lg text-on-surface font-data-mono">
                {formatCurrency(total + (platformFee * 0.15))}
              </span>
            </div>
            <div className="flex justify-between font-body-sm text-body-sm">
              <span className="text-on-surface-variant">Creator Budget (Escrow)</span>
              <span className="text-on-surface-variant font-data-mono">{formatCurrency(creatorBudget)}</span>
            </div>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            By proceeding, you agree to our{' '}
            <a href="/legal/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">Terms of Service</a>,{' '}
            <a href="/legal/developer-agreement" target="_blank" rel="noreferrer" className="text-primary hover:underline">Developer Agreement</a>{' '}and{' '}
            <a href="/legal/refunds" target="_blank" rel="noreferrer" className="text-primary hover:underline">Refund Policy</a>.{' '}
            Funds are held in our segregated escrow account. The 25% Platform Fee is non-refundable once a Creator is onboarded.
          </p>
        </div>
      </Modal>
    </div>
  )
}

export default FundCampaign
