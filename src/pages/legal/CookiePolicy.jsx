import LegalLayout from '../../components/layout/LegalLayout'
import { openCookieSettings } from '../../components/CookieConsentBanner'

const sections = [
  { id: 'what',     label: '1. What cookies are' },
  { id: 'cats',     label: '2. Categories we use' },
  { id: 'list',     label: '3. Cookie list' },
  { id: 'manage',   label: '4. Managing your cookies' },
  { id: 'browser',  label: '5. Browser controls' },
]

const CookiePolicy = () => (
  <LegalLayout
    title="Cookie Policy"
    policyKey="cookies"
    intro="What we store on your device, why, and how to change your mind."
    sections={sections}
  >
    <section id="what">
      <h2>1. What cookies are</h2>
      <p>
        Cookies are small text files placed on your device by your browser when you visit a website.
        Some are essential for the site to work; others are optional and used for things like remembering
        preferences, measuring usage, or improving the experience over time.
      </p>
    </section>

    <section id="cats">
      <h2>2. Categories we use</h2>
      <ul>
        <li>
          <strong>Strictly necessary</strong> — needed for sign-in, your session and basic site security.
          These cannot be disabled without breaking authentication.
        </li>
        <li>
          <strong>Functional</strong> — remember small preferences, such as whether the dashboard sidebar
          is collapsed (<code>airhouse:sidebar:collapsed</code>).
        </li>
        <li>
          <strong>Analytics</strong> — help us understand how the platform is used (off by default).
        </li>
        <li>
          <strong>Marketing</strong> — measure campaign effectiveness and personalise messaging
          (off by default).
        </li>
      </ul>
    </section>

    <section id="list">
      <h2>3. Cookie list</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Purpose</th><th>Provider</th><th>Duration</th></tr>
        </thead>
        <tbody>
          <tr><td>sb-access-token / sb-refresh-token</td><td>Authentication session</td><td>Supabase</td><td>Up to 30 days (refreshed)</td></tr>
          <tr><td>airhouse:sidebar:collapsed</td><td>Remember sidebar state</td><td>AirHouse (localStorage)</td><td>Until cleared</td></tr>
          <tr><td>airhouse:cookie-consent:v1</td><td>Stores your cookie choices</td><td>AirHouse (localStorage)</td><td>12 months</td></tr>
        </tbody>
      </table>
      <p>
        We do not currently set any third-party analytics or marketing cookies. If we add them, this
        table and the consent banner will be updated first, and we will not load them until you have
        opted in.
      </p>
    </section>

    <section id="manage">
      <h2>4. Managing your cookies on AirHouse</h2>
      <p>
        Open the cookie preferences modal at any time:
        {' '}
        <button
          type="button"
          onClick={openCookieSettings}
          className="text-primary underline hover:no-underline"
        >
          Open cookie settings
        </button>.
        Your choices are saved to <code>localStorage</code> and respected on every page.
      </p>
    </section>

    <section id="browser">
      <h2>5. Browser-level controls</h2>
      <p>
        You can also manage or block cookies in your browser. Note that blocking strictly necessary
        cookies will sign you out and may break parts of the site.
      </p>
      <ul>
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noreferrer">Google Chrome</a></li>
        <li><a href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" target="_blank" rel="noreferrer">Mozilla Firefox</a></li>
        <li><a href="https://support.apple.com/en-us/HT201265" target="_blank" rel="noreferrer">Safari</a></li>
        <li><a href="https://support.microsoft.com/en-us/microsoft-edge" target="_blank" rel="noreferrer">Microsoft Edge</a></li>
      </ul>
    </section>
  </LegalLayout>
)

export default CookiePolicy
