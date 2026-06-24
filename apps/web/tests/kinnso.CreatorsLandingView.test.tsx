// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { creators } from '@/lib/creator-mock'
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

  it('does not render any fabricated creator (honest marketing)', () => {
    render(<CreatorsLandingView locale="en" t={en.creatorsLanding} />)
    for (const c of creators.slice(0, 6)) {
      expect(screen.queryByText(`@${c.handle}`)).toBeNull()
    }
    // no link into a (mock) creator profile page
    expect(screen.queryAllByRole('link').some((a) => a.getAttribute('href')?.includes('/c/'))).toBe(false)
  })
})
