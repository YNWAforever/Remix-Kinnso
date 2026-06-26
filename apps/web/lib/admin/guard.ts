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

/** Action gate: typed failure for anon/non-ops; ok+user for ops. */
export async function requireOpsAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  if ((await resolveViewerRole(supabase)) !== 'ops') return formError('Active ops access is required')
  return { ok: true, user }
}
