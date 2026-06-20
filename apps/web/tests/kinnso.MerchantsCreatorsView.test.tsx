// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { MerchantsCreatorsView } from '@/components/kinnso/pages/MerchantsCreatorsView'
import { merchantProfile, type MerchantProfile } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

const baseMerchant: MerchantProfile = { ...merchantProfile, tier: 'growth', searchesLeft: 5, searchLimit: 5, invitesLeft: 3, inviteLimit: 3 }

describe('MerchantsCreatorsView', () => {
  const renderView = (merchant: MerchantProfile = baseMerchant) =>
    render(<MerchantsCreatorsView merchant={merchant} locale="en" t={{ ...en.merchants, creatorProfile: en.creatorProfile }} />)

  it('renders the header and a recommended list', () => {
    renderView()
    expect(screen.getByRole('heading', { level: 1, name: en.merchants.heading })).toBeTruthy()
    expect(screen.getByRole('tab', { name: new RegExp(en.merchants.tabRecommended) })).toBeTruthy()
  })

  it('shows quota chips from the merchant profile', () => {
    renderView()
    expect(screen.getByText(new RegExp(en.merchants.searchesLeft))).toBeTruthy()
    expect(screen.getByText(new RegExp(en.merchants.invitesLeft))).toBeTruthy()
  })

  it('growth tier: filter button is enabled and opens the drawer', () => {
    renderView()
    const filterBtn = screen.getByRole('button', { name: new RegExp(en.merchants.filter) })
    expect((filterBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(filterBtn)
    expect(screen.getByText(en.merchants.filterTitle)).toBeTruthy()
    expect(screen.queryByText(en.merchants.upgradeToGrowth)).toBeNull()
  })

  it('opens drawers without Radix dialog accessibility warnings', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      renderView()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(en.merchants.filter) }))
      cleanup()

      renderView()
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.merchants.viewProfile) })[0])

      const warningText = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().join('\n')
      expect(warningText).not.toMatch(/DialogContent|DialogTitle|aria-describedby/)
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('renders with Market Passport ticket chrome', () => {
    renderView()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('free tier: locks filters and shows the upgrade prompt', () => {
    renderView({ ...baseMerchant, tier: 'free' })
    const filterBtn = screen.getByRole('button', { name: new RegExp(en.merchants.filter) })
    expect((filterBtn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(en.merchants.upgradeToGrowth)).toBeTruthy()
    fireEvent.click(filterBtn)
    expect(screen.queryByText(en.merchants.filterTitle)).toBeNull()
  })

  it('disables Send brief when invitesLeft === 0', () => {
    renderView({ ...baseMerchant, invitesLeft: 0 })
    // open the first creator's quick view
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.merchants.viewProfile) })[0])
    const dialog = screen.getByRole('dialog')
    const sendBtn = within(dialog).getByRole('button', { name: new RegExp(en.merchants.sendBrief) })
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true)
  })
})
