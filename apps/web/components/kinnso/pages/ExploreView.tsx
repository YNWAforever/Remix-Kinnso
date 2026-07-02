import GuideCard from '@/components/kinnso/GuideCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Guide } from '@/lib/guides/types'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExploreView({ locale, t, guides }: { locale: Locale; t: Messages['explore']; guides: Guide[] }) {
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell>
        <Eyebrow>{t.pill}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.heading}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
        <h2 className="sr-only">{t.gridHeading}</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g) => <GuideCard key={g.slug} g={g} locale={locale} savesLabel={t.savesLabel} />)}
        </div>
        <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>
      </SectionShell>
    </main>
  )
}

export default ExploreView
