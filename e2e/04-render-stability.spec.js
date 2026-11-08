import { expect, test } from '@playwright/test'
import { installSupabaseMock, visit } from './support/supabaseMock.js'

// Guards against a refetch loop introduced by useCallback dependencies that
// are not stable: the page would keep re-requesting forever.
const PAGES = [
  ['creator@example.com', '/creator'],
  ['creator@example.com', '/creator/campaigns'],
  ['creator@example.com', '/creator/wallet'],
  ['dev@example.com', '/developer'],
  ['dev@example.com', '/developer/campaigns'],
  ['dev@example.com', '/developer/applications'],
  ['admin@example.com', '/admin'],
]

for (const [who, path] of PAGES) {
  test(`${path} settles instead of refetching forever`, async ({ page }) => {
    await installSupabaseMock(page, { signedInAs: who })

    let requests = 0
    page.on('request', (r) => {
      if (r.url().includes('stub.supabase.co/rest')) requests += 1
    })

    await visit(page, path)
    await page.waitForTimeout(2500)
    const afterSettle = requests

    await page.waitForTimeout(2500)
    const later = requests

    // A couple of late requests are fine; a loop climbs without stopping.
    expect(later - afterSettle).toBeLessThan(5)
  })
}
