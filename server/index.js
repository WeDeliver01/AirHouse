import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import cors from 'cors';
import express from 'express';

import { config, validateConfig } from './config.js';
import { isAuthorizedRecipient, requireAuth } from './auth.js';
import { RateLimiter, rateLimitMiddleware } from './rateLimit.js';
import { validateBatch, validateNotification } from './validation.js';
import { isUuid, resolveLeadNotification } from './leads.js';
import { EMAIL_TYPES, sendNotification, verifyEmailTransport } from './email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Refuse to start in production without the secrets this service needs.
validateConfig();

const app = express();

app.disable('x-powered-by');

/**
 * Believe the reverse proxy about who the client is.
 *
 * Without this, Express reports the socket's peer -- which behind Nginx is
 * always 127.0.0.1. Both IP rate limiters keyed on `req.ip`, so every visitor
 * on the internet shared one bucket: the public lead endpoint's budget of a
 * handful of submissions a minute was the budget for the entire platform, and
 * one noisy source locked out every genuine enquiry. `req.secure` was false
 * on HTTPS for the same reason.
 *
 * See config.trustProxy for why this is the loopback hop and not `true`.
 */
app.set('trust proxy', config.trustProxy);

/** Attach a correlation id so a request can be traced across logs. */
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

/**
 * CORS: explicit allowlist rather than the previous wildcard. Requests with
 * no Origin header (server-to-server, health probes) are permitted; browser
 * origins must be listed in ALLOWED_ORIGINS.
 */
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  }),
);

app.use(express.json({ limit: config.maxRequestBodyBytes }));

const perUserLimiter = new RateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxPerUser,
});
const perIpLimiter = new RateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxPerIp,
});
// The public lead endpoint gets a tighter budget than authenticated traffic.
const publicLeadLimiter = new RateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxPublicLead,
});

setInterval(() => {
  perUserLimiter.sweep();
  perIpLimiter.sweep();
  publicLeadLimiter.sweep();
}, config.rateLimitWindowMs).unref?.();

const notificationLimits = rateLimitMiddleware([
  { limiter: perIpLimiter, scope: 'ip', keyFor: (req) => req.ip },
  { limiter: perUserLimiter, scope: 'user', keyFor: (req) => req.caller?.id },
]);

/** Structured log line; never includes template data or recipient content. */
function logEvent(level, msg, fields = {}) {
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

const authenticate = requireAuth();

app.post(
  '/api/notifications/send',
  authenticate,
  notificationLimits,
  async (req, res) => {
    const result = validateNotification(req.body, EMAIL_TYPES);

    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error, requestId: req.requestId });
    }

    const { type, to, data } = result.value;

    const permitted = await isAuthorizedRecipient(to, req.caller);
    if (!permitted) {
      logEvent('warn', 'recipient_rejected', {
        requestId: req.requestId,
        callerId: req.caller.id,
        type,
      });
      return res.status(403).json({
        success: false,
        error: 'Recipient is not a platform user.',
        requestId: req.requestId,
      });
    }

    try {
      const sent = await sendNotification(type, to, data);
      logEvent(sent.success ? 'info' : 'warn', 'notification_dispatched', {
        requestId: req.requestId,
        callerId: req.caller.id,
        type,
        success: sent.success,
      });
      return res.json({ ...sent, requestId: req.requestId });
    } catch (error) {
      logEvent('error', 'notification_failed', {
        requestId: req.requestId,
        callerId: req.caller.id,
        type,
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to send notification.',
        requestId: req.requestId,
      });
    }
  },
);

