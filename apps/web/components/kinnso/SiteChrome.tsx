'use client'
import { usePathname } from 'next/navigation'
import Navbar from '@/components/kinnso/Navbar'
import Footer from '@/components/kinnso/Footer'
import { useViewerRole } from '@/lib/auth/useViewerRole'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

// Path suffixes (locale-agnostic) that render WITHOUT the marketing chrome.
const BARE_SUFFIXES = ['/sign-in', '/sign-up', '/creator']

/**
 * Global shell. Role is resolved CLIENT-side (useViewerRole) so the server
 * layout stays cookie-free and SP1 articles keep static generation; the nav
 * CTA may flip once after hydration. Chrome hides on auth/onboarding flows.
 */
export function SiteChrome({
  locale, nav, footer, children,
}: {
  locale: Locale
  nav: Messages['nav']
  footer: Messages['footer']
  children: React.ReactNode
}) {
  const pathname = usePathname() || `/${locale}`
  const role = useViewerRole()
  const bare = BARE_SUFFIXES.some((s) => pathname === `/${locale}${s}` || pathname.startsWith(`/${locale}${s}/`))

  if (bare) return <>{children}</>

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-kinnso-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
      >
        Skip to content
      </a>
      <Navbar locale={locale} role={role} t={nav} />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <Footer locale={locale} t={footer} />
    </>
  )
}

export default SiteChrome
