import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { Locale } from '@/lib/i18n/config'
import { getReplaySessions, getUpcomingSessionsList } from '@/lib/sessions/public-queries'

/** Aggregate counts from the `platform_stats()` SECURITY INVOKER RPC. */
export interface PlatformStats {
  activeCreators: number
  publishedGuides: number
  destinations: number
  completedBookings: number
  upcomingSessions: number
}

/** Display thresholds for the four R7.4 platform-scale metrics. */
export const STAT_THRESHOLDS = {
  activeCreators: 5,
  publishedGuides: 10,
  destinations: 3,
  completedBookings: 3,
} as const
/**
 * Honest platform counts for the social-proof bar. Degrades to null on any
 * failure — the bar hides rather than taking the homepage down (same
 * reads-never-crash stance as getPublishedGuides()).
 */
export async function getPlatformStats(): Promise<PlatformStats | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase.rpc('platform_stats')
  if (error) return null
  const row = (data ?? [])[0]
  if (!row) return null
  return {
    activeCreators: Number(row.active_creators),
    publishedGuides: Number(row.published_guides),
    destinations: Number(row.destinations),
    completedBookings: Number(row.completed_bookings),
    upcomingSessions: Number(row.upcoming_sessions),
  }
}

export interface Testimonial {
  id: string
  quote: string
  authorName: string
  authorRole: 'creator' | 'traveller' | 'merchant'
}

/** Fisher-Yates shuffle. `rand` is injectable for deterministic tests; defaults to Math.random. */
export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Published testimonials for a locale: rows whose locale matches OR is null (= all
 * locales), filtered by author_role if given, then shuffled and capped at 3 (D-R6C-5) so
 * the fixed ops-picked trio doesn't stay identical forever. RLS already hides drafts from
 * the anon client; the eq() filter documents intent. sort_order stays on the table as an
 * ops-organizational field but no longer drives display order.
 *
 * Rotation granularity: this function itself reshuffles on every invocation, but its three
 * callers (`/[locale]`, `/[locale]/for-creators`, `/[locale]/for-merchants`) are ISR pages
 * with `export const revalidate = 300` and `generateStaticParams()` — no cookies/headers/
 * searchParams make them dynamic. Next.js therefore re-runs this function once per ~5-minute
 * regeneration per locale, not once per HTTP request: every visitor hitting the cached HTML
 * within a given window sees the same three quotes in the same order. The real guarantee is
 * "rotates every revalidation window, shared across concurrent visitors in that window" —
 * not literal per-request randomness.
 */
export async function getPublishedTestimonials(
  locale: Locale,
  role?: Testimonial['authorRole'],
): Promise<Testimonial[]> {
  const supabase = createSupabasePublicClient()
  let query = supabase
    .from('testimonials')
    .select('id, quote, author_name, author_role')
    .eq('status', 'published')
    .or(`locale.is.null,locale.eq.${locale}`)
  if (role) query = query.eq('author_role', role)
  const { data } = await query
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    quote: r.quote as string,
    authorName: r.author_name as string,
    authorRole: r.author_role as Testimonial['authorRole'],
  }))
  return shuffle(rows).slice(0, 3)
}

export interface UpcomingSession {
  id: string
  slug: string
  title: string
  hostHandle: string
  startsAt: string // ISO timestamp
}

/**
 * Upcoming (scheduled or live) sessions for the homepage band, oldest-first, capped
 * to 3. Degrades to [] on any failure (same reads-never-crash stance as
 * getPublishedGuides) — a query error hides the band, it never crashes the
 * homepage. Host attribution is a second query against `creators` (same no-embed
 * two-query shape as lib/sessions/public-queries.ts); a session whose host isn't
 * publicly readable yet is simply dropped from this list rather than shown with a
 * broken handle.
 */
export async function getUpcomingSessions(): Promise<UpcomingSession[]> {
  try {
    const supabase = createSupabasePublicClient()
    const { data, error } = await supabase
      .from('community_sessions')
      .select('id, slug, title, starts_at, host_creator_id')
      .in('status', ['scheduled', 'live'])
      .order('starts_at', { ascending: true })
      .limit(3)
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) return []

    const ids = [...new Set(rows.map((r) => r.host_creator_id as string))]
    const { data: creators, error: creatorsError } = await supabase.from('creators').select('id, handle').in('id', ids)
    if (creatorsError) throw creatorsError
    const handleById = new Map((creators ?? []).map((c) => [c.id as string, c.handle as string]))

    return rows
      .filter((r) => handleById.has(r.host_creator_id as string))
      .map((r) => ({
        id: r.id as string,
        slug: r.slug as string,
        title: r.title as string,
        hostHandle: handleById.get(r.host_creator_id as string) as string,
        startsAt: r.starts_at as string,
      }))
  } catch {
    return []
  }
}
/** Homepage sessions prefer scheduled/live rows, then fall back to ended replays. */
export async function getHomeSessions(limit = 3): Promise<UpcomingSession[]> {
  try {
    const upcoming = await getUpcomingSessionsList(limit)
    const accessibleUpcoming = upcoming.filter((session) => session.host !== null)
    const rows = accessibleUpcoming.length > 0 ? accessibleUpcoming : await getReplaySessions(limit)
    return rows
      .filter((session) => session.host !== null)
      .map((session) => ({
        id: session.id,
        slug: session.slug,
        title: session.title,
        hostHandle: session.host!.handle,
        startsAt: session.startsAt,
      }))
  } catch {
    console.warn('home-sessions-query-failed')
    return []
  }
}
