import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMyMerchantProfile } from '@/lib/merchants/profile-queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantProfileView } from '@/components/kinnso/pages/MerchantProfileView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const profile = await getMyMerchantProfile(supabase, user.id)
  if (!profile) notFound()
  const messages = await getDictionary(loc)
  return <MerchantProfileView locale={loc} t={messages.merchantDashboard} profile={profile} />
}
