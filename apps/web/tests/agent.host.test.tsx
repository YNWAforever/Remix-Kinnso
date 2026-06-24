// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))

import AgentPage from '@/app/[locale]/agent/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/agent host', () => {
  it('renders the Creator Copilot marketing page (not a coming-soon stub)', async () => {
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.agent.heroTitle })).toBeTruthy()
    expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
  })
})
