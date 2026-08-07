// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { getAuthorizationContext } from '@/lib/auth/authorization-context'

type Row = Record<string, unknown> | null

function fakeSupabase(options: {
  user: { id: string } | null
  rows?: Record<string, Row>
  errors?: Record<string, unknown>
}) {
  const getUser = vi.fn(async () => ({ data: { user: options.user }, error: null }))
  const from = vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: options.rows?.[table] ?? null,
        error: options.errors?.[table] ?? null,
      }),
    }
    return builder
  })

  return {
    supabase: { auth: { getUser }, from } as never,
    getUser,
    from,
  }
}

describe('getAuthorizationContext', () => {
  it('returns anon without querying role tables when there is no session', async () => {
    const { supabase, from } = fakeSupabase({ user: null })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: null,
      role: 'anon',
      merchantId: null,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('reads auth once, preserves Ops precedence, and retains merchant ID', async () => {
    const { supabase, getUser } = fakeSupabase({
      user: { id: 'u1' },
      rows: {
        kinnso_ops_members: { id: 'ops-1' },
        merchant_profiles: { id: 'merchant-1' },
        creators: { status: 'active' },
      },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'ops',
      merchantId: 'merchant-1',
    })
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('treats role-query errors as absent facts and falls through to remaining facts', async () => {
    const { supabase } = fakeSupabase({
      user: { id: 'u1' },
      rows: { merchant_profiles: { id: 'merchant-1' } },
      errors: { kinnso_ops_members: new Error('ops read failed') },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toMatchObject({
      role: 'merchant',
      merchantId: 'merchant-1',
    })
  })
})
