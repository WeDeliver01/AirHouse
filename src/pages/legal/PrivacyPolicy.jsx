import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY, formatAddress } from '../../data/companyInfo'

const sections = [
  { id: 'who',          label: '1. Who we are' },
  { id: 'what',         label: '2. Information we collect' },
  { id: 'sources',      label: '3. Where we get it from' },
  { id: 'purposes',     label: '4. Purposes & lawful basis' },
  { id: 'sharing',      label: '5. Who we share it with' },
  { id: 'cross-border', label: '6. Cross-border transfers' },
  { id: 'retention',    label: '7. Retention periods' },
  { id: 'security',     label: '8. Security' },
  { id: 'rights',       label: '9. Your rights' },
  { id: 'exercise',     label: '10. How to exercise rights' },
  { id: 'children',     label: '11. Children' },
  { id: 'cookies',      label: '12. Cookies' },
  { id: 'changes',      label: '13. Changes to this policy' },
]

const PrivacyPolicy = () => (
  <LegalLayout
    title="Privacy Policy"
    policyKey="privacy"
    intro={`How ${COMPANY.tradingName} collects, uses, shares and protects personal information, in line with the Protection of Personal Information Act 4 of 2013 ("POPIA").`}
    sections={sections}
  >
    <section id="who">
      <h2>1. Who we are &amp; how to contact our Information Officer</h2>
      <p>
        {COMPANY.legalName} (registration number {COMPANY.regNumber}), trading as {COMPANY.tradingName},
        is the responsible party for the personal information processed through this Platform. Our
        registered address is {formatAddress()}.
      </p>
      <p>
        Our designated Information Officer is <strong>{COMPANY.informationOfficer}</strong>. You can reach
        them at <a href={`mailto:${COMPANY.email.privacy}`}>{COMPANY.email.privacy}</a> or by post at our
        registered address.
      </p>
    </section>

    <section id="what">
      <h2>2. Personal information we collect</h2>
      <ul>
        <li><strong>Identification data</strong> — name, ID/passport number (where required for KYC).</li>
        <li><strong>Contact data</strong> — email address, phone number, physical address.</li>
        <li><strong>Financial data</strong> — bank account details for payouts, payment-method tokens, transaction history.</li>
        <li><strong>KYC documents</strong> — proof of identity, proof of address, proof of right to market a property.</li>
        <li><strong>Content &amp; media</strong> — content you upload to the Platform (videos, images, copy).</li>
        <li><strong>Device &amp; usage data</strong> — IP address, device type, browser, log timestamps, pages visited.</li>
        <li><strong>Communications</strong> — messages exchanged between users, support tickets and emails to our team.</li>
      </ul>
    </section>

    <section id="sources">
      <h2>3. Sources</h2>
      <ul>
        <li>Directly from you when you register, transact, or contact us.</li>
        <li>From social platforms when you connect them to your profile (Instagram, TikTok, YouTube, Facebook).</li>
        <li>From public property records and the Deeds Office where relevant for verification.</li>
        <li>From our payment processors (Yoco, BobPay) about transaction status.</li>
      </ul>
    </section>

    <section id="purposes">
      <h2>4. Purposes for processing &amp; lawful basis (POPIA)</h2>
      <table>
        <thead>
          <tr><th>Purpose</th><th>Lawful basis</th></tr>
        </thead>
        <tbody>
          <tr><td>Creating and operating your account</td><td>Performance of a contract</td></tr>
          <tr><td>Matching Creators with Developers and running Campaigns</td><td>Performance of a contract</td></tr>
          <tr><td>Processing payments and payouts</td><td>Performance of a contract; legal obligation</td></tr>
          <tr><td>KYC, fraud prevention, AML/CFT screening</td><td>Legal obligation (FICA); legitimate interest</td></tr>
          <tr><td>Tax, accounting and statutory record-keeping</td><td>Legal obligation</td></tr>
          <tr><td>Customer support and dispute handling</td><td>Performance of a contract; legitimate interest</td></tr>
          <tr><td>Service emails (transactional notifications)</td><td>Performance of a contract</td></tr>
          <tr><td>Marketing emails and product news</td><td>Consent (you can opt out at any time)</td></tr>
          <tr><td>Analytics to improve the Platform</td><td>Consent (via cookie banner)</td></tr>
        </tbody>
      </table>
    </section>

    <section id="sharing">
      <h2>5. Who we share data with — sub-processors</h2>
      <table>
        <thead>
          <tr><th>Sub-processor</th><th>Purpose</th><th>Region</th></tr>
        </thead>
        <tbody>
          <tr><td>Supabase</td><td>Database, authentication and file storage</td><td>EU / US</td></tr>
          <tr><td>Resend</td><td>Transactional email delivery</td><td>EU / US</td></tr>
          <tr><td>Yoco</td><td>Card payment processing</td><td>South Africa</td></tr>
          <tr><td>BobPay</td><td>Alternative South African payment processing</td><td>South Africa</td></tr>
          <tr><td>[TBC analytics provider]</td><td>Aggregated usage analytics (only if enabled by you)</td><td>[TBC]</td></tr>
          <tr><td>[TBC error monitoring]</td><td>Crash and error reporting</td><td>[TBC]</td></tr>
        </tbody>
      </table>
      <p>
        We may also disclose information to law-enforcement, regulators or other authorities where we are
        compelled to do so by law.
      </p>
    </section>

    <section id="cross-border">
      <h2>6. Cross-border transfers</h2>
      <p>
        Some of our sub-processors (notably Supabase and Resend) may process personal information outside
        of South Africa, including in the European Union and the United States. Where this happens we rely
        on the conditions in <strong>section 72 of POPIA</strong> — namely contractual undertakings with
        the recipient that bind it to substantially the same data-protection principles, the consent of
        the data subject, or that the transfer is necessary for the performance or conclusion of a
        contract with the data subject.
      </p>
    </section>

    <section id="retention">
      <h2>7. Retention periods</h2>
      <ul>
        <li><strong>KYC documents</strong> — 5 years after account closure (FICA).</li>
        <li><strong>Transaction records and tax-relevant data</strong> — 5 years (Tax Administration Act).</li>
        <li><strong>General account and profile data</strong> — 3 years after account closure.</li>
        <li><strong>Marketing consent records</strong> — until you withdraw consent.</li>
        <li><strong>System logs and security events</strong> — up to 12 months.</li>
      </ul>
    </section>

    <section id="security">
      <h2>8. Security</h2>
      <p>
        We use TLS in transit, Supabase Row-Level Security to enforce data isolation, a strong password
        policy, role-based access control and audit logging. We restrict administrative access on a
        need-to-know basis. If we become aware of a security compromise that affects your personal
        information, we will notify you and the Information Regulator as required by{' '}
        <strong>POPIA section 22</strong>.
      </p>
    </section>

    <section id="rights">
      <h2>9. Your rights under POPIA</h2>
      <ul>
        <li>Access — confirm whether we hold information about you and request a copy.</li>
        <li>Correction — request correction or deletion of inaccurate or excessive information.</li>
        <li>Deletion — request deletion of information we no longer have a lawful basis to keep.</li>
        <li>Objection — object to processing based on legitimate interest, on reasonable grounds.</li>
        <li>Withdraw consent — at any time, where processing is based on consent.</li>
        <li>Lodge a complaint with the Information Regulator at{' '}
          <a href="mailto:inforeg@justice.gov.za">inforeg@justice.gov.za</a>.</li>
      </ul>
    </section>

    <section id="exercise">
      <h2>10. How to exercise your rights</h2>
      <p>
        Email <a href={`mailto:${COMPANY.email.privacy}`}>{COMPANY.email.privacy}</a>. We will respond
        within 30 days. We may need to verify your identity before acting on a request.
      </p>
    </section>

    <section id="children">
      <h2>11. Children</h2>
      <p>
        The Platform is not directed at anyone under the age of 18. We do not knowingly collect personal
        information from children. If you believe a child has provided us with information, please email
        us and we will delete it.
      </p>
    </section>

    <section id="cookies">
      <h2>12. Cookies</h2>
      <p>
        See our <a href="/legal/cookies">Cookie Policy</a> for full details. You can change your cookie
        choices at any time via the "Cookie Settings" link in the footer.
      </p>
    </section>

    <section id="changes">
      <h2>13. Changes to this policy</h2>
      <p>
        We'll post any changes on this page and update the "Effective" date. Material changes will be
        notified by email at least 30 days in advance.
      </p>
    </section>
  </LegalLayout>
)

export default PrivacyPolicy
