// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'

afterEach(cleanup)

let sessionUser: { id: string } | null = null
const getUser = vi.fn(async () => ({ data: { user: sessionUser }, error: null }))
const onAuthStateChange = vi.fn((_cb: unknown) => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser, onAuthStateChange },
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

  it('honors an explicit override', () => {
    sessionUser = null
    const { result } = renderHook(() => useViewerRole('merchant'))
    expect(result.current).toBe('merchant')
  })
})
