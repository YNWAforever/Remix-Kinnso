import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { loadConfig, type SyncConfig } from './config'
import { LegacyReader } from './reader'
import { Upserter } from './upserter'
import { transformPost } from './transform'

export function makeSync(cfg: SyncConfig = loadConfig()) {
  const reader = new LegacyReader(cfg.legacy)
  const db = createClient<Database>(cfg.supabaseUrl, cfg.serviceRoleKey)
  const up = new Upserter(db, cfg.cdnBase)

  async function syncOne(legacyPostId: number) {
    const bundle = await reader.fetchPostBundle(legacyPostId)
    if (!bundle) return { ok: false as const, reason: 'not_found' }
    if (bundle.post.deleted_at) { await up.syncDelete(legacyPostId); return { ok: true as const, deleted: true } }
    const payload = transformPost(bundle, cfg.cdnBase)
    const res = await up.upsert(payload)
    return { ok: true as const, skipped: res.skipped, warnings: payload.warnings }
  }

  async function backfill(onProgress?: (n: number) => void) {
    let afterId = 0, total = 0
    for (;;) {
      const ids = await reader.allPostIds(afterId, 200)
      if (!ids.length) break
      for (const id of ids) { await syncOne(id); total++; onProgress?.(total) }
      afterId = ids[ids.length - 1]
    }
    return { total }
  }

  return { syncOne, syncDelete: (id: number) => up.syncDelete(id), backfill, close: () => reader.close() }
}
