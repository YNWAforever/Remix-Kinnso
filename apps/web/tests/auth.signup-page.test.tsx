// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(cleanup)

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
  }),
}))

import SignUpPage from '@/app/[locale]/sign-up/page'

beforeEach(() => {
  state.user = null
})

describe('/[locale]/sign-up host', () => {
  it('turns the sent state into a creator-onboarding handoff', async () => {
    const ui = await SignUpPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ sent: '1' }),
    })

    render(ui)

    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.getByText('Check your email')).toBeTruthy()
    expect(
      screen.getByText('After confirming, Kinnso will take you to creator setup to connect Instagram, YouTube, or Threads.'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in after confirming' }).getAttribute('href')).toBe('/en/sign-in')
    expect(screen.getByRole('link', { name: 'Use another email' }).getAttribute('href')).toBe('/en/sign-up')
  })
})
