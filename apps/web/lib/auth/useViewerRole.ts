'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant'

/**
 * Server: derive the viewer's role from the cookie session (slice-1: a
 * signed-in user is 'creator', otherwise 'anon'). Mirrors the client hook's
 * resolution so the public host and client chrome agree. No merchant/status
 * resolution this slice — pass an explicit override where a host knows better.
 */
export async function resolveViewerRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ViewerRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? 'creator' : 'anon'
}

/**
 * Thin viewer-role hook (replaces the redesign's MockAuthContext).
 * Reads the real Supabase session client-side; defaults to 'anon'.
 * This slice has no merchant/status resolution: a signed-in user is 'creator'.
 * Pass `override` to force a role (e.g. a merchant-context host).
 */
export function useViewerRole(override?: ViewerRole): ViewerRole {
  const [role, setRole] = useState<ViewerRole>(override ?? 'anon')

  useEffect(() => {
    if (override) {
      setRole(override)
      return
    }
    const supabase = createSupabaseBrowserClient()
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setRole(data.user ? 'creator' : 'anon')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setRole(session?.user ? 'creator' : 'anon')
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [override])

  return role
}
