import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
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
              <div key={total.currency} className="k-card p-5">
                <p className="text-sm font-bold text-kinnso-ink">{total.currency}</p>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-kinnso-muted">{t.paid}</dt>
                    <dd className="font-semibold tabular-nums text-kinnso-ink">{total.paid.toLocaleString()}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-kinnso-muted">{t.pending}</dt>
                    <dd className="font-semibold tabular-nums text-kinnso-ink">{total.pending.toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-kinnso-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colMission}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colType}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colAmount}</th>
                  <th scope="col" className="py-2 font-semibold">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-kinnso-cream2">
                    <td className="py-2 pr-4 font-medium text-kinnso-ink">{item.missionTitle}</td>
                    <td className="py-2 pr-4 capitalize text-kinnso-muted">{item.missionType.replaceAll('_', ' ')}</td>
                    <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.amount.toLocaleString()}</td>
                    <td className="py-2"><MissionStatusBadge status={item.payoutStatus === 'paid' ? t.paid : t.pending} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
