/**
 * Error monitoring and structured client logging.
 *
 * Wraps Sentry so the rest of the application does not depend on it
 * directly: if no DSN is configured the module degrades to console logging
 * and everything still works. That matters because monitoring must never be
 * the reason a page fails to load.
 *
 * Nothing here may carry personal data. Logs are read by engineers during
 * incidents, often in a third-party tool, so email addresses, phone numbers,
 * identity documents, lead details and access tokens stay out.
 */

const DSN = import.meta.env?.VITE_SENTRY_DSN || ''
const ENVIRONMENT = import.meta.env?.VITE_ENVIRONMENT || import.meta.env?.MODE || 'development'
const RELEASE = import.meta.env?.VITE_RELEASE || 'dev'

let client = null
let initialised = false

/** Keys whose values must never leave the browser in a log or error report. */
const SENSITIVE_KEYS = [
  'password', 'token', 'access_token', 'refresh_token', 'apikey', 'api_key',
  'authorization', 'secret', 'id_number', 'account_number', 'branch_code',
  'lead_email', 'lead_phone', 'lead_name', 'email', 'phone',
]

/**
 * Strip values that should not be transmitted. Keys are kept so a reader can
 * still see the shape of what happened.
 */
export function redact(value, depth = 0) {
  if (depth > 4 || value == null) return value
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1))
  if (typeof value !== 'object') return value

  const output = {}
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      output[key] = '[redacted]'
    } else {
      output[key] = redact(entry, depth + 1)
    }
  }
  return output
}

/**
 * Start monitoring. Safe to call when no DSN is set, and safe to call twice.
 * Sentry is imported lazily so it is not pulled into the main bundle when it
 * is not configured.
 */
export async function initMonitoring() {
  if (initialised) return client
  initialised = true

  if (!DSN) {
    if (ENVIRONMENT === 'production') {
      // Worth saying out loud: a production deployment with no error
      // reporting is operating blind.
      console.warn('[monitoring] No VITE_SENTRY_DSN configured; errors are not being reported.')
    }
    return null
  }

  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn: DSN,
      environment: ENVIRONMENT,
      release: RELEASE,
      // Sample rather than send everything; raise deliberately when chasing
      // a specific problem.
      tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request?.cookies) delete event.request.cookies
        if (event.request?.headers) delete event.request.headers
        if (event.extra) event.extra = redact(event.extra)
        return event
      },
    })
    client = Sentry
    return client
  } catch (error) {
    console.warn('[monitoring] Could not start error reporting:', error.message)
    return null
  }
}

/**
 * Associate subsequent events with a user, by id only.
 * The id is an opaque UUID; the email address is not sent.
 */
export function identify(userId, role) {
  if (!client || !userId) return
  client.setUser({ id: userId, role })
}

export function clearIdentity() {
  if (!client) return
  client.setUser(null)
}

/** Report an error, with redacted context. */
export function captureError(error, context = {}) {
  const safeContext = redact(context)

  if (client) {
    client.captureException(error, { extra: safeContext })
  }

  console.error(
    JSON.stringify({
      level: 'error',
      msg: error?.message || String(error),
      ...safeContext,
      ts: new Date().toISOString(),
    }),
  )
}

/** Record a non-error event worth seeing in a timeline. */
export function captureEvent(message, context = {}) {
  const safeContext = redact(context)

  if (client) {
    client.addBreadcrumb({ message, data: safeContext, level: 'info' })
  }

  if (ENVIRONMENT !== 'production') {
    console.log(JSON.stringify({ level: 'info', msg: message, ...safeContext }))
  }
}

export const monitoringConfig = { DSN: Boolean(DSN), ENVIRONMENT, RELEASE }

export default { initMonitoring, identify, clearIdentity, captureError, captureEvent, redact }
