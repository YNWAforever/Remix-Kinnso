import { notFound, redirect } from 'next/navigation'
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { formError, type ActionFailure } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Page gate: redirect anon to sign-in, notFound for non-ops. Returns the ops user. */
export async function requireOpsPage(supabase: Supabase, loc: Locale): Promise<{ user: { id: string } }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'ops') notFound()
  return { user }
}

/**
 * Page gate: redirect anon to sign-in, then deny non-creators. Returns the creator user.
 *
 * `denied` exists because the studio's eight role-checking pages historically split into
 * two behaviours and both are asserted by host tests: six `notFound()` (the default here),
 * while /studio/insights and /studio/tier `redirect()` to the hub. This helper preserves
 * each page's existing behaviour rather than silently unifying it.
 *
 * `creators.id` IS `auth.uid()`, so the returned `user.id` is directly usable as a
 * creator id — same rule requireCreatorAction documents.
 */
export async function requireCreatorPage(
  supabase: Supabase,
  loc: Locale,
  denied: 'not-found' | 'studio' = 'not-found',
): Promise<{ user: { id: string } }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'creator') {
    if (denied === 'studio') redirect(`/${loc}/studio`)
    notFound()
  }
  return { user }
}

/** Action gate: typed failure for anon/non-ops; ok+user for ops. */
export async function requireOpsAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  if ((await resolveViewerRole(supabase)) !== 'ops') return formError('Active ops access is required')
  return { ok: true, user }
}

/**
 * Action gate: typed failure for anon/non-creator; ok+user for a creator.
 * Unlike requireMerchantAction, no extra lookup is needed — creators.id IS
 * auth.uid() directly (creators is a one-row-per-auth-user table), so
 * user.id can be used as host_creator_id / community_sessions ownership
 * directly by the caller.
 */
export async function requireCreatorAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  if ((await resolveViewerRole(supabase)) !== 'creator') return formError('Creator access is required')
  return { ok: true, user }
}

/**
 * Action gate: typed failure for anon/non-merchant; ok+user+merchantId for a
 * merchant. Resolves the caller's own `merchant_profiles.id` so callers can
 * scope writes to the owning merchant (RLS still enforces ownership).
 */
export async function requireMerchantAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string }; merchantId: string } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  if ((await resolveViewerRole(supabase)) !== 'merchant') return formError('Merchant access is required')
  const { data: profile } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile) return formError('Merchant access is required')
  return { ok: true, user, merchantId: profile.id as string }
}

/**
 * Action gate: typed failure for anon; ok+user for any signed-in traveller. No
 * role or profile-table lookup -- any authenticated user may save/review as a
 * traveller (D-R6A-4/D-R6A-6), unlike requireMerchantAction's ownership check.
 */
export async function requireTravelerAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  return { ok: true, user }
}
