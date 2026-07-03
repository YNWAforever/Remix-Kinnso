import Link from 'next/link'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { AgentTeaser } from '@/components/kinnso/home/AgentTeaser'
import { CreatorCta } from '@/components/kinnso/home/CreatorCta'
import { Hero } from '@/components/kinnso/home/Hero'
import { HowItWorks } from '@/components/kinnso/home/HowItWorks'
import { MerchantValue } from '@/components/kinnso/home/MerchantValue'
import { StatsBar } from '@/components/kinnso/home/StatsBar'
import type { SearchResult } from '@/lib/articles/queries'
import type { Guide } from '@/lib/guides/types'
import type { PlatformStats, Testimonial, UpcomingSession } from '@/lib/home/queries'
import { toUrlCategory, type Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * R1B homepage — the 10 sections of master spec §4.1, in order:
 *  1 Hero · 2 Social proof (stats bar + pull-quotes) · 3 How it works ·
 *  4 Featured guides · 5 AI Agent (waitlist) · 6 Articles highlight ·
 *  7 Community Sessions (data-gated until R5) · 8 Merchant value ·
 *  9 Creator CTA · 10 Footer (rendered by SiteChrome — no work here).
 * Every proof section is data-gated: empty data renders nothing, never filler.
 */
export function HomeView({
  locale, t, guides, stats, testimonials, articles, sessions,
}: {
  locale: Locale
  t: Messages['home']
  guides: Guide[]
  stats: PlatformStats | null
  testimonials: Testimonial[]
  articles: SearchResult['items']
  sessions: UpcomingSession[]
}) {
  const p = (path: string) => `/${locale}${path}`
  const roleLabel: Record<Testimonial['authorRole'], string> = {
    creator: t.roleCreator, traveller: t.roleTraveller, merchant: t.roleMerchant,
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  const linkableArticles = articles.filter((a) => toUrlCategory(a.category))

  return (
    <div className="bg-kinnso-cream font-sans">
      {/* 1 — Hero (locked copy; real covers or typographic fallback) */}
      <Hero locale={locale} t={t} guides={guides} />

      {/* 2 — Social proof: threshold-gated counts + curated pull-quotes */}
      <StatsBar locale={locale} t={t} stats={stats} />
      {testimonials.length > 0 ? (
        <SectionShell className="k2-hairline" aria-labelledby="home-testimonials-heading">
          <h2 id="home-testimonials-heading" className="sr-only">{t.testimonialsHeading}</h2>
          <ul className="grid gap-10 md:grid-cols-3">
            {testimonials.map((q) => (
              <li key={q.id}>
                <figure>
                  <blockquote className="k2-display text-xl leading-snug text-kinnso-ink">
                    &ldquo;{q.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-3 text-sm text-kinnso-ink/70">
                    — {q.authorName} · {roleLabel[q.authorRole]}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </SectionShell>
      ) : null}

      {/* 3 — How it works (traveller default; client tabs, no URL state) */}
      <HowItWorks t={t} />

      {/* 4 — Featured guides (up to 6, real DB) */}
      <SectionShell className="k2-hairline">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>{t.featuredEyebrow}</Eyebrow>
            <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.featuredHeading}</h2>
            <p className="mt-2 text-kinnso-ink/70">{t.featuredSub}</p>
          </div>
          <Link href={p('/explore')} className="text-sm font-semibold text-kinnso-orangeDark transition hover:text-kinnso-ink">
            {t.featuredSeeAll} →
          </Link>
        </div>
        {guides.length === 0 ? (
          <p className="mt-8 text-kinnso-ink/70">{t.featuredEmpty}</p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <Link key={g.slug} href={p(`/g/${g.slug}`)} className="group">
                <EditorialCard
                  media={
                    g.cover ? (
                      <img
                        src={g.cover}
                        alt={g.title}
                        width={640}
                        height={480}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : undefined
                  }
                  kicker={g.city}
                  title={g.title}
                >
                  @{g.creatorHandle}
                </EditorialCard>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      {/* 5 — AI Agent (waitlist framing until R4) */}
      <AgentTeaser locale={locale} t={t} />

      {/* 6 — Articles highlight (3 latest with a resolvable category; hidden when none) */}
      {linkableArticles.length > 0 ? (
        <SectionShell>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>{t.articlesEyebrow}</Eyebrow>
              <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.articlesHeading}</h2>
            </div>
            <Link href={p('/articles')} className="text-sm font-semibold text-kinnso-orangeDark transition hover:text-kinnso-ink">
              {t.articlesSeeAll} →
            </Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {linkableArticles.slice(0, 3).map((a) => {
              const cat = toUrlCategory(a.category)
              if (!cat) return null
              return (
                <Link key={a.url} href={p(`/articles/${cat}/${a.url}`)} className="group">
                  <EditorialCard
                    media={
                      a.thumbnails[0] ? (
                        <img
                          src={a.thumbnails[0]}
                          alt={a.title ?? ''}
                          width={640}
                          height={480}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : undefined
                    }
                    kicker={a.published_at ? dateFmt.format(new Date(a.published_at)) : undefined}
                    title={a.title ?? a.url}
                  >
                    {a.summary}
                  </EditorialCard>
                </Link>
              )
            })}
          </div>
        </SectionShell>
      ) : null}

      {/* 7 — Community Sessions: DATA-GATED. getUpcomingSessions() returns []
          until R5 ships community_sessions, so this renders null today — no
          fake content, no empty carousel. */}
      {sessions.length > 0 ? (
        <SectionShell className="k2-hairline">
          <Eyebrow>{t.sessionsEyebrow}</Eyebrow>
          <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.sessionsHeading}</h2>
          <p className="mt-2 max-w-xl text-kinnso-ink/70">{t.sessionsSub}</p>
          <ul className="mt-8 grid gap-5 md:grid-cols-3">
            {sessions.map((s) => (
              <li key={s.id} className="k2-card p-5">
                <p className="text-sm text-kinnso-ink/70">{dateTimeFmt.format(new Date(s.startsAt))}</p>
                <h3 className="mt-2 text-lg font-semibold text-kinnso-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-kinnso-ink/70">@{s.hostHandle}</p>
              </li>
            ))}
          </ul>
        </SectionShell>
      ) : null}

      {/* 8 — Merchant value prop */}
      <MerchantValue locale={locale} t={t} />

      {/* 9 — Creator CTA */}
      <CreatorCta locale={locale} t={t} />

      {/* 10 — Footer: R1A chrome renders it via SiteChrome. No work here. */}
    </div>
  )
}

export default HomeView
