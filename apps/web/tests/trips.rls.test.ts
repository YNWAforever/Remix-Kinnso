import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { resolveR73LocalLiveConfig } from './helpers/r7-3-local-live-config'

/**
 * Phase 2 slice 0 -- personal trips, authored-only.
 * Migration: supabase/migrations/20260911090000_p2_0_personal_trips.sql
 * Reasoning:  docs/implementation/ADRs/0001-phase-2-trips-and-versions.md
 *
 * The Phase 2 exit gate asks for trip isolation "demonstrated using separate
 * accounts and direct API attempts". So this suite signs in two real accounts
 * and reaches PostgREST directly rather than going through a server action --
 * an application-layer guard proves nothing about what a determined caller can
 * reach. Until this existed, slice 0's isolation was asserted only by ad-hoc
 * SQL probes run by hand, which nothing re-runs.
 *
 * Gated on the same fail-closed local-live opt-in as the other live suites:
 * generic Supabase credentials never construct a client, and the resolver
 * requires a loopback URL, so this can never point at a hosted project.
 *
 * The clients are typed: the trip_* definitions were grafted into @kinnso/db
 * from a local `gen types --db-url` run, because the package's own `gen` script
 * reads production via --linked and production does not have these tables.
 * Typing this suite is what proves the graft is usable rather than merely
 * well-formed.
 */

const liveConfig = resolveR73LocalLiveConfig(process.env)
const d = liveConfig ? describe : describe.skip
const hookTimeout = 60000

const svc = liveConfig ? createClient<Database>(liveConfig.url, liveConfig.serviceRoleKey) : null
const anon = liveConfig ? createClient<Database>(liveConfig.url, liveConfig.anonKey) : null

const password = 'Test1234!p20'

