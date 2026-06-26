// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, listMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  listMock: vi.fn(async () => ({
    creators: [{ id: 'c1', display_name: 'Ada', handle: 'ada', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
    merchants: [], ops: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/users-queries', () => ({ listAdminUsers: listMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import AdminUsersPage from '@/app/[locale]/admin/users/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin users page host', () => {
  it('notFounds for a non-ops viewer (page gates independently of the layout)', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminUsersPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('renders the users view for ops', async () => {
    const ui = await AdminUsersPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Ada')).toBeTruthy()
  })
})
