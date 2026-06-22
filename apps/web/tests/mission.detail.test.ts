import { describe, expect, it } from 'vitest'
import {
  buildMilestoneRows,
  missionCompensation,
  resolveParticipationCta,
  toCreatorMissionDetail,
  type MissionDetailRow,
} from '@/lib/missions/detail'

describe('resolveParticipationCta', () => {
  it('maps no participant to join for coupon and apply for paid/hybrid', () => {
    expect(resolveParticipationCta(null, 'coupon_affiliate')).toBe('join')
    expect(resolveParticipationCta(null, 'paid')).toBe('apply')
    expect(resolveParticipationCta(null, 'hybrid')).toBe('apply')
  })
  it('maps participant statuses to ctas', () => {
    expect(resolveParticipationCta('applied', 'paid')).toBe('awaiting')
    expect(resolveParticipationCta('invited', 'paid')).toBe('awaiting')
    expect(resolveParticipationCta('active', 'paid')).toBe('active')
    expect(resolveParticipationCta('completed', 'paid')).toBe('active')
    expect(resolveParticipationCta('rejected', 'paid')).toBe('rejected')
    expect(resolveParticipationCta('cancelled', 'paid')).toBe('rejected')
  })
})

describe('buildMilestoneRows', () => {
  it('joins the latest submission per milestone, sorts by sort_order, derives state + signal', () => {
    const milestones = [
      { id: 'b', title: 'Second', description: 'd2', due_at: null, sort_order: 2 },
      { id: 'a', title: 'First', description: 'd1', due_at: '2026-07-02T00:00:00Z', sort_order: 1 },
    ]
    const submissions = [
      { id: 's1', mission_milestone_id: 'a', status: 'submitted', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z', mission_social_snapshots: [{ confidence_status: 'verified_signal' }] },
      { id: 's2', mission_milestone_id: 'a', status: 'approved', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-22T00:00:00Z', mission_social_snapshots: [{ confidence_status: 'needs_review' }] },
    ]
    const rows = buildMilestoneRows(milestones, submissions)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ title: 'First', state: 'approved', signal: 'needs_review', dueAt: '2026-07-02T00:00:00Z' })
    expect(rows[1]).toMatchObject({ title: 'Second', state: 'none', signal: null })
  })

  it('treats null/pending/empty as no state and no signal', () => {
    const rows = buildMilestoneRows(
      [{ id: 'a', title: 'T', description: '', due_at: null, sort_order: 1 }],
      [{ id: 's', mission_milestone_id: 'a', status: 'pending', proof_urls: null, notes: null, merchant_feedback: null, submitted_at: null, mission_social_snapshots: [] }],
    )
    expect(rows[0]).toMatchObject({ state: 'none', signal: null })
    expect(buildMilestoneRows(null, null)).toEqual([])
  })
})

describe('missionCompensation', () => {
  it('formats paid, affiliate, and hybrid combinations', () => {
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'paid', paid_fee_amount: 5000, paid_fee_currency: 'HKD', affiliate_commission_rate: null, creator_commission_rate: null, affiliate_network_programs: null })).toBe('HKD 5000')
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'hybrid', paid_fee_amount: 5000, paid_fee_currency: 'HKD', affiliate_commission_rate: 20, creator_commission_rate: 15, affiliate_network_programs: null })).toBe('HKD 5000 + Affiliate commission 15% creator / 20% total')
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'coupon_affiliate', paid_fee_amount: null, paid_fee_currency: null, affiliate_commission_rate: null, creator_commission_rate: null, affiliate_network_programs: null })).toBe('Affiliate commission')
  })
})

describe('toCreatorMissionDetail', () => {
  const base: MissionDetailRow = {
    id: 'm1', title: 'Summer', summary: 'Do stuff', mission_source: 'merchant', mission_type: 'hybrid', status: 'published',
    coupon_code: null, coupon_url: null, paid_fee_amount: 5000, paid_fee_currency: 'HKD',
    affiliate_commission_rate: 20, creator_commission_rate: 15, kinnso_commission_rate: 5,
    affiliate_network_programs: null, mission_milestones: [{ id: 'a', title: 'M1', description: '', due_at: null, sort_order: 1 }],
    mission_participants: [], affiliate_partner_links: [],
  }

  it('composes header, cta, and milestones for a non-participant', () => {
    const detail = toCreatorMissionDetail(base, 'creator-1')
    expect(detail).toMatchObject({ id: 'm1', title: 'Summer', missionType: 'hybrid', cta: 'apply', participantStatus: null, compensation: 'HKD 5000 + Affiliate commission 15% creator / 20% total' })
    expect(detail.milestones).toHaveLength(1)
  })

  it('uses the viewing creator participant for cta + milestone state', () => {
    const detail = toCreatorMissionDetail(
      { ...base, mission_participants: [
        { id: 'p-other', status: 'active', source: 'application', creator_id: 'someone-else', application_note: null, mission_milestone_submissions: [] },
        { id: 'p-mine', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null, mission_milestone_submissions: [{ id: 's', mission_milestone_id: 'a', status: 'submitted', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z', mission_social_snapshots: [] }] },
      ] },
      'creator-1',
    )
    expect(detail).toMatchObject({ cta: 'active', participantStatus: 'active' })
    expect(detail.milestones[0]).toMatchObject({ state: 'submitted', signal: 'unavailable' })
  })
})
