'use client'
import { useState } from 'react'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Messages } from '@/lib/i18n/messages/en'

type Audience = 'traveller' | 'creator' | 'merchant'

/**
 * Section 3 — how it works. Traveller steps by default with For Creators /
 * For Merchants toggle tabs. Pure client tab state — deliberately NO URL
 * state (locked R1B decision), so the homepage stays a single static route.
 */
export function HowItWorks({ t }: { t: Messages['home'] }) {
  const [audience, setAudience] = useState<Audience>('traveller')
  const tabs: { id: Audience; label: string }[] = [
    { id: 'traveller', label: t.howTabTravellers },
    { id: 'creator', label: t.howTabCreators },
    { id: 'merchant', label: t.howTabMerchants },
  ]
  const steps: Record<Audience, { title: string; desc: string }[]> = {
    traveller: [
      { title: t.howT1Title, desc: t.howT1Desc },
      { title: t.howT2Title, desc: t.howT2Desc },
      { title: t.howT3Title, desc: t.howT3Desc },
    ],
    creator: [
      { title: t.howC1Title, desc: t.howC1Desc },
      { title: t.howC2Title, desc: t.howC2Desc },
      { title: t.howC3Title, desc: t.howC3Desc },
    ],
    merchant: [
      { title: t.howM1Title, desc: t.howM1Desc },
      { title: t.howM2Title, desc: t.howM2Desc },
      { title: t.howM3Title, desc: t.howM3Desc },
    ],
  }
  return (
    <SectionShell>
      <Eyebrow>{t.howEyebrow}</Eyebrow>
      <h2 className="k2-display mt-3 max-w-xl text-3xl font-semibold text-kinnso2-ink md:text-4xl">{t.howHeading}</h2>
      <p className="mt-3 max-w-xl text-kinnso2-ink/70">{t.howSub}</p>
      <div role="tablist" aria-label={t.howEyebrow} className="mt-8 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`how-tab-${tab.id}`}
            aria-selected={audience === tab.id}
            aria-controls="how-steps"
            onClick={() => setAudience(tab.id)}
            className={`min-h-[40px] rounded-[3px] px-4 py-2 text-sm font-semibold tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay ${
              audience === tab.id
                ? 'bg-kinnso2-ink text-kinnso2-paper'
                : 'border border-kinnso2-ink/25 text-kinnso2-ink hover:border-kinnso2-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id="how-steps" role="tabpanel" aria-labelledby={`how-tab-${audience}`}>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {steps[audience].map((s, i) => (
            <li key={s.title} className="border-t-2 border-kinnso2-ink pt-4">
              <span className="k2-display text-sm font-semibold text-kinnso2-clay">{`0${i + 1}`}</span>
              <h3 className="mt-2 text-lg font-semibold text-kinnso2-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-kinnso2-ink/70">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  )
}
