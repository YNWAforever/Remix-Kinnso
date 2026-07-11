// apps/web/lib/sessions/public-queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { SessionStatus, SessionType } from '@/lib/sessions/types'

export type PublicSession = {
  id: string
  slug: string
  title: string
  description: string
  type: SessionType
  startsAt: string
  durationMinutes: number
  embedUrl: string | null
  replayUrl: string | null
  destinationTags: string[]
  status: SessionStatus
  /** null = the host creator's public profile isn't live yet (degrade, don't crash). */
  host: { handle: string; displayName: string } | null
}

const SESSION_COLUMNS = 'id, slug, title, description, type, starts_at, duration_minutes, embed_url, replay_url, destination_tags, status, host_creator_id'

type SessionRow = {
  id: string; slug: string; title: string; description: string; type: SessionType
  starts_at: string; duration_minutes: number; embed_url: string | null; replay_url: string | null
  destination_tags: string[] | null; status: SessionStatus; host_creator_id: string
}

function toDomain(r: SessionRow, host: { handle: string; displayName: string } | null): PublicSession {
  return {
    id: r.id, slug: r.slug, title: r.title, description: r.description, type: r.type,
    startsAt: r.starts_at, durationMinutes: r.duration_minutes,
    embedUrl: r.embed_url, replayUrl: r.replay_url, destinationTags: r.destination_tags ?? [],
    status: r.status, host,
  }
}

/**
 * Second, separate query against `creators` — same no-embed shape as
 * experiences -> merchant_public_profiles. Unlike merchants, `creators` is safe to
 * read directly (creators_public_read already restricts anon to public-safe rows),
 * so no dedicated view is needed. A host row that isn't publicly readable (not yet
 * active/public) is simply absent from the map -> degrades to host: null.
 */
async function attachHost(
  supabase: ReturnType<typeof createSupabasePublicClient>,
  rows: SessionRow[],
): Promise<PublicSession[]> {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.map((r) => r.host_creator_id))]
  const { data: creators, error } = await supabase.from('creators').select('id, handle, display_name').in('id', ids)
  if (error) throw error
  const hostById = new Map(
    (creators ?? []).map((c) => [c.id as string, { handle: c.handle as string, displayName: c.display_name as string }]),
  )
  return rows.map((r) => toDomain(r, hostById.get(r.host_creator_id) ?? null))
}

export async function getUpcomingSessionsList(limit = 20): Promise<PublicSession[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('community_sessions')
    .select(SESSION_COLUMNS)
    .in('status', ['scheduled', 'live'])
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return attachHost(supabase, (data ?? []) as unknown as SessionRow[])
}

/**
 * Upcoming sessions tagged for a destination (array-overlap on destination_tags). First
 * .overlaps() query in this codebase — confirmed via repo-wide grep during R6B design
 * research that no existing call site uses this operator, so there is no in-repo example
 * to mirror the exact shape from. Reads never crash the destination page — failures
 * degrade to [], same stance as getGuidesForRegions/getExperiencesForCity.
 */
export async function getSessionsForDestination(matchTerms: string[], limit = 6): Promise<PublicSession[]> {
  if (matchTerms.length === 0) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data, error } = await supabase
      .from('community_sessions')
      .select(SESSION_COLUMNS)
      .in('status', ['scheduled', 'live'])
      .overlaps('destination_tags', matchTerms)
      .order('starts_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    return attachHost(supabase, (data ?? []) as unknown as SessionRow[])
  } catch {
    return []
  }
}

export async function getReplaySessions(limit = 20): Promise<PublicSession[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('community_sessions')
    .select(SESSION_COLUMNS)
    .eq('status', 'ended')
    .not('replay_url', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return attachHost(supabase, (data ?? []) as unknown as SessionRow[])
}

export async function getSessionBySlug(slug: string): Promise<PublicSession | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('community_sessions')
    .select(SESSION_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [result] = await attachHost(supabase, [data as unknown as SessionRow])
  return result
}

/** Upcoming + ended-with-replay only — cancelled and any other end state excluded. */
export async function getSessionsForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data: upcoming, error: upcomingError } = await supabase
    .from('community_sessions')
    .select('slug, starts_at')
    .in('status', ['scheduled', 'live'])
  if (upcomingError) throw upcomingError
  const { data: replays, error: replayError } = await supabase
    .from('community_sessions')
    .select('slug, starts_at')
    .eq('status', 'ended')
    .not('replay_url', 'is', null)
  if (replayError) throw replayError
  return [...(upcoming ?? []), ...(replays ?? [])].map((r) => ({
    slug: r.slug as string,
    lastmod: (r.starts_at as string | null) ?? null,
  }))
}
