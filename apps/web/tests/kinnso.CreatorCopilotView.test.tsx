// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const useChatMock = vi.hoisted(() => vi.fn())
vi.mock('@ai-sdk/react', () => ({ useChat: useChatMock }))
vi.mock('ai', () => ({ DefaultChatTransport: class { constructor(_: unknown) {} } }))

import { CreatorCopilotView } from '@/components/kinnso/pages/CreatorCopilotView'

const base = { locale: 'en' as const, t: en.copilot, configured: true, remaining: 5, initialMessages: [] }

describe('CreatorCopilotView', () => {
  it('renders the unconfigured card when not configured', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready' })
    render(<CreatorCopilotView {...base} configured={false} />)
    expect(screen.getByText(en.copilot.unconfiguredTitle)).toBeTruthy()
  })

  it('renders the empty state with the input enabled when configured and under limit', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready' })
    render(<CreatorCopilotView {...base} />)
    expect(screen.getByText(en.copilot.emptyTitle)).toBeTruthy()
    expect((screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('shows the limit card and disables input when no messages remain', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready' })
    render(<CreatorCopilotView {...base} remaining={0} />)
    expect(screen.getByText(en.copilot.limitTitle)).toBeTruthy()
    expect((screen.getByPlaceholderText(en.copilot.inputPlaceholder) as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('renders an existing assistant message', () => {
    useChatMock.mockReturnValue({
      messages: [{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Here are 5 ideas' }] }],
      sendMessage: vi.fn(), status: 'ready',
    })
    render(<CreatorCopilotView {...base} />)
    expect(screen.getByText('Here are 5 ideas')).toBeTruthy()
  })
})
