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
          <span className="inline-block font-label-md text-label-md text-primary uppercase tracking-wider px-3 py-1 rounded-full bg-primary-fixed mb-4">
            Built for property
          </span>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-3">
            A simple, transparent process that delivers measurable results
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Built specifically for property marketing, not generic influencer collaborations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* For Developers — large */}
          <div className="md:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-8 ambient-shadow flex flex-col justify-between">
            <div className="mb-6">
              <div className="w-12 h-12 bg-primary-fixed rounded-lg flex items-center justify-center text-primary mb-6">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  domain
                </span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Property Developers</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Market apartments and developments through creator-led content,
                with full visibility into campaign performance and lead generation.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-outline-variant pt-6">
              <div>
                <span className="material-symbols-outlined text-on-surface-variant mb-2 block">payments</span>
                <div className="font-label-lg text-label-lg text-on-surface">Track cost per lead</div>
              </div>
              <div>
                <span className="material-symbols-outlined text-on-surface-variant mb-2 block">group_search</span>
                <div className="font-label-lg text-label-lg text-on-surface">Browse vetted creators</div>
              </div>
              <div>
                <span className="material-symbols-outlined text-on-surface-variant mb-2 block">campaign</span>
                <div className="font-label-lg text-label-lg text-on-surface">Manage campaigns in one place</div>
              </div>
            </div>
            <Link
              to="/register?role=developer"
              className="mt-6 self-start inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-5 h-11 rounded-lg font-label-lg text-label-lg hover:bg-secondary-fixed transition-colors"
            >
              Get Started as Developer
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>

          {/* Stat block */}
          <div className="md:col-span-4 bg-primary text-on-primary rounded-xl p-8 flex flex-col justify-center relative overflow-hidden">
            <div className="relative z-10">
              <div className="font-label-md text-label-md uppercase tracking-wider opacity-70 mb-2">
                Real performance
              </div>
              <div className="font-headline-xl text-4xl font-bold mb-3">Real leads.</div>
              <div className="font-body-md text-body-md opacity-80">
                Developers track real enquiries and cost per lead — not likes,
                comments, or follower counts.
              </div>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <span className="material-symbols-outlined" style={{ fontSize: '120px' }}>real_estate_agent</span>
            </div>
          </div>

          {/* For Creators — medium */}
          <div className="md:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-8 ambient-shadow">
            <div className="w-12 h-12 bg-secondary-container rounded-lg flex items-center justify-center text-on-secondary-container mb-6">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                video_camera_front
              </span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Content Creators</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6">
              Work on serious, paid campaigns with clear expectations,
              professional briefs, and structured delivery.
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
              className="inline-flex items-center justify-center border border-outline text-on-surface px-5 h-11 rounded-lg font-label-lg text-label-lg hover:bg-surface-container-low transition-colors"
            >
              Join as Creator
            </Link>
          </div>

          {/* How it works — wide */}
          <div className="md:col-span-7 bg-surface-container border border-outline-variant rounded-xl overflow-hidden relative min-h-[320px] flex flex-col">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-25"
              style={{ backgroundImage: "url('/images/how-it-works-bg.jpg')" }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-surface-container via-surface-container/80 to-transparent" />
            <div className="relative p-8 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-1">How it works</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  A simple, transparent process from campaign brief to qualified lead.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                {[
                  { num: 1, icon: 'campaign',     title: 'Create a campaign', body: 'Define brief, budget, and audience.' },
                  { num: 2, icon: 'group',        title: 'Match with a creator', body: 'Assign one creator per campaign.' },
                  { num: 3, icon: 'trending_up',  title: 'Generate leads',    body: 'Capture real enquiries via tracked links.' },
                ].map(step => (
                  <div
                    key={step.num}
                    className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4 ambient-shadow relative"
                  >
                    <div className="absolute -top-2.5 left-3 w-6 h-6 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xs">
                      {step.num}
                    </div>
                    <span className="material-symbols-outlined text-primary text-[22px] mt-1 mb-2 block">
                      {step.icon}
                    </span>
                    <div className="font-label-lg text-label-lg text-on-surface mb-1">{step.title}</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">{step.body}</div>
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
