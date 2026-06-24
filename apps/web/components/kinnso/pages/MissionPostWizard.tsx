'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import type { Messages } from '@/lib/i18n/messages/en'
import type {
  MissionDraftInput,
  MissionType,
  MissionVisibility,
} from '@/lib/missions/types'
import { validateMissionDraft } from '@/lib/missions/validation'

interface Props {
  locale: string
  t: Messages['missions']
  onSubmit: (input: MissionDraftInput, opts: { publish: boolean }) => SubmitResult | Promise<SubmitResult>
}

type SubmitResult =
  | void
  | { ok: true; missionId?: string }
  | {
      ok: false
      errors?: Record<string, string[]>
    }

const fieldShell = 'grid gap-1 text-sm font-semibold text-kinnso-ink'
const inputShell =
  'rounded-lg bg-white px-3 py-2 text-sm font-medium text-kinnso-ink ring-1 ring-kinnso-cream2 focus:outline-none focus:ring-2 focus:ring-kinnso-orange'

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value))
const textOrNull = (value: string) => {
  const next = value.trim()
  return next === '' ? null : next
}

const isFailureResult = (result: SubmitResult): result is Extract<SubmitResult, { ok: false }> =>
  typeof result === 'object' && result !== null && 'ok' in result && result.ok === false

const firstActionError = (errors: Record<string, string[]> | undefined) =>
  Object.values(errors ?? {})
    .flat()
    .find((message) => message.trim().length > 0)

