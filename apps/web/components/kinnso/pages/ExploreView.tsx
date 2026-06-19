import GuideCard from '@/components/kinnso/GuideCard'
import { guides } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExploreView({ locale, t }: { locale: Locale; t: Messages['explore'] }) {
  return (
    <main>
      <section className="k-container py-12">
        <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.pill}</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.heading}</h1>
        <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.subtitle}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g) => (
            <GuideCard key={g.slug} g={g} locale={locale} />
          ))}
        </div>
        <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>
      </section>
    </main>
  )
}

export default ExploreView
