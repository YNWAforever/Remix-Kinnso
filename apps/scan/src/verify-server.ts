import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { PostFetcher } from './fetchers'
import { parseProofUrl } from './proof-url'
import { verifySubmission } from './verify'

export interface VerifyServerDeps {
  db: SupabaseClient<Database>
  fetcher: PostFetcher
  userId: string
}

export type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

export async function handleVerifySubmission(
  deps: VerifyServerDeps,
  input: { submissionId: string },
): Promise<HandlerResult> {
  const { db, fetcher, userId } = deps
  const { submissionId } = input

  const { data: submission, error: subErr } = await db
    .from('mission_milestone_submissions')
    .select('id, proof_urls, mission_participant_id, mission_participants!inner(creator_id)')
    .eq('id', submissionId)
    .maybeSingle()

  if (subErr) return { status: 500, body: { error: 'internal error' } }

  const ownerId = (submission as { mission_participants?: { creator_id?: string } } | null)
    ?.mission_participants?.creator_id
  if (!submission || ownerId !== userId) {
    return { status: 404, body: { error: 'submission not found' } }
  }

  const proofUrl = (submission as { proof_urls?: string[] }).proof_urls?.[0] ?? null
  const parsed = proofUrl ? parseProofUrl(proofUrl) : null

  const { data: job, error: insertErr } = await db
    .from('mission_verification_jobs')
    .insert({
      mission_milestone_submission_id: submissionId,
      creator_id: userId,
      platform: parsed?.platform ?? null,
      proof_url: proofUrl,
      status: 'queued',
    } as never)
    .select('id')
    .single()

  if (insertErr || !job) {
    if (insertErr?.code === '23505') {
      return { status: 429, body: { error: 'verification already in progress' } }
    }
    console.error('[scan] failed to insert verification job', insertErr?.message)
    return { status: 500, body: { error: 'internal error' } }
  }

  const jobId = job.id
  // Fire-and-forget
  verifySubmission({ db, fetcher }, jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled verification error for job ${jobId}`, err)
  })

  return { status: 202, body: { jobId } }
}

export async function handleVerifyRetry(
  deps: VerifyServerDeps,
  input: { jobId: string },
): Promise<HandlerResult> {
  const { db, fetcher, userId } = deps
  const { jobId } = input

  const { data: job, error: jobErr } = await db
    .from('mission_verification_jobs')
    .select('id, creator_id, status')
    .eq('id', jobId)
    .maybeSingle()

  if (jobErr) return { status: 500, body: { error: 'internal error' } }
  if (!job || job.creator_id !== userId) {
    return { status: 404, body: { error: 'job not found' } }
  }
  if (job.status !== 'failed') {
    return { status: 409, body: { error: 'job is not in failed status' } }
  }

  const { error: resetErr } = await db
    .from('mission_verification_jobs')
    .update({ status: 'queued', error: null, completed_at: null, updated_at: new Date().toISOString() } as never)
    .eq('id', jobId)

  if (resetErr) {
    if (resetErr.code === '23505') {
      return { status: 429, body: { error: 'verification already in progress' } }
    }
    return { status: 500, body: { error: 'internal error' } }
  }

  verifySubmission({ db, fetcher }, jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled verification retry error for job ${jobId}`, err)
  })

  return { status: 202, body: { jobId, retrying: true } }
}
