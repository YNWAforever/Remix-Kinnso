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

// R2B: the merchant app moved under /merchants/dashboard/* — old URLs are in-repo
// permanentRedirect (308) stubs, not seo_redirects rows. The legacy paths are
// deliberately NOT in the proxy's auth gate, so anon requests get the 308 first
// (the dashboard target then handles its own gating).
const MERCHANT_MOVES = [
  ['/en/merchants/post', '/en/merchants/dashboard/post'],
  ['/en/merchants/missions', '/en/merchants/dashboard/missions'],
  ['/en/merchants/creators', '/en/merchants/dashboard/creators'],
  ['/en/merchants/insights', '/en/merchants/dashboard/insights'],
  ['/zh-hk/merchants/post', '/zh-hk/merchants/dashboard/post'],
] as const

for (const [from, to] of MERCHANT_MOVES) {
  test(`legacy merchant route ${from} 308s to ${to}`, async ({ request, baseURL }) => {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(new URL(res.headers()['location'], baseURL).pathname).toBe(to)
  })
}
