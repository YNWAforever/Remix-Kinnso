import { createSupabasePublicClient } from '@/lib/supabase/public'
import { guides as mockGuides, type Guide } from '@/lib/creator-mock'
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

/** DB guides first, then any mock seed whose slug a DB guide hasn't taken. */
export function mergeWithSeed(dbGuides: Guide[], seed: Guide[]): Guide[] {
  const taken = new Set(dbGuides.map((g) => g.slug))
  return [...dbGuides, ...seed.filter((g) => !taken.has(g.slug))]
}

export async function getPublishedGuides(): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  const dbGuides = (data ?? []).map(mapRowToGuide)
  return mergeWithSeed(dbGuides, mockGuides)
}

export async function getGuideBySlug(slug: string): Promise<GuideDetail | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle, creator_name, summary')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (data) {
    return {
      ...mapRowToGuide(data),
      summary: data.summary,
      creatorName: data.creator_name,
      source: 'db',
    }
  }

  const mock = mockGuides.find((g) => g.slug === slug)
  if (!mock) return null
  return { ...mock, summary: null, creatorName: null, source: 'mock' }
}
