import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantDashboardHomeView } from '@/components/kinnso/pages/MerchantDashboardHomeView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantDashboardHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const messages = await getDictionary(loc)
  return <MerchantDashboardHomeView locale={loc} t={messages.merchantDashboard} />
}
