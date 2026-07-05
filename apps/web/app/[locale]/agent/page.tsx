import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAgentConfigured } from '@/lib/agent/config'
import { getAgentMessages } from '@/lib/agent/queries'
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

  // Sign-in unlocks reading a traveller's saved conversation back (D-R4-4 / plan
  // Ground Truth note). Anon sessions have no read policy at all, so there is
  // nothing to fetch for an anon visitor — same asymmetry as appendAgentMessage's
  // insert-only anon path.
  const initialMessages = user ? await getAgentMessages(supabase, user.id) : []

  return (
    <AgentChatView
      locale={locale as Locale}
      t={messages.agent}
      configured={isAgentConfigured()}
      viewerSignedIn={Boolean(user)}
      anonSessionId={randomUUID()}
      initialMessages={initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
    />
  )
}
