/**
 * Multi-factor authentication, built on Supabase's native TOTP enrolment.
 *
 * The Help Centre previously told users that 2FA was available under
 * Settings > Security. It was not: there was no MFA implementation anywhere
 * in the codebase (AH-024). This module is that implementation.
 *
 * Supabase models MFA through Authenticator Assurance Levels:
 *   aal1 - signed in with a password
 *   aal2 - signed in and a second factor has been verified this session
 *
 * A privileged account is required to reach aal2 before it can act. The
 * database cannot read the AAL claim directly in every context, so this is
 * enforced in the app shell as well as checked here.
 */

import { supabase } from './supabase'

/** Factors enrolled on the current account. */
export async function listFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return {
    totp: data?.totp ?? [],
    all: data?.all ?? [],
  }
}

/** True when the account has at least one verified authenticator app. */
export async function hasVerifiedFactor() {
  try {
    const { totp } = await listFactors()
    return totp.some((factor) => factor.status === 'verified')
  } catch {
    return false
  }
}

/**
 * Begin enrolling an authenticator app.
 *
 * Returns the QR code and the manual-entry secret. The factor is not usable
 * until `verifyEnrollment` succeeds with a code from the app, which is what
 * proves the user actually captured the secret.
 */
export async function startEnrollment(friendlyName = 'Authenticator app') {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  })
  if (error) throw error

  return {
    factorId: data.id,
    qrCode: data.totp?.qr_code,
    secret: data.totp?.secret,
    uri: data.totp?.uri,
  }
}

/** Finish enrolment by proving the user can generate a current code. */
export async function verifyEnrollment(factorId, code) {
  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId })
  if (challengeError) throw challengeError

  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: String(code).trim(),
  })
  if (error) throw error
  return data
}

/**
 * Satisfy the second factor for the current session, raising it to aal2.
 * Called at sign-in when the account already has a verified factor.
 */
export async function verifyChallenge(factorId, code) {
  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId })
  if (challengeError) throw challengeError

  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: String(code).trim(),
  })
  if (error) throw error
  return data
}

/** Remove a factor. Requires the session to already be at aal2. */
export async function unenroll(factorId) {
  const { data, error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
  return data
}

/**
 * The session's current and required assurance levels.
 *
 * `nextLevel` is 'aal2' when a verified factor exists, which is how we know
 * a second factor is still outstanding for this session.
 */
export async function getAssuranceLevel() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return {
    current: data?.currentLevel ?? null,
    next: data?.nextLevel ?? null,
    satisfied: data?.currentLevel === data?.nextLevel,
  }
}

/**
 * Whether this account still needs to present a second factor.
 * Returns false on error so a transient failure cannot lock a user out of
 * their own account; route guards fail closed separately.
 */
export async function isSecondFactorOutstanding() {
  try {
    const { current, next } = await getAssuranceLevel()
    return next === 'aal2' && current !== 'aal2'
  } catch {
    return false
  }
}

/** Whether the platform requires privileged accounts to hold a factor. */
export async function mfaRequiredForAdmins() {
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'require_mfa_for_admins')
    .maybeSingle()

  return data?.value !== false
}

export default {
  listFactors,
  hasVerifiedFactor,
  startEnrollment,
  verifyEnrollment,
  verifyChallenge,
  unenroll,
  getAssuranceLevel,
  isSecondFactorOutstanding,
  mfaRequiredForAdmins,
}
