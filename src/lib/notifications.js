import { supabase } from './supabase'

const API_BASE = '/api/notifications';

/**
 * Build request headers including the caller's Supabase access token.
 *
 * The notification endpoints require authentication (AH-004); an
 * unauthenticated caller is rejected with 401.
 */
async function authorizedHeaders() {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Fall through without a token; the server will reject the request.
  }

  return headers;
}

export async function sendNotification(type, to, data = {}) {
  try {
    const response = await fetch(`${API_BASE}/send`, {
      method: 'POST',
      headers: await authorizedHeaders(),
      body: JSON.stringify({ type, to, data }),
    });

    const result = await response.json();

    if (!result.success) {
      console.warn(`Notification [${type}] failed:`, result.error);
    }

    return result;
  } catch (error) {
    console.warn(`Notification [${type}] failed:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function sendBatchNotifications(notifications) {
  try {
    const response = await fetch(`${API_BASE}/batch`, {
      method: 'POST',
      headers: await authorizedHeaders(),
      body: JSON.stringify({ notifications }),
    });

    return await response.json();
  } catch (error) {
    console.warn('Batch notification failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Raise the "new lead" notification for a lead that was just created.
 *
 * Public visitors are not authenticated, so this posts only the lead id to a
 * dedicated endpoint; the server resolves the developer's address and the
 * email body from the stored lead (AH-004). Notification failures are
 * swallowed deliberately — a visitor's enquiry must still succeed.
 */
export async function notifyNewLead(leadId) {
  try {
    const response = await fetch(`${API_BASE}/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId }),
    });
    return await response.json();
  } catch (error) {
    console.warn('Lead notification failed:', error.message);
    return { success: false, error: error.message };
  }
}

export const notify = {
  campaignInvite: (to, data) => sendNotification('campaign_invite', to, data),
  contentApproved: (to, data) => sendNotification('content_approved', to, data),
  contentRejected: (to, data) => sendNotification('content_rejected', to, data),
  payoutConfirmed: (to, data) => sendNotification('payout_confirmed', to, data),
  campaignAssigned: (to, data) => sendNotification('campaign_assigned', to, data),
  applicationReceived: (to, data) => sendNotification('application_received', to, data),
  payoutRequested: (to, data) => sendNotification('payout_requested', to, data),
  welcome: (to, data) => sendNotification('welcome', to, data),
  supportInquiry: (to, data) => sendNotification('support_inquiry', to, data),
  supportReceived: (to, data) => sendNotification('support_received', to, data),
  disputeOpened: (to, data) => sendNotification('dispute_opened', to, data),
  disputeMessage: (to, data) => sendNotification('dispute_message', to, data),
  disputeResolved: (to, data) => sendNotification('dispute_resolved', to, data),
  verificationApproved: (to, data) => sendNotification('verification_approved', to, data),
  verificationRejected: (to, data) => sendNotification('verification_rejected', to, data),
};
