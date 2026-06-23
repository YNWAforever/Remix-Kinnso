import { describe, expect, it } from 'vitest'
import { verifySubmission, type VerifyDeps } from '../src/verify'
import { FakeFetcher } from '../src/fetchers'

const JOB_ID = 'job-1'
const SUB_ID = 'sub-1'
const PARTICIPANT_ID = 'p-1'
const MISSION_ID = 'm-1'
const CREATOR_ID = 'creator-1'

function makeDb(jobOverrides: Record<string, unknown> = {}, handle = 'traveler') {
  const job = {
    id: JOB_ID, mission_milestone_submission_id: SUB_ID, creator_id: CREATOR_ID,
    platform: 'instagram', proof_url: 'https://www.instagram.com/p/Cabc/', status: 'queued',
    ...jobOverrides,
  }
  const updates: Array<{ table: string; data: Record<string, unknown> }> = []
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = []

  const rows: Record<string, unknown> = {
    mission_verification_jobs: job,
    mission_milestone_submissions: { id: SUB_ID, mission_participant_id: PARTICIPANT_ID },
    mission_participants: { id: PARTICIPANT_ID, mission_id: MISSION_ID, creator_id: CREATOR_ID },
    creator_social_handles: { creator_id: CREATOR_ID, platform: 'instagram', handle },
  }

  const db = {
    _updates: updates,
    _inserts: inserts,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }),
          single: async () => ({ data: rows[table], error: null }),
          maybeSingle: async () => ({ data: rows[table], error: null }),
        }),
      }),
      update: (data: Record<string, unknown>) => ({
        eq: async () => { updates.push({ table, data }); Object.assign(job as Record<string, unknown>, data); return { data: null, error: null } },
      }),
      insert: async (data: Record<string, unknown>) => { inserts.push({ table, data }); return { data: null, error: null } },
    }),
  }
  return db as never
}

const deps = (db: unknown, fetcher = new FakeFetcher()): VerifyDeps => ({ db: db as never, fetcher })

describe('verifySubmission', () => {
  it('transitions fetching → ready and writes a verified_signal snapshot when the handle matches', async () => {
    const db = makeDb({}, 'fake_ig_user') // FakeFetcher returns authorHandle 'fake_ig_user'
    await verifySubmission(deps(db), JOB_ID)
    const statuses = (db as never as { _updates: Array<{ data: { status?: string } }> })._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses).toEqual(['fetching', 'ready'])
    const snapshot = (db as never as { _inserts: Array<{ table: string; data: Record<string, unknown> }> })._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('verified_signal')
    expect(snapshot.data.mission_milestone_submission_id).toBe(SUB_ID)
    expect(snapshot.data.mission_id).toBe(MISSION_ID)
  })

  it('writes needs_review when the handle does not match', async () => {
    const db = makeDb({}, 'someone_else')
    await verifySubmission(deps(db), JOB_ID)
    const snapshot = (db as never as { _inserts: Array<{ table: string; data: Record<string, unknown> }> })._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('needs_review')
  })

  it('writes unavailable when the post fetch fails', async () => {
    const db = makeDb()
    await verifySubmission(deps(db, new FakeFetcher({}, ['instagram'])), JOB_ID)
    const snapshot = (db as never as { _inserts: Array<{ table: string; data: Record<string, unknown> }> })._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('unavailable')
    // still reaches ready — unavailable is a successful (manual-review) outcome
    const statuses = (db as never as { _updates: Array<{ data: { status?: string } }> })._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses[statuses.length - 1]).toBe('ready')
  })
})
