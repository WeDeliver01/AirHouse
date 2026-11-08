import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const Home = () => {
  const { isAuthenticated } = useAuth()
  const browseCreatorsTo = isAuthenticated ? '/marketplace' : '/register'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden min-h-[500px] sm:min-h-[600px] flex items-center">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/hero-property.png')" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30 sm:from-black/75 sm:via-black/50 sm:to-black/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-32 w-full">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <img src="/logo.png" alt="AirHouse" className="w-10 h-10 sm:w-12 sm:h-12 object-contain bg-white/95 rounded-lg p-1" />
              <span className="text-xl sm:text-2xl font-bold text-white">AirHouse</span>
            </div>
            <h1 className="font-headline-xl text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
              Performance-driven social media marketing
              <span className="text-secondary-fixed"> for property developments</span>
            </h1>

            <p className="mt-4 sm:mt-6 font-body-lg text-base sm:text-lg text-white/80 leading-relaxed">
              We connect property developers with vetted content creators to run
              structured, campaign-based social media marketing that generates
              real property leads — not vanity metrics.
            </p>

            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link
                to="/register?role=developer"
                className="inline-flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-6 h-12 rounded-lg font-label-lg text-label-lg hover:bg-secondary-fixed transition-colors w-full sm:w-auto"
              >
                I'm a Developer
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </Link>
              <Link
                to="/register?role=creator"
                className="inline-flex items-center justify-center bg-white/10 text-white border border-white/30 px-6 h-12 rounded-lg font-label-lg text-label-lg hover:bg-white/20 backdrop-blur-sm transition-colors w-full sm:w-auto"
              >
                I'm a Creator
              </Link>
            </div>

            <div className="mt-8 sm:mt-12 flex flex-wrap items-center gap-4 sm:gap-8 font-label-md text-label-md text-white/70">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[20px]">check_circle</span>
                <span>Vetted Creators</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[20px]">check_circle</span>
                <span>Transparent Pricing</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[20px]">check_circle</span>
                <span>Real Leads</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENTO FEATURE GRID */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-3">
            Showcasing the stays people actually want to book
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            From weekend getaways and serviced apartments to full houses —
            AirHouse turns every short-stay listing into creator-led content
            that drives real bookings, not vanity metrics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* For Developers — large */}
          <div className="md:col-span-8 bg-surface-container-low rounded-[28px] p-8 flex flex-col justify-between">
            <div className="mb-6">
              <span className="font-label-md text-label-md text-primary uppercase tracking-wider">01 · Hosts & Developers</span>
              <h3 className="font-headline-md text-headline-md text-on-surface mt-2 mb-2">
                List getaways, apartments & homes
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Market Airbnb-style getaways, serviced apartments, and full
                houses through creator-led content, with full visibility into
                campaign performance and lead generation.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-outline-variant/60">
              <div>
                <span className="material-symbols-outlined text-primary mb-2 block">payments</span>
                <div className="font-label-lg text-label-lg text-on-surface">Track cost per lead</div>
              </div>
              <div>
                <span className="material-symbols-outlined text-primary mb-2 block">group_search</span>
                <div className="font-label-lg text-label-lg text-on-surface">Browse vetted creators</div>
              </div>
              <div>
                <span className="material-symbols-outlined text-primary mb-2 block">campaign</span>
                <div className="font-label-lg text-label-lg text-on-surface">Manage campaigns in one place</div>
              </div>
            </div>
            <Link
              to="/register?role=developer"
              className="mt-6 self-start inline-flex items-center gap-2 text-primary font-label-lg text-label-lg hover:gap-3 transition-all"
            >
              Get started as a host
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>

          {/* Stat block */}
          <div className="md:col-span-4 bg-primary text-on-primary rounded-[28px] p-8 flex flex-col justify-center relative overflow-hidden">
            <div className="relative z-10">
              <div className="font-label-md text-label-md uppercase tracking-wider opacity-70 mb-2">
                Real performance
              </div>
              <div className="font-headline-xl text-4xl font-bold mb-3">Real leads.</div>
              <div className="font-body-md text-body-md opacity-80">
                Hosts track real enquiries and cost per lead — not likes,
                comments, or follower counts.
              </div>
            </div>
            <div className="absolute -right-6 -bottom-6 opacity-15 rotate-[-8deg]">
              <span className="material-symbols-outlined" style={{ fontSize: '140px' }}>cottage</span>
            </div>
          </div>

          {/* For Creators — medium */}
          <div className="md:col-span-5 bg-secondary-container/50 rounded-[28px] p-8">
            <span className="font-label-md text-label-md text-on-secondary-container uppercase tracking-wider">02 · Creators</span>
            <h3 className="font-headline-md text-headline-md text-on-surface mt-2 mb-2">Content Creators</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6">
              Shoot real getaways and homes on serious, paid campaigns —
              clear expectations, professional briefs, structured delivery.
            </p>
            <ul className="space-y-3 mb-6">
              {[
                'Fixed campaign budgets',
                'Clear briefs & deliverables',
                'Build your reputation',
              ].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary text-[20px]">check_circle</span>
                  <span className="font-body-sm text-body-sm text-on-surface">{t}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/register?role=creator"
              className="inline-flex items-center justify-center gap-2 text-on-secondary-container font-label-lg text-label-lg hover:gap-3 transition-all"
            >
              Join as Creator
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>

          {/* How it works — wide */}
          <div className="md:col-span-7 rounded-[28px] overflow-hidden relative min-h-[320px] flex flex-col">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/images/how-it-works-bg.jpg')" }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-t from-on-surface/90 via-on-surface/50 to-on-surface/10" />
            <div className="relative p-8 flex-1 flex flex-col justify-end text-white">
              <h3 className="font-headline-md text-headline-md mb-1">How it works</h3>
              <p className="font-body-sm text-body-sm text-white/70 mb-6">
                A simple, transparent process from campaign brief to qualified lead.
              </p>

              <div className="flex flex-col sm:flex-row gap-0 sm:gap-6">
                {[
                  { num: '01', icon: 'campaign',    title: 'Create a campaign',   body: 'Define brief, budget, and audience.' },
                  { num: '02', icon: 'group',       title: 'Match with a creator', body: 'Assign one creator per campaign.' },
                  { num: '03', icon: 'trending_up', title: 'Generate leads',       body: 'Capture real enquiries via tracked links.' },
                ].map((step, i) => (
                  <div key={step.num} className="flex-1 flex sm:flex-col gap-3 py-3 sm:py-0 relative">
                    {i < 2 && (
                      <span className="hidden sm:block absolute top-3 left-full w-6 h-px bg-white/30 -translate-x-3" aria-hidden />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[20px]">{step.icon}</span>
                      <span className="font-label-md text-label-md text-white/50">{step.num}</span>
                    </div>
                    <div>
                      <div className="font-label-lg text-label-lg">{step.title}</div>
                      <div className="font-body-sm text-body-sm text-white/70">{step.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-surface-container-low py-16 md:py-20 border-y border-outline-variant">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-3">
              Trusted by SA's property leaders
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Hear how developers and creators are building real pipelines with AirHouse.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {[
              {
                quote: "Structured campaigns and tracked referral links mean every rand we spend is measurable. We finally have visibility into which creators actually drive enquiries.",
                name: 'David van der Merwe',
                role: 'Marketing Director, Coastal Developments',
              },
              {
                quote: "Clear briefs, fixed budgets, on-time payouts. AirHouse treats property creators like professionals — and the campaigns are genuinely worth our time.",
                name: 'Lerato Mokoena',
                role: 'Property Content Creator',
              },
            ].map((t) => (
              <figure
                key={t.name}
                className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant ambient-shadow"
              >
                <div className="flex items-center gap-1 mb-4 text-primary">
                  {[0, 1, 2, 3, 4].map(i => (
                    <span
                      key={i}
                      className="material-symbols-outlined"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  ))}
                </div>
                <blockquote className="font-body-lg text-body-lg text-on-surface mb-6">
                  "{t.quote}"
                </blockquote>
                <figcaption className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary-fixed rounded-full flex items-center justify-center text-primary font-bold">
                    {t.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-label-lg text-label-lg text-on-surface">{t.name}</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-12 sm:py-20 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/cta-property.jpg')" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-secondary/60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-headline-lg text-2xl sm:text-3xl font-bold text-white mb-4">
            Ready to get started?
          </h2>
          <p className="font-body-lg text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Browse live campaigns or learn how the platform works for your
            property development.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to={browseCreatorsTo}
              className="inline-flex items-center justify-center bg-white text-primary px-8 h-12 rounded-lg font-label-lg text-label-lg hover:bg-white/90 transition-colors"
            >
              Browse Creators
            </Link>
            <Link
              to="/campaigns"
              className="inline-flex items-center justify-center bg-transparent text-white border border-white/60 px-8 h-12 rounded-lg font-label-lg text-label-lg hover:bg-white/10 transition-colors"
            >
              Browse Campaigns
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center bg-transparent text-white border border-white/60 px-8 h-12 rounded-lg font-label-lg text-label-lg hover:bg-white/10 transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
