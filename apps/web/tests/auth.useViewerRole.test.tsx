// apps/web/tests/auth.useViewerRole.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'

let sessionUser: { id: string } | null = null
let opsMember: { id: string } | null = null
let merchantProfile: { id: string } | null = null
let creatorProfile: { status: string } | null = null
let socialHandle: { id: string } | null = null
let lookupBarrier: Promise<void> | null = null
const getUser = vi.fn(async () => ({ data: { user: sessionUser }, error: null }))
let authStateCallback: ((_event: string, session: { user: { id: string } } | null) => void | Promise<void>) | null = null
const onAuthStateChange = vi.fn((cb: typeof authStateCallback) => {
  authStateCallback = cb
  return {
    data: { subscription: { unsubscribe: vi.fn() } },
  }
})
const from = vi.fn((table: string) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (lookupBarrier) await lookupBarrier
      return {
        data:
          table === 'kinnso_ops_members'
            ? opsMember
            : table === 'merchant_profiles'
              ? merchantProfile
              : table === 'creators'
                ? creatorProfile
                : table === 'creator_social_handles'
                  ? socialHandle
                  : null,
        error: null,
      }
    }),
  }
  return builder
})

afterEach(() => {
  cleanup()
  sessionUser = null
  opsMember = null
  merchantProfile = null
  creatorProfile = null
  socialHandle = null
  lookupBarrier = null
  authStateCallback = null
  vi.clearAllMocks()
})

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser, onAuthStateChange },
    from,
  }),
}))

import { useViewerRole } from '@/lib/auth/useViewerRole'

describe('useViewerRole', () => {
  it('defaults to anon before the session resolves', () => {
    sessionUser = null
    const { result } = renderHook(() => useViewerRole())
    expect(result.current).toBe('anon')
  })

  it('resolves to creator for a signed-in user with an active creator profile', async () => {
    sessionUser = { id: 'u1' }
    creatorProfile = { status: 'active' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('creator'))
  })

  it('resolves to creator-pending for an onboarding creator with a saved handle', async () => {
    sessionUser = { id: 'u1' }
    creatorProfile = { status: 'onboarding' }
    socialHandle = { id: 'handle-1' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('creator-pending'))
  })

  it('resolves to traveler for an onboarding creator with no saved handle', async () => {
    sessionUser = { id: 'u1' }
    creatorProfile = { status: 'onboarding' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('traveler'))
  })

  it('resolves to merchant before an onboarding creator with a saved handle', async () => {
    sessionUser = { id: 'u1' }
    merchantProfile = { id: 'merchant-1' }
    creatorProfile = { status: 'onboarding' }
    socialHandle = { id: 'handle-1' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('merchant'))
  })

  it('resolves to ops before merchant for an active ops member', async () => {
    sessionUser = { id: 'u1' }
    opsMember = { id: 'ops-1' }
    merchantProfile = { id: 'merchant-1' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('ops'))
  })

  it('resolves auth state changes with merchant and ops lookups', async () => {
    sessionUser = null
    merchantProfile = { id: 'merchant-1' }
    const { result } = renderHook(() => useViewerRole())

    expect(result.current).toBe('anon')
    await act(async () => {
      await authStateCallback?.('SIGNED_IN', { user: { id: 'u1' } })
    })

    await waitFor(() => expect(result.current).toBe('merchant'))
  })

  it('ignores stale signed-in lookups after sign-out', async () => {
    let releaseLookup: () => void = () => {}
    sessionUser = null
    merchantProfile = { id: 'merchant-1' }
    lookupBarrier = new Promise((resolve) => {
      releaseLookup = resolve
    })
    const { result } = renderHook(() => useViewerRole())

    expect(result.current).toBe('anon')
    const signedInLookup = authStateCallback?.('SIGNED_IN', { user: { id: 'u1' } })
    expect(from).toHaveBeenCalledWith('merchant_profiles')

    await act(async () => {
      await authStateCallback?.('SIGNED_OUT', null)
    })
    expect(result.current).toBe('anon')

    await act(async () => {
      releaseLookup()
      await signedInLookup
    })
    expect(result.current).toBe('anon')
  })

  it('honors an explicit override', () => {
    sessionUser = null
    const { result } = renderHook(() => useViewerRole('merchant'))
    expect(result.current).toBe('merchant')
  })
})
