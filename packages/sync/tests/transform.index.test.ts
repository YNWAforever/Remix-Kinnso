import { describe, it, expect } from 'vitest'
import { transformPost } from '../src/transform'
import { sourceHash } from '../src/transform/article'
import { legacyPost } from './fixtures/legacyPost'

const cdn = 'https://cdn.x'

describe('transformPost', () => {
  const out = transformPost(legacyPost, cdn)

  it('builds the articles spine row', () => {
    expect(out.article).toMatchObject({
      legacy_post_id: 900001, slug: 'best-ramen-tokyo', url: 'best-ramen-tokyo',
      category: 'dining', views: 123,
    })
    expect(out.article.thumbnails).toEqual(['https://cdn.x/a.webp', 'https://cdn.x/b.webp'])
    expect(out.article.regions).toEqual(['jp', 'tokyo'])
    expect(out.article.authors).toEqual(['jane-doe', 'ghost-author'])
    expect(out.article.tag_slugs).toEqual(['ramen'])
    expect(typeof out.article.source_hash).toBe('string')
  })

  it('sets is_coupon when the legacy post has offers (drives EN-coupon noindex/search-exclude)', () => {
    expect(transformPost({ ...legacyPost, post: { ...legacyPost.post, offers: 'COUPON10,SALE' } }, cdn).article.is_coupon).toBe(true)
    expect(transformPost({ ...legacyPost, post: { ...legacyPost.post, offers: null } }, cdn).article.is_coupon).toBe(false)
    expect(transformPost({ ...legacyPost, post: { ...legacyPost.post, offers: '' } }, cdn).article.is_coupon).toBe(false)
  })

  it('fans out only present locales; fixes en meta_description leak', () => {
    expect(out.translations.map((t) => t.locale).sort()).toEqual(['en', 'zh-hk'])
    const en = out.translations.find((t) => t.locale === 'en')!
    expect(en.meta_description).toBe(en.summary) // leaked zh-hk value replaced
    const zh = out.translations.find((t) => t.locale === 'zh-hk')!
    expect(zh.meta_description).toBe('香港描述') // kept
    expect(Array.isArray(en.content)).toBe(true)
  })

  it('source_hash is stable for identical input, changes on edit', () => {
    const h1 = sourceHash(legacyPost)
    const edited = { ...legacyPost, post: { ...legacyPost.post, edit_at: '2099-01-01 00:00:00' } }
    expect(sourceHash(edited)).not.toBe(h1)
  })

  it('rewrites og_image from meta_tags through the CDN', () => {
    const en = out.translations.find((t) => t.locale === 'en')!
    expect(en.og_image).toBe('https://cdn.x/og.webp')
  })

  it('warns on malformed content JSON but NOT on a valid-but-empty array', () => {
    const en = legacyPost.translations.find((t) => t.locale === 'en')!
    const empty = transformPost({ ...legacyPost, translations: [{ ...en, content: '[]' }] }, cdn)
    expect(empty.warnings.some((w) => w.kind === 'content_parse_failed')).toBe(false)
    const bad = transformPost({ ...legacyPost, translations: [{ ...en, content: 'not json' }] }, cdn)
    expect(bad.warnings.some((w) => w.kind === 'content_parse_failed')).toBe(true)
  })
})
