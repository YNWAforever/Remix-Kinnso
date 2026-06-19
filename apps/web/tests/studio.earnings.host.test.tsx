// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { listCreatorSettlementsMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  listCreatorSettlementsMock: vi.fn(async () => ({
    data: [{
      id: 'settle-1',
      status: 'paid',
      creator_payout_status: 'paid',
      amount_currency: 'usd',
      creator_commission_amount: 120,
      paid_fee_amount: null,
      missions: { title: 'Hotel program', mission_type: 'coupon_affiliate', mission_source: 'travelpayouts' },
    }],
  })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  resolveViewerRoleMock: vi.fn(async () => 'creator'),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/missions/queries', () => ({ listCreatorSettlements: listCreatorSettlementsMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }) },
  }),
}))

import StudioEarningsPage from '@/app/[locale]/studio/earnings/page'

beforeEach(() => {
  listCreatorSettlementsMock.mockClear()
  resolveViewerRoleMock.mockReset()
  resolveViewerRoleMock.mockResolvedValue('creator')
})

describe('/[locale]/studio/earnings host', () => {
  it('returns not found for non-creator viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(listCreatorSettlementsMock).not.toHaveBeenCalled()
  })

  it('renders the creator earnings breakdown', async () => {
    const ui = await StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Hotel program')).toBeTruthy()
    expect(screen.getByText('USD')).toBeTruthy()
  })
})
