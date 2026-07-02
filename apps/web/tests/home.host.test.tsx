// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: async () => [] }))
vi.mock('@/lib/articles/queries', () => ({ searchArticles: async () => ({ items: [], total: 0, page: 1, perPage: 3 }) }))
vi.mock('@/lib/home/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/home/queries')>()),
  getPlatformStats: async () => null,
  getPublishedTestimonials: async () => [],
  getUpcomingSessions: async () => [],
}))

import LocaleHome, { generateMetadata, revalidate } from '@/app/[locale]/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale] home host', () => {
  it('renders the rebuilt homepage from mocked (empty) data without filler', async () => {
    const ui = await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
    expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
    expect(screen.queryByText(en.home.sessionsHeading)).toBeNull()
  })
  it('ISR-revalidates every 5 minutes', () => {
    expect(revalidate).toBe(300)
  })
  it('uses the updated seo.home strings', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.title).toBe(en.seo.home.title)
    expect(meta.description).toBe(en.seo.home.description)
  })
  it('404s unknown locales', async () => {
    await expect(LocaleHome({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('never 500s when searchArticles rejects', async () => {
    vi.resetModules()
    vi.doMock('@/lib/articles/queries', () => ({
      searchArticles: async () => {
        throw new Error('boom')
      },
    }))
    const { default: LocaleHomeWithFailingArticles } = await import('@/app/[locale]/page')
    const ui = await LocaleHomeWithFailingArticles({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
  })
})
