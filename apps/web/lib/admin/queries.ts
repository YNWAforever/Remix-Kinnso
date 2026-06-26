import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>
export interface AdminOverview { creators: number; merchants: number; ops: number }

async function countRows(supabase: Client, table: 'creators' | 'merchant_profiles' | 'kinnso_ops_members', activeOps = false): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (activeOps) q = q.eq('status', 'active')
  const { count } = await q
  return count ?? 0
}

/** Dashboard overview. Perk/redemption counts are added in Phase 6B. */
export async function getAdminOverview(supabase: Client): Promise<AdminOverview> {
  const [creators, merchants, ops] = await Promise.all([
    countRows(supabase, 'creators'),
    countRows(supabase, 'merchant_profiles'),
    countRows(supabase, 'kinnso_ops_members', true),
  ])
  return { creators, merchants, ops }
}
