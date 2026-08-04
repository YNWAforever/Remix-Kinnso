// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { roleMock, getUserMock, reportMock, viewMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
  reportMock: vi.fn(async () => ({
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-08T00:00:00.000Z',
    timezone: 'UTC' as const,
    attributionWindowDays: 7 as const,
    rows: [],
  })),
  viewMock: vi.fn(() => <div data-testid="analytics-view" />),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/lib/admin/analytics-queries', () => ({ getTravellerAnalyticsReport: reportMock }))
vi.mock(import('@/components/kinnso/admin/analytics/AdminAnalyticsView'), () => ({ AdminAnalyticsView: viewMock }), { virtual: true })

import AdminAnalyticsPage from '@/app/[locale]/admin/analytics/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops')
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
  reportMock.mockResolvedValue({
    from: '2026-08-01T00:00:00.000Z', to: '2026-08-08T00:00:00.000Z', timezone: 'UTC', attributionWindowDays: 7, rows: [],
  })
})
afterEach(() => vi.clearAllMocks())

describe('/admin/analytics host', () => {
  it('redirects anonymous users and 404s non-ops before the report query', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('defaults to 7d and passes normalized rows to the view', async () => {
    const ui = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    expect(reportMock).toHaveBeenCalledWith(expect.anything(), { from: expect.any(String), to: expect.any(String) })
    expect((ui as { props: { filters: unknown } }).props.filters).toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('uses 24h and allowlisted dimensions while coercing invalid values', async () => {
    await AdminAnalyticsPage({
      params: Promise.resolve({ locale: 'zh-hk' }),
      searchParams: Promise.resolve({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }),
    })
    expect((viewMock.mock.calls.at(-1)?.[0] as { filters: unknown }).filters)
      .toEqual({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' })
    await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ window: '30d', locale: 'DROP TABLE' }) })
    expect((viewMock.mock.calls.at(-1)?.[0] as { filters: unknown }).filters)
      .toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('passes a generic unavailable state when the aggregate query fails', async () => {
    reportMock.mockRejectedValueOnce(new Error('database internals'))
    const ui = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    expect((ui as { props: { error: string; report: unknown } }).props).toMatchObject({ error: 'unavailable', report: null })
  })
})
