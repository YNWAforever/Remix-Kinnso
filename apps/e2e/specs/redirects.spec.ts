import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

// The proxy emits a relative Location header (e.g. "/en/articles/dining/ramen-guide"),
// which is valid per RFC 7231. Resolve it against baseURL before reading .pathname so the
// assertion works whether the header is relative or absolute (mirrors the parity check).
test('legacy /post redirect → 301 → locale-prefixed article', async ({ request, page, baseURL }) => {
  const res = await request.get(FIXTURES.redirect.from, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(new URL(res.headers()['location'], baseURL).pathname).toBe(FIXTURES.redirect.to)

  await page.goto(FIXTURES.redirect.from)
  expect(new URL(page.url()).pathname).toBe(FIXTURES.redirect.to)
})

test('locale-prefixed legacy redirect preserves the locale', async ({ request, baseURL }) => {
  const res = await request.get(FIXTURES.redirectHk.from, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(new URL(res.headers()['location'], baseURL).pathname).toBe(FIXTURES.redirectHk.to)
})
