import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Supabase client is mocked so these tests exercise our logic rather than
// the SDK. What matters here is the fail-safe behaviour: a transient error
// must not lock a user out, and an unverified factor must not count as MFA.
const mfaMock = {
  listFactors: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  unenroll: vi.fn(),
};

const fromMock = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    auth: { mfa: mfaMock },
    from: (...args) => fromMock(...args),
  },
}));

const {
  getAssuranceLevel,
  hasVerifiedFactor,
  isSecondFactorOutstanding,
  mfaRequiredForAdmins,
  startEnrollment,
  verifyEnrollment,
} = await import('../mfa.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hasVerifiedFactor', () => {
  it('is true when a verified authenticator exists', async () => {
    mfaMock.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', status: 'verified' }] },
      error: null,
    });
    expect(await hasVerifiedFactor()).toBe(true);
  });

  it('is false when the only factor is still unverified', async () => {
    mfaMock.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', status: 'unverified' }] },
      error: null,
    });
    expect(await hasVerifiedFactor()).toBe(false);
  });

  it('is false when no factors are enrolled', async () => {
    mfaMock.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    expect(await hasVerifiedFactor()).toBe(false);
  });

  it('is false rather than throwing when the lookup fails', async () => {
    mfaMock.listFactors.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await hasVerifiedFactor()).toBe(false);
  });
});

describe('getAssuranceLevel', () => {
  it('reports the factor as satisfied when current matches next', async () => {
    mfaMock.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    const result = await getAssuranceLevel();
    expect(result.satisfied).toBe(true);
  });

  it('reports not satisfied when a step up is pending', async () => {
    mfaMock.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    const result = await getAssuranceLevel();
    expect(result.satisfied).toBe(false);
  });
});

describe('isSecondFactorOutstanding', () => {
  it('is true when the session is at aal1 but aal2 is available', async () => {
    mfaMock.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    expect(await isSecondFactorOutstanding()).toBe(true);
  });

  it('is false once the second factor has been presented', async () => {
    mfaMock.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    expect(await isSecondFactorOutstanding()).toBe(false);
  });

  it('is false for an account with no factor at all', async () => {
    mfaMock.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    });
    expect(await isSecondFactorOutstanding()).toBe(false);
  });

  it('does not lock the user out when the check itself fails', async () => {
    mfaMock.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { message: 'network' },
    });
    expect(await isSecondFactorOutstanding()).toBe(false);
  });
});

describe('startEnrollment', () => {
  it('returns the QR code and manual-entry secret', async () => {
    mfaMock.enroll.mockResolvedValue({
      data: { id: 'factor-1', totp: { qr_code: 'data:image/svg', secret: 'ABCD', uri: 'otpauth://' } },
      error: null,
    });

    const result = await startEnrollment();
    expect(result).toMatchObject({ factorId: 'factor-1', secret: 'ABCD' });
    expect(result.qrCode).toContain('data:image');
  });

  it('propagates an enrolment failure', async () => {
    mfaMock.enroll.mockResolvedValue({ data: null, error: { message: 'limit reached' } });
    await expect(startEnrollment()).rejects.toMatchObject({ message: 'limit reached' });
  });
});

describe('verifyEnrollment', () => {
  it('challenges then verifies, trimming the submitted code', async () => {
    mfaMock.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null });
    mfaMock.verify.mockResolvedValue({ data: { access_token: 't' }, error: null });

    await verifyEnrollment('factor-1', ' 123456 ');

    expect(mfaMock.challenge).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(mfaMock.verify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      challengeId: 'ch1',
      code: '123456',
    });
  });

  it('propagates a rejected code', async () => {
    mfaMock.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null });
    mfaMock.verify.mockResolvedValue({ data: null, error: { message: 'Invalid TOTP code' } });

    await expect(verifyEnrollment('factor-1', '000000')).rejects.toMatchObject({
      message: 'Invalid TOTP code',
    });
  });
});

describe('mfaRequiredForAdmins', () => {
  function settingReturns(value) {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: value, error: null }) }),
      }),
    });
  }

  it('is true by default when the setting is absent', async () => {
    settingReturns(null);
    expect(await mfaRequiredForAdmins()).toBe(true);
  });

  it('is true when the setting is on', async () => {
    settingReturns({ value: true });
    expect(await mfaRequiredForAdmins()).toBe(true);
  });

  it('is false only when explicitly turned off', async () => {
    settingReturns({ value: false });
    expect(await mfaRequiredForAdmins()).toBe(false);
  });
});
