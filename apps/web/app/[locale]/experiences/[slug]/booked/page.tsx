// apps/web/app/[locale]/experiences/[slug]/booked/page.tsx
import type { Metadata } from 'next'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getBookingByCheckoutSession } from '@/lib/experiences/booking-confirmation-queries'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { locale, slug } = await params
  const { session_id: sessionId } = await searchParams
  if (!isLocale(locale)) return null
  const messages = await getDictionary(locale as Locale)
  const t = messages.booking
  const refreshHref = `/${locale}/experiences/${slug}/booked${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`

  const booking = sessionId ? await getBookingByCheckoutSession(sessionId) : null

  if (!booking) {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.notFoundTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.notFoundBody}</p>
      </div>
    )
  }

  if (booking.status === 'pending_payment') {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.pendingTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.pendingBody}</p>
        <a
          href={refreshHref}
          className="mt-4 inline-block rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white"
        >
          {t.refreshCta}
        </a>
      </div>
    )
  }

  return (
    <div className="k2-container py-16 text-center">
      <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.confirmedTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.confirmedBody}</p>
      <div className="k2-card mx-auto mt-6 max-w-sm bg-kinnso-cream2 p-6 text-left">
        <p className="text-sm font-semibold text-kinnso-ink">{booking.experienceTitle}</p>
        <p className="mt-2 text-sm text-kinnso-ink/70">{t.summaryQtyLabel}: {booking.qty}</p>
        <p className="mt-1 text-sm text-kinnso-ink/70">{t.summaryTotalLabel}: {booking.currency} {booking.totalAmount.toLocaleString()}</p>
      </div>
    </div>
  )
}
