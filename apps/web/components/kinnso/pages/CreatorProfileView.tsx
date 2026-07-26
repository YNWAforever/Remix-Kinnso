import GuideCard from '@/components/kinnso/GuideCard'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import { ArticleCard } from '@/components/ArticleCard'
import SessionCard from '@/components/kinnso/SessionCard'
import { EnquiryDialog } from '@/components/kinnso/enquiries/EnquiryDialog'
import type { CreatorArticleCard } from '@/lib/articles/queries'
import type { PublicSession } from '@/lib/sessions/public-queries'
import { displayName } from '@/lib/i18n/display-names'
import type { PublicCreator } from '@/lib/creators/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

interface Props {
  creator: PublicCreator
  locale: Locale
  embedded?: boolean
  t: Messages['creatorProfile']
  enquiry?: Messages['enquiry']
  related?: Pick<Messages['destinations'], 'articlesHeading' | 'sessionsHeading'>
  articles?: CreatorArticleCard[]
  sessions?: PublicSession[]

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

export function CreatorProfileView({ creator, locale, embedded, t, enquiry, related, articles = [], sessions = [] }: Props) {
  const wrap = embedded ? '' : 'k2-container py-8 md:py-12'
  const hue = hueFromHandle(creator.handle)
  const pr = creator.profile
  const regions = pr.audience_geos.flatMap((code) => {
    const name = displayName(locale, 'region', code)
    return name ? [name] : []
  })
  const languages = pr.languages.flatMap((code) => {
    const name = displayName(locale, 'language', code)
    return name ? [name] : []
  })
  const workWithLabel = t.brandWorkWith.replace('{name}', creator.name)
  return (
    <article className={wrap}>
      <header className="overflow-hidden rounded-xl">
        <div
          aria-hidden="true"
          className="h-40 w-full sm:h-56"
          style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
        />
        <div className="k2-card rounded-t-none p-6 sm:p-8">
          <EntityMedia src={creator.avatarUrl} title={creator.name} alt="" sizes="80px" className="-mt-16 h-20 w-20 rounded-full ring-4 ring-kinnso-cream [&_[data-media-placeholder=true]>span]:hidden [&_[data-media-placeholder=true]]:p-0" />
          <h1 className="mt-3 k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{creator.name}</h1>
          <p className="mt-1 text-sm text-kinnso-muted">@{creator.handle}</p>
          {creator.bio && <p className="mt-3 max-w-xl text-sm text-kinnso-ink/80">{creator.bio}</p>}
          {enquiry && <div className="mt-5"><EnquiryDialog type="creator_collab" targetId={creator.id} targetName={creator.name} triggerLabel={workWithLabel} t={enquiry} /></div>}
        </div>
      </header>

      {pr.niches.length > 0 && (
        <section className="mt-6"><h2 className="text-sm font-bold text-kinnso-ink">{t.nichesHeading}</h2><div className="mt-2"><Chips items={pr.niches} /></div></section>
      )}
      {pr.content_pillars.length > 0 && (
        <section className="mt-5"><h2 className="text-sm font-bold text-kinnso-ink">{t.pillarsHeading}</h2><div className="mt-2"><Chips items={pr.content_pillars} /></div></section>
      )}

      {(regions.length > 0 || languages.length > 0) && (
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {regions.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.audienceRegionsLabel}</h2><div className="mt-2"><Chips items={regions} /></div></div>)}
          {languages.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.languagesHeading}</h2><div className="mt-2"><Chips items={languages} /></div></div>)}
        </section>
      )}

      {pr.platforms.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-kinnso-ink">{t.platformsHeading}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {pr.platforms.map((pl) => (
              <span key={pl.platform} className="inline-flex items-center gap-1 rounded-md bg-kinnso-cream2 px-2 py-0.5 text-xs capitalize text-kinnso-ink">
                {pl.platform}
                {pl.followers !== undefined && <span>{new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(pl.followers)}</span>}
                {pl.verified && (
                  <span className="text-kinnso-ink">
                    <span aria-hidden="true" className="text-kinnso-green">✓</span> {t.verifiedLabel}
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {creator.guides.length > 0 && <section className="mt-8">
        <h2 className="text-xl font-bold text-kinnso-ink">{t.guidesHeading}</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {creator.guides.slice(0, 9).map((g) => <GuideCard key={g.slug} g={g} locale={locale} />)}
        </div>
      </section>
      }
      {articles.length > 0 && related && <section className="mt-8">
        <h2 className="text-xl font-bold text-kinnso-ink">{related.articlesHeading}</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => <ArticleCard key={article.id} href={`/${locale}/${article.category}/${article.url}`} title={article.title} summary={article.summary} thumbnail={article.thumbnail ?? undefined} />)}
        </div>
      </section>}
      {sessions.length > 0 && related && <section className="mt-8">
        <h2 className="text-xl font-bold text-kinnso-ink">{related.sessionsHeading}</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => <SessionCard key={session.id} session={session} locale={locale} />)}
        </div>
      </section>}
    </article>
  )
}

export { CreatorProfileView as default }
