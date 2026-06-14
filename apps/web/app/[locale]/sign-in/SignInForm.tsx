'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { AuthForm, type AuthFormLabels } from '@/components/auth/AuthForm'
import type { Locale } from '@/lib/i18n/config'

interface SignInFormProps {
  locale: Locale
  labels: AuthFormLabels
  errorInvalidCredentials: string
  errorGeneric: string
  serverError?: string
}

export function SignInForm({
  locale,
  labels,
  errorInvalidCredentials,
  errorGeneric,
  serverError,
}: SignInFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | undefined>(serverError)
  const [pending, setPending] = useState(false)

  async function handleSubmit({ email, password }: { email: string; password: string }) {
    setError(undefined)
    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        // Supabase returns "Invalid login credentials" for wrong email/password.
        setError(errorInvalidCredentials)
        return
      }
      // On success, hard-navigate to force the server to pick up the new cookie.
      router.push(`/${locale}/creator`)
      router.refresh()
    } catch {
      setError(errorGeneric)
    } finally {
      setPending(false)
    }
  }

  return <AuthForm mode="sign-in" labels={labels} onSubmit={handleSubmit} errorMessage={error} pending={pending} />
}
