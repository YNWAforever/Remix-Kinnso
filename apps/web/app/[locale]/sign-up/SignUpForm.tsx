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
  errorGeneric: string
  serverError?: string
}

export function SignUpForm({
  locale,
  labels,
  errorEmailTaken,
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
      const { error: signUpError } = await supabase.auth.signUp({
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
        if (signUpError.message.toLowerCase().includes('already registered')) {
          setError(errorEmailTaken)
        } else {
          setError(errorGeneric)
        }
        return
      }
      // On success, redirect to the same page with ?sent=1 to show the confirmation message.
      router.push(`/${locale}/sign-up?sent=1`)
    } catch {
      setError(errorGeneric)
    } finally {
      setPending(false)
    }
  }

  return <AuthForm mode="sign-up" labels={labels} onSubmit={handleSubmit} errorMessage={error} pending={pending} />
}
