import { MIN_VISIBLE_STATS, STAT_THRESHOLDS, type PlatformStats } from '@/lib/home/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * Section 2 — social-proof bar. Honesty rules (master spec §4.1 + locked R1B
 * decisions): a stat below its threshold is NOT rendered (no zeros, no fake
 * "growing fast" numbers), and fewer than MIN_VISIBLE_STATS passing stats
 * hides the whole bar. Server component; numbers formatted per locale.
 */
export function StatsBar({ locale, t, stats }: { locale: Locale; t: Messages['home']; stats: PlatformStats | null }) {
  if (!stats) return null
  const entries = [
    { key: 'creators', value: stats.activeCreators, min: STAT_THRESHOLDS.activeCreators, label: t.statCreators },
    { key: 'guides', value: stats.publishedGuides, min: STAT_THRESHOLDS.publishedGuides, label: t.statGuides },
    { key: 'destinations', value: stats.destinations, min: STAT_THRESHOLDS.destinations, label: t.statDestinations },
    { key: 'bookings', value: stats.completedBookings, min: STAT_THRESHOLDS.completedBookings, label: t.statCompletedBookings },
    { key: 'sessions', value: stats.upcomingSessions, min: STAT_THRESHOLDS.upcomingSessions, label: t.statUpcomingSessions },
  ].filter((s) => s.value >= s.min)
  if (entries.length < MIN_VISIBLE_STATS) return null
  const fmt = new Intl.NumberFormat(locale)
  return (
    <div className="border-b border-kinnso-edge bg-kinnso-cream">
      <ul className="k2-container flex flex-wrap items-baseline gap-x-12 gap-y-4 py-8">
        {entries.map((s) => (
          <li key={s.key} className="flex items-baseline gap-2">
            <span className="k2-display text-3xl font-semibold text-kinnso-ink">{fmt.format(s.value)}</span>
            <span className="text-sm text-kinnso-ink/70">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
