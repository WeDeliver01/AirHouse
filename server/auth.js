/**
 * Caller authentication and recipient authorization for the notification
 * service.
 *
 * Before this module existed the notification endpoints were unauthenticated
 * and accepted an arbitrary `to` address, which made the service usable as an
 * open email relay against AirHouse's own sending reputation (AH-004).
 *
 * Two independent controls are applied:
 *   1. The caller must present a valid Supabase access token.
 *   2. The recipient must be a platform participant, the caller themselves,
 *      or a configured support inbox.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

/** Simple TTL cache so repeated calls do not hit Supabase on every request. */
class TtlCache {
  constructor(ttlMs, now = () => Date.now()) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}

let anonClient = null;
let serviceClient = null;

function getAnonClient() {
  if (!anonClient) {
    anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

function getServiceClient() {
  if (!serviceClient) {
    if (!config.supabaseServiceRoleKey) return null;
    serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

/** Extract a bearer token from the Authorization header. */
export function bearerToken(req) {
  const header = req.headers?.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

const userCache = new TtlCache(30_000);

/**
 * Express middleware. Rejects the request unless it carries a valid Supabase
 * access token; on success attaches `req.caller = { id, email }`.
 */
export function requireAuth({ verifyToken = defaultVerifyToken } = {}) {
  return async (req, res, next) => {
    const token = bearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
        requestId: req.requestId,
      });
    }

    try {
      const caller = await verifyToken(token);
      if (!caller) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired session.',
          requestId: req.requestId,
        });
      }
      req.caller = caller;
      return next();
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'token_verification_failed',
          requestId: req.requestId,
          error: error.message,
        }),
      );
      return res.status(401).json({
        success: false,
        error: 'Could not verify session.',
        requestId: req.requestId,
      });
    }
  };
}

/** Verify a Supabase access token and return the caller identity. */
async function defaultVerifyToken(token) {
  const cached = userCache.get(token);
  if (cached) return cached;

  const { data, error } = await getAnonClient().auth.getUser(token);
  if (error || !data?.user) return null;

  const caller = { id: data.user.id, email: data.user.email || null };
  userCache.set(token, caller);
  return caller;
}

const recipientCache = new TtlCache(60_000);

/**
 * Decide whether `email` may be sent to on behalf of `caller`.
 *
 * Allowed when the address is the caller's own, a configured support inbox,
 * or belongs to a registered profile. Anything else is refused, which is what
 * prevents the endpoint being used to mail the general public.
 */
export async function isAuthorizedRecipient(email, caller, { lookup = defaultProfileLookup } = {}) {
  if (typeof email !== 'string' || !email.includes('@')) return false;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  if (caller?.email && normalized === caller.email.trim().toLowerCase()) return true;
  if (config.supportInboxes.some((inbox) => inbox.toLowerCase() === normalized)) return true;

  const cached = recipientCache.get(normalized);
  if (cached !== undefined) return cached;

  const exists = await lookup(normalized);
  recipientCache.set(normalized, exists);
  return exists;
}

/** Look up whether an email belongs to a registered profile. */
async function defaultProfileLookup(email) {
  const client = getServiceClient();

  // Fail closed: without a service-role key we cannot confirm the recipient
  // is a platform user, so we refuse rather than guess.
  if (!client) return false;

  const { data, error } = await client
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({ level: 'error', msg: 'recipient_lookup_failed', error: error.message }),
    );
    return false;
  }

  return Boolean(data);
}

export const __testing = { TtlCache };
