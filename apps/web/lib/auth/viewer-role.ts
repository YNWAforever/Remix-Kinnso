import type { createSupabaseServerClient } from '@/lib/supabase/server'

export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant'

/**
 * Server: derive the viewer's role from the cookie session (slice-1: a
 * signed-in user is 'creator', otherwise 'anon'). Mirrors the client hook's
 * resolution so the public host and client chrome agree. No merchant/status
 * resolution this slice — pass an explicit override where a host knows better.
 * Server-safe — no React or browser imports, so a Server Component can import
 * this without crossing the client boundary.
 */
export async function resolveViewerRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ViewerRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? 'creator' : 'anon'
}
