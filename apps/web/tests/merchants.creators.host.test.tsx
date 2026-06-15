// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), notFound: vi.fn() }))

import MerchantsCreatorsPage from '@/app/[locale]/merchants/creators/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/merchants/creators host', () => {
  it('renders the search surface with the mock merchant tier/quota', async () => {
    const ui = await MerchantsCreatorsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.merchants.heading })).toBeTruthy()
    expect(screen.getByText(new RegExp(en.merchants.searchesLeft))).toBeTruthy()
  })
})
