import { describe, expect, it, vi } from 'vitest';

import { RateLimiter, rateLimitMiddleware } from '../rateLimit.js';

/** Controllable clock so these tests never depend on wall time. */
function fakeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

describe('RateLimiter', () => {
  it('allows requests up to the limit and refuses the next one', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ windowMs: 1000, max: 3, now: clock.now });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);

    const blocked = limiter.check('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each key separately', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1, now: fakeClock().now });
    expect(limiter.check('user-1').allowed).toBe(true);
    expect(limiter.check('user-2').allowed).toBe(true);
    expect(limiter.check('user-1').allowed).toBe(false);
  });

  it('starts a fresh window once the old one expires', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ windowMs: 1000, max: 1, now: clock.now });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);

    clock.advance(1001);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reports the remaining allowance', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 3, now: fakeClock().now });
    expect(limiter.check('a').remaining).toBe(2);
    expect(limiter.check('a').remaining).toBe(1);
    expect(limiter.check('a').remaining).toBe(0);
  });

  it('sweeps expired buckets so the map does not grow without bound', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ windowMs: 1000, max: 5, now: clock.now });

    limiter.check('a');
    limiter.check('b');
    expect(limiter.buckets.size).toBe(2);

    clock.advance(1001);
    limiter.sweep();
    expect(limiter.buckets.size).toBe(0);
  });
});

describe('rateLimitMiddleware', () => {
  function mockRes() {
    return {
      statusCode: null,
      body: null,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
  }

  it('passes the request through while under the limit', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 2, now: fakeClock().now });
    const middleware = rateLimitMiddleware([
      { limiter, scope: 'ip', keyFor: (req) => req.ip },
    ]);

    const next = vi.fn();
    middleware({ ip: '1.2.3.4' }, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('answers 429 with Retry-After once the limit is passed', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, max: 1, now: fakeClock().now });
    const middleware = rateLimitMiddleware([
      { limiter, scope: 'ip', keyFor: (req) => req.ip },
    ]);

    const next = vi.fn();
    middleware({ ip: '1.2.3.4' }, mockRes(), next);

    const res = mockRes();
    middleware({ ip: '1.2.3.4' }, res, next);

    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips a rule whose key cannot be derived', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 0, now: fakeClock().now });
    const middleware = rateLimitMiddleware([
      { limiter, scope: 'user', keyFor: (req) => req.caller?.id },
    ]);

    const next = vi.fn();
    middleware({}, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('applies every rule, refusing if any one is exceeded', () => {
    const generous = new RateLimiter({ windowMs: 1000, max: 100, now: fakeClock().now });
    const strict = new RateLimiter({ windowMs: 1000, max: 1, now: fakeClock().now });
    const middleware = rateLimitMiddleware([
      { limiter: generous, scope: 'ip', keyFor: (req) => req.ip },
      { limiter: strict, scope: 'user', keyFor: (req) => req.caller.id },
    ]);

    const req = { ip: '1.2.3.4', caller: { id: 'u1' } };
    middleware(req, mockRes(), vi.fn());

    const res = mockRes();
    middleware(req, res, vi.fn());
    expect(res.statusCode).toBe(429);
    expect(res.body.scope).toBe('user');
  });
});
