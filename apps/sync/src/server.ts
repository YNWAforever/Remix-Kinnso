import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { makeSync } from '@kinnso/sync'
import { revalidate } from './revalidate'

const app = new Hono()
const sync = makeSync()
const SECRET = process.env.FOSO_WEBHOOK_SECRET ?? ''
const ADMIN = process.env.SYNC_ADMIN_TOKEN ?? ''

function verifyHmac(raw: string, sig: string | undefined): boolean {
  if (!SECRET || !sig) return false
  const expected = createHmac('sha256', SECRET).update(raw).digest('hex')
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) } catch { return false }
}

app.get('/health', (c) => c.json({ ok: true }))

app.post('/webhook/foso', async (c) => {
  const raw = await c.req.text()
  if (!verifyHmac(raw, c.req.header('x-foso-signature'))) return c.json({ error: 'bad signature' }, 401)
  const { legacy_post_id, event } = JSON.parse(raw) as { legacy_post_id: number; event: string }
  const res = event === 'deleted'
    ? (await sync.syncDelete(legacy_post_id), { ok: true, deleted: true })
    : await sync.syncOne(legacy_post_id)
  await revalidate(['/articles']).catch(() => {}) // Plan 3 supplies concrete paths
  return c.json(res)
})

app.post('/sync/:id', async (c) => {
  if (!ADMIN || c.req.header('x-admin-token') !== ADMIN) return c.json({ error: 'unauthorized' }, 401)
  return c.json(await sync.syncOne(Number(c.req.param('id'))))
})

app.post('/backfill', async (c) => {
  if (!ADMIN || c.req.header('x-admin-token') !== ADMIN) return c.json({ error: 'unauthorized' }, 401)
  return c.json(await sync.backfill())
})

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) })
