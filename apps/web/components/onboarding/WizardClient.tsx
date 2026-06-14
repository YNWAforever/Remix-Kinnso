'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Dna } from '@kinnso/scan'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { Step } from '@/lib/onboarding/resumeRoute'
import type { Platform } from '@/lib/onboarding/validateHandle'
import type { InitialHandle } from '@/components/onboarding/HandlesStep'
import { HandlesStep } from './HandlesStep'
import { LiveProgress } from './LiveProgress'
import { DnaReviewForm } from './DnaReviewForm'
import { ReadBack } from './ReadBack'

export interface WizardClientProps {
  creatorId: string
  locale: Locale
  initialStep: Step
  handles: InitialHandle[]
  latestJobId: string | null
  draft: Dna | null
  final: Dna | null
  thin: boolean
  messages: Messages
}

/** Platforms to render in live progress: the saved handles' platforms (else all three). */
function progressPlatforms(handles: InitialHandle[]): Platform[] {
  const fromHandles = handles.map((h) => h.platform)
  return fromHandles.length > 0 ? fromHandles : ['instagram', 'youtube', 'threads']
}

export function WizardClient(props: WizardClientProps) {
  const { creatorId, locale, handles, latestJobId, draft, final, thin, messages } = props
  const router = useRouter()
  const [step, setStep] = useState<Step>(props.initialStep)

  const onb = messages.onboarding

  // 'wait' — creators row not visible yet (trigger lag); a manual refresh recovers.
  if (step === 'wait') {
    return (
      <section className="space-y-3 text-center">
        <p className="text-sm text-ink/70">Setting up your account…</p>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => router.refresh()}
        >
          {onb.progressStep.continue}
        </button>
      </section>
    )
  }

  if (step === 'handles') {
    return (
      <HandlesStep
        creatorId={creatorId}
        initialHandles={handles}
        t={onb.handlesStep}
        onRun={() => setStep('progress')}
      />
    )
  }

  if (step === 'progress' || step === 'retry') {
    return (
      <LiveProgress
        creatorId={creatorId}
        jobId={latestJobId}
        platforms={progressPlatforms(handles)}
        t={onb.progressStep}
        onReady={() => {
          // Pull fresh server state (ai_draft now present) and switch to review.
          router.refresh()
          setStep('review')
        }}
      />
    )
  }

  if (step === 'review') {
    if (!draft) {
      // Draft not yet on the server snapshot — refresh and stay on progress.
      return (
        <section className="text-center text-sm text-ink/70">
          {onb.progressStep.phaseReady}
        </section>
      )
    }
    return (
      <DnaReviewForm
        creatorId={creatorId}
        draft={draft}
        thin={thin}
        t={messages.dna}
        onPublished={() => {
          router.refresh()
          setStep('done')
        }}
      />
    )
  }

  // step === 'done'
  return (
    <ReadBack
      dna={final ?? draft ?? emptyDna()}
      t={messages.dna}
      signOutHref={`/${locale}/auth/sign-out`}
      signOutLabel={onb.signOut}
    />
  )
}

function emptyDna(): Dna {
  return { bio: '', niches: [], content_pillars: [], tone: [], audience: {}, platforms: [], languages: [] }
}
