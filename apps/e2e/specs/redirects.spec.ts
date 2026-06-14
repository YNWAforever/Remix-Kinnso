import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

test('legacy /post redirect → 301 → locale-prefixed article', async ({ request, page }) => {
  const res = await request.get(FIXTURES.redirect.from, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(new URL(res.headers()['location']).pathname).toBe(FIXTURES.redirect.to)

  await page.goto(FIXTURES.redirect.from)
  expect(new URL(page.url()).pathname).toBe(FIXTURES.redirect.to)
})

test('locale-prefixed legacy redirect preserves the locale', async ({ request }) => {
  const res = await request.get(FIXTURES.redirectHk.from, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(new URL(res.headers()['location']).pathname).toBe(FIXTURES.redirectHk.to)
})
