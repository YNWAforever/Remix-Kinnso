import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gateMock, rpcMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'ops1' } })),
  rpcMock: vi.fn(async () => ({ error: null })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))

import { setUserStatusAction } from '@/lib/admin/users-actions'

beforeEach(() => {
  gateMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } } as never)
  rpcMock.mockResolvedValue({ error: null } as never)
})

describe('setUserStatusAction', () => {
  it('rejects a non-ops caller', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['nope'] } } as never)
    expect((await setUserStatusAction('en', 'creator', 'c1', 'suspended')).ok).toBe(false)
  })
  it('rejects a bad kind', async () => {
    expect((await setUserStatusAction('en', 'admin' as never, 'c1', 'suspended')).ok).toBe(false)
  })
  it('rejects a bad status', async () => {
    expect((await setUserStatusAction('en', 'creator', 'c1', 'paused' as never)).ok).toBe(false)
  })
  it('suspends a creator via the RPC', async () => {
    const r = await setUserStatusAction('en', 'creator', 'c1', 'suspended')
    expect(r.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_user_status', { p_kind: 'creator', p_id: 'c1', p_status: 'suspended' })
  })
  it('maps cannot_suspend_self to a friendly error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'cannot_suspend_self' } } as never)
    const r = await setUserStatusAction('en', 'ops', 'o1', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/your own ops/i)
  })
  it('maps last_active_ops to a friendly error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'last_active_ops' } } as never)
    const r = await setUserStatusAction('en', 'ops', 'o1', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/last active ops/i)
  })
})
