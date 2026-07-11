// apps/web/lib/destinations/queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export interface Destination {
  slug: string
  name: string
  heroImageUrl: string | null
  description: string | null
  matchTerms: string[]
}

const DESTINATION_COLUMNS = 'slug, name, hero_image_url, description, match_terms'

interface DestinationRow {
  slug: string
  name: string
  hero_image_url: string | null
  description: string | null
  match_terms: string[] | null
}

function mapRowToDestination(r: DestinationRow): Destination {
  return {
    slug: r.slug,
    name: r.name,
    heroImageUrl: r.hero_image_url,
    description: r.description,
    matchTerms: r.match_terms ?? [],
  }
}

export async function getPublishedDestinations(): Promise<Destination[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('destinations')
    .select(DESTINATION_COLUMNS)
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
  return (data ?? []).map(mapRowToDestination)
}

export async function getDestinationBySlug(slug: string): Promise<Destination | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('destinations')
    .select(DESTINATION_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data ? mapRowToDestination(data) : null
}

export async function getDestinationsForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('destinations')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    lastmod: (r.published_at as string | null) ?? null,
  }))
}
