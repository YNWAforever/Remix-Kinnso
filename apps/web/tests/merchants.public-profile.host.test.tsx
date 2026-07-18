// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getMerchantBySlugMock, listPublishedForMerchantMock } = vi.hoisted(() => ({
  getMerchantBySlugMock: vi.fn(),
  listPublishedForMerchantMock: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/merchants/public-queries', () => ({ getMerchantBySlug: getMerchantBySlugMock }))
vi.mock('@/lib/experiences/public-queries', () => ({ listPublishedExperiencesForMerchant: listPublishedForMerchantMock }))

import MerchantPublicProfilePage from '@/app/[locale]/m/[slug]/page'

afterEach(cleanup)

describe('MerchantPublicProfilePage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'xx', slug: 'acme-travel' }) })).rejects.toThrow('notFound')
  })

  it('notFound for an unknown slug', async () => {
    getMerchantBySlugMock.mockResolvedValue(null)
    await expect(MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }) })).rejects.toThrow('notFound')
  })

  it('renders the merchant identity and an honest empty state with no experiences', async () => {
    getMerchantBySlugMock.mockResolvedValue({
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: 'https://picsum.photos/logo.jpg', websiteUrl: 'https://acme.example',
    })
    listPublishedForMerchantMock.mockResolvedValue([])
    const el = await MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'en', slug: 'acme-travel' }) })
    const { container } = render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Travel' })).toBeTruthy()
    expect(screen.getByText(/No experiences published yet/i)).toBeTruthy()
    const website = screen.getByRole('link', { name: /Website/i })
    expect(website.getAttribute('href')).toBe('https://acme.example')
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })
})
