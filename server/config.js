/**
 * Server configuration and startup validation.
 *
 * The platform must fail fast and loudly when required production
 * configuration is missing, rather than silently degrading into a mode
 * that appears to work. See docs/SECURITY_AUDIT.md (AH-006).
 */

const isProduction = process.env.NODE_ENV === 'production';

/** Parse a comma-separated env var into a trimmed, non-empty array. */
function parseList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  isProduction,
  port: parseInteger(process.env.PORT, isProduction ? 5000 : 3001),

  // Supabase — used to verify caller identity and authorize recipients.
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Email delivery.
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || '',

  // CORS: explicit allowlist. Never wildcard in production.
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),

  // Abuse controls.
  rateLimitWindowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMaxPerUser: parseInteger(process.env.RATE_LIMIT_MAX_PER_USER, 20),
  rateLimitMaxPerIp: parseInteger(process.env.RATE_LIMIT_MAX_PER_IP, 60),
  rateLimitMaxPublicLead: parseInteger(process.env.RATE_LIMIT_MAX_PUBLIC_LEAD, 5),
  maxBatchSize: parseInteger(process.env.MAX_BATCH_SIZE, 50),
  maxRequestBodyBytes: process.env.MAX_REQUEST_BODY || '64kb',

  // Addresses the platform may always email even if they are not platform
  // users (e.g. the support inbox that receives contact-form messages).
  supportInboxes: parseList(process.env.SUPPORT_INBOX_EMAILS),

  appUrl: process.env.APP_URL || 'https://airhouse.co.za',

  // On-the-fly image transform (/img). Defaults to the container's tmpfs so
  // it works with no configuration; set it to a mounted volume in production
  // so resized variants survive a redeploy instead of being regenerated for
  // every visitor after every deploy.
  imgCacheDir: process.env.IMG_CACHE_DIR || '',

  /**
   * Which upstream proxies may be believed about the client's address.
   *
   * The container listens on 127.0.0.1 and Nginx is the only thing in front
   * of it, so the single trusted hop is loopback. Express then walks
   * X-Forwarded-For from the right, skipping trusted addresses, and Nginx's
   * `$proxy_add_x_forwarded_for` always appends the true peer last -- so a
   * client that sends its own X-Forwarded-For cannot shift the answer.
   *
   * Do NOT set this to `true`. That takes the left-most entry, which is
   * whatever the caller put there, and hands every request a rate-limit
   * bucket of its own choosing.
   *
   * Override only when another proxy is genuinely in front of Nginx -- a CDN,
   * for example -- in which case this must name that proxy's addresses, since
   * $remote_addr will then be the CDN's edge rather than the visitor.
   */
  trustProxy: process.env.TRUST_PROXY || 'loopback',
};

/**
 * Secrets and settings without which the server must not serve traffic in
 * production. In development we warn instead, so local work is not blocked.
 */
const REQUIRED_IN_PRODUCTION = [
  ['SUPABASE_URL', config.supabaseUrl],
  ['SUPABASE_ANON_KEY', config.supabaseAnonKey],
  ['SUPABASE_SERVICE_ROLE_KEY', config.supabaseServiceRoleKey],
  ['RESEND_API_KEY', config.resendApiKey],
  ['ALLOWED_ORIGINS', config.allowedOrigins.length ? 'set' : ''],
];

/**
 * Returns the names of required settings that are missing.
 * Exported separately from the throwing variant so it can be unit tested.
 */
export function missingProductionConfig(entries = REQUIRED_IN_PRODUCTION) {
  return entries.filter(([, value]) => !value).map(([name]) => name);
}

/**
 * Validate configuration at startup. Throws in production so the process
 * never comes up half-configured; warns otherwise.
 */
export function validateConfig({ production = isProduction, log = console } = {}) {
  const missing = missingProductionConfig();

  if (missing.length === 0) return { ok: true, missing: [] };

  const message =
    `Missing required configuration: ${missing.join(', ')}. ` +
    'Set these in the hosting provider\'s secret manager.';

  if (production) {
    throw new Error(message);
  }

  log.warn(`[config] ${message} Continuing in non-production mode.`);
  return { ok: false, missing };
}

export default config;
