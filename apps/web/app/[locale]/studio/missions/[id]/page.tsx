import { notFound, redirect } from 'next/navigation'
import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { joinMissionAction } from '@/lib/missions/actions'
import { toCreatorMissionDetail, type MissionDetailRow } from '@/lib/missions/detail'
import { getCreatorMissionDetail } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string; id: string }>

export default async function StudioMissionDetailPage({ params }: { params: Params }) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') notFound()

  const { data } = await getCreatorMissionDetail(supabase, id)
  if (!data) notFound()

  const mission = toCreatorMissionDetail(data as unknown as MissionDetailRow, user.id)

  async function join() {
    'use server'
    return joinMissionAction({ missionId: id, locale: loc })
  }

  async function apply(note: string) {
    'use server'
    return joinMissionAction({ missionId: id, applicationNote: note, locale: loc })
  }

  return (
    <CreatorMissionDetailView locale={loc} t={messages.missionDetail} mission={mission} onJoin={join} onApply={apply} />
  )
}
