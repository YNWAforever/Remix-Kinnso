// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const { productState } = vi.hoisted(() => ({
  productState: {
    agentLive: true,
    bookingLive: false,
    sessionsLive: false,
  },
}))

afterEach(() => {
  cleanup()
  productState.bookingLive = false
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/articles',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}))
vi.mock('@/lib/auth/useViewerRole', () => ({ useViewerRole: () => 'anon' }))
vi.mock('@/lib/product-state', () => ({
  getProductState: async () => productState,
}))
// app/layout.tsx calls next/font/google factories at module eval; they are not
// callable under vitest (no Next SWC font transform). Stub them to {variable}.
vi.mock('next/font/google', () => ({
  JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
  Fraunces: () => ({ variable: 'font-fraunces' }),
  Inter: () => ({ variable: 'font-inter' }),
}))

import LocaleLayout, { revalidate } from '@/app/[locale]/layout'
import en from '@/lib/i18n/messages/en'

describe('[locale]/layout mounts the global shell', () => {
  it('wraps children in SiteChrome (navbar + footer present)', async () => {
    const ui = await LocaleLayout({ children: <div>BODY</div>, params: Promise.resolve({ locale: 'en' }) })
    // The layout returns <html><body>…</body></html>; render the <body>'s children subtree.
    render(<>{ui.props.children.props.children}</>)
    expect(screen.getByText('BODY')).toBeTruthy()
    expect(screen.getByRole('link', { name: en.nav.signUp })).toBeTruthy()
    expect(screen.getByText(en.footer.tagline)).toBeTruthy()
    expect(document.querySelector('header a[href="/en/sessions"]')).toBeNull()
  })

  it('ISR-revalidates product state every 5 minutes', () => {
    expect(revalidate).toBe(300)
  })
  it('passes bookingLive from product state to the footer', async () => {
    productState.bookingLive = true
    const ui = await LocaleLayout({
      children: <div>BODY</div>,
      params: Promise.resolve({ locale: 'en' }),
    })
    render(<>{ui.props.children.props.children}</>)
    expect(screen.getByRole('link', { name: en.footer.lTrips })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.footer.lSaved })).toBeTruthy()
  })
})
