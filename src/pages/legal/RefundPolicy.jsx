import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY, formatAddress } from '../../data/companyInfo'

const sections = [
  { id: 'scope',         label: '1. Scope' },
  { id: 'before',        label: '2. Before payment is confirmed' },
  { id: 'after-assign',  label: '3. Once payment is confirmed' },
  { id: 'after-deliver', label: '4. Delivery of content' },
  { id: 'disputes',      label: '5. Disputed deliverables' },
  { id: 'fee',           label: '6. The Transaction Fee' },
  { id: 'chargebacks',   label: '7. Chargebacks' },
  { id: 'how',           label: '8. How to request a refund' },
  { id: 'time',          label: '9. Processing time' },
  { id: 'cooling-off',   label: '10. ECTA cooling-off' },
]

const RefundPolicy = () => (
  <LegalLayout
    title="Refund &amp; Cancellation Policy"
    policyKey="refunds"
    intro="How payment works on AirHouse, and when you're entitled to a refund."
    sections={sections}
  >
    <div className="not-prose mb-6 p-4 rounded-lg border border-secondary-container bg-secondary-container/40">
      <p className="font-label-lg text-label-lg text-on-surface mb-1">Refund queries</p>
      <p className="font-body-sm text-body-sm text-on-surface">
        <a href={`mailto:${COMPANY.email.support}`}>{COMPANY.email.support}</a>{' '}·{' '}
        <a href={`tel:${COMPANY.phone.replace(/\s+/g, '')}`}>{COMPANY.phone}</a>{' '}·{' '}
        {formatAddress()}
      </p>
    </div>

    <section id="scope">
      <h2>1. Scope</h2>
      <p>
        This policy applies to payments made by Developers to book a Campaign on {COMPANY.tradingName}.
        A Campaign is priced from the Creator's rate card for the deliverables added to the cart at
        checkout, and charged via Yoco, BobPay or bank transfer. There is no escrow account: once your
        payment is confirmed, the Creator is paid directly and in full at that moment.
      </p>
    </section>

    <section id="before">
      <h2>2. Before payment is confirmed</h2>
      <p>
        A booked Campaign that has not yet had its payment confirmed can be cancelled at no cost —
        nothing has been charged and no Creator has been paid. If a transfer is already in flight, tell
        us before it is confirmed and we will cancel the funding request.
      </p>
    </section>

    <section id="after-assign">
      <h2>3. Once payment is confirmed</h2>
      <p>
        As soon as your payment is confirmed, the Creator is paid their full share immediately. The
        booking can no longer be cancelled for a refund in the ordinary course — only a dispute (below)
        can result in money moving back to you after this point.
      </p>
    </section>

    <section id="after-deliver">
      <h2>4. Delivery of content</h2>
      <p>
        The Creator delivers the agreed deliverables after being paid. Content approval in the review
        interface records that the deliverable meets the brief, but does not itself trigger any
        payment — the Creator was already paid at checkout.
      </p>
    </section>

    <section id="disputes">
      <h2>5. Disputed deliverables</h2>
      <p>
        If you believe a delivered deliverable does not meet the brief, raise a dispute via{' '}
        <a href="/disputes">/disputes</a>. If the dispute resolves in your favour, the disputed amount
        is clawed back out of the Creator's wallet balance and refunded to you. This is only possible up
        to what the Creator still holds in their wallet — if they have already withdrawn the money, we
        will pursue recovery from the Creator directly rather than through your refund.
      </p>
    </section>

    <section id="fee">
      <h2>6. The Transaction Fee</h2>
      <p>
        The 2.7% transaction fee is refundable only where a dispute results in a full refund of the
        booking. Where a dispute refunds part of a booking, the transaction fee is refunded in the same
        proportion.
      </p>
    </section>

    <section id="chargebacks">
      <h2>7. Chargebacks</h2>
      <p>
        We ask that you complete the in-app dispute process before initiating a card chargeback. Abusive
        or fraudulent chargebacks may lead to suspension of your account and reversal of any associated
        Creator payouts.
      </p>
    </section>

    <section id="how">
      <h2>8. How to request a refund</h2>
      <ul>
        <li>
          In-app: open your wallet, find the funding transaction, and click "Request refund".
        </li>
        <li>
          By email: write to <a href={`mailto:${COMPANY.email.support}`}>{COMPANY.email.support}</a>{' '}
          with the transaction reference, your account email and a brief reason.
        </li>
      </ul>
    </section>

    <section id="time">
      <h2>9. Processing time</h2>
      <p>
        Approved refunds are returned to the original payment method within 5–10 business days,
        depending on your card issuer or bank.
      </p>
    </section>

    <section id="cooling-off">
      <h2>10. ECTA cooling-off (electronic transactions)</h2>
      <p>
        Where the seven-day cooling-off period in <strong>section 44 of the Electronic Communications
        and Transactions Act 25 of 2002 ("ECTA")</strong> applies to your transaction, you may cancel
        within seven days of payment without reason. Statutory exclusions apply (for example, services
        already fully performed with your consent). Any refund due will be paid within 30 days of
        cancellation.
      </p>
      <p>
        This policy does not affect any non-excludable rights you have under the Consumer Protection
        Act 68 of 2008.
      </p>
    </section>
  </LegalLayout>
)

export default RefundPolicy
