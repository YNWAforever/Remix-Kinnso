'use client'

import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { TravelerTripsMessages } from '@/lib/i18n/messages/en'
import type { TravelerBookingRow } from '@/lib/bookings/types'

const STATUS_KEY: Record<TravelerBookingRow['status'], keyof TravelerTripsMessages> = {
  pending_payment: 'statusPendingPayment',
  confirmed: 'statusConfirmed',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
}

type TravelerTripsViewProps = {
  locale: Locale
  t: TravelerTripsMessages
  bookings: TravelerBookingRow[]
}

export function TravelerTripsView({ locale, t, bookings }: TravelerTripsViewProps) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.title}</h1>

      <div className="mt-6 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
        <div className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-3 text-xs font-bold uppercase text-kinnso-muted sm:grid-cols-[1fr_160px_80px_140px_140px]">
          <span>{t.colExperience}</span>
          <span>{t.colMerchant}</span>
          <span>{t.colQty}</span>
          <span>{t.colStatus}</span>
          <span>{t.colAmount}</span>
        </div>
        {bookings.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-kinnso-muted">{t.empty}</p>
          </div>
        ) : (
          bookings.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_160px_80px_140px_140px] sm:items-center"
            >
              <div>
                {b.experienceSlug === '' ? (
                  // experiences(...) is a nullable embed (no `!inner`) — the merchant may
                  // have since unpublished this experience, which experiences_public_read
                  // RLS hides from this same query. Render plain text instead of a link
                  // that would resolve to a 404.
                  <span className="font-bold text-kinnso-ink">{b.experienceTitle}</span>
                ) : (
                  <Link
                    href={`/${locale}/experiences/${b.experienceSlug}`}
                    className="font-bold text-kinnso-ink hover:text-kinnso-orangeDark"
                  >
                    {b.experienceTitle}
                  </Link>
                )}
                {/* bookingDate comes from experience_availability, whose RLS only exposes
                    rows where date >= current_date — so any past/completed trip will
                    always have a null bookingDate here regardless of whether the date
                    data exists historically. Fall back to createdAt so completed trips
                    still show *something* instead of a blank. */}
                <p className="mt-0.5 text-xs text-kinnso-muted">
                  {b.bookingDate
                    ? new Date(b.bookingDate).toLocaleDateString(locale)
                    : `${t.bookedOnLabel} ${new Date(b.createdAt).toLocaleDateString(locale)}`}
                </p>
              </div>
              <span className="text-sm text-kinnso-muted">{b.merchantName}</span>
              <span className="text-sm text-kinnso-muted">{b.qty}</span>
              <span className="text-sm text-kinnso-muted">{t[STATUS_KEY[b.status]]}</span>
              <span className="text-sm text-kinnso-muted">
                {b.currency} {b.totalAmount.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Saves tab: guide_saves ships in R6 — hidden/empty here on purpose, not faked (D-R3-5) */}
      <div className="mt-10 border-t border-kinnso-cream2 pt-6">
        <h2 className="k-section-title text-lg">{t.savesTabTitle}</h2>
        <p className="mt-2 text-sm text-kinnso-muted">{t.savesTabComingSoon}</p>
      </div>
    </main>
  )
}

export default TravelerTripsView
