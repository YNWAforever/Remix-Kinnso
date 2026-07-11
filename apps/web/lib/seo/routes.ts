// Single source of truth for which locale-relative routes are public vs private.
// Consumed by app/sitemap.ts (the indexable public surface) and app/robots.ts (the
// crawl disallow list) so the two can never drift. The per-page `noindexMetadata()`
// guards cover the same private trees from the metadata side — keep them in sync here.

// Public marketing pages: indexable and listed in the sitemap. Paths are locale-relative
// — '' is the locale home, the rest start with '/'.
// NOTE: '/destinations' intentionally does NOT join this list yet. The current
// /[locale]/destinations page (apps/web/app/[locale]/destinations/page.tsx) is still
// the R1A noindexed placeholder — joining MARKETING_PATHS ahead of the real indexable
// page (Task 7) would make app/sitemap.ts submit a URL that the page itself tells
// crawlers not to index ("Submitted URL marked noindex"). Follow the /sessions
// precedent: join MARKETING_PATHS in the SAME commit that ships the real, indexable page.
export const MARKETING_PATHS = [
  '', '/explore', '/creators', '/agent', '/about', '/contact', '/merchants', '/legal/creator-terms', '/for-creators', '/for-merchants', '/sessions',
] as const

// Private/app route trees that must never be crawled. These are robots.txt path globs
// relative to the locale segment: the leading "slash-star-slash" matches any "/[locale]/"
// prefix, and a trailing "$" anchors an exact match (so "/*/creator$" blocks the
// onboarding host without catching the public "/creators" directory).
export const ROBOTS_DISALLOW = [
  '/*/studio', '/*/admin', '/*/ops',
  '/*/sign-in', '/*/sign-up', '/*/creator$',
  '/*/merchants/dashboard', '/*/merchants/apply',
  '/*/trips',
] as const
