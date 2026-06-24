import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import { getCreatorByHandle } from '@/lib/creators/queries'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const creator = await getCreatorByHandle(handle)
  if (!creator) return { title: 'Creator not found · KINNSO' }
  return {
    title: `${creator.name} (@${creator.handle}) · KINNSO`,
    description: creator.bio || `Travel creator @${creator.handle} on KINNSO.`,
  }
}

/**
 * /[locale]/c/[handle] — real public creator profile (no gate).
 * Reads the public projection on `creators` via the anon client (public-read
 * RLS scopes to active + published). Renders qualitative DNA + platform
 * presence + published guides only — no private DNA, no fabricated metrics.
 */
export default async function CreatorPublicPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}) {
  const { locale, handle } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const creator = await getCreatorByHandle(handle)
  if (!creator) notFound()
  return <CreatorProfileView creator={creator} locale={locale as Locale} t={messages.creatorProfile} />
}
