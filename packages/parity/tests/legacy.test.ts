import { describe, it, expect } from 'vitest'
import { createLegacySource, MYSQL_MODE_NOT_IMPLEMENTED } from '../src/sources/legacy'

describe('legacy source (default = fixtures)', () => {
  it('returns the seed-derived expected baseline when no mode flag is given', async () => {
    const legacy = await createLegacySource({})

    const urls = await legacy.expectedUrlPaths()
    expect(urls.size).toBe(8)
    expect(urls.has('/en/articles/dining/ramen-guide')).toBe(true)
    expect(urls.has('/zh-hk/articles/shopping/mall-coupon')).toBe(true)

    expect(await legacy.localeCounts()).toEqual({ en: 5, 'zh-hk': 3 })

    const redirects = await legacy.redirectSamples()
    expect(redirects).toContainEqual({ from: '/post/old-ramen', to: '/en/articles/dining/ramen-guide' })
    expect(redirects).toContainEqual({ from: '/zh-hk/post/old-ramen', to: '/zh-hk/articles/dining/ramen-guide' })

    const negatives = await legacy.negativePaths()
    expect(negatives).toContain('/en/articles/destinations/expired-article')
    expect(negatives).toContain('/ja/articles/dining/ramen-guide')
  })
})

describe('legacy source (--legacy-mysql)', () => {
  /**
   * The mode used to return empty sets from TODO stubs. Every check is vacuous against an
   * empty baseline (no URLs to cover, no locales to count), so the cutover gate exited 0
   * having proved nothing. Refusing to construct is the only safe behaviour.
   */
  it('refuses to build, rather than handing back an empty baseline that passes vacuously', async () => {
    await expect(createLegacySource({ mysqlDsn: 'mysql://user:pw@legacy/kinnso' }))
      .rejects.toThrow(MYSQL_MODE_NOT_IMPLEMENTED)
  })

  it('says why, and points at the working alternative', () => {
    expect(MYSQL_MODE_NOT_IMPLEMENTED).toMatch(/not implemented/i)
    expect(MYSQL_MODE_NOT_IMPLEMENTED).toContain('--legacy-sitemap')
  })

  it('takes precedence over --legacy-sitemap, so a run asking for mysql never silently downgrades', async () => {
    await expect(createLegacySource({ mysqlDsn: 'mysql://legacy', sitemapUrl: 'https://legacy.test/sitemap.xml' }))
      .rejects.toThrow(MYSQL_MODE_NOT_IMPLEMENTED)
  })
})
