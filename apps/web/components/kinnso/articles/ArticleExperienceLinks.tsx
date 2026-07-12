import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity, getExperienceOverridesForArticle } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Ready to book?" — sibling to ArticleGuideLinks, same regions heuristic (D-R3-7).
 *  Editorial overrides (D-R6C-1) are shown first, heuristic matches (first region with
 *  any match wins, no merge across regions) fill any remaining slots, deduped against the
 *  pinned set. Renders nothing without a match. */
export async function ArticleExperienceLinks({ locale, regions, articleId, t }: {
  locale: Locale; regions: string[]; articleId: string; t: Messages['article']
}) {
  let heuristic: Awaited<ReturnType<typeof getExperiencesForCity>> = []
  for (const region of regions) {
    heuristic = await getExperiencesForCity(region)
    if (heuristic.length > 0) break
  }
  const pinned = await getExperienceOverridesForArticle(articleId)
  const pinnedIds = new Set(pinned.map((e) => e.id))
  const experiences = [...pinned, ...heuristic.filter((e) => !pinnedIds.has(e.id))].slice(0, 3)
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
