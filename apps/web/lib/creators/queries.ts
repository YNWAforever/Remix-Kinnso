import { createSupabasePublicClient } from '@/lib/supabase/public'
import { mapRowToGuide } from '@/lib/guides/queries'
import type { Guide } from '@/lib/creator-mock'

export interface PublicProfile {
  niches: string[]
  content_pillars: string[]
  tone: string[]
  audience_geos: string[]
  audience_locales: string[]
  languages: string[]
  platforms: { platform: string; verified: boolean }[]
}

export interface CreatorSummary {
  handle: string
  name: string
  bio: string
  niches: string[]
  guideCount: number
}

export interface PublicCreator {
  handle: string
  name: string
  bio: string
  profile: PublicProfile
  guides: Guide[]
}

function toProfile(json: unknown): PublicProfile {
  const j = (json ?? {}) as Partial<PublicProfile>
  return {
    niches: j.niches ?? [],
    content_pillars: j.content_pillars ?? [],
    tone: j.tone ?? [],
    audience_geos: j.audience_geos ?? [],
    audience_locales: j.audience_locales ?? [],
    languages: j.languages ?? [],
    platforms: j.platforms ?? [],
  }
}

export async function getPublicCreators(): Promise<CreatorSummary[]> {
  const supabase = createSupabasePublicClient()
  const { data: rows } = await supabase
    .from('creators')
    .select('id, handle, display_name, bio, public_profile')
    .eq('status', 'active')
    .not('handle', 'is', null)
    .not('public_profile', 'is', null)
    .order('created_at', { ascending: false })
  const creators = rows ?? []
  if (creators.length === 0) return []

  const { data: guideRows } = await supabase
    .from('guides')
    .select('creator_id')
    .eq('status', 'published')
  const counts = new Map<string, number>()
  for (const g of guideRows ?? []) {
    counts.set(g.creator_id, (counts.get(g.creator_id) ?? 0) + 1)
  }

  return creators.map((c) => ({
    handle: c.handle as string,
    name: c.display_name ?? (c.handle as string),
    bio: c.bio ?? '',
    niches: toProfile(c.public_profile).niches,
    guideCount: counts.get(c.id) ?? 0,
  }))
}

export async function getCreatorByHandle(handle: string): Promise<PublicCreator | null> {
  const supabase = createSupabasePublicClient()
  const { data: c } = await supabase
    .from('creators')
    .select('id, handle, display_name, bio, public_profile')
    .eq('handle', handle)
    .eq('status', 'active')
    .maybeSingle()
  if (!c) return null

  const { data: guideRows } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('creator_id', c.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  return {
    handle: c.handle as string,
    name: c.display_name ?? (c.handle as string),
    bio: c.bio ?? '',
    profile: toProfile(c.public_profile),
    guides: (guideRows ?? []).map(mapRowToGuide),
  }
}

export async function getCreatorsForSitemap(): Promise<{ handle: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('creators')
    .select('handle, created_at')
    .eq('status', 'active')
    .not('handle', 'is', null)
    .not('public_profile', 'is', null)
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => ({
    handle: r.handle as string,
    lastmod: (r.created_at as string | null) ?? null,
  }))
}

export interface CreatorPublicName {
  name: string
  handle: string | null
}

export async function getCreatorPublicNames(
  ids: string[],
): Promise<Map<string, CreatorPublicName>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, CreatorPublicName>()
  if (unique.length === 0) return map

  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('creators')
    .select('id, handle, display_name')
    .in('id', unique)

  for (const c of data ?? []) {
    const handle = (c.handle as string | null) ?? null
    const name = (c.display_name ?? handle) as string
    if (name) map.set(c.id as string, { name, handle })
  }
  return map
}
