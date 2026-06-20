import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { SignUpForm } from './SignUpForm'
import { notFound } from 'next/navigation'

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { error, sent } = await searchParams
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
    <main className="k-page-band flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="k-auth-card k-ticket w-full max-w-sm p-8">
      <h1 className="k-display text-2xl font-bold text-kinnso-ink">{dict.auth.signUp}</h1>

      {sent === '1' ? (
        <div className="mt-6 flex w-full flex-col items-center gap-4 text-center">
          <div>
            <p className="font-medium text-ink">{dict.auth.emailSent}</p>
            <p className="mt-1 text-sm text-ink/70">{dict.auth.emailSentDesc}</p>
            <p className="mt-3 text-sm text-ink/70">{dict.auth.emailSentNext}</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <Link
              href={`/${locale}/sign-in`}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-ink/90"
            >
              {dict.auth.emailSentSignIn}
            </Link>
            <Link href={`/${locale}/sign-up`} className="text-sm text-ink/70 underline">
              {dict.auth.emailSentUseAnother}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <SignUpForm
            locale={locale as Locale}
            labels={{
              email: dict.auth.email,
              password: dict.auth.password,
              submit: dict.auth.signUp,
            }}
            errorEmailTaken={dict.auth.errorEmailTaken}
            errorInvalidEmail={dict.auth.errorInvalidEmail}
            errorRateLimited={dict.auth.errorRateLimited}
            errorGeneric={dict.auth.errorGeneric}
            serverError={serverError}
          />
          <p className="text-sm text-ink/70">
            {dict.auth.alreadyHaveAccount}{' '}
            <Link href={`/${locale}/sign-in`} className="underline text-ink">
              {dict.auth.signIn}
            </Link>
          </p>
        </>
      )}
      </div>
    </main>
  )
}
