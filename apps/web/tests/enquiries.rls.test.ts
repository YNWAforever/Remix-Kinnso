import { createHash, createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { resolveR73LocalLiveConfig } from './helpers/r7-3-local-live-config'

const liveConfig = resolveR73LocalLiveConfig(process.env)
const d = liveConfig ? describe : describe.skip
const hookTimeout = 60_000
const testTimeout = 15_000

// The value is deliberately a test-only dummy. It is provisioned only through
// the loopback-only test setup below and is never an application credential.
const localTestAttestationSecret = 'r7-7-local-live-test-only-not-a-production-secret'
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = 'Test1234!r77'
const creatorEmail = `r7-7-enquiry-creator-${runId}@example.test`
const merchantEmail = `r7-7-enquiry-merchant-${runId}@example.test`
const viewerEmail = `r7-7-enquiry-viewer-${runId}@example.test`
const opsEmail = `r7-7-enquiry-ops-${runId}@example.test`

const svc = liveConfig ? createClient(liveConfig.url, liveConfig.serviceRoleKey) : null
const trackedIps = ['203.0.113.10', '203.0.113.11', '203.0.113.12', '203.0.113.13', '203.0.113.14']

let creatorId = ''
let merchantUserId = ''
let merchantProfileId = ''
let viewerId = ''
let opsUserId = ''
let opsMemberId = ''
const enquiryIds: string[] = []

function ipHash(ip: string) {
  return createHash('sha256').update(ip).digest('hex')
}

function makeAttestation(ip: string) {
  const expiry = Math.floor(Date.now() / 1000) + 120
  const signature = createHmac('sha256', localTestAttestationSecret)
    .update(`${ip}\n${expiry}`)
    .digest('hex')
  return `v1.${expiry}.${signature}`
}

function attestedAnon(ip: string, attestation = makeAttestation(ip)) {
  if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
  return createClient(liveConfig.url, liveConfig.anonKey, {
    global: { headers: { 'x-kinnso-enquiry-attestation': attestation } },
  })
}

function creatorArgs(ip: string) {
  return {
    p_type: 'creator_collab',
    p_creator_id: creatorId,
    p_merchant_profile_id: null,
    p_name: 'R7.7 Visitor',
    p_email: `visitor-${runId}@example.test`,
    p_message: 'I would like to discuss a creator collaboration opportunity.',
    p_ip: ip,
    // These caller values must not weaken the fixed 5/3600 policy.
    p_max_requests: 100,
    p_window_seconds: 60,
  }
}

function merchantArgs(ip: string) {
  return {
    p_type: 'merchant_contact',
    p_creator_id: null,
    p_merchant_profile_id: merchantProfileId,
    p_name: 'R7.7 Visitor',
    p_email: `visitor-${runId}@example.test`,
    p_message: 'I would like to discuss a merchant partnership opportunity.',
    p_ip: ip,
    p_max_requests: 100,
    p_window_seconds: 60,
  }
}

async function authedClient(email: string) {
  if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
  const anon = createClient(liveConfig.url, liveConfig.anonKey)
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull()
  return createClient(liveConfig.url, liveConfig.anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

async function runPsql(sql: string) {
  if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', [
      'exec',
      '-i',
      liveConfig.dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ])
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `psql exited with code ${code}`))
    })
    child.stdin.end(sql)
  })
}

