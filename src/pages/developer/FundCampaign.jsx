import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { PAYMENT_CONFIG, createCheckoutSession, isSimulatedGateway } from '../../lib/payments'
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
  const [fundingComplete, setFundingComplete] = useState(false)
  const [invoiceData, setInvoiceData] = useState(null)

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
      if (isSimulatedGateway()) {
        // Funding used to credit escrow straight from the browser with no
        // payment taken, which made a campaign look funded when no money had
        // moved. Escrow may only be credited server-side after a verified
        // provider webhook, so there is nothing safe to do here yet.
        throw new Error(
          'Campaign funding is unavailable: no payment provider is configured yet.',
        )
      } else {
        const session = await createCheckoutSession({
          amount: total,
          currency: 'ZAR',
          description: `Campaign Funding: ${campaign.title}`,
          metadata: { campaignId, userId: user.id },
          successUrl: `${window.location.origin}/developer/campaigns/${campaignId}/funding/success`,
          cancelUrl: `${window.location.origin}/developer/campaigns/${campaignId}/funding`,
        })

        if (session.checkoutUrl) {
          window.location.href = session.checkoutUrl
        } else {
          throw new Error(session.error || 'Failed to create checkout session')
        }
      }
    } catch (e) {
      console.error('Funding error:', e)
      toast.error(e.message || 'Failed to process payment')
    } finally {
      setProcessing(false)
      setShowConfirmModal(false)
    }
  }

  const handleViewInvoice = () => {
    if (!invoiceData) return
    const html = generateInvoiceHTML(invoiceData)
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

  if (fundingComplete) {
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

  const isFunded = campaign.funded_at || campaign.escrow_amount > 0

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-gutter">
      <PageHeader
        eyebrow="Payment"
        title="Fund Campaign"
        description="Complete payment to launch your campaign."
      />

      {isFunded ? (
        <Card className="flex flex-col items-center text-center gap-md py-lg">
          <span className="w-12 h-12 rounded bg-secondary-container text-on-secondary-container inline-flex items-center justify-center">
            <Icon name="check_circle" size={24} />
          </span>
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">Campaign Already Funded</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
              This campaign has been funded with{' '}
              <span className="font-data-mono">{formatCurrency(campaign.escrow_amount)}</span> in escrow.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate(`/developer/campaigns/${campaignId}`)}>
            View Campaign
          </Button>
        </Card>
      ) : (
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
      )}

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
