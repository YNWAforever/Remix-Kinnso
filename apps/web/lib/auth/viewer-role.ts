import type { createSupabaseServerClient } from '@/lib/supabase/server'

export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'traveler' | 'ops'

/**
 * Server: derive the viewer's role from the cookie session. Mirrors the client
 * hook's resolution so the public host and client chrome agree.
 * Server-safe — no React or browser imports, so a Server Component can import
 * this without crossing the client boundary.
 */
export async function resolveViewerRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  // A caller that already validated auth can provide the verified id and avoid
  // a second network lookup. All other callers retain cookie-session resolution.
  verifiedUserId?: string,
): Promise<ViewerRole> {
  let userId = verifiedUserId
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return 'anon'
    userId = user.id
  }

  const { data: ops } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (ops) return 'ops'

  const { data: merchant } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (merchant) return 'merchant'

  // Every sign-up gets a blank `creators` row (handle_new_user()), so row
  // existence alone can't distinguish a real creator from a traveler who never
  // touched onboarding. `status = 'active'` is the same bar /studio/page.tsx
  // already uses as its own "real" creator gate.
  const { data: creator } = await supabase
    .from('creators')
    .select('status')
    .eq('id', userId)
    .maybeSingle()
  if (creator?.status === 'active') return 'creator'
  if (creator?.status === 'onboarding') {
    const { data: handle, error: handleError } = await supabase
      .from('creator_social_handles')
      .select('id')
      .eq('creator_id', userId)
      .limit(1)
      .maybeSingle()
    if (handleError) throw handleError
    if (handle) return 'creator-pending'
  }

  return 'traveler'
}
