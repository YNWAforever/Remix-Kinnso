// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getContribMock, listEventsMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  getContribMock: vi.fn(),
  listEventsMock: vi.fn(async () => []),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  resolveViewerRoleMock: vi.fn(async () => 'creator'),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/contribution/queries', () => ({
  getCreatorContribution: getContribMock,
  listContributionEvents: listEventsMock,
}))
vi.mock('@/lib/missions/queries', () => ({
  countGatedMissionsByTier: vi.fn(async () => ({ rising: 0, pro: 0, elite: 0 })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }) },
  }),
}))

import StudioTierPage from '@/app/[locale]/studio/tier/page'
import { progressToNext } from '@/lib/contribution/tiers'

beforeEach(() => {
  resolveViewerRoleMock.mockReset()
  resolveViewerRoleMock.mockResolvedValue('creator')
  getContribMock.mockReset()
  getContribMock.mockResolvedValue(progressToNext(55))
  listEventsMock.mockReset()
  listEventsMock.mockResolvedValue([])
})

describe('/[locale]/studio/tier host', () => {
  it('redirects non-creator viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')
    await expect(StudioTierPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(/NEXT_REDIRECT/)
    expect(getContribMock).not.toHaveBeenCalled()
  })

  it('renders the tier view for a creator', async () => {
    const ui = await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Tier & contribution')).toBeTruthy()
    expect(getContribMock).toHaveBeenCalledWith(expect.anything(), 'creator-user-1')
  })
})
