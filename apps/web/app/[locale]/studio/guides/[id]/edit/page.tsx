import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { GuideForm } from '@/components/kinnso/GuideForm'
import { updateGuideAction } from '@/lib/guides/actions'
import type { GuideInput } from '@/lib/guides/types'

export default async function StudioEditGuidePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  // RLS scopes to owner; a non-owner / missing id yields null -> notFound.
  const { data: guide } = await supabase
    .from('guides')
    .select('id, title, city, cover_url, summary')
    .eq('id', id)
    .maybeSingle()
  if (!guide) notFound()

  const initial: GuideInput = {
    title: guide.title,
    city: guide.city,
    coverUrl: guide.cover_url,
    summary: guide.summary,
  }

  async function submitGuide(input: GuideInput, opts: { publish: boolean }) {
    'use server'
    const result = await updateGuideAction(id, input, { publish: opts.publish, locale })
    if (result.ok) redirect(`/${locale}/studio/guides`)
    return result
  }

  return <GuideForm t={messages.studioGuides} mode="edit" initial={initial} onSubmit={submitGuide} />
}
