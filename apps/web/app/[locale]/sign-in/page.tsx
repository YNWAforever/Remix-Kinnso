import { redirect } from 'next/navigation'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { SignInForm } from './SignInForm'

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { error } = await searchParams
  const dict = await getDictionary(locale as Locale)

  // Map the attacker-controllable ?error= param through a whitelist of known
  // codes to a localized string. Anything unrecognized renders no banner —
  // never reflect the raw query value into the alert (text-injection/phishing).
  // The auth callback route emits ?error=callback on exchange failure.
  const serverError = error === 'callback' ? dict.auth.errorGeneric : undefined

  // If already signed in, skip to the creator area.
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(`/${locale}/creator`)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-ink">{dict.auth.signIn}</h1>

      <SignInForm
        locale={locale as Locale}
        labels={{
          email: dict.auth.email,
          password: dict.auth.password,
          submit: dict.auth.signIn,
        }}
        errorInvalidCredentials={dict.auth.errorInvalidCredentials}
        errorGeneric={dict.auth.errorGeneric}
        serverError={serverError}
      />

      <p className="text-sm text-ink/70">
        {dict.auth.noAccount}{' '}
        <Link href={`/${locale}/sign-up`} className="underline text-ink">
          {dict.auth.signUp}
        </Link>
      </p>
    </main>
  )
}
