import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

/** A creator-safe perk row from the list_active_perks RPC — NO redemption_value. */
export type ActivePerk = Database['public']['Functions']['list_active_perks']['Returns'][number]

/** Creator-safe catalog via the SECURITY DEFINER RPC (metadata only). Errors propagate. */
export async function listActivePerks(supabase: SupabaseClient<Database>): Promise<ActivePerk[]> {
  const { data, error } = await supabase.rpc('list_active_perks')
  if (error) throw error
  return data ?? []
}

/** Perk ids the creator has already redeemed (owner-RLS on perk_redemptions). */
export async function listRedeemedPerkIds(
  supabase: SupabaseClient<Database>,
  creatorId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('perk_redemptions')
    .select('perk_id')
    .eq('creator_id', creatorId)
  if (error) throw error
  return (data ?? []).map((r) => r.perk_id as string)
}
