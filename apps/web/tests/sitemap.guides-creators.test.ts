import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/articles/queries', () => ({
  getPublishedForSitemap: async () => [
    { url: 'ramen', category: 'dining', lastmod: '2026-06-01T00:00:00Z', locales: ['en', 'zh-hk'] },
  ],
}))
vi.mock('@/lib/guides/queries', () => ({
  getGuidesForSitemap: async () => [{ slug: 'kyoto-tea', lastmod: '2026-06-02T00:00:00Z' }],
}))
vi.mock('@/lib/creators/queries', () => ({
  getCreatorsForSitemap: async () => [{ handle: 'maya', lastmod: '2026-06-03T00:00:00Z' }],
}))

import sitemap from '@/app/sitemap'
import { LOCALES } from '@/lib/i18n/config'

const SITE = 'https://www.kinnso.ai'

describe('sitemap — guides, creators, marketing', () => {
  it('emits each guide and creator for all 7 locales', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const l of LOCALES) {
      expect(urls).toContain(`${SITE}/${l}/g/kyoto-tea`)
      expect(urls).toContain(`${SITE}/${l}/c/maya`)
    }
  })
  it('includes the home + key marketing routes per locale', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(`${SITE}/en`)
    expect(urls).toContain(`${SITE}/en/explore`)
    expect(urls).toContain(`${SITE}/en/creators`)
  })
  it('still includes the articles hub', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(`${SITE}/en/articles`)
    expect(urls).toContain(`${SITE}/en/articles/dining/ramen`)
  })
})
