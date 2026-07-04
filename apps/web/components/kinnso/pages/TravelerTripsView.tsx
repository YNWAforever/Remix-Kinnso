'use client'

import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { TravelerBookingRow } from '@/lib/bookings/types'

export interface TravelerTripsMessages {
  title: string
  empty: string
  colExperience: string
  colMerchant: string
  colStatus: string
  colAmount: string
  statusPendingPayment: string
  statusConfirmed: string
  statusCompleted: string
  statusCancelled: string
  statusRefunded: string
  savesTabTitle: string
  savesTabComingSoon: string
}

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
        <div className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-3 text-xs font-bold uppercase text-kinnso-muted sm:grid-cols-[1fr_160px_140px_140px]">
          <span>{t.colExperience}</span>
          <span>{t.colMerchant}</span>
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
              className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_160px_140px_140px] sm:items-center"
            >
              <Link
                href={`/${locale}/experiences/${b.experienceSlug}`}
                className="font-bold text-kinnso-ink hover:text-kinnso-orangeDark"
              >
                {b.experienceTitle}
              </Link>
              <span className="text-sm text-kinnso-muted">{b.merchantName}</span>
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
