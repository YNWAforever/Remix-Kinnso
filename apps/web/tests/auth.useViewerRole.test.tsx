// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'

let sessionUser: { id: string } | null = null
let opsMember: { id: string } | null = null
let merchantProfile: { id: string } | null = null
const getUser = vi.fn(async () => ({ data: { user: sessionUser }, error: null }))
const onAuthStateChange = vi.fn((_cb: unknown) => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}))
const from = vi.fn((table: string) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data:
        table === 'kinnso_ops_members'
          ? opsMember
          : table === 'merchant_profiles'
            ? merchantProfile
            : null,
      error: null,
    })),
  }
  return builder
})

afterEach(() => {
  cleanup()
  sessionUser = null
  opsMember = null
  merchantProfile = null
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

  it('resolves to creator for a signed-in user', async () => {
    sessionUser = { id: 'u1' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('creator'))
  })

  it('resolves to merchant for a signed-in user with a merchant profile', async () => {
    sessionUser = { id: 'u1' }
    merchantProfile = { id: 'merchant-1' }
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

  it('honors an explicit override', () => {
    sessionUser = null
    const { result } = renderHook(() => useViewerRole('merchant'))
    expect(result.current).toBe('merchant')
  })
})
