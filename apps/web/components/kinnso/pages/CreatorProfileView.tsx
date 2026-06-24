import GuideCard from '@/components/kinnso/GuideCard'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { initialsFrom } from '@/lib/studio/identity'
import type { PublicCreator } from '@/lib/creators/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

interface Props {
  creator: PublicCreator
  locale: Locale
  embedded?: boolean
  t: Messages['creatorProfile']
}

function hueFromHandle(handle: string): number {
  let h = 0
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 360
  return h
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((x) => (
        <span key={x} className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-xs text-kinnso-ink">{x}</span>
      ))}
    </div>
  )
}

export function CreatorProfileView({ creator, locale, embedded, t }: Props) {
  const wrap = embedded ? '' : 'k-container py-8 md:py-12'
  const p = (path: string) => `/${locale}${path}`
  const hue = hueFromHandle(creator.handle)
  const pr = creator.profile
  return (
    <article className={wrap}>
      <header className="overflow-hidden rounded-xl">
        <div
          aria-hidden="true"
          className="h-40 w-full sm:h-56"
          style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
        />
        <TicketCard className="rounded-t-none p-6 sm:p-8">
          <span className="-mt-16 grid h-20 w-20 place-items-center rounded-full bg-kinnso-ink text-2xl font-black text-white ring-4 ring-kinnso-cream">
            {initialsFrom(creator.name)}
          </span>
          <h1 className="mt-3 text-3xl font-black text-kinnso-ink md:text-4xl">{creator.name}</h1>
          <p className="k-mono mt-1 text-sm text-kinnso-muted">@{creator.handle}</p>
          {creator.bio && <p className="mt-3 max-w-xl text-sm text-kinnso-ink/80">{creator.bio}</p>}
        </TicketCard>
      </header>

      {pr.niches.length > 0 && (
        <section className="mt-6"><h2 className="text-sm font-bold text-kinnso-ink">{t.nichesHeading}</h2><div className="mt-2"><Chips items={pr.niches} /></div></section>
      )}
      {pr.content_pillars.length > 0 && (
        <section className="mt-5"><h2 className="text-sm font-bold text-kinnso-ink">{t.pillarsHeading}</h2><div className="mt-2"><Chips items={pr.content_pillars} /></div></section>
      )}
      {pr.tone.length > 0 && (
        <section className="mt-5"><h2 className="text-sm font-bold text-kinnso-ink">{t.toneHeading}</h2><div className="mt-2"><Chips items={pr.tone} /></div></section>
      )}

      {(pr.audience_geos.length > 0 || pr.audience_locales.length > 0 || pr.languages.length > 0) && (
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {pr.audience_geos.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.audienceRegionsLabel}</h2><div className="mt-2"><Chips items={pr.audience_geos} /></div></div>)}
          {pr.audience_locales.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.audienceLocalesLabel}</h2><div className="mt-2"><Chips items={pr.audience_locales} /></div></div>)}
          {pr.languages.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.languagesHeading}</h2><div className="mt-2"><Chips items={pr.languages} /></div></div>)}
        </section>
      )}

      {pr.platforms.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-kinnso-ink">{t.platformsHeading}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {pr.platforms.map((pl) => (
              <span key={pl.platform} className="inline-flex items-center gap-1 rounded-md bg-kinnso-cream2 px-2 py-0.5 text-xs capitalize text-kinnso-ink">
                {pl.platform}
                {pl.verified && <span className="text-kinnso-orange">✓ {t.verifiedLabel}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold text-kinnso-ink">{t.guidesHeading}</h2>
        {creator.guides.length > 0 ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {creator.guides.slice(0, 9).map((g) => <GuideCard key={g.slug} g={g} locale={locale} />)}
          </div>
        ) : (
          <p className="mt-3 text-sm text-kinnso-muted">{t.guidesEmpty}</p>
        )}
      </section>
    </article>
  )
}

export { CreatorProfileView as default }
