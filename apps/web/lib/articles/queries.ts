import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { DEFAULT_LOCALE, LOCALES, toUrlCategory, type Locale } from '@/lib/i18n/config'

// Plain anon client so this helper is testable in Node without Next's
// request-scoped `cookies()`. RLS still hides unpublished/expired rows.
const db = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
  )

export async function getArticleByUrl(url: string, locale: string) {
  const { data } = await db()
    .from('articles')
    .select('*, article_translations(*)')
    .eq('url', url)
    .maybeSingle()
  if (!data) return null
  const translation =
    (data.article_translations ?? []).find((t) => t.locale === locale) ?? null
  return { ...data, translation }
}

export interface ArticleDetail {
  id: string; url: string; slug: string; category: string; thumbnails: string[]
  authors: string[]; regions: string[]; tag_slugs: string[]; rating: number | null
  views: number; published_at: string | null; end_at: string | null; edit_at: string | null
  is_coupon: boolean
  translation: {
    title: string | null; content: unknown; summary: string | null
    meta_title: string | null; meta_description: string | null
    og_image: string | null; faq_title: string | null; locale: string
  } | null
  faqs: Array<{ question: string; answer: string; weight: number }>
  author: { name: string; title: string | null; bio: string | null; avatar: string | null } | null
}

/** Detail fetch: article (RLS-gated) for a given URL **category + url**, requested-locale translation,
 *  FAQs (visible, weight desc) and the first active author. Returns null when not visible or category mismatches. */
export async function getArticleDetail(
  urlCategory: string, url: string, locale: Locale,
): Promise<ArticleDetail | null> {
  const { data } = await db()
    .from('articles')
    .select('*, article_translations(*)')
    .eq('url', url)
    .maybeSingle()
  if (!data) return null
  if (toUrlCategory(data.category) !== urlCategory) return null

  const translation =
    (data.article_translations ?? []).find((t) => t.locale === locale) ?? null

  const { data: faqRows } = await db()
    .from('article_faqs')
    .select('question, answer, weight')
    .eq('article_id', data.id).eq('locale', locale)
    .order('weight', { ascending: false })
  const faqs = faqRows ?? []

  let author: ArticleDetail['author'] = null
  const firstSlug = (data.authors ?? [])[0]
  if (firstSlug) {
    const { data: au } = await db()
      .from('article_authors')
      .select('name, title, bio, avatar')
      .eq('slug', firstSlug).eq('locale', locale).eq('is_active', true)
      .maybeSingle()
    author = au ?? null
  }

  return {
    id: data.id, url: data.url, slug: data.slug, category: data.category,
    thumbnails: data.thumbnails, authors: data.authors, regions: data.regions,
    tag_slugs: data.tag_slugs, rating: data.rating, views: data.views,
    published_at: data.published_at, end_at: data.end_at, edit_at: data.edit_at,
    is_coupon: data.is_coupon,
    translation: translation
      ? {
          title: translation.title, content: translation.content, summary: translation.summary,
          meta_title: translation.meta_title, meta_description: translation.meta_description,
          og_image: translation.og_image, faq_title: translation.faq_title, locale: translation.locale,
        }
      : null,
    faqs, author,
  }
}

/** Locales that have a translation for a (visible) article — drives hreflang + sitemap. */
export async function getPresentLocales(url: string): Promise<Locale[]> {
  const { data } = await db()
    .from('articles')
    .select('article_translations(locale)')
    .eq('url', url)
    .maybeSingle()
  if (!data) return []
  const set = new Set((data.article_translations ?? []).map((t) => t.locale))
  return LOCALES.filter((l) => set.has(l))
}

export async function getYouMayLike(articleId: string, locale: Locale, limit = 5) {
  const { data } = await db().rpc('get_you_may_like', {
    p_article_id: articleId, p_locale: locale, p_limit: limit,
  })
  return data ?? []
}

export interface SearchParams {
  locale: Locale; category?: string | null; q?: string | null
  region?: string | null; tag?: string | null; page?: number; perPage?: number
}
export interface SearchResult {
  items: Array<{
    url: string; category: string; thumbnails: string[]; rating: number | null
    published_at: string | null; edit_at: string | null; title: string | null; summary: string | null
  }>
  total: number; page: number; perPage: number
}

export async function searchArticles(p: SearchParams): Promise<SearchResult> {
  const page = Math.max(1, p.page ?? 1)
  const perPage = p.perPage ?? 12
  const { data } = await db().rpc('search_articles', {
    p_locale: p.locale,
    ...(p.category != null && { p_category: p.category }),
    ...(p.q != null && { p_q: p.q }),
    ...(p.region != null && { p_region: p.region }),
    ...(p.tag != null && { p_tag: p.tag }),
    p_limit: perPage, p_offset: (page - 1) * perPage,
  })
  const rows = data ?? []
  const total = rows.length ? Number(rows[0].total_count) : 0
  return {
    items: rows.map(({ total_count, ...r }) => r),
    total, page, perPage,
  }
}

/** All visible articles + their present locales — for sitemap.ts. */
export async function getPublishedForSitemap() {
  const { data } = await db()
    .from('articles')
    .select('url, category, edit_at, updated_at, published_at, article_translations(locale)')
  return (data ?? []).map((a) => ({
    url: a.url, category: a.category,
    lastmod: a.edit_at ?? a.updated_at ?? a.published_at,
    locales: LOCALES.filter((l) => (a.article_translations ?? []).some((t) => t.locale === l)),
  }))
}

/** Evergreen (end_at null) published articles, expanded across present locales — generateStaticParams. */
export async function getStaticArticleParams(): Promise<Array<{ locale: Locale; category: string; url: string }>> {
  const { data } = await db()
    .from('articles')
    .select('url, category, end_at, article_translations(locale)')
    .is('end_at', null)
  const out: Array<{ locale: Locale; category: string; url: string }> = []
  for (const a of data ?? []) {
    const category = toUrlCategory(a.category)
    if (!category) continue
    for (const l of LOCALES) {
      if ((a.article_translations ?? []).some((t) => t.locale === l)) out.push({ locale: l, category, url: a.url })
    }
  }
  return out
}
