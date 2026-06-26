import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

const studioMissionsPath = (locale: Locale) => `/${locale}/studio/missions`

/** Maps the RPC's raised error codes to friendly, surfaceable messages. */
const FRIENDLY: Record<string, string> = {
  no_invite: 'There is no pending invite for this mission',
}

/** Find the first known error code mentioned in the RPC error message. */
function mapRpcError(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? ''
  for (const [code, friendly] of Object.entries(FRIENDLY)) {
    if (message.includes(code)) return friendly
  }
  return 'The invite could not be accepted'
}

/**
 * Creator accepts a merchant's invite to a mission. The `accept_mission_invite`
 * RPC promotes the pending invite to active participation and raises `no_invite`
 * when there is nothing to accept.
 */
export async function acceptInviteAction(
  locale: Locale,
  missionId: string,
): Promise<ActionResult<{ missionId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  if ((await resolveViewerRole(supabase)) !== 'creator') return formError('Creator access is required')

  const { error } = await supabase.rpc('accept_mission_invite', {
    p_mission_id: missionId,
  })
  if (error) return formError(mapRpcError(error))

  revalidatePath(studioMissionsPath(locale))
  return { ok: true, missionId }
}
