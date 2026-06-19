'use client'

import { useRef, useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { GuideInput } from '@/lib/guides/types'
import { validateGuideInput } from '@/lib/guides/validation'

type SubmitResult = void | { ok: true } | { ok: false; errors?: Record<string, string[]> }

interface Props {
  t: Messages['studioGuides']
  mode: 'new' | 'edit'
  initial?: GuideInput
  onSubmit: (input: GuideInput, opts: { publish: boolean }) => SubmitResult | Promise<SubmitResult>
}

const FIELD_ERROR_KEYS: Record<string, keyof Messages['studioGuides']> = {
  title: 'errorTitleRequired',
  summary: 'errorSummaryRequired',
  city: 'errorCityRequired',
  coverUrl: 'errorCoverRequired',
}

export function GuideForm({ t, mode, initial, onSubmit }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const messageForErrors = (errors: Record<string, string[]>): string => {
    for (const field of ['title', 'summary', 'city', 'coverUrl']) {
      const codes = errors[field]
      if (!codes?.length) continue
      if (field === 'coverUrl' && codes.includes('invalid_url')) return t.errorCoverInvalid
      return t[FIELD_ERROR_KEYS[field]]
    }
    return t.errorGeneric
  }

  const submit = async (publish: boolean) => {
    if (submittingRef.current) return
    const input: GuideInput = { title, city, coverUrl, summary }
    const validation = validateGuideInput(input)
    if (!validation.ok) {
      setError(messageForErrors(validation.errors))
      return
    }
    setError('')
    submittingRef.current = true
    setSubmitting(true)
    try {
      const result = await onSubmit(input, { publish })
      if (result && result.ok === false) {
        setError(result.errors ? messageForErrors(result.errors) : t.errorGeneric)
      }
    } catch {
      setError(t.errorGeneric)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <main>
      <section className="k-container max-w-2xl py-12">
        <h1 className="text-3xl font-black tracking-tight text-kinnso-ink md:text-4xl">
          {mode === 'new' ? t.formNewHeading : t.formEditHeading}
        </h1>

        <div className="mt-8 grid gap-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.titleLabel}</span>
            <input
              className="k-input"
              value={title}
              placeholder={t.titlePlaceholder}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.cityLabel}</span>
            <input
              className="k-input"
              value={city}
              placeholder={t.cityPlaceholder}
              onChange={(e) => setCity(e.target.value)}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.coverLabel}</span>
            <input
              className="k-input"
              value={coverUrl}
              placeholder={t.coverPlaceholder}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
          </label>
          {coverUrl.trim() !== '' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt={t.coverPreviewAlt} className="aspect-[4/3] w-full rounded-lg object-cover" />
          )}

          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.summaryLabel}</span>
            <textarea
              className="k-input min-h-[120px]"
              value={summary}
              placeholder={t.summaryPlaceholder}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>

          {error && (
            <p className="text-sm font-semibold text-kinnso-red" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="k-btn-ghost disabled:opacity-50"
              disabled={submitting}
              onClick={() => void submit(false)}
            >
              {submitting ? t.saving : t.saveDraft}
            </button>
            <button
              type="button"
              className="k-btn-primary disabled:opacity-50"
              disabled={submitting}
              onClick={() => void submit(true)}
            >
              {submitting ? t.saving : t.publish}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default GuideForm
