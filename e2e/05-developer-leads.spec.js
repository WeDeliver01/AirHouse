import { expect, test } from '@playwright/test'
import { installSupabaseMock, visit } from './support/supabaseMock.js'

/**
 * Journeys: a developer sees every enquiry they have received.
 *
 * Leads arrive by two routes -- a campaign link (campaign_id) and the
 * property's own public page (property_id, no campaign). Developer pages
 * used to filter on campaign_id alone, so direct enquiries never showed up.
 */

test.describe('Developer leads', () => {
  test('the pipeline shows direct property enquiries alongside campaign leads', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/leads')

    await expect(page.getByText('Sipho Dlamini').first()).toBeVisible()
    await expect(page.getByText('Lerato Direct').first()).toBeVisible()
    // Another developer's direct enquiry is out of scope.
    await expect(page.getByText('Not Yours')).toHaveCount(0)

    await page.getByText('Lerato Direct').first().click()
    await expect(page.getByText('Property (direct enquiry)')).toBeVisible()
    await expect(page.getByText('Harbour View Lofts').first()).toBeVisible()
  })

  test('the developer reads a rental enquiry\'s answers, not raw data', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/leads')
    await page.getByText('Sipho Dlamini').first().click()

    await expect(page.getByText('Looking to')).toBeVisible()
    await expect(page.getByText('Within a month')).toBeVisible()
    await expect(page.getByText('R8,000')).toBeVisible()
    await expect(page.getByText('"timeline"')).toHaveCount(0)
  })

  test('the Direct filter narrows the pipeline to property-page enquiries', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/leads')
    await expect(page.getByText('Lerato Direct').first()).toBeVisible()

    await page.getByLabel('Campaign').selectOption('__direct')

    await expect(page.getByText('Lerato Direct').first()).toBeVisible()
    await expect(page.getByText('Sipho Dlamini')).toHaveCount(0)
  })
})
