import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import type { Destination } from '@/lib/destinations/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function DestinationsIndexView({
  locale, t, destinations,
}: {
  locale: Locale
  t: Messages['destinations']
  destinations: Destination[]
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        {destinations.length === 0 ? (
          <p className="text-kinnso-ink/70">{t.empty}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {destinations.map((d) => (
              <Link key={d.slug} href={`/${locale}/destinations/${d.slug}`} className="group">
                <EditorialCard
                  media={d.heroImageUrl ? (
                    <img src={d.heroImageUrl} alt={d.name} width={640} height={480} loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  ) : undefined}
                  title={d.name}
                >
                  {d.description}
                </EditorialCard>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  )
}

export default DestinationsIndexView
