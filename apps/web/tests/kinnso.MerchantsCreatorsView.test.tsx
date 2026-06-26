// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { MerchantsCreatorsView } from '@/components/kinnso/pages/MerchantsCreatorsView'
import type { RankedCreator } from '@/lib/merchants/relevance'
import type { MerchantTier } from '@/lib/merchants/tier-policy'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const t = en.merchantSearch

const r = (handle: string, niches: string[] = ['food'], lastGuideAt: string | null = '2026-01-01'): RankedCreator => ({
  creator: { handle, name: handle.toUpperCase(), bio: '', niches, audienceGeos: ['HK'], languages: ['ja'], platforms: ['instagram'], guideCount: 2, lastGuideAt },
  matched: 0,
  reasons: [],
})

const facets = { niches: ['food', 'coffee'], audienceGeos: ['HK', 'TW'], languages: ['ja', 'en'], platforms: ['instagram', 'youtube'] }

const ranked: RankedCreator[] = [r('a'), r('b'), r('c'), r('d'), r('e')]

const baseProps = {
  locale: 'en' as const,
  t,
  ranked,
  tier: 'growth' as MerchantTier,
  facets,
  savedHandles: [] as string[],
  workingHandles: [] as string[],
  invitesRemaining: 5,
  publishedMissions: [{ id: 'm1', title: 'Spring campaign' }],
  onInvite: vi.fn(),
  onSave: vi.fn(),
  onUnsave: vi.fn(),
  onNote: vi.fn(),
}

const renderView = (over: Partial<typeof baseProps> = {}) =>
  render(<MerchantsCreatorsView {...baseProps} {...over} />)

describe('MerchantsCreatorsView', () => {
  it('renders the heading and a recommended tab', () => {
    renderView()
    expect(screen.getByRole('heading', { level: 1, name: t.heading })).toBeTruthy()
    expect(screen.getByRole('tab', { name: new RegExp(t.tabRecommended) })).toBeTruthy()
  })

  it('growth tier: shows all results, filter button enabled, no upgrade banner', () => {
    renderView()
    expect(screen.getAllByRole('button', { name: new RegExp(t.viewProfile) }).length).toBe(5)
    const filterBtn = screen.getByRole('button', { name: new RegExp(t.filter) })
    expect((filterBtn as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(t.upgradeTitle)).toBeNull()
    fireEvent.click(filterBtn)
    expect(screen.getByText(t.filterNiches)).toBeTruthy()
  })

  it('free tier: caps results to 3, locks the filter button, shows the upgrade banner', () => {
    renderView({ tier: 'free' })
    expect(screen.getAllByRole('button', { name: new RegExp(t.viewProfile) }).length).toBe(3)
    const filterBtn = screen.getByRole('button', { name: new RegExp(t.filter) })
    expect((filterBtn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(t.upgradeTitle)).toBeTruthy()
    expect(screen.getByText(t.resultsCapped)).toBeTruthy()
    fireEvent.click(filterBtn)
    expect(screen.queryByText(t.filterNiches)).toBeNull()
  })

  it('shows invitations remaining', () => {
    renderView({ invitesRemaining: 4 })
    expect(screen.getByText(t.invitesLeft.replace('{count}', '4'))).toBeTruthy()
  })

  it('Saved tab badge reflects only saved creators', () => {
    renderView({ savedHandles: ['b', 'd'] })
    // The Saved tab badge derives from savedHandles, not the full list.
    expect(within(screen.getByRole('tab', { name: new RegExp(t.tabSaved) })).getByText('2')).toBeTruthy()
  })

  it('Working tab badge reflects only working creators', () => {
    renderView({ workingHandles: ['c'] })
    expect(within(screen.getByRole('tab', { name: new RegExp(t.tabWorking) })).getByText('1')).toBeTruthy()
  })

  it('Send brief opens a mission picker that calls onInvite(missionId, handle)', () => {
    const onInvite = vi.fn()
    renderView({ onInvite, publishedMissions: [{ id: 'm1', title: 'Spring campaign' }] })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.sendBrief) })[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(t.pickMissionTitle)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spring campaign' }))
    expect(onInvite).toHaveBeenCalledWith('m1', 'a')
  })

  it('mission picker shows an empty state when there are no published missions', () => {
    renderView({ publishedMissions: [] })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.sendBrief) })[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(t.pickMissionEmpty)).toBeTruthy()
  })

  it('Save on a recommended card calls onSave with the handle', () => {
    const onSave = vi.fn()
    renderView({ onSave })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${t.save}$`) })[0])
    expect(onSave).toHaveBeenCalledWith('a')
  })

  it('opens drawers without Radix dialog accessibility warnings', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      renderView()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.filter) }))
      cleanup()
      renderView()
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.sendBrief) })[0])
      const warningText = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().join('\n')
      expect(warningText).not.toMatch(/DialogContent|DialogTitle|aria-describedby/)
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})
