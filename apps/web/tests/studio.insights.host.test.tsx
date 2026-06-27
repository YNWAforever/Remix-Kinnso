// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { roleMock, getUserMock, insightsMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'creator'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  insightsMock: vi.fn(async () => ({
    pointsTotal: 65,
    pointsByType: { dna_scan: 10, guide_published: 15, mission_verified: 40 },
    trajectory: [{ weekStart: '2026-06-08', cumulative: 65 }],
    tier: { tier: 'rising', nextTier: 'pro', points: 65, pointsIntoTier: 15, pointsForNext: 85, pct: 15 },
    guidesPublished: 1, guideSavesTotal: 7,
    missionsByStatus: { applied: 1, active: 1, invited: 0, rejected: 0 },
    submissionsApproved: 1,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/insights/creator', () => ({ getCreatorInsights: insightsMock }))

import StudioInsightsPage from '@/app/[locale]/studio/insights/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  roleMock.mockResolvedValue('creator')
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('/[locale]/studio/insights host', () => {
  it('renders insights for a creator', async () => {
    const ui = await StudioInsightsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.creatorTitle })).toBeTruthy()
  })

  it('redirects a non-creator to the studio hub', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    await expect(StudioInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/studio')
  })

  it('redirects an anonymous viewer to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(StudioInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
