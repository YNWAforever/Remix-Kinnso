'use client'

import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import type { Messages } from '@/lib/i18n/messages/en'

export type OpsSettlementRow = {
  id: string
  missionTitle: string
  status: string
  creatorPayoutStatus: string
  kinnsoCommissionStatus: string
}

type OpsSettlementViewProps = {
  t: Messages['ops']
  settlements: OpsSettlementRow[]
  onUpdate: (settlementId: string, status: 'paid') => void | Promise<void>
}

export function OpsSettlementView({ t, settlements, onUpdate }: OpsSettlementViewProps) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.settlementHeading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.settlementSub}</p>

      <div className="mt-6 divide-y divide-kinnso-cream2 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
        {settlements.map((settlement) => (
          <article key={settlement.id} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[1fr_220px_auto] sm:items-center">
            <div>
              <h2 className="font-bold text-kinnso-ink">{settlement.missionTitle}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <MissionStatusBadge status={settlement.status} />
                <span className="text-sm text-kinnso-muted">
                  Creator: {settlement.creatorPayoutStatus} / KINNSO: {settlement.kinnsoCommissionStatus}
                </span>
              </div>
            </div>
            <p className="text-sm font-semibold text-kinnso-muted">
              {settlement.status === 'paid' ? t.statusPaid : t.statusPending}
            </p>
            {settlement.status !== 'paid' && (
              <button type="button" className="k-btn-primary text-sm" onClick={() => void onUpdate(settlement.id, 'paid')}>
                {t.markPaid}
              </button>
            )}
          </article>
        ))}
      </div>
    </main>
  )
}