export function MissionPostWizard({ locale, t, onSubmit }: Props) {
  const [missionType, setMissionType] = useState<MissionType>('coupon_affiliate')
  const [visibility, setVisibility] = useState<MissionVisibility>('open')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponUrl, setCouponUrl] = useState('')
  const [affiliateCommissionRate, setAffiliateCommissionRate] = useState('10')
  const [kinnsoCommissionRate, setKinnsoCommissionRate] = useState('4')
  const [creatorCommissionRate, setCreatorCommissionRate] = useState('6')
  const [paidFeeAmount, setPaidFeeAmount] = useState('')
  const [paidFeeCurrency, setPaidFeeCurrency] = useState('HKD')
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [missionId, setMissionId] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const includesCoupon = missionType === 'coupon_affiliate' || missionType === 'hybrid'
  const includesPaid = missionType === 'paid' || missionType === 'hybrid'

  const buildInput = (): MissionDraftInput => ({
    missionSource: 'merchant',
    missionType,
    visibility,
    title,
    summary,
    couponCode: includesCoupon ? textOrNull(couponCode) : null,
    couponUrl: includesCoupon ? textOrNull(couponUrl) : null,
    affiliateCommissionRate: includesCoupon ? numberOrNull(affiliateCommissionRate) : null,
    kinnsoCommissionRate: includesCoupon ? numberOrNull(kinnsoCommissionRate) : null,
    creatorCommissionRate: includesCoupon ? numberOrNull(creatorCommissionRate) : null,
    paidFeeAmount: includesPaid ? numberOrNull(paidFeeAmount) : null,
    paidFeeCurrency: includesPaid ? textOrNull(paidFeeCurrency) : null,
    affiliateNetworkProgramId: null,
    milestones: includesPaid && milestoneTitle.trim() !== ''
      ? [{ title: milestoneTitle, description: milestoneDescription.trim() || milestoneTitle }]
      : [],
  })

  const submit = async (publish: boolean) => {
    if (submitted) return
    if (submittingRef.current) return
    const input = buildInput()
    const validation = validateMissionDraft(input)
    if (!validation.ok) {
      setError(t.validationError)
      return
    }

    setError('')
    submittingRef.current = true
    setSubmitting(true)
    try {
      const result = await onSubmit(input, { publish })
      if (isFailureResult(result)) {
        setError(firstActionError(result.errors) ?? t.validationError)
        return
      }
      if (result && typeof result === 'object' && 'missionId' in result && result.missionId) {
        setMissionId(result.missionId)
      }
      setSubmitted(true)
    } catch {
      setError(t.validationError)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="k-container py-10" lang={locale}>
        <div className="rounded-2xl border border-kinnso-cream2 bg-white p-8 shadow-kinnso">
          <h1 className="text-2xl font-black text-kinnso-ink">{t.postSuccessTitle}</h1>
          <p className="mt-2 text-kinnso-muted">{t.postSuccessBody}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {missionId && (
              <Link href={`/${locale}/merchants/missions/${missionId}`} className="k-btn-primary">
                {t.viewMission}
              </Link>
            )}
            <Link href={`/${locale}/merchants/missions`} className="k-btn-ghost">
              {t.backToQueue}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="k-container py-10" lang={locale}>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-black text-kinnso-ink">{t.postHeading}</h1>
        <p className="mt-1 text-sm text-kinnso-muted">{t.postSub}</p>
      </div>

      <form className="k-ticket mt-8 grid max-w-3xl gap-6 p-6" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="grid gap-3">
          <legend className="sr-only">{t.postHeading}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ['coupon_affiliate', t.typeCoupon],
              ['hybrid', t.typeHybrid],
              ['paid', t.typePaid],
            ].map(([value, label]) => (
              <label
                key={value}
                className={missionType === value ? 'k-btn-primary cursor-pointer' : 'k-btn-ghost cursor-pointer'}
              >
                <input
                  type="radio"
                  name="missionType"
                  value={value}
                  checked={missionType === value}
                  onChange={() => setMissionType(value as MissionType)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={fieldShell}>
          {t.title}
          <input className={inputShell} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className={fieldShell}>
          {t.summary}
          <textarea
            className={`${inputShell} min-h-24 resize-y`}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>

        <fieldset className="grid gap-3">
          <legend className="sr-only">{t.openMission}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ['open', t.openMission],
              ['targeted', t.targetedMission],
            ].map(([value, label]) => (
              <label
                key={value}
                className={visibility === value ? 'k-btn-primary cursor-pointer' : 'k-btn-ghost cursor-pointer'}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value as MissionVisibility)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {includesCoupon && (
          <section className="grid gap-3 rounded-lg bg-kinnso-cream px-4 py-4 sm:grid-cols-2">
            <label className={fieldShell}>
              {t.couponCode}
              <input className={inputShell} value={couponCode} onChange={(event) => setCouponCode(event.target.value)} />
            </label>
            <label className={fieldShell}>
              {t.couponUrl}
              <input className={inputShell} value={couponUrl} onChange={(event) => setCouponUrl(event.target.value)} />
            </label>
            <label className={fieldShell}>
              {t.affiliateCommissionRate}
              <input
                className={inputShell}
                inputMode="decimal"
                value={affiliateCommissionRate}
                onChange={(event) => setAffiliateCommissionRate(event.target.value)}
              />
            </label>
            <label className={fieldShell}>
              {t.kinnsoCommissionRate}
              <input
                className={inputShell}
                inputMode="decimal"
                value={kinnsoCommissionRate}
                onChange={(event) => setKinnsoCommissionRate(event.target.value)}
              />
            </label>
            <label className={fieldShell}>
              {t.creatorCommissionRate}
              <input
                className={inputShell}
                inputMode="decimal"
                value={creatorCommissionRate}
                onChange={(event) => setCreatorCommissionRate(event.target.value)}
              />
            </label>
          </section>
        )}

        {includesPaid && (
          <section className="grid gap-3 rounded-lg bg-kinnso-cream px-4 py-4 sm:grid-cols-2">
            <label className={fieldShell}>
              {t.paidFeeAmount}
              <input
                className={inputShell}
                inputMode="decimal"
                value={paidFeeAmount}
                onChange={(event) => setPaidFeeAmount(event.target.value)}
              />
            </label>
            <label className={fieldShell}>
              {t.paidFeeCurrency}
              <input className={inputShell} value={paidFeeCurrency} onChange={(event) => setPaidFeeCurrency(event.target.value)} />
            </label>
            <label className={fieldShell}>
              {t.milestoneTitle}
              <input className={inputShell} value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} />
            </label>
            <label className={fieldShell}>
              {t.milestoneDescription}
              <input className={inputShell} value={milestoneDescription} onChange={(event) => setMilestoneDescription(event.target.value)} />
            </label>
          </section>
        )}

        {error && <p className="text-sm font-semibold text-kinnso-red" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="k-btn-ghost disabled:opacity-50" disabled={submitting || submitted} onClick={() => void submit(false)}>{t.saveDraft}</button>
          <button type="button" className="k-btn-primary disabled:opacity-50" disabled={submitting || submitted} onClick={() => void submit(true)}>{t.publish}</button>
        </div>
      </form>
    </div>
  )
}
