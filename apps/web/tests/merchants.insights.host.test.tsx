// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { roleMock, getUserMock, insightsMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'merchant'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  insightsMock: vi.fn(async () => ({
    missionsPublished: 1,
    perMission: [{ missionId: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approvedSubmissions: 2 }],
    totals: { participants: 5, invited: 4, accepted: 2, approvedSubmissions: 2 },
    inviteAcceptRate: 0.5,
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/insights/merchant', () => ({ getMerchantInsights: insightsMock }))

import MerchantsInsightsPage from '@/app/[locale]/merchants/insights/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  roleMock.mockResolvedValue('merchant')
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('/[locale]/merchants/insights host', () => {
  it('renders insights for a merchant', async () => {
    const ui = await MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.merchantTitle })).toBeTruthy()
  })

  it('notFounds for a non-merchant', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('redirects an anonymous viewer to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
