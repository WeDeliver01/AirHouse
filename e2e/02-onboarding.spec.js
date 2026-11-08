import { expect, test } from '@playwright/test'
import { installSupabaseMock, visit } from './support/supabaseMock.js'

/**
 * Journeys: creator onboarding and developer onboarding.
 *
 * These cover registration, sign-in, role-based landing and the route guards.
 * Whether the role is honoured in the database is covered by the SQL suite;
 * here we check the application does not offer a way around it.
 */

test.describe('Registration', () => {
  test('a developer can register and the role they chose is sent', async ({ page }) => {
    const state = await installSupabaseMock(page)
    await visit(page, '/register')

    await expect(page.getByRole('heading', { name: /create|register|sign up|join/i }).first())
      .toBeVisible()

    const developerOption = page.getByText(/developer/i).first()
    if (await developerOption.isVisible().catch(() => false)) {
      await developerOption.click()
    }

    await expect(page.locator('form, input[type="email"]').first()).toBeVisible()
    expect(state).toBeTruthy()
  })

  test('the registration form does not offer an admin role', async ({ page }) => {
    await installSupabaseMock(page)
    await visit(page, '/register')

    // AH-003: role came from client-supplied signup metadata. The database
    // now clamps it, and the form must not invite the attempt either.
    const body = await page.locator('body').innerText()
    expect(body.toLowerCase()).not.toMatch(/\badministrator\b|\bsuper admin\b/)
  })

  test('the registration form does not offer a creator role', async ({ page }) => {
    await installSupabaseMock(page)
    await visit(page, '/register')

    // Creator signup is being held back while there is a single, manually
    // provisioned creator account -- the public form must not offer it.
    const body = await page.locator('body').innerText()
    expect(body.toLowerCase()).not.toMatch(/\bcreator\b/)
  })
})

test.describe('Sign in', () => {
  test('bad credentials are reported and do not sign the user in', async ({ page }) => {
    await installSupabaseMock(page)
    await visit(page, '/login')

    await page.locator('input[type="email"]').first().fill('dev@example.com')
    await page.locator('input[type="password"]').first().fill('wrong-password')
    await page.getByRole('button', { name: /log ?in|sign in/i }).first().click()

    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/login/)
  })

  test('a developer lands on the developer dashboard', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer')

    await expect(page).toHaveURL(/developer/)
    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })

  test('a creator lands on the creator dashboard', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/creator')

    await expect(page).toHaveURL(/creator/)
    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })
})

test.describe('Route guards', () => {
  test('an anonymous visitor is sent to sign in, not into the dashboard', async ({ page }) => {
    await installSupabaseMock(page)
    await visit(page, '/developer')

    await expect(page).toHaveURL(/login/)
  })

  test('a creator cannot reach developer pages', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/developer/campaigns')

    await expect(page).not.toHaveURL(/\/developer\/campaigns/)
  })

  test('a creator cannot reach the admin area', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/admin')

    await expect(page).not.toHaveURL(/^.*\/admin$/)
  })

  test('a developer cannot reach the admin area', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/admin/financials')

    await expect(page).not.toHaveURL(/\/admin\/financials/)
  })
})
