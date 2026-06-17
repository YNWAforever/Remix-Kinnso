import { describe, expect, it } from 'vitest'
import {
  validateMissionDraft,
  validatePartnerLinkRequest,
  validateSettlementUpdate,
} from '@/lib/missions/validation'
import type {
  MissionDraftInput,
  PartnerLinkRequest,
  SettlementUpdateInput,
} from '@/lib/missions/types'

const base: MissionDraftInput = {
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  visibility: 'open',
  title: 'Tokyo ramen coupon campaign',
  summary: 'Share the spring ramen coupon with travel food followers.',
  couponCode: 'RAMEN10',
  couponUrl: 'https://example.com/ramen',
  affiliateCommissionRate: 12,
  kinnsoCommissionRate: 4,
  creatorCommissionRate: 8,
  paidFeeAmount: null,
  paidFeeCurrency: null,
  affiliateNetworkProgramId: null,
  milestones: [{ title: 'Share coupon post', description: 'Post one IG reel or Threads post.' }],
}

describe('mission validation', () => {
  it('accepts a merchant coupon affiliate mission with coupon and commission terms', () => {
    expect(validateMissionDraft(base)).toEqual({ ok: true, errors: {} })
  })

  it('rejects merchant coupon missions without coupon terms', () => {
    const result = validateMissionDraft({ ...base, couponCode: '', couponUrl: '' })
    expect(result.ok).toBe(false)
    expect(result.errors.couponCode).toContain('required')
    expect(result.errors.couponUrl).toContain('required')
  })

  it('accepts Travelpayouts missions without merchant coupon fields', () => {
    const result = validateMissionDraft({
      ...base,
      missionSource: 'travelpayouts',
      affiliateNetworkProgramId: 'program-1',
      couponCode: null,
      couponUrl: null,
      milestones: [],
    })
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('rejects paid missions without a paid fee and at least one milestone', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'paid',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: null,
      paidFeeCurrency: null,
      milestones: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.paidFeeAmount).toContain('required')
    expect(result.errors.milestones).toContain('at least one')
  })

  it('rejects partner link generation without an active participant', () => {
    const request: PartnerLinkRequest = {
      programStatus: 'active',
      participantStatus: 'applied',
      originalUrl: 'https://booking.example/hotel',
    }
    const result = validatePartnerLinkRequest(request)
    expect(result.ok).toBe(false)
    expect(result.errors.participantStatus).toContain('active')
  })

  it('allows ops settlement updates with non-negative amounts', () => {
    const input: SettlementUpdateInput = {
      actorIsOps: true,
      status: 'partially_paid',
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'paid',
      affiliateCommissionAmount: 130.25,
    }
    expect(validateSettlementUpdate(input)).toEqual({ ok: true, errors: {} })
  })
})
