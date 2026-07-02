// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/articles',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}))
vi.mock('@/lib/auth/useViewerRole', () => ({ useViewerRole: () => 'anon' }))
// app/layout.tsx calls next/font/google factories at module eval; they are not
// callable under vitest (no Next SWC font transform). Stub them to {variable}.
vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: 'font-bricolage' }),
  DM_Sans: () => ({ variable: 'font-dm-sans' }),
  JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
  Fraunces: () => ({ variable: 'font-fraunces' }),
  Inter: () => ({ variable: 'font-inter' }),
}))

import LocaleLayout from '@/app/[locale]/layout'
import en from '@/lib/i18n/messages/en'

describe('[locale]/layout mounts the global shell', () => {
  it('wraps children in SiteChrome (navbar + footer present)', async () => {
    const ui = await LocaleLayout({ children: <div>BODY</div>, params: Promise.resolve({ locale: 'en' }) })
    // The layout returns <html><body>…</body></html>; render the <body>'s children subtree.
    render(<>{ui.props.children.props.children}</>)
    expect(screen.getByText('BODY')).toBeTruthy()
    expect(screen.getByRole('link', { name: en.nav.ctaApply })).toBeTruthy()
    expect(screen.getByText(en.footer.tagline)).toBeTruthy()
  })
})
