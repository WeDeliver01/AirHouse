/**
 * Fixed-window rate limiter.
 *
 * NOTE (AH-004): this counter lives in the memory of a single process. It
 * stops casual abuse from one caller but does NOT hold across multiple
 * instances or restarts. Before horizontal scaling, move this to a shared
 * store (Redis, or a Postgres table with an atomic upsert). Tracked in
 * docs/RISK_REGISTER.md.
 */

export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} options.windowMs    Length of the counting window.
   * @param {number} options.max         Allowed requests per key per window.
   * @param {() => number} [options.now] Clock, injectable for tests.
   */
  constructor({ windowMs, max, now = () => Date.now() }) {
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
    /** @type {Map<string, {count: number, resetAt: number}>} */
    this.buckets = new Map();
  }

  /**
   * Record a hit for `key`.
   * @returns {{allowed: boolean, remaining: number, retryAfterSeconds: number}}
   */
  check(key) {
    const now = this.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1, retryAfterSeconds: 0 };
    }

    existing.count += 1;

    if (existing.count > this.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    return {
      allowed: true,
      remaining: this.max - existing.count,
      retryAfterSeconds: 0,
    };
  }

  /** Drop expired buckets so the map does not grow without bound. */
  sweep() {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Express middleware applying one or more limiters. Each entry supplies a
 * limiter and a function deriving its key from the request; a request must
 * pass every limiter.
 */
export function rateLimitMiddleware(rules) {
  return (req, res, next) => {
    for (const { limiter, keyFor, scope } of rules) {
      const key = keyFor(req);
      if (!key) continue;

      const result = limiter.check(`${scope}:${key}`);
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please slow down.',
          scope,
          requestId: req.requestId,
        });
      }
    }
    return next();
  };
}
