import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { RouteStamp, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import { initialsFrom } from '@/lib/studio/identity'
import type { CreatorSummary } from '@/lib/creators/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function CreatorsLandingView({
  locale,
  t,
  creators,
}: {
  locale: Locale
  t: Messages['creatorsLanding']
  creators: CreatorSummary[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main>
      {/* Compact hero + apply CTA */}
      <section className="k-page-band py-12 md:py-16">
        <div className="k-container flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <RouteStamp>{t.heroPill}</RouteStamp>
            <h1 className="k-display mt-3 max-w-2xl">{t.directoryHeading}</h1>
            <p className="mt-3 max-w-xl text-kinnso-muted">{t.directorySub}</p>
          </div>
          <Link href={p('/sign-up')} className="k-btn-primary inline-flex shrink-0">
            {t.applyCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Directory grid */}
      <section className="k-container py-12">
        {creators.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => (
              <li key={c.handle}>
                <TicketCard className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-kinnso-ink text-sm font-black text-white">
                      {initialsFrom(c.name)}
                    </span>
                    <div>
                      <div className="font-bold text-kinnso-ink">{c.name}</div>
                      <div className="k-mono text-xs text-kinnso-muted">@{c.handle}</div>
                    </div>
                  </div>
                  {c.bio && <p className="mt-3 line-clamp-2 text-sm text-kinnso-muted">{c.bio}</p>}
                  {c.niches.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.niches.slice(0, 3).map((n) => (
                        <span key={n} className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-[11px] text-kinnso-ink">{n}</span>
                      ))}
                    </div>
                  )}
                  <TicketDivider className="my-3" />
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-xs text-kinnso-muted">{t.guideCount.replace('{count}', String(c.guideCount))}</span>
                    <Link href={p(`/c/${c.handle}`)} className="k-btn-ghost inline-flex text-sm">
                      {t.viewProfile} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                </TicketCard>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-kinnso-cream2 px-5 py-8 text-center text-kinnso-muted">{t.directoryEmpty}</p>
        )}
      </section>

      {/* Bottom apply CTA */}
      <section className="k-container pb-20">
        <TicketCard className="p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-5 inline-flex">
            {t.ctaButton} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </TicketCard>
      </section>
    </main>
  )
}

export default CreatorsLandingView
