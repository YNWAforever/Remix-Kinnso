import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

test('flagship SEO head (en): canonical, og:type, hreflang, JSON-LD dateModified', async ({ page }) => {
  await page.goto(FIXTURES.flagship.path)

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(canonical).toContain('/en/articles/dining/ramen-guide')

  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')

  for (const hl of FIXTURES.presentLocales) {
    expect(await page.locator(`link[rel="alternate"][hreflang="${hl}"]`).count()).toBe(1)
  }
  expect(await page.locator('link[rel="alternate"][hreflang="x-default"]').count()).toBe(1)

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const ld = blocks.flatMap((t) => {
    const parsed = JSON.parse(t)
    return Array.isArray(parsed) ? parsed : [parsed]
  })
  const article = ld.find((o: { '@type'?: string }) => o['@type'] === 'Article') as
    | { dateModified?: string }
    | undefined
  expect(article?.dateModified).toBeTruthy()
  expect(ld.some((o: { '@type'?: string }) => o['@type'] === 'FAQPage')).toBe(true)
})

test('reciprocal hreflang on zh-hk flagship', async ({ page }) => {
  await page.goto(FIXTURES.flagshipHk.path)
  expect(await page.locator('link[rel="alternate"][hreflang="en"]').count()).toBe(1)
  expect(await page.locator('link[rel="alternate"][hreflang="zh-hk"]').count()).toBe(1)
})

test('EN coupon is noindex; zh-hk coupon is indexable', async ({ page }) => {
  await page.goto(FIXTURES.couponEn.path)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

  await page.goto(FIXTURES.couponHk.path)
  await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/)
})
