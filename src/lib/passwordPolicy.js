/**
 * Password policy, in one place.
 *
 * The same rule was duplicated as an inline regex in Register.jsx and
 * AdminInvite.jsx, so a change to one would have silently diverged from the
 * other. Extracted here with tests, so the policy is stated once and its
 * behaviour is pinned.
 *
 * Note: this is a client-side convenience check. Supabase enforces its own
 * minimum server-side, and that is the control that matters.
 */

export const PASSWORD_MIN_LENGTH = 8

/** At least one lowercase letter, one uppercase, one digit and one symbol. */
const COMPLEXITY =
  /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/

export function isStrongPassword(password) {
  if (typeof password !== 'string') return false
  if (password.length < PASSWORD_MIN_LENGTH) return false
  return COMPLEXITY.test(password)
}

export const PASSWORD_REQUIREMENT_MESSAGE =
  'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.'

export default { isStrongPassword, PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENT_MESSAGE }
