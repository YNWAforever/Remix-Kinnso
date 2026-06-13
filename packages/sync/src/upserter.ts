import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { UpsertPayload } from './types'

type DB = SupabaseClient<Database>

export class Upserter {
  constructor(private db: DB, private cdn: string) {}

  /** Idempotent upsert of one article and its children, in dependency order. */
  async upsert(payload: UpsertPayload & { warnings?: unknown[] }): Promise<{ skipped: boolean }> {
    const { article, translations, faqs, authors, tags, tagSlugs } = payload

    const { data: existing } = await this.db
      .from('articles')
      .select('id, source_hash, views, deleted_at')
      .eq('legacy_post_id', article.legacy_post_id!)
      .maybeSingle()

    if (existing && existing.source_hash === article.source_hash && !existing.deleted_at) {
      return { skipped: true } // unchanged
    }

    if (authors.length) await this.db.from('article_authors').upsert(authors, { onConflict: 'slug,locale' })

    const tagIdBySlug = new Map<string, string>()
    for (const { tag, translations: tts } of tags) {
      const { data: t } = await this.db.from('article_tags').upsert(tag, { onConflict: 'slug' }).select('id, slug').single()
      tagIdBySlug.set(t!.slug, t!.id)
      if (tts.length) await this.db.from('article_tag_translations').upsert(tts.map((x) => ({ ...x, tag_id: t!.id })), { onConflict: 'tag_id,locale' })
    }

    const row = { ...article, source_synced_at: new Date().toISOString() }
    if (existing) row.views = existing.views // views seed-only: never overwrite
    const { data: art } = await this.db.from('articles').upsert(row, { onConflict: 'legacy_post_id' }).select('id').single()
    const articleId = art!.id

    await this.db.from('article_translations').delete().eq('article_id', articleId)
    if (translations.length) await this.db.from('article_translations').insert(translations.map((t) => ({ ...t, article_id: articleId })))

    await this.db.from('article_faqs').delete().eq('article_id', articleId)
    if (faqs.length) await this.db.from('article_faqs').insert(faqs.map((f) => ({ ...f, article_id: articleId })))

    await this.db.from('article_tag_map').delete().eq('article_id', articleId)
    const mapRows = tagSlugs.map((s) => tagIdBySlug.get(s)).filter(Boolean).map((tag_id) => ({ article_id: articleId, tag_id: tag_id! }))
    if (mapRows.length) await this.db.from('article_tag_map').insert(mapRows)

    return { skipped: false }
  }

  async syncDelete(legacyPostId: number): Promise<void> {
    await this.db.from('articles').update({ deleted_at: new Date().toISOString() }).eq('legacy_post_id', legacyPostId)
  }
}
