import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** Guides have no reverse cross-link today (D-R3-7) — this is a wholly new slot,
 *  keyed on the guide's own city. The CTA carries this guide's slug through the
 *  query string so the eventual booking can attribute back to its creator
 *  (re-resolved server-side in createCheckoutSessionAction — see D-R3C-3). */
export async function GuideExperienceLinks({ locale, city, guideSlug, t }: {
  locale: Locale; city: string; guideSlug: string; t: Messages['article']
}) {
  const experiences = await getExperiencesForCity(city)
  if (experiences.length === 0) return null
  return (
    <div className="mt-6 rounded-lg bg-white p-6">
      <p className="k2-eyebrow">{t.experiencesNearbyEyebrow}</p>
      <h2 className="k2-display mt-3 text-lg font-semibold text-kinnso-ink">{t.experiencesNearbyHeading}</h2>
      <div className="mt-5 grid gap-4">
        {experiences.map((exp) => (
          <ExperienceLinkCard key={exp.id} locale={locale} experience={exp} hrefQuery={`src=guide&guideSlug=${guideSlug}`} />
        ))}
      </div>
    </div>
  )
}
