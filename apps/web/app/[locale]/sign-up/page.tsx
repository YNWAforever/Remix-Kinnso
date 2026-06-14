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

  // If already signed in, skip to the creator area.
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(`/${locale}/creator`)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-ink">{dict.auth.signUp}</h1>

      {sent === '1' ? (
        <div className="text-center max-w-sm">
          <p className="font-medium text-ink">{dict.auth.emailSent}</p>
          <p className="text-sm text-ink/70 mt-1">{dict.auth.emailSentDesc}</p>
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
            errorInvalidCredentials={dict.auth.errorInvalidCredentials}
            errorEmailTaken={dict.auth.errorEmailTaken}
            errorGeneric={dict.auth.errorGeneric}
            serverError={error}
          />
          <p className="text-sm text-ink/70">
            {dict.auth.alreadyHaveAccount}{' '}
            <Link href={`/${locale}/sign-in`} className="underline text-ink">
              {dict.auth.signIn}
            </Link>
          </p>
        </>
      )}
    </main>
  )
}
