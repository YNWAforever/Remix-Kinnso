// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { StudioScanView } from '@/components/kinnso/pages/StudioScanView'
import { getCreator, sampleDna } from '@/lib/creator-mock'
import { buildDemoIdentity, buildStudioIdentity, type HandleRow } from '@/lib/studio/identity'
import en from '@/lib/i18n/messages/en'

const metrics = getCreator('maywanders')!

function renderDemo() {
  return render(
    <StudioScanView
      mode="demo"
      identity={buildDemoIdentity(metrics, '2026-06-16T00:00:00Z')}
      dna={sampleDna}
      metrics={metrics}
      isSample={false}
      t={en.studio}
    />,
  )
}

const handles: HandleRow[] = [{ platform: 'instagram', handle: 'maygram', url: null }]
function renderReal() {
  return render(
    <StudioScanView
      mode="real"
      identity={buildStudioIdentity({ display_name: 'May Wong' }, handles, sampleDna, '2026-06-01T00:00:00Z')}
      dna={sampleDna}
      metrics={metrics}
      isSample
      t={en.studio}
    />,
  )
}

describe('StudioScanView — demo mode', () => {
  it('renders the report headings and the DNA core panel', () => {
    renderDemo()
    expect(screen.getByText(en.studio.reportReadyHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.engagementOverTime)).toBeTruthy()
    expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.matchedForYou)).toBeTruthy()
  })

  it('shows the mock identity and the publish/share footer; no sample note', () => {
    renderDemo()
    expect(screen.getByText(metrics.name)).toBeTruthy()
    expect(screen.getByText(`@${metrics.handle}`)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.studio.publishProfile })).toBeTruthy()
    expect(screen.queryByText(en.studio.sampleNote)).toBeNull()
  })

  it('toggles the share dialog open', () => {
    renderDemo()
    fireEvent.click(screen.getByRole('button', { name: en.studio.shareDnaCard }))
    expect(screen.getByText(en.studio.shareDialogTitle)).toBeTruthy()
  })
})

describe('StudioScanView — real mode', () => {
  it('renders the real identity (display_name + instagram handle) and the DNA core', () => {
    renderReal()
    expect(screen.getByText('May Wong')).toBeTruthy()
    expect(screen.getByText('@maygram')).toBeTruthy()
    expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()
    // Assert the DNA bio (unique prose, rendered only by DnaCorePanel). Do NOT
    // assert a niche here: sampleDna.niches ('Coffee', 'City Walk') collide with
    // the maywanders content-mix donut legend, which renders ungated in real mode.
    expect(screen.getByText(sampleDna.bio)).toBeTruthy()
  })

  it('shows the sample note and hides the publish/share footer', () => {
    renderReal()
    expect(screen.getByText(en.studio.sampleNote)).toBeTruthy()
    expect(screen.getAllByText(en.studio.sampleBadge).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: en.studio.publishProfile })).toBeNull()
    expect(screen.queryByRole('button', { name: en.studio.shareDnaCard })).toBeNull()
  })

  it('hides the rescan control (no fake-scan in real mode)', () => {
    renderReal()
    expect(screen.queryByRole('button', { name: en.studio.rescan })).toBeNull()
  })
})
