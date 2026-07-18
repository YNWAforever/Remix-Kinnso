import { expect, test } from '@playwright/test'

const forbidden = [
  'picsum.photos',
  'example.com',
  'maps.example',
  'jane doe',
  'lorem ipsum',
] as const

const routes = [
  '/en',
  '/en/explore',
  '/en/articles',
  '/en/c/r7-smoke-creator',
  '/en/m/r7-smoke-tokyo-host',
] as const

const smokeGuide = {
  href: '/en/g/r7-smoke-tokyo-guide',
  cover: 'https://cdn.kinnso.ai/r7-smoke-tokyo-guide.jpg',
} as const

for (const route of routes) {
  test(`honest rendered HTML: ${route}`, async ({ page }) => {
    const response = await page.goto(route)
    expect(response?.status(), `${route} should return HTTP 200`).toBe(200)

    const html = (await page.content()).toLowerCase()
    for (const token of forbidden) expect(html).not.toContain(token)

    if (route === '/en') {
      const image = page.locator(`a[href="${smokeGuide.href}"] img`).first()
      await expect(image).toBeVisible()

      const optimizedSrc = await image.getAttribute('src')
      expect(optimizedSrc, 'seeded guide should render through Next Image').toBeTruthy()
      const optimizedUrl = new URL(optimizedSrc!, 'http://localhost')
      expect(optimizedUrl.pathname).toBe('/_next/image')
      expect(optimizedUrl.searchParams.get('url')).toBe(smokeGuide.cover)
    }

    if (route === '/en/c/r7-smoke-creator') {
      await expect(page.locator('[data-media-placeholder="true"]').first()).toBeVisible()
    }
  })
}
