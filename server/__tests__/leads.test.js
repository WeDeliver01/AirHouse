import { describe, expect, it } from 'vitest';

import {
  LEAD_NOTIFICATION_MAX_AGE_MS,
  isNotifiableLead,
  isUuid,
  resolveLeadNotification,
} from '../leads.js';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const VALID_ID = '11111111-1111-4111-8111-111111111111';

describe('isUuid', () => {
  it('accepts a v4 uuid', () => {
    expect(isUuid(VALID_ID)).toBe(true);
  });

  it.each([
    ['a bare string', 'not-a-uuid'],
    ['empty', ''],
    ['a number', 42],
    ['SQL-ish input', "' OR 1=1 --"],
  ])('rejects %s', (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe('isNotifiableLead', () => {
  it('accepts a lead created moments ago', () => {
    const lead = { created_at: new Date(NOW - 5_000).toISOString() };
    expect(isNotifiableLead(lead, NOW)).toBe(true);
  });

  it('refuses a lead older than the freshness window, so an id cannot be replayed', () => {
    const lead = { created_at: new Date(NOW - LEAD_NOTIFICATION_MAX_AGE_MS - 1_000).toISOString() };
    expect(isNotifiableLead(lead, NOW)).toBe(false);
  });

  it('refuses a lead timestamped in the future', () => {
    const lead = { created_at: new Date(NOW + 10 * 60_000).toISOString() };
    expect(isNotifiableLead(lead, NOW)).toBe(false);
  });

  it('refuses a missing or malformed lead', () => {
    expect(isNotifiableLead(null, NOW)).toBe(false);
    expect(isNotifiableLead({}, NOW)).toBe(false);
    expect(isNotifiableLead({ created_at: 'nonsense' }, NOW)).toBe(false);
  });
});

/** Minimal stand-in for the PostgREST query builder used by resolveLeadNotification. */
function stubClient(lead, error = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: lead, error }),
        }),
      }),
    }),
  };
}

describe('resolveLeadNotification', () => {
  const freshLead = {
    id: VALID_ID,
    created_at: new Date(NOW - 1_000).toISOString(),
    lead_name: 'Sipho',
    lead_email: 'sipho@example.com',
    lead_phone: '0123456789',
    campaign: {
      id: 'c1',
      title: 'Sea Point Launch',
      developer: { full_name: 'Dev One', email: 'dev@example.com' },
    },
  };

  it('derives the recipient from the stored lead rather than from the caller', async () => {
    const result = await resolveLeadNotification(VALID_ID, {
      client: stubClient(freshLead),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.to).toBe('dev@example.com');
    expect(result.data.campaignTitle).toBe('Sea Point Launch');
    expect(result.data.leadName).toBe('Sipho');
  });

  it('refuses a malformed lead id without touching the database', async () => {
    const result = await resolveLeadNotification('not-a-uuid', {
      client: stubClient(freshLead),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_lead_id' });
  });

  it('refuses when no service client is configured, rather than guessing', async () => {
    const result = await resolveLeadNotification(VALID_ID, { client: null, now: NOW });
    expect(result).toEqual({ ok: false, reason: 'service_client_unavailable' });
  });

  it('refuses a stale lead', async () => {
    const stale = { ...freshLead, created_at: new Date(NOW - 60 * 60_000).toISOString() };
    const result = await resolveLeadNotification(VALID_ID, {
      client: stubClient(stale),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'lead_not_notifiable' });
  });

  it('refuses when the lead does not exist', async () => {
    const result = await resolveLeadNotification(VALID_ID, {
      client: stubClient(null),
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it('refuses when the campaign has no developer email', async () => {
    const orphan = { ...freshLead, campaign: { id: 'c1', title: 'X', developer: null } };
    const result = await resolveLeadNotification(VALID_ID, {
      client: stubClient(orphan),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'no_developer_email' });
  });

  it('reports a lookup failure without throwing', async () => {
    const result = await resolveLeadNotification(VALID_ID, {
      client: stubClient(null, { message: 'boom' }),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'lookup_failed' });
  });
});
