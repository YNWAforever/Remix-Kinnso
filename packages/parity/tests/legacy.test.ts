import { describe, it, expect } from 'vitest'
import { createLegacySource } from '../src/sources/legacy'

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
