import { describe, it, expect, vi, beforeEach } from 'vitest'

const { contextMock, getUserMock } = vi.hoisted(() => ({
  contextMock: vi.fn(),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: contextMock,
}))

type TestContext = {
  user: { id: string } | null
  role: 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'traveler' | 'ops'
  merchantId: string | null
}

const contextFor = (overrides: Partial<TestContext> = {}): TestContext => ({
  user: { id: 'u1' },
  role: 'ops',
  merchantId: null,
  ...overrides,
})

import {
  requireOpsPage,
  requireOpsAction,
  requireCreatorAction,
  requireMerchantAction,
  requireTravelerAction,
} from '@/lib/admin/guard'

const sb = () => ({
  auth: { getUser: getUserMock },
  from: vi.fn(),
}) as never

beforeEach(() => {
  contextMock.mockReset()
  contextMock.mockResolvedValue(contextFor())
  getUserMock.mockReset()
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('requireOpsPage', () => {
  it('redirects anon to sign-in', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ user: null, role: 'anon' }))
    await expect(requireOpsPage(sb(), 'en')).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFound for non-ops', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'creator' }))
    await expect(requireOpsPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('returns the user for ops', async () => {
    expect(await requireOpsPage(sb(), 'en')).toEqual({ user: { id: 'u1' } })
  })
})

describe('requireOpsAction', () => {
  it('formError for non-ops', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant' }))
    const r = await requireOpsAction(sb())
    expect(r.ok).toBe(false)
  })
  it('ok+user for ops', async () => {
    const r = await requireOpsAction(sb())
    expect(r).toEqual({ ok: true, user: { id: 'u1' } })
  })
})

describe('requireCreatorAction', () => {
  it('fails for an anon caller', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ user: null, role: 'anon' }))
    const result = await requireCreatorAction(sb())
    expect(result.ok).toBe(false)
  })

  it('fails for a signed-in non-creator (e.g. a traveller)', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'traveler' }))
    const result = await requireCreatorAction(sb())
    expect(result.ok).toBe(false)
  })

  it('succeeds for a signed-in creator, returning the user (id doubles as creators.id)', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ user: { id: 'creator-1' }, role: 'creator' }))
    const result = await requireCreatorAction(sb())
    expect(result).toEqual({ ok: true, user: { id: 'creator-1' } })
  })
})

describe('requireMerchantAction', () => {
  it('returns the server-derived merchant ID without a second profile lookup', async () => {
    const from = vi.fn()
    contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant', merchantId: 'merchant-1' }))

    await expect(requireMerchantAction({ from } as never)).resolves.toEqual({
      ok: true,
      user: { id: 'u1' },
      merchantId: 'merchant-1',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a merchant context that has no server-derived merchant ID', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant', merchantId: null }))

    const result = await requireMerchantAction(sb())

    expect(result.ok).toBe(false)
  })
})

describe('requireTravelerAction', () => {
  it('keeps traveler actions authentication-only', async () => {
    const from = vi.fn()
    const result = await requireTravelerAction({
      auth: { getUser: async () => ({ data: { user: { id: 'traveler-1' } } }) },
      from,
    } as never)

    expect(result).toEqual({ ok: true, user: { id: 'traveler-1' } })
    expect(contextMock).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })
})
