import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { OfferClaimConfirmationView } from '@/components/kinnso/pages/OfferClaimConfirmationView'

export default async function OfferClaimConfirmationPage({
  params,
}: { params: Promise<{ locale: string; claimId: string }> }) {
  const { locale, claimId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) notFound()

  const cookieStore = await cookies()
  const rawToken = cookieStore.get(`offer-token-${claimId}`)?.value
  if (!rawToken) notFound()

  const { data: claim, error } = await supabase
    .from('offer_claims')
    .select('offer_id, merchant_offers(title, merchant_profiles(company_name)), visitor_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (error || !claim || claim.visitor_user_id !== gate.user.id) notFound()

  const messages = await getDictionary(loc)
  const offer = claim.merchant_offers as { title: string; merchant_profiles: { company_name: string } | null } | null

  return (
    <OfferClaimConfirmationView
      t={messages.offerClaim}
      offerTitle={offer?.title ?? ''}
      merchantName={offer?.merchant_profiles?.company_name ?? ''}
      rawToken={rawToken}
    />
  )
}
