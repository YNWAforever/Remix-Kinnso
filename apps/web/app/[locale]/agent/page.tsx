import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAgentConfigured } from '@/lib/agent/config'
import { AgentChatView } from '@/components/kinnso/pages/AgentChatView'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/agent', locale: locale as Locale, title: dict.seo.agent.title, description: dict.seo.agent.description })
}

export default async function AgentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  // auth.getUser() makes this page request-dynamic — needed so the chat view knows
  // whether to send an anonSessionId (same reasoning as the experience page's
  // equivalent comment from R3A-2).
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <AgentChatView
      locale={locale as Locale}
      t={messages.agent}
      configured={isAgentConfigured()}
      viewerSignedIn={Boolean(user)}
      anonSessionId={randomUUID()}
    />
  )
}
