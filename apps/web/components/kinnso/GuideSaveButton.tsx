'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveGuideAction, unsaveGuideAction } from '@/lib/saves/guide-actions'
import { currentReturnPath, signInHref } from '@/lib/auth/return-path'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function GuideSaveButton({ locale, guideId, initialSaved, signedIn, t }: {
  locale: Locale
  guideId: string
  initialSaved: boolean
  signedIn: boolean
  t: Messages['guideSave']
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialSaved)
  const [pending, setPending] = useState(false)

  async function toggle() {
    if (!signedIn) {
      // Carry this guide as the post-sign-in destination so the viewer lands
      // back on the thing they wanted to save, not on a bare hub.
      router.push(signInHref(locale, currentReturnPath()))
      return
    }
    setPending(true)
    const result = saved
      ? await unsaveGuideAction(locale, guideId)
      : await saveGuideAction(locale, guideId)
    setPending(false)
    if (result.ok) {
      setSaved(!saved)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1 rounded-[3px] bg-white/90 px-3 py-1 text-sm font-semibold text-kinnso-ink disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange',
        saved && 'bg-kinnso-amber/90',
      )}
    >
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden="true" />
      {signedIn ? (saved ? t.saved : t.save) : t.signInToSave}
    </button>
  )
}

export default GuideSaveButton
