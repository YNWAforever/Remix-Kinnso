// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { MerchantsCreatorsView } from '@/components/kinnso/pages/MerchantsCreatorsView'
import { merchantProfile } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

const baseMerchant = { ...merchantProfile, tier: 'growth' as const, searchesLeft: 5, searchLimit: 5, invitesLeft: 3, inviteLimit: 3 }

describe('MerchantsCreatorsView', () => {
  it('renders the header and a recommended list', () => {
    render(<MerchantsCreatorsView merchant={baseMerchant} locale="en" t={{ ...en.merchants, creatorProfile: en.creatorProfile }} />)
    expect(screen.getByRole('heading', { level: 1, name: en.merchants.heading })).toBeTruthy()
    expect(screen.getByRole('tab', { name: new RegExp(en.merchants.tabRecommended) })).toBeTruthy()
  })

  it('shows quota chips from the merchant profile', () => {
    render(<MerchantsCreatorsView merchant={baseMerchant} locale="en" t={{ ...en.merchants, creatorProfile: en.creatorProfile }} />)
    expect(screen.getByText(new RegExp(en.merchants.searchesLeft))).toBeTruthy()
    expect(screen.getByText(new RegExp(en.merchants.invitesLeft))).toBeTruthy()
  })

  it('growth tier: filter button is enabled and opens the drawer', () => {
    render(<MerchantsCreatorsView merchant={baseMerchant} locale="en" t={{ ...en.merchants, creatorProfile: en.creatorProfile }} />)
    const filterBtn = screen.getByRole('button', { name: new RegExp(en.merchants.filter) })
    expect((filterBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(filterBtn)
    expect(screen.getByText(en.merchants.filterTitle)).toBeTruthy()
    expect(screen.queryByText(en.merchants.upgradeToGrowth)).toBeNull()
  })

  it('free tier: locks filters and shows the upgrade prompt', () => {
    render(
      <MerchantsCreatorsView
        merchant={{ ...baseMerchant, tier: 'free' }}
        locale="en"
        t={{ ...en.merchants, creatorProfile: en.creatorProfile }}
      />,
    )
    const filterBtn = screen.getByRole('button', { name: new RegExp(en.merchants.filter) })
    expect((filterBtn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(en.merchants.upgradeToGrowth)).toBeTruthy()
    fireEvent.click(filterBtn)
    expect(screen.queryByText(en.merchants.filterTitle)).toBeNull()
  })

  it('disables Send brief when invitesLeft === 0', () => {
    render(
      <MerchantsCreatorsView
        merchant={{ ...baseMerchant, invitesLeft: 0 }}
        locale="en"
        t={{ ...en.merchants, creatorProfile: en.creatorProfile }}
      />,
    )
    // open the first creator's quick view
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.merchants.viewProfile) })[0])
    const dialog = screen.getByRole('dialog')
    const sendBtn = within(dialog).getByRole('button', { name: new RegExp(en.merchants.sendBrief) })
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true)
  })
})
