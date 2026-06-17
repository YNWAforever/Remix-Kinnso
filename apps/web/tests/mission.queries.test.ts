import { describe, expect, it, vi } from 'vitest'
import {
  merchantMissionSelect,
  creatorMissionSelect,
  opsSettlementSelect,
  listCreatorMissions,
} from '@/lib/missions/queries'

describe('mission query projections', () => {
  it('keeps merchant mission projection stable', () => {
    expect(merchantMissionSelect).toContain('mission_participants')
    expect(merchantMissionSelect).toContain('mission_settlements')
  })

  it('keeps creator mission projection stable', () => {
    expect(creatorMissionSelect).toContain('affiliate_partner_links')
    expect(creatorMissionSelect).toContain('mission_milestones')
  })

  it('keeps ops settlement projection stable', () => {
    expect(opsSettlementSelect).toContain('affiliate_network_events')
    expect(opsSettlementSelect).toContain('mission_participants')
  })

  it('relies on RLS instead of raw creator relation filters for creator missions', async () => {
    const query = {
      eq: vi.fn(),
      order: vi.fn(),
      or: vi.fn(),
      select: vi.fn(),
    }
    query.eq.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    query.or.mockReturnValue(query)
    query.select.mockReturnValue(query)
    const supabase = { from: vi.fn(() => query) }

    await listCreatorMissions(supabase as never, 'creator-1')

    expect(query.eq).toHaveBeenCalledWith('status', 'published')
    expect(query.or).not.toHaveBeenCalled()
  })
})
