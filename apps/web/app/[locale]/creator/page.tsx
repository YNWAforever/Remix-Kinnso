import { redirect, notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * /[locale]/creator
 *
 * Gated by proxy.ts (unauthenticated users are redirected to sign-in
 * before this page ever renders). We call getUser() here as a defence-in-depth
 * check and to retrieve the user id for the creators row lookup.
 *
 * The `creators` row is created automatically by a SECURITY DEFINER trigger
 * on auth.users AFTER INSERT (Plan 1a). No client insert is needed here.
 *
 * Onboarding wizard, scan, and DNA forms are out of scope — deferred to Plan 4.
 */
export default async function CreatorPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()

  // Defence-in-depth: verify the session even though the proxy already gated this route.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  // Load the creators row. The trigger ensures it exists; RLS allows owner select.
  const { data: creator } = await supabase
    .from('creators')
    .select('id, display_name, status')
    .eq('id', user.id)
    .single()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-ink">{dict.auth.creatorDashboard}</h1>

      <div className="text-sm text-ink/70 text-center max-w-sm space-y-1">
        <p>
          <span className="font-medium">Email:</span> {user.email}
        </p>
        {creator ? (
          <>
            <p>
              <span className="font-medium">Creator status:</span> {creator.status}
            </p>
            <p>
              <span className="font-medium">Creator id:</span> {creator.id}
            </p>
          </>
        ) : (
          <p className="text-red-600">
            creators row not found — check the Plan 1a trigger is deployed.
          </p>
        )}
      </div>

      <p className="text-sm text-ink/50 italic">{dict.auth.onboardingPlaceholder}</p>

      <a
        href={`/${locale}/auth/sign-out`}
        className="text-sm underline text-ink/70 hover:text-ink"
      >
        {dict.auth.signOut}
      </a>
    </main>
  )
}
