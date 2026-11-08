import { Link } from 'react-router-dom'
import { FileText, Shield, Cookie, RotateCcw, Ban, UserCheck, Building2, FileSearch } from 'lucide-react'
import ContactCard from '../../components/ContactCard'
import { COMPANY } from '../../data/companyInfo'

const ITEMS = [
  { slug: 'terms',               title: 'Terms of Service',        icon: FileText,   blurb: 'The master agreement that governs your use of AirHouse.' },
  { slug: 'privacy',             title: 'Privacy Policy',          icon: Shield,     blurb: 'What personal information we collect and how we use it, under POPIA.' },
  { slug: 'cookies',             title: 'Cookie Policy',           icon: Cookie,     blurb: 'Which cookies we set, why, and how to manage them.' },
  { slug: 'refunds',             title: 'Refund & Cancellation',   icon: RotateCcw,  blurb: 'How escrow refunds work, including chargebacks and ECTA cooling-off.' },
  { slug: 'aup',                 title: 'Acceptable Use Policy',   icon: Ban,        blurb: 'What you may not do on AirHouse — and what happens if you do.' },
  { slug: 'creator-agreement',   title: 'Creator Agreement',       icon: UserCheck,  blurb: 'The terms specific to creators — payouts, IP, performance.' },
  { slug: 'developer-agreement', title: 'Developer Agreement',     icon: Building2,  blurb: 'The terms specific to developers — escrow, platform fee, leads.' },
  { slug: 'paia',                title: 'PAIA Manual',             icon: FileSearch, blurb: 'How to request access to records we hold under PAIA s.51.' },
]

const LegalIndex = () => {
  return (
    <div className="bg-background min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-8">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Legal &amp; Compliance</h1>
          <p className="mt-3 font-body-md text-body-md text-on-surface-variant max-w-2xl">
            All of {COMPANY.tradingName}'s policies in one place. They're written in plain English wherever
            possible, and governed by {COMPANY.governingLaw}.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ITEMS.map(({ slug, title, icon: Icon, blurb }) => (
            <Link
              key={slug}
              to={`/legal/${slug}`}
              className="group p-5 rounded-xl border border-outline-variant bg-surface-container-lowest hover:border-primary hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h2 className="font-label-lg text-label-lg text-on-surface mb-1 group-hover:text-primary">{title}</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{blurb}</p>
            </Link>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ContactCard />
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
            <h3 className="font-label-lg text-label-lg text-on-surface mb-2">Reporting concerns</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              For privacy questions or POPIA requests, email{' '}
              <a className="text-primary underline" href={`mailto:${COMPANY.email.privacy}`}>{COMPANY.email.privacy}</a>.
              For legal notices, email{' '}
              <a className="text-primary underline" href={`mailto:${COMPANY.email.legal}`}>{COMPANY.email.legal}</a>.
              You can also lodge complaints directly with the Information Regulator at{' '}
              <a className="text-primary underline" href="mailto:inforeg@justice.gov.za">inforeg@justice.gov.za</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LegalIndex
