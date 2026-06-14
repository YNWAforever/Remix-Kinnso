import { describe, it, expect } from 'vitest'
import { rateLimitDecision, canRetry, type JobRecord } from '../src/policy'

const BASE_JOB: JobRecord = {
  id: 'job-1',
  creator_id: 'creator-1',
  status: 'ready',
  created_at: new Date(Date.now() - 60_000).toISOString(), // 1 minute ago
}

describe('rateLimitDecision', () => {
  it('returns not limited for an empty job list', () => {
    expect(rateLimitDecision([])).toEqual({ limited: false })
  })

  it('blocks when an active (queued) job exists', () => {
    const jobs: JobRecord[] = [{ ...BASE_JOB, status: 'queued' }]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'active_job_exists' })
  })

  it('blocks when a fetching job exists', () => {
    const jobs: JobRecord[] = [{ ...BASE_JOB, status: 'fetching' }]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'active_job_exists' })
  })

  it('blocks when an analyzing job exists', () => {
    const jobs: JobRecord[] = [{ ...BASE_JOB, status: 'analyzing' }]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'active_job_exists' })
  })

  it('does not block for exactly 2 recent completed jobs', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const jobs: JobRecord[] = [
      { ...BASE_JOB, id: 'j1', status: 'ready', created_at: recent },
      { ...BASE_JOB, id: 'j2', status: 'failed', created_at: recent },
    ]
    expect(rateLimitDecision(jobs)).toEqual({ limited: false })
  })

  it('blocks when 3 completed jobs exist in trailing 24h', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const jobs: JobRecord[] = [
      { ...BASE_JOB, id: 'j1', status: 'ready', created_at: recent },
      { ...BASE_JOB, id: 'j2', status: 'failed', created_at: recent },
      { ...BASE_JOB, id: 'j3', status: 'ready', created_at: recent },
    ]
    expect(rateLimitDecision(jobs)).toMatchObject({ limited: true, reason: 'daily_quota_exceeded' })
  })

  it('does not count jobs older than 24h toward quota', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const recent = new Date(Date.now() - 60_000).toISOString()
    const jobs: JobRecord[] = [
      { ...BASE_JOB, id: 'j1', status: 'ready', created_at: old },
      { ...BASE_JOB, id: 'j2', status: 'ready', created_at: old },
      { ...BASE_JOB, id: 'j3', status: 'ready', created_at: recent }, // only 1 recent
    ]
    expect(rateLimitDecision(jobs)).toEqual({ limited: false })
  })
})

describe('canRetry', () => {
  it('returns 404 for missing job', () => {
    expect(canRetry(null, 'any-user')).toEqual({ allowed: false, httpStatus: 404 })
  })

  it('returns 404 when creator_id does not match', () => {
    expect(canRetry({ ...BASE_JOB, status: 'failed' }, 'other-user')).toEqual({
      allowed: false,
      httpStatus: 404,
    })
  })

  it('returns 409 when job is not failed (status=ready)', () => {
    expect(canRetry({ ...BASE_JOB, status: 'ready' }, 'creator-1')).toEqual({
      allowed: false,
      httpStatus: 409,
    })
  })

  it('returns 409 when job is still running (status=fetching)', () => {
    expect(canRetry({ ...BASE_JOB, status: 'fetching' }, 'creator-1')).toEqual({
      allowed: false,
      httpStatus: 409,
    })
  })

  it('allows retry for own failed job', () => {
    expect(canRetry({ ...BASE_JOB, status: 'failed' }, 'creator-1')).toEqual({
      allowed: true,
      httpStatus: 200,
    })
  })
})
