import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { listAllSessions, listCreatorsForHostPicker } from '@/lib/admin/sessions-queries'
import {
  adminCreateSessionAction, adminUpdateSessionAction, adminSetSessionStatusAction,
  adminDeleteSessionAction, listSessionRsvpsForAdminAction,
} from '@/lib/admin/sessions-actions'
import { AdminSessionsView } from '@/components/kinnso/admin/AdminSessionsView'

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'ops') notFound()

  const [sessions, creators] = await Promise.all([listAllSessions(supabase), listCreatorsForHostPicker(supabase)])

  const loc = locale as Locale
  return (
    <AdminSessionsView
      t={messages.sessionsAdmin}
      sessions={sessions}
      creators={creators}
      onCreate={(hostCreatorId, input) => adminCreateSessionAction(hostCreatorId, input, { locale: loc })}
      onUpdate={(id, input) => adminUpdateSessionAction(id, input, { locale: loc })}
      onSetStatus={(id, status) => adminSetSessionStatusAction(id, status, { locale: loc })}
      onDelete={(id) => adminDeleteSessionAction(id, { locale: loc })}
      onListRsvps={(id) => listSessionRsvpsForAdminAction(id)}
    />
  )
}
