import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { noindexMetadata } from '@/lib/seo/metadata'
import { SignInForm } from './SignInForm'

export const metadata: Metadata = noindexMetadata()

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

  // If already signed in, route through the role-aware hub (/studio sends
  // merchant/ops/creator to the right place).
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(`/${locale}/studio`)

  return (
    <main className="k-page-band flex min-h-screen flex-col items-center justify-center p-6">
      <div className="k-auth-card k-ticket w-full max-w-sm p-8">
        <h1 className="k-display text-2xl font-bold text-kinnso-ink">{dict.auth.signIn}</h1>

        <div className="mt-6">
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
        </div>

        <p className="mt-4 text-sm text-kinnso-muted">
          {dict.auth.noAccount}{' '}
          <Link href={`/${locale}/sign-up`} className="underline text-kinnso-ink">
            {dict.auth.signUp}
          </Link>
        </p>
      </div>
    </main>
  )
}
