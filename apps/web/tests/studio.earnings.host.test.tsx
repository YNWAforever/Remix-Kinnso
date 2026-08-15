// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { roleMock, getUserMock, summaryMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'creator'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'creator-1' } } })),
  summaryMock: vi.fn(async () => ({ missions: [], bookings: [], tracked: [], totals: [] })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/missions/earnings-summary', () => ({ getCreatorEarningsSummary: summaryMock }))

import StudioEarningsPage from '@/app/[locale]/studio/earnings/page'

beforeEach(() => {
  vi.clearAllMocks()
  roleMock.mockResolvedValue('creator')
  getUserMock.mockResolvedValue({ data: { user: { id: 'creator-1' } } })
  summaryMock.mockResolvedValue({ missions: [], bookings: [], tracked: [], totals: [] })
})

describe('/studio/earnings host', () => {
  it('notFounds an unknown locale', async () => {
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(summaryMock).not.toHaveBeenCalled()
  })

  it('redirects an anonymous visitor to sign-in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } } as never)
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    expect(summaryMock).not.toHaveBeenCalled()
  })

  it('notFounds a non-creator and never reads earnings', async () => {
    roleMock.mockResolvedValue('traveler')
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(summaryMock).not.toHaveBeenCalled()
  })

  it('loads the summary for an active creator', async () => {
    await StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(summaryMock).toHaveBeenCalledTimes(1)
  })

  it('propagates an RPC failure instead of rendering an empty page', async () => {
    summaryMock.mockRejectedValue(new Error('forbidden'))
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('forbidden')
  })
})
