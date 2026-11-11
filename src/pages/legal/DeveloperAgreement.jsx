import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY } from '../../data/companyInfo'

const sections = [
  { id: 'authority',   label: '1. Authority to advertise' },
  { id: 'leads',       label: '2. Lead handling & POPIA' },
  { id: 'escrow',      label: '3. Payment at checkout' },
  { id: 'fee',         label: '4. The 2.7% Transaction Fee' },
  { id: 'reviews',     label: '5. Reviews & disputes' },
  { id: 'liability',   label: '6. Liability for property representations' },
]

const DeveloperAgreement = () => (
  <LegalLayout
    title="Developer Agreement"
    policyKey="developerAgreement"
    intro="The terms specific to Developers on AirHouse. Read this together with our Terms of Service."
    sections={sections}
  >
    <section id="authority">
      <h2>1. Authority to advertise the property</h2>
      <p>
        You warrant that you own the property advertised in each Campaign, or that you are authorised
        in writing by the owner / developer to market it. {COMPANY.tradingName} may request proof of
        authority at any time and may suspend Campaigns where authority cannot be demonstrated.
      </p>
    </section>

    <section id="leads">
      <h2>2. Lead handling &amp; POPIA</h2>
      <p>
        Leads captured via the Platform contain personal information of prospective buyers. You must:
      </p>
      <ul>
        <li>Use Leads only for the property and Campaign for which they were captured.</li>
        <li>Process Lead data in compliance with POPIA — including respecting opt-outs and access requests.</li>
        <li>Not sell, share or transfer Lead data to any third party without a lawful basis.</li>
        <li>Delete Lead data when it is no longer needed for the original purpose.</li>
      </ul>
    </section>

    <section id="escrow">
      <h2>3. Payment at checkout</h2>
      <p>
        A Campaign is priced from the Creator's published rate card for the deliverables you add to
        your cart. Once you check out and your payment is confirmed, the Creator is paid directly and
        in full at that moment. There is no Escrow Account and funds are not held pending content
        approval. See our <a href="/legal/refunds">Refund Policy</a> for how disputes after payment
        are handled.
      </p>
    </section>

    <section id="fee">
      <h2>4. The 2.7% Transaction Fee</h2>
      <p>
        <strong>{COMPANY.tradingName} retains a flat 2.7% transaction fee on every Campaign, taken at
        checkout.</strong>{' '} This Fee covers matching, payment processing, dispute handling, payout
        processing and ongoing platform development. It is disclosed before you confirm payment and
        reflected in every wallet transaction.
      </p>
      <p><strong>Worked example:</strong></p>
      <ul>
        <li>You check out a cart totalling R 20 000.</li>
        <li>R 540 (2.7%) is retained as the Transaction Fee.</li>
        <li>R 19 460 is paid to the Creator immediately once your payment is confirmed.</li>
      </ul>
    </section>

    <section id="reviews">
      <h2>5. Reviews &amp; disputes</h2>
      <p>
        You may leave a review for each completed Assignment. Reviews must be honest, factual and
        non-defamatory. If you believe a delivery does not meet the brief, raise a dispute via{' '}
        <a href="/disputes">/disputes</a> before approving and before initiating a chargeback.
      </p>
    </section>

    <section id="liability">
      <h2>6. Liability for property representations</h2>
      <p>
        You are responsible for the accuracy of the information you provide about properties on the
        Platform — including pricing, specifications, location and availability.{' '}
        {COMPANY.tradingName} is a marketing platform and not the seller, agent or warrantor of the
        properties listed. You indemnify {COMPANY.tradingName} against third-party claims arising from
        misleading or inaccurate property representations made by you or on your behalf.
      </p>
    </section>
  </LegalLayout>
)

export default DeveloperAgreement
