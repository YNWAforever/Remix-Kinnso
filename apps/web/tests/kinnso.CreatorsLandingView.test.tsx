// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { CreatorsLandingView } from '@/components/kinnso/pages/CreatorsLandingView'

afterEach(cleanup)

describe('CreatorsLandingView', () => {
  it('renders the hero title, the four steps and an apply CTA to sign-up', () => {
    render(<CreatorsLandingView locale="en" t={en.creatorsLanding} />)
    expect(screen.getByRole('heading', { name: en.creatorsLanding.heroTitle })).toBeTruthy()
    expect(screen.getByText(en.creatorsLanding.step1Title)).toBeTruthy()
    expect(screen.getByText(en.creatorsLanding.step4Title)).toBeTruthy()
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/en/sign-up')).toBe(true)
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })
})
