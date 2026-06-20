'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { AuthForm, type AuthFormLabels } from '@/components/auth/AuthForm'
import type { Locale } from '@/lib/i18n/config'

interface SignUpFormProps {
  locale: Locale
  labels: AuthFormLabels
  errorEmailTaken: string
  errorInvalidEmail: string
  errorRateLimited: string
  errorGeneric: string
  serverError?: string
}

function getAuthErrorCode(error: { code?: unknown; error_code?: unknown }) {
  if (typeof error.code === 'string') return error.code
  if (typeof error.error_code === 'string') return error.error_code
  return undefined
}

export function SignUpForm({
  locale,
  labels,
  errorEmailTaken,
  errorInvalidEmail,
  errorRateLimited,
  errorGeneric,
  serverError,
}: SignUpFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | undefined>(serverError)
  const [pending, setPending] = useState(false)

  async function handleSubmit({ email, password }: { email: string; password: string }) {
    setError(undefined)
    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // After confirming their email, Supabase redirects to this URL.
          // The route handler at /[locale]/auth/callback exchanges the code for a session.
          emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
        },
      })
      if (signUpError) {
        // Supabase returns "User already registered" for duplicate emails.
        const errorCode = getAuthErrorCode(signUpError)
        if (errorCode === 'email_address_invalid') {
          setError(errorInvalidEmail)
        } else if (errorCode === 'over_email_send_rate_limit') {
          setError(errorRateLimited)
        } else if (signUpError.message.toLowerCase().includes('already registered')) {
          setError(errorEmailTaken)
        } else {
          setError(errorGeneric)
        }
        return
      }
      // With email-enumeration protection enabled, signing up an already-registered
      // (confirmed) email returns a 200 with no error and an obfuscated user whose
      // `identities` array is empty — and Supabase sends no confirmation email. Treat
      // that as "already registered" instead of falsely claiming an email was sent.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError(errorEmailTaken)
        return
      }
      // When email confirmation is disabled (auto-confirm), signUp returns a live
      // session — the creator is already signed in, so send them straight into the
      // onboarding wizard instead of a "check your email" dead-end they can't clear.
      // router.refresh() forces the server to pick up the freshly-set auth cookie.
      if (data.session) {
        router.push(`/${locale}/creator`)
        router.refresh()
        return
      }
      // Otherwise email confirmation is required: show the "check your email" screen.
      router.push(`/${locale}/sign-up?sent=1`)
    } catch {
      setError(errorGeneric)
    } finally {
      setPending(false)
    }
  }

  return <AuthForm mode="sign-up" labels={labels} onSubmit={handleSubmit} errorMessage={error} pending={pending} />
}
