'use client'
import { useState } from 'react'
import { joinAgentWaitlistAction } from '@/lib/agent/waitlist-actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AgentWaitlistForm({ locale, t }: { locale: Locale; t: Messages['agent'] }) {
  const [email, setEmail] = useState('')
  const [hp, setHp] = useState('') // honeypot — humans never see or fill it
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<'idle' | 'done' | 'invalid' | 'failed'>('idle')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await joinAgentWaitlistAction(locale, email, hp)
      setState(res.ok ? 'done' : res.error)
    } catch {
      setState('failed')
    } finally {
      setPending(false)
    }
  }

  if (state === 'done') {
    return <p aria-live="polite" className="text-kinnso-amber">{t.successNote}</p>
  }
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <input
        type="text"
        name="website"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <label className="flex-1">
        <span className="sr-only">{t.emailLabel}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder}
          autoComplete="email"
          className="min-h-[44px] w-full rounded-[3px] border border-kinnso-cream/30 bg-white/10 px-4 py-2.5 text-sm text-kinnso-cream placeholder:text-kinnso-cream/50 outline-none transition focus-visible:border-kinnso-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
        />
      </label>
      <button type="submit" disabled={pending} className="k2-btn-primary disabled:opacity-60">
        {t.submitCta}
      </button>
      <p aria-live="polite" role="status" className="basis-full text-sm text-kinnso-amber">
        {state === 'invalid' ? t.errorInvalid : state === 'failed' ? t.errorGeneric : ''}
      </p>
    </form>
  )
}
