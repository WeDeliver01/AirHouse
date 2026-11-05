import { afterEach, describe, expect, it, vi } from 'vitest';

import { bearerToken, isAuthorizedRecipient, requireAuth } from '../auth.js';
import { config } from '../config.js';

function mockRes() {
  return {
    statusCode: null,
    body: null,
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

describe('bearerToken', () => {
  it('extracts a bearer token', () => {
    expect(bearerToken({ headers: { authorization: 'Bearer abc.def.ghi' } })).toBe('abc.def.ghi');
  });

  it('is case insensitive on the scheme', () => {
    expect(bearerToken({ headers: { authorization: 'bearer tok' } })).toBe('tok');
  });

  it('returns null when the header is absent or another scheme', () => {
    expect(bearerToken({ headers: {} })).toBeNull();
    expect(bearerToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
    expect(bearerToken({})).toBeNull();
  });
});

describe('requireAuth', () => {
  it('refuses a request with no token', async () => {
    const middleware = requireAuth({ verifyToken: async () => null });
    const res = mockRes();
    const next = vi.fn();

    await middleware({ headers: {}, requestId: 'r1' }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a token the verifier rejects', async () => {
    const middleware = requireAuth({ verifyToken: async () => null });
    const res = mockRes();
    const next = vi.fn();

    await middleware({ headers: { authorization: 'Bearer bad' }, requestId: 'r1' }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the caller and continues on a valid token', async () => {
    const caller = { id: 'user-1', email: 'user@example.com' };
    const middleware = requireAuth({ verifyToken: async () => caller });
    const req = { headers: { authorization: 'Bearer good' }, requestId: 'r1' };
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(req.caller).toEqual(caller);
    expect(next).toHaveBeenCalledOnce();
  });

  it('answers 401 rather than propagating a verifier failure', async () => {
    const middleware = requireAuth({
      verifyToken: async () => {
        throw new Error('network down');
      },
    });
    const res = mockRes();
    const next = vi.fn();

    await middleware({ headers: { authorization: 'Bearer x' }, requestId: 'r1' }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('isAuthorizedRecipient', () => {
  const caller = { id: 'u1', email: 'caller@example.com' };
  const noProfiles = async () => false;

  afterEach(() => {
    config.supportInboxes = [];
  });

  it('allows the caller to email themselves', async () => {
    expect(await isAuthorizedRecipient('caller@example.com', caller, { lookup: noProfiles })).toBe(
      true,
    );
  });

  it('matches the caller address case-insensitively', async () => {
    expect(await isAuthorizedRecipient('CALLER@EXAMPLE.COM', caller, { lookup: noProfiles })).toBe(
      true,
    );
  });

  it('allows a configured support inbox', async () => {
    config.supportInboxes = ['support@airhouse.co.za'];
    expect(
      await isAuthorizedRecipient('support@airhouse.co.za', caller, { lookup: noProfiles }),
    ).toBe(true);
  });

  it('allows an address belonging to a registered profile', async () => {
    const lookup = async (email) => email === 'creator@example.com';
    expect(await isAuthorizedRecipient('creator@example.com', caller, { lookup })).toBe(true);
  });

  it('refuses an address that is not a platform user -- this is what closes the open relay', async () => {
    expect(await isAuthorizedRecipient('victim@elsewhere.com', caller, { lookup: noProfiles })).toBe(
      false,
    );
  });

  it('refuses malformed input', async () => {
    expect(await isAuthorizedRecipient('not-an-email', caller, { lookup: noProfiles })).toBe(false);
    expect(await isAuthorizedRecipient('', caller, { lookup: noProfiles })).toBe(false);
    expect(await isAuthorizedRecipient(null, caller, { lookup: noProfiles })).toBe(false);
  });
});
