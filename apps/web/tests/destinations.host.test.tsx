// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getPublishedDestinationsMock } = vi.hoisted(() => ({
  getPublishedDestinationsMock: vi.fn(async (): Promise<import('@/lib/destinations/queries').Destination[]> => []),
}))
vi.mock('@/lib/destinations/queries', () => ({ getPublishedDestinations: getPublishedDestinationsMock }))

import DestinationsPage, { generateMetadata } from '@/app/[locale]/destinations/page'
import { MARKETING_PATHS } from '@/lib/seo/routes'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/destinations host', () => {
  it('renders published destinations as cards linking to their detail page', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([
      {
        slug: 'tokyo', name: 'Tokyo', heroImageUrl: 'https://x/tokyo.jpg', description: 'Neon nights.', matchTerms: ['Tokyo'],
        guideCount: 1, experienceCount: 1, latestPublishedAt: '2026-07-19T00:00:00.000Z',
      },
    ])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.destinations.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Tokyo/ }).getAttribute('href')).toBe('/en/destinations/tokyo')
  })

  it('shows the empty state when there are no published destinations', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.destinations.empty)).toBeTruthy()
  })

  it('is indexable and listed in MARKETING_PATHS', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.robots).toEqual({ index: true, follow: true, 'max-image-preview': 'large' })
    expect(MARKETING_PATHS).toContain('/destinations')
  })

  it('404s unknown locales', async () => {
    await expect(DestinationsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
