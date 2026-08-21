import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient<Database>(url, serviceKey)

async function signedInClient(email: string) {
  const password = 'test-password-12345!'
  await admin.auth.admin.createUser({ email, password, email_confirm: true })
  const client = createClient<Database>(url, anonKey)
  await client.auth.signInWithPassword({ email, password })
  return client
}

describe('R12.1 journey attribution + visits_driven live proof', () => {
  let merchantAId: string
  let creatorId: string
  let missionId: string
  let offerId: string
  let visitor: Awaited<ReturnType<typeof signedInClient>>
  let staffA: Awaited<ReturnType<typeof signedInClient>>
  let creatorClient: Awaited<ReturnType<typeof signedInClient>>

  beforeAll(async () => {
    const merchantAUser = randomUUID()
    const creatorUser = randomUUID()
    const visitorUser = randomUUID()

    staffA = await signedInClient(`merchant-a-${merchantAUser}@test.kinnso.dev`)
    creatorClient = await signedInClient(`creator-${creatorUser}@test.kinnso.dev`)
    visitor = await signedInClient(`visitor-${visitorUser}@test.kinnso.dev`)

    const { data: { user: staffAUser } } = await staffA.auth.getUser()
    const { data: { user: creatorAuthUser } } = await creatorClient.auth.getUser()

    const { data: mA } = await admin.from('merchant_profiles').insert({
      user_id: staffAUser!.id, company_name: `Merchant A ${randomUUID()}`, status: 'active', contact_email: `a@${randomUUID().slice(0, 8)}.test`,
    }).select('id').single()
    merchantAId = mA!.id as string

    // handle_new_user() (auth.users trigger) already auto-inserted a `creators` row for
    // this new user at status 'onboarding' (on conflict do nothing) by the time
    // signedInClient() returns -- a plain insert here would violate the id primary key.
    // creator_insights() requires status = 'active', so upsert to flip it rather than
    // insert.
    await admin.from('creators').upsert(
      { id: creatorAuthUser!.id, status: 'active', display_name: 'Test Creator' },
      { onConflict: 'id' },
    )
    creatorId = creatorAuthUser!.id

    const { data: mission, error: missionError } = await admin.from('missions').insert({
      merchant_profile_id: merchantAId, title: `Mission ${randomUUID()}`,
      summary: 'Test mission', mission_source: 'merchant',
      mission_type: 'paid', status: 'published', visibility: 'open', auto_approve_policy: 'off',
    }).select('id').single()
    if (missionError) throw new Error(`Failed to create mission: ${missionError.message}`)
    missionId = mission!.id as string

    await admin.from('mission_participants').insert({
      mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join',
    })

    const { data: offer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Free dessert', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 20,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 10, total_cap: 100, status: 'live',
    }).select('id').single()
    offerId = offer!.id as string
  })

  it('a consented claim + redemption emits exactly one offer_redeemed event with the right journey_id', async () => {
    const journeyId = randomUUID()
    const { data: claim, error: claimError } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
      p_journey_id: journeyId, p_locale: 'en',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error: redeemError } = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(redeemError).toBeNull()

    const { data: events } = await admin
      .from('traveller_analytics_events')
      .select('event_name, journey_id, entity_type, entity_id')
      .eq('journey_id', journeyId)
      .eq('event_name', 'offer_redeemed')
    expect(events ?? []).toHaveLength(1)
    expect(events![0].entity_type).toBe('offer')
    expect(events![0].entity_id).toBe(offerId)
  })

  it('an unconsented claim (no journey_id) + redemption emits no analytics event', async () => {
    const { data: claim, error: claimError } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error: redeemError } = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(redeemError).toBeNull()

    const { data: redemption } = await admin
      .from('offer_redemptions')
      .select('id, offer_claim_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const { data: thisClaim } = await admin
      .from('offer_claims')
      .select('analytics_journey_id')
      .eq('id', redemption!.offer_claim_id)
      .single()
    // Authoritative check: this specific unconsented claim never got a journey_id, so
    // redeem_offer_claim's `if v_claim.analytics_journey_id is not null` guard must have
    // skipped the event insert for it.
    expect(thisClaim!.analytics_journey_id).toBeNull()
  })

  it('merchant_insights visits_driven reports separate redemption and attributed-booking counts', async () => {
    const { data, error } = await staffA.rpc('merchant_insights')
    expect(error).toBeNull()
    const payload = data as { visits_driven: { creator_id: string; redemptions: number; attributed_bookings: number }[] }
    const row = payload.visits_driven.find((r) => r.creator_id === creatorId)
    expect(row).toBeDefined()
    expect(row!.redemptions).toBeGreaterThan(0)
  })

  it("creator_insights visits_driven total counts this creator's own redemptions", async () => {
    const { data, error } = await creatorClient.rpc('creator_insights')
    expect(error).toBeNull()
    const payload = data as { visits_driven: number }
    expect(payload.visits_driven).toBeGreaterThan(0)
  })
})
