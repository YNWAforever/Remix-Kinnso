import { describe, expect, it, vi } from 'vitest'
import { missionDraftFixture } from '@/lib/missions/fixtures'
import { buildMissionInsert, buildParticipantInsert } from '@/lib/missions/actions'

describe('mission actions builders', () => {
  it('builds a mission insert payload from a valid merchant draft', () => {
    const payload = buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload).toMatchObject({
      merchant_profile_id: 'merchant-profile-1',
      mission_source: 'merchant',
      mission_type: 'coupon_affiliate',
      status: 'published',
      coupon_code: 'STAY10',
    })
    expect(payload.published_at).toEqual(expect.any(String))
  })

  it('builds an active participant for coupon auto-join', () => {
    expect(buildParticipantInsert({
      missionId: 'mission-1',
      creatorId: 'creator-1',
      missionType: 'coupon_affiliate',
      missionSource: 'merchant',
    })).toMatchObject({
      mission_id: 'mission-1',
      creator_id: 'creator-1',
      status: 'active',
      source: 'open_join',
    })
  })

  it('does not import next/cache at module evaluation in tests', async () => {
    vi.resetModules()
    await expect(import('@/lib/missions/actions')).resolves.toBeTruthy()
  })
})
