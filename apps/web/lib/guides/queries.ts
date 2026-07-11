import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { Guide } from '@/lib/guides/types'
import type { GuideDetail } from '@/lib/guides/types'
import { sanitizeMatchTerms } from '@/lib/search/sanitize-match-terms'

interface GuideRowLite {
  slug: string
  title: string
  cover_url: string
  city: string
  saves_count: number
  creator_handle: string
}

export function mapRowToGuide(r: GuideRowLite): Guide {
  return {
    slug: r.slug,
    title: r.title,
    cover: r.cover_url,
    city: r.city,
    saves: r.saves_count,
    creatorHandle: r.creator_handle,
  }
}

export async function getPublishedGuides(limit?: number): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  let query = supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (limit !== undefined) query = query.limit(limit)
  const { data } = await query
  return (data ?? []).map(mapRowToGuide)
}

export async function getGuidesForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .order('slug') // stable tie-break so sitemap sharding partitions a deterministic order
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    lastmod: (r.published_at as string | null) ?? null,
  }))
}

/**
 * R1C heuristic cross-link (master spec §5): guides whose city matches any of
 * an article's region strings. PostgREST .or() treats commas/parens as syntax,
 * so region strings are sanitized to [letters/numbers/spaces/hyphens] before
 * interpolation; sub-2-char fragments are dropped as noise. Reads never crash
 * the article page — failures degrade to [] (same stance as getPublishedGuides).
 */
export async function getGuidesForRegions(regions: string[], limit = 3): Promise<Guide[]> {
  const clean = sanitizeMatchTerms(regions)
  if (clean.length === 0) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('guides')
      .select('slug, title, cover_url, city, saves_count, creator_handle')
      .eq('status', 'published')
      .or(clean.map((r) => `city.ilike.%${r}%`).join(','))
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(mapRowToGuide)
  } catch {
    return []
  }
}

export async function getGuideBySlug(slug: string): Promise<GuideDetail | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('id, slug, title, cover_url, city, saves_count, creator_handle, creator_name, creator_id, summary, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!data) return null
  return {
    ...mapRowToGuide(data),
    id: data.id as string,
    creatorId: (data.creator_id as string | null) ?? null,
    summary: data.summary,
    creatorName: data.creator_name,
    publishedAt: (data.published_at as string | null) ?? null,
    source: 'db',
  }
}
