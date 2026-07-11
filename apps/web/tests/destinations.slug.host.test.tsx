// apps/web/tests/destinations.slug.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getDestinationBySlugMock, getGuidesForRegionsMock, getSessionsForDestinationMock } = vi.hoisted(() => ({
  getDestinationBySlugMock: vi.fn(async (): Promise<import('@/lib/destinations/queries').Destination | null> => null),
  getGuidesForRegionsMock: vi.fn(async (): Promise<import('@/lib/guides/types').Guide[]> => []),
  getSessionsForDestinationMock: vi.fn(async (): Promise<import('@/lib/sessions/public-queries').PublicSession[]> => []),
}))
vi.mock('@/lib/destinations/queries', () => ({ getDestinationBySlug: getDestinationBySlugMock }))
vi.mock('@/lib/guides/queries', () => ({ getGuidesForRegions: getGuidesForRegionsMock }))
vi.mock('@/lib/sessions/public-queries', () => ({ getSessionsForDestination: getSessionsForDestinationMock }))

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

  it('shows the empty-guides and empty-sessions copy when both are empty', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByText(en.destinations.emptyGuides)).toBeTruthy()
    expect(screen.getByText(en.destinations.emptySessions)).toBeTruthy()
  })
})
