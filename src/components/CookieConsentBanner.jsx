import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { X, Cookie, Settings as SettingsIcon } from 'lucide-react'

const STORAGE_KEY = 'airhouse:cookie-consent:v1'

const DEFAULT_CHOICES = {
  necessary: true,    // always on
  functional: false,
  analytics: false,
  marketing: false,
}

const loadStored = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const persist = (choices) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...choices,
      necessary: true,
      decidedAt: new Date().toISOString(),
    }))
    window.dispatchEvent(new CustomEvent('airhouse:cookie-consent-changed'))
  } catch { /* storage may be disabled */ }
}

/**
 * Open the cookie preferences modal from anywhere in the app:
 *   import { openCookieSettings } from './CookieConsentBanner'
 *   <button onClick={openCookieSettings}>Cookie Settings</button>
 */
export const openCookieSettings = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('airhouse:open-cookie-settings'))
}

const CookieConsentBanner = () => {
  const [decided, setDecided] = useState(() => !!loadStored())
  const [showModal, setShowModal] = useState(false)
  const [choices, setChoices] = useState(() => loadStored() || DEFAULT_CHOICES)

  // Listen for "open settings" events from the footer link, etc.
  useEffect(() => {
    const open = () => {
      setChoices(loadStored() || DEFAULT_CHOICES)
      setShowModal(true)
    }
    window.addEventListener('airhouse:open-cookie-settings', open)
    return () => window.removeEventListener('airhouse:open-cookie-settings', open)
  }, [])

  const acceptAll = useCallback(() => {
    const all = { necessary: true, functional: true, analytics: true, marketing: true }
    persist(all); setDecided(true); setShowModal(false)
  }, [])

  const rejectNonEssential = useCallback(() => {
    persist(DEFAULT_CHOICES); setDecided(true); setShowModal(false)
  }, [])

  const saveCustom = useCallback(() => {
    persist(choices); setDecided(true); setShowModal(false)
  }, [choices])

  const toggle = (key) => setChoices((c) => ({ ...c, [key]: !c[key] }))

  return (
    <>
      {/* Sticky bottom banner — only until the user has decided */}
      {!decided && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed bottom-0 inset-x-0 z-30 bg-surface-container-lowest border-t border-outline-variant shadow-2xl"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Cookie className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
              <p className="font-body-sm text-body-sm text-on-surface">
                We use cookies that are strictly necessary to run AirHouse, plus optional cookies for
                functionality, analytics and marketing. You can accept all, reject the non-essential ones,
                or pick what you want. See our{' '}
                <Link to="/legal/cookies" className="text-primary underline hover:no-underline">
                  Cookie Policy
                </Link>{' '}
                for details.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-outline text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <SettingsIcon className="w-4 h-4" /> Customise
              </button>
              <button
                type="button"
                onClick={rejectNonEssential}
                className="px-4 h-9 rounded-md border border-outline text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Reject non-essential
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="px-4 h-9 rounded-md bg-secondary text-on-secondary text-label-md hover:opacity-90 transition-colors"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customise modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cookie preferences"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
              <h2 className="font-headline-md text-headline-md text-on-surface">Cookie preferences</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 rounded-md text-on-surface-variant hover:bg-surface-container-low"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 font-body-sm text-body-sm text-on-surface">
              <p className="text-on-surface-variant">
                You can change these any time from the "Cookie Settings" link in the footer.
              </p>

              <CookieToggle
                title="Strictly necessary"
                description="Required for sign-in, your session and basic site security. These cannot be turned off."
                checked={true}
                disabled
              />
              <CookieToggle
                title="Functional"
                description="Remember your preferences (e.g. whether the sidebar is collapsed) for a smoother experience."
                checked={choices.functional}
                onChange={() => toggle('functional')}
              />
              <CookieToggle
                title="Analytics"
                description="Help us understand how the platform is used so we can make it better. Off by default."
                checked={choices.analytics}
                onChange={() => toggle('analytics')}
              />
              <CookieToggle
                title="Marketing"
                description="Used to measure campaign effectiveness and personalise messaging. Off by default."
                checked={choices.marketing}
                onChange={() => toggle('marketing')}
              />
            </div>

            <div className="px-6 py-4 border-t border-outline-variant flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={rejectNonEssential}
                className="px-4 h-9 rounded-md border border-outline text-label-md text-on-surface hover:bg-surface-container-low"
              >
                Reject non-essential
              </button>
              <button
                type="button"
                onClick={saveCustom}
                className="px-4 h-9 rounded-md border border-outline text-label-md text-on-surface hover:bg-surface-container-low"
              >
                Save choices
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="px-4 h-9 rounded-md bg-secondary text-on-secondary text-label-md hover:opacity-90"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const CookieToggle = ({ title, description, checked, disabled, onChange }) => (
  <label className={'flex items-start gap-3 p-3 rounded-lg border border-outline-variant ' + (disabled ? 'bg-surface-container-low' : '')}>
    <input
      type="checkbox"
      checked={!!checked}
      disabled={disabled}
      onChange={onChange}
      className="mt-1 w-4 h-4 accent-primary"
    />
    <span className="flex-1">
      <span className="block font-label-lg text-label-lg text-on-surface">{title}</span>
      <span className="block font-body-sm text-body-sm text-on-surface-variant mt-0.5">{description}</span>
    </span>
  </label>
)

export default CookieConsentBanner
