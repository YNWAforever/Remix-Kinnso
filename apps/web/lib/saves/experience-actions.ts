'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

const tripsPath = (locale: Locale) => `/${locale}/trips`

/** Save an experience to the traveller's list (idempotent upsert). */
export async function saveExperienceAction(
  locale: Locale,
  experienceId: string,
): Promise<ActionResult<{ experienceId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  // ignoreDuplicates compiles to INSERT ... ON CONFLICT DO NOTHING, never
  // ON CONFLICT DO UPDATE -- so no UPDATE grant on experience_saves is needed,
  // and a traveller can never reassign an existing save row's experience_id via
  // this call (which would desync experiences.saves_count from the AFTER INSERT
  // OR DELETE-only trigger). See 20260706094500_r6a_revoke_saves_update_grant.sql.
  const { error } = await supabase
    .from('experience_saves')
    .upsert(
      { experience_id: experienceId, traveler_user_id: gate.user.id },
      { onConflict: 'experience_id,traveler_user_id', ignoreDuplicates: true },
    )
  if (error) return formError('Experience could not be saved')

  revalidatePath(tripsPath(locale))
  return { ok: true, experienceId }
}

/** Remove an experience from the traveller's saved list. */
export async function unsaveExperienceAction(
  locale: Locale,
  experienceId: string,
): Promise<ActionResult<{ experienceId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('experience_saves')
    .delete()
    .eq('experience_id', experienceId)
    .eq('traveler_user_id', gate.user.id)
  if (error) return formError('Experience could not be removed')

  revalidatePath(tripsPath(locale))
  return { ok: true, experienceId }
}
