import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { Guide } from '@/lib/creator-mock'
import type { GuideDetail } from '@/lib/guides/types'

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

export async function getPublishedGuides(): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  return (data ?? []).map(mapRowToGuide)
}

export async function getGuidesForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    lastmod: (r.published_at as string | null) ?? null,
  }))
}

export async function getGuideBySlug(slug: string): Promise<GuideDetail | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle, creator_name, summary, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!data) return null
  return {
    ...mapRowToGuide(data),
    summary: data.summary,
    creatorName: data.creator_name,
    publishedAt: (data.published_at as string | null) ?? null,
    source: 'db',
  }
}
