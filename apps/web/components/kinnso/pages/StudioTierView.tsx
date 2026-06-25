import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorContribution, ContributionEvent } from '@/lib/contribution/queries'
import { TIER_THRESHOLDS } from '@/lib/contribution/tiers'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import TierBadge from '@/components/kinnso/TierBadge'

const EVENT_LABEL_KEY = {
  guide_published: 'eventGuide',
  mission_verified: 'eventMission',
  dna_scan: 'eventScan',
} as const

export function StudioTierView({
  t,
  contribution,
  events,
}: {
  t: Messages['tier']
  contribution: CreatorContribution
  events: ContributionEvent[]
}) {
  const { tier, points } = contribution
  return (
    <main>
      <section className="k-container space-y-6 py-10">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-kinnso-ink md:text-4xl">{t.pageHeading}</h1>
          <p className="mt-1 text-kinnso-muted">{t.pageSubtitle}</p>
        </div>

        {/* Current status */}
        <TicketCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.currentLabel}</p>
          <div className="mt-2 flex items-center gap-3">
            <TierBadge tier={tier} />
            <span className="k-mono text-sm text-kinnso-muted">
              {points} {t.pointsSuffix}
            </span>
          </div>
        </TicketCard>

        {/* All tiers */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.allTiersHeading}</h2>
          <ul className="mt-3 space-y-2">
            {TIER_THRESHOLDS.map((row) => (
              <li key={row.tier} className="flex items-center justify-between">
                <TierBadge tier={row.tier} />
                <span className="k-mono text-sm text-kinnso-muted">
                  {row.min}+ {t.pointsSuffix}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-kinnso-muted">{t.unlocksPlaceholder}</p>
        </TicketCard>

        {/* Points history */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.historyHeading}</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-kinnso-muted">{t.historyEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-kinnso-ink">{t[EVENT_LABEL_KEY[e.eventType]]}</span>
                  <span className="k-mono text-kinnso-muted">
                    +{e.points} {t.pointsSuffix}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TicketCard>
      </section>
    </main>
  )
}

export default StudioTierView
