// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { StudioScanView } from '@/components/kinnso/pages/StudioScanView'
import { getCreator, computeBreakdown, sampleDna } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

const creator = getCreator('maywanders')!

function renderView() {
  return render(
    <StudioScanView creator={creator} dna={sampleDna} breakdown={computeBreakdown(creator)} t={en.studio} />,
  )
}

describe('StudioScanView', () => {
  it('skips the scan animation and renders the DNA report headings', () => {
    renderView()
    expect(screen.getByText(en.studio.reportReadyHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.engagementOverTime)).toBeTruthy()
    expect(screen.getByText(en.studio.placesCovered)).toBeTruthy()
    expect(screen.getByText(en.studio.matchedForYou)).toBeTruthy()
  })

  it('renders the creator identity and score from props', () => {
    renderView()
    expect(screen.getByText(creator.name)).toBeTruthy()
    expect(screen.getByText(`@${creator.handle}`)).toBeTruthy()
    expect(screen.getByText(String(creator.score))).toBeTruthy()
  })

  it('toggles the share dialog open', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: en.studio.shareDnaCard }))
    expect(screen.getByText(en.studio.shareDialogTitle)).toBeTruthy()
  })
})
