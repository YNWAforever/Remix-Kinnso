import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMyExperience } from '@/lib/experiences/queries'
import { listExperienceAvailability } from '@/lib/experiences/availability-queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantAvailabilityView } from '@/components/kinnso/pages/MerchantAvailabilityView'

export const metadata: Metadata = noindexMetadata()

export default async function ExperienceAvailabilityPage({ params }: {
  params: Promise<{ locale: string; experienceId: string }>
}) {
  const { locale, experienceId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const { data: profile } = await supabase
    .from('merchant_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!profile) notFound()
  const experience = await getMyExperience(supabase, profile.id as string, experienceId)
  if (!experience) notFound()
  const availability = await listExperienceAvailability(supabase, experienceId)
  const messages = await getDictionary(loc)
  return (
    <MerchantAvailabilityView
      locale={loc}
      t={messages.merchantDashboard}
      experienceId={experienceId}
      experienceTitle={experience.title}
      availability={availability}
    />
  )
}
