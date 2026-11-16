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

  test('an anonymous enquiry does not ask to read the lead back, and is not mistaken for a bot when autofilled', async ({ page }) => {
    const state = await installSupabaseMock(page)

    // Anonymous visitors may insert leads but not select them (RLS), and
    // Postgres applies SELECT policies to INSERT ... RETURNING. Requesting the
    // row back therefore failed every real anonymous enquiry.
    const leadInsertPrefers = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/rest/v1/leads')) {
        leadInsertPrefers.push(request.headers()['prefer'] || '')
      }
    })

    await visit(page, '/lead/camp-1')
    await page.getByLabel('Full Name').fill('Autofill Visitor')
    await page.getByLabel('Email Address').fill('autofill@example.com')
    await page.getByLabel('Phone Number').fill('0821112222')

    // The honeypot must not look like anything a browser would autofill.
    const honeypot = page.locator('[aria-hidden="true"] input')
    const attrs = await honeypot.evaluate((el) =>
      `${el.id} ${el.name} ${el.labels?.[0]?.textContent || ''}`.toLowerCase())
    expect(attrs).not.toMatch(/company|organi[sz]ation|website|url|business|address|email|phone|name/)

    await page.waitForTimeout(2100)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Submit Enquiry' }).click()

    await expect
      .poll(() => state.inserts.filter((i) => i.table === 'leads').length, { timeout: 10_000 })
      .toBeGreaterThan(0)

    const lead = state.inserts.find((i) => i.table === 'leads').rows[0]
    expect(lead.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(leadInsertPrefers.join(' ')).not.toContain('return=representation')
    await expect(page.getByText('Thank You!')).toBeVisible()
  })

  test('an apartment enquiry asks rent or buy, defaults to rent, and the questions follow', async ({ page }) => {
    const state = await installSupabaseMock(page)
    await visit(page, '/lead/camp-1')

    // camp-1 is an apartment: renting is the default.
    await expect(page.getByRole('radio', { name: 'Rent' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('When would you like to move in?')).toBeVisible()
    await expect(page.getByLabel('Monthly Budget (Optional)')).toBeVisible()
    await expect(page.getByText('When are you looking to buy?')).toHaveCount(0)

    // Switching to Buy swaps the questions.
    await page.getByRole('radio', { name: 'Buy' }).click()
    await expect(page.getByLabel('When are you looking to buy?')).toBeVisible()
    await expect(page.getByLabel('Budget Range (Optional)')).toBeVisible()

    // Back to Rent and submit: the answers are stored in rental terms.
    await page.getByRole('radio', { name: 'Rent' }).click()
    await page.getByLabel('Full Name').fill('Renting Visitor')
    await page.getByLabel('Email Address').fill('renter@example.com')
    await page.getByLabel('Phone Number').fill('0821119999')
    await page.getByLabel('When would you like to move in?').selectOption('within-1month')
    await page.getByLabel('Monthly Budget (Optional)').fill('R8,000')
    await page.waitForTimeout(2100)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Submit Enquiry' }).click()

    await expect
      .poll(() => state.inserts.filter((i) => i.table === 'leads').length, { timeout: 10_000 })
      .toBeGreaterThan(0)
    const lead = state.inserts.find((i) => i.table === 'leads').rows[0]
    expect(JSON.parse(lead.notes)).toMatchObject({ intent: 'rent', timeline: 'within-1month', budget: 'R8,000' })
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

  test('a short /r/ referral link opens the campaign enquiry page with the code attached', async ({ page }) => {
    const state = await installSupabaseMock(page)
    await visit(page, '/r/CRE-SEAPT001')

    await expect(page).toHaveURL(/\/lead\/camp-1\?ref=CRE-SEAPT001$/)
    await expect(page.getByText(/The Atlantic|Sea Point Launch/i).first()).toBeVisible()

    await page.getByLabel('Full Name').fill('Short Link Visitor')
    await page.getByLabel('Email Address').fill('shortlink@example.com')
    await page.getByLabel('Phone Number').fill('0823334444')
    await page.waitForTimeout(2100)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Submit Enquiry' }).click()

    await expect
      .poll(() => state.inserts.filter((i) => i.table === 'leads').length, { timeout: 10_000 })
      .toBeGreaterThan(0)
    const lead = state.inserts.find((i) => i.table === 'leads').rows[0]
    // The database credits the creator from this code (migration 038).
    expect(lead.tracking_token).toBe('CRE-SEAPT001')
  })

  test('an unknown short link says so instead of loading forever', async ({ page }) => {
    await installSupabaseMock(page)
    await visit(page, '/r/CRE-NOPE0000')
    await expect(page.getByText('This link is no longer active.')).toBeVisible()
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
