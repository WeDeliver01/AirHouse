import { describe, expect, it } from 'vitest';

import { readSendResult } from '../email.js';

/**
 * Resend reports API-level failures in the response body, not by throwing:
 *
 *   { data: T, error: null } | { error: ErrorResponse, data: null }
 *
 * The send path previously read only `data?.id` and returned
 * `{ success: true }` regardless, so an unverified sending domain, a revoked
 * key or an exhausted quota all looked like a delivered email. These pin the
 * cases that matter.
 */
describe('readSendResult', () => {
  it('accepts a delivered message', () => {
    expect(readSendResult({ data: { id: 'abc-123' }, error: null })).toEqual({
      success: true,
      id: 'abc-123',
    });
  });

  it('fails on an unverified sending domain', () => {
    const result = readSendResult({
      data: null,
      error: { name: 'invalid_from_address', message: 'The airhouse.co.za domain is not verified.' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not verified/);
  });

  it('fails on a revoked API key', () => {
    const result = readSendResult({
      data: null,
      error: { name: 'invalid_api_key', message: 'API key is invalid.' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it('fails on an exhausted quota', () => {
    const result = readSendResult({
      data: null,
      error: { name: 'monthly_quota_exceeded', message: 'Monthly quota exceeded.' },
    });
    expect(result.success).toBe(false);
  });

  it('still reports a failure when the error carries no message', () => {
    const result = readSendResult({ data: null, error: { name: 'application_error' } });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/application_error/);
  });

  // A 200 with no id is not a delivery, and must not be reported as one.
  it('fails when no message id comes back', () => {
    expect(readSendResult({ data: null, error: null }).success).toBe(false);
    expect(readSendResult({ data: {}, error: null }).success).toBe(false);
    expect(readSendResult(undefined).success).toBe(false);
  });
});
