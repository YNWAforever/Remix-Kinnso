// apps/web/tests/destinations.slug.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getDestinationBySlugMock, getGuidesForRegionsMock, getSessionsForDestinationMock, getExperiencesForCitiesMock } = vi.hoisted(() => ({
  getDestinationBySlugMock: vi.fn(async (): Promise<import('@/lib/destinations/queries').Destination | null> => null),
  getGuidesForRegionsMock: vi.fn(async (): Promise<import('@/lib/guides/types').Guide[]> => []),
  getSessionsForDestinationMock: vi.fn(async (): Promise<import('@/lib/sessions/public-queries').PublicSession[]> => []),
  getExperiencesForCitiesMock: vi.fn(async (): Promise<import('@/lib/experiences/public-queries').PublicExperience[]> => []),
}))
vi.mock('@/lib/destinations/queries', () => ({ getDestinationBySlug: getDestinationBySlugMock }))
vi.mock('@/lib/guides/queries', () => ({ getGuidesForRegions: getGuidesForRegionsMock }))
vi.mock('@/lib/sessions/public-queries', () => ({ getSessionsForDestination: getSessionsForDestinationMock }))
vi.mock('@/lib/experiences/public-queries', () => ({ getExperiencesForCities: getExperiencesForCitiesMock }))

import DestinationDetailPage from '@/app/[locale]/destinations/[slug]/page'
import en from '@/lib/i18n/messages/en'

const destination = {
  slug: 'tokyo', name: 'Tokyo', heroImageUrl: null,
  description: 'Neon nights and quiet shrines.', matchTerms: ['Tokyo'],
}

describe('/[locale]/destinations/[slug] detail host', () => {
  it('404s when the destination does not exist', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(null)
    await expect(
      DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'nowhere' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the destination hero and its guides', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getGuidesForRegionsMock.mockResolvedValueOnce([
      { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Tokyo', saves: 3, creatorHandle: 'teafan' },
    ])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Tokyo' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Kyoto Tea Houses/ }).getAttribute('href')).toBe('/en/g/kyoto-tea')
  })

  it('renders the hero image when the destination has one', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce({ ...destination, heroImageUrl: 'https://x/tokyo-hero.jpg' })
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('img', { name: 'Tokyo' }).getAttribute('src')).toBe('https://x/tokyo-hero.jpg')
  })

  it('renders no hero image when the destination has none', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.queryByRole('img', { name: 'Tokyo' })).toBeNull()
  })

  it('renders upcoming sessions linking to their detail page', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getSessionsForDestinationMock.mockResolvedValueOnce([{
      id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
      type: 'ask_a_creator', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: null, replayUrl: null, destinationTags: ['Tokyo'], status: 'scheduled',
      host: { handle: 'sora', displayName: 'Sora' },
    }])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /Tokyo ramen AMA/ }).getAttribute('href')).toBe('/en/sessions/tokyo-ramen-ama')
  })

  it('shows the empty-guides and empty-sessions copy when both are empty', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByText(en.destinations.emptyGuides)).toBeTruthy()
    expect(screen.getByText(en.destinations.emptySessions)).toBeTruthy()
  })

  it('renders the destination experiences section', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getExperiencesForCitiesMock.mockResolvedValueOnce([
      {
        id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
        city: 'Tokyo', priceAmount: 12000, currency: 'JPY', durationMinutes: null, coverUrl: null,
        publishedAt: '2026-07-01T00:00:00Z', savesCount: 5, merchant: { slug: '', companyName: '' },
      },
    ])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /Sunset junk boat tour/ }).getAttribute('href')).toBe('/en/experiences/sunset-tour')
  })

  it('shows the empty-experiences copy when there are none', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByText(en.destinations.emptyExperiences)).toBeTruthy()
  })
})
