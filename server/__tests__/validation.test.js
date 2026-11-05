import { describe, expect, it } from 'vitest';

import {
  LIMITS,
  isValidEmail,
  validateBatch,
  validateNotification,
  validateTemplateData,
} from '../validation.js';

const TYPES = ['welcome', 'new_lead'];

describe('isValidEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isValidEmail('creator@example.com')).toBe(true);
  });

  it.each([
    ['missing @', 'not-an-email'],
    ['missing domain dot', 'user@localhost'],
    ['empty', ''],
    ['whitespace only', '   '],
    ['not a string', 12345],
  ])('rejects %s', (_label, value) => {
    expect(isValidEmail(value)).toBe(false);
  });

  it('rejects an address beyond the length limit', () => {
    expect(isValidEmail(`${'a'.repeat(400)}@example.com`)).toBe(false);
  });
});

describe('validateNotification', () => {
  it('accepts a well-formed request', () => {
    const result = validateNotification(
      { type: 'welcome', to: 'user@example.com', data: { name: 'Thandi' } },
      TYPES,
    );
    expect(result.ok).toBe(true);
    expect(result.value.to).toBe('user@example.com');
  });

  it('rejects an unknown template type', () => {
    const result = validateNotification(
      { type: 'arbitrary_template', to: 'user@example.com' },
      TYPES,
    );
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/Unknown notification type/);
  });

  it('rejects a malformed recipient', () => {
    const result = validateNotification({ type: 'welcome', to: 'nope' }, TYPES);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(validateNotification('payload', TYPES).ok).toBe(false);
    expect(validateNotification([1, 2], TYPES).ok).toBe(false);
    expect(validateNotification(null, TYPES).ok).toBe(false);
  });

  it('trims the recipient address', () => {
    const result = validateNotification(
      { type: 'welcome', to: '  user@example.com  ' },
      TYPES,
    );
    expect(result.value.to).toBe('user@example.com');
  });
});

describe('validateTemplateData', () => {
  it('treats a missing payload as empty', () => {
    expect(validateTemplateData(undefined)).toEqual({ ok: true, value: {} });
    expect(validateTemplateData(null)).toEqual({ ok: true, value: {} });
  });

  it('drops null and undefined fields', () => {
    const result = validateTemplateData({ a: 'keep', b: null, c: undefined });
    expect(result.value).toEqual({ a: 'keep' });
  });

  it('rejects nested objects, which could smuggle unexpected content into a body', () => {
    const result = validateTemplateData({ nested: { evil: true } });
    expect(result.ok).toBe(false);
  });

  it('rejects arrays', () => {
    expect(validateTemplateData({ list: [1, 2, 3] }).ok).toBe(false);
  });

  it('rejects an oversized field', () => {
    const result = validateTemplateData({ body: 'x'.repeat(LIMITS.MAX_FIELD_LENGTH + 1) });
    expect(result.ok).toBe(false);
  });

  it('rejects too many fields', () => {
    const data = {};
    for (let i = 0; i <= LIMITS.MAX_FIELD_COUNT; i += 1) data[`f${i}`] = 'v';
    expect(validateTemplateData(data).ok).toBe(false);
  });

  it('keeps numbers and booleans', () => {
    const result = validateTemplateData({ amount: 1500, urgent: true });
    expect(result.value).toEqual({ amount: 1500, urgent: true });
  });
});

describe('validateBatch', () => {
  const valid = { type: 'welcome', to: 'user@example.com', data: {} };

  it('accepts a small batch', () => {
    const result = validateBatch({ notifications: [valid, valid] }, TYPES, 50);
    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(2);
  });

  it('rejects a batch larger than the cap', () => {
    const notifications = Array.from({ length: 51 }, () => valid);
    const result = validateBatch({ notifications }, TYPES, 50);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at most 50/);
  });

  it('rejects an empty batch', () => {
    expect(validateBatch({ notifications: [] }, TYPES, 50).ok).toBe(false);
  });

  it('rejects a batch that is not an array', () => {
    expect(validateBatch({ notifications: 'all' }, TYPES, 50).ok).toBe(false);
  });

  it('names the offending entry', () => {
    const result = validateBatch({ notifications: [valid, { type: 'welcome', to: 'bad' }] }, TYPES, 50);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/notifications\[1\]/);
  });
});
