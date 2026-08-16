'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import type { PayoutBatchRow } from '@/lib/admin/payout-batches-queries'
import type { CreatePayoutBatchInput, CancelPayoutBatchInput } from '@/lib/admin/payout-batches-actions'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

type T = Messages['creators']
type CreateFn = (locale: Locale, input: CreatePayoutBatchInput, reason: string) => Promise<ActionResult<{ batchId: string }>>
type MarkPaidFn = (locale: Locale, batchId: string, reason: string) => Promise<ActionResult<{ id: string }>>
type CancelFn = (locale: Locale, input: CancelPayoutBatchInput, reason: string) => Promise<ActionResult<{ id: string }>>

const money = (n: number) => n.toFixed(2)
const date = (iso: string) => new Date(iso).toLocaleDateString()

function statusLabel(t: T, s: PayoutBatchRow['status']): string {
  if (s === 'paid') return t.setPaid
  if (s === 'cancelled') return t.batchStatusCancelled
  return t.setPending
}

type PendingDialog =
  | { kind: 'create' }
  | { kind: 'paid'; batch: PayoutBatchRow }
  | { kind: 'cancel'; batch: PayoutBatchRow }
  | null

export function CreatorPayoutBatchesView({
  t, locale, batches, createAction, markPaidAction, cancelAction,
}: {
  t: T; locale: Locale; batches: PayoutBatchRow[]
  createAction: CreateFn; markPaidAction: MarkPaidFn; cancelAction: CancelFn
}) {
  const [dialog, setDialog] = useState<PendingDialog>(null)
  const [reason, setReason] = useState('')
  const [creatorId, setCreatorId] = useState('')
  const [currency, setCurrency] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (dialog) reasonRef.current?.focus() }, [dialog])

  const openCreate = () => { setDialog({ kind: 'create' }); setReason(''); setCreatorId(''); setCurrency(''); setAmount(''); setError(null) }
  const openPaid = (batch: PayoutBatchRow) => { setDialog({ kind: 'paid', batch }); setReason(''); setError(null) }
  const openCancel = (batch: PayoutBatchRow) => { setDialog({ kind: 'cancel', batch }); setReason(''); setError(null) }
  const close = () => { setDialog(null); setReason(''); setError(null) }

  const confirm = () => {
    if (!dialog) return
    if (!reason.trim()) { setError(t.reasonRequired); return }

    if (dialog.kind === 'create') {
      const parsedAmount = Number(amount)
      if (!creatorId.trim() || !currency.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setError(t.actionFailed)
        return
      }
      startTransition(async () => {
        const res = await createAction(locale, {
          creatorId: creatorId.trim(), currency: currency.trim(), amount: parsedAmount,
          idempotencyKey: crypto.randomUUID(),
        }, reason.trim())
        if (res.ok) close()
        else setError(res.errors.form?.[0] ?? t.actionFailed)
      })
      return
    }

    if (dialog.kind === 'paid') {
      startTransition(async () => {
        const res = await markPaidAction(locale, dialog.batch.id, reason.trim())
        if (res.ok) close()
        else setError(res.errors.form?.[0] ?? t.actionFailed)
      })
      return
    }

    startTransition(async () => {
      const res = await cancelAction(locale, { batchId: dialog.batch.id, idempotencyKey: crypto.randomUUID() }, reason.trim())
      if (res.ok) close()
      else setError(res.errors.form?.[0] ?? t.actionFailed)
    })
  }

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-lg font-black text-kinnso-ink">{t.batchesHeading}</h2>
      <p className="mb-4 text-sm text-kinnso-muted">{t.batchesSubtitle}</p>

      <button type="button" onClick={openCreate}
        className="mb-4 rounded-md bg-kinnso-orange px-3 py-1.5 text-sm font-bold text-white">
        {t.actCreateBatch}
      </button>

      {batches.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">{t.batchesEmpty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-kinnso-muted">
            <tr className="border-b border-kinnso-line">
              <th className="py-2 font-bold">{t.colCreatorId}</th>
              <th className="py-2 font-bold">{t.colCurrency}</th>
              <th className="py-2 font-bold">{t.colAmount}</th>
              <th className="py-2 font-bold">{t.colStatus}</th>
              <th className="py-2 font-bold">{t.colTargetDate}</th>
              <th className="py-2 font-bold">{t.colCreatedAt}</th>
              <th className="py-2 font-bold">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-kinnso-line/60 align-top">
                <td className="py-2 font-bold text-kinnso-ink">{b.creatorName ?? b.creatorId.slice(0, 8)}</td>
                <td className="py-2 text-kinnso-muted">{b.currency}</td>
                <td className="py-2 text-kinnso-muted">{money(b.amount)}</td>
                <td className="py-2 text-kinnso-muted">{statusLabel(t, b.status)}</td>
                <td className="py-2 text-kinnso-muted">{date(b.targetAt)}</td>
                <td className="py-2 text-kinnso-muted">{date(b.createdAt)}</td>
                <td className="py-2">
                  {b.status === 'pending' && (
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => openPaid(b)}
                        className="rounded-md bg-kinnso-orange px-2 py-1 text-xs font-bold text-white">{t.actMarkPaid}</button>
                      <button type="button" onClick={() => openCancel(b)}
                        className="rounded-md border border-kinnso-line px-2 py-1 text-xs font-bold text-kinnso-ink">{t.actCancelBatch}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true"
          aria-labelledby="batch-confirm-title" onKeyDown={(e) => { if (e.key === 'Escape') close() }}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <p id="batch-confirm-title" className="mb-3 text-sm font-bold text-kinnso-ink">
              {dialog.kind === 'create' && t.actCreateBatch}
              {dialog.kind === 'paid' && t.confirmMarkBatchPaid}
              {dialog.kind === 'cancel' && t.confirmCancelBatch}
            </p>
            {dialog.kind === 'create' && (
              <div className="mb-2 flex flex-col gap-2">
                <input value={creatorId} onChange={(e) => setCreatorId(e.target.value)} placeholder={t.formCreatorId}
                  aria-label={t.formCreatorId} className="rounded-md border border-kinnso-line p-2 text-sm" />
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder={t.formCurrency}
                  aria-label={t.formCurrency} className="rounded-md border border-kinnso-line p-2 text-sm" />
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.formAmount}
                  aria-label={t.formAmount} inputMode="decimal" className="rounded-md border border-kinnso-line p-2 text-sm" />
              </div>
            )}
            <textarea ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder}
              aria-label={t.reasonPlaceholder}
              className="mb-2 w-full rounded-md border border-kinnso-line p-2 text-sm" rows={3} />
            {error && <p className="mb-2 text-xs font-bold text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} disabled={isPending}
                className="rounded-md border border-kinnso-line px-3 py-1 text-sm font-bold text-kinnso-ink">{t.actCancel}</button>
              <button type="button" onClick={confirm} disabled={isPending || !reason.trim()}
                className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50">{t.actApply}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreatorPayoutBatchesView
