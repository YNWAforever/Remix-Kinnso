import { describe, it, expect } from 'vitest'
import {
  buildArticleMetadata, buildListingMetadata,
  buildPageMetadata, buildGuideMetadata, buildCreatorMetadata, noindexMetadata,
  SITE_URL,
} from '@/lib/seo/metadata'
import { LOCALES } from '@/lib/i18n/config'

const base = {
  urlCategory: 'dining' as const, url: 'ramen-guide', locale: 'en' as const,
  presentLocales: ['en', 'zh-hk'] as const,
  title: 'Best Ramen', metaTitle: null, summary: 'A guide', metaDescription: null,
  ogImage: 'https://cdn.kinnso.ai/og.jpg', publishedAt: '2026-06-01T00:00:00Z',
  editAt: '2026-06-10T00:00:00Z', isCoupon: false,
}

describe('buildArticleMetadata', () => {
  it('builds a bare title (branded by the layout template), canonical, present-only hreflang + x-default', () => {
    const m = buildArticleMetadata(base)
    expect(m.title).toBe('Best Ramen')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles/dining/ramen-guide`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual(['en', 'x-default', 'zh-hk'])
    expect(langs['zh-hk']).toBe(`${SITE_URL}/zh-hk/articles/dining/ramen-guide`)
    expect(langs['x-default']).toBe(`${SITE_URL}/en/articles/dining/ramen-guide`)
  })
  it('points x-default at the current locale when EN is not a present translation', () => {
    const m = buildArticleMetadata({ ...base, locale: 'zh-hk', presentLocales: ['zh-hk'] })
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual(['x-default', 'zh-hk'])
    expect(langs['x-default']).toBe(`${SITE_URL}/zh-hk/articles/dining/ramen-guide`)
    expect(langs['x-default']).not.toBe(`${SITE_URL}/en/articles/dining/ramen-guide`)
  })
  it('prefers meta_title; description falls back to summary', () => {
    const m = buildArticleMetadata({ ...base, metaTitle: 'SEO Title', metaDescription: null })
    expect(m.title).toBe('SEO Title')
    expect(m.description).toBe('A guide')
  })
  it('sets og:type=article with modifiedTime from editAt', () => {
    const og = buildArticleMetadata(base).openGraph as any
    expect(og.type).toBe('article')
    expect(og.publishedTime).toBe('2026-06-01T00:00:00Z')
    expect(og.modifiedTime).toBe('2026-06-10T00:00:00Z')
    expect(og.images).toEqual(['https://cdn.kinnso.ai/og.jpg'])
  })
  it('noindexes EN coupon articles only', () => {
    expect((buildArticleMetadata({ ...base, isCoupon: true, locale: 'en' }).robots as any).index).toBe(false)
    expect((buildArticleMetadata({ ...base, isCoupon: true, locale: 'zh-hk' }).robots as any).index).toBe(true)
  })
})

describe('buildListingMetadata', () => {
  it('category: bare title, canonical, all 7 hreflang + x-default', () => {
    const m = buildListingMetadata({ urlCategory: 'dining', locale: 'en', presentLocales: LOCALES, title: 'Dining' })
    expect(m.title).toBe('Dining')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles/dining`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect(langs['zh-hk']).toBe(`${SITE_URL}/zh-hk/articles/dining`)
    expect((m.robots as any).index).toBe(true)
  })
  it('hub (urlCategory null): canonical points to /articles', () => {
    const m = buildListingMetadata({ urlCategory: null, locale: 'en', presentLocales: LOCALES, title: 'Articles' })
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles`)
  })
})

describe('buildPageMetadata', () => {
  it('self-canonical + all 7 hreflang + x-default for a marketing path', () => {
    const m = buildPageMetadata({ path: '/explore', locale: 'zh-hk', title: 'Explore', description: 'Browse guides' })
    expect(m.title).toBe('Explore')
    expect(m.description).toBe('Browse guides')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/zh-hk/explore`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect(langs['x-default']).toBe(`${SITE_URL}/en/explore`)
    expect((m.openGraph as any).type).toBe('website')
    // child marketing pages must reference the default OG card explicitly (they don't inherit it)
    expect((m.openGraph as any).images).toEqual([`${SITE_URL}/zh-hk/opengraph-image`])
    expect((m.twitter as any).images).toEqual([`${SITE_URL}/zh-hk/opengraph-image`])
    expect((m.twitter as any).card).toBe('summary_large_image')
    expect((m.robots as any).index).toBe(true)
  })
  it('home (path "") canonicalises to the locale root', () => {
    const m = buildPageMetadata({ path: '', locale: 'en', title: 'Home', description: 'd' })
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en`)
    expect((m.alternates!.languages as Record<string, string>)['ja']).toBe(`${SITE_URL}/ja`)
  })
})

describe('buildGuideMetadata', () => {
  it('og:type=article, self-canonical, 7 hreflang under /g/<slug>', () => {
    const m = buildGuideMetadata({ slug: 'kyoto-tea', locale: 'en', title: 'Kyoto Tea', description: 'Tea houses' })
    expect(m.title).toBe('Kyoto Tea')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/g/kyoto-tea`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect((m.openGraph as any).type).toBe('article')
    expect((m.robots as any).index).toBe(true)
  })
})

describe('buildCreatorMetadata', () => {
  it('og:type=profile, self-canonical, 7 hreflang under /c/<handle>', () => {
    const m = buildCreatorMetadata({ handle: 'maya', locale: 'ja', name: 'Maya', bio: 'Slow travel' })
    expect(m.title).toBe('Maya (@maya)')
    expect(m.description).toBe('Slow travel')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/ja/c/maya`)
    expect((m.openGraph as any).type).toBe('profile')
  })
  it('falls back to a generic description when bio is empty', () => {
    const m = buildCreatorMetadata({ handle: 'maya', locale: 'en', name: 'Maya', bio: '' })
    expect(m.description).toContain('@maya')
  })
})

describe('noindexMetadata', () => {
  it('marks the page noindex,nofollow', () => {
    const m = noindexMetadata()
    expect((m.robots as any).index).toBe(false)
    expect((m.robots as any).follow).toBe(false)
  })
})
