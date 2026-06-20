import React from 'react'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { ReceiptRow, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorEarningItem, EarningsCurrencyTotal } from '@/lib/missions/earnings'

type StudioEarningsViewProps = {
  t: Messages['studioEarnings']
  totals: EarningsCurrencyTotal[]
  items: CreatorEarningItem[]
}

export function StudioEarningsView({ t, totals, items }: StudioEarningsViewProps) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {totals.map((total) => (
              <TicketCard key={total.currency} className="p-5">
                <p className="text-sm font-bold text-kinnso-ink">{total.currency}</p>
                <dl className="mt-3 space-y-1">
                  <ReceiptRow label={t.paid} value={total.paid.toLocaleString()} tone="positive" />
                  <ReceiptRow label={t.pending} value={total.pending.toLocaleString()} />
                </dl>
              </TicketCard>
            ))}
          </div>

          <TicketCard className="mt-8 overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-kinnso-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colMission}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colType}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colAmount}</th>
                  <th scope="col" className="py-2 pr-5 font-semibold">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && <tr aria-hidden="true"><td colSpan={4} className="p-0"><TicketDivider /></td></tr>}
                    <tr>
                      <td className="py-2 pr-4 pl-5 font-medium text-kinnso-ink">{item.missionTitle}</td>
                      <td className="py-2 pr-4 capitalize text-kinnso-muted">{item.missionType.replaceAll('_', ' ')}</td>
                      <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.amount.toLocaleString()}</td>
                      <td className="py-2 pr-5"><MissionStatusBadge status={item.payoutStatus === 'paid' ? t.paid : t.pending} /></td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </TicketCard>
        </>
      )}
    </main>
  )
}
