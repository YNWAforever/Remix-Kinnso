// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)

import { HowItWorks } from '@/components/kinnso/home/HowItWorks'
import en from '@/lib/i18n/messages/en'

describe('HowItWorks (section 3)', () => {
  it('defaults to the traveller steps', () => {
    render(<HowItWorks t={en.home} />)
    expect(screen.getByRole('tab', { name: en.home.howTabTravellers }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(en.home.howT1Title)).toBeTruthy()
    expect(screen.getByText(en.home.howT3Desc)).toBeTruthy()
    expect(screen.queryByText(en.home.howC1Title)).toBeNull()
    expect(screen.queryByText(en.home.howM1Title)).toBeNull()
  })

  it('switches to creator steps on tab click (pure client state — no URL change)', () => {
    render(<HowItWorks t={en.home} />)
    fireEvent.click(screen.getByRole('tab', { name: en.home.howTabCreators }))
    expect(screen.getByRole('tab', { name: en.home.howTabCreators }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(en.home.howC1Title)).toBeTruthy()
    expect(screen.queryByText(en.home.howT1Title)).toBeNull()
  })

  it('switches to merchant steps', () => {
    render(<HowItWorks t={en.home} />)
    fireEvent.click(screen.getByRole('tab', { name: en.home.howTabMerchants }))
    expect(screen.getByText(en.home.howM1Title)).toBeTruthy()
    expect(screen.getByText(en.home.howM3Desc)).toBeTruthy()
  })
})
