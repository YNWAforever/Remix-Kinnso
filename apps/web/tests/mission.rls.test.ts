import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'missing'
const d = svcKey && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? describe : describe.skip

const anon = createClient(url, anonKey)
const svc = createClient(url, svcKey ?? 'missing')

const creatorEmail = 'mission-creator@example.test'
const merchantEmail = 'mission-merchant@example.test'
const opsEmail = 'mission-ops@example.test'
const password = 'Test1234!'

let creatorId = ''
let merchantUserId = ''
let opsUserId = ''
let merchantProfileId = ''
let opsMemberId = ''
let missionId = ''
let affiliateProgramId = ''

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
  })

  afterAll(async () => {
    for (const id of [creatorId, merchantUserId, opsUserId]) {
      if (id) await svc.auth.admin.deleteUser(id)
    }
  })

  it('anon cannot read mission tables', async () => {
    const { data, error } = await anon.from('missions').select('id')
    expect(error === null ? (data ?? []).length === 0 : /permission denied|42501/i.test(error.message)).toBe(true)
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
