// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { listAffiliateOffersMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  listAffiliateOffersMock: vi.fn(async () => ({
    data: [{
      id: 'offer-1',
      title: 'Hotels affiliate',
      summary: 'Earn on every booking.',
      mission_source: 'travelpayouts',
      mission_type: 'coupon_affiliate',
      status: 'published',
      paid_fee_amount: null,
      paid_fee_currency: null,
      affiliate_commission_rate: null,
      creator_commission_rate: null,
      affiliate_network_programs: { default_commission_description: 'Up to 7%', program_url: 'https://example.com/hotels', category: 'Hotels' },
      mission_participants: [],
      affiliate_partner_links: [],
    }],
  })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  resolveViewerRoleMock: vi.fn(async () => 'creator'),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/missions/queries', () => ({ listAffiliateOffers: listAffiliateOffersMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }) },
  }),
}))

import StudioOffersPage from '@/app/[locale]/studio/offers/page'

beforeEach(() => {
  listAffiliateOffersMock.mockClear()
  resolveViewerRoleMock.mockReset()
  resolveViewerRoleMock.mockResolvedValue('creator')
})

describe('/[locale]/studio/offers host', () => {
  it('returns not found for non-creator viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')
    await expect(StudioOffersPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(listAffiliateOffersMock).not.toHaveBeenCalled()
  })

  it('renders affiliate offers for creators', async () => {
    const ui = await StudioOffersPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Hotels affiliate')).toBeTruthy()
    expect(screen.getByText('Commission: Up to 7%')).toBeTruthy()
    expect(screen.getByText(/Category:\s*Hotels/)).toBeTruthy()
  })
})
