'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
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
  onUpdate: (settlementId: string, status: 'paid') => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function OpsSettlementView({ t, settlements, onUpdate }: OpsSettlementViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const runUpdate = async (settlementId: string) => {
    setActionError(null)
    setIsPending(true)
    try {
      const result = await onUpdate(settlementId, 'paid')
      setActionError(actionErrorMessage(result))
      if (actionSucceeded(result)) router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.settlementHeading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.settlementSub}</p>
      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

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
              <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runUpdate(settlement.id)}>
                {t.markPaid}
              </button>
            )}
          </article>
        ))}
      </div>
    </main>
  )
}
