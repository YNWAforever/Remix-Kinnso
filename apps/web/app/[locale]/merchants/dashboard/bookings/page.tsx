import { notFound, redirect } from 'next/navigation'
import { MerchantBookingsView } from '@/components/kinnso/pages/MerchantBookingsView'
import { getMerchantProfile } from '@/lib/missions/queries'
import { listMerchantBookings } from '@/lib/bookings/queries'
import { markBookingCompletedAction } from '@/lib/bookings/actions'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function MerchantBookingsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const { data: merchantProfile } = await getMerchantProfile(supabase, user.id)
  if (!merchantProfile) notFound()

  const bookings = await listMerchantBookings(supabase, merchantProfile.id)

  async function completeBooking(bookingId: string) {
    'use server'
    return markBookingCompletedAction(bookingId)
  }

  return (
    <MerchantBookingsView
      locale={loc}
      t={messages.merchantBookings}
      bookings={bookings}
      onComplete={completeBooking}
    />
  )
}
