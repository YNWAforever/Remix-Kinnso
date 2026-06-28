import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/admin/audit', () => ({
  listRecentAudit: vi.fn(async () => [
    { id: 'a1', entityType: 'creator', entityId: 'c1', action: 'note.add', reason: 'hi', metadata: {}, createdAt: '2026-06-28T00:00:00Z' },
  ]),
}))

import { getCreatorsOverview } from '@/lib/admin/creators-queries'

const analytics = {
  kpis: { total: 12, by_status: { onboarding: 2, active: 8, suspended: 2 }, new_in_period: 3, new_prev_period: 1, payouts_pending: 4 },
  signups: [{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }],
  engagement: [{ day: '2026-06-28', points: 40 }],
  leaderboard: [{ creator_id: 'c1', display_name: 'Mia', points: 320, tier: 'pro' }],
  at_risk: [{ creator_id: 'c2', display_name: 'Lee', reason: 'scan_failed' }],
}

/** Mocks supabase.rpc('admin_creator_analytics', { p_days }) → { data, error }. */
function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) }
}

describe('getCreatorsOverview', () => {
  it('maps the analytics jsonb + recent feed into a typed CreatorsOverview', async () => {
    const c = client(analytics)
    const o = await getCreatorsOverview(c as never, 30)
    expect(c.rpc).toHaveBeenCalledWith('admin_creator_analytics', { p_days: 30 })
    expect(o.kpis).toEqual({ total: 12, byStatus: { onboarding: 2, active: 8, suspended: 2 }, newInPeriod: 3, newPrevPeriod: 1, payoutsPending: 4 })
    expect(o.signups).toEqual([{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }])
    expect(o.engagement).toEqual([{ day: '2026-06-28', points: 40 }])
    expect(o.leaderboard).toEqual([{ creatorId: 'c1', displayName: 'Mia', points: 320, tier: 'pro' }])
    expect(o.atRisk).toEqual([{ creatorId: 'c2', displayName: 'Lee', reason: 'scan_failed' }])
    expect(o.recentActivity[0].action).toBe('note.add')
  })
  it('defaults missing status buckets and arrays to honest zeros/empties', async () => {
    const o = await getCreatorsOverview(client({ kpis: { total: 0, by_status: {}, new_in_period: 0, new_prev_period: 0, payouts_pending: 0 } }) as never, 30)
    expect(o.signups).toEqual([])
    expect(o.engagement).toEqual([])
    expect(o.leaderboard).toEqual([])
    expect(o.atRisk).toEqual([])
  })
  it('throws when the RPC errors (no silent zeros)', async () => {
    await expect(getCreatorsOverview(client(null, { message: 'forbidden' }) as never, 30)).rejects.toBeTruthy()
  })
})
