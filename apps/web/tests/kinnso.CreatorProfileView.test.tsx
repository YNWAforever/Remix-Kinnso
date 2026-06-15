// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import { getCreator } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

const creator = getCreator('maywanders')!

describe('CreatorProfileView', () => {
  it('renders hero, stat grid and key section headings', () => {
    render(<CreatorProfileView creator={creator} role="anon" t={en.creatorProfile} />)
    expect(screen.getByRole('heading', { level: 1, name: creator.name })).toBeTruthy()
    expect(screen.getByText(en.creatorProfile.destinationsCovered)).toBeTruthy()
    expect(screen.getByText(en.creatorProfile.recentPosts)).toBeTruthy()
  })

  it('toggles follow label on click', () => {
    render(<CreatorProfileView creator={creator} role="anon" t={en.creatorProfile} />)
    const btn = screen.getByRole('button', { name: en.creatorProfile.follow })
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: en.creatorProfile.following })).toBeTruthy()
  })

  it('shows the anon "sign in as merchant" contact state', () => {
    render(<CreatorProfileView creator={creator} role="anon" t={en.creatorProfile} />)
    expect(screen.getByText(en.creatorProfile.brandSignInToContact)).toBeTruthy()
  })

  it('hides the page wrapper padding when embedded', () => {
    const { container } = render(
      <CreatorProfileView creator={creator} role="merchant" embedded t={en.creatorProfile} />,
    )
    expect(container.querySelector('article')?.className).not.toContain('k-container')
  })
})
