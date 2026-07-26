// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { roleMock, getUserMock, listMock, viewMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
  listMock: vi.fn(async () => []), viewMock: vi.fn(() => <div data-testid="enquiries-view" />),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/enquiries-queries', () => ({ listAdminEnquiries: listMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/components/kinnso/admin/AdminEnquiriesView', () => ({ AdminEnquiriesView: viewMock }))

import AdminEnquiriesPage from '@/app/[locale]/admin/enquiries/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops')
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
  listMock.mockResolvedValue([])
})
afterEach(() => vi.clearAllMocks())

describe('/admin/enquiries host', () => {
  it('redirects anonymous visitors and 404s authenticated non-ops before the PII queue query', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('loads the guarded view with the active/all default queue', async () => {
    const ui = await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    expect(listMock).toHaveBeenCalledWith(expect.anything(), { status: 'active', type: 'all' })
    expect((ui as { props: { enquiries: unknown[] } }).props.enquiries).toEqual([])
  })

  it('accepts only approved search-param enums and coerces arbitrary values to the safe defaults', async () => {
    await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ status: 'spam', type: 'merchant_contact' }) })
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'spam', type: 'merchant_contact' })
    await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ status: 'DROP TABLE', type: 'anything' }) })
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'active', type: 'all' })
  })
})
