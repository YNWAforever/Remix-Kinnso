import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * Section 5 — AI Agent block, WAITLIST framing (master spec rule: never
 * feature a non-live agent). Value copy + CTA to /{locale}/agent only —
 * deliberately NO email capture in R1B. R4 flips this band to "Try the AI
 * Agent" with live chat. Ochre eyebrow is allowed here: it sits on dark ink.
 * Hand-rolled eyebrow (not <Eyebrow>) because that component is clay-on-paper.
 */
export function AgentTeaser({ locale, t }: { locale: Locale; t: Messages['home'] }) {
  return (
    <section className="bg-kinnso-ink py-16 md:py-24">
      <div className="k2-container">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-amber">{t.agentEyebrow}</p>
        <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso-cream md:text-4xl">{t.agentTitle}</h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-cream/70">{t.agentBody}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href={`/${locale}/agent`} className="k2-btn-primary">
            {t.agentCta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <p className="text-sm text-kinnso-cream/70">{t.agentNote}</p>
        </div>
      </div>
    </section>
  )
}