async function signedInClient(email: string) {
  if (!liveConfig || !svc) throw new Error('local live-test config is not enabled')
  const { error: createError } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  expect(createError, `createUser failed for ${email}: ${createError?.message}`).toBeNull()
  const client = createClient<Database>(liveConfig.url, liveConfig.anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull()
  return client
}

d('Phase 2 personal trips: isolation, grants and time invariants (live)', () => {
  const runId = randomUUID()
  let travellerA: Awaited<ReturnType<typeof signedInClient>>
  let travellerB: Awaited<ReturnType<typeof signedInClient>>
  let userAId = ''
  let userBId = ''
  let tripAId = ''
  let dayAId = ''
  let stopAId = ''

  beforeAll(async () => {
    travellerA = await signedInClient(`p2-trip-a-${runId}@example.test`)
    travellerB = await signedInClient(`p2-trip-b-${runId}@example.test`)
    userAId = (await travellerA.auth.getUser()).data.user!.id
    userBId = (await travellerB.auth.getUser()).data.user!.id

    const trip = await travellerA
      .from('trips')
      .insert({ owner_user_id: userAId, title: 'Kyoto in spring', timezone: 'Asia/Tokyo' })
      .select('id')
      .single()
    expect(trip.error, `trip insert failed: ${trip.error?.message}`).toBeNull()
    tripAId = trip.data!.id

    const day = await travellerA
      .from('trip_days')
      .insert({ trip_id: tripAId, day_offset: 0, title: 'Arrival' })
      .select('id')
      .single()
    expect(day.error, `day insert failed: ${day.error?.message}`).toBeNull()
    dayAId = day.data!.id

    const stop = await travellerA
      .from('trip_stops')
      .insert({
        trip_id: tripAId,
        trip_day_id: dayAId,
        position: 0,
        title: 'Fushimi Inari at dawn',
        traveller_note: 'PRIVATE-NOTE-A',
        start_minute_of_day: 330,
        duration_minutes: 120,
      })
      .select('id')
      .single()
    expect(stop.error, `stop insert failed: ${stop.error?.message}`).toBeNull()
    stopAId = stop.data!.id
  }, hookTimeout)

  afterAll(async () => {
    // trips.owner_user_id is ON DELETE CASCADE to auth.users, so removing the
    // two accounts removes every row this suite created.
    if (!svc) return
    if (userAId) await svc.auth.admin.deleteUser(userAId)
    if (userBId) await svc.auth.admin.deleteUser(userBId)
  }, hookTimeout)

  // ---- cross-account isolation --------------------------------------------

  it('hides a trip, its stops and its private note from another traveller', async () => {
    const trip = await travellerB.from('trips').select('id').eq('id', tripAId)
    expect(trip.data).toEqual([])

    const stops = await travellerB.from('trip_stops').select('id, traveller_note').eq('trip_id', tripAId)
    expect(stops.data).toEqual([])
    expect(JSON.stringify(stops.data)).not.toContain('PRIVATE-NOTE-A')

    const days = await travellerB.from('trip_days').select('id').eq('trip_id', tripAId)
    expect(days.data).toEqual([])

    // The resolved view is security_invoker, so it is filtered by the caller's
    // own RLS rather than by the view owner's privileges.
    const resolved = await travellerB.from('trip_stops_resolved').select('id').eq('trip_id', tripAId)
    expect(resolved.data).toEqual([])
  })

  it('refuses an anonymous caller at the privilege layer, not merely with an empty set', async () => {
    // No anon GRANT and no anon POLICY on any trip_* relation: PostgREST fails
    // before RLS is ever consulted, which is why this is an error and not [].
    //
    // Written as closures rather than a loop over relation names: `from()` over
    // a union widens the query builder past any single overload, and casting
    // the client back to `any` to get a loop would discard the typing this
    // suite exists to exercise.
    const probes = [
      { name: 'trips', run: () => anon!.from('trips').select('id').limit(1) },
      { name: 'trip_days', run: () => anon!.from('trip_days').select('id').limit(1) },
      { name: 'trip_stops', run: () => anon!.from('trip_stops').select('id').limit(1) },
      { name: 'trip_revisions', run: () => anon!.from('trip_revisions').select('id').limit(1) },
      { name: 'trip_stops_resolved', run: () => anon!.from('trip_stops_resolved').select('id').limit(1) },
    ]
    for (const probe of probes) {
      const { data, error } = await probe.run()
      expect(data ?? [], `${probe.name} leaked rows to anon`).toEqual([])
      expect(error, `${probe.name} answered anon without an error`).not.toBeNull()
    }
  })

  it('cannot delete or overwrite a trip belonging to someone else', async () => {
    await travellerB.from('trips').delete().eq('id', tripAId)
    await travellerB.from('trips').update({ title: 'Hijacked' }).eq('id', tripAId)
    await travellerB.from('trip_stops').update({ traveller_note: 'Hijacked' }).eq('id', stopAId)

    const trip = await svc!.from('trips').select('title').eq('id', tripAId).single()
    expect(trip.data, 'trip was deleted by a non-owner').not.toBeNull()
    expect(trip.data!.title).toBe('Kyoto in spring')

    const stop = await svc!.from('trip_stops').select('traveller_note').eq('id', stopAId).single()
    expect(stop.data!.traveller_note).toBe('PRIVATE-NOTE-A')
  })

  it('cannot reassign ownership, even as the owner', async () => {
    // owner_user_id is absent from the column-level UPDATE grant, so a trip
    // cannot be pushed into someone else's account.
    const { error } = await travellerA.from('trips').update({ owner_user_id: userBId }).eq('id', tripAId)
    expect(error).not.toBeNull()

    const trip = await svc!.from('trips').select('owner_user_id').eq('id', tripAId).single()
    expect(trip.data!.owner_user_id).toBe(userAId)
  })

  it('cannot forge a revision number and defeat optimistic concurrency', async () => {
    const { error } = await travellerA.from('trips').update({ head_revision_no: 99 }).eq('id', tripAId)
    expect(error).not.toBeNull()

    const trip = await svc!.from('trips').select('head_revision_no').eq('id', tripAId).single()
    expect(trip.data!.head_revision_no).toBe(0)
  })

  // ---- saving is not cloning ----------------------------------------------

  it('rejects an authored stop that claims credit', async () => {
    const { error } = await travellerA.from('trip_stops').insert({
      trip_id: tripAId,
      trip_day_id: dayAId,
      position: 50,
      title: 'Fake credit',
      origin: 'authored',
      source_guide_id: randomUUID(),
      adopted_at: new Date().toISOString(),
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('trip_stops_origin_credit_consistent')
  })

  it('cannot promote an authored stop into a credited one', async () => {
    // Both payloads below are deliberately chosen to SATISFY
    // trip_stops_origin_credit_consistent, so the CHECK cannot be what refuses
    // them. Only the column-level UPDATE grant can -- which is the point: if
    // `origin` and the credit columns were ever added to that grant, these two
    // writes would succeed and this test would fail. An earlier version of this
    // test used an inconsistent payload, passed for the wrong reason, and did
    // not notice the grant being widened.

    // 1. A credit column the CHECK says nothing about, on an authored stop.
    const naming = await travellerA
      .from('trip_stops')
      .update({ source_creator_name: 'Someone Else' })
      .eq('id', stopAId)
    expect(naming.error, 'a traveller was able to name a creator on their own stop').not.toBeNull()

    // 2. A fully self-consistent adopted payload -- the real "fabricate credit"
    // attack, where a traveller claims their own stop came from a creator.
    const fabricated = await travellerA
      .from('trip_stops')
      .update({
        origin: 'adopted',
        source_guide_id: randomUUID(),
        source_creator_id: randomUUID(),
        source_creator_handle: 'someone-else',
        source_creator_name: 'Someone Else',
        adopted_at: new Date().toISOString(),
      })
      .eq('id', stopAId)
    expect(fabricated.error, 'a traveller was able to fabricate an adoption').not.toBeNull()

    const stop = await svc!
      .from('trip_stops')
      .select('origin, source_creator_name, source_creator_id, source_guide_id, adopted_at')
      .eq('id', stopAId)
      .single()
    expect(stop.data!.origin).toBe('authored')
    expect(stop.data!.source_creator_name).toBeNull()
    expect(stop.data!.source_creator_id).toBeNull()
    expect(stop.data!.source_guide_id).toBeNull()
    expect(stop.data!.adopted_at).toBeNull()
  })

  it('still lets a traveller edit their own note, time and order', async () => {
    const { error } = await travellerA
      .from('trip_stops')
      .update({ traveller_note: 'my own words', start_minute_of_day: 600, position: 1 })
      .eq('id', stopAId)
    expect(error, `owner edit was refused: ${error?.message}`).toBeNull()

    const stop = await svc!
      .from('trip_stops')
      .select('traveller_note, start_minute_of_day, position')
      .eq('id', stopAId)
      .single()
    expect(stop.data!.traveller_note).toBe('my own words')
    expect(stop.data!.start_minute_of_day).toBe(600)
    expect(stop.data!.position).toBe(1)
  })

  // ---- dates, time zones, DST ---------------------------------------------

  it('leaves an undated trip with no wall-clock time but a real day', async () => {
    const { data, error } = await travellerA
      .from('trip_stops_resolved')
      .select('starts_at, ends_at, day_offset')
      .eq('id', stopAId)
      .single()
    expect(error).toBeNull()
    expect(data!.starts_at).toBeNull()
    expect(data!.ends_at).toBeNull()
    expect(data!.day_offset).toBe(0)
  })

  it('re-resolves stops on a time-zone change without rewriting a single stop row', async () => {
    const before = await svc!.from('trip_stops').select('updated_at').eq('id', stopAId).single()

    const dated = await travellerA
      .from('trips')
      .update({ start_date: '2030-06-01', timezone: 'Europe/London' })
      .eq('id', tripAId)
    expect(dated.error, `dating the trip failed: ${dated.error?.message}`).toBeNull()
    const london = await travellerA.from('trip_stops_resolved').select('starts_at').eq('id', stopAId).single()

    await travellerA.from('trips').update({ timezone: 'America/New_York' }).eq('id', tripAId)
    const newYork = await travellerA.from('trip_stops_resolved').select('starts_at').eq('id', stopAId).single()

    const after = await svc!.from('trip_stops').select('updated_at, start_minute_of_day').eq('id', stopAId).single()

    // The wall-clock intent is untouched; only its resolution moves. This is
    // the whole reason stops store an offset and a minute rather than a date.
    expect(after.data!.updated_at).toBe(before.data!.updated_at)
    expect(after.data!.start_minute_of_day).toBe(600)
    expect(london.data!.starts_at).not.toBeNull()
    expect(london.data!.starts_at).not.toBe(newYork.data!.starts_at)
  })

  it('flags a wall-clock time that does not exist in the zone', async () => {
    // BST begins 01:00 on 2030-03-31 (the last Sunday of March), so 01:30 that
    // morning never happens. Surfacing it beats silently shifting the
    // traveller's stated intent by an hour.
    const day2 = await travellerA
      .from('trip_days')
      .insert({ trip_id: tripAId, day_offset: 1 })
      .select('id')
      .single()
    expect(day2.error, `day 2 insert failed: ${day2.error?.message}`).toBeNull()

    const gapStop = await travellerA
      .from('trip_stops')
      .insert({
        trip_id: tripAId,
        trip_day_id: day2.data!.id,
        position: 0,
        title: 'Spring forward',
        start_minute_of_day: 90,
      })
      .select('id')
      .single()
    expect(gapStop.error, `gap stop insert failed: ${gapStop.error?.message}`).toBeNull()

    await travellerA
      .from('trips')
      .update({ start_date: '2030-03-30', timezone: 'Europe/London' })
      .eq('id', tripAId)

    const gap = await travellerA
      .from('trip_stops_resolved')
      .select('dst_anomaly')
      .eq('id', gapStop.data!.id)
      .single()
    expect(gap.data!.dst_anomaly).toBe(true)

    // A stop at a time that does exist is not flagged, so the check is
    // detecting the gap rather than flagging everything.
    const normal = await travellerA
      .from('trip_stops_resolved')
      .select('dst_anomaly')
      .eq('id', stopAId)
      .single()
    expect(normal.data!.dst_anomaly).toBe(false)
  })

  it('rejects an invalid time zone at write time', async () => {
    const { error } = await travellerA.from('trips').update({ timezone: 'Mars/Olympus' }).eq('id', tripAId)
    expect(error).not.toBeNull()
    expect(error!.message).toContain('invalid_time_zone')

    const trip = await svc!.from('trips').select('timezone').eq('id', tripAId).single()
    expect(trip.data!.timezone).toBe('Europe/London')
  })

  // ---- revisions are an append-only log ------------------------------------

  it('cannot forge, edit or delete a revision', async () => {
    // trip_revisions carries SELECT only: rows are minted by the definer RPCs.
    const forged = await travellerA
      .from('trip_revisions')
      .insert({ trip_id: tripAId, revision_no: 1, change_kind: 'create' })
    expect(forged.error).not.toBeNull()

    const seeded = await svc!
      .from('trip_revisions')
      .insert({ trip_id: tripAId, revision_no: 1, change_kind: 'create' })
    expect(seeded.error, `seeding a revision failed: ${seeded.error?.message}`).toBeNull()

    // Even the service role cannot rewrite history: the guard is a trigger, not
    // a policy, so it holds for every role.
    const edited = await svc!.from('trip_revisions').update({ change_kind: 'edit' }).eq('trip_id', tripAId)
    expect(edited.error).not.toBeNull()
    expect(edited.error!.message).toContain('trip_revisions_append_only')

    const removed = await svc!.from('trip_revisions').delete().eq('trip_id', tripAId)
    expect(removed.error).not.toBeNull()
    expect(removed.error!.message).toContain('trip_revisions_append_only')
  })

  it('hides revision history from another traveller', async () => {
    const { data } = await travellerB.from('trip_revisions').select('id').eq('trip_id', tripAId)
    expect(data).toEqual([])
  })

  // ---- places: one validated way in ---------------------------------------

  it('admits a venue only through upsert_place, and rejects a bad zone there too', async () => {
    const direct = await travellerA.from('places').insert({ name: 'Rogue venue', timezone: 'Asia/Tokyo' })
    expect(direct.error, 'places accepted a direct insert').not.toBeNull()

    const good = await travellerA.rpc('upsert_place', {
      p_name: 'Fushimi Inari Taisha',
      p_timezone: 'Asia/Tokyo',
      p_country_code: 'JP',
    })
    expect(good.error, `upsert_place failed: ${good.error?.message}`).toBeNull()
    expect(good.data).toBeTruthy()

    const bad = await travellerA.rpc('upsert_place', { p_name: 'Nowhere', p_timezone: 'Mars/Olympus' })
    expect(bad.error).not.toBeNull()
    expect(bad.error!.message).toContain('invalid_time_zone')

    // The rejected venue left nothing behind for a trip to reference later.
    const leftovers = await svc!.from('places').select('id').eq('name', 'Nowhere')
    expect(leftovers.data).toEqual([])
  })
})
