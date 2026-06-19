import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Bookmark, MapPin } from 'lucide-react'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getCreator, guides } from '@/lib/creator-mock'
import { getGuideBySlug } from '@/lib/guides/queries'

export function generateStaticParams() {
  // Seed (mock) guides stay statically prerendered; real guides resolve on
  // demand (dynamicParams defaults to true).
  return LOCALES.flatMap((locale) => guides.map((guide) => ({ locale, slug: guide.slug })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const guide = await getGuideBySlug(slug)
  if (!guide) return { title: 'Guide not found | KINNSO' }
  const authorName = guide.creatorName ?? getCreator(guide.creatorHandle)?.name ?? `@${guide.creatorHandle}`
  return {
    title: `${guide.title} | KINNSO`,
    description: `${guide.city} guide by ${authorName}. ${guide.saves.toLocaleString()} saves.`,
  }
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const guide = await getGuideBySlug(slug)
  if (!guide) notFound()

  const messages = await getDictionary(locale as Locale)
  const mockCreator = guide.source === 'mock' ? getCreator(guide.creatorHandle) : null
  const authorName = guide.creatorName ?? mockCreator?.name ?? guide.creatorHandle

  return (
    <article className="k-container py-8 md:py-12">
      <section className="overflow-hidden rounded-xl bg-white shadow-kinnso">
        <div
          aria-label={guide.title}
          className="relative min-h-[360px] bg-cover bg-center"
          role="img"
          style={{
            backgroundImage: `linear-gradient(180deg, rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.68)), url("${encodeURI(guide.cover)}")`,
          }}
        >
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <span className="k-pill bg-white/15 text-white backdrop-blur">{messages.creatorProfile.latestGuides}</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight md:text-5xl">{guide.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/90">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {guide.city}
              </span>
              <span className="inline-flex items-center gap-1">
                <Bookmark className="h-4 w-4" />
                {guide.saves.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-white p-6">
          <h2 className="text-base font-bold text-kinnso-ink">{messages.creatorProfile.destinationsCovered}</h2>
          <p className="mt-2 text-sm text-kinnso-muted">{guide.summary ?? guide.city}</p>
          <Link href={`/${locale}/feed`} className="k-btn-ghost mt-5 inline-flex text-sm">
            {messages.creatorProfile.viewAllGuides}
          </Link>
        </div>

        <aside className="rounded-lg bg-kinnso-cream2 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{messages.article.by}</p>
          <div className="mt-3">
            <div className="text-lg font-black text-kinnso-ink">{authorName}</div>
            {guide.source === 'mock' ? (
              <Link
                href={`/${locale}/c/${guide.creatorHandle}`}
                className="k-mono mt-1 inline-flex text-sm text-kinnso-orange hover:text-kinnso-orangeDark"
              >
                @{guide.creatorHandle}
              </Link>
            ) : (
              // Real-creator public profiles (/c/[handle]) are out of scope this
              // slice — render the handle as text to avoid a dead link.
              <span className="k-mono mt-1 inline-flex text-sm text-kinnso-muted">@{guide.creatorHandle}</span>
            )}
          </div>
        </aside>
      </section>
    </article>
  )
}
