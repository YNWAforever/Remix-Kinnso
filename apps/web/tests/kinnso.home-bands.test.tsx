// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { AgentTeaser } from '@/components/kinnso/home/AgentTeaser'
import { MerchantValue } from '@/components/kinnso/home/MerchantValue'
import { CreatorCta } from '@/components/kinnso/home/CreatorCta'
import en from '@/lib/i18n/messages/en'

describe('AgentTeaser (section 5 — waitlist framing)', () => {
  it('shows value copy + waitlist CTA to /agent and NO email capture', () => {
    const { container } = render(<AgentTeaser locale="en" t={en.home} />)
    expect(screen.getByText(en.home.agentTitle)).toBeTruthy()
    expect(screen.getByText(en.home.agentBody)).toBeTruthy()
    expect(screen.getByText(en.home.agentNote)).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(en.home.agentCta) }).getAttribute('href')).toBe('/en/agent')
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
  })
})

describe('MerchantValue (section 8)', () => {
  it('renders the three benefit bullets and the CTA to /merchants', () => {
    render(<MerchantValue locale="en" t={en.home} />)
    for (const b of [en.home.merchantBullet1, en.home.merchantBullet2, en.home.merchantBullet3]) {
      expect(screen.getByText(b)).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: en.home.merchantCta }).getAttribute('href')).toBe('/en/merchants')
  })
})

describe('CreatorCta (section 9)', () => {
  it('renders the three bullets and the CTA to /sign-up', () => {
    render(<CreatorCta locale="en" t={en.home} />)
    for (const b of [en.home.creatorBullet1, en.home.creatorBullet2, en.home.creatorBullet3]) {
      expect(screen.getByText(b)).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: en.home.creatorCta }).getAttribute('href')).toBe('/en/sign-up')
  })
})
