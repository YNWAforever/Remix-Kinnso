import { Bookmark, MapPin } from 'lucide-react'
import { feedItems } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function FeedView({ t }: { locale: Locale; t: Messages['feed'] }) {
  return (
    <main>
      <section className="k-container py-12">
        <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.pill}</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.heading}</h1>
        <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.subtitle}</p>
        <div className="mx-auto mt-10 grid max-w-2xl gap-6">
          {feedItems.map((f) => (
            <article key={f.id} className="k-card overflow-hidden">
              <div className="aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url('${f.image}')` }} />
              <div className="p-5">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.avatar} alt={f.creatorName} className="h-9 w-9 rounded-full object-cover" />
                  <div className="text-sm">
                    <p className="font-bold text-kinnso-ink">{f.creatorName}</p>
                    <p className="text-kinnso-muted"><span>{f.creatorHandle}</span> · {f.postedAgo}</p>
                  </div>
                </div>
                <p className="mt-3 text-lg font-semibold text-kinnso-ink">{f.caption}</p>
                <div className="mt-2 flex items-center gap-4 text-sm text-kinnso-muted">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{f.city}</span>
                  <span className="inline-flex items-center gap-1"><Bookmark className="h-4 w-4" />{f.saves.toLocaleString()} {t.savesLabel}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default FeedView
