import { describe, expect, it } from 'vitest'
import {
  merchantMissionSelect,
  creatorMissionSelect,
  opsSettlementSelect,
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
})
