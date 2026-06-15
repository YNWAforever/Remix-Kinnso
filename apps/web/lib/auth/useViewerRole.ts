'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ViewerRole } from './viewer-role'
export type { ViewerRole } from './viewer-role'

/**
 * Thin viewer-role hook (replaces the redesign's MockAuthContext).
 * Reads the real Supabase session client-side; defaults to 'anon'.
 * This slice has no merchant/status resolution: a signed-in user is 'creator'.
 * Pass `override` to force a role (e.g. a merchant-context host).
 */
export function useViewerRole(override?: ViewerRole): ViewerRole {
  const [role, setRole] = useState<ViewerRole>('anon')

  useEffect(() => {
    // When a host forces a role, skip session resolution entirely; the
    // override is surfaced directly via the return value below (no
    // synchronous setState in the effect).
    if (override) return
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

  return override ?? role
}
