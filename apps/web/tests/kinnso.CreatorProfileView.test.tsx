// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import { getCreator, guides } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

const creator = getCreator('maywanders')!
const firstGuide = guides.find((guide) => guide.creatorHandle === creator.handle)!

describe('CreatorProfileView', () => {
  it('renders hero, stat grid and key section headings', () => {
    render(<CreatorProfileView creator={creator} role="anon" locale="en" t={en.creatorProfile} />)
    expect(screen.getByRole('heading', { level: 1, name: creator.name })).toBeTruthy()
    expect(screen.getByText(en.creatorProfile.destinationsCovered)).toBeTruthy()
    expect(screen.getByText(en.creatorProfile.recentPosts)).toBeTruthy()
  })

  it('toggles follow label on click', () => {
    render(<CreatorProfileView creator={creator} role="anon" locale="en" t={en.creatorProfile} />)
    const btn = screen.getByRole('button', { name: en.creatorProfile.follow })
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: en.creatorProfile.following })).toBeTruthy()
  })

  it('shows the anon "sign in as merchant" contact state', () => {
    render(<CreatorProfileView creator={creator} role="anon" locale="en" t={en.creatorProfile} />)
    expect(screen.getByText(en.creatorProfile.brandSignInToContact)).toBeTruthy()
  })

  it('uses real social links and locale-scoped merchant CTAs', () => {
    const { container } = render(
      <CreatorProfileView creator={creator} role="merchant" locale="en" t={en.creatorProfile} />,
    )
    const hrefs = Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href'))

    expect(hrefs).not.toContain('#')
    expect(screen.getByLabelText(`Instagram profile for ${creator.handle}`).getAttribute('href')).toBe(
      `https://www.instagram.com/${creator.handle}/`,
    )
    expect(screen.getByLabelText(`Threads profile for ${creator.handle}`).getAttribute('href')).toBe(
      `https://www.threads.net/@${creator.handle}`,
    )
    expect(screen.getByLabelText(`YouTube profile for ${creator.handle}`).getAttribute('href')).toBe(
      `https://www.youtube.com/@${creator.handle}`,
    )
    expect(screen.getByRole('link', { name: en.creatorProfile.brandSendBrief }).getAttribute('href')).toBe(
      `/en/merchants/post?creator=${creator.handle}`,
    )
  })

  it('keeps guide card links locale scoped', () => {
    render(<CreatorProfileView creator={creator} role="anon" locale="en" t={en.creatorProfile} />)
    expect(screen.getByRole('link', { name: new RegExp(firstGuide.title) }).getAttribute('href')).toBe(
      `/en/g/${firstGuide.slug}`,
    )
  })

  it('hides the page wrapper padding when embedded', () => {
    const { container } = render(
      <CreatorProfileView creator={creator} role="merchant" locale="en" embedded t={en.creatorProfile} />,
    )
    expect(container.querySelector('article')?.className).not.toContain('k-container')
  })

  it('renders creator hero inside a ticket card', () => {
    const { container } = render(
      <CreatorProfileView creator={creator} role="anon" locale="en" t={en.creatorProfile} />,
    )
    expect(container.querySelector('.k-ticket')).toBeTruthy()
  })

  it('shows a score label in the engagement band', () => {
    render(<CreatorProfileView creator={creator} role="anon" locale="en" t={en.creatorProfile} />)
    expect(screen.getAllByText(/score/i).length).toBeGreaterThan(0)
  })
})
