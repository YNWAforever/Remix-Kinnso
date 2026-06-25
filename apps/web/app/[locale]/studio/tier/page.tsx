import { redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getCreatorContribution, listContributionEvents } from '@/lib/contribution/queries'
import { StudioTierView } from '@/components/kinnso/pages/StudioTierView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioTierPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc: Locale = isLocale(locale) ? (locale as Locale) : 'en'
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') redirect(`/${loc}/studio`)

  const [contribution, events] = await Promise.all([
    getCreatorContribution(supabase, user.id),
    listContributionEvents(supabase, user.id),
  ])

  return <StudioTierView t={messages.tier} contribution={contribution} events={events} />
}
