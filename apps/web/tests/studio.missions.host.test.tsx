// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { listCreatorMissionsMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  listCreatorMissionsMock: vi.fn(async () => ({
    data: [{
      id: 'mission-1',
      title: 'Hybrid stay mission',
      summary: 'Post a reel and keep affiliate upside.',
      mission_source: 'merchant',
      mission_type: 'hybrid',
      status: 'published',
      paid_fee_amount: 500,
      paid_fee_currency: 'HKD',
      affiliate_commission_rate: 12,
      creator_commission_rate: 8,
      affiliate_network_programs: null,
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

vi.mock('@/lib/auth/viewer-role', () => ({
  resolveViewerRole: resolveViewerRoleMock,
}))

vi.mock('@/lib/missions/queries', () => ({
  listCreatorMissions: listCreatorMissionsMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }),
    },
  }),
}))

import StudioMissionsPage from '@/app/[locale]/studio/missions/page'

beforeEach(() => {
  listCreatorMissionsMock.mockClear()
  resolveViewerRoleMock.mockReset()
  resolveViewerRoleMock.mockResolvedValue('creator')
})

describe('/[locale]/studio/missions host', () => {
  it('returns not found for authenticated non-creator viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')

    await expect(
      StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(listCreatorMissionsMock).not.toHaveBeenCalled()
  })

  it('shows hybrid missions with both paid and affiliate compensation', async () => {
    const ui = await StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) })

    render(ui)

    expect(screen.getByText('Hybrid stay mission')).toBeTruthy()
    expect(screen.getByText('HKD 500 + Affiliate commission 8% creator / 12% total')).toBeTruthy()
  })
})
