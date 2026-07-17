import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'missing'
const d = svcKey && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000

const svc = createClient(url, svcKey ?? 'missing')
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = 'Test1234!r73'
const ownerEmail = `r7-3-listing-owner-${runId}@example.test`
const opsEmail = `r7-3-listing-ops-${runId}@example.test`

let ownerId = ''
let opsUserId = ''
let opsMemberId = ''
let guideId = ''

async function authedClient(email: string) {
  const anon = createClient(url, anonKey)
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull()
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

d('R7.3 creator listing boundary (live local Postgres)', () => {
  beforeAll(async () => {
    const ownerUser = await svc.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
    expect(ownerUser.error, `create owner failed: ${ownerUser.error?.message}`).toBeNull()
    ownerId = ownerUser.data.user!.id

    const opsUser = await svc.auth.admin.createUser({ email: opsEmail, password, email_confirm: true })
    expect(opsUser.error, `create ops failed: ${opsUser.error?.message}`).toBeNull()
    opsUserId = opsUser.data.user!.id

    const opsMember = await svc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'R7.3 Listing Ops', status: 'active' })
      .select('id')
      .single()
    expect(opsMember.error).toBeNull()
    opsMemberId = opsMember.data!.id

    const guide = await svc
      .from('guides')
      .insert({
        creator_id: ownerId,
        creator_handle: 'r73listingowner',
        creator_name: 'R7.3 Listing Owner',
        slug: `r7-3-listing-guide-${runId}`,
        title: 'R7.3 Listing Trigger Guide',
        summary: 'Live local verification for the preserved guide saves trigger.',
        cover_url: null,
        city: 'Hong Kong',
        status: 'draft',
        saves_count: 17,
      })
      .select('id')
      .single()
    expect(guide.error).toBeNull()
    guideId = guide.data!.id
  }, hookTimeout)

  afterAll(async () => {
    if (guideId) await svc.from('guides').delete().eq('id', guideId)
    if (ownerId) await svc.from('ops_audit_log').delete().eq('entity_id', ownerId)
    if (opsMemberId) await svc.from('kinnso_ops_members').delete().eq('id', opsMemberId)
    if (ownerId) await svc.auth.admin.deleteUser(ownerId)
    if (opsUserId) await svc.auth.admin.deleteUser(opsUserId)
  }, hookTimeout)

  it('denies owner listing overrides while preserving normal owner edits', async () => {
    const owner = await authedClient(ownerEmail)

    const denied = await owner.from('creators').update({ is_listed: true }).eq('id', ownerId)
    expect(denied.error).not.toBeNull()

    const normalUpdate = await owner.from('creators').update({ display_name: 'Owner Edit' }).eq('id', ownerId)
    expect(normalUpdate.error).toBeNull()

    const creator = await svc.from('creators').select('display_name, is_listed').eq('id', ownerId).single()
    expect(creator.error).toBeNull()
    expect(creator.data).toEqual(expect.objectContaining({ display_name: 'Owner Edit', is_listed: false }))
  }, testTimeout)

  it('allows an active ops user to set listing state and writes the audit event', async () => {
    const ops = await authedClient(opsEmail)
    const allowed = await ops.rpc('admin_set_creator_listed', {
      p_id: ownerId,
      p_is_listed: true,
      p_reason: 'Approved for launch cohort',
    })
    expect(allowed.error).toBeNull()

    const creator = await svc.from('creators').select('is_listed').eq('id', ownerId).single()
    expect(creator.data?.is_listed).toBe(true)

    const audit = await svc.from('ops_audit_log').select('action, reason, metadata').eq('entity_id', ownerId)
    expect(audit.error).toBeNull()
    expect(audit.data).toContainEqual(expect.objectContaining({ action: 'listing.set' }))

    const detail = await ops.rpc('admin_creator_detail', { p_creator_id: ownerId })
    expect(detail.error).toBeNull()
    expect((detail.data as { creator?: { is_listed?: boolean } } | null)?.creator?.is_listed).toBe(true)
  }, testTimeout)

  it('preserves guide_saves increment/decrement behavior from the current baseline', async () => {
    const owner = await authedClient(ownerEmail)
    const before = await svc.from('guides').select('saves_count').eq('id', guideId).single()
    expect(before.error).toBeNull()
    expect(before.data!.saves_count).toBe(17)

    const inserted = await owner
      .from('guide_saves')
      .insert({ guide_id: guideId, traveler_user_id: ownerId })
      .select('id')
      .single()
    expect(inserted.error).toBeNull()

    const afterInsert = await svc.from('guides').select('saves_count').eq('id', guideId).single()
    expect(afterInsert.data!.saves_count).toBe(18)

    const deleted = await owner.from('guide_saves').delete().eq('id', inserted.data!.id)
    expect(deleted.error).toBeNull()

    const afterDelete = await svc.from('guides').select('saves_count').eq('id', guideId).single()
    expect(afterDelete.data!.saves_count).toBe(17)
  }, testTimeout)
})
