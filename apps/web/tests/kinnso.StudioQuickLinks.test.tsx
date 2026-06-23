// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { StudioQuickLinks } from '@/components/kinnso/StudioQuickLinks'

afterEach(cleanup)

describe('StudioQuickLinks', () => {
  it('renders the five live tools as locale-prefixed links and disables the inbox tile', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/en/studio/scan')
    expect(hrefs).toContain('/en/studio/missions')
    expect(hrefs).toContain('/en/studio/earnings')
    expect(hrefs).toContain('/en/studio/offers')
    expect(hrefs).toContain('/en/studio/guides')
    // Inbox is backlog — shown but not clickable (no link to the stub).
    expect(hrefs).not.toContain('/en/studio/inbox')
    expect(screen.getByText(en.studioHome.inboxTitle)).toBeTruthy()
  })

  it('marks live tools Live and the inbox Soon', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} />)
    expect(screen.getAllByText(en.studioHome.liveBadge).length).toBeGreaterThan(0)
    expect(screen.getAllByText(en.studioHome.soonBadge).length).toBe(1)
  })
})
