import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSessionAction } from '@/lib/sessions/studio-actions'
import { SessionForm } from '@/components/kinnso/pages/SessionForm'

export default async function NewStudioSessionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  const t = messages.studioSessions
  const typeLabel = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }
  return (
    <main className="k-container py-12">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.formNewHeading}</h1>
      <div className="mt-6 max-w-2xl">
        <SessionForm
          t={t}
          typeLabel={typeLabel}
          initial={null}
          onSave={(input) => createSessionAction(input, { locale: locale as Locale })}
          onDoneHref={`/${locale}/studio/sessions`}
        />
      </div>
    </main>
  )
}
