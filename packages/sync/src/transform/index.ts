import type { LegacyPostBundle, TranslationRow, UpsertPayload } from '../types'
import { buildArticleRow } from './article'
import { normalizeContent, deriveSummary } from './content'
import { parseMetaTags, resolveMetaDescription } from './meta'
import { transformTags } from './tags'
import { transformAuthors } from './authors'
import { transformFaqs } from './faqs'
import { csvToArray } from './arrays'

export interface TransformWarning { kind: string; detail: string }

export function transformPost(bundle: LegacyPostBundle, cdn: string): UpsertPayload & { warnings: TransformWarning[] } {
  const warnings: TransformWarning[] = []
  const { tags, tagSlugs } = transformTags(bundle.tags)
  const { row: article, categoryDefaulted } = buildArticleRow(bundle, tagSlugs, cdn)
  if (categoryDefaulted) warnings.push({ kind: 'category_defaulted', detail: bundle.post.slug })

  const zhHk = bundle.translations.find((t) => t.locale === 'zh-hk')
  const zhHkMetaDesc = parseMetaTags(zhHk?.meta_tags ?? null).metaDescription

  const translations: TranslationRow[] = bundle.translations
    .filter((t) => !t.deleted_at)
    .map((t) => {
      const blocks = normalizeContent(t.content, cdn)
      if (t.content && blocks.length === 0) warnings.push({ kind: 'content_parse_failed', detail: `${bundle.post.slug}:${t.locale}` })
      const summary = deriveSummary(blocks)
      const meta = parseMetaTags(t.meta_tags)
      const description = resolveMetaDescription(t.locale, meta.metaDescription, zhHkMetaDesc, summary)
      return {
        article_id: '', // filled by upserter
        locale: t.locale,
        title: t.title,
        // blocks are JSON-serializable; Json's index type is stricter than Record<string,unknown>
        content: blocks as unknown as TranslationRow['content'],
        summary,
        meta_title: meta.metaTitle ?? t.title,
        meta_description: description,
        meta_keywords: meta.metaKeywords ?? null,
        og_title: meta.ogTitle ?? meta.metaTitle ?? t.title,
        og_description: meta.ogDescription ?? description,
        og_image: meta.ogImage ?? (article.thumbnails?.[0] ?? null),
        faq_title: t.faq_title ?? null,
        labels: csvToArray(t.labels),
        analyze_tags: csvToArray(t.analyze_tags),
        validated_at: t.validated_at ? new Date(t.validated_at.replace(' ', 'T') + 'Z').toISOString() : null,
      }
    })

  return {
    article,
    translations,
    faqs: transformFaqs(bundle.faqs).map((f) => ({ ...f, article_id: '' })),
    authors: transformAuthors(bundle.authors, cdn),
    tags,
    tagSlugs,
    warnings,
  }
}
