import { createHash } from 'node:crypto'
import type { ArticleRow, LegacyPostBundle } from '../types'
import { csvToArray, cdnUrl } from './arrays'
import { primaryCategory } from './category'

const toIso = (s: string | null): string | null => {
  if (!s) return null
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Deterministic content hash for idempotent upserts (excludes volatile fields like views). */
export function sourceHash(bundle: LegacyPostBundle): string {
  const material = JSON.stringify({
    post: { ...bundle.post, views: undefined, updated_at: undefined },
    translations: bundle.translations,
    faqs: bundle.faqs,
    authors: bundle.authors,
    tags: bundle.tags,
    categoryWeights: bundle.categoryWeights,
  })
  return createHash('sha256').update(material).digest('hex')
}

export function buildArticleRow(
  bundle: LegacyPostBundle,
  tagSlugs: string[],
  cdn: string,
): { row: ArticleRow; categoryDefaulted: boolean } {
  const p = bundle.post
  const { category, defaulted } = primaryCategory(bundle.categoryWeights)
  return {
    row: {
      legacy_post_id: p.id,
      slug: p.slug,
      url: p.url ?? p.slug,
      category,
      thumbnails: csvToArray(p.thumbnails).map((t) => cdnUrl(t, cdn)),
      authors: csvToArray(p.authors),
      regions: csvToArray(p.regions),
      tag_slugs: tagSlugs,
      rating: p.rating ?? null,
      views: p.views ?? 0,
      published_at: toIso(p.published_at),
      end_at: toIso(p.end_at),
      edit_at: toIso(p.edit_at),
      source: p.source ?? null,
      source_synced_at: null, // stamped by the upserter
      source_hash: sourceHash(bundle),
      deleted_at: toIso(p.deleted_at),
    },
    categoryDefaulted: defaulted,
  }
}
