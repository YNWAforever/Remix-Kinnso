import { describe, it, expect } from 'vitest'
import {
  getArticleDetail, searchArticles, getPresentLocales, getYouMayLike,
  getPublishedForSitemap, getStaticArticleParams,
} from '@/lib/articles/queries'

describe('article queries', () => {
  it('getArticleDetail returns article + locale translation + faqs + author', async () => {
    const a = await getArticleDetail('dining', 'ramen-guide', 'en')
    expect(a?.url).toBe('ramen-guide')
    expect(a?.translation?.title).toBe('Best Ramen in Tokyo')
    expect(a?.faqs.length).toBe(2)
    expect(a?.faqs[0].question).toBe('Is ramen cheap?')   // higher weight first
    expect(a?.author?.name).toBe('Jane Doe')
  })
  it('getArticleDetail 404s on category mismatch and on unpublished', async () => {
    expect(await getArticleDetail('shopping', 'ramen-guide', 'en')).toBeNull()  // wrong category
    expect(await getArticleDetail('shopping', 'draft-article', 'en')).toBeNull() // RLS-hidden
  })
  it('getPresentLocales returns only locales with a translation', async () => {
    expect((await getPresentLocales('ramen-guide')).sort()).toEqual(['en', 'zh-hk'])
  })
  it('getYouMayLike returns same-category others', async () => {
    const list = await getYouMayLike('00000000-0000-0000-0000-0000000000a1', 'en', 5)
    const urls = list.map((r) => r.url)
    expect(urls).not.toContain('ramen-guide')
    expect(urls).toContain('sushi-guide')
  })
  it('searchArticles paginates with total', async () => {
    const r = await searchArticles({ locale: 'en', category: 'dining', page: 1, perPage: 2 })
    expect(r.items.length).toBe(2)
    expect(r.total).toBeGreaterThanOrEqual(3)
  })
  it('getPublishedForSitemap / getStaticArticleParams exclude drafts and unknown categories', async () => {
    const sm = await getPublishedForSitemap()
    expect(sm.some((r) => r.url === 'ramen-guide')).toBe(true)
    expect(sm.some((r) => r.url === 'draft-article')).toBe(false)
    const params = await getStaticArticleParams()
    expect(params.every((p) => ['destinations', 'dining', 'shopping'].includes(p.category))).toBe(true)
  })
})
