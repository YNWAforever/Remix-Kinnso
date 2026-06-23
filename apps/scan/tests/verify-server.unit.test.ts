import { describe, expect, it, vi } from 'vitest'
import { handleVerifySubmission, handleVerifyRetry, type VerifyServerDeps } from '../src/verify-server'
import { FakeFetcher } from '../src/fetchers'

// ---------------------------------------------------------------------------
// Stub DB factory
// ---------------------------------------------------------------------------

function makeServerDb(opts: {
  submissionOwnerId?: string
  jobInsertId?: string
  jobInsertError?: { code?: string; message: string }
  existingJob?: { id: string; creator_id: string; status: string } | null
  resetError?: { code?: string; message: string } | null
} = {}) {
  const updates: Array<{ table: string; data: Record<string, unknown> }> = []
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = []

  const submission = opts.submissionOwnerId
    ? { id: 'sub-1', proof_urls: ['https://www.instagram.com/p/Cabc/'], mission_participant_id: 'p-1', mission_participants: { creator_id: opts.submissionOwnerId } }
    : null

  const db = {
    _updates: updates,
    _inserts: inserts,
    from: (table: string) => {
      if (table === 'mission_milestone_submissions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: submission, error: null }),
            }),
          }),
        }
      }
      if (table === 'mission_verification_jobs') {
        return {
          insert: (data: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                inserts.push({ table, data })
                if (opts.jobInsertError) return { data: null, error: opts.jobInsertError }
                return { data: { id: opts.jobInsertId ?? 'job-1' }, error: null }
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.existingJob ?? null, error: null }),
            }),
          }),
          update: (data: Record<string, unknown>) => ({
            eq: async () => {
              updates.push({ table, data })
              return { data: null, error: opts.resetError ?? null }
            },
          }),
        }
      }
      return {}
    },
  }
  return db as never
}

function makeDeps(db: unknown, userId: string): VerifyServerDeps {
  return { db: db as never, fetcher: new FakeFetcher(), userId }
}

// ---------------------------------------------------------------------------
// handleVerifySubmission tests
// ---------------------------------------------------------------------------

describe('handleVerifySubmission', () => {
  it('404s when submission not found', async () => {
    const db = makeServerDb({ submissionOwnerId: undefined })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(404)
  })

  it('404s when submission belongs to another creator', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-2' })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(404)
  })

  it('returns 202 { jobId } for the owner', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-1', jobInsertId: 'job-1' })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
    expect(result.body).toMatchObject({ jobId: 'job-1' })
  })

  it('returns 429 on duplicate active job (23505)', async () => {
    const db = makeServerDb({ submissionOwnerId: 'user-1', jobInsertError: { code: '23505', message: 'unique violation' } })
    const result = await handleVerifySubmission(makeDeps(db, 'user-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(429)
  })
})

// ---------------------------------------------------------------------------
// handleVerifyRetry tests
// ---------------------------------------------------------------------------

describe('handleVerifyRetry', () => {
  it('404s when job not found', async () => {
    const db = makeServerDb({ existingJob: null })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(404)
  })

  it('404s when job belongs to another creator', async () => {
    const db = makeServerDb({ existingJob: { id: 'job-1', creator_id: 'user-2', status: 'failed' } })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(404)
  })

  it('409s when job is not in failed status', async () => {
    const db = makeServerDb({ existingJob: { id: 'job-1', creator_id: 'user-1', status: 'ready' } })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(409)
  })

  it('returns 202 { jobId, retrying: true } for owner with failed job', async () => {
    const db = makeServerDb({ existingJob: { id: 'job-1', creator_id: 'user-1', status: 'failed' } })
    const result = await handleVerifyRetry(makeDeps(db, 'user-1'), { jobId: 'job-1' })
    expect(result.status).toBe(202)
    expect(result.body).toMatchObject({ jobId: 'job-1', retrying: true })
  })
})
