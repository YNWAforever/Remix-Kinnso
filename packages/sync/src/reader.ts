import mysql from 'mysql2/promise'
import type { SyncConfig } from './config'
import type { LegacyPostBundle } from './types'

export class LegacyReader {
  private pool: mysql.Pool
  constructor(cfg: SyncConfig['legacy']) {
    this.pool = mysql.createPool({ ...cfg, connectionLimit: 4, dateStrings: true, namedPlaceholders: true })
  }
  async close() { await this.pool.end() }

  /** Published, non-deleted post ids, ascending (for backfill pagination). */
  async allPostIds(afterId = 0, limit = 200): Promise<number[]> {
    const [rows] = await this.pool.query<any[]>(
      'select id from posts where id > :afterId and deleted_at is null and published_at is not null order by id asc limit :limit',
      { afterId, limit },
    )
    return rows.map((r) => Number(r.id))
  }

  /** Assemble one post bundle (includes unpublished/soft-deleted posts so the sync can propagate removal). */
  async fetchPostBundle(id: number): Promise<LegacyPostBundle | null> {
    const [posts] = await this.pool.query<any[]>(
      'select id, slug, url, thumbnails, authors, regions, offers, rating, views, published_at, end_at, edit_at, source, deleted_at, updated_at from posts where id = :id',
      { id },
    )
    if (!posts.length) return null
    const post = posts[0]
    const slug: string = post.slug

    const [translations] = await this.pool.query<any[]>(
      'select locale, title, content, meta_tags, analyze_tags, faq_title, labels, validated_at, deleted_at from post_translations where post_id = :id order by locale asc',
      { id },
    )
    const [faqs] = await this.pool.query<any[]>(
      'select language, question, answer, weight from post_faqs where post_slug = :slug and deleted_at is null order by weight desc',
      { slug },
    )
    // FIND_IN_SET is whitespace-sensitive; legacy stores `posts.authors` space-free, but
    // strip any stray whitespace defensively so `author-a, author-b` still resolves both.
    const [authorRows] = await this.pool.query<any[]>(
      'select slug, language, name, image, job_title, description, show_in_author_page, labels from post_authors where deleted_at is null and find_in_set(slug, :authors) order by slug asc, language asc',
      { authors: (post.authors ?? '').replace(/\s+/g, '') },
    )
    const [catW] = await this.pool.query<any[]>(
      'select category_slug, weight from post_category_weights where post_slug = :slug and deleted_at is null order by category_slug asc',
      { slug },
    )
    const [tagRows] = await this.pool.query<any[]>(
      `select t.id as legacy_tag_id, t.slug, pa.weight, tt.locale, tt.name
       from post_attributes pa
       join tags t on t.id = pa.model_id
       left join tag_translations tt on tt.tag_id = t.id
       where pa.post_id = :id and pa.model_type = 'App\\\\Models\\\\Tag'
         and pa.deleted_at is null and t.deleted_at is null and t.is_active = 1
       order by t.slug asc, tt.locale asc`,
      { id },
    )

    const tagMap = new Map<string, LegacyPostBundle['tags'][number]>()
    for (const r of tagRows) {
      let t = tagMap.get(r.slug)
      if (!t) { t = { slug: r.slug, legacy_tag_id: Number(r.legacy_tag_id), weight: r.weight, translations: [] }; tagMap.set(r.slug, t) }
      if (r.locale && r.name) t.translations.push({ locale: r.locale, name: r.name })
    }

    return { post, translations, faqs, authors: authorRows, tags: [...tagMap.values()], categoryWeights: catW }
  }
}
