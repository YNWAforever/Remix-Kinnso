import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { listRecentAudit, type AuditEntry } from '@/lib/admin/audit'

type Client = SupabaseClient<Database>

export interface CreatorsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    newInPeriod: number
    newPrevPeriod: number
    payoutsPending: number
  }
  signups: { day: string; count: number }[]
  engagement: { day: string; points: number }[]
  leaderboard: { creatorId: string; displayName: string | null; points: number; tier: string }[]
  atRisk: { creatorId: string; displayName: string | null; reason: string }[]
  recentActivity: AuditEntry[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status: Record<string, number>
    new_in_period: number
    new_prev_period: number
    payouts_pending: number
  }
  signups?: { day: string; count: number }[]
  engagement?: { day: string; points: number }[]
  leaderboard?: { creator_id: string; display_name: string | null; points: number; tier: string }[]
  at_risk?: { creator_id: string; display_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Creators Overview. Counts/series come from the SECURITY DEFINER
 * `admin_creator_analytics()` RPC (gated on is_active_ops()) so an ops user sees
 * platform-wide data despite owner-scoped RLS. The recent-activity feed reads the
 * shared ops_audit_log. Errors propagate (no silent zeros).
 */
export async function getCreatorsOverview(supabase: Client, days = 30): Promise<CreatorsOverview> {
  const { data, error } = await supabase.rpc('admin_creator_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_creator_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  const recentActivity = await listRecentAudit(supabase, 'creator', 20)
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      newInPeriod: Number(a.kpis.new_in_period),
      newPrevPeriod: Number(a.kpis.new_prev_period),
      payoutsPending: Number(a.kpis.payouts_pending),
    },
    signups: (a.signups ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    engagement: (a.engagement ?? []).map((e) => ({ day: e.day, points: Number(e.points) })),
    leaderboard: (a.leaderboard ?? []).map((l) => ({
      creatorId: l.creator_id, displayName: l.display_name, points: Number(l.points), tier: l.tier,
    })),
    atRisk: (a.at_risk ?? []).map((r) => ({
      creatorId: r.creator_id, displayName: r.display_name, reason: r.reason,
    })),
    recentActivity,
  }
}
