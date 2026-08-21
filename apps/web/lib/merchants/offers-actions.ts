'use server'

import { revalidatePath } from 'next/cache'
import { requireMerchantAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateOfferInput, type OfferInput } from '@/lib/merchants/offers-validation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function createMerchantOfferAction(input: OfferInput): Promise<ActionResult<{ id: string }>> {
  const validation = validateOfferInput(input)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const p = validation.parsed
  const { data, error } = await supabase
    .from('merchant_offers')
    .insert({
      merchant_profile_id: gate.merchantId,
      mission_id: p.missionId,
      title: p.title, terms: p.terms,
      discount_kind: p.discountKind, discount_value: p.discountValue,
      commission_kind: p.commissionKind, commission_value: p.commissionValue,
      valid_from: p.validFrom, valid_to: p.validTo,
      per_visitor_limit: p.perVisitorLimit, total_cap: p.totalCap,
    })
    .select('id')
    .single()
  if (error || !data) {
    if (error) console.error('[merchant:offers] create failed', error)
    return formError('Offer could not be created')
  }

  revalidatePath('/merchants/dashboard/offers')
  return { ok: true, id: data.id as string }
}

export async function setMerchantOfferStatusAction(
  offerId: string,
  status: 'live' | 'paused' | 'ended',
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('merchant_offers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('merchant_profile_id', gate.merchantId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[merchant:offers] setStatus failed', error)
    return formError('Offer status could not be changed')
  }

  revalidatePath('/merchants/dashboard/offers')
  return { ok: true, id: data.id as string }
}
