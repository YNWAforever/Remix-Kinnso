// apps/web/components/kinnso/pages/DestinationDetailView.tsx
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import GuideCard from '@/components/kinnso/GuideCard'
import SessionCard from '@/components/kinnso/SessionCard'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function DestinationDetailView({
  locale, t, destination, guides, sessions, savesLabel,
}: {
  locale: Locale
  t: Messages['destinations']
  destination: Destination
  guides: Guide[]
  sessions: PublicSession[]
  savesLabel: string
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div className="w-full">
          {destination.heroImageUrl ? (
            <img
              src={destination.heroImageUrl}
              alt={destination.name}
              width={1200}
              height={500}
              className="mb-8 aspect-[21/9] w-full rounded-[4px] object-cover"
            />
          ) : null}
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{destination.name}</h1>
          {destination.description ? (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{destination.description}</p>
          ) : null}
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.guidesHeading}</h2>
        {guides.length === 0 ? (
          <p className="mt-6 text-kinnso-ink/70">{t.emptyGuides}</p>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {guides.map((g) => <GuideCard key={g.slug} g={g} locale={locale} savesLabel={savesLabel} />)}
          </div>
        )}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.sessionsHeading}</h2>
        {sessions.length === 0 ? (
          <p className="mt-6 text-kinnso-ink/70">{t.emptySessions}</p>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {sessions.map((s) => <SessionCard key={s.id} locale={locale} session={s} />)}
          </div>
        )}
      </SectionShell>
    </div>
  )
}

export default DestinationDetailView
