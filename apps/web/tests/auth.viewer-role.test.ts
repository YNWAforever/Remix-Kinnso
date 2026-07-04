// apps/web/tests/auth.viewer-role.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolveViewerRole } from '@/lib/auth/viewer-role'

type Row = Record<string, unknown> | null

function fakeSupabase(opts: {
  user: { id: string } | null
  ops?: Row
  merchant?: Row
  creator?: Row
}) {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data:
          table === 'kinnso_ops_members' ? (opts.ops ?? null)
          : table === 'merchant_profiles' ? (opts.merchant ?? null)
          : table === 'creators' ? (opts.creator ?? null)
          : null,
        error: null,
      }),
    }
    return builder
  }
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from,
  } as never
}

describe('resolveViewerRole', () => {
  it('returns anon when there is no session', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: null }))
    expect(role).toBe('anon')
  })

  it('returns ops for an active ops member, even with a merchant profile', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, ops: { id: 'ops1' }, merchant: { id: 'm1' } }),
    )
    expect(role).toBe('ops')
  })

  it('returns merchant for a user with a merchant profile', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: { id: 'u1' }, merchant: { id: 'm1' } }))
    expect(role).toBe('merchant')
  })

  it('returns creator for a user with an active creator profile', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, creator: { status: 'active' } }),
    )
    expect(role).toBe('creator')
  })

  it('returns traveler for a user whose creator profile is still onboarding', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, creator: { status: 'onboarding' } }),
    )
    expect(role).toBe('traveler')
  })

  it('returns traveler for a user with no creators row at all', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: { id: 'u1' } }))
    expect(role).toBe('traveler')
  })
})
