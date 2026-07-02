import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'

// R1A designed placeholder. Noindexed and deliberately NOT in MARKETING_PATHS —
// the real destination-browse surface ships in R6 and flips this to indexable.
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return noindexMetadata(dict.destinationsSoon.title)
}

export default async function DestinationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = (await getDictionary(locale as Locale)).destinationsSoon
  return (
    <div className="bg-kinnso2-paper font-k2-sans">
      <SectionShell className="flex min-h-[60vh] items-center">
        <div className="max-w-2xl">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso2-ink md:text-6xl">{t.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-kinnso2-ink/70">{t.body}</p>
          <div className="mt-8 flex items-center gap-4">
            <Link href={`/${locale}/articles/destinations`} className="k2-btn-primary">{t.cta}</Link>
          </div>
        </div>
      </SectionShell>
    </div>
  )
}
