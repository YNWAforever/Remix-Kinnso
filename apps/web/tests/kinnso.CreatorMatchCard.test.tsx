// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { extendedCreators, computeMatch } from '@/lib/creator-mock'

afterEach(cleanup)

vi.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  Geographies: ({ children }: { children: (a: { geographies: unknown[] }) => React.ReactNode }) =>
    <>{children({ geographies: [] })}</>,
  Geography: () => null,
  Marker: ({ children }: { children: React.ReactNode }) => <g>{children}</g>,
}))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}))

import CreatorMatchCard from '@/components/kinnso/CreatorMatchCard'

const creator = extendedCreators[0]

describe('CreatorMatchCard', () => {
  it('renders the computed match score', () => {
    const match = computeMatch(creator)
    render(<CreatorMatchCard creator={creator} saved={false} locale="en" onToggleSave={vi.fn()} onQuickView={vi.fn()} />)
    // ScoreRing renders the numeric score as text.
    expect(screen.getAllByText(String(match.score)).length).toBeGreaterThan(0)
  })

  it('expands the detail panel when "Show details" is clicked', () => {
    render(<CreatorMatchCard creator={creator} saved={false} locale="en" onToggleSave={vi.fn()} onQuickView={vi.fn()} />)
    // Collapsed: the "Top locations" detail heading is absent.
    expect(screen.queryByText('Top locations')).toBeNull()
    fireEvent.click(screen.getByText('Show details'))
    expect(screen.getByText('Top locations')).toBeTruthy()
    expect(screen.getByText('Hide details')).toBeTruthy()
  })

  it('keeps the send brief link locale scoped', () => {
    render(<CreatorMatchCard creator={creator} saved={false} locale="en" onToggleSave={vi.fn()} onQuickView={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Send brief →' }).getAttribute('href')).toBe(
      `/en/merchants/post?creator=${creator.handle}`,
    )
  })

  it('fires onToggleSave and onQuickView', () => {
    const onToggleSave = vi.fn(); const onQuickView = vi.fn()
    render(<CreatorMatchCard creator={creator} saved={false} locale="en" onToggleSave={onToggleSave} onQuickView={onQuickView} />)
    fireEvent.click(screen.getByText('Save'))
    fireEvent.click(screen.getByText(/View profile/))
    expect(onToggleSave).toHaveBeenCalled()
    expect(onQuickView).toHaveBeenCalled()
  })
})
