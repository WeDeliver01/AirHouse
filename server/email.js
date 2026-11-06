import nodemailer from 'nodemailer';

import { config } from './config.js';

/**
 * SMTP transport.
 *
 * Deliberately a plain SMTP relay rather than a provider SDK: the same
 * configuration works with Google Workspace, Microsoft 365, Zoho, a mail
 * server on this host, or the SMTP endpoint of any transactional provider, so
 * changing provider is a change to deploy/.env.production and nothing else.
 *
 * Built once and reused. Each `sendMail` on a fresh transport would otherwise
 * pay a TCP connect, a TLS handshake and an AUTH round trip; with pooling, a
 * burst of lead notifications reuses one authenticated connection.
 */
let transport = null;

/** Reset the cached transport. Tests only. */
export function resetTransport() {
  transport = null;
}

/**
 * Describe the SMTP settings, or explain what is missing.
 *
 * Separated from transport construction so it can be unit tested without
 * opening a socket.
 */
export function describeSmtp(settings = config.smtp, from = config.emailFrom) {
  const missing = [];
  if (!settings.host) missing.push('SMTP_HOST');
  if (!from) missing.push('EMAIL_FROM');

  // Half-configured authentication is a configuration error, not a reason to
  // silently connect anonymously to a relay that will reject the message.
  if (settings.user && !settings.password) missing.push('SMTP_PASSWORD');
  if (settings.password && !settings.user) missing.push('SMTP_USER');

  if (missing.length) {
    return {
      ok: false,
      error:
        `Email is not configured. Set ${missing.join(', ')} in the environment. ` +
        'See deploy/.env.production.example.',
    };
  }

  return {
    ok: true,
    options: {
      host: settings.host,
      port: settings.port,
      // Port 465 is implicit TLS from the first byte. 587 and 25 begin in the
      // clear and upgrade with STARTTLS, which `requireTLS` makes mandatory
      // rather than opportunistic -- without it a relay that simply does not
      // advertise STARTTLS would receive the password in plaintext.
      secure: settings.secure,
      requireTLS: !settings.secure && settings.requireTls,
      auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      // A mail server that accepts the connection and then stops talking must
      // not hold a request open indefinitely.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    },
  };
}

function getTransport() {
  if (transport) return transport;

  const described = describeSmtp();
  if (!described.ok) throw new Error(described.error);

  transport = nodemailer.createTransport(described.options);
  return transport;
}

/**
 * Check the relay accepts our credentials, at startup.
 *
 * Non-fatal: a mail server that is briefly unreachable should not stop the
 * platform from serving pages. It is logged loudly instead, because the
 * alternative is discovering it from a developer who never got their lead.
 */
export async function verifyEmailTransport() {
  const described = describeSmtp();
  if (!described.ok) return { ok: false, error: described.error };

  try {
    await getTransport().verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

const BRAND = {
  name: 'AirHouse',
  color: '#6B9B8C',
  url: config.appUrl,
};

/**
 * Escape a value for safe interpolation into an HTML email body.
 * Exported for tests; applied centrally by `sanitizeTemplateData`.
 */
export function escapeHtmlValue(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape every string field of a template payload.
 *
 * Templates previously interpolated caller-supplied values straight into the
 * email body, so a crafted name or feedback string could inject markup into
 * outbound mail (AH-007). All data is now escaped once, here, at the boundary.
 */
export function sanitizeTemplateData(data) {
  const safe = {};
  for (const [key, value] of Object.entries(data || {})) {
    safe[key] = typeof value === 'string' ? escapeHtmlValue(value) : value;
  }
  return safe;
}

/**
 * Identity passthrough retained for templates written before escaping moved
 * to the boundary. Values reaching a template are already escaped; escaping
 * again here would double-encode them.
 */
const escapeHtml = (value) => (value === null || value === undefined ? '' : String(value));

function baseTemplate(content, preheader = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND.name}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: ${BRAND.color}; padding: 24px 32px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; }
    .body { padding: 32px; }
    .body h2 { font-size: 20px; color: #111827; margin: 0 0 16px 0; }
    .body p { font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 16px 0; }
    .btn { display: inline-block; background: ${BRAND.color}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
    .detail-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .detail-label { color: #6b7280; }
    .detail-value { color: #111827; font-weight: 600; }
    .footer { padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { font-size: 12px; color: #9ca3af; margin: 0; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="container">
    <div class="header">
      <h1>${BRAND.name}</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
      <p style="margin-top: 8px;">Property marketing, simplified.</p>
    </div>
  </div>
</body>
</html>`;
}

const TEMPLATES = {
  campaign_invite: ({ creatorName, campaignTitle, developerName, budget, dashboardUrl }) => ({
    subject: `You've been invited to a campaign: ${campaignTitle}`,
    html: baseTemplate(`
      <h2>New Campaign Invitation</h2>
      <p>Hi ${creatorName},</p>
      <p><strong>${developerName}</strong> has invited you to work on their campaign.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Campaign</span><span class="detail-value">${campaignTitle}</span></div>
        <div class="detail-row"><span class="detail-label">Budget</span><span class="detail-value">R${Number(budget).toLocaleString()}</span></div>
      </div>
      <p>Review the details and respond to this invitation from your dashboard.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">View Invitation</a></p>
    `, `${developerName} invited you to campaign: ${campaignTitle}`),
  }),

  new_lead: ({ developerName, campaignTitle, leadName, leadEmail, leadPhone, dashboardUrl }) => ({
    subject: `New lead captured: ${campaignTitle}`,
    html: baseTemplate(`
      <h2>New Lead Alert</h2>
      <p>Hi ${developerName},</p>
      <p>A new lead has been captured for your campaign.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Campaign</span><span class="detail-value">${campaignTitle}</span></div>
        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${leadName || 'Not provided'}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${leadEmail || 'Not provided'}</span></div>
        ${leadPhone ? `<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${leadPhone}</span></div>` : ''}
      </div>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">View Lead Details</a></p>
    `, `New lead from ${leadName || 'unknown'} on ${campaignTitle}`),
  }),

  content_approved: ({ creatorName, campaignTitle, reviewerName, dashboardUrl }) => ({
    subject: `Content approved: ${campaignTitle}`,
    html: baseTemplate(`
      <h2>Content Approved</h2>
      <p>Hi ${creatorName},</p>
      <p>Great news! Your content submission for <strong>${campaignTitle}</strong> has been approved by ${reviewerName}.</p>
      <p>Your content is now live and generating leads.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">View Campaign</a></p>
    `, `Your content for ${campaignTitle} was approved`),
  }),

  content_rejected: ({ creatorName, campaignTitle, _reviewerName, feedback, dashboardUrl }) => ({
    subject: `Content revision needed: ${campaignTitle}`,
    html: baseTemplate(`
      <h2>Revision Requested</h2>
      <p>Hi ${creatorName},</p>
      <p>Your content submission for <strong>${campaignTitle}</strong> needs some changes.</p>
      ${feedback ? `<div class="detail-box"><p style="margin:0;font-size:14px;color:#4b5563;">"${feedback}"</p></div>` : ''}
      <p>Please review the feedback and resubmit your content.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">Revise Content</a></p>
    `, `Revision needed for ${campaignTitle}`),
  }),

  payout_confirmed: ({ creatorName, amount, reference, dashboardUrl }) => ({
    subject: `Payout confirmed: R${Number(amount).toLocaleString()}`,
    html: baseTemplate(`
      <h2>Payout Confirmed</h2>
      <p>Hi ${creatorName},</p>
      <p>Your payout has been processed successfully.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">R${Number(amount).toLocaleString()}</span></div>
        ${reference ? `<div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${reference}</span></div>` : ''}
      </div>
      <p>The funds should reflect in your bank account within 1-3 business days.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">View Wallet</a></p>
    `, `R${Number(amount).toLocaleString()} payout confirmed`),
  }),

  campaign_assigned: ({ creatorName, campaignTitle, developerName, budget, startDate, dashboardUrl }) => ({
    subject: `You've been assigned to: ${campaignTitle}`,
    html: baseTemplate(`
      <h2>Campaign Assignment</h2>
      <p>Hi ${creatorName},</p>
      <p>You've been assigned to a new campaign by <strong>${developerName}</strong>.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Campaign</span><span class="detail-value">${campaignTitle}</span></div>
        <div class="detail-row"><span class="detail-label">Budget</span><span class="detail-value">R${Number(budget).toLocaleString()}</span></div>
        ${startDate ? `<div class="detail-row"><span class="detail-label">Start Date</span><span class="detail-value">${startDate}</span></div>` : ''}
      </div>
      <p>Head to your dashboard to get started with the campaign brief.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">View Campaign</a></p>
    `, `Assigned to ${campaignTitle} by ${developerName}`),
  }),

  application_received: ({ developerName, creatorName, campaignTitle, dashboardUrl }) => ({
    subject: `New application for: ${campaignTitle}`,
    html: baseTemplate(`
      <h2>New Creator Application</h2>
      <p>Hi ${developerName},</p>
      <p><strong>${creatorName}</strong> has applied to work on your campaign <strong>${campaignTitle}</strong>.</p>
      <p>Review their profile and portfolio to decide if they're a good fit.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">Review Application</a></p>
    `, `${creatorName} applied for ${campaignTitle}`),
  }),

  payout_requested: ({ creatorName, amount, dashboardUrl }) => ({
    subject: `Payout request: R${Number(amount).toLocaleString()}`,
    html: baseTemplate(`
      <h2>Payout Requested</h2>
      <p>Hi ${creatorName},</p>
      <p>Your payout request for <strong>R${Number(amount).toLocaleString()}</strong> has been submitted and is being processed.</p>
      <p>You'll receive another email once the payout is confirmed.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">View Wallet</a></p>
    `, `Payout request for R${Number(amount).toLocaleString()} submitted`),
  }),

  support_inquiry: ({ name, email, subject, body, category, sourceUrl, ticketId }) => {
    const safeName = escapeHtml(name) || 'Anonymous';
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeCategory = escapeHtml(category);
    const safeTicketId = escapeHtml(ticketId);
    const safeSourceUrl = escapeHtml(sourceUrl);
    const safeBody = escapeHtml(body);
    const replyHref = email
      ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Re: ' + (subject || ''))}`
      : null;
    return {
      subject: `[Support] ${subject || '(no subject)'}`,
      html: baseTemplate(`
      <h2>New support request</h2>
      <p>A new support request was submitted from the Help Centre.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">From</span><span class="detail-value">${safeName}${safeEmail ? ` &lt;${safeEmail}&gt;` : ''}</span></div>
        ${safeCategory ? `<div class="detail-row"><span class="detail-label">Category</span><span class="detail-value">${safeCategory}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Subject</span><span class="detail-value">${safeSubject}</span></div>
        ${safeTicketId ? `<div class="detail-row"><span class="detail-label">Ticket</span><span class="detail-value">${safeTicketId}</span></div>` : ''}
        ${safeSourceUrl ? `<div class="detail-row"><span class="detail-label">From page</span><span class="detail-value">${safeSourceUrl}</span></div>` : ''}
      </div>
      <p style="white-space:pre-wrap;font-size:14px;color:#374151;">${safeBody}</p>
      ${replyHref ? `<p><a href="${replyHref}" class="btn">Reply to ${safeName}</a></p>` : ''}
    `, `New support request: ${safeSubject}`),
    };
  },

  support_received: ({ name, subject, ticketId }) => {
    const safeName = escapeHtml(name);
    const safeSubject = escapeHtml(subject);
    const safeTicketId = escapeHtml(ticketId);
    return {
      subject: `We received your message: ${subject || '(no subject)'}`,
      html: baseTemplate(`
      <h2>Thanks${safeName ? `, ${safeName}` : ''} — we got your message</h2>
      <p>This is a quick confirmation that your support request reached our team. We'll usually reply within one business day.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Subject</span><span class="detail-value">${safeSubject}</span></div>
        ${safeTicketId ? `<div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${safeTicketId}</span></div>` : ''}
      </div>
      <p>If you need to add more detail, just reply to this email.</p>
    `, `We received your message: ${safeSubject}`),
    };
  },

  dispute_opened: ({ recipientName, reporterName, campaignTitle, disputeTitle, disputeType, path }) => {
    const safeRecipient = escapeHtml(recipientName || 'there');
    const safeReporter = escapeHtml(reporterName || 'A user');
    const safeCampaign = escapeHtml(campaignTitle || 'a campaign');
    const safeTitle = escapeHtml(disputeTitle || 'Dispute');
    const safeType = escapeHtml(disputeType || '');
    return {
      subject: `Dispute opened: ${disputeTitle || 'New case'}`,
      html: baseTemplate(`
        <h2>A Dispute Has Been Opened</h2>
        <p>Hi ${safeRecipient},</p>
        <p><strong>${safeReporter}</strong> has filed a dispute on the campaign <strong>${safeCampaign}</strong>.</p>
        <div class="detail-box">
          <div class="detail-row"><span class="detail-label">Case</span><span class="detail-value">${safeTitle}</span></div>
          ${safeType ? `<div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${safeType}</span></div>` : ''}
        </div>
        <p>Please review the case and respond as soon as possible. A super admin will mediate.</p>
        <p><a href="${BRAND.url}${path || ''}" class="btn">View Dispute</a></p>
      `, `${reporterName || 'A user'} filed a dispute: ${disputeTitle || ''}`),
    };
  },

  dispute_message: ({ recipientName, senderName, isAdmin, campaignTitle, disputeTitle, message, path }) => {
    const safeRecipient = escapeHtml(recipientName || 'there');
    const safeSender = escapeHtml(senderName || 'Someone');
    const safeCampaign = escapeHtml(campaignTitle || 'a campaign');
    const safeTitle = escapeHtml(disputeTitle || 'this dispute');
    const trimmedMessage = message && message.length > 500
      ? `${message.slice(0, 500)}…`
      : message;
    return {
      subject: `New message on dispute: ${disputeTitle || 'your case'}`,
      html: baseTemplate(`
        <h2>New Dispute Message</h2>
        <p>Hi ${safeRecipient},</p>
        <p><strong>${safeSender}</strong>${isAdmin ? ' (Super Admin)' : ''} replied on the dispute for <strong>${safeCampaign}</strong>.</p>
        <p style="font-size:13px;color:#6b7280;">Case: ${safeTitle}</p>
        ${trimmedMessage ? `<div class="detail-box"><p style="margin:0;font-size:14px;color:#4b5563;white-space:pre-wrap;">${escapeHtml(trimmedMessage)}</p></div>` : ''}
        <p><a href="${BRAND.url}${path || ''}" class="btn">View Conversation</a></p>
      `, `${senderName || 'Someone'} replied on dispute ${disputeTitle || ''}`),
    };
  },

  dispute_resolved: ({ recipientName, status, disputeTitle, campaignTitle, notes, refundAmount, path, audience }) => {
    const statusLabel =
      status === 'resolved' ? 'Resolved'
      : status === 'closed' ? 'Closed'
      : status === 'escalated' ? 'Escalated'
      : status === 'under_review' ? 'Under Review'
      : status;
    const safeRecipient = escapeHtml(recipientName || 'there');
    const safeCampaign = escapeHtml(campaignTitle || 'a campaign');
    const safeTitle = escapeHtml(disputeTitle || 'this dispute');
    // "audience" lets the same template address either the reporter or
    // the other party / admin without leaking ownership-specific phrasing.
    const lead = audience === 'reporter'
      ? `Your dispute on <strong>${safeCampaign}</strong>`
      : audience === 'admin'
        ? `The dispute on <strong>${safeCampaign}</strong>`
        : `The dispute filed on <strong>${safeCampaign}</strong>`;
    return {
      subject: `Dispute ${statusLabel.toLowerCase()}: ${disputeTitle || 'case update'}`,
      html: baseTemplate(`
        <h2>Dispute ${statusLabel}</h2>
        <p>Hi ${safeRecipient},</p>
        <p>${lead} has been marked <strong>${statusLabel.toLowerCase()}</strong> by a super admin.</p>
        <div class="detail-box">
          <div class="detail-row"><span class="detail-label">Case</span><span class="detail-value">${safeTitle}</span></div>
          <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${statusLabel}</span></div>
          ${refundAmount ? `<div class="detail-row"><span class="detail-label">Refund authorised</span><span class="detail-value">R${Number(refundAmount).toLocaleString()}</span></div>` : ''}
        </div>
        ${notes ? `<div class="detail-box"><p style="margin:0;font-size:14px;color:#4b5563;white-space:pre-wrap;">${escapeHtml(notes)}</p></div>` : ''}
        <p><a href="${BRAND.url}${path || ''}" class="btn">View Case</a></p>
      `, `Dispute "${disputeTitle || ''}" was marked ${statusLabel.toLowerCase()}`),
    };
  },

  verification_approved: ({ userName, level, dashboardUrl }) => ({
    subject: `You're verified on ${BRAND.name}`,
    html: baseTemplate(`
      <h2>Verification Approved</h2>
      <p>Hi ${escapeHtml(userName) || 'there'},</p>
      <p>Good news — your identity has been reviewed and your ${BRAND.name} account is now <strong>verified</strong>${level ? ` at the <strong>${escapeHtml(level)}</strong> tier` : ''}.</p>
      <p>You'll now see the verified badge on your profile and unlock the features reserved for verified members.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">Go to Dashboard</a></p>
    `, `Your ${BRAND.name} verification was approved`),
  }),

  verification_rejected: ({ userName, reason, dashboardUrl }) => ({
    subject: `Update on your ${BRAND.name} verification request`,
    html: baseTemplate(`
      <h2>Verification Needs Attention</h2>
      <p>Hi ${escapeHtml(userName) || 'there'},</p>
      <p>Our team reviewed your identity submission and unfortunately we weren't able to approve it as-is.</p>
      ${reason ? `<div class="detail-box"><p style="margin:0;font-size:14px;color:#4b5563;white-space:pre-wrap;">${escapeHtml(reason)}</p></div>` : ''}
      <p>You can re-submit a fresh ID document and selfie from your dashboard whenever you're ready.</p>
      <p><a href="${dashboardUrl || BRAND.url}" class="btn">Resubmit Verification</a></p>
    `, `Your ${BRAND.name} verification needs another look`),
  }),

  welcome: ({ userName, role }) => ({
    subject: `Welcome to ${BRAND.name}!`,
    html: baseTemplate(`
      <h2>Welcome to ${BRAND.name}</h2>
      <p>Hi ${userName},</p>
      <p>Thank you for joining ${BRAND.name} as a <strong>${role === 'developer' ? 'Property Developer' : 'Content Creator'}</strong>.</p>
      <p>${role === 'developer'
        ? 'You can now create campaigns, browse vetted creators, and start generating quality leads for your properties.'
        : 'You can now browse available campaigns, apply to work with developers, and start earning from your content skills.'
      }</p>
      <p><a href="${BRAND.url}" class="btn">Go to Dashboard</a></p>
    `, `Welcome to ${BRAND.name}!`),
  }),
};

export async function sendNotification(type, to, data) {
  try {
    if (!TEMPLATES[type]) {
      throw new Error(`Unknown email template: ${type}`);
    }

    const template = TEMPLATES[type](sanitizeTemplateData(data));

    const result = await getTransport().sendMail({
      from: config.emailFrom,
      to,
      subject: template.subject,
      html: template.html,
    });

    // A relay can accept the session and still refuse a recipient, which is
    // not an exception. Treat that as a failed send rather than reporting
    // success for a message nobody received.
    if (result.rejected?.length) {
      throw new Error('The mail server rejected the recipient.');
    }

    // Recipient addresses are personal data: log the template type and the
    // message id, not the address or the rendered body (AH-016).
    console.log(JSON.stringify({ level: 'info', msg: 'email_sent', type, id: result.messageId }));
    return { success: true, id: result.messageId };
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'email_failed', type, error: error.message }));
    return { success: false, error: error.message };
  }
}

export const EMAIL_TYPES = Object.keys(TEMPLATES);
