import { describe, it, expect, vi, beforeEach } from 'vitest'

const { roleMock, getUserMock, rpcMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'creator'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'c1' } } })),
  rpcMock: vi.fn(),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))

import { redeemPerkAction } from '@/lib/perks/actions'

beforeEach(() => {
  roleMock.mockResolvedValue('creator')
  getUserMock.mockResolvedValue({ data: { user: { id: 'c1' } } })
  // rpc(...).single() shape
  rpcMock.mockReturnValue({ single: async () => ({ data: { redemption_type: 'code', redemption_value: 'CODE10' }, error: null }) })
})

describe('redeemPerkAction', () => {
  it('rejects a non-creator', async () => {
    roleMock.mockResolvedValueOnce('ops')
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(false)
  })
  it('returns the redemption value at tier', async () => {
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.redemptionType).toBe('code'); expect(r.value).toBe('CODE10') }
  })
  it('maps below_tier to a friendly error', async () => {
    rpcMock.mockReturnValueOnce({ single: async () => ({ data: null, error: { message: 'below_tier' } }) })
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/tier/i)
  })
  it('maps perk_not_found to a friendly error', async () => {
    rpcMock.mockReturnValueOnce({ single: async () => ({ data: null, error: { message: 'perk_not_found' } }) })
    const r = await redeemPerkAction('p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/no longer available/i)
  })
})
