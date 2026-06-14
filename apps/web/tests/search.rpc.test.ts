import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

describe('search_articles RPC', () => {
  it('lists a category newest-first with a window total_count', async () => {
    const { data, error } = await anon.rpc('search_articles', {
      p_locale: 'en', p_category: 'dining', p_limit: 12, p_offset: 0,
    })
    expect(error).toBeNull()
    const urls = (data ?? []).map((r: any) => r.url)
    expect(urls).toContain('ramen-guide')
    expect(urls).not.toContain('mall-coupon')         // different category
    // newest by coalesce(edit_at, published_at): sushi(edit -1d) > ramen(edit -2d) > cafe(pub -3d)
    // pub-article (Plan 1 fixture) is also a published 'dining' article, so it appears in the
    // dining listing. Assert the newest-first order of the Plan 3 dining trio rather than
    // assuming pub-article is absent (sushi edit -1d > ramen edit -2d > cafe pub -3d).
    const trio = urls.filter((u: string) => ['sushi-guide', 'ramen-guide', 'cafe-guide'].includes(u))
    expect(trio).toEqual(['sushi-guide', 'ramen-guide', 'cafe-guide'])
    expect(Number((data ?? [])[0].total_count)).toBeGreaterThanOrEqual(3)
  })

  it('matches by title FTS and by tag name', async () => {
    const byTitle = await anon.rpc('search_articles', { p_locale: 'en', p_q: 'ramen' })
    expect((byTitle.data ?? []).map((r: any) => r.url)).toContain('ramen-guide')
    const byTag = await anon.rpc('search_articles', { p_locale: 'en', p_q: 'Noodles' })
    expect((byTag.data ?? []).map((r: any) => r.url)).toContain('ramen-guide')
  })

  it('excludes EN coupon articles from the listing', async () => {
    const en = await anon.rpc('search_articles', { p_locale: 'en', p_category: 'shopping' })
    expect((en.data ?? []).map((r: any) => r.url)).not.toContain('mall-coupon')
    const hk = await anon.rpc('search_articles', { p_locale: 'zh-hk', p_category: 'shopping' })
    expect((hk.data ?? []).map((r: any) => r.url)).toContain('mall-coupon')
  })
})
