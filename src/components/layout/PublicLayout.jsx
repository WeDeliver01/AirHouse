import { Outlet, Link } from 'react-router-dom'
import Navbar from './Navbar'
import { COMPANY, formatAddress } from '../../data/companyInfo'
import { openCookieSettings } from '../CookieConsentBanner'

const PublicLayout = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-lowest">
        <div className="h-1.5 w-full bg-primary" aria-hidden />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand + ECTA s.43 business identity */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <img src="/logo.png" alt="AirHouse" className="w-7 h-7 object-contain" />
                <span className="font-bold text-primary">{COMPANY.tradingName}</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                {COMPANY.legalName}
                {' · '}Registration No. {COMPANY.regNumber}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                {formatAddress()}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                <a className="hover:text-primary" href={`mailto:${COMPANY.email.support}`}>{COMPANY.email.support}</a>
                {' · '}
                <a className="hover:text-primary" href={`tel:${COMPANY.phone.replace(/\s+/g, '')}`}>{COMPANY.phone}</a>
              </p>
            </div>

            {/* Legal column */}
            <div>
              <p className="font-label-lg text-label-lg text-on-surface mb-3">Legal</p>
              <ul className="space-y-2 font-body-sm text-body-sm">
                <li><Link to="/legal/terms" className="text-on-surface-variant hover:text-primary">Terms of Service</Link></li>
                <li><Link to="/legal/privacy" className="text-on-surface-variant hover:text-primary">Privacy Policy</Link></li>
                <li><Link to="/legal/cookies" className="text-on-surface-variant hover:text-primary">Cookie Policy</Link></li>
                <li><Link to="/legal/refunds" className="text-on-surface-variant hover:text-primary">Refund Policy</Link></li>
                <li><Link to="/legal/aup" className="text-on-surface-variant hover:text-primary">Acceptable Use</Link></li>
                <li><Link to="/legal/paia" className="text-on-surface-variant hover:text-primary">PAIA Manual</Link></li>
              </ul>
            </div>

            {/* Help column */}
            <div>
              <p className="font-label-lg text-label-lg text-on-surface mb-3">Help</p>
              <ul className="space-y-2 font-body-sm text-body-sm">
                <li><Link to="/help" className="text-on-surface-variant hover:text-primary">Help Centre</Link></li>
                <li><Link to="/legal" className="text-on-surface-variant hover:text-primary">All Policies</Link></li>
                <li>
                  <button
                    type="button"
                    onClick={openCookieSettings}
                    className="text-on-surface-variant hover:text-primary"
                  >
                    Cookie Settings
                  </button>
                </li>
                <li><a href={`mailto:${COMPANY.email.support}`} className="text-on-surface-variant hover:text-primary">Contact Support</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-outline-variant flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <p className="font-label-md text-label-md text-on-surface-variant">
              © {new Date().getFullYear()} {COMPANY.tradingName}. All rights reserved. Governed by {COMPANY.governingLaw}.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default PublicLayout
