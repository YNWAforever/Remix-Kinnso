import { describe, it, expect } from 'vitest'
import { buildArticleMetadata, buildListingMetadata, SITE_URL } from '@/lib/seo/metadata'
import { LOCALES } from '@/lib/i18n/config'

const base = {
  urlCategory: 'dining' as const, url: 'ramen-guide', locale: 'en' as const,
  presentLocales: ['en', 'zh-hk'] as const,
  title: 'Best Ramen', metaTitle: null, summary: 'A guide', metaDescription: null,
  ogImage: 'https://cdn.kinnso.ai/og.jpg', publishedAt: '2026-06-01T00:00:00Z',
  editAt: '2026-06-10T00:00:00Z', isCoupon: false,
}

describe('buildArticleMetadata', () => {
  it('builds title (suffix), canonical, and present-only hreflang + x-default', () => {
    const m = buildArticleMetadata(base)
    expect(m.title).toBe('Best Ramen - Kinnso')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles/dining/ramen-guide`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual(['en', 'x-default', 'zh-hk'])
    expect(langs['zh-hk']).toBe(`${SITE_URL}/zh-hk/articles/dining/ramen-guide`)
    expect(langs['x-default']).toBe(`${SITE_URL}/en/articles/dining/ramen-guide`)
  })
  it('prefers meta_title; description falls back to summary', () => {
    const m = buildArticleMetadata({ ...base, metaTitle: 'SEO Title', metaDescription: null })
    expect(m.title).toBe('SEO Title - Kinnso')
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
  it('category: canonical, all 7 locale hreflang keys + x-default, correct URLs', () => {
    const m = buildListingMetadata({ urlCategory: 'dining', locale: 'en', presentLocales: LOCALES, title: 'Dining' })
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles/dining`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect(langs['x-default']).toBe(`${SITE_URL}/en/articles/dining`)
    expect(langs['zh-hk']).toBe(`${SITE_URL}/zh-hk/articles/dining`)
    expect((m.robots as any).index).toBe(true)
  })

  it('hub (urlCategory null): canonical points to /articles without category segment', () => {
    const m = buildListingMetadata({ urlCategory: null, locale: 'en', presentLocales: LOCALES, title: 'Articles' })
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles`)
  })
})
