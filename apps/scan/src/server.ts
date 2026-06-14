import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { loadConfig } from './config'
import { rateLimitDecision, canRetry, type JobRecord } from './policy'
import { runScan, type ScanDeps } from './pipeline'
import { CompositeFetcher, FakeFetcher } from './fetchers'
import { OpenRouterClient, FakeLlm } from './llm'

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const cfg = loadConfig()

// DB client — service_role, bypasses RLS for all writes
const db = createClient<Database>(cfg.supabaseUrl, cfg.serviceRoleKey, {
  auth: { persistSession: false },
})

// Auth client — anon key, used ONLY for auth.getUser(token) validation
const authClient = createClient(cfg.supabaseUrl, cfg.anonKey, {
  auth: { persistSession: false },
})

// Platform fetcher + LLM — real or fake depending on SCAN_FIXTURE_MODE
const fetcher = cfg.fixtureMode ? new FakeFetcher() : new CompositeFetcher(cfg.rapidApiKey, cfg.youtubeApiKey)
const llm = cfg.fixtureMode ? new FakeLlm() : new OpenRouterClient(cfg.openRouterApiKey, cfg.openRouterModel)

if (cfg.fixtureMode) {
  console.info('[scan] ⚠️  FIXTURE MODE enabled — using fake fetchers and LLM')
}

// Shared deps bag passed to runScan
function makeDeps(): ScanDeps {
  return { db, fetcher, llm, model: cfg.openRouterModel }
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getVerifiedUser(
  authHeader: string | undefined
): Promise<{ id: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono()

// GET /health
app.get('/health', (c) => c.json({ ok: true }))

// POST /scan — insert a new scan job and run pipeline in background
app.post('/scan', async (c) => {
  // 1. Authenticate
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const creatorId = user.id

  // 2. Load existing jobs for rate-limit check
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25h buffer
  const { data: existingJobs, error: jobsErr } = await db
    .from('creator_scan_jobs')
    .select('id, creator_id, status, created_at')
    .eq('creator_id', creatorId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (jobsErr) {
    console.error('[scan] failed to load existing jobs for rate-limit check', jobsErr.message)
    return c.json({ error: 'internal error' }, 500)
  }

  // Also include any non-terminal jobs older than 25h (active guard)
  const { data: activeJobs } = await db
    .from('creator_scan_jobs')
    .select('id, creator_id, status, created_at')
    .eq('creator_id', creatorId)
    .in('status', ['queued', 'fetching', 'analyzing'])

  const allJobs: JobRecord[] = [
    ...((existingJobs as JobRecord[]) ?? []),
    ...((activeJobs as JobRecord[]) ?? []).filter(
      (j) => !existingJobs?.some((e) => e.id === j.id)
    ),
  ]

  const limitCheck = rateLimitDecision(allJobs)
  if (limitCheck.limited) {
    return c.json({ error: 'rate limited', reason: limitCheck.reason }, 429)
  }

  // 3. Require at least one handle
  const { data: handles, error: handlesErr } = await db
    .from('creator_social_handles')
    .select('platform, handle')
    .eq('creator_id', creatorId)

  if (handlesErr) return c.json({ error: 'internal error' }, 500)
  if (!handles || handles.length === 0) {
    return c.json({ error: 'no social handles found for this creator' }, 400)
  }

  // 4. Insert job
  const platforms = Object.fromEntries(handles.map((h) => [h.platform, 'pending']))
  const { data: job, error: insertErr } = await db
    .from('creator_scan_jobs')
    .insert({
      creator_id: creatorId,
      status: 'queued',
      progress: { platforms } as never,
    })
    .select('id')
    .single()

  if (insertErr || !job) {
    console.error('[scan] failed to insert job', insertErr?.message)
    return c.json({ error: 'internal error' }, 500)
  }

  const jobId = job.id

  // 5. Return 202 immediately, then run pipeline in background (fire-and-forget)
  const response = c.json({ jobId }, 202)
  runScan(makeDeps(), jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled pipeline error for job ${jobId}`, err)
  })
  return response
})

// POST /scan/:jobId/retry — retry a failed scan job
app.post('/scan/:jobId/retry', async (c) => {
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const jobId = c.req.param('jobId')

  const { data: job, error: jobErr } = await db
    .from('creator_scan_jobs')
    .select('id, creator_id, status, created_at')
    .eq('id', jobId)
    .single()

  if (jobErr) return c.json({ error: 'internal error' }, 500)

  const check = canRetry(
    job
      ? {
          id: job.id,
          creator_id: job.creator_id,
          status: job.status as JobRecord['status'],
          created_at: job.created_at,
        }
      : null,
    user.id
  )

  if (!check.allowed) {
    const status = check.httpStatus
    // canRetry never returns 401 — owner mismatch maps to 404 (job not found),
    // which both avoids leaking existence and stops the web client from wrongly
    // prompting re-login. Genuine bad/missing tokens are already handled above
    // by the getVerifiedUser → 401 guard.
    const messages: Record<number, string> = {
      404: 'job not found',
      409: 'job is not in failed status',
    }
    return c.json({ error: messages[status] }, status as never)
  }

  // Reset to queued and re-run
  await db
    .from('creator_scan_jobs')
    .update({ status: 'queued', error: null as never, completed_at: null as never, updated_at: new Date().toISOString() })
    .eq('id', jobId)

  runScan(makeDeps(), jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled pipeline error on retry for job ${jobId}`, err)
  })

  return c.json({ jobId, retrying: true }, 202)
})

// Fail closed
app.onError((err, c) => {
  console.error('[scan-app] unhandled error', err)
  return c.json({ error: 'internal error' }, 500)
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

serve({ fetch: app.fetch, port: cfg.port })
console.info(`[scan-app] listening on port ${cfg.port}`)
