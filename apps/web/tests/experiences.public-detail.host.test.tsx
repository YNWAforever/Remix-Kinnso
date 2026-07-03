// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getExperienceBySlugMock } = vi.hoisted(() => ({ getExperienceBySlugMock: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/experiences/public-queries', () => ({
  getExperienceBySlug: getExperienceBySlugMock,
  listPublishedExperiencesForMerchant: vi.fn(),
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

  it('renders the experience with merchant attribution, price, and a booking-soon state — no booking form', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    const el = await ExperiencePublicPage({ params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Sunset junk boat tour' })).toBeTruthy()
    const merchantLinks = screen.getAllByRole('link', { name: /Acme Travel/i })
    expect(merchantLinks.every((l) => l.getAttribute('href') === '/en/m/acme-travel')).toBe(true)
    expect(screen.getByText(/Booking opens soon/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /book/i })).toBeNull()
    expect(screen.queryByRole('form')).toBeNull()
  })
})
