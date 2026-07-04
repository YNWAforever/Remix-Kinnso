// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicAvailability } from '@/lib/experiences/public-availability-queries'

const { getExperienceBySlugMock, listPublicAvailabilityMock } = vi.hoisted(() => ({
  getExperienceBySlugMock: vi.fn(),
  listPublicAvailabilityMock: vi.fn(async (): Promise<PublicAvailability[]> => []),
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/experiences/public-queries', () => ({
  getExperienceBySlug: getExperienceBySlugMock,
  listPublishedExperiencesForMerchant: vi.fn(),
}))
vi.mock('@/lib/experiences/public-availability-queries', () => ({
  listPublicAvailability: listPublicAvailabilityMock,
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

import ExperiencePublicPage from '@/app/[locale]/experiences/[slug]/page'

afterEach(cleanup)

describe('ExperiencePublicPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(ExperiencePublicPage({ params: Promise.resolve({ locale: 'xx', slug: 'sunset-tour' }) })).rejects.toThrow('notFound')
  })

  it('notFound for an unknown slug', async () => {
    getExperienceBySlugMock.mockResolvedValue(null)
    await expect(ExperiencePublicPage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }) })).rejects.toThrow('notFound')
  })

  it('renders the experience with merchant attribution, price, and the real booking widget', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    const el = await ExperiencePublicPage({ params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Sunset junk boat tour' })).toBeTruthy()
    const merchantLinks = screen.getAllByRole('link', { name: /Acme Travel/i })
    expect(merchantLinks.every((l) => l.getAttribute('href') === '/en/m/acme-travel')).toBe(true)
    expect(screen.queryByText(/Booking opens soon/i)).toBeNull()
    expect(screen.getByRole('button', { name: /book now/i })).toBeTruthy()
  })

  it('renders the no-availability state when there are no upcoming dates', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([])
    const el = await ExperiencePublicPage({ params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }) })
    render(el)
    expect(screen.getByText(/No upcoming dates yet/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /book now/i })).toBeNull()
  })
})
