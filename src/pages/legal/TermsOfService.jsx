import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY } from '../../data/companyInfo'

const sections = [
  { id: 'definitions',   label: '1. Definitions' },
  { id: 'eligibility',   label: '2. Eligibility' },
  { id: 'accounts',      label: '3. Accounts & verification' },
  { id: 'roles',         label: '4. Role-specific obligations' },
  { id: 'campaigns',     label: '5. Campaign lifecycle & contracts' },
  { id: 'escrow-fee',    label: '6. Escrow & platform fees' },
  { id: 'payments',      label: '7. Payment processing' },
  { id: 'content',       label: '8. Content licensing' },
  { id: 'disputes',      label: '9. Disputes' },
  { id: 'termination',   label: '10. Suspension & termination' },
  { id: 'liability',     label: '11. Disclaimers & liability' },
  { id: 'indemnity',     label: '12. Indemnities' },
  { id: 'governing-law', label: '13. Governing law' },
  { id: 'notices',       label: '14. Notices' },
  { id: 'changes',       label: '15. Changes to these terms' },
]

const TermsOfService = () => (
  <LegalLayout
    title="Terms of Service"
    policyKey="terms"
    intro={`These Terms govern your use of the ${COMPANY.tradingName} platform — a two-sided marketplace connecting property developers with content creators in ${COMPANY.jurisdiction}.`}
    sections={sections}
  >
    <p>
      By creating an account or using {COMPANY.tradingName} (operated by {COMPANY.legalName}, registration
      number {COMPANY.regNumber}, of {COMPANY.address.line1}, {COMPANY.address.suburb}, {COMPANY.address.city},
      {' '}{COMPANY.address.country} — "<strong>we</strong>", "<strong>us</strong>", "the Platform"), you
      agree to these Terms of Service. If you do not agree, do not use the Platform.
    </p>

    <section id="definitions">
      <h2>1. Definitions</h2>
      <ul>
        <li><strong>Platform</strong> — the AirHouse website, applications, APIs and supporting services.</li>
        <li><strong>Developer</strong> — a property developer, agency or owner who posts a Campaign to obtain Leads.</li>
        <li><strong>Creator</strong> — an independent content creator who applies for and is assigned to Campaigns.</li>
        <li><strong>Campaign</strong> — a brief published by a Developer with a budget, deliverables and timeline.</li>
        <li><strong>Assignment</strong> — the engagement formed when a Creator is selected for a Campaign.</li>
        <li><strong>Content</strong> — videos, images, copy and other materials produced by Creators under an Assignment.</li>
        <li><strong>Lead</strong> — a prospective buyer or tenant submitted via the Platform's lead-capture pages.</li>
        <li><strong>Escrow Account</strong> — the segregated account where Developer funds are held until released.</li>
        <li><strong>Platform Fee</strong> — the service fee retained by us on each Campaign, as set out in the applicable role-specific agreement.</li>
      </ul>
    </section>

    <section id="eligibility">
      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old and have legal capacity to contract. The Platform is primarily
        directed at users in {COMPANY.jurisdiction}. Foreign users may use the Platform provided they comply
        with their local law and with applicable South African law (including FICA, ECTA and POPIA).
      </p>
    </section>

    <section id="accounts">
      <h2>3. Accounts &amp; verification</h2>
      <p>
        You must register an account, provide accurate information, keep your credentials confidential and
        notify us immediately of any unauthorised use. Creators must complete the verification flow at{' '}
        <a href="/creator/verification">/creator/verification</a> before being assigned to paid Campaigns.
        We may request KYC documentation under FICA and refuse or revoke access if verification fails.
      </p>
    </section>

    <section id="roles">
      <h2>4. Role-specific obligations</h2>
      <h3>Developers</h3>
      <ul>
        <li>You warrant that you own the property advertised, or are authorised to market it.</li>
        <li>Your Campaign brief, property facts and pricing must be accurate and not misleading.</li>
        <li>You must handle Leads in compliance with POPIA (see our Privacy Policy).</li>
      </ul>
      <h3>Creators</h3>
      <ul>
        <li>Content must be original or properly licensed, lawful, and aligned with the Campaign brief.</li>
        <li>You may not infringe third-party IP, defame any person, or include hidden paid placements.</li>
        <li>You confirm you are an independent contractor and are responsible for your own tax affairs.</li>
      </ul>
    </section>

    <section id="campaigns">
      <h2>5. Campaign lifecycle &amp; contract formation</h2>
      <p>
        Each Assignment forms a binding contract between the Developer and the Creator on the terms set
        out in the Platform's contract module, which you accept electronically. Electronic acceptance is
        valid and binding under <strong>section 22 of the Electronic Communications and Transactions Act
        25 of 2002 ("ECTA")</strong>. You can review your contracts at any time at{' '}
        <a href="/contracts">/contracts</a> once authenticated.
      </p>
    </section>

    <section id="escrow-fee">
      <h2>6. Escrow &amp; Platform Fees</h2>
      <p>
        When a Developer funds a Campaign, the funds are deducted from their wallet and held in a{' '}
        <strong>segregated Escrow Account</strong>. Funds are released to Creators on milestone or content
        approval, in line with the Assignment terms. Creators are paid the amount agreed in their
        Assignment in full — no fee is deducted from a Creator's earnings.
      </p>
      <p>
        We retain a Platform Fee from the Developer's Campaign budget to operate the Platform. The Fee
        is disclosed to the Developer before they confirm funding and is set out in the{' '}
        <a href="/legal/developer-agreement">Developer Agreement</a>. Refund treatment is governed by the{' '}
        <a href="/legal/refunds">Refund Policy</a>.
      </p>
    </section>

    <section id="payments">
      <h2>7. Payment processing</h2>
      <p>
        Card and EFT payments are processed by independent licensed payment service providers — currently{' '}
        <strong>Yoco</strong> and <strong>BobPay</strong>. Their own terms apply at the point of payment.
        We do not store your full card details. Payouts to Creators are made by EFT to the bank account
        verified during onboarding.
      </p>
    </section>

    <section id="content">
      <h2>8. Content licensing</h2>
      <p>
        Subject to the Creator being paid, the Creator grants the Developer a non-exclusive, royalty-free
        licence to use the delivered Content for the marketing purposes set out in the Campaign brief.
        The Creator grants {COMPANY.tradingName} a limited, non-exclusive licence to display the Content
        on the Platform for promotional and case-study purposes (with attribution where reasonable).
      </p>
    </section>

    <section id="disputes">
      <h2>9. Disputes</h2>
      <p>
        Any dispute about an Assignment must first be raised through the in-app process at{' '}
        <a href="/disputes">/disputes</a>. If the dispute cannot be resolved within thirty (30) days, either
        party may refer it to arbitration under the rules of the Arbitration Foundation of Southern Africa
        ("AFSA"), seated in Pretoria. This does not prevent either party from approaching a court of
        competent jurisdiction for urgent or interim relief.
      </p>
    </section>

    <section id="termination">
      <h2>10. Suspension &amp; termination</h2>
      <p>
        We may suspend or terminate your account for breach of these Terms or our{' '}
        <a href="/legal/aup">Acceptable Use Policy</a>, for fraud, for chargeback abuse, or where required
        by law. Active escrow funds will be settled in line with the <a href="/legal/refunds">Refund
        Policy</a>.
      </p>
    </section>

    <section id="liability">
      <h2>11. Disclaimers &amp; liability</h2>
      <p>
        The Platform is provided on an "as is" and "as available" basis. To the fullest extent permitted
        by law, our total aggregate liability to you in any 12-month period is limited to the Platform Fees
        we have actually received from you in the prior six (6) months.
      </p>
      <p>
        <strong>Nothing in these Terms excludes or limits</strong> any liability that cannot lawfully be
        excluded — including your non-excludable rights under the Consumer Protection Act 68 of 2008, or
        liability for fraud, gross negligence, or wilful misconduct.
      </p>
    </section>

    <section id="indemnity">
      <h2>12. Indemnities</h2>
      <p>
        Each party indemnifies the other against losses arising from its breach of these Terms or of
        applicable law. Creators specifically indemnify Developers and {COMPANY.tradingName} against
        third-party claims of intellectual-property infringement, defamation or unlawful content arising
        from Content they submit.
      </p>
    </section>

    <section id="governing-law">
      <h2>13. Governing law &amp; jurisdiction</h2>
      <p>
        These Terms are governed by <strong>{COMPANY.governingLaw}</strong>. The parties submit to the
        non-exclusive jurisdiction of the courts of the {COMPANY.jurisdiction}, with the Gauteng Division
        of the High Court (Pretoria) as the agreed forum for any litigation.
      </p>
    </section>

    <section id="notices">
      <h2>14. Notices</h2>
      <p>
        Notices to us must be sent to{' '}
        <a href={`mailto:${COMPANY.email.legal}`}>{COMPANY.email.legal}</a>. The parties agree that
        electronic notices satisfy any "in writing" requirement, in line with{' '}
        <strong>section 12 of ECTA</strong> (information in the form of a data message). We may give you
        notice via the email address on your account or by an in-app notification.
      </p>
    </section>

    <section id="changes">
      <h2>15. Changes to these terms</h2>
      <p>
        We may amend these Terms from time to time. For material changes we'll give you at least thirty
        (30) days' notice by email and an in-app banner. Your continued use of the Platform after the
        effective date constitutes acceptance of the amended Terms.
      </p>
    </section>
  </LegalLayout>
)

export default TermsOfService
