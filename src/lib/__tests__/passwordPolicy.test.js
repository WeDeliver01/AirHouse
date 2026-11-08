import { describe, expect, it } from 'vitest'
import { isStrongPassword, PASSWORD_MIN_LENGTH } from '../passwordPolicy.js'

/**
 * These pin the policy's behaviour. The regex was rewritten to drop escapes
 * that are redundant inside a character class; this suite exists so that
 * rewrite is provably behaviour-preserving rather than assumed to be.
 */

// The original expression, before the redundant escapes were removed. The
// escapes are deliberately kept here -- comparing against them is the point.
const ORIGINAL =
  // eslint-disable-next-line no-useless-escape
  /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/

describe('isStrongPassword', () => {
  it.each([
    'Passw0rd!',
    'Str0ng#Pass',
    'aB3$efgh',
    'Zz9|aaaa',
    'Qq1[test]',
    'Qq1/slash',
  ])('accepts %s', (password) => {
    expect(isStrongPassword(password)).toBe(true)
  })

  it.each([
    ['too short', 'Aa1!'],
    ['no uppercase', 'passw0rd!'],
    ['no lowercase', 'PASSW0RD!'],
    ['no digit', 'Password!'],
    ['no symbol', 'Passw0rdd'],
    ['empty', ''],
  ])('rejects %s', (_label, password) => {
    expect(isStrongPassword(password)).toBe(false)
  })

  it('rejects a non-string', () => {
    expect(isStrongPassword(null)).toBe(false)
    expect(isStrongPassword(12345678)).toBe(false)
  })

  it('enforces the stated minimum length', () => {
    const atLimit = `Aa1!${'x'.repeat(PASSWORD_MIN_LENGTH - 4)}`
    expect(atLimit).toHaveLength(PASSWORD_MIN_LENGTH)
    expect(isStrongPassword(atLimit)).toBe(true)
    expect(isStrongPassword(atLimit.slice(0, -1))).toBe(false)
  })
})

describe('the rewritten expression matches the original', () => {
  // Every symbol in the class, plus a spread of ordinary characters.
  const SYMBOLS = '!@#$%^&*()_+-=[]{};\':"\\|,.<>/?'
  const samples = [
    ...SYMBOLS.split('').map((s) => `Aa1${s}zzzz`),
    'Password1', 'password1!', 'PASSWORD1!', 'Passworddd!', 'Aa1!',
    'abcdefgh', '12345678', '!!!!!!!!', 'Aa1 space',
  ]

  it.each(samples)('agrees on %j', (sample) => {
    const rewritten = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/
    expect(rewritten.test(sample)).toBe(ORIGINAL.test(sample))
  })
})
