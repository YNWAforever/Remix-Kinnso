import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'missing'
const d = svcKey && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? describe : describe.skip

const anon = createClient(url, anonKey)
const svc = createClient(url, svcKey ?? 'missing')

const creatorEmail = 'mission-creator@example.test'
const otherCreatorEmail = 'mission-other-creator@example.test'
const snapshotCreatorEmail = 'mission-snapshot-creator@example.test'
const merchantEmail = 'mission-merchant@example.test'
const opsEmail = 'mission-ops@example.test'
const password = 'Test1234!'

let creatorId = ''
let otherCreatorId = ''
let snapshotCreatorId = ''
let merchantUserId = ''
let opsUserId = ''
let merchantProfileId = ''
let opsMemberId = ''
let missionId = ''
let targetedMissionId = ''
let affiliateProgramId = ''

const missionTableNames = [
  'merchant_profiles',
  'kinnso_ops_members',
  'affiliate_network_programs',
  'missions',
  'mission_participants',
  'mission_milestones',
  'mission_milestone_submissions',
  'mission_social_snapshots',
  'affiliate_partner_links',
  'affiliate_network_events',
  'mission_settlements',
]

async function recreateUser(email: string) {
  const existing = await svc.auth.admin.listUsers()
  const prev = (existing.data?.users ?? []).find((u) => u.email === email)
  if (prev) await svc.auth.admin.deleteUser(prev.id)
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  expect(error).toBeNull()
  return data.user!.id
}

async function authed(email: string) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

