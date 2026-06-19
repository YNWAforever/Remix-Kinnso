// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { pushMock, signUpMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  signUpMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signUp: signUpMock } }),
}))

import { SignUpForm } from '@/app/[locale]/sign-up/SignUpForm'

const labels = { email: 'Email address', password: 'Password', submit: 'Sign up' }

const renderForm = () =>
  render(
    <SignUpForm
      locale="en"
      labels={labels}
      errorEmailTaken="That email is already registered."
      errorGeneric="Something went wrong."
    />,
  )

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'someone@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2pass' } })
  fireEvent.submit(screen.getByRole('form'))
}

afterEach(cleanup)
beforeEach(() => {
  pushMock.mockReset()
  signUpMock.mockReset()
})

describe('SignUpForm', () => {
  it('redirects to the sent state for a genuinely new signup', async () => {
    signUpMock.mockResolvedValue({ data: { user: { identities: [{ id: 'i1' }] } }, error: null })
    renderForm()
    fillAndSubmit()
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/sign-up?sent=1'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the already-registered message (not a false "email sent") when Supabase returns an obfuscated empty-identities user', async () => {
    // Enumeration protection: repeated signup of an existing confirmed email
    // returns a 200 with no error and an obfuscated user whose identities are empty.
    signUpMock.mockResolvedValue({ data: { user: { identities: [] } }, error: null })
    renderForm()
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe('That email is already registered.')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('shows the already-registered message when Supabase returns an explicit error', async () => {
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'User already registered' } })
    renderForm()
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe('That email is already registered.')
    expect(pushMock).not.toHaveBeenCalled()
  })
})
