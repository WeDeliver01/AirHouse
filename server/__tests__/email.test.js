import { describe, expect, it } from 'vitest';

import { EMAIL_TYPES, escapeHtmlValue, sanitizeTemplateData } from '../email.js';

describe('escapeHtmlValue', () => {
  it('escapes the characters that could break out of an HTML context', () => {
    expect(escapeHtmlValue('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes quotes so a value cannot terminate an attribute', () => {
    expect(escapeHtmlValue(`" onload="evil()`)).toBe('&quot; onload=&quot;evil()');
    expect(escapeHtmlValue("it's")).toBe('it&#39;s');
  });

  it('escapes ampersands first so entities are not double-formed', () => {
    expect(escapeHtmlValue('a & b')).toBe('a &amp; b');
  });

  it('renders null and undefined as empty rather than the literal words', () => {
    expect(escapeHtmlValue(null)).toBe('');
    expect(escapeHtmlValue(undefined)).toBe('');
  });
});

describe('sanitizeTemplateData', () => {
  it('escapes every string field', () => {
    const safe = sanitizeTemplateData({
      creatorName: '<b>Mallory</b>',
      feedback: '<img src=x onerror=alert(1)>',
    });

    expect(safe.creatorName).toBe('&lt;b&gt;Mallory&lt;/b&gt;');
    expect(safe.feedback).not.toContain('<img');
  });

  it('leaves non-string values alone so templates can still format them', () => {
    const safe = sanitizeTemplateData({ amount: 1500, urgent: true });
    expect(safe.amount).toBe(1500);
    expect(safe.urgent).toBe(true);
  });

  it('handles a missing payload', () => {
    expect(sanitizeTemplateData(undefined)).toEqual({});
    expect(sanitizeTemplateData(null)).toEqual({});
  });
});

describe('EMAIL_TYPES', () => {
  it('is a non-empty allowlist used to reject unknown template names', () => {
    expect(Array.isArray(EMAIL_TYPES)).toBe(true);
    expect(EMAIL_TYPES.length).toBeGreaterThan(0);
    expect(EMAIL_TYPES).toContain('new_lead');
  });
});
