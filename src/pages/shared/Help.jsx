import { useState, useMemo } from 'react'
import { cn } from '../../lib/utils'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { notify } from '../../lib/notifications'
import { useAuth } from '../../context/AuthContext'
import helpContent from '../../data/helpContent.json'
import ContactCard from '../../components/ContactCard'
import { COMPANY } from '../../data/companyInfo'

const SUPPORT_EMAIL = COMPANY.email.support

const CATEGORIES = helpContent.categories
const ARTICLES = helpContent.articles

const Help = () => {
  const { user, profile } = useAuth()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [openArticleId, setOpenArticleId] = useState(null)
  const [form, setForm] = useState({
    name: profile?.full_name || '',
    email: user?.email || '',
    category: '',
    subject: '',
    body: '',
  })
  const [sending, setSending] = useState(false)
  const [submitted, setSubmitted] = useState(null)

  // Filter articles by viewer role first so developer-only articles
  // (e.g. "How the AirHouse 2.7% transaction fee works") never reach creators.
  const audienceArticles = useMemo(() => {
    const role = profile?.role
    return ARTICLES.filter((a) => !a.audience || a.audience === role)
  }, [profile?.role])

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return audienceArticles.filter((a) => {
      if (activeCategory && a.category !== activeCategory) return false
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q)
      )
    })
  }, [search, activeCategory, audienceArticles])

  const handleContact = async (e) => {
    e.preventDefault()
    const subject = form.subject.trim()
    const body = form.body.trim()
    const email = form.email.trim()

    if (!subject || !body) {
      toast.error('Please add a subject and message.')
      return
    }
    if (!email) {
      toast.error('We need an email so we can reply.')
      return
    }

    if (!user?.id) {
      toast.error('Please sign in to send a message.')
      return
    }

    setSending(true)
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: user.id,
          name: form.name.trim() || null,
          email,
          subject,
          body,
          category: form.category || null,
          source_url: typeof window !== 'undefined' ? window.location.href : null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        })
        .select('id')
        .single()

      if (error) throw error

      const ticketId = data?.id

      // Fire-and-forget notifications. Failures here don't block the ticket.
      notify
        .supportInquiry(SUPPORT_EMAIL, {
          name: form.name.trim(),
          email,
          subject,
          body,
          category: form.category || null,
          sourceUrl: typeof window !== 'undefined' ? window.location.href : null,
          ticketId,
        })
        .catch(() => {})

      notify
        .supportReceived(email, {
          name: form.name.trim(),
          subject,
          ticketId,
        })
        .catch(() => {})

      setSubmitted({ ticketId, email })
      setForm({
        name: profile?.full_name || '',
        email: user?.email || '',
        category: '',
        subject: '',
        body: '',
      })
      toast.success("Message sent — we'll be in touch.")
    } catch (err) {
      console.error('Support submission failed:', err)
      toast.error("Couldn't send your message. Please email us directly instead.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-md">
      {/* Hero search */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md md:p-lg">
        <div className="max-w-3xl mx-auto text-center">
          <span className="material-symbols-outlined text-[40px] text-primary mb-2">help</span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">How can we help?</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            Search the knowledge base or browse a category to find answers.
          </p>
          <div className="relative mt-md">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[22px]">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles, e.g. payouts, escrow, disputes…"
              className="w-full pl-12 pr-4 py-3 bg-surface-container border border-outline-variant rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
        </div>
      </section>

      {/* Categories grid */}
      <section>
        <div className="flex items-baseline justify-between mb-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface">Browse by category</h2>
          {activeCategory && (
            <button
              onClick={() => setActiveCategory(null)}
              className="font-label-md text-label-md text-primary hover:text-on-primary-container"
            >
              Clear filter ×
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-base">
          {CATEGORIES.map((c) => {
            const active = activeCategory === c.id
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(active ? null : c.id)}
                className={cn(
                  'text-left bg-surface-container-lowest border rounded-xl p-md flex flex-col gap-sm transition-all group',
                  active
                    ? 'border-primary shadow-[0_4px_16px_rgba(56,103,90,0.16)]'
                    : 'border-outline-variant hover:border-primary hover:shadow-sm'
                )}
              >
                <div className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
                  active ? 'bg-primary-container' : 'bg-surface-container group-hover:bg-primary-container'
                )}>
                  <span className={cn(
                    'material-symbols-outlined text-[28px] transition-colors',
                    active ? 'text-on-primary-container' : 'text-primary group-hover:text-on-primary-container'
                  )}>
                    {c.icon}
                  </span>
                </div>
                <h3 className="font-label-lg text-label-lg text-on-surface">{c.title}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{c.description}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Articles + contact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        <section className="lg:col-span-2">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md h-full">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-md">
              {activeCategory
                ? CATEGORIES.find((c) => c.id === activeCategory)?.title
                : search ? 'Search results' : 'Popular articles'}
            </h2>

            {filteredArticles.length === 0 ? (
              <div className="text-center py-lg">
                <span className="material-symbols-outlined text-[40px] text-outline">search_off</span>
                <p className="mt-sm font-body-md text-on-surface-variant">
                  No articles match your search.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {filteredArticles.map((a) => {
                  const open = openArticleId === a.id
                  return (
                    <li key={a.id} className="border-b border-outline-variant last:border-0">
                      <button
                        onClick={() => setOpenArticleId(open ? null : a.id)}
                        className="w-full flex items-center justify-between py-sm hover:bg-surface-container-low transition-colors rounded px-2 -mx-2 text-left"
                      >
                        <div className="flex items-center gap-sm min-w-0">
                          <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0">article</span>
                          <span className="font-body-md text-body-md text-on-surface truncate">{a.title}</span>
                        </div>
                        <span className={cn(
                          'material-symbols-outlined text-on-surface-variant text-[20px] transition-transform flex-shrink-0',
                          open ? 'rotate-90' : ''
                        )}>
                          chevron_right
                        </span>
                      </button>
                      {open && (
                        <div className="px-2 pb-md font-body-sm text-body-sm text-on-surface-variant pl-9 pr-2 leading-relaxed whitespace-pre-line">
                          {a.body}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-1">
          <div className="bg-surface-container border border-outline-variant rounded-xl p-md h-full flex flex-col">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-sm">Still need help?</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-md">
              Send our team a message. We'll log it as a ticket and reply by email, usually within one business day.
            </p>

            <div className="mb-md">
              <ContactCard />
            </div>

            {submitted ? (
              <div className="flex flex-col items-start gap-sm bg-surface-container-lowest border border-outline-variant rounded-lg p-md">
                <span className="material-symbols-outlined text-primary text-[32px]">mark_email_read</span>
                <h3 className="font-label-lg text-label-lg text-on-surface">Message received</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Thanks — we sent a confirmation to <strong>{submitted.email}</strong>.
                  {submitted.ticketId && (
                    <>
                      {' '}Your reference is <span className="font-mono text-body-sm">{String(submitted.ticketId).slice(0, 8)}</span>.
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(null)}
                  className="mt-sm font-label-md text-label-md text-primary hover:text-on-primary-container"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleContact} className="flex flex-col gap-sm flex-grow">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name"
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Email"
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">What is this about? (optional)</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                  <option value="other">Something else</option>
                </select>
                <input
                  type="text"
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Subject"
                  maxLength={200}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
                <textarea
                  required
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Tell us what's going on. Please include any campaign or ticket references."
                  rows={5}
                  maxLength={5000}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-sm bg-primary text-on-primary font-label-lg text-label-lg py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">send</span>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="w-full text-center font-label-md text-label-md text-primary hover:text-on-primary-container py-1"
                >
                  Or email {SUPPORT_EMAIL}
                </a>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Help
