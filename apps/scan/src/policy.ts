/** A minimal view of a creator_scan_jobs row needed for policy decisions. */
export interface JobRecord {
  id: string
  creator_id: string
  status: 'queued' | 'fetching' | 'analyzing' | 'ready' | 'failed'
  created_at: string
}

/** Terminal statuses — a job in one of these is no longer active. */
export const TERMINAL_STATUSES = new Set<JobRecord['status']>(['ready', 'failed'])

/**
 * Returns whether a new scan should be rate-limited.
 *
 * Rules (per spec §7):
 *   - Block if ANY job is non-terminal (queued|fetching|analyzing).
 *   - Block if ≥ 3 jobs were created in the trailing 24h.
 *
 * @param jobs - ALL jobs for this creator, ordered newest-first (at most the last 24h + any active).
 */
export function rateLimitDecision(jobs: JobRecord[]): { limited: boolean; reason?: string } {
  const hasActive = jobs.some((j) => !TERMINAL_STATUSES.has(j.status))
  if (hasActive) return { limited: true, reason: 'active_job_exists' }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const recentCount = jobs.filter((j) => j.created_at >= since).length
  if (recentCount >= 3) return { limited: true, reason: 'daily_quota_exceeded' }

  return { limited: false }
}

/**
 * Returns whether the verified user is allowed to retry a job.
 *
 * Rules:
 *   - The authenticated user must own the job.
 *   - The job must be in `failed` status (only failed jobs are retryable).
 */
export function canRetry(
  job: JobRecord | null | undefined,
  verifiedUserId: string
): { allowed: boolean; httpStatus: 404 | 409 | 200 } {
  if (!job) return { allowed: false, httpStatus: 404 }
  // Owner mismatch returns 404 (not 401): 401 is reserved for bad/missing tokens.
  // 404 avoids leaking job existence and prevents the web client from wrongly
  // prompting re-login when the user is authenticated but does not own the job.
  if (job.creator_id !== verifiedUserId) return { allowed: false, httpStatus: 404 }
  if (job.status !== 'failed') return { allowed: false, httpStatus: 409 }
  return { allowed: true, httpStatus: 200 }
}
