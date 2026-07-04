import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import type { PublicMerchant } from '@/lib/merchants/public-queries'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function PublicMerchantProfileView({ locale, t, merchant, experiences }: {
  locale: Locale; t: Messages['merchantProfile']; merchant: PublicMerchant; experiences: PublicExperience[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        {merchant.city ? <Eyebrow>{merchant.city}</Eyebrow> : null}
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-5xl">{merchant.companyName}</h1>
        {merchant.tagline ? <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/70">{merchant.tagline}</p> : null}
        {merchant.websiteUrl ? (
          <Link href={merchant.websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block font-semibold text-kinnso-orangeDark hover:underline">
            {t.websiteLabel} →
          </Link>
        ) : null}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.experiencesHeading}</h2>
        {experiences.length === 0 ? (
          <p className="mt-4 text-kinnso-muted">{t.experiencesEmpty}</p>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {experiences.map((exp) => (
              <Link key={exp.id} href={p(`/experiences/${exp.slug}`)} className="k2-card block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
                <h3 className="k2-display text-lg font-semibold text-kinnso-ink">{exp.title}</h3>
                <p className="mt-2 text-sm text-kinnso-ink/70">{exp.city} · {exp.currency} {exp.priceAmount.toLocaleString()}</p>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <p className="text-kinnso-ink/70">{t.workWithCreatorsNote}</p>
        <Link href={p('/for-creators')} className="mt-4 inline-block font-semibold text-kinnso-orangeDark hover:underline">{t.workWithCreatorsCta}</Link>
      </SectionShell>
    </main>
  )
}

export default PublicMerchantProfileView
