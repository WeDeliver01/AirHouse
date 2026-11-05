import { expect, test } from '@playwright/test'
import { installSupabaseMock, visit } from './support/supabaseMock.js'

/**
 * Journeys: lead tracking and lead attribution.
 *
 * The lead-capture page is the only place an unauthenticated visitor writes
 * to the database, so these cover what the visitor sees and what the form
 * actually sends.
 */

test.describe('Public pages', () => {
  test('the home page loads and offers a way in', async ({ page }) => {
    await installSupabaseMock(page)
    await visit(page, '/')

    await expect(page).toHaveTitle(/AirHouse/i)
    await expect(page.getByRole('button', { name: /log ?in/i }).first()).toBeVisible()
  })

  test('the privacy policy is reachable, as the consent text promises', async ({ page }) => {
    await installSupabaseMock(page)
    await visit(page, '/legal/privacy')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('body')).toContainText(/privacy/i)
  })
})

test.describe('Lead capture', () => {
  test('a visitor can submit an enquiry, and consent is recorded with it', async ({ page }) => {
    const state = await installSupabaseMock(page)
    await visit(page, '/lead/camp-1')

    await expect(page.getByText(/The Atlantic|Sea Point Launch/i).first()).toBeVisible()

    await page.getByLabel('Full Name').fill('Sipho Dlamini')
    await page.getByLabel('Email Address').fill('sipho.new@example.com')
    await page.getByLabel('Phone Number').fill('0821234567')

    // The minimum time-on-form guard rejects anything faster than a human.
    await page.waitForTimeout(2100)

    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Submit Enquiry' }).click()

    await expect
      .poll(() => state.inserts.filter((i) => i.table === 'leads').length, { timeout: 10_000 })
      .toBeGreaterThan(0)

    const lead = state.inserts.find((i) => i.table === 'leads').rows[0]
    expect(lead.consent_given).toBe(true)
    expect(lead.consent_text).toMatch(/contact me about this property/i)
    expect(lead.lead_email).toBe('sipho.new@example.com')
  })

  test('an enquiry without consent is refused before anything is sent', async ({ page }) => {
    const state = await installSupabaseMock(page)
    await visit(page, '/lead/camp-1')

    await page.getByLabel('Full Name').fill('No Consent')
    await page.getByLabel('Email Address').fill('noconsent@example.com')
    await page.getByLabel('Phone Number').fill('0820000000')
    await page.waitForTimeout(2100)

    await page.getByRole('button', { name: 'Submit Enquiry' }).click()

    await expect(page.getByText(/agree to be contacted/i)).toBeVisible()
    expect(state.inserts.filter((i) => i.table === 'leads')).toHaveLength(0)
  })

  test('a malformed email is refused before anything is sent', async ({ page }) => {
    const state = await installSupabaseMock(page)
    await visit(page, '/lead/camp-1')

    await page.getByLabel('Full Name').fill('Bad Email')
    await page.getByLabel('Email Address').fill('not-an-email')
    await page.getByLabel('Phone Number').fill('0820000000')
    await page.waitForTimeout(2100)

    await page.getByRole('button', { name: 'Submit Enquiry' }).click()
    await page.waitForTimeout(800)

    // The field is type=email and required, so the browser blocks submission
    // before React's handler runs. What matters is that nothing was sent.
    expect(state.inserts.filter((i) => i.table === 'leads')).toHaveLength(0)
    await expect(page.getByRole('button', { name: 'Submit Enquiry' })).toBeVisible()
  })

  test('the referral code in the URL is carried into the lead for attribution', async ({ page }) => {
    const state = await installSupabaseMock(page)
    await visit(page, '/lead/camp-1?ref=TRK-SEAPOINT-01')

    await page.getByLabel('Full Name').fill('Attributed Visitor')
    await page.getByLabel('Email Address').fill('attributed@example.com')
    await page.getByLabel('Phone Number').fill('0829999999')
    await page.waitForTimeout(2100)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Submit Enquiry' }).click()

    await expect
      .poll(() => state.inserts.filter((i) => i.table === 'leads').length, { timeout: 10_000 })
      .toBeGreaterThan(0)

    const lead = state.inserts.find((i) => i.table === 'leads').rows[0]
    // The database decides whether this attribution is honoured; the page's
    // job is to pass it through faithfully.
    expect(lead.tracking_code || lead.referral_code).toBeTruthy()
  })

  test('the developer email address is not exposed to an anonymous visitor', async ({ page }) => {
    await installSupabaseMock(page)

    const payloads = []
    page.on('response', async (response) => {
      if (response.url().includes('/rest/v1/campaigns')) {
        try { payloads.push(await response.text()) } catch { /* ignore */ }
      }
    })

    await visit(page, '/lead/camp-1')
    await expect(page.getByText(/The Atlantic|Sea Point Launch/i).first()).toBeVisible()

    // AH-008: the public page used to select the developer's email.
    expect(payloads.join('\n')).not.toContain('dev@example.com')
  })
})
