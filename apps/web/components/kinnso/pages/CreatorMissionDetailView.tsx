'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { SocialSignalBadge } from '@/components/kinnso/SocialSignalBadge'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import type { CreatorMissionDetail } from '@/lib/missions/detail'
import type { Messages } from '@/lib/i18n/messages/en'

type CreatorMissionDetailViewProps = {
  locale: string
  t: Messages['missionDetail']
  mission: CreatorMissionDetail
  onJoin: () => KinnsoActionResult | Promise<KinnsoActionResult>
  onApply: (note: string) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function CreatorMissionDetailView({ locale, t, mission, onJoin, onApply }: CreatorMissionDetailViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [note, setNote] = useState('')

  const runAction = async (action: () => KinnsoActionResult | Promise<KinnsoActionResult>) => {
    setActionError(null)
    setIsPending(true)
    try {
      const result = await action()
      setActionError(actionErrorMessage(result))
      if (actionSucceeded(result)) router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="k-container py-10">
      <Link href={`/${locale}/studio/missions`} className="text-sm text-kinnso-muted">
        ← {t.back}
      </Link>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-3xl font-black text-kinnso-ink">{mission.title}</h1>
        <MissionStatusBadge status={mission.participantStatus ?? mission.status} />
      </div>
      <div className="mt-2">
        <MissionCompensationSummary text={mission.compensation} />
      </div>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.briefHeading}</h2>
        <p className="mt-2 text-sm leading-relaxed text-kinnso-muted">{mission.summary}</p>
      </section>

      {mission.cta === 'join' && (
        <div className="mt-6">
          <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(onJoin)}>
            {t.join}
          </button>
        </div>
      )}

      {mission.cta === 'apply' && (
        <div className="mt-6 grid gap-2">
          <label htmlFor="application-note" className="text-sm font-bold text-kinnso-ink">{t.applyNoteLabel}</label>
          <textarea
            id="application-note"
            className="k-input min-h-[96px]"
            placeholder={t.applyNotePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div>
            <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onApply(note))}>
              {t.apply}
            </button>
          </div>
        </div>
      )}

      {mission.cta === 'awaiting' && (
        <div className="mt-6 rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
          <h2 className="font-bold text-kinnso-ink">{t.awaitingTitle}</h2>
          <p className="mt-1 text-sm text-kinnso-muted">{t.awaitingBody}</p>
        </div>
      )}

      {mission.cta === 'rejected' && (
        <div className="mt-6 rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
          <h2 className="font-bold text-kinnso-ink">{t.rejectedTitle}</h2>
          <p className="mt-1 text-sm text-kinnso-muted">{t.rejectedBody}</p>
        </div>
      )}

      {(mission.couponCode || mission.partnerLinks.length > 0) && (
        <section className="mt-8 grid gap-3">
          {mission.couponCode && (
            <div className="rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
              <h2 className="font-bold text-kinnso-ink">{t.couponHeading}</h2>
              <p className="mt-1 text-sm text-kinnso-muted">
                {t.couponCodeLabel}: <span className="font-mono font-semibold text-kinnso-ink">{mission.couponCode}</span>
              </p>
            </div>
          )}
          {mission.partnerLinks.length > 0 && (
            <div className="rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
              <h2 className="font-bold text-kinnso-ink">{t.partnerLinksHeading}</h2>
              <ul className="mt-2 space-y-1">
                {mission.partnerLinks.map((link) => (
                  <li key={link.id} className="truncate text-sm">
                    <a href={link.partnerUrl} className="text-kinnso-blue underline" target="_blank" rel="noreferrer">
                      {link.partnerUrl || t.openLink}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {mission.cta === 'active' && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.milestonesHeading}</h2>
          {mission.milestones.length === 0 ? (
            <p className="mt-3 text-sm text-kinnso-muted">{t.notStarted}</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {mission.milestones.map((milestone) => (
                <TicketCard key={milestone.id} as="article" className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-bold text-kinnso-ink">{milestone.title}</h3>
                      {milestone.description && <p className="mt-1 text-sm text-kinnso-muted">{milestone.description}</p>}
                      {milestone.dueAt && <p className="mt-1 text-xs text-kinnso-muted">{t.dueLabel} {milestone.dueAt.slice(0, 10)}</p>}
                    </div>
                    <div className="flex flex-none flex-wrap gap-2">
                      {milestone.state === 'none' ? (
                        <span className="inline-flex rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold text-kinnso-muted">
                          {t.notStarted}
                        </span>
                      ) : (
                        <>
                          <MissionStatusBadge status={milestone.state} />
                          {milestone.signal && <SocialSignalBadge status={milestone.signal} />}
                        </>
                      )}
                    </div>
                  </div>
                </TicketCard>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