d('mission schema RLS', () => {
  beforeAll(async () => {
    creatorId = await recreateUser(creatorEmail)
    otherCreatorId = await recreateUser(otherCreatorEmail)
    snapshotCreatorId = await recreateUser(snapshotCreatorEmail)
    merchantUserId = await recreateUser(merchantEmail)
    opsUserId = await recreateUser(opsEmail)

    const merchant = await svc
      .from('merchant_profiles')
      .insert({ user_id: merchantUserId, company_name: 'Kinnso Test Merchant', contact_email: merchantEmail })
      .select('id')
      .single()
    expect(merchant.error).toBeNull()
    merchantProfileId = merchant.data!.id

    const ops = await svc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'Ops Test', status: 'active' })
      .select('id')
      .single()
    expect(ops.error).toBeNull()
    opsMemberId = ops.data!.id

    const affiliateProgram = await svc
      .from('affiliate_network_programs')
      .upsert(
        {
          network: 'travelpayouts',
          external_program_id: 'tp-rls-program',
          program_name: 'Travelpayouts RLS Program',
          status: 'active',
        },
        { onConflict: 'network,external_program_id' },
      )
      .select('id')
      .single()
    expect(affiliateProgram.error).toBeNull()
    affiliateProgramId = affiliateProgram.data!.id

    const mission = await svc
      .from('missions')
      .insert({
        merchant_profile_id: merchantProfileId,
        title: 'RLS coupon mission',
        summary: 'Creator can see this after publish',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        visibility: 'open',
        status: 'published',
        coupon_code: 'RLS10',
        coupon_url: 'https://example.com/rls',
        affiliate_commission_rate: 10,
        kinnso_commission_rate: 4,
        creator_commission_rate: 6,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(mission.error).toBeNull()
    missionId = mission.data!.id

    const targetedMission = await svc
      .from('missions')
      .insert({
        merchant_profile_id: merchantProfileId,
        title: 'Targeted paid mission',
        summary: 'Only invited creators should see this',
        mission_source: 'merchant',
        mission_type: 'paid',
        visibility: 'targeted',
        status: 'published',
        paid_fee_amount: 500,
        paid_fee_currency: 'HKD',
        application_instructions: 'Invite only',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(targetedMission.error).toBeNull()
    targetedMissionId = targetedMission.data!.id
  })

  afterAll(async () => {
    for (const id of [creatorId, otherCreatorId, snapshotCreatorId, merchantUserId, opsUserId]) {
      if (id) await svc.auth.admin.deleteUser(id)
    }
  })

  it('anon cannot read mission tables', async () => {
    for (const tableName of missionTableNames) {
      const { data, error } = await anon.from(tableName).select('id').limit(1)
      expect(error === null ? (data ?? []).length === 0 : /permission denied|42501/i.test(error.message)).toBe(
        true,
      )
    }
  })

  it('merchant can read and update own mission', async () => {
    const merchant = await authed(merchantEmail)
    const { data, error } = await merchant.from('missions').select('id, title').eq('id', missionId).single()
    expect(error).toBeNull()
    expect(data!.title).toBe('RLS coupon mission')

    const update = await merchant.from('missions').update({ title: 'RLS coupon mission updated' }).eq('id', missionId)
    expect(update.error).toBeNull()
  })

  it('creator can see published open missions and join once', async () => {
    const creator = await authed(creatorEmail)
    const visible = await creator.from('missions').select('id').eq('id', missionId).single()
    expect(visible.error).toBeNull()

    const joined = await creator
      .from('mission_participants')
      .insert({ mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join' })
      .select('id, status')
      .single()
    expect(joined.error).toBeNull()
    expect(joined.data!.status).toBe('active')

    const duplicate = await creator
      .from('mission_participants')
      .insert({ mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join' })
    expect(duplicate.error).not.toBeNull()

    const selfApproved = await creator
      .from('mission_participants')
      .update({ status: 'completed', merchant_review_note: 'self-approved' })
      .eq('id', joined.data!.id)
      .select('id')
    expect(selfApproved.error === null ? selfApproved.data : []).toEqual([])

    const unchanged = await svc
      .from('mission_participants')
      .select('status, merchant_review_note')
      .eq('id', joined.data!.id)
      .single()
    expect(unchanged.error).toBeNull()
    expect(unchanged.data!.status).toBe('active')
    expect(unchanged.data!.merchant_review_note).toBeNull()
  })

  it('targeted published missions are visible only to invited creators', async () => {
    const creator = await authed(creatorEmail)
    const hiddenBeforeInvite = await creator.from('missions').select('id').eq('id', targetedMissionId)
    expect(hiddenBeforeInvite.error).toBeNull()
    expect(hiddenBeforeInvite.data).toEqual([])

    const merchant = await authed(merchantEmail)
    const invite = await merchant
      .from('mission_participants')
      .insert({
        mission_id: targetedMissionId,
        creator_id: creatorId,
        status: 'invited',
        source: 'merchant_invite',
      })
      .select('id, status')
      .single()
    expect(invite.error).toBeNull()
    expect(invite.data!.status).toBe('invited')

    const visibleAfterInvite = await creator.from('missions').select('id').eq('id', targetedMissionId).single()
    expect(visibleAfterInvite.error).toBeNull()
    expect(visibleAfterInvite.data!.id).toBe(targetedMissionId)

    const otherCreator = await authed(otherCreatorEmail)
    const hiddenFromOtherCreator = await otherCreator.from('missions').select('id').eq('id', targetedMissionId)
    expect(hiddenFromOtherCreator.error).toBeNull()
    expect(hiddenFromOtherCreator.data).toEqual([])
  })

  it('creator can read active affiliate network programs', async () => {
    const creator = await authed(creatorEmail)
    const { data, error } = await creator
      .from('affiliate_network_programs')
      .select('id, program_name')
      .eq('id', affiliateProgramId)
      .single()

    expect(error).toBeNull()
    expect(data!.program_name).toBe('Travelpayouts RLS Program')
  })

  it('social snapshots are visible to the creator, owning merchant, and ops only', async () => {
    const participant = await svc
      .from('mission_participants')
      .upsert(
        {
          mission_id: missionId,
          creator_id: snapshotCreatorId,
          status: 'active',
          source: 'open_join',
        },
        { onConflict: 'mission_id,creator_id' },
      )
      .select('id')
      .single()
    expect(participant.error).toBeNull()

    const snapshot = await svc
      .from('mission_social_snapshots')
      .insert({
        mission_id: missionId,
        mission_participant_id: participant.data!.id,
        platform: 'instagram',
        handle: 'snapshot_creator',
        follower_count: 1234,
        confidence_status: 'verified_signal',
      })
      .select('id')
      .single()
    expect(snapshot.error).toBeNull()

    const snapshotCreator = await authed(snapshotCreatorEmail)
    const creatorVisible = await snapshotCreator
      .from('mission_social_snapshots')
      .select('id, follower_count')
      .eq('id', snapshot.data!.id)
      .single()
    expect(creatorVisible.error).toBeNull()
    expect(creatorVisible.data!.follower_count).toBe(1234)

    const merchant = await authed(merchantEmail)
    const merchantVisible = await merchant
      .from('mission_social_snapshots')
      .select('id')
      .eq('id', snapshot.data!.id)
      .single()
    expect(merchantVisible.error).toBeNull()

    const opsClient = await authed(opsEmail)
    const opsVisible = await opsClient
      .from('mission_social_snapshots')
      .select('id')
      .eq('id', snapshot.data!.id)
      .single()
    expect(opsVisible.error).toBeNull()

    const otherCreator = await authed(otherCreatorEmail)
    const hiddenFromOtherCreator = await otherCreator
      .from('mission_social_snapshots')
      .select('id')
      .eq('id', snapshot.data!.id)
    expect(hiddenFromOtherCreator.error).toBeNull()
    expect(hiddenFromOtherCreator.data).toEqual([])
  })

  it('non-ops cannot update settlement while ops can', async () => {
    const settlement = await svc
      .from('mission_settlements')
      .insert({ mission_id: missionId, status: 'pending' })
      .select('id')
      .single()
    expect(settlement.error).toBeNull()

    const merchant = await authed(merchantEmail)
    const denied = await merchant
      .from('mission_settlements')
      .update({ status: 'paid' })
      .eq('id', settlement.data!.id)
      .select('id')
    expect(denied.error === null ? denied.data : []).toEqual([])

    const unchanged = await svc
      .from('mission_settlements')
      .select('status')
      .eq('id', settlement.data!.id)
      .single()
    expect(unchanged.error).toBeNull()
    expect(unchanged.data!.status).toBe('pending')

    const opsClient = await authed(opsEmail)
    const allowed = await opsClient
      .from('mission_settlements')
      .update({ status: 'paid', updated_by_ops_member_id: opsMemberId })
      .eq('id', settlement.data!.id)
    expect(allowed.error).toBeNull()
  })
})
