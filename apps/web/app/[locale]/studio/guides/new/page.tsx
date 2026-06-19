import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { GuideForm } from '@/components/kinnso/GuideForm'
import { createGuideAction } from '@/lib/guides/actions'
import type { GuideInput } from '@/lib/guides/types'

export default async function StudioNewGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  async function submitGuide(input: GuideInput, opts: { publish: boolean }) {
    'use server'
    const result = await createGuideAction(input, { publish: opts.publish, locale })
    if (result.ok) redirect(`/${locale}/studio/guides`)
    return result
  }

  return <GuideForm t={messages.studioGuides} mode="new" backHref={`/${locale}/studio/guides`} onSubmit={submitGuide} />
}
