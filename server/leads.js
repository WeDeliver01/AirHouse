/**
 * Server-authoritative lead notifications.
 *
 * Lead capture is a public page, so its "new lead" email cannot go through
 * the authenticated notification endpoint. Rather than leaving an open,
 * unauthenticated send path, the browser posts only the id of the lead it
 * just created; the server resolves the recipient and the email content from
 * the database itself (AH-004, AH-008).
 *
 * The browser therefore controls neither the recipient address nor the body.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

/** Leads older than this cannot trigger a notification. */
export const LEAD_NOTIFICATION_MAX_AGE_MS = 10 * 60 * 1000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

let serviceClient = null;

function getServiceClient() {
  if (!serviceClient) {
    if (!config.supabaseServiceRoleKey) return null;
    serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

/**
 * Decide whether a freshly created lead may trigger a developer notification.
 *
 * Exported separately from the database access so the age/ownership rules can
 * be unit tested without a live Supabase project.
 *
 * @param {{created_at?: string} | null} lead
 * @param {number} now
 */
export function isNotifiableLead(lead, now = Date.now()) {
  if (!lead) return false;
  if (!lead.created_at) return false;

  const createdAt = Date.parse(lead.created_at);
  if (!Number.isFinite(createdAt)) return false;

  // Reject future timestamps and anything outside the freshness window, so a
  // lead id cannot be replayed later to generate repeated emails.
  if (createdAt > now + 60_000) return false;
  return now - createdAt <= LEAD_NOTIFICATION_MAX_AGE_MS;
}

/**
 * Resolve the notification payload for a lead.
 *
 * @returns {Promise<{ok: true, to: string, data: object} | {ok: false, reason: string}>}
 */
export async function resolveLeadNotification(leadId, { client = getServiceClient(), now = Date.now() } = {}) {
  if (!isUuid(leadId)) return { ok: false, reason: 'invalid_lead_id' };
  if (!client) return { ok: false, reason: 'service_client_unavailable' };

  const { data: lead, error } = await client
    .from('leads')
    .select(
      `
      id,
      created_at,
      lead_name,
      lead_email,
      lead_phone,
      campaign:campaigns (
        id,
        title,
        property_name,
        developer:profiles!developer_id ( full_name, email )
      )
    `,
    )
    .eq('id', leadId)
    .maybeSingle();

  if (error) return { ok: false, reason: 'lookup_failed' };
  if (!isNotifiableLead(lead, now)) return { ok: false, reason: 'lead_not_notifiable' };

  const developer = lead.campaign?.developer;
  if (!developer?.email) return { ok: false, reason: 'no_developer_email' };

  return {
    ok: true,
    to: developer.email,
    data: {
      developerName: developer.full_name || 'there',
      campaignTitle: lead.campaign?.title || lead.campaign?.property_name || 'your campaign',
      leadName: lead.lead_name || '',
      leadEmail: lead.lead_email || '',
      leadPhone: lead.lead_phone || '',
    },
  };
}
