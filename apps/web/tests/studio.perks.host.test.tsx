// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { roleMock, getUserMock, tierMock, listMock, redeemedMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'creator'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'c1' } } })),
  tierMock: vi.fn(async () => 'pro'),
  listMock: vi.fn(async () => [{ id: 'p1', slug: 'k', partner_name: 'K', title: 'K', summary: 's', category: 'c', discount_label: 'd', min_tier: null, redemption_type: 'code', sort_order: 0 }]),
  redeemedMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/contribution/queries', () => ({ getCreatorStoredTier: tierMock }))
vi.mock('@/lib/perks/queries', () => ({ listActivePerks: listMock, listRedeemedPerkIds: redeemedMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/components/kinnso/pages/StudioPerksView', () => ({ StudioPerksView: () => <div data-testid="studio-perks" /> }))

import StudioPerksPage from '@/app/[locale]/studio/perks/page'

beforeEach(() => { roleMock.mockResolvedValue('creator'); getUserMock.mockResolvedValue({ data: { user: { id: 'c1' } } }) })
afterEach(() => vi.clearAllMocks())

describe('/studio/perks host', () => {
  it('redirects an anon viewer to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    await expect(StudioPerksPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(/NEXT_REDIRECT/)
  })
  it('notFounds a non-creator', async () => {
    roleMock.mockResolvedValueOnce('ops')
    await expect(StudioPerksPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('renders the catalog for a creator', async () => {
    const ui = await StudioPerksPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(ui).toBeTruthy()
    expect(listMock).toHaveBeenCalled()
  })
})
