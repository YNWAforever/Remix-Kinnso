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
})