app.post(
  '/api/notifications/batch',
  authenticate,
  notificationLimits,
  async (req, res) => {
    const result = validateBatch(req.body, EMAIL_TYPES, config.maxBatchSize);

    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error, requestId: req.requestId });
    }

    const notifications = result.value;

    // A batch counts against the caller's quota per message, not per request,
    // so batching cannot be used to bypass the rate limit.
    for (let i = 1; i < notifications.length; i += 1) {
      const check = perUserLimiter.check(`user:${req.caller.id}`);
      if (!check.allowed) {
        res.setHeader('Retry-After', String(check.retryAfterSeconds));
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded for this batch.',
          requestId: req.requestId,
        });
      }
    }

    const permissions = await Promise.all(
      notifications.map((entry) => isAuthorizedRecipient(entry.to, req.caller)),
    );

    const rejectedCount = permissions.filter((allowed) => !allowed).length;
    if (rejectedCount > 0) {
      logEvent('warn', 'batch_recipients_rejected', {
        requestId: req.requestId,
        callerId: req.caller.id,
        rejectedCount,
      });
      return res.status(403).json({
        success: false,
        error: `${rejectedCount} recipient(s) are not platform users.`,
        requestId: req.requestId,
      });
    }

    const settled = await Promise.allSettled(
      notifications.map(({ type, to, data }) => sendNotification(type, to, data)),
    );

    logEvent('info', 'batch_dispatched', {
      requestId: req.requestId,
      callerId: req.caller.id,
      count: notifications.length,
    });

    return res.json({
      success: true,
      requestId: req.requestId,
      results: settled.map((entry, index) => ({
        type: notifications[index].type,
        ...(entry.status === 'fulfilled'
          ? entry.value
          : { success: false, error: 'Delivery failed.' }),
      })),
    });
  },
);

/**
 * Public endpoint used only by the lead-capture page. It accepts a lead id
 * and nothing else: the recipient and the email body are derived server-side
 * from the stored lead, so an anonymous caller cannot choose either.
 */
const leadNotificationLimits = rateLimitMiddleware([
  { limiter: publicLeadLimiter, scope: 'lead-ip', keyFor: (req) => req.ip },
]);

app.post('/api/notifications/lead', leadNotificationLimits, async (req, res) => {
  const leadId = req.body?.leadId;

  if (!isUuid(leadId)) {
    return res.status(400).json({
      success: false,
      error: 'Field "leadId" must be a valid id.',
      requestId: req.requestId,
    });
  }

  try {
    const resolved = await resolveLeadNotification(leadId);

    if (!resolved.ok) {
      logEvent('warn', 'lead_notification_skipped', {
        requestId: req.requestId,
        reason: resolved.reason,
      });
      // Deliberately uniform response: the caller learns nothing about
      // whether a given lead id exists.
      return res.status(202).json({ success: true, queued: false, requestId: req.requestId });
    }

    const sent = await sendNotification('new_lead', resolved.to, resolved.data);
    logEvent(sent.success ? 'info' : 'warn', 'lead_notification_dispatched', {
      requestId: req.requestId,
      success: sent.success,
    });

    return res.json({ success: true, queued: sent.success, requestId: req.requestId });
  } catch (error) {
    logEvent('error', 'lead_notification_failed', {
      requestId: req.requestId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to send notification.',
      requestId: req.requestId,
    });
  }
});

app.get('/api/notifications/types', authenticate, (req, res) => {
  res.json({ types: EMAIL_TYPES });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'airhouse-notifications' });
});

/** Surface body-parser and CORS errors as JSON rather than HTML stack traces. */
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
  logEvent('error', 'unhandled_request_error', {
    requestId: req.requestId,
    status,
    error: error.message,
  });

  return res.status(status).json({
    success: false,
    error: status === 500 ? 'Internal server error.' : error.message,
    requestId: req.requestId,
  });
});

if (config.isProduction) {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = app.listen(config.port, '0.0.0.0', () => {
  logEvent('info', 'server_started', { port: config.port, production: config.isProduction });

  // Prove the mail relay accepts our credentials now, rather than finding out
  // from a developer who never received their lead notification. Deliberately
  // not fatal: a relay that is briefly unreachable should not stop the
  // platform serving pages.
  verifyEmailTransport().then((result) => {
    if (result.ok) logEvent('info', 'email_transport_ready', { host: config.smtp.host });
    else logEvent('error', 'email_transport_unavailable', { host: config.smtp.host, error: result.error });
  });
});

/**
 * Shut down gracefully.
 *
 * Without this the process ignores SIGTERM, so `docker stop` waits out its
 * ten-second grace period and then kills it: ten seconds of downtime on every
 * deploy, and any request still in flight is dropped rather than finished.
 *
 * Stop accepting new connections, let the current ones complete, then exit.
 * The timer is a backstop for a connection that never closes; `unref` keeps
 * it from holding the process open by itself.
 */
function shutdown(signal) {
  logEvent('info', 'server_stopping', { signal });

  server.close((error) => {
    if (error) {
      logEvent('error', 'server_stop_failed', { error: error.message });
      process.exit(1);
    }
    logEvent('info', 'server_stopped', {});
    process.exit(0);
  });

  setTimeout(() => {
    logEvent('warn', 'server_stop_forced', { afterMs: 10_000 });
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
