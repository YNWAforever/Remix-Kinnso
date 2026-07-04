import { notFound } from 'next/navigation'
import { AdminBookingsView } from '@/components/kinnso/admin/bookings/AdminBookingsView'
import { requireOpsPage } from '@/lib/admin/guard'
import { adminSetBookingSettlementStatusAction } from '@/lib/bookings/actions'
import { listOpsBookingSettlements } from '@/lib/bookings/queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminBookingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)

  const settlements = await listOpsBookingSettlements(supabase)

  async function onMarkPaid(settlementId: string, reason: string) {
    'use server'
    return adminSetBookingSettlementStatusAction({
      settlementId,
      merchantPayoutStatus: 'paid',
      kinnsoCommissionStatus: 'paid',
      creatorCommissionStatus: 'paid',
      reason,
    })
  }

  return (
    <AdminBookingsView
      locale={loc}
      t={messages.bookingsOps}
      settlements={settlements}
      onMarkPaid={onMarkPaid}
    />
  )
}
