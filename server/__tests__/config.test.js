import { describe, expect, it, vi } from 'vitest';

import { missingProductionConfig, validateConfig } from '../config.js';

describe('missingProductionConfig', () => {
  it('reports nothing when every setting is present', () => {
    expect(
      missingProductionConfig([
        ['SUPABASE_URL', 'https://x.supabase.co'],
        ['RESEND_API_KEY', 're_123'],
      ]),
    ).toEqual([]);
  });

  it('names each missing setting', () => {
    expect(
      missingProductionConfig([
        ['SUPABASE_URL', ''],
        ['RESEND_API_KEY', undefined],
        ['ALLOWED_ORIGINS', 'set'],
      ]),
    ).toEqual(['SUPABASE_URL', 'RESEND_API_KEY']);
  });
});

describe('validateConfig', () => {
  it('throws in production when required secrets are absent, so the service cannot boot half-configured', () => {
    // The test environment supplies none of the production secrets.
    expect(() => validateConfig({ production: true })).toThrow(/Missing required configuration/);
  });

  it('warns but continues outside production, so local work is not blocked', () => {
    const log = { warn: vi.fn() };
    const result = validateConfig({ production: false, log });

    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(log.warn).toHaveBeenCalled();
  });
});
