// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), notFound: vi.fn() }))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: async () => [] }))

import LocaleHome from '@/app/[locale]/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale] home host', () => {
  it('renders the homepage (no longer a redirect)', async () => {
    const ui = await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
  })
})
