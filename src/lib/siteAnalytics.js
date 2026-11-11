/**
 * First-party, best-effort site analytics.
 *
 * Every write goes through the record_site_event() RPC (migration 031),
 * which is the only thing with INSERT rights on site_events -- this module
 * never writes to the table directly and never supplies anything beyond an
 * opaque session/visitor id, a path and (optionally) a property id.
 *
 * Analytics must never break the app it's measuring: every call here is
 * fire-and-forget and swallows its own errors.
 */
import { supabase } from './supabase'

const SESSION_KEY = 'ah_session_id'
const VISITOR_KEY = 'ah_visitor_id'

const randomId = () =>
  (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '')

/** Stable per-browser id, persisted across visits. */
const getVisitorId = () => {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = randomId()
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return randomId()
  }
}

/** Per-tab-session id, reset when the tab/browser session ends. */
const getSessionId = () => {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = randomId()
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return randomId()
  }
}

const send = (eventType, { path, propertyId } = {}) => {
  try {
    supabase
      .rpc('record_site_event', {
        p_session_id: getSessionId(),
        p_visitor_id: getVisitorId(),
        p_event_type: eventType,
        p_path: path ?? (typeof window !== 'undefined' ? window.location.pathname : null),
        p_referrer: typeof document !== 'undefined' ? document.referrer || null : null,
        p_property_id: propertyId || null,
      })
      .then(() => {})
      .catch(() => {})
  } catch {
    // Analytics must never throw into the caller.
  }
}

export const recordPageView = (path, propertyId) => send('pageview', { path, propertyId })
export const recordLogin = () => send('login', {})
export const recordSignup = () => send('signup', {})
export const recordOutboundClick = (propertyId, path) => send('outbound_click', { path, propertyId })
