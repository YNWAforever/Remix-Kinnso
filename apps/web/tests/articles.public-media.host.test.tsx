// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getArticleDetailMock } = vi.hoisted(() => ({ getArticleDetailMock: vi.fn() }))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/articles/queries', () => ({
  getArticleDetail: getArticleDetailMock,
  getPresentLocales: vi.fn(async () => ['en']),
  getYouMayLike: vi.fn(async () => []),
  getStaticArticleParams: vi.fn(async () => []),
}))
vi.mock('@/lib/i18n/dictionaries', () => ({
  getDictionary: vi.fn(async () => ({
    breadcrumb: { home: 'Home', articles: 'Articles' },
    categories: { destinations: 'Destinations' },
    article: {
      by: 'By', fallbackNotice: 'Fallback', faqTitle: 'FAQ',
      youMayLike: 'You may like', tableOfContents: 'Contents',
    },
  })),
}))
vi.mock('@/components/ArticleBlockRenderer', () => ({ ArticleBlockRenderer: () => null }))
vi.mock('@/components/kinnso/articles/ArticleGuideLinks', () => ({ ArticleGuideLinks: () => null }))
vi.mock('@/components/kinnso/articles/ArticleExperienceLinks', () => ({ ArticleExperienceLinks: () => null }))
vi.mock('@/components/ArticleToc', () => ({ ArticleToc: () => null }))
vi.mock('@/components/ViewPing', () => ({ ViewPing: () => null }))

import ArticleDetailPage, { generateMetadata } from '@/app/[locale]/articles/[category]/[url]/page'

const baseArticle = {
  id: 'a1',
  url: 'kyoto-tea',
  slug: 'kyoto-tea',
  category: 'destination',
  thumbnails: [] as string[],
  authors: [],
  regions: [],
  tag_slugs: [],
  rating: null,
  views: 0,
  published_at: '2026-06-01T00:00:00Z',
  end_at: null,
  edit_at: null,
  is_coupon: false,
  translation: {
    title: 'Kyoto Tea',
    content: [],
    summary: 'Tea houses.',
    meta_title: null,
    meta_description: null,
    og_image: null as string | null,
    faq_title: null,
    locale: 'en',
  },
  faqs: [],
  author: null,
}

const params = Promise.resolve({ locale: 'en', category: 'destinations', url: 'kyoto-tea' })

beforeEach(() => getArticleDetailMock.mockResolvedValue(baseArticle))
afterEach(cleanup)

describe('article route media behavior', () => {
  it('omits invalid media from metadata, JSON-LD, and rendered image src', async () => {
    getArticleDetailMock.mockResolvedValue({
      ...baseArticle,
      thumbnails: ['https://picsum.photos/article.jpg'],
      translation: { ...baseArticle.translation, og_image: 'http://cdn.kinnso.ai/og.jpg' },
    })

    const metadata = await generateMetadata({ params })
    expect((metadata.openGraph as { images: string[] }).images).toEqual([])

    const { container } = render(await ArticleDetailPage({ params }))
    const ld = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('picsum.photos')
    expect(container.innerHTML).not.toContain('picsum.photos')
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
  })

  it('uses approved CDN media in metadata, JSON-LD, and the detail hero', async () => {
    const thumbnail = 'https://cdn.kinnso.ai/test/article.jpg'
    const ogImage = 'https://cdn.kinnso.ai/test/article-og.jpg'
    getArticleDetailMock.mockResolvedValue({
      ...baseArticle,
      thumbnails: [thumbnail],
      translation: { ...baseArticle.translation, og_image: ogImage },
    })

    const metadata = await generateMetadata({ params })
    expect((metadata.openGraph as { images: string[] }).images).toEqual([ogImage])

    const { container } = render(await ArticleDetailPage({ params }))
    const ld = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain(thumbnail)
    expect(container.innerHTML).toContain('cdn.kinnso.ai')
    expect(container.querySelector('img')).toBeTruthy()
  })
})
