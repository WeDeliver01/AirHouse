import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY } from '../../data/companyInfo'

const sections = [
  { id: 'status',      label: '1. Independent contractor' },
  { id: 'payouts',     label: '2. Payouts & wallet' },
  { id: 'tax',         label: '3. Tax responsibilities' },
  { id: 'ip',          label: '4. Content ownership & licensing' },
  { id: 'verify',      label: '5. Verification' },
  { id: 'standards',   label: '6. Performance & removal' },
]

const CreatorAgreement = () => (
  <LegalLayout
    title="Creator Agreement"
    policyKey="creatorAgreement"
    intro="The terms specific to Creators on AirHouse. Read this together with our Terms of Service and Acceptable Use Policy."
    sections={sections}
  >
    <section id="status">
      <h2>1. Independent contractor</h2>
      <p>
        You operate on {COMPANY.tradingName} as an <strong>independent contractor</strong>, not an
        employee, agent or partner of {COMPANY.legalName} or any Developer. Nothing in this Agreement
        creates an employment, joint-venture or partnership relationship.
      </p>
    </section>

    <section id="payouts">
      <h2>2. Payouts &amp; wallet</h2>
      <p>
        Earnings are credited to your AirHouse wallet as escrow is released by the Developer. You can
        request a payout to your verified bank account from your wallet at{' '}
        <a href="/creator/wallet">/creator/wallet</a>, or initiate a payout request directly at{' '}
        <a href="/creator/wallet/payout">/creator/wallet/payout</a>. Payouts are processed within 3–5
        business days, subject to KYC verification.
      </p>
    </section>

    <section id="tax">
      <h2>3. Tax responsibilities</h2>
      <p>
        You are responsible for declaring and paying all taxes due on your earnings, including income
        tax and (where applicable) VAT. {COMPANY.tradingName} may issue annual statements summarising
        amounts paid to you, but does not deduct or withhold any taxes on your behalf.
      </p>
    </section>

    <section id="ip">
      <h2>4. Content ownership &amp; licensing</h2>
      <p>
        You retain ownership of the underlying intellectual property in the Content you create. Subject
        to your being paid, you grant the Developer a non-exclusive, royalty-free, transferable licence
        to use the delivered Content for the marketing purposes set out in the Campaign brief, including
        on the Developer's website and social channels.
      </p>
      <p>
        You also grant {COMPANY.tradingName} a limited, non-exclusive licence to display the Content on
        the Platform for promotional, scorecard and case-study purposes. This mirrors the language in
        the in-app contracts module.
      </p>
    </section>

    <section id="verify">
      <h2>5. Verification</h2>
      <p>
        To be assigned to paid Campaigns you must complete the verification flow at{' '}
        <a href="/creator/verification">/creator/verification</a>. We may request proof of identity,
        proof of address and proof of ownership of social-media handles. We may decline or revoke
        verification at our discretion.
      </p>
    </section>

    <section id="standards">
      <h2>6. Performance standards &amp; grounds for removal</h2>
      <ul>
        <li>Meet agreed deadlines and deliver content that matches the brief.</li>
        <li>Respond to Developer feedback within 48 hours during business days.</li>
        <li>Maintain a minimum review average — repeated low ratings may lead to demotion or removal.</li>
        <li>No off-platform solicitation of Developers introduced through {COMPANY.tradingName}.</li>
      </ul>
      <p>
        Breach of these standards or of our <a href="/legal/aup">Acceptable Use Policy</a> may result
        in suspension, removal from the marketplace, or forfeiture of pending escrow earnings as
        provided in the Refund Policy.
      </p>
    </section>
  </LegalLayout>
)

export default CreatorAgreement
