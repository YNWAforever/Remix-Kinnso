import { Hono } from 'hono'
import { createHmac } from 'node:crypto'
import { safeEqual } from './safe-equal'

/**
 * The slice of `makeSync()` the HTTP layer actually uses. Declared structurally (rather
 * than as `ReturnType<typeof makeSync>`) so tests can pass a stub without a live MySQL
 * pool or Supabase client — `makeSync()` opens both in its constructor.
 */
export interface SyncService {
  syncOne(legacyPostId: number, opts?: { deleteIntent?: boolean }): Promise<Record<string, unknown>>
  backfill(): Promise<Record<string, unknown>>
}

export interface AppDeps {
  sync: SyncService
  /** HMAC key shared with the legacy webhook publisher. Empty ⇒ every webhook is rejected. */
  webhookSecret: string
  /** Admin bearer token for /sync/:id and /backfill. Empty ⇒ both endpoints are closed. */
  adminToken: string
  revalidate: (paths: string[]) => Promise<void>
}

export function createApp(deps: AppDeps) {
  const app = new Hono()

  function verifyHmac(raw: string, sig: string | undefined): boolean {
    if (!deps.webhookSecret || !sig) return false
    const expected = createHmac('sha256', deps.webhookSecret).update(raw).digest('hex')
    return safeEqual(expected, sig)
  }

  const isAdmin = (token: string | undefined): boolean => safeEqual(deps.adminToken, token ?? '')

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/webhook/foso', async (c) => {
    const raw = await c.req.text()
    if (!verifyHmac(raw, c.req.header('x-foso-signature'))) return c.json({ error: 'bad signature' }, 401)
    let body: { legacy_post_id?: unknown; event?: unknown }
    try {
      body = JSON.parse(raw)
    } catch {
      return c.json({ error: 'invalid json' }, 400)
    }
    const id = Number(body.legacy_post_id)
    if (!Number.isFinite(id)) return c.json({ error: 'invalid legacy_post_id' }, 400)
    // Every event — including `deleted` — re-reads MySQL and derives liveness from it.
    // The legacy listener is a ShouldQueue job with HTTP retries, so events replay and
    // arrive out of order; acting on the event's word alone would let a stale `deleted`
    // hide an article that is live again. `deleteIntent` only tells syncOne how to read
    // a MISSING row (hard delete ⇒ propagate the delete, rather than a silent no-op).
    const res = await deps.sync.syncOne(id, { deleteIntent: body.event === 'deleted' })
    await deps.revalidate(['/articles']).catch(() => {}) // Plan 3 supplies concrete paths
    return c.json(res)
  })

  app.post('/sync/:id', async (c) => {
    if (!isAdmin(c.req.header('x-admin-token'))) return c.json({ error: 'unauthorized' }, 401)
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    return c.json(await deps.sync.syncOne(id))
  })

  app.post('/backfill', async (c) => {
    if (!isAdmin(c.req.header('x-admin-token'))) return c.json({ error: 'unauthorized' }, 401)
    return c.json(await deps.sync.backfill())
  })

  // Fail closed: any unhandled error in a handler returns 500 rather than crashing the process.
  app.onError((err, c) => {
    console.error('[sync-app] unhandled error', err)
    return c.json({ error: 'internal error' }, 500)
  })

  return app
}
