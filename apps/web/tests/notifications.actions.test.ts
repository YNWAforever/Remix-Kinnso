import { describe, it, expect, vi, beforeEach } from 'vitest'

// NOTE: deviates from the plan's originally-sketched test, which mocked only
// '@/lib/supabase/server' with a minimal `from` stub and expected
// requireCreatorAction to work off of it directly. In reality
// requireCreatorAction (lib/admin/guard.ts) calls resolveViewerRole
// (lib/auth/viewer-role.ts), which issues its own `.from(...).select(...)`
// role-lookup queries (kinnso_ops_members / merchant_profiles / creators)
// that a minimal `{ update: ... }` stub can't satisfy -- it throws
// "supabase.from(...).select is not a function". The established fix in this
// codebase (see apps/web/tests/sessions.studio-actions.test.ts) is to mock
// '@/lib/admin/guard' directly instead of simulating the real role-resolution
// query chain, which is what this test does.
type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock, requireCreatorActionMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  requireCreatorActionMock: vi.fn(async (): Promise<
    { ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }
  > => ({ ok: true, user: { id: 'c1' } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: requireCreatorActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ update: () => ({ eq: () => ({ eq: () => rpcMock() }) }) }),
  }),
}))

import { markNotificationReadAction } from '@/lib/notifications/actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  requireCreatorActionMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'c1' } })
})

describe('markNotificationReadAction', () => {
  it('succeeds for a signed-in creator', async () => {
    const res = await markNotificationReadAction('en', 'n1')
    expect(res).toEqual({ ok: true, id: 'n1' })
  })

  it('fails when signed out', async () => {
    requireCreatorActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Sign in is required'] } })
    const res = await markNotificationReadAction('en', 'n1')
    expect(res.ok).toBe(false)
  })
})
