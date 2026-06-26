import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type RawCreator = Database['public']['Functions']['admin_list_creators']['Returns'][number]
type RawMerchant = Database['public']['Functions']['admin_list_merchants']['Returns'][number]
type RawOps = Database['public']['Functions']['admin_list_ops']['Returns'][number]

/** creators.display_name and .handle are nullable in the DB, but Supabase types
 *  RETURNS-TABLE columns as non-null — widen them so the UI can fall back. */
export type AdminCreator = Omit<RawCreator, 'display_name' | 'handle'> & {
  display_name: string | null
  handle: string | null
}
export type AdminMerchant = RawMerchant
export type AdminOps = RawOps
export type AdminUsers = { creators: AdminCreator[]; merchants: AdminMerchant[]; ops: AdminOps[] }

/** Ops-only read of all users via the three SECURITY DEFINER RPCs. Errors propagate
 *  (no silent []). Non-ops callers are rejected at the DB boundary → the RPC errors. */
export async function listAdminUsers(supabase: SupabaseClient<Database>): Promise<AdminUsers> {
  const [creators, merchants, ops] = await Promise.all([
    supabase.rpc('admin_list_creators'),
    supabase.rpc('admin_list_merchants'),
    supabase.rpc('admin_list_ops'),
  ])
  if (creators.error) throw creators.error
  if (merchants.error) throw merchants.error
  if (ops.error) throw ops.error
  return {
    creators: (creators.data ?? []) as AdminCreator[],
    merchants: (merchants.data ?? []) as AdminMerchant[],
    ops: (ops.data ?? []) as AdminOps[],
  }
}
