import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import { getCreator, tierMeta } from '@/lib/creator-mock'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const creator = getCreator(handle)
  if (!creator) return { title: 'Creator not found · KINNSO' }
  return {
    title: `${creator.name} (@${creator.handle}) — Travel Creator · DNA ${creator.score} | KINNSO`,
    description: `${creator.category} travel creator based in ${creator.homeCity}. ${creator.countries} countries · ${creator.guides} Guides. DNA Score ${creator.score}, ${tierMeta[creator.tier].label} tier.`,
  }
}

/**
 * /[locale]/c/[handle] — public creator profile (no gate).
 *
 * Mock-by-handle this slice: a real public read needs a handle/slug column +
 * public-read RLS on `creators` (deferred). Viewer role is resolved from the
 * real Supabase session (anon by default) to drive the BrandContactCard CTA.
 */
export default async function CreatorPublicPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}) {
  const { locale, handle } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const creator = getCreator(handle)
  if (!creator) notFound()

  const supabase = await createSupabaseServerClient()
  const role = await resolveViewerRole(supabase)

  return (
    <CreatorProfileView creator={creator} role={role} locale={locale as Locale} t={messages.creatorProfile} />
  )
}
