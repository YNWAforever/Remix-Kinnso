import { test, expect } from '@playwright/test'

const bookingLive = process.env.BOOKING_LIVE === 'true'

test('home to a published guide to its linked experience', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('body')).toContainText(/featured/i)

  const guideLinks = await page.locator('a[href^="/en/g/"]').evaluateAll((links) =>
    [...new Set(
      links
        .filter((link) => (link as HTMLElement).offsetParent !== null)
        .map((link) => (link as HTMLAnchorElement).getAttribute('href'))
        .filter((href): href is string => Boolean(href)),
    )],
  )
  expect(guideLinks.length, 'home should expose at least one featured guide').toBeGreaterThan(0)

  let experienceHref: string | null = null
  for (const guideHref of guideLinks) {
    await page.goto(guideHref)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('a[href^="/en/c/"]').first()).toBeVisible()
    experienceHref = await page
      .locator('a[href^="/en/experiences/"][href*="src=guide"]')
      .first()
      .getAttribute('href')
    if (experienceHref) break
  }

  expect(experienceHref, 'a featured guide should link to a nearby experience attributed to the guide').toBeTruthy()
  await page.goto(experienceHref as string)
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('body')).toContainText(/(?:HKD|USD|SGD|JPY|KRW|THB|TWD|CNY)\s*[\d,]+/)

  if (bookingLive) {
    await page.locator('#booking-email').fill('r7-smoke@example.com')
    await page.getByRole('button', { name: /book now/i }).click()
    await page.waitForURL('https://checkout.stripe.com/**', { timeout: 30_000 })
  }
})
