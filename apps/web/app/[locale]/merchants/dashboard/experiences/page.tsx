import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { listMyExperiences } from '@/lib/experiences/queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantExperiencesView } from '@/components/kinnso/pages/MerchantExperiencesView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantExperiencesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const { data: profile } = await supabase
    .from('merchant_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!profile) notFound()
  const experiences = await listMyExperiences(supabase, profile.id as string)
  const messages = await getDictionary(loc)
  return <MerchantExperiencesView locale={loc} t={messages.merchantDashboard} experiences={experiences} />
}
