import { describe, it, expect } from 'vitest'
import { articleJsonLd, faqJsonLd, breadcrumbJsonLd, organizationJsonLd, websiteJsonLd, creatorProfileJsonLd } from '@/lib/seo/jsonld'

describe('JSON-LD', () => {
  it('Article includes datePublished AND dateModified (the SEO fix)', () => {
    const ld = articleJsonLd({
      headline: 'Best Ramen', description: 'A guide', url: 'https://www.kinnso.ai/en/articles/dining/ramen-guide',
      images: ['https://cdn.kinnso.ai/a1.jpg'], publishedAt: '2026-06-01T00:00:00Z',
      modifiedAt: '2026-06-10T00:00:00Z', authorName: 'Jane Doe', locale: 'en',
    })
    expect(ld['@type']).toBe('Article')
    expect(ld.datePublished).toBe('2026-06-01T00:00:00Z')
    expect(ld.dateModified).toBe('2026-06-10T00:00:00Z')
    expect(ld.author).toEqual({ '@type': 'Person', name: 'Jane Doe' })
    expect(ld.inLanguage).toBe('en')
  })
  it('dateModified falls back to publishedAt when missing', () => {
    const ld = articleJsonLd({
      headline: 'x', description: 'y', url: 'u', images: [], publishedAt: '2026-06-01T00:00:00Z',
      modifiedAt: null, authorName: null, locale: 'en',
    })
    expect(ld.dateModified).toBe('2026-06-01T00:00:00Z')
    expect(ld.author).toBeUndefined()
  })
  it('FAQPage maps Q/A to Question/acceptedAnswer', () => {
    const ld = faqJsonLd([{ question: 'Q1?', answer: 'A1' }])
    expect(ld['@type']).toBe('FAQPage')
    expect((ld.mainEntity as unknown[])[0]).toEqual({
      '@type': 'Question', name: 'Q1?',
      acceptedAnswer: { '@type': 'Answer', text: 'A1' },
    })
  })
  it('BreadcrumbList builds positioned items', () => {
    const ld = breadcrumbJsonLd([
      { name: 'Home', url: 'https://x/en' },
      { name: 'Dining', url: 'https://x/en/articles/dining' },
    ])
    expect(ld['@type']).toBe('BreadcrumbList')
    expect((ld.itemListElement as unknown[])[1]).toEqual({
      '@type': 'ListItem', position: 2, name: 'Dining', item: 'https://x/en/articles/dining',
    })
  })
})

describe('organizationJsonLd', () => {
  it('builds a schema.org Organization', () => {
    const o = organizationJsonLd({ url: 'https://www.kinnso.ai', logo: 'https://www.kinnso.ai/icon.png' }) as any
    expect(o['@type']).toBe('Organization')
    expect(o.name).toBe('KINNSO')
    expect(o.url).toBe('https://www.kinnso.ai')
    expect(o.logo).toBe('https://www.kinnso.ai/icon.png')
  })
})

describe('websiteJsonLd', () => {
  it('builds a WebSite with a SearchAction', () => {
    const w = websiteJsonLd({
      url: 'https://www.kinnso.ai/en', locale: 'en',
      searchUrlTemplate: 'https://www.kinnso.ai/en/articles?q={search_term_string}',
    }) as any
    expect(w['@type']).toBe('WebSite')
    expect(w.inLanguage).toBe('en')
    expect(w.potentialAction['@type']).toBe('SearchAction')
    expect(w.potentialAction.target.urlTemplate).toContain('{search_term_string}')
    expect(w.potentialAction['query-input']).toBe('required name=search_term_string')
  })
})

describe('creatorProfileJsonLd', () => {
  it('wraps a Person in a ProfilePage', () => {
    const p = creatorProfileJsonLd({
      name: 'Maya', handle: 'maya', url: 'https://www.kinnso.ai/en/c/maya',
      bio: 'Slow travel', niches: ['Coffee', 'City Walk'],
    }) as any
    expect(p['@type']).toBe('ProfilePage')
    expect(p.mainEntity['@type']).toBe('Person')
    expect(p.mainEntity.name).toBe('Maya')
    expect(p.mainEntity.alternateName).toBe('@maya')
    expect(p.mainEntity.knowsAbout).toEqual(['Coffee', 'City Walk'])
  })
  it('omits empty bio and niches', () => {
    const p = creatorProfileJsonLd({ name: 'Leo', handle: 'leo', url: 'u', bio: '', niches: [] }) as any
    expect(p.mainEntity.description).toBeUndefined()
    expect(p.mainEntity.knowsAbout).toBeUndefined()
  })
})
