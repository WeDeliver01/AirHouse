import LegalLayout from '../../components/layout/LegalLayout'
import { COMPANY } from '../../data/companyInfo'

const sections = [
  { id: 'content',     label: '1. Prohibited content' },
  { id: 'conduct',     label: '2. Prohibited conduct' },
  { id: 'restricted',  label: '3. Restricted business categories' },
  { id: 'reporting',   label: '4. Reporting violations' },
  { id: 'enforcement', label: '5. Enforcement' },
]

const AcceptableUsePolicy = () => (
  <LegalLayout
    title="Acceptable Use Policy"
    policyKey="aup"
    intro="What you may not do on AirHouse — written so we don't have to make a judgement call on each one."
    sections={sections}
  >
    <section id="content">
      <h2>1. Prohibited content</h2>
      <ul>
        <li>Illegal content of any kind, including content that incites violence or hatred.</li>
        <li>Misleading property listings — wrong addresses, fabricated specs, undisclosed conditions.</li>
        <li>Content that infringes third-party copyright, trademarks or other IP rights.</li>
        <li>Hate speech, harassment, or content that targets a person or group on protected grounds.</li>
        <li>Adult, sexually explicit, gore, or shock content.</li>
        <li>Content that promotes scams, phishing, malware or unlawful financial schemes.</li>
        <li>Content that uses a person's image or likeness without consent.</li>
      </ul>
    </section>

    <section id="conduct">
      <h2>2. Prohibited conduct</h2>
      <ul>
        <li>Generating fake leads, fake reviews, or inflating engagement metrics.</li>
        <li>Taking deals off-platform to circumvent Platform Fees after introductions were made via {COMPANY.tradingName}.</li>
        <li>Impersonating another person, business or property owner.</li>
        <li>Scraping, hammering or otherwise abusing our APIs and pages.</li>
        <li>Attempting to bypass rate limits, RLS rules, or any security control.</li>
        <li>Using the messaging system to spam, solicit unrelated business, or harass other users.</li>
      </ul>
    </section>

    <section id="restricted">
      <h2>3. Restricted business categories</h2>
      <p>
        To stay within the restrictions of our payment processors, we will not allow Campaigns related
        to (this list mirrors common Yoco / BobPay restricted categories):
      </p>
      <ul>
        <li>Gambling, lotteries and betting platforms.</li>
        <li>Unregulated financial services, get-rich-quick schemes, or unlicensed crypto-asset offerings.</li>
        <li>Pharmaceuticals or supplements requiring prescription, including weight-loss treatments.</li>
        <li>Adult services and adult subscription content.</li>
        <li>Weapons, ammunition, explosives.</li>
        <li>Counterfeit goods, IP-infringing products, or grey-market reselling.</li>
        <li>Multi-level marketing where income is primarily based on recruitment.</li>
      </ul>
    </section>

    <section id="reporting">
      <h2>4. Reporting violations</h2>
      <p>
        Email <a href={`mailto:${COMPANY.email.support}`}>{COMPANY.email.support}</a> or use the in-app
        dispute / report flow. Include a link to the offending Campaign, Assignment or Content where
        possible.
      </p>
    </section>

    <section id="enforcement">
      <h2>5. Enforcement</h2>
      <p>
        We use a graduated approach: warning → temporary suspension → permanent account termination.
        Where conduct is fraudulent or where there has been a material breach of this Policy, we may
        terminate immediately and forfeit funds where allowed by law and our Terms of Service.
      </p>
    </section>
  </LegalLayout>
)

export default AcceptableUsePolicy
