import { describe, it, expect, vi, beforeEach } from 'vitest'

const { roleMock, getUserMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))

import { requireOpsPage, requireOpsAction } from '@/lib/admin/guard'
const sb = () => ({ auth: { getUser: getUserMock } }) as never

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('requireOpsPage', () => {
  it('redirects anon to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(requireOpsPage(sb(), 'en')).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFound for non-ops', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(requireOpsPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('returns the user for ops', async () => {
    expect(await requireOpsPage(sb(), 'en')).toEqual({ user: { id: 'u1' } })
  })
})

describe('requireOpsAction', () => {
  it('formError for non-ops', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    const r = await requireOpsAction(sb())
    expect(r.ok).toBe(false)
  })
  it('ok+user for ops', async () => {
    const r = await requireOpsAction(sb())
    expect(r).toEqual({ ok: true, user: { id: 'u1' } })
  })
})
