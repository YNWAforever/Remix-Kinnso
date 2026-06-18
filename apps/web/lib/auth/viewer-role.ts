import type { createSupabaseServerClient } from '@/lib/supabase/server'

export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'ops'

/**
 * Server: derive the viewer's role from the cookie session. Mirrors the client
 * hook's resolution so the public host and client chrome agree.
 * Server-safe — no React or browser imports, so a Server Component can import
 * this without crossing the client boundary.
 */
export async function resolveViewerRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ViewerRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'anon'

  const { data: ops } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (ops) return 'ops'

  const { data: merchant } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (merchant) return 'merchant'

  return 'creator'
}
