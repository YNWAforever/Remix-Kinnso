import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { StudioScanView } from '@/components/kinnso/pages/StudioScanView'
import { getCreator, computeBreakdown, sampleDna } from '@/lib/creator-mock'
import type { Dna } from '@kinnso/scan'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

/**
 * /[locale]/studio/scan — Studio Scan + DNA report (ungated this slice).
 *
 * DNA core is the real `creator_dna.final` for a logged-in creator, else a
 * mock `Dna`. The rich metrics (score/tier/posts/places/map) are the mock
 * overlay keyed by handle until the data/scoring slices land.
 */
export default async function StudioScanPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Real DNA core when the viewer is a logged-in creator with a published DNA.
  let dna: Dna = sampleDna
  if (user) {
    const { data: dnaRow } = await supabase
      .from('creator_dna')
      .select('final')
      .eq('creator_id', user.id)
      .single()
    if (dnaRow?.final) dna = dnaRow.final as Dna
  }

  // Metrics overlay (mock). Demo creator until real metrics tables exist.
  const creator = getCreator('maywanders')!
  const breakdown = computeBreakdown(creator)

  return (
    <StudioScanView
      creator={creator}
      dna={dna}
      breakdown={breakdown}
      t={messages.studio}
    />
  )
}
