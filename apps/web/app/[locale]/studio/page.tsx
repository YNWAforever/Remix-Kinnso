import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { DnaSchema, type Dna, type Platform } from '@kinnso/scan'
import { buildStudioIdentity, type HandleRow } from '@/lib/studio/identity'
import { computeReadiness, REQUIRED_PLATFORMS } from '@/lib/studio/readiness'
import { listCreatorMerchantMissions, listAffiliateOffers, listCreatorSettlements } from '@/lib/missions/queries'
import { summarizeCreatorEarnings, toCreatorEarningItem, type CreatorSettlementRow } from '@/lib/missions/earnings'
import { StudioDashboardView, type OpportunityPreview } from '@/components/kinnso/pages/StudioDashboardView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type TitledRow = { id: string; title: string | null }

export default async function StudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role === 'merchant') redirect(`/${loc}/merchants/post`)
  if (role === 'ops') redirect(`/${loc}/ops/settlements`)

  // Active-creator gate. resolveViewerRole returns 'creator' for onboarding users
  // too, so status is the real check.
  const { data: creatorRow } = await supabase
    .from('creators')
    .select('display_name, status')
    .eq('id', user.id)
    .single()
  if (!creatorRow || creatorRow.status !== 'active') redirect(`/${loc}/creator`)

  // `final` is untrusted jsonb — an active creator should always have valid DNA,
  // but validate defensively and bounce to the wizard if not.
  const { data: dnaRow } = await supabase
    .from('creator_dna')
    .select('final, updated_at')
    .eq('creator_id', user.id)
    .single()
  const parsed = DnaSchema.safeParse(dnaRow?.final)
  if (!parsed.success) redirect(`/${loc}/creator`)
  const dna: Dna = parsed.data
  const updatedAt = (dnaRow?.updated_at as string | null) ?? new Date().toISOString()

  const [handleRes, guidesRes, activeJobRes, missionsRes, offersRes, settlementsRes] = await Promise.all([
    supabase.from('creator_social_handles').select('platform, handle, url').eq('creator_id', user.id),
    supabase.from('guides').select('id').eq('creator_id', user.id),
    supabase.from('creator_scan_jobs').select('id, status').eq('creator_id', user.id).in('status', ['queued', 'fetching', 'analyzing']).limit(1).maybeSingle(),
    listCreatorMerchantMissions(supabase),
    listAffiliateOffers(supabase),
    listCreatorSettlements(supabase),
  ])

  const handles: HandleRow[] = (handleRes.data ?? []).map((h) => ({
    platform: h.platform as Platform,
    handle: h.handle,
    url: h.url,
  }))
  const identity = buildStudioIdentity({ display_name: creatorRow.display_name }, handles, dna, updatedAt)
  const connected = new Set(handles.map((h) => h.platform))
  const missingPlatforms = REQUIRED_PLATFORMS.filter((p) => !connected.has(p))

  const readiness = computeReadiness({
    handles: handles.map((h) => ({ platform: h.platform })),
    guidesCount: (guidesRes.data ?? []).length,
    dnaUpdatedAtIso: updatedAt,
    now: new Date(),
  })

  const missions = (missionsRes.data ?? []) as unknown as TitledRow[]
  const offers = (offersRes.data ?? []) as unknown as TitledRow[]
  const opportunities: OpportunityPreview[] = [
    ...missions.map((m): OpportunityPreview => ({ id: m.id, title: m.title ?? '', kind: 'mission' })),
    ...offers.map((o): OpportunityPreview => ({ id: o.id, title: o.title ?? '', kind: 'offer' })),
  ]
    .filter((o) => o.title.length > 0)
    .slice(0, 3)

  const earnings = summarizeCreatorEarnings(
    ((settlementsRes.data ?? []) as unknown as CreatorSettlementRow[]).map(toCreatorEarningItem),
  )

  return (
    <StudioDashboardView
      locale={loc}
      t={messages.studioDashboard}
      studioHomeT={messages.studioHome}
      progressT={messages.onboarding.progressStep}
      creatorId={user.id}
      name={identity.name}
      dna={dna}
      lastScanned={updatedAt}
      readiness={readiness}
      opportunities={opportunities}
      earnings={earnings}
      platforms={handles.map((h) => h.platform)}
      missingPlatforms={missingPlatforms}
      activeJobId={activeJobRes.data?.id ?? null}
    />
  )
}
