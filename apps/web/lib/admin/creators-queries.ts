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

export interface DirectoryRow {
  id: string
  displayName: string | null
  handle: string | null
  status: string
  verified: boolean
  tier: string | null
  dnaStatus: string | null
  contributionPoints: number
  createdAt: string
}

export interface CreatorsDirectory {
  rows: DirectoryRow[]
  nextCursor: { createdAt: string; id: string } | null
}

export interface ListDirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  dna?: 'published' | 'draft' | 'none'
  verified?: boolean
  limit?: number
  cursor?: { createdAt: string; id: string } | null
}

type SearchRow = {
  id: string
  display_name: string | null
  handle: string | null
  status: string
  verified: boolean
  tier: string | null
  dna_status: string | null
  contribution_points: number | null
  created_at: string
}

/**
 * Filtered, keyset-paginated creator directory for ops. Goes through the
 * SECURITY DEFINER `admin_search_creators` RPC (is_active_ops()-gated) so an ops
 * user sees all creators despite owner-scoped RLS. Errors propagate.
 */
export async function listCreatorsDirectory(supabase: Client, params: ListDirectoryParams): Promise<CreatorsDirectory> {
  const limit = params.limit ?? 25
  const { data, error } = await supabase.rpc('admin_search_creators', {
    p_search: params.search ?? null,
    p_statuses: params.statuses ?? null,
    p_tiers: params.tiers ?? null,
    p_dna: params.dna ?? null,
    p_verified: params.verified ?? null,
    p_limit: limit,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
  })
  if (error) throw error
  const raw = (data ?? []) as SearchRow[]
  const rows: DirectoryRow[] = raw.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    handle: r.handle,
    status: r.status,
    verified: r.verified,
    tier: r.tier,
    dnaStatus: r.dna_status,
    contributionPoints: Number(r.contribution_points ?? 0),
    createdAt: r.created_at,
  }))
  const last = rows[rows.length - 1]
  const nextCursor = rows.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null
  return { rows, nextCursor }
}
