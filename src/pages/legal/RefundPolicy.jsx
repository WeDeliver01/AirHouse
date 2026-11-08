import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY, formatAddress } from '../../data/companyInfo'

const sections = [
  { id: 'scope',         label: '1. Scope' },
  { id: 'before',        label: '2. Before a Creator is assigned' },
  { id: 'after-assign',  label: '3. After assignment, before delivery' },
  { id: 'after-deliver', label: '4. After delivery & approval' },
  { id: 'disputes',      label: '5. Disputed deliverables' },
  { id: 'fee',           label: '6. The Platform Fee' },
  { id: 'chargebacks',   label: '7. Chargebacks' },
  { id: 'how',           label: '8. How to request a refund' },
  { id: 'time',          label: '9. Processing time' },
  { id: 'cooling-off',   label: '10. ECTA cooling-off' },
]

const RefundPolicy = () => (
  <LegalLayout
    title="Refund &amp; Cancellation Policy"
    policyKey="refunds"
    intro="How money flows in and out of escrow on AirHouse, and when you're entitled to a refund."
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
        This policy applies to payments made by Developers to fund Campaigns on {COMPANY.tradingName}.
        Funds are charged via Yoco or BobPay and held in our segregated Escrow Account until released
        to Creators or refunded to you.
      </p>
    </section>

    <section id="before">
      <h2>2. Before a Creator is assigned</h2>
      <p>
        You may cancel a Campaign and request a full refund of your funded amount within{' '}
        <strong>seven (7) days</strong> of funding, less the non-refundable processing fees charged by
        Yoco / BobPay (which are disclosed at point of payment and which we do not retain).
      </p>
    </section>

    <section id="after-assign">
      <h2>3. After Creator assignment but before content submission</h2>
      <p>
        You may cancel and receive a refund of the remaining escrow balance. Any Creator who has been
        formally assigned will be paid pro-rata for work demonstrably performed (e.g. concept work,
        scouting, scheduled shoot fees).
      </p>
    </section>

    <section id="after-deliver">
      <h2>4. After content delivery and approval</h2>
      <p>
        Once you have approved delivered Content, the corresponding escrow funds are released to the
        Creator and <strong>are no longer refundable</strong>. Approval can happen explicitly in the
        review interface or implicitly after the auto-approval window stated in the Campaign brief.
      </p>
    </section>

    <section id="disputes">
      <h2>5. Disputed deliverables</h2>
      <p>
        If you believe delivered Content does not meet the brief, raise a dispute via{' '}
        <a href="/disputes">/disputes</a> before approving. Funds remain in escrow while the dispute is
        being investigated. If the dispute resolves in your favour, a refund is issued for the disputed
        portion. If it resolves in the Creator's favour, the funds are released to them.
      </p>
    </section>

    <section id="fee">
      <h2>6. The Platform Fee</h2>
      <p>
        The Platform Fee is refundable only where <strong>no Creator work has been performed</strong>.
        Once a Creator has been onboarded onto your Campaign — accepted the brief, signed the contract
        or started any deliverable — the Platform Fee is non-refundable.
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
