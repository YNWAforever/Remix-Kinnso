// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { StudioHomeView } from '@/components/kinnso/pages/StudioHomeView'

afterEach(cleanup)

describe('StudioHomeView', () => {
  it('renders the studio heading and tool cards linking to scan + missions', () => {
    render(<StudioHomeView locale="en" t={en.studioHome} />)
    expect(screen.getByRole('heading', { name: en.studioHome.heading })).toBeTruthy()
    expect(screen.getByText(en.studioHome.scanTitle)).toBeTruthy()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toContain('/en/studio/scan')
    expect(links).toContain('/en/studio/missions')
  })

  it('marks live tools Live and not-yet tools Soon', () => {
    render(<StudioHomeView locale="en" t={en.studioHome} />)
    expect(screen.getAllByText(en.studioHome.liveBadge).length).toBeGreaterThan(0)
    expect(screen.getAllByText(en.studioHome.soonBadge).length).toBeGreaterThan(0)
  })
})
