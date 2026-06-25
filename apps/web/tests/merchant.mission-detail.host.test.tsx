// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getMerchantProfileMock, listMerchantMissionsMock, notFoundMock } = vi.hoisted(() => ({
  getMerchantProfileMock: vi.fn(async () => ({ data: { id: 'merchant-profile-1' } })),
  listMerchantMissionsMock: vi.fn(async () => ({
    data: [{
      id: 'mission-1',
      title: 'Hybrid mission',
      mission_participants: [{
        id: 'participant-1',
        creator_id: 'creator-12345678',
        status: 'active',
        mission_milestone_submissions: [{
          id: 'submission-1',
          status: 'submitted',
          mission_social_snapshots: [
            { confidence_status: 'unavailable' },
            { confidence_status: 'verified_signal' },
          ],
        }],
      }],
    }],
  })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/missions/queries', () => ({
  getMerchantProfile: getMerchantProfileMock,
  listMerchantMissions: listMerchantMissionsMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'merchant-user-1' } } }),
    },
  }),
}))

vi.mock('@/lib/creators/queries', () => ({
  getCreatorPublicNames: vi.fn(async () =>
    new Map([['creator-12345678', { name: 'Maya Wanders', handle: 'maya' }]]),
  ),
}))

import MerchantMissionDetailPage from '@/app/[locale]/merchants/missions/[missionId]/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/merchants/missions/[missionId] host', () => {
  it('maps milestone submissions and social snapshots into the detail view', async () => {
    const ui = await MerchantMissionDetailPage({
      params: Promise.resolve({ locale: 'en', missionId: 'mission-1' }),
    })

    render(ui)

    expect(screen.getByRole('heading', { level: 1, name: 'Hybrid mission' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: en.missions.submitMilestone })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Maya Wanders' })[0].getAttribute('href')).toBe('/en/c/maya')
    expect(screen.getByText('Verified signal')).toBeTruthy()
  })
})
