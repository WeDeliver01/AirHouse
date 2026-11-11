import { Link } from 'react-router-dom'

const Home = () => {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden min-h-[500px] sm:min-h-[600px] flex items-center">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-hero-property"
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
              Turn social media attention into
              <span className="text-secondary-fixed"> property leads</span>.
            </h1>

            <p className="mt-4 sm:mt-6 font-body-lg text-base sm:text-lg text-white/80 leading-relaxed">
              List your getaway stays, apartments, houses, or developments
              and get a shareable page for every listing — then grow reach
              through social media or a full marketing campaign.
            </p>

            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link
                to="/register?role=developer"
                className="inline-flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-6 h-12 rounded-lg font-label-lg text-label-lg hover:bg-secondary-fixed transition-colors w-full sm:w-auto"
              >
                List Your Property
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </Link>
            </div>

            <div className="mt-8 sm:mt-12 flex flex-wrap items-center gap-4 sm:gap-8 font-label-md text-label-md text-white/70">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[20px]">check_circle</span>
                <span>Verified Listings</span>
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
            From weekend getaways and serviced apartments to full houses and
            developments — AirHouse helps you market every listing and turn
            attention into real enquiries and bookings, not vanity metrics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* For Developers — large */}
          <div className="md:col-span-8 bg-surface-container-low rounded-[28px] p-8 flex flex-col justify-between">
            <div className="mb-6">
              <span className="font-label-md text-label-md text-primary uppercase tracking-wider">01 · Hosts & Developers</span>
              <h3 className="font-headline-md text-headline-md text-on-surface mt-2 mb-2">
                List getaways, apartments, homes & developments
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Every listing gets its own shareable page the moment it goes
                live. Promote it on social media, or layer on a structured
                marketing campaign when you want extra reach — with full
                visibility into performance and lead generation either way.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-outline-variant/60">
              <div>
                <span className="material-symbols-outlined text-primary mb-2 block">payments</span>
                <div className="font-label-lg text-label-lg text-on-surface">Track cost per lead</div>
              </div>
              <div>
                <span className="material-symbols-outlined text-primary mb-2 block">home_work</span>
                <div className="font-label-lg text-label-lg text-on-surface">List unlimited properties</div>
              </div>
              <div>
                <span className="material-symbols-outlined text-primary mb-2 block">link</span>
                <div className="font-label-lg text-label-lg text-on-surface">A shareable link for every listing</div>
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

          {/* How it works — full width */}
          <div className="md:col-span-12 rounded-[28px] overflow-hidden relative min-h-[320px] flex flex-col">
            <div
              className="absolute inset-0 bg-cover bg-center bg-how-it-works"
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-t from-on-surface/90 via-on-surface/50 to-on-surface/10" />
            <div className="relative p-8 flex-1 flex flex-col justify-end text-white">
              <h3 className="font-headline-md text-headline-md mb-1">How it works</h3>
              <p className="font-body-sm text-body-sm text-white/70 mb-6">
                A simple, transparent process from listing to qualified lead.
              </p>

              <div className="flex flex-col sm:flex-row gap-0 sm:gap-6">
                {[
                  { num: '01', icon: 'home_work',   title: 'Add your listing',     body: 'Getaway, apartment, house, or development — list it in minutes.' },
                  { num: '02', icon: 'palette',      title: 'Go live instantly', body: 'Get a shareable page, then promote it via social media or a campaign.' },
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

      {/* CTA */}
      <section className="relative py-12 sm:py-20 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-cta-property"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-secondary/60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-headline-lg text-2xl sm:text-3xl font-bold text-white mb-4">
            Ready to get started?
          </h2>
          <p className="font-body-lg text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Browse what's listed on the platform or learn how AirHouse works
            for your stays and homes.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/properties"
              className="inline-flex items-center justify-center bg-white text-primary px-8 h-12 rounded-lg font-label-lg text-label-lg hover:bg-white/90 transition-colors"
            >
              Browse Properties
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
