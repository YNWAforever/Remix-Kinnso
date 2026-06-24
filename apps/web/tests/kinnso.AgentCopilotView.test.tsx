// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AgentCopilotView } from '@/components/kinnso/pages/AgentCopilotView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('AgentCopilotView', () => {
  it('renders the hero, the three value props, and a sign-up CTA', () => {
    render(<AgentCopilotView locale="en" t={en.agent} />)
    expect(screen.getByRole('heading', { level: 1, name: en.agent.heroTitle })).toBeTruthy()
    expect(screen.getByText(en.agent.value1Title)).toBeTruthy()
    expect(screen.getByText(en.agent.value2Title)).toBeTruthy()
    expect(screen.getByText(en.agent.value3Title)).toBeTruthy()
    const ctas = screen.getAllByRole('link', { name: new RegExp(`${en.agent.heroCta}|${en.agent.ctaButton}`) })
    expect(ctas.some((a) => a.getAttribute('href') === '/en/sign-up')).toBe(true)
  })

  it('states the copilot is coming soon (no fabricated live output)', () => {
    render(<AgentCopilotView locale="en" t={en.agent} />)
    expect(screen.getByText(en.agent.comingNote)).toBeTruthy()
  })
})
