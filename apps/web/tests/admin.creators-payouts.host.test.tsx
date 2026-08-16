// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)
const { roleMock, getUserMock, queueMock, batchesMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  queueMock: vi.fn(async () => ({ rows: [], summary: { total: 0, byStatus: {}, owed: [], settled: [] } })),
  batchesMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/admin/creators/payouts',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/creators-queries', () => ({ getSettlementsQueue: queueMock }))
vi.mock('@/lib/admin/payout-batches-queries', () => ({ getPayoutBatches: batchesMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import CreatorsPayoutsPage from '@/app/[locale]/admin/creators/payouts/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); queueMock.mockClear(); batchesMock.mockClear() })

describe('admin creators payouts host', () => {
  it('renders the payouts queue for ops', async () => {
    const ui = await CreatorsPayoutsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText(en.creators.payoutsOwed)).toBeTruthy()
    expect(queueMock).toHaveBeenCalledWith(expect.anything(), { status: undefined })
  })
  it('forwards a valid status filter to the query', async () => {
    await CreatorsPayoutsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ status: 'disputed' }) })
    expect(queueMock).toHaveBeenCalledWith(expect.anything(), { status: 'disputed' })
  })
  it('drops an invalid status filter', async () => {
    await CreatorsPayoutsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ status: 'bogus' }) })
    expect(queueMock).toHaveBeenCalledWith(expect.anything(), { status: undefined })
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(CreatorsPayoutsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(CreatorsPayoutsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('renders the payout batches section', async () => {
    const ui = await CreatorsPayoutsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    // Task 10 (not yet landed) adds en.creators.batchesHeading and friends — until then this page's
    // real (unmocked) getDictionary() call returns undefined for them, and getByText(undefined) throws
    // rather than failing a normal "not found" query (see kinnso.CreatorPayoutBatchesView.test.tsx for
    // the full explanation). CreatorPayoutBatchesView's root div carries a stable, non-i18n-dependent
    // "mt-8" class (from its Step 3 source verbatim) that no other element on this page uses, so it's a
    // safe stand-in for "the batches section mounted" today; swap to
    // screen.getByText(en.creators.batchesHeading) once Task 10 lands, for a nicer text-based check.
    const { container } = render(ui)
    expect(container.querySelector('.mt-8')).toBeTruthy()
    expect(batchesMock).toHaveBeenCalled()
  })
})
