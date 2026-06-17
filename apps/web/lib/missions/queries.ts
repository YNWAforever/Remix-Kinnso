import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export const merchantMissionSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
  coupon_code,coupon_url,paid_fee_amount,paid_fee_currency,
  mission_participants(id,status,source,creator_id,application_note,merchant_review_note,approved_at),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_settlements(id,status,creator_payout_status,kinnso_commission_status,affiliate_commission_status)
`

export const creatorMissionSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
  coupon_code,coupon_url,paid_fee_amount,paid_fee_currency,affiliate_network_program_id,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_participants(id,status,source,creator_id),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`

export const opsSettlementSelect = `
  id,status,merchant_invoice_status,merchant_payment_status,creator_payout_status,
  kinnso_commission_status,affiliate_commission_status,amount_currency,
  paid_fee_amount,affiliate_commission_amount,kinnso_commission_amount,creator_commission_amount,ops_note,
  missions(id,title,mission_source,mission_type),
  mission_participants(id,creator_id,status),
  affiliate_network_events(id,network,external_action_id,sub_id,event_state,profit_amount,currency)
`

export async function getMerchantProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  return supabase.from('merchant_profiles').select('id, company_name, contact_email, status').eq('user_id', userId).maybeSingle()
}

export async function listMerchantMissions(
  supabase: SupabaseClient<Database>,
  merchantProfileId: string,
) {
  return supabase
    .from('missions')
    .select(merchantMissionSelect)
    .eq('merchant_profile_id', merchantProfileId)
    .order('created_at', { ascending: false })
}

export async function listCreatorMissions(
  supabase: SupabaseClient<Database>,
  creatorId: string,
) {
  return supabase
    .from('missions')
    .select(creatorMissionSelect)
    .eq('status', 'published')
    .or(`visibility.eq.open,mission_participants.creator_id.eq.${creatorId}`)
    .order('published_at', { ascending: false })
}

export async function listOpsSettlements(supabase: SupabaseClient<Database>) {
  return supabase
    .from('mission_settlements')
    .select(opsSettlementSelect)
    .order('updated_at', { ascending: false })
}
