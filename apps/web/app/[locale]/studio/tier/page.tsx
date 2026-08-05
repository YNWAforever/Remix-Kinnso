import { redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getCreatorContribution, listContributionEvents } from '@/lib/contribution/queries'
import { countGatedMissionsByTier } from '@/lib/missions/queries'
import { listActivePerks } from '@/lib/perks/queries'
import { nextTierUnlocks } from '@/lib/perks/next-tier'
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

  const [contribution, events, gatedCounts, perks] = await Promise.all([
    getCreatorContribution(supabase, user.id),
    listContributionEvents(supabase, user.id),
    countGatedMissionsByTier(supabase),
    // The tier numbers are true without the catalog, so an unreachable RPC costs
    // the panel, not the page. `listActivePerks` throws by design; this is the one
    // caller for which the perk list is decoration rather than the subject.
    listActivePerks(supabase).catch(() => null),
  ])

  // `null` = catalog unreadable, render no panel. `{ unlocks: null }` = the creator
  // is at the top of the ladder, which the panel states.
  const nextUnlocks = perks === null ? null : { unlocks: nextTierUnlocks(contribution, perks) }

  return (
    <StudioTierView
      t={messages.tier}
      contribution={contribution}
      events={events}
      gatedCounts={gatedCounts}
      nextUnlocks={nextUnlocks}
    />
  )
}
