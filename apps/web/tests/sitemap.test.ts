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

  it('includes merchant and experience URLs for every locale when they exist', async () => {
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)
    const merchantUrls = urls.filter((u) => /\/[a-z-]+\/m\/[^/]+$/.test(u))
    if (merchantUrls.length > 0) {
      expect(merchantUrls.some((u) => u.startsWith('https://www.kinnso.ai/en/m/'))).toBe(true)
      expect(merchantUrls.some((u) => u.startsWith('https://www.kinnso.ai/zh-hk/m/'))).toBe(true)
      const merchantPriority = entries.find((e) => merchantUrls.includes(e.url))
      expect(merchantPriority?.priority).toBe(0.6)
    }
    const experienceUrls = urls.filter((u) => /\/[a-z-]+\/experiences\/[^/]+$/.test(u))
    if (experienceUrls.length > 0) {
      const experiencePriority = entries.find((e) => experienceUrls.includes(e.url))
      expect(experiencePriority?.priority).toBe(0.7)
    }
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
    expect(disallow).toContain('/*/merchants/dashboard')
    // onboarding is anchored so it does not catch the public /creators directory
    expect(disallow).toContain('/*/creator$')
    expect(disallow).not.toContain('/*/merchants') // the public landing stays crawlable
  })
})
