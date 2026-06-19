import Link from 'next/link'
import { Bookmark, MapPin } from 'lucide-react'
import type { Guide } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

function avatarInitial(handle: string) {
  return handle.replace(/^@/, '').charAt(0).toUpperCase() || '?'
}

export function FeedView({ locale, t, items }: { locale: Locale; t: Messages['feed']; items: Guide[] }) {
  return (
    <main>
      <section className="k-container py-12">
        <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.pill}</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.heading}</h1>
        <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.subtitle}</p>
        {items.length === 0 ? (
          <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
        ) : (
          <div className="mx-auto mt-10 grid max-w-2xl gap-6">
            {items.map((g) => (
              <Link key={g.slug} href={`/${locale}/g/${g.slug}`} className="group block">
                <article className="k-card overflow-hidden">
                  <div className="aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url('${g.cover}')` }} />
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-kinnso-cream2 text-sm font-bold text-kinnso-ink">
                        {avatarInitial(g.creatorHandle)}
                      </span>
                      <p className="text-sm font-bold text-kinnso-ink">@{g.creatorHandle}</p>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-kinnso-ink">{g.title}</p>
                    <div className="mt-2 flex items-center gap-4 text-sm text-kinnso-muted">
                      {g.city && (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{g.city}</span>
                      )}
                      <span className="inline-flex items-center gap-1"><Bookmark className="h-4 w-4" />{g.saves.toLocaleString()} {t.savesLabel}</span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default FeedView
