import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { Locale } from '@/lib/i18n/config'

/** Aggregate counts from the `platform_stats()` SECURITY INVOKER RPC. */
export interface PlatformStats {
  activeCreators: number
  publishedGuides: number
  destinations: number
}

/**
 * Display thresholds (master spec §4.1 honesty rule): a stat below its
 * threshold is NOT rendered — no zeros, no fake "growing fast" numbers.
 */
export const STAT_THRESHOLDS = {
  activeCreators: 5,
  publishedGuides: 10,
  destinations: 3,
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
export async function getPublishedTestimonials(locale: Locale): Promise<Testimonial[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('testimonials')
    .select('id, quote, author_name, author_role')
    .eq('status', 'published')
    .or(`locale.is.null,locale.eq.${locale}`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(3)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    quote: r.quote as string,
    authorName: r.author_name as string,
    authorRole: r.author_role as Testimonial['authorRole'],
  }))
}

/** The shape R5's community_sessions rows will map into. */
export interface UpcomingSession {
  id: string
  title: string
  hostHandle: string
  startsAt: string // ISO timestamp
}

/**
 * DATA-GATED stub until R5 ships `community_sessions`: returns [] so the
 * homepage Sessions section renders null — no fake content, no empty
 * carousels. R5 replaces this body with a real query; the return type is
 * already the R5 contract, so HomeView will not change shape.
 */
export async function getUpcomingSessions(): Promise<UpcomingSession[]> {
  return []
}
