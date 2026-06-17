import type { MissionDraftInput } from './types'

export const missionDraftFixture: MissionDraftInput = {
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  visibility: 'open',
  title: 'Hong Kong staycation coupon',
  summary: 'Promote a weekend staycation discount.',
  couponCode: 'STAY10',
  couponUrl: 'https://example.com/staycation',
  affiliateCommissionRate: 10,
  kinnsoCommissionRate: 4,
  creatorCommissionRate: 6,
  paidFeeAmount: null,
  paidFeeCurrency: null,
  affiliateNetworkProgramId: null,
  milestones: [{ title: 'Publish post', description: 'Share one post with the tracked link.' }],
}

export const travelpayoutsMissionDraftFixture: MissionDraftInput = {
  ...missionDraftFixture,
  missionSource: 'travelpayouts',
  affiliateNetworkProgramId: 'program-1',
  couponCode: null,
  couponUrl: null,
  milestones: [],
}
