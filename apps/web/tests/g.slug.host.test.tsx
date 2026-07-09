// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

vi.mock('@/lib/guides/queries', () => ({
  getGuideBySlug: vi.fn(async () => ({
    id: 'g1',
    slug: 'kyoto-tea',
    title: 'Kyoto Tea Houses',
    cover: 'https://example.com/kyoto.jpg',
    city: 'Kyoto',
    saves: 5,
    creatorHandle: 'teafan',
    creatorName: 'Tea Fan',
    creatorId: 'c1',
    summary: 'Lovely tea houses.',
    publishedAt: '2026-06-02T00:00:00Z',
    source: 'db',
  })),
}))

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

const { isGuideSavedMock } = vi.hoisted(() => ({ isGuideSavedMock: vi.fn(async () => false) }))
vi.mock('@/lib/saves/guide-queries', () => ({ isGuideSaved: isGuideSavedMock }))

const { getGuideRatingAggregateMock, listPublishedReviewsForGuideMock } = vi.hoisted(() => ({
  getGuideRatingAggregateMock: vi.fn(async (): Promise<{ average: number; count: number } | null> => null),
  listPublishedReviewsForGuideMock: vi.fn(async (): Promise<Array<{ id: string; rating: number; body: string | null; createdAt: string }>> => []),
}))
vi.mock('@/lib/reviews/queries', () => ({
  getGuideRatingAggregate: getGuideRatingAggregateMock,
  listPublishedReviewsForGuide: listPublishedReviewsForGuideMock,
}))

// GuideExperienceLinks is an async Server Component -- react-dom's client renderer
// (used by this jsdom+@testing-library/react host test) cannot render a nested async
// function component directly. Stub it to a synchronous no-op (unchanged from before).
vi.mock('@/components/kinnso/GuideExperienceLinks', () => ({
  GuideExperienceLinks: () => null,
}))

describe('/[locale]/g/[slug] host', () => {
  it('renders a known guide and links the author to /c/[handle]', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })

    render(ui)

    expect(screen.getByRole('heading', { level: 1, name: 'Kyoto Tea Houses' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '@teafan' }).getAttribute('href')).toBe('/en/c/teafan')
    expect(document.querySelector('.k2-eyebrow')?.textContent).toBe('Kyoto')
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"datePublished":"2026-06-02T00:00:00Z"')
    expect(ld).toContain('"dateModified":"2026-06-02T00:00:00Z"')
  })

  it('shows the save button (anon: "Sign in to save") and omits aggregateRating JSON-LD when there are no reviews', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })
    render(ui)
    expect(screen.getByRole('button', { name: 'Sign in to save' })).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('aggregateRating')
  })

  it('shows the real save state and rating for a signed-in viewer with published reviews', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    isGuideSavedMock.mockResolvedValueOnce(true)
    getGuideRatingAggregateMock.mockResolvedValueOnce({ average: 4.5, count: 2 })
    listPublishedReviewsForGuideMock.mockResolvedValueOnce([
      { id: 'r1', rating: 5, body: 'Loved it', createdAt: '2026-07-01T00:00:00Z' },
    ])
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })
    render(ui)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
    expect(screen.getByText('Loved it')).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"aggregateRating"')
    expect(ld).toContain('"ratingValue":4.5')
  })
})
