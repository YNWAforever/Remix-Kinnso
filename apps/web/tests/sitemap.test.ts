import { describe, it, expect } from 'vitest'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'

describe('sitemap', () => {
  it('includes published articles for present locales and excludes drafts', async () => {
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://www.kinnso.ai/en/articles/dining/ramen-guide')
    expect(urls).toContain('https://www.kinnso.ai/zh-hk/articles/dining/ramen-guide')
    expect(urls.some((u) => u.includes('draft-article'))).toBe(false)
    // hub + category present
    expect(urls).toContain('https://www.kinnso.ai/en/articles')
    expect(urls).toContain('https://www.kinnso.ai/en/articles/dining')
  })
})

describe('robots', () => {
  it('points at the sitemap and allows crawling', () => {
    const r = robots()
    expect(r.sitemap).toBe('https://www.kinnso.ai/sitemap.xml')
    expect(Array.isArray(r.rules) ? r.rules[0].allow : r.rules.allow).toBeTruthy()
  })
  it('disallows the private trees but allows the public surface', () => {
    const r = robots()
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules
    const disallow = (rule.disallow ?? []) as string[]
    expect(disallow).toContain('/*/studio')
    expect(disallow).toContain('/*/admin')
    expect(disallow).toContain('/*/merchants/post')
    // onboarding is anchored so it does not catch the public /creators directory
    expect(disallow).toContain('/*/creator$')
    expect(disallow).not.toContain('/*/merchants') // the public landing stays crawlable
  })
})
