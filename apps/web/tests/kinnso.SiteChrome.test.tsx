// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const { pathname } = vi.hoisted(() => ({ pathname: { value: '/en' } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => pathname.value,
  useSearchParams: () => new URLSearchParams(),
}))
// Force a deterministic role so chrome presence is the only variable.
vi.mock('@/lib/auth/useViewerRole', () => ({ useViewerRole: () => 'anon' }))

import { SiteChrome } from '@/components/kinnso/SiteChrome'
import en from '@/lib/i18n/messages/en'
import zhHk from '@/lib/i18n/messages/zh-hk'

function renderAt(path: string) {
  pathname.value = path
  return render(
    <SiteChrome locale="en" nav={en.nav} footer={en.footer}>
      <div>PAGE_BODY</div>
    </SiteChrome>,
  )
}

describe('SiteChrome', () => {
  it('renders Navbar + Footer + children on a normal path', () => {
    renderAt('/en/articles')
    expect(screen.getByText('PAGE_BODY')).toBeTruthy()
    expect(screen.getByRole('link', { name: en.nav.ctaApply })).toBeTruthy()       // navbar
    expect(screen.getByText(en.footer.tagline)).toBeTruthy()                        // footer
  })

  it.each(['/en/sign-in', '/en/sign-up', '/en/creator'])('hides chrome on %s', (path) => {
    renderAt(path)
    expect(screen.getByText('PAGE_BODY')).toBeTruthy()
    expect(screen.queryByRole('link', { name: en.nav.ctaApply })).toBeNull()
    expect(screen.queryByText(en.footer.tagline)).toBeNull()
  })

  it('renders a skip link and stable main target on normal paths', () => {
    renderAt('/en/articles')
    const skip = screen.getByRole('link', { name: en.nav.skipToContent })
    expect(skip.getAttribute('href')).toBe('#main-content')
    const main = document.querySelector('#main-content')
    expect(main).toBeTruthy()
    // The skip target must be programmatically focusable so focus actually lands there.
    expect(main?.getAttribute('tabindex')).toBe('-1')
  })

  it('localizes the skip link (drive-by fix: was hardcoded English)', () => {
    pathname.value = '/zh-hk/articles'
    render(
      <SiteChrome locale="zh-hk" nav={zhHk.nav} footer={zhHk.footer}>
        <div>PAGE_BODY</div>
      </SiteChrome>,
    )
    expect(screen.getByRole('link', { name: zhHk.nav.skipToContent }).getAttribute('href')).toBe('#main-content')
  })
})
