import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY } from '../../data/companyInfo'

const sections = [
  { id: 'authority',   label: '1. Authority to advertise' },
  { id: 'leads',       label: '2. Lead handling & POPIA' },
  { id: 'escrow',      label: '3. Payment & escrow' },
  { id: 'fee',         label: '4. The 25% Platform Fee' },
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
      <h2>3. Payment &amp; escrow</h2>
      <p>
        Campaign budgets are funded into the segregated Escrow Account before any Creator is engaged.
        Funds are released to Creators on milestone or content approval. See our{' '}
        <a href="/legal/refunds">Refund Policy</a> for the full escrow lifecycle.
      </p>
    </section>

    <section id="fee">
      <h2>4. The 25% Platform Fee</h2>
      <p>
        <strong>{COMPANY.tradingName} retains a flat 25% Platform Fee on every Campaign budget.</strong>{' '}
        This Fee covers matching, escrow, dispute handling, payout processing and ongoing platform
        development. It is disclosed before you confirm funding and reflected in every wallet
        transaction.
      </p>
      <p><strong>Worked example:</strong></p>
      <ul>
        <li>You fund a Campaign with R 20 000.</li>
        <li>R 5 000 (25%) is retained as the Platform Fee.</li>
        <li>R 15 000 is held in escrow and released to Creators as the Campaign progresses.</li>
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
