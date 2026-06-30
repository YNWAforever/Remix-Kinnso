import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { listRecentAudit, type AuditEntry } from '@/lib/admin/audit'

type Client = SupabaseClient<Database>

export interface MerchantDirectoryRow {
  id: string
  companyName: string
  status: string
  tier: string
  createdAt: string
}
export interface MerchantsDirectory {
  rows: MerchantDirectoryRow[]
  nextCursor: { createdAt: string; id: string } | null
}
export interface ListMerchantsParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  limit?: number
  cursor?: { createdAt: string; id: string } | null
}

type SearchRow = { id: string; company_name: string; status: string; tier: string; created_at: string }

/** Ops-aggregate merchant directory via SECURITY DEFINER admin_search_merchants (keyset).
 *  Fetches limit+1 to derive nextCursor, then trims. Errors propagate. */
export async function listMerchantsDirectory(supabase: Client, params: ListMerchantsParams): Promise<MerchantsDirectory> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100)
  const { data, error } = await supabase.rpc('admin_search_merchants', {
    p_search: params.search ?? null,
    p_statuses: params.statuses ?? null,
    p_tiers: params.tiers ?? null,
    p_limit: limit + 1,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
  })
  if (error) throw error
  const all = ((data ?? []) as unknown as SearchRow[]).map((r) => ({
    id: r.id, companyName: r.company_name, status: r.status, tier: r.tier, createdAt: r.created_at,
  }))
  const rows = all.slice(0, limit)
  const nextCursor = all.length > limit ? { createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id } : null
  return { rows, nextCursor }
}

export interface MerchantsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    byTier: Record<string, number>
    newInPeriod: number
    newPrevPeriod: number
    missionsLive: number
    settlementsPending: number
    owed: { currency: string; amount: number }[]
    settled: { currency: string; amount: number }[]
  }
  signups: { day: string; count: number }[]
  missionsCreated: { day: string; count: number }[]
  leaderboard: { id: string; companyName: string | null; tier: string; missionsCount: number; creatorsEngaged: number }[]
  atRisk: { id: string; companyName: string | null; reason: string }[]
  recentActivity: AuditEntry[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status: Record<string, number>
    by_tier: Record<string, number>
    new_in_period: number
    new_prev_period: number
    missions_live: number
    settlements_pending: number
    owed?: { currency: string; amount: number }[]
    settled?: { currency: string; amount: number }[]
  }
  signups?: { day: string; count: number }[]
  missions_created?: { day: string; count: number }[]
  leaderboard?: { id: string; company_name: string | null; tier: string; missions_count: number; creators_engaged: number }[]
  at_risk?: { id: string; company_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Merchants Overview. Counts/series come from the SECURITY DEFINER
 * `admin_merchant_analytics()` RPC (gated on is_active_ops()). The recent-activity
 * feed reads the shared ops_audit_log. Errors propagate (no silent zeros).
 */
export async function getMerchantsOverview(supabase: Client, days = 30): Promise<MerchantsOverview> {
  const { data, error } = await supabase.rpc('admin_merchant_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_merchant_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  const recentActivity = await listRecentAudit(supabase, 'merchant', 20)
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      byTier: a.kpis.by_tier ?? {},
      newInPeriod: Number(a.kpis.new_in_period),
      newPrevPeriod: Number(a.kpis.new_prev_period),
      missionsLive: Number(a.kpis.missions_live),
      settlementsPending: Number(a.kpis.settlements_pending),
      owed: (a.kpis.owed ?? []).map((o) => ({ currency: o.currency, amount: Number(o.amount) })),
      settled: (a.kpis.settled ?? []).map((s) => ({ currency: s.currency, amount: Number(s.amount) })),
    },
    signups: (a.signups ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    missionsCreated: (a.missions_created ?? []).map((m) => ({ day: m.day, count: Number(m.count) })),
    leaderboard: (a.leaderboard ?? []).map((l) => ({
      id: l.id, companyName: l.company_name, tier: l.tier,
      missionsCount: Number(l.missions_count), creatorsEngaged: Number(l.creators_engaged),
    })),
    atRisk: (a.at_risk ?? []).map((r) => ({ id: r.id, companyName: r.company_name, reason: r.reason })),
    recentActivity,
  }
}