d('R7.7 enquiry live security boundary (explicit local Postgres only)', () => {
  const localSvc = svc!

  beforeAll(async () => {
    await runPsql(`
      delete from vault.secrets where name = 'r7_7_enquiry_submission_hmac';
      select vault.create_secret(
        '${localTestAttestationSecret}',
        'r7_7_enquiry_submission_hmac',
        'R7.7 local live security test dummy secret',
        null::uuid
      );
    `)

    const creator = await localSvc.auth.admin.createUser({ email: creatorEmail, password, email_confirm: true })
    expect(creator.error, `create creator failed: ${creator.error?.message}`).toBeNull()
    creatorId = creator.data.user!.id

    const merchant = await localSvc.auth.admin.createUser({ email: merchantEmail, password, email_confirm: true })
    expect(merchant.error, `create merchant failed: ${merchant.error?.message}`).toBeNull()
    merchantUserId = merchant.data.user!.id

    const viewer = await localSvc.auth.admin.createUser({ email: viewerEmail, password, email_confirm: true })
    expect(viewer.error, `create viewer failed: ${viewer.error?.message}`).toBeNull()
    viewerId = viewer.data.user!.id

    const ops = await localSvc.auth.admin.createUser({ email: opsEmail, password, email_confirm: true })
    expect(ops.error, `create ops failed: ${ops.error?.message}`).toBeNull()
    opsUserId = ops.data.user!.id

    const creatorProfile = await localSvc
      .from('creators')
      .update({
        display_name: 'R7.7 Eligible Creator',
        status: 'active',
        handle: `r77-creator-${runId}`,
        public_profile: { platforms: [] },
      })
      .eq('id', creatorId)
    expect(creatorProfile.error).toBeNull()

    const merchantProfile = await localSvc
      .from('merchant_profiles')
      .insert({
        user_id: merchantUserId,
        company_name: `R7.7 Eligible Merchant ${runId}`,
        contact_email: merchantEmail,
        status: 'active',
        slug: `r77-merchant-${runId}`,
      })
      .select('id')
      .single()
    expect(merchantProfile.error).toBeNull()
    merchantProfileId = merchantProfile.data!.id

    const opsMember = await localSvc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'R7.7 Enquiry Ops', status: 'active' })
      .select('id')
      .single()
    expect(opsMember.error).toBeNull()
    opsMemberId = opsMember.data!.id
  }, hookTimeout)

  afterAll(async () => {
    await runPsql("delete from vault.secrets where name = 'r7_7_enquiry_submission_hmac';")
    if (enquiryIds.length > 0) await localSvc.from('ops_audit_log').delete().eq('entity_type', 'enquiry').in('entity_id', enquiryIds)
    if (enquiryIds.length > 0) await localSvc.from('enquiries').delete().in('id', enquiryIds)
    await localSvc.from('enquiry_rate_limits').delete().in('ip_hash', trackedIps.map(ipHash))
    if (merchantProfileId) await localSvc.from('merchant_profiles').delete().eq('id', merchantProfileId)
    if (opsMemberId) await localSvc.from('kinnso_ops_members').delete().eq('id', opsMemberId)
    for (const userId of [creatorId, merchantUserId, viewerId, opsUserId]) {
      if (userId) await localSvc.auth.admin.deleteUser(userId)
    }
  }, hookTimeout)

  it('denies direct anonymous and authenticated inserts', async () => {
    if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
    const anon = createClient(liveConfig.url, liveConfig.anonKey)
    const authed = await authedClient(viewerEmail)
    const validCreatorRow = {
      type: 'creator_collab',
      creator_id: creatorId,
      merchant_profile_id: null,
      name: 'Direct Write Visitor',
      email: `direct-${runId}@example.test`,
      message: 'This direct insertion must be denied by the database boundary.',
    }

    expect((await anon.from('enquiries').insert(validCreatorRow)).error).not.toBeNull()
    expect((await authed.from('enquiries').insert(validCreatorRow)).error).not.toBeNull()
  }, testTimeout)

  it('rejects missing or invalid attestations before rate-bucket consumption', async () => {
    if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
    const ip = '203.0.113.13'
    const missing = createClient(liveConfig.url, liveConfig.anonKey)
    const missingResult = await missing.rpc('submit_enquiry', creatorArgs(ip))
    expect(missingResult.error?.message).toContain('invalid_enquiry_attestation')

    const invalidResult = await attestedAnon(ip, 'v1.9999999999.' + '0'.repeat(64)).rpc('submit_enquiry', creatorArgs(ip))
    expect(invalidResult.error?.message).toContain('invalid_enquiry_attestation')

    const bucket = await localSvc.from('enquiry_rate_limits').select('request_count').eq('ip_hash', ipHash(ip))
    expect(bucket.error).toBeNull()
    expect(bucket.data).toEqual([])
  }, testTimeout)

  it('submits both eligible target types through the attested public RPC', async () => {
    const creator = await attestedAnon('203.0.113.10').rpc('submit_enquiry', creatorArgs('203.0.113.10'))
    const merchant = await attestedAnon('203.0.113.11').rpc('submit_enquiry', merchantArgs('203.0.113.11'))
    expect(creator.error).toBeNull()
    expect(merchant.error).toBeNull()
    enquiryIds.push(creator.data!, merchant.data!)
  }, testTimeout)

  it('uses the fixed 5-per-hour policy despite caller-supplied 100-per-minute values', async () => {
    const ip = '203.0.113.12'
    for (let index = 0; index < 5; index += 1) {
      const result = await attestedAnon(ip).rpc('submit_enquiry', creatorArgs(ip))
      expect(result.error).toBeNull()
      enquiryIds.push(result.data!)
    }

    const sixth = await attestedAnon(ip).rpc('submit_enquiry', creatorArgs(ip))
    expect(sixth.error?.message).toContain('enquiry_rate_limited')
  }, testTimeout)

  it('keeps public queue access unavailable and exposes only the documented ops queue fields', async () => {
    if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
    const anon = createClient(liveConfig.url, liveConfig.anonKey)
    const publicList = await anon.rpc('admin_list_enquiries')
    expect(publicList.error).not.toBeNull()

    const viewer = await authedClient(viewerEmail)
    expect((await viewer.rpc('admin_list_enquiries')).error?.message).toContain('forbidden')

    const ops = await authedClient(opsEmail)
    const opsList = await ops.rpc('admin_list_enquiries', { p_status_group: 'active', p_limit: 100 })
    expect(opsList.error).toBeNull()
    const row = (opsList.data as Record<string, unknown>[]).find((item) => item.id === enquiryIds[0])
    expect(row).toBeTruthy()
    expect(Object.keys(row!).sort()).toEqual(
      ['created_at', 'email', 'id', 'message', 'name', 'status', 'target_id', 'target_name', 'target_slug', 'type', 'updated_at'].sort(),
    )
    expect(row).not.toHaveProperty('booking_id')
    expect(row).not.toHaveProperty('traveler_user_id')
    expect(row).not.toHaveProperty('guest_email')
    expect(row).not.toHaveProperty('payment_intent_id')
  }, testTimeout)

  it('requires active ops for transitions and writes a bounded audit row', async () => {
    const viewer = await authedClient(viewerEmail)
    expect(
      (await viewer.rpc('admin_set_enquiry_status', { p_id: enquiryIds[0], p_status: 'resolved', p_reason: 'No access' })).error?.message,
    ).toContain('forbidden')

    const ops = await authedClient(opsEmail)
    const transitioned = await ops.rpc('admin_set_enquiry_status', {
      p_id: enquiryIds[0],
      p_status: 'resolved',
      p_reason: 'Handled in local security test',
    })
    expect(transitioned.error).toBeNull()

    const audit = await localSvc
      .from('ops_audit_log')
      .select('entity_type, entity_id, action, metadata')
      .eq('entity_type', 'enquiry')
      .eq('entity_id', enquiryIds[0])
      .single()
    expect(audit.error).toBeNull()
    expect(audit.data).toMatchObject({
      entity_type: 'enquiry',
      entity_id: enquiryIds[0],
      action: 'status.resolved',
      metadata: { from: 'new', to: 'resolved' },
    })
  }, testTimeout)
})
