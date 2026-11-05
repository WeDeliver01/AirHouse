import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY, formatAddress } from '../../data/companyInfo'

const sections = [
  { id: 'particulars',    label: '1. Particulars of the body' },
  { id: 'officer',        label: '2. Information Officer' },
  { id: 'records',        label: '3. Records held' },
  { id: 'request',        label: '4. How to request access' },
  { id: 'fees',           label: '5. Fees' },
  { id: 'remedies',       label: '6. Remedies' },
]

const PAIAManual = () => (
  <LegalLayout
    title="PAIA Manual"
    policyKey="paia"
    intro="Manual prepared in terms of section 51 of the Promotion of Access to Information Act 2 of 2000 (PAIA)."
    sections={sections}
  >
    <section id="particulars">
      <h2>1. Particulars of the body</h2>
      <ul>
        <li><strong>Name:</strong> {COMPANY.legalName} (trading as {COMPANY.tradingName})</li>
        <li><strong>Registration number:</strong> {COMPANY.regNumber}</li>
        <li><strong>Registered address:</strong> {formatAddress()}</li>
        <li><strong>Phone:</strong> {COMPANY.phone}</li>
        <li><strong>Email:</strong> <a href={`mailto:${COMPANY.email.legal}`}>{COMPANY.email.legal}</a></li>
      </ul>
    </section>

    <section id="officer">
      <h2>2. Information Officer</h2>
      <ul>
        <li><strong>Name:</strong> {COMPANY.informationOfficer}</li>
        <li><strong>Email:</strong> <a href={`mailto:${COMPANY.email.privacy}`}>{COMPANY.email.privacy}</a></li>
        <li><strong>Postal address:</strong> as above</li>
      </ul>
    </section>

    <section id="records">
      <h2>3. Categories of records held</h2>
      <ul>
        <li><strong>User records</strong> — account profiles, role, contact details, KYC documents.</li>
        <li><strong>Transaction records</strong> — wallet transactions, escrow movements, payouts, invoices.</li>
        <li><strong>Campaign records</strong> — briefs, applications, assignments, contracts and content.</li>
        <li><strong>Communications</strong> — in-app messages, support tickets, notifications.</li>
        <li><strong>Operational records</strong> — system logs, security events, change history.</li>
        <li><strong>Statutory records</strong> — those required to be kept under the Companies Act, Tax Administration Act and FICA.</li>
      </ul>
    </section>

    <section id="request">
      <h2>4. How to request access</h2>
      <p>
        Submit a written request using <strong>Form 2 of the PAIA Regulations</strong>, available from
        the South African Human Rights Commission at{' '}
        <a href="https://www.sahrc.org.za" target="_blank" rel="noreferrer">www.sahrc.org.za</a>.
      </p>
      <p>
        Send completed forms to{' '}
        <a href={`mailto:${COMPANY.email.privacy}`}>{COMPANY.email.privacy}</a> or by post to our
        registered address. We will respond within 30 days.
      </p>
    </section>

    <section id="fees">
      <h2>5. Fees</h2>
      <p>
        We charge fees in line with the PAIA Fees Regulations. A request fee is payable on submission
        and an additional access fee may be payable on approval. We will provide a fee estimate before
        proceeding with any request that exceeds the prescribed minimum.
      </p>
    </section>

    <section id="remedies">
      <h2>6. Available remedies if access is refused</h2>
      <p>
        If we refuse a request, you may lodge a complaint with the Information Regulator at{' '}
        <a href="mailto:inforeg@justice.gov.za">inforeg@justice.gov.za</a>, or apply to a court of
        competent jurisdiction within the timeframes set out in PAIA.
      </p>
    </section>
  </LegalLayout>
)

export default PAIAManual
