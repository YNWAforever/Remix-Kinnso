'use server'

import { cookies } from 'next/headers'
import { requireTravelerAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function claimOfferAction(
  offerId: string,
  creatorId: string,
  guideId: string | null,
  source: 'guide' | 'profile',
): Promise<ActionResult<{ claimId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('claim_offer', {
    p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: guideId, p_source: source,
  })
  if (error || !data) {
    if (error) console.error('[offers] claim failed', error)
    return formError('This offer could not be claimed')
  }

  const result = data as { claim_id: string; raw_token: string; expires_at: string }
  const cookieStore = await cookies()
  cookieStore.set(`offer-token-${result.claim_id}`, result.raw_token, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
  })

  return { ok: true, claimId: result.claim_id }
}
