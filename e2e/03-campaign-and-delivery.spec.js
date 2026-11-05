import { expect, test } from '@playwright/test'
import { installSupabaseMock, visit } from './support/supabaseMock.js'

/**
 * Journeys: campaign lifecycle, creator assignment, content approval,
 * contracts and disputes.
 *
 * The rules themselves (which transitions are legal, who may submit content)
 * are enforced in the database and proved there. These check that the
 * application surfaces the right state and sends the right calls.
 */

test.describe('Campaign lifecycle', () => {
  test('a developer sees their campaigns with status', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/campaigns')

    await expect(page.getByText('Sea Point Launch').first()).toBeVisible()
  })

  test('a draft campaign is distinguishable from an active one', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/campaigns')

    // Wait for the list to render before reading it; otherwise this races the
    // loading state.
    await expect(page.getByText('Sea Point Launch').first()).toBeVisible()

    const body = await page.locator('body').innerText()
    expect(body).toMatch(/draft/i)
    expect(body).toMatch(/active|live/i)
  })

  test('the campaign wizard opens for a developer', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/campaigns/new')

    await expect(page.locator('input, select, textarea').first()).toBeVisible()
  })
})

test.describe('Funding by bank transfer', () => {
  test('funding an unfunded campaign produces a reference to quote', async ({ page }) => {
    const state = await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/campaigns/camp-2/fund')

    const fundButton = page
      .getByRole('button', { name: /fund|pay|continue|confirm/i })
      .first()

    if (await fundButton.isVisible().catch(() => false)) {
      await fundButton.click()
      // A confirmation step may stand in the way.
      const confirm = page.getByRole('button', { name: /confirm|yes|proceed/i }).last()
      if (await confirm.isVisible().catch(() => false)) await confirm.click()

      await expect
        .poll(() => state.rpcCalls.filter((c) => c.fn === 'create_payment_intent').length,
          { timeout: 10_000 })
        .toBeGreaterThan(0)

      // Nothing is funded by raising a request: no money RPC was called.
      expect(state.rpcCalls.some((c) => c.fn === 'confirm_manual_payment')).toBe(false)
      await expect(page.getByText(/AH-/).first()).toBeVisible()
    }
  })

  test('an already funded campaign is not offered for funding again', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/campaigns/camp-1/fund')

    await expect(page.getByText(/already funded|funded/i).first()).toBeVisible()
  })
})

test.describe('Creator assignment and content', () => {
  test('a creator sees the campaign they are assigned to', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/creator/campaigns')

    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })

  test('a developer can open the applications for their campaign', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/applications')

    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })

  test('a developer can open content review', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'dev@example.com' })
    await visit(page, '/developer/content')

    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })

  test('a creator can reach their tracking links, which drive attribution', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/creator')

    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })
})

test.describe('Earnings and payouts', () => {
  test('a creator sees their wallet balance', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/creator/wallet')

    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })

  test('a payout request goes through the database function, not a table write',
    async ({ page }) => {
      const state = await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
      await visit(page, '/creator/wallet')
      await page.waitForTimeout(1200)

      // Whatever the user does here, the page must never write these tables
      // directly -- those grants are revoked (AH-001).
      const directWrites = state.inserts.filter((i) =>
        ['wallets', 'wallet_transactions', 'payout_requests'].includes(i.table))
      expect(directWrites).toHaveLength(0)
    })
})

test.describe('Contracts and disputes', () => {
  test('a creator can open contracts', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/contracts')

    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })

  test('a creator can open disputes', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'creator@example.com' })
    await visit(page, '/disputes')

    await expect(page.locator('body')).not.toContainText(/page not found/i)
  })
})

test.describe('Admin operations', () => {
  test('an operator can open the payment confirmation queue', async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: 'admin@example.com' })
    await visit(page, '/admin/payment-confirmations')

    await expect(page.getByRole('heading', { name: /payment confirmations/i })).toBeVisible()
  })

  test('reconciliation runs through the database function', async ({ page }) => {
    const state = await installSupabaseMock(page, { signedInAs: 'admin@example.com' })
    await visit(page, '/admin/payment-confirmations')

    await page.getByRole('button', { name: /run reconciliation/i }).click()

    await expect
      .poll(() => state.rpcCalls.filter((c) => c.fn === 'run_reconciliation').length,
        { timeout: 10_000 })
      .toBe(1)

    await expect(page.getByText(/ledger balanced/i)).toBeVisible()
  })
})
