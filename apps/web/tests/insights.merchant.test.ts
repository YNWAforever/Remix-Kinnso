import { describe, expect, it, vi } from 'vitest'
import { getMerchantInsights } from '@/lib/insights/merchant'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const RAW = {
  missions_published: 2,
  per_mission: [
    { mission_id: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approved_submissions: 2 },
  ],
  totals: { participants: 5, invited: 4, accepted: 2, approved_submissions: 2 },
}

describe('getMerchantInsights', () => {
  it('maps the RPC payload and computes invite acceptance rate', async () => {
    const res = await getMerchantInsights(client(RAW))
    expect(res.missionsPublished).toBe(2)
    expect(res.perMission[0].approvedSubmissions).toBe(2)
    expect(res.totals.accepted).toBe(2)
    expect(res.inviteAcceptRate).toBeCloseTo(0.5) // 2 / 4
  })

  it('returns null acceptance rate when there are no invites', async () => {
    const res = await getMerchantInsights(client({ ...RAW, totals: { ...RAW.totals, invited: 0, accepted: 0 } }))
    expect(res.inviteAcceptRate).toBeNull()
  })

  it('throws when the RPC errors', async () => {
    await expect(getMerchantInsights(client(null, new Error('forbidden')))).rejects.toThrow('forbidden')
  })
})
