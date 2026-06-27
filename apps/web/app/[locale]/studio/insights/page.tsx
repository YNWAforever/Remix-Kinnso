import { redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getCreatorInsights } from '@/lib/insights/creator'
import { CreatorInsightsView } from '@/components/kinnso/pages/CreatorInsightsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioInsightsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc: Locale = isLocale(locale) ? (locale as Locale) : 'en'

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'creator') redirect(`/${loc}/studio`)

  const messages = await getDictionary(loc)
  const data = await getCreatorInsights(supabase)
  return <CreatorInsightsView t={messages.insights} data={data} />
}
