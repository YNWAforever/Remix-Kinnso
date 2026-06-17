import { describe, expect, it } from 'vitest'
import {
  nextJoinStatus,
  reviewParticipant,
  reviewSubmission,
} from '@/lib/missions/state'

describe('mission state transitions', () => {
  it('auto-joins merchant coupon missions', () => {
    expect(nextJoinStatus({ missionType: 'coupon_affiliate', missionSource: 'merchant' })).toEqual({
      source: 'open_join',
      status: 'active',
    })
  })

  it('auto-joins Travelpayouts affiliate network missions', () => {
    expect(nextJoinStatus({ missionType: 'coupon_affiliate', missionSource: 'travelpayouts' })).toEqual({
      source: 'affiliate_network_join',
      status: 'active',
    })
  })

  it('requires application for paid and hybrid missions', () => {
    expect(nextJoinStatus({ missionType: 'paid', missionSource: 'merchant' })).toEqual({
      source: 'application',
      status: 'applied',
    })
    expect(nextJoinStatus({ missionType: 'hybrid', missionSource: 'merchant' })).toEqual({
      source: 'application',
      status: 'applied',
    })
  })

  it('merchant approval moves applicants to active', () => {
    expect(reviewParticipant('applied', 'approve')).toBe('active')
  })

  it('merchant rejection moves applicants to rejected', () => {
    expect(reviewParticipant('applied', 'reject')).toBe('rejected')
  })

  it('submission review supports approval, revision, and rejection', () => {
    expect(reviewSubmission('submitted', 'approve')).toBe('approved')
    expect(reviewSubmission('submitted', 'request_revision')).toBe('revision_requested')
    expect(reviewSubmission('submitted', 'reject')).toBe('rejected')
  })

  it('does not let approved submissions be revised by creator state flow', () => {
    expect(() => reviewSubmission('approved', 'request_revision')).toThrow('Cannot review submission from approved')
  })
})
