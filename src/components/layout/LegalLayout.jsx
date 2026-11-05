import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, ArrowUp, FileText } from 'lucide-react'
import { COMPANY, formatLastUpdated } from '../../data/companyInfo'
import ContactCard from '../ContactCard'

const POLICY_LINKS = [
  { slug: 'terms',                key: 'terms',               label: 'Terms of Service' },
  { slug: 'privacy',              key: 'privacy',             label: 'Privacy Policy' },
  { slug: 'cookies',              key: 'cookies',             label: 'Cookie Policy' },
  { slug: 'refunds',              key: 'refunds',             label: 'Refund & Cancellation' },
  { slug: 'aup',                  key: 'aup',                 label: 'Acceptable Use' },
  { slug: 'creator-agreement',    key: 'creatorAgreement',    label: 'Creator Agreement' },
  { slug: 'developer-agreement',  key: 'developerAgreement',  label: 'Developer Agreement' },
  { slug: 'paia',                 key: 'paia',                label: 'PAIA Manual' },
]

/**
 * Shared layout for every /legal/* page.
 *
 * @param {object}   props
 * @param {string}   props.title       — h1 heading
 * @param {string}   props.policyKey   — key in COMPANY.lastUpdated
 * @param {string=}  props.intro       — short intro paragraph above the body
 * @param {Array<{id: string, label: string}>=} props.sections — anchor links for left nav
 * @param {React.ReactNode} props.children
 */
const LegalLayout = ({ title, policyKey, intro, sections = [], children }) => {
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const lastUpdated = formatLastUpdated(policyKey)

  return (
    <div className="bg-background min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <nav className="mb-6 flex items-center gap-2 text-label-md text-on-surface-variant">
          <Link to="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <Link to="/legal" className="hover:text-primary">Legal</Link>
          <span>/</span>
          <span className="text-on-surface">{title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
          {/* Left sidebar */}
          <aside className="lg:sticky lg:top-20 lg:self-start space-y-6">
            <div>
              <h2 className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wide mb-3">
                All Policies
              </h2>
              <ul className="space-y-1">
                {POLICY_LINKS.map((p) => {
                  const active = p.key === policyKey
                  return (
                    <li key={p.slug}>
                      <Link
                        to={`/legal/${p.slug}`}
                        className={
                          'block px-3 py-2 rounded-md text-body-sm transition-colors ' +
                          (active
                            ? 'bg-primary-fixed text-on-primary-fixed font-semibold'
                            : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface')
                        }
                      >
                        {p.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>

            {sections.length > 0 && (
              <div>
                <h2 className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wide mb-3">
                  On This Page
                </h2>
                <ul className="space-y-1 border-l border-outline-variant pl-3">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block py-1 text-body-sm text-on-surface-variant hover:text-primary"
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* Article column */}
          <article className="min-w-0">
            <header className="mb-6 pb-6 border-b border-outline-variant">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
              {intro && (
                <p className="mt-3 font-body-md text-body-md text-on-surface-variant max-w-2xl">{intro}</p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-label-md">
                  <FileText className="w-4 h-4" />
                  Effective {lastUpdated}
                </span>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-outline-variant text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
            </header>

            <div className="legal-prose max-w-3xl">
              {children}
            </div>

            <div className="mt-12 pt-8 border-t border-outline-variant">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-4">
                Contact us about this policy
              </h3>
              <ContactCard />
            </div>
          </article>
        </div>

        {showTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full shadow-lg hover:bg-primary/90"
            aria-label="Back to top"
          >
            <ArrowUp className="w-4 h-4" /> Top
          </button>
        )}
      </div>
    </div>
  )
}

export default LegalLayout
