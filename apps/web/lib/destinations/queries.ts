// apps/web/lib/destinations/queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export interface Destination {
  slug: string
  name: string
  heroImageUrl: string | null
  description: string | null
  matchTerms: string[]
  guideCount: number
  experienceCount: number
  latestPublishedAt: string | null
}

const DESTINATION_INDEX_COLUMNS =
  'slug, name, hero_image_url, description, match_terms, guide_count, experience_count, latest_published_at, sort_order'

interface DestinationIndexRow {
  slug: string | null
  name: string | null
  hero_image_url: string | null
  description: string | null
  match_terms: string[] | null
  guide_count: number | null
  experience_count: number | null
  latest_published_at: string | null
}

function nonNegativeNumber(value: number | null): number {
  return Math.max(0, value ?? 0)
}

function mapRowToDestination(r: DestinationIndexRow): Destination {
  return {
    slug: r.slug ?? '',
    name: r.name ?? '',
    heroImageUrl: r.hero_image_url,
    description: r.description,
    matchTerms: r.match_terms ?? [],
    guideCount: nonNegativeNumber(r.guide_count),
    experienceCount: nonNegativeNumber(r.experience_count),
    latestPublishedAt: r.latest_published_at,
  }
}

export async function getPublishedDestinations(): Promise<Destination[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('destination_index')
    .select(DESTINATION_INDEX_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .order('slug', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapRowToDestination)
}

export async function getDestinationBySlug(slug: string): Promise<Destination | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('destination_index')
    .select(DESTINATION_INDEX_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data ? mapRowToDestination(data) : null
}

export async function getDestinationsForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('destination_index')
    .select('slug, latest_published_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .order('slug', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    lastmod: (r.latest_published_at as string | null) ?? null,
  }))
}
