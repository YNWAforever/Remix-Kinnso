import { describe, expect, it } from 'vitest'
import {
  validateMissionDraft,
  validatePartnerLinkRequest,
  validateSettlementUpdate,
  validateSubmission,
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
  minTier: null,
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

  it('rejects non-finite merchant commission values', () => {
    const result = validateMissionDraft({
      ...base,
      affiliateCommissionRate: Number.NaN,
      kinnsoCommissionRate: Infinity,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.affiliateCommissionRate).toContain('non-negative')
    expect(result.errors.kinnsoCommissionRate).toContain('non-negative')
  })

  it('rejects non-number runtime commission values', () => {
    const result = validateMissionDraft({
      ...base,
      affiliateCommissionRate: '12' as unknown as number,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.affiliateCommissionRate).toContain('non-negative')
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

  it('rejects non-finite paid fee values', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'paid',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: Infinity,
      paidFeeCurrency: 'HKD',
      milestones: [{ title: 'Publish deliverable', description: 'Post one creator deliverable.' }],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.paidFeeAmount).toContain('non-negative')
  })

  it('rejects Travelpayouts missions without an affiliate network program ID', () => {
    const result = validateMissionDraft({
      ...base,
      missionSource: 'travelpayouts',
      affiliateNetworkProgramId: '',
      couponCode: null,
      couponUrl: null,
      milestones: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.affiliateNetworkProgramId).toContain('required')
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

  it('rejects partner link generation without an absolute HTTPS URL', () => {
    for (const originalUrl of ['abc', '/relative', 'http://example.com']) {
      const result = validatePartnerLinkRequest({
        programStatus: 'active',
        participantStatus: 'active',
        originalUrl,
      })
      expect(result.ok).toBe(false)
      expect(result.errors.originalUrl).toContain('https')
    }
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

  it('rejects negative settlement amounts', () => {
    const result = validateSettlementUpdate({
      actorIsOps: true,
      status: 'partially_paid',
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'paid',
      affiliateCommissionAmount: -1,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.affiliateCommissionAmount).toContain('non-negative')
  })

  it('rejects non-ops settlement updates', () => {
    const result = validateSettlementUpdate({
      actorIsOps: false,
      status: 'partially_paid',
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'paid',
      affiliateCommissionAmount: 130.25,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.actorIsOps).toContain('ops')
  })

  it('rejects negative creator commission amounts', () => {
    const result = validateSettlementUpdate({
      actorIsOps: true,
      status: 'partially_paid',
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'paid',
      creatorCommissionAmount: -5,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.creatorCommissionAmount).toContain('non-negative')
  })

  it('rejects unknown settlement statuses', () => {
    const result = validateSettlementUpdate({
      actorIsOps: true,
      status: 'bogus' as SettlementUpdateInput['status'],
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'paid',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.status).toContain('invalid')
  })

  it('rejects unknown creator payout statuses', () => {
    const result = validateSettlementUpdate({
      actorIsOps: true,
      status: 'partially_paid',
      creatorPayoutStatus: 'frozen' as SettlementUpdateInput['creatorPayoutStatus'],
      kinnsoCommissionStatus: 'paid',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.creatorPayoutStatus).toContain('invalid')
  })
})

describe('validateSubmission', () => {
  it('accepts a valid Instagram proof URL with notes', () => {
    expect(validateSubmission({ proofUrl: 'https://www.instagram.com/p/Cabc123/', notes: 'live now' }))
      .toEqual({ ok: true, errors: {} })
  })
  it('requires a proof URL', () => {
    const r = validateSubmission({ proofUrl: '  ' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('required')
  })
  it('rejects a non-http URL', () => {
    const r = validateSubmission({ proofUrl: 'ftp://example.com/x' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('url')
  })
  it('rejects an unsupported platform URL', () => {
    const r = validateSubmission({ proofUrl: 'https://www.tiktok.com/@u/video/123' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('unsupported')
  })
  it('accepts a YouTube proof URL', () => {
    expect(validateSubmission({ proofUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).ok).toBe(true)
  })
  it('rejects notes longer than 1000 chars', () => {
    const r = validateSubmission({ proofUrl: 'https://instagram.com/p/x', notes: 'a'.repeat(1001) })
    expect(r.ok).toBe(false)
    expect(r.errors.notes).toContain('too_long')
  })
})
