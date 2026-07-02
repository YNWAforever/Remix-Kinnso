// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { AgentLandingView } from '@/components/kinnso/pages/AgentLandingView'

vi.mock('@/lib/agent/waitlist-actions', () => ({ joinAgentWaitlistAction: vi.fn() }))

describe('AgentLandingView', () => {
  it('renders honest waitlist framing: capture form, no live-agent claims, escape hatches', () => {
    render(<AgentLandingView locale="en" t={en.agent} />)
    expect(screen.getByRole('heading', { level: 1, name: en.agent.title })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: en.agent.pointsHeading })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.agent.submitCta })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.agent.exploreCta })).toBeTruthy()
    expect(document.querySelector('input[type="email"]')).toBeTruthy()
  })
})
