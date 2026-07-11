import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { Locale } from '@/lib/i18n/config'

/** Aggregate counts from the `platform_stats()` SECURITY INVOKER RPC. */
export interface PlatformStats {
  activeCreators: number
  publishedGuides: number
  destinations: number
  completedBookings: number
  upcomingSessions: number
}

/**
 * Display thresholds (master spec §4.1 honesty rule): a stat below its
 * threshold is NOT rendered — no zeros, no fake "growing fast" numbers.
 */
export const STAT_THRESHOLDS = {
  activeCreators: 5,
  publishedGuides: 10,
  destinations: 3,
  completedBookings: 3, // coldest-start metric — matches the current lowest threshold (D-R3C-4)
  upcomingSessions: 1, // any real upcoming session is honest content worth surfacing
} as const

/** Fewer than this many passing stats → the whole social-proof bar renders null. */
export const MIN_VISIBLE_STATS = 2

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

/**
 * Published testimonials for a locale: rows whose locale matches OR is null
 * (= all locales), ordered by sort_order then created_at, max 3. RLS already
 * hides drafts from the anon client; the eq() filter documents intent.
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
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (role) query = query.eq('author_role', role)
  const { data } = await query.limit(3)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    quote: r.quote as string,
    authorName: r.author_name as string,
    authorRole: r.author_role as Testimonial['authorRole'],
  }))
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
