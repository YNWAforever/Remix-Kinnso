import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Ready to book?" — sibling to ArticleGuideLinks, same regions/tag_slugs heuristic
 *  (D-R3-7). Renders nothing without a match; first region with any match wins,
 *  same one-shot-then-stop shape as getGuidesForRegions (no merge across regions). */
export async function ArticleExperienceLinks({ locale, regions, t }: {
  locale: Locale; regions: string[]; t: Messages['article']
}) {
  let experiences: Awaited<ReturnType<typeof getExperiencesForCity>> = []
  for (const region of regions) {
    experiences = await getExperiencesForCity(region)
    if (experiences.length > 0) break
  }
  if (experiences.length === 0) return null
  return (
    <aside aria-labelledby="article-experience-links" className="k2-hairline mt-10 pt-8">
      <p className="k2-eyebrow">{t.experiencesNearbyEyebrow}</p>
      <h2 id="article-experience-links" className="k2-display mt-3 text-2xl font-semibold text-kinnso-ink">{t.experiencesNearbyHeading}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {experiences.map((exp) => (
          <ExperienceLinkCard key={exp.id} locale={locale} experience={exp} hrefQuery="src=article" />
        ))}
      </div>
    </aside>
  )
}
