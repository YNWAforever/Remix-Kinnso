# Market Passport UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Market Passport visual system across KINNSO public front-of-house pages and creator/merchant product surfaces without changing data, auth, RLS, or mission behavior.

**Architecture:** Add a small set of presentational KINNSO primitives first, then migrate route groups onto them. Server route hosts keep their current fetching/auth gates; client components keep existing local interactivity. Each task lands a testable UI slice with focused accessibility fixes and no Supabase/schema changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `next/font/google`, lucide-react, Vitest, Testing Library, jsdom.

---

## Scope Guard

Do not modify any Supabase schema, migration, RLS policy, server action behavior, mission query semantics, article query semantics, auth callback logic, or payment/settlement logic. This slice is visual system, accessibility, and page composition only.

Start from a dedicated branch before implementation:

```bash
git status --short
git switch -c feat/front-of-house-slice3f-market-passport-ui-system
```

Expected: `git status --short` shows no tracked changes in `kinnso-v3` before the first task.

## File Structure

Create:

- `apps/web/components/kinnso/MarketPassport.tsx` - shared visual primitives: `RouteStamp`, `TicketCard`, `TicketDivider`, `RouteMarkers`, `ReceiptRow`.
- `apps/web/components/kinnso/PassportHeroStack.tsx` - homepage/acquisition hero ticket stack using existing mock creator/mission/ticker data.
- `apps/web/tests/kinnso.MarketPassport.test.tsx` - primitive rendering and semantic behavior.
- `apps/web/tests/kinnso.ScanWidget.test.tsx` - scan input labeling and live region assertions.

Modify:

- `apps/web/app/globals.css` - Market Passport tokens, font utility, ticket utilities, reduced-motion rules.
- `apps/web/app/layout.tsx` - add `Bricolage_Grotesque` display font variable.
- `apps/web/app/[locale]/layout.tsx` - body/page background token alignment only.
- `apps/web/components/kinnso/SiteChrome.tsx` - skip link and stable main target.
- `apps/web/components/kinnso/Navbar.tsx` - mobile menu ARIA, refined brand/chrome styling.
- `apps/web/components/kinnso/LocaleSwitcher.tsx` - focus-visible replacement for `outline-none`.
- `apps/web/components/kinnso/ScanWidget.tsx` - label/name/autocomplete/live region and Market Passport styling.
- `apps/web/components/kinnso/EarningsTicker.tsx` - receipt strip styling and reduced-motion friendly semantics.
- `apps/web/components/kinnso/CreatorCard.tsx` - creator pass styling, explicit image dimensions.
- `apps/web/components/kinnso/GuideCard.tsx` - guide ticket styling, explicit image dimensions.
- `apps/web/components/kinnso/MissionCard.tsx` - mission ticket styling.
- `apps/web/components/kinnso/CreatorMatchCard.tsx` - merchant creator pass/list styling and button accessibility.
- `apps/web/components/kinnso/GuideForm.tsx` - publishing desk styling only.
- `apps/web/components/kinnso/pages/HomeView.tsx` - homepage hero, route timeline, partner stamps, lanes.
- `apps/web/components/kinnso/pages/CreatorsLandingView.tsx` - creator route application page.
- `apps/web/components/kinnso/pages/MerchantsLandingView.tsx` - merchant mission-issuing page.
- `apps/web/components/kinnso/pages/ExploreView.tsx` - guide ticket grid shell.
- `apps/web/components/kinnso/pages/FeedView.tsx` - feed route strip/cards.
- `apps/web/components/kinnso/pages/CreatorProfileView.tsx` - passport-style profile hero.
- `apps/web/app/[locale]/g/[slug]/page.tsx` - guide detail cover hero and ticket overlay.
- `apps/web/components/kinnso/pages/StudioHomeView.tsx` - Studio pass grid.
- `apps/web/components/kinnso/pages/StudioScanView.tsx` - passport inspection styling and input accessibility.
- `apps/web/components/kinnso/pages/CreatorMissionsView.tsx` - ticket queue styling.
- `apps/web/components/kinnso/pages/StudioOffersView.tsx` - affiliate receipt styling.
- `apps/web/components/kinnso/pages/StudioEarningsView.tsx` - receipt ledger styling.
- `apps/web/components/kinnso/pages/MyGuidesView.tsx` - publishing desk list styling.
- `apps/web/components/kinnso/pages/MerchantsCreatorsView.tsx` - brief desk search/filter/pass styling.
- `apps/web/components/kinnso/pages/MissionPostWizard.tsx` - brief builder styling.
- `apps/web/app/[locale]/sign-in/page.tsx` and `apps/web/app/[locale]/sign-up/page.tsx` - auth entry visual alignment.
- `apps/web/app/[locale]/articles/page.tsx`, `apps/web/app/[locale]/articles/[category]/page.tsx`, `apps/web/app/[locale]/articles/[category]/[url]/page.tsx` - token/type/chrome alignment only.
- `apps/web/lib/i18n/messages/en.ts`, `ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts` - copy changes required by visible UI labels/headlines.
- Existing tests under `apps/web/tests/kinnso.*.test.tsx`, `apps/web/tests/layout.siteChrome.test.tsx`, and `apps/web/tests/i18n.locale-parity.test.ts` where assertions need to match the new UI.

Do not modify:

- `packages/db/**`
- `apps/web/lib/missions/**`
- `apps/web/lib/articles/queries.ts`
- `apps/web/lib/supabase/**`
- `supabase/**`

---

### Task 1: Foundation Tokens, Fonts, Chrome, and Primitives

**Files:**
- Create: `apps/web/components/kinnso/MarketPassport.tsx`
- Create: `apps/web/tests/kinnso.MarketPassport.test.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/[locale]/layout.tsx`
- Modify: `apps/web/components/kinnso/SiteChrome.tsx`
- Modify: `apps/web/components/kinnso/Navbar.tsx`
- Modify: `apps/web/components/kinnso/LocaleSwitcher.tsx`
- Modify: `apps/web/tests/kinnso.SiteChrome.test.tsx`
- Modify: `apps/web/tests/kinnso.Navbar.test.tsx`
- Modify: `apps/web/tests/layout.siteChrome.test.tsx`

- [ ] **Step 1: Write primitive tests**

Add `apps/web/tests/kinnso.MarketPassport.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReceiptRow, RouteMarkers, RouteStamp, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'

describe('Market Passport primitives', () => {
  it('renders a route stamp as a labeled visual marker', () => {
    render(<RouteStamp>Creator route / HK -&gt; JP</RouteStamp>)
    expect(screen.getByText('Creator route / HK -> JP')).toBeTruthy()
  })

  it('renders a ticket card with an accessible article label', () => {
    const { container } = render(
      <TicketCard as="article" aria-label="Mission ticket">
        <h2>Tokyo Shibuya mission</h2>
        <TicketDivider />
        <ReceiptRow label="Payout" value="+HK$680" tone="positive" />
      </TicketCard>,
    )
    expect(screen.getByRole('article', { name: 'Mission ticket' })).toBeTruthy()
    expect(screen.getByText('+HK$680')).toBeTruthy()
    expect(container.querySelector('.k-ticket')).toBeTruthy()
  })

  it('marks route marker decoration as hidden from assistive tech', () => {
    const { container } = render(<RouteMarkers points={['HK', 'JP', 'TW']} />)
    const markers = container.querySelector('[aria-hidden="true"]')
    expect(markers).toBeTruthy()
    expect(screen.getByText('HK')).toBeTruthy()
    expect(screen.getByText('JP')).toBeTruthy()
    expect(screen.getByText('TW')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Extend shell tests for skip link and mobile menu ARIA**

Append these assertions to `apps/web/tests/kinnso.SiteChrome.test.tsx`:

```tsx
  it('renders a skip link and stable main target on normal paths', () => {
    renderAt('/en/articles')
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip.getAttribute('href')).toBe('#main-content')
    expect(document.querySelector('#main-content')).toBeTruthy()
  })
```

Append this assertion to `apps/web/tests/kinnso.Navbar.test.tsx`:

```tsx
  it('connects the mobile menu button to the collapsible menu region', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    const button = screen.getByRole('button', { name: en.nav.menuToggle })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe('kinnso-mobile-menu')
  })
```

Update the `next/font/google` mock in `apps/web/tests/layout.siteChrome.test.tsx`:

```tsx
vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: 'font-bricolage' }),
  DM_Sans: () => ({ variable: 'font-dm-sans' }),
  JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
}))
```

- [ ] **Step 3: Run foundation tests and verify they fail**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.MarketPassport.test.tsx apps/web/tests/kinnso.SiteChrome.test.tsx apps/web/tests/kinnso.Navbar.test.tsx apps/web/tests/layout.siteChrome.test.tsx
```

Expected: FAIL because `MarketPassport.tsx` does not exist, skip link is absent, and mobile menu ARIA attributes are absent.

- [ ] **Step 4: Create Market Passport primitives**

Create `apps/web/components/kinnso/MarketPassport.tsx`:

```tsx
import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PolymorphicProps<T extends ElementType> = {
  as?: T
  children: ReactNode
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

export function RouteStamp({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('k-route-stamp', className)}>
      {children}
    </span>
  )
}

export function TicketDivider({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('k-ticket-divider', className)} />
}

export function TicketCard<T extends ElementType = 'div'>({
  as,
  children,
  className,
  ...props
}: PolymorphicProps<T>) {
  const Component = (as || 'div') as ElementType
  return (
    <Component className={cn('k-ticket', className)} {...props}>
      {children}
    </Component>
  )
}

export function RouteMarkers({
  points,
  className,
}: {
  points: string[]
  className?: string
}) {
  return (
    <div className={cn('k-route-markers', className)}>
      <span aria-hidden="true" className="k-route-markers__rail">
        {points.map((point) => (
          <span key={point} className="k-route-markers__dot" />
        ))}
      </span>
      <span className="k-route-markers__labels">
        {points.map((point) => (
          <span key={point}>{point}</span>
        ))}
      </span>
    </div>
  )
}

export function ReceiptRow({
  label,
  value,
  meta,
  tone = 'default',
  className,
}: {
  label: ReactNode
  value: ReactNode
  meta?: ReactNode
  tone?: 'default' | 'positive' | 'accent'
  className?: string
}) {
  return (
    <div className={cn('k-receipt-row', className)}>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-kinnso-ink">{label}</div>
        {meta && <div className="mt-0.5 text-xs text-kinnso-muted">{meta}</div>}
      </div>
      <div
        className={cn(
          'k-mono shrink-0 text-sm font-black tabular-nums text-kinnso-ink',
          tone === 'positive' && 'text-kinnso-green',
          tone === 'accent' && 'text-kinnso-orange',
        )}
      >
        {value}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update global tokens and utilities**

Modify `apps/web/app/globals.css`:

```css
@theme {
  --color-orange: #F26A1F;
  --color-orange-dark: #C24E0E;
  --color-amber: #F4BD50;
  --color-cream: #F8F1E6;
  --color-cream-2: #EFE3D2;
  --color-ink: #211B16;
  --color-muted: #6D6257;
  --color-success: #2F8F5C;
  --color-danger: #D24A3B;
  --color-info: #2E6FB8;

  --radius-card: 8px;
  --radius-ticket: 18px;
  --radius-chip: 8px;
  --radius-pill: 999px;

  --font-display: var(--font-bricolage), var(--font-dm-sans), "WQY Zen Hei", sans-serif;
  --font-sans: var(--font-dm-sans), "WQY Zen Hei", sans-serif;
  --font-mono: var(--font-jetbrains-mono), monospace;

  --color-kinnso-orange: #F26A1F;
  --color-kinnso-orangeDark: #C24E0E;
  --color-kinnso-amber: #F4BD50;
  --color-kinnso-cream: #F8F1E6;
  --color-kinnso-cream2: #EFE3D2;
  --color-kinnso-ink: #211B16;
  --color-kinnso-muted: #6D6257;
  --color-kinnso-green: #2F8F5C;
  --color-kinnso-red: #D24A3B;
  --color-kinnso-blue: #2E6FB8;
  --color-kinnso-edge: #DED5C7;
}
```

Add these utilities in the existing `@layer components` block:

```css
  .k-display      { font-family: var(--font-display); letter-spacing: -0.02em; }
  .k-page-band    { @apply bg-kinnso-cream text-kinnso-ink; }
  .k-ticket       { @apply rounded-ticket border border-kinnso-edge bg-white shadow-kinnso; }
  .k-ticket-soft  { @apply rounded-ticket border border-kinnso-edge bg-kinnso-cream shadow-kinnso; }
  .k-route-stamp  { @apply inline-flex w-fit items-center rounded-pill border border-kinnso-ink bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-kinnso-ink; }
  .k-ticket-divider {
    height: 1px;
    background: repeating-linear-gradient(90deg, var(--color-kinnso-edge) 0 8px, transparent 8px 14px);
  }
  .k-receipt-row  { @apply flex items-center justify-between gap-4 border-t border-dashed border-kinnso-edge py-3; }
  .k-route-markers { @apply grid gap-2 text-xs font-bold uppercase tracking-wider text-kinnso-muted; }
  .k-route-markers__rail { @apply flex items-center justify-between gap-3; }
  .k-route-markers__dot { @apply h-2.5 w-2.5 rounded-full bg-kinnso-orange; }
  .k-route-markers__dot:nth-child(2) { background: var(--color-kinnso-green); }
  .k-route-markers__dot:nth-child(3) { background: var(--color-kinnso-amber); }
  .k-route-markers__labels { @apply flex items-center justify-between gap-3; }
```

Add this reduced-motion block near the existing animation definitions:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 6: Wire the display font**

Modify `apps/web/app/layout.tsx`:

```tsx
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from 'next/font/google'

export const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
})

export const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-dm-sans',
})

export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
})

export const fontVariables = `${bricolage.variable} ${dmSans.variable} ${jetBrainsMono.variable}`
```

Keep the existing `RootLayout` export unchanged.

- [ ] **Step 7: Add skip link and stable main target**

Modify `apps/web/components/kinnso/SiteChrome.tsx`:

```tsx
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-kinnso-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
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
```

Leave the bare auth/onboarding branch as `if (bare) return <>{children}</>`.

- [ ] **Step 8: Add mobile menu ARIA and refined chrome**

Modify the mobile button and menu in `apps/web/components/kinnso/Navbar.tsx`:

```tsx
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full text-kinnso-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={t.menuToggle}
          aria-expanded={open}
          aria-controls="kinnso-mobile-menu"
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
```

Add `id="kinnso-mobile-menu"` to the mobile menu wrapper.

- [ ] **Step 9: Fix locale switcher focus**

Modify the `select` class in `apps/web/components/kinnso/LocaleSwitcher.tsx`:

```tsx
className="rounded-pill border border-kinnso-edge bg-white px-2.5 py-1.5 text-xs font-semibold text-kinnso-ink outline-none transition focus-visible:border-kinnso-orange focus-visible:ring-2 focus-visible:ring-kinnso-orange/30"
```

- [ ] **Step 10: Run foundation tests**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.MarketPassport.test.tsx apps/web/tests/kinnso.SiteChrome.test.tsx apps/web/tests/kinnso.Navbar.test.tsx apps/web/tests/layout.siteChrome.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Run lint/typecheck for touched foundation files**

Run:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
```

Expected: both pass.

- [ ] **Step 12: Commit foundation**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx apps/web/app/[locale]/layout.tsx apps/web/components/kinnso/MarketPassport.tsx apps/web/components/kinnso/SiteChrome.tsx apps/web/components/kinnso/Navbar.tsx apps/web/components/kinnso/LocaleSwitcher.tsx apps/web/tests/kinnso.MarketPassport.test.tsx apps/web/tests/kinnso.SiteChrome.test.tsx apps/web/tests/kinnso.Navbar.test.tsx apps/web/tests/layout.siteChrome.test.tsx
git commit -m "feat(web): add Market Passport UI foundation"
```

---

### Task 2: Homepage and Scan Entry

**Files:**
- Create: `apps/web/components/kinnso/PassportHeroStack.tsx`
- Create: `apps/web/tests/kinnso.ScanWidget.test.tsx`
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx`
- Modify: `apps/web/components/kinnso/ScanWidget.tsx`
- Modify: `apps/web/components/kinnso/EarningsTicker.tsx`
- Modify: `apps/web/components/kinnso/CreatorCard.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/tests/kinnso.HomeView.test.tsx`

- [ ] **Step 1: Add ScanWidget accessibility tests**

Create `apps/web/tests/kinnso.ScanWidget.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ScanWidget from '@/components/kinnso/ScanWidget'

afterEach(cleanup)

describe('ScanWidget', () => {
  it('labels the handle field and exposes the async result as a live region', () => {
    vi.useFakeTimers()
    render(<ScanWidget />)
    const input = screen.getByLabelText('Social handle')
    expect(input.getAttribute('name')).toBe('socialHandle')
    expect(input.getAttribute('autoComplete')).toBe('username')
    fireEvent.change(input, { target: { value: 'maywanders' } })
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))
    vi.advanceTimersByTime(1700)
    expect(screen.getByRole('status')).toBeTruthy()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Update homepage tests for Market Passport thesis**

In `apps/web/tests/kinnso.HomeView.test.tsx`, change the hero assertion to:

```tsx
expect(screen.getByRole('heading', { level: 1, name: 'Trips that pay their way.' })).toBeTruthy()
expect(screen.getByText('Creator route / HK -> JP -> TW')).toBeTruthy()
expect(document.querySelector('.k-ticket')).toBeTruthy()
```

Keep the CTA/link assertions already in the test.

- [ ] **Step 3: Run homepage tests and verify they fail**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.ScanWidget.test.tsx apps/web/tests/kinnso.HomeView.test.tsx
```

Expected: FAIL because ScanWidget has no label/live region and homepage copy/ticket UI is not implemented.

- [ ] **Step 4: Update homepage i18n copy**

Set these English keys in `apps/web/lib/i18n/messages/en.ts`:

```ts
home: {
  heroPill: 'Creator route / HK -> JP -> TW',
  heroTitle: 'Trips that pay their way.',
  heroSubtitle: 'KINNSO scans your social route, proves your city authority, and matches you with missions that turn guides into income.',
  applyCta: 'Apply as Creator',
  howHeading: 'Your route to paid travel work',
  howSub: 'A real sequence: scan, qualify, match, publish, earn.',
  step1Title: 'Scan a handle',
  step1Desc: 'Connect IG, Threads, TikTok, or YouTube signals.',
  step2Title: 'Prove your cities',
  step2Desc: 'KINNSO maps travel posts, places, and audience fit.',
  step3Title: 'Match with missions',
  step3Desc: 'Merchants send briefs based on your route and score.',
  step4Title: 'Publish and earn',
  step4Desc: 'Turn guides, partner links, and briefs into payouts.',
  merchantWall: 'Partner stamps',
  featuredHeading: 'Creator passes this week',
  featuredSub: 'Real handles, city proof, and score signals.',
  featuredSeeAll: 'See all',
  travelersTitle: 'For Travelers',
  travelersDesc: 'Follow real creators, save guide tickets, and book the exact same spots.',
  travelersCta: 'Explore Guides',
  merchantsTitle: 'For Merchants',
  merchantsDesc: 'Issue a mission ticket and match with creators who already own the route.',
  merchantsCta: 'Post a Mission',
}
```

Mirror the same keys in the six non-English files with localized or English-fallback text. Keep every key present in every locale.

- [ ] **Step 5: Create hero ticket stack**

Create `apps/web/components/kinnso/PassportHeroStack.tsx`:

```tsx
import { ReceiptRow, RouteMarkers, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import { creators, missions, tickerSeed } from '@/lib/creator-mock'

export function PassportHeroStack() {
  const creator = creators[0]
  const mission = missions[0]
  const payout = tickerSeed[0]

  return (
    <div className="relative min-h-[360px]">
      <TicketCard className="absolute left-0 top-4 w-[68%] rotate-[-5deg] bg-kinnso-ink p-5 text-white">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-white/60">
          <span>Studio pass</span>
          <span>{creator.tier}</span>
        </div>
        <TicketDivider className="my-4 opacity-40" />
        <div className="text-4xl font-black leading-none">{creator.name}</div>
        <div className="k-mono mt-3 text-sm text-kinnso-amber">@{creator.handle}</div>
        <div className="mt-2 text-sm text-white/70">{creator.homeCity} / {creator.category}</div>
      </TicketCard>

      <TicketCard className="absolute right-0 top-16 w-[78%] rotate-[2deg] p-5">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-kinnso-muted">
          <span>Social scan</span>
          <span>{creator.score}/100</span>
        </div>
        <TicketDivider className="my-4" />
        <div className="k-display text-5xl font-black text-kinnso-orange">{creator.guides}</div>
        <div className="text-sm font-bold text-kinnso-ink">published guides</div>
        <RouteMarkers className="mt-5" points={['HK', 'JP', 'TW']} />
      </TicketCard>

      <TicketCard className="absolute bottom-2 left-8 w-[72%] rotate-[-2deg] p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-kinnso-muted">Payout receipt</div>
        <ReceiptRow
          label={mission.title}
          meta={payout.ago}
          value={`+HK$${payout.amount.toLocaleString('en-HK')}`}
          tone="positive"
        />
      </TicketCard>
    </div>
  )
}

export default PassportHeroStack
```

- [ ] **Step 6: Make ScanWidget accessible and passport-styled**

Modify `apps/web/components/kinnso/ScanWidget.tsx`:

```tsx
const inputId = "home-social-handle"
```

Use this input block:

```tsx
<label htmlFor={inputId} className="sr-only">Social handle</label>
<div className="flex flex-1 items-center rounded-pill bg-white shadow-kinnso ring-1 ring-kinnso-edge focus-within:ring-2 focus-within:ring-kinnso-orange/40">
  <span aria-hidden="true" className="k-mono pl-5 pr-1 text-kinnso-muted">@</span>
  <input
    id={inputId}
    name="socialHandle"
    autoComplete="username"
    className="k-mono flex-1 bg-transparent py-3 pr-4 text-sm text-kinnso-ink outline-none placeholder:text-kinnso-muted/60"
    placeholder="maywanders..."
    value={handle}
    onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
    onKeyDown={(e) => e.key === "Enter" && runScan()}
  />
</div>
```

Wrap the done state:

```tsx
{status === "done" && (
  <div className="mt-6" role="status" aria-live="polite">
    <DnaCard dna={dna} metrics={metrics} compact />
  </div>
)}
```

Mark spinner/icons in the button `aria-hidden="true"`.

- [ ] **Step 7: Replace homepage hero and sections**

Modify `apps/web/components/kinnso/pages/HomeView.tsx`:

- Import `PassportHeroStack`, `RouteStamp`, `TicketCard`, `RouteMarkers`.
- Remove the orange gradient hero layers.
- Use `k-page-band` and `k-display`.
- Replace the empty right column with `<PassportHeroStack />`.
- Render the existing ordered `steps` as a route timeline with `TicketCard` and `RouteMarkers`.
- Render partner names as `RouteStamp` elements.
- Render featured creators through the updated `CreatorCard`.
- Render traveler/merchant lanes as `TicketCard` wrappers with real `<img>` tags that include `alt`, `width`, `height`, and `loading="lazy"`.

Use this hero structure:

```tsx
<section className="k-page-band relative isolate overflow-hidden">
  <div className="k-container grid gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
    <div>
      <RouteStamp>{t.heroPill}</RouteStamp>
      <h1 className="k-display mt-5 max-w-3xl text-5xl font-black leading-[0.92] text-kinnso-ink md:text-7xl">
        {t.heroTitle}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-kinnso-muted">{t.heroSubtitle}</p>
      <div className="mt-8 max-w-xl"><ScanWidget /></div>
      <Link href={p("/sign-up")} className="k-btn-primary mt-6 inline-flex">
        {t.applyCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
      </Link>
    </div>
    <PassportHeroStack />
  </div>
</section>
```

- [ ] **Step 8: Make ticker reduced-motion friendly**

Modify `apps/web/components/kinnso/EarningsTicker.tsx`:

```tsx
<div className="relative overflow-hidden bg-kinnso-ink py-3 text-white" aria-label="Recent creator payouts">
  <div className="flex animate-marquee whitespace-nowrap motion-reduce:animate-none">
```

Use `it.amount.toLocaleString('en-HK')`.

- [ ] **Step 9: Run homepage and i18n tests**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.ScanWidget.test.tsx apps/web/tests/kinnso.HomeView.test.tsx apps/web/tests/i18n.locale-parity.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit homepage**

```bash
git add apps/web/components/kinnso/PassportHeroStack.tsx apps/web/components/kinnso/pages/HomeView.tsx apps/web/components/kinnso/ScanWidget.tsx apps/web/components/kinnso/EarningsTicker.tsx apps/web/components/kinnso/CreatorCard.tsx apps/web/lib/i18n/messages/*.ts apps/web/tests/kinnso.ScanWidget.test.tsx apps/web/tests/kinnso.HomeView.test.tsx apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(web): redesign homepage with Market Passport system"
```

---

### Task 3: Public Acquisition Pages and Shared Cards

**Files:**
- Modify: `apps/web/components/kinnso/CreatorCard.tsx`
- Modify: `apps/web/components/kinnso/GuideCard.tsx`
- Modify: `apps/web/components/kinnso/MissionCard.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorsLandingView.tsx`
- Modify: `apps/web/components/kinnso/pages/MerchantsLandingView.tsx`
- Modify: `apps/web/components/kinnso/pages/ExploreView.tsx`
- Modify: `apps/web/components/kinnso/pages/FeedView.tsx`
- Modify: `apps/web/tests/kinnso.CreatorsLandingView.test.tsx`
- Modify: `apps/web/tests/kinnso.MerchantsLandingView.test.tsx`
- Modify: `apps/web/tests/kinnso.ExploreView.test.tsx`
- Modify: `apps/web/tests/kinnso.FeedView.test.tsx`

- [ ] **Step 1: Extend card/page tests for ticket classes and image dimensions**

In each listed test, add one visual-system assertion after the existing render:

```tsx
expect(document.querySelector('.k-ticket')).toBeTruthy()
```

Create `apps/web/tests/kinnso.CreatorCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import CreatorCard from '@/components/kinnso/CreatorCard'
import { creators } from '@/lib/creator-mock'

describe('CreatorCard', () => {
  it('renders as a creator pass with explicit avatar dimensions', () => {
    render(<CreatorCard c={creators[0]} locale="en" />)
    const img = screen.getByRole('img', { name: creators[0].name })
    expect(img.getAttribute('width')).toBe('80')
    expect(img.getAttribute('height')).toBe('80')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run public card/page tests and verify they fail where markup is not migrated**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.CreatorCard.test.tsx apps/web/tests/kinnso.CreatorsLandingView.test.tsx apps/web/tests/kinnso.MerchantsLandingView.test.tsx apps/web/tests/kinnso.ExploreView.test.tsx apps/web/tests/kinnso.FeedView.test.tsx
```

Expected: FAIL for ticket class and avatar dimensions.

- [ ] **Step 3: Convert shared cards to ticket primitives**

Modify `CreatorCard`, `GuideCard`, and `MissionCard` to use `TicketCard`, `TicketDivider`, `RouteStamp`, and `ReceiptRow`.

Creator card rules:

- outer `Link` remains the same href contract.
- inner surface is `<TicketCard as="article" className="...">`.
- avatar has `width={80}`, `height={80}`, and `loading="lazy"`.
- handle remains in `k-mono`.
- score/tier remains visible.

Guide card rules:

- cover image has `width={640}`, `height={480}`, `loading="lazy"`.
- city/author/saves live in receipt rows or route-stamp metadata.
- bookmark icon is `aria-hidden="true"`.

Mission card rules:

- mission category is a `RouteStamp`.
- payout row uses `ReceiptRow` with `tone="positive"`.
- calendar and map icons are `aria-hidden="true"`.

- [ ] **Step 4: Redesign creators landing**

Modify `CreatorsLandingView.tsx`:

- Replace gradient hero with `k-page-band`.
- Use `RouteStamp` for `t.heroPill`.
- Use `k-display` for hero title.
- Add a ticket/pass visual block using featured creator data.
- Render steps as a route timeline with the existing `steps` array.
- Keep the `/sign-up` CTA href unchanged.

- [ ] **Step 5: Redesign merchants landing**

Modify `MerchantsLandingView.tsx`:

- Replace dark gradient hero with paper/ink mission-ticket composition.
- Use `MissionCard` for mission samples after it has been converted.
- Preserve `/merchants/post` and `/merchants/creators` links.
- Use the same route/ticket vocabulary as the homepage, but make copy and layout focus on issuing briefs.

- [ ] **Step 6: Align Explore and Feed**

Modify `ExploreView.tsx` and `FeedView.tsx`:

- Keep existing data props and links.
- Use `k-page-band` or `k-container` with `RouteStamp` headings.
- Render `GuideCard` ticket surfaces.
- Keep empty states visible and actionable.

- [ ] **Step 7: Run public page tests**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.CreatorCard.test.tsx apps/web/tests/kinnso.CreatorsLandingView.test.tsx apps/web/tests/kinnso.MerchantsLandingView.test.tsx apps/web/tests/kinnso.ExploreView.test.tsx apps/web/tests/kinnso.FeedView.test.tsx
pnpm --filter web lint
pnpm --filter web typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit public acquisition pages**

```bash
git add apps/web/components/kinnso/CreatorCard.tsx apps/web/components/kinnso/GuideCard.tsx apps/web/components/kinnso/MissionCard.tsx apps/web/components/kinnso/pages/CreatorsLandingView.tsx apps/web/components/kinnso/pages/MerchantsLandingView.tsx apps/web/components/kinnso/pages/ExploreView.tsx apps/web/components/kinnso/pages/FeedView.tsx apps/web/tests/kinnso.CreatorCard.test.tsx apps/web/tests/kinnso.CreatorsLandingView.test.tsx apps/web/tests/kinnso.MerchantsLandingView.test.tsx apps/web/tests/kinnso.ExploreView.test.tsx apps/web/tests/kinnso.FeedView.test.tsx
git commit -m "feat(web): apply Market Passport to public discovery pages"
```

---

### Task 4: Creator Profile and Guide Detail

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorProfileView.tsx`
- Modify: `apps/web/app/[locale]/g/[slug]/page.tsx`
- Modify: `apps/web/components/kinnso/BrandContactCard.tsx`
- Modify: `apps/web/components/kinnso/PostThumbnailGrid.tsx`
- Modify: `apps/web/components/kinnso/CityChip.tsx`
- Modify: `apps/web/tests/kinnso.CreatorProfileView.test.tsx`
- Modify: `apps/web/tests/g.slug.host.test.tsx`

- [ ] **Step 1: Add profile/detail visual assertions**

In `kinnso.CreatorProfileView.test.tsx`, add:

```tsx
expect(document.querySelector('.k-ticket')).toBeTruthy()
expect(screen.getByText(/score/i)).toBeTruthy()
```

In `g.slug.host.test.tsx`, add an assertion that the rendered guide page contains a guide-ticket overlay marker:

```tsx
expect(document.querySelector('.k-route-stamp')).toBeTruthy()
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.CreatorProfileView.test.tsx apps/web/tests/g.slug.host.test.tsx
```

Expected: FAIL on ticket/stamp selectors.

- [ ] **Step 3: Redesign CreatorProfileView hero**

Modify `CreatorProfileView.tsx`:

- Keep existing `creator`, `role`, `locale`, `embedded`, and `t` props.
- Use the existing banner image as a real `<img>` with `alt=""`, width/height attributes, and `loading="lazy"` if below first viewport.
- Place avatar/name/handle/tier/score inside `TicketCard`.
- Use `RouteMarkers` for top city route when available.
- Keep follow/contact buttons and merchant brand card behavior unchanged.

- [ ] **Step 4: Convert profile support components**

Modify:

- `BrandContactCard.tsx` - use `TicketCard`, keep href contracts.
- `PostThumbnailGrid.tsx` - add explicit `width`/`height` to thumbnails, keep captions and metrics.
- `CityChip.tsx` - keep button behavior, use route-stamp-like styling, keep `aria-hidden` on flags.

- [ ] **Step 5: Redesign guide detail hero**

Modify `apps/web/app/[locale]/g/[slug]/page.tsx`:

- Keep metadata and data fetching unchanged.
- Keep cover image visible as the actual guide cover.
- Add a `TicketCard` overlay containing title, author, city, and saves.
- Use `RouteStamp` for city/category signal.
- Keep existing links to author/profile.

- [ ] **Step 6: Run profile/detail tests**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.CreatorProfileView.test.tsx apps/web/tests/g.slug.host.test.tsx
pnpm --filter web lint
pnpm --filter web typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit creator/profile/detail**

```bash
git add apps/web/components/kinnso/pages/CreatorProfileView.tsx apps/web/app/[locale]/g/[slug]/page.tsx apps/web/components/kinnso/BrandContactCard.tsx apps/web/components/kinnso/PostThumbnailGrid.tsx apps/web/components/kinnso/CityChip.tsx apps/web/tests/kinnso.CreatorProfileView.test.tsx apps/web/tests/g.slug.host.test.tsx
git commit -m "feat(web): redesign creator profiles and guide detail tickets"
```

---

### Task 5: Creator Studio Product Surfaces

**Files:**
- Modify: `apps/web/components/kinnso/pages/StudioHomeView.tsx`
- Modify: `apps/web/components/kinnso/pages/StudioScanView.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
- Modify: `apps/web/components/kinnso/pages/StudioOffersView.tsx`
- Modify: `apps/web/components/kinnso/pages/StudioEarningsView.tsx`
- Modify: `apps/web/components/kinnso/pages/MyGuidesView.tsx`
- Modify: `apps/web/components/kinnso/GuideForm.tsx`
- Modify: `apps/web/tests/kinnso.StudioHomeView.test.tsx`
- Modify: `apps/web/tests/kinnso.StudioScanView.test.tsx`
- Modify: `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`
- Modify: `apps/web/tests/kinnso.StudioOffersView.test.tsx`
- Modify: `apps/web/tests/kinnso.StudioEarningsView.test.tsx`
- Modify: `apps/web/tests/kinnso.MyGuidesView.test.tsx`
- Modify: `apps/web/tests/kinnso.GuideForm.test.tsx`

- [ ] **Step 1: Add Studio ticket assertions**

Add this assertion to each listed Studio view test after render:

```tsx
expect(document.querySelector('.k-ticket')).toBeTruthy()
```

For `StudioScanView`, add a specific input assertion:

```tsx
expect(screen.getByLabelText(en.studio.instagram)).toBeTruthy()
```

- [ ] **Step 2: Run Studio tests and verify they fail**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.StudioHomeView.test.tsx apps/web/tests/kinnso.StudioScanView.test.tsx apps/web/tests/kinnso.CreatorMissionsView.test.tsx apps/web/tests/kinnso.StudioOffersView.test.tsx apps/web/tests/kinnso.StudioEarningsView.test.tsx apps/web/tests/kinnso.MyGuidesView.test.tsx apps/web/tests/kinnso.GuideForm.test.tsx
```

Expected: FAIL where ticket primitives and the StudioScan input label are absent.

- [ ] **Step 3: Redesign StudioHomeView**

Modify `StudioHomeView.tsx`:

- Keep the `tools` array and hrefs unchanged.
- Wrap tool links in `TicketCard`.
- Use `RouteStamp` for live/soon status.
- Keep `Live` and `Soon` text from i18n.
- Mark icons `aria-hidden="true"`.

- [ ] **Step 4: Redesign StudioScanView**

Modify `StudioScanView.tsx`:

- Keep demo/real modes and routing unchanged.
- Convert intro/scanning/report sections to `TicketCard`.
- Ensure the Instagram input label remains visible or programmatic with `htmlFor`.
- Add `name="instagramHandle"` and `autoComplete="username"` to the input.
- Add `role="status"` and `aria-live="polite"` around scanning progress and report-ready transition.
- Keep `CityDetailDrawer`, `ShareDnaDialog`, and existing mock filtering logic unchanged.

- [ ] **Step 5: Redesign missions/offers/earnings queues**

Modify:

- `CreatorMissionsView.tsx` - queue cards as mission tickets.
- `StudioOffersView.tsx` - offers as affiliate receipts, partner links in `ReceiptRow`.
- `StudioEarningsView.tsx` - totals as receipt cards and table rows with ticket dividers.

Preserve all button labels, action callbacks, disabled states, `router.refresh()`, and `role="alert"` behavior.

- [ ] **Step 6: Redesign guides list/form**

Modify:

- `MyGuidesView.tsx` - list items as guide tickets.
- `GuideForm.tsx` - publishing desk layout using ticket surfaces, no validation logic changes.

Keep all field labels and validation errors unchanged.

- [ ] **Step 7: Run Studio tests**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.StudioHomeView.test.tsx apps/web/tests/kinnso.StudioScanView.test.tsx apps/web/tests/kinnso.CreatorMissionsView.test.tsx apps/web/tests/kinnso.StudioOffersView.test.tsx apps/web/tests/kinnso.StudioEarningsView.test.tsx apps/web/tests/kinnso.MyGuidesView.test.tsx apps/web/tests/kinnso.GuideForm.test.tsx
pnpm --filter web lint
pnpm --filter web typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Studio product surfaces**

```bash
git add apps/web/components/kinnso/pages/StudioHomeView.tsx apps/web/components/kinnso/pages/StudioScanView.tsx apps/web/components/kinnso/pages/CreatorMissionsView.tsx apps/web/components/kinnso/pages/StudioOffersView.tsx apps/web/components/kinnso/pages/StudioEarningsView.tsx apps/web/components/kinnso/pages/MyGuidesView.tsx apps/web/components/kinnso/GuideForm.tsx apps/web/tests/kinnso.StudioHomeView.test.tsx apps/web/tests/kinnso.StudioScanView.test.tsx apps/web/tests/kinnso.CreatorMissionsView.test.tsx apps/web/tests/kinnso.StudioOffersView.test.tsx apps/web/tests/kinnso.StudioEarningsView.test.tsx apps/web/tests/kinnso.MyGuidesView.test.tsx apps/web/tests/kinnso.GuideForm.test.tsx
git commit -m "feat(web): apply Market Passport to Studio surfaces"
```

---

### Task 6: Merchant Product, Auth Entry, and Article Alignment

**Files:**
- Modify: `apps/web/components/kinnso/pages/MerchantsCreatorsView.tsx`
- Modify: `apps/web/components/kinnso/CreatorMatchCard.tsx`
- Modify: `apps/web/components/kinnso/CreatorFilterDrawer.tsx`
- Modify: `apps/web/components/kinnso/pages/MissionPostWizard.tsx`
- Modify: `apps/web/app/[locale]/sign-in/page.tsx`
- Modify: `apps/web/app/[locale]/sign-up/page.tsx`
- Modify: `apps/web/app/[locale]/articles/page.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/page.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify: `apps/web/tests/kinnso.MerchantsCreatorsView.test.tsx`
- Modify: `apps/web/tests/kinnso.CreatorMatchCard.test.tsx`
- Modify: `apps/web/tests/kinnso.MissionPostWizard.test.tsx`
- Modify: `apps/web/tests/auth.form.test.tsx`
- Modify: `apps/web/tests/auth.signup-page.test.tsx`

- [ ] **Step 1: Add merchant/auth/article assertions**

Add `expect(document.querySelector('.k-ticket')).toBeTruthy()` to:

- `kinnso.MerchantsCreatorsView.test.tsx`
- `kinnso.CreatorMatchCard.test.tsx`
- `kinnso.MissionPostWizard.test.tsx`

For `auth.signup-page.test.tsx`, keep behavioral assertions and add one class assertion to the rendered page container:

```tsx
expect(document.querySelector('.k-auth-card')).toBeTruthy()
```

- [ ] **Step 2: Run tests and verify failures**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.MerchantsCreatorsView.test.tsx apps/web/tests/kinnso.CreatorMatchCard.test.tsx apps/web/tests/kinnso.MissionPostWizard.test.tsx apps/web/tests/auth.form.test.tsx apps/web/tests/auth.signup-page.test.tsx
```

Expected: FAIL for missing Market Passport classes only.

- [ ] **Step 3: Redesign merchant creator search**

Modify `MerchantsCreatorsView.tsx` and `CreatorMatchCard.tsx`:

- Search/filter bar becomes a route control strip.
- Creator match cards use `TicketCard`.
- Quick-view sheet remains the same component contract.
- Search input gets a programmatic label if one is missing.
- Save/view/send brief buttons keep their existing behavior and hrefs.

- [ ] **Step 4: Redesign filter drawer and mission post wizard**

Modify:

- `CreatorFilterDrawer.tsx` - token alignment, focus rings, ticket section dividers.
- `MissionPostWizard.tsx` - brief builder sections as ticket blocks, no validation/state changes.

Keep all mission type, visibility, compensation, and submit logic unchanged.

- [ ] **Step 5: Align auth entry pages**

Modify:

- `sign-in/page.tsx`
- `sign-up/page.tsx`

Rules:

- Keep redirect behavior and Supabase user check unchanged.
- Wrap content in a centered `TicketCard` or `k-auth-card`.
- Use `k-display` heading and Market Passport background.
- Keep form components and error handling unchanged.

- [ ] **Step 6: Align article pages without full editorial redesign**

Modify:

- `articles/page.tsx`
- `articles/[category]/page.tsx`
- `articles/[category]/[url]/page.tsx`

Rules:

- Keep query calls and metadata unchanged.
- Apply `k-container`, `k-display`, `RouteStamp`, and token colors.
- Keep ArticleCard and ArticleBlockRenderer behavior unchanged.
- Do not add new article content features.

- [ ] **Step 7: Run merchant/auth/article tests**

Run:

```bash
pnpm --filter web test -- apps/web/tests/kinnso.MerchantsCreatorsView.test.tsx apps/web/tests/kinnso.CreatorMatchCard.test.tsx apps/web/tests/kinnso.MissionPostWizard.test.tsx apps/web/tests/auth.form.test.tsx apps/web/tests/auth.signup-page.test.tsx apps/web/tests/articles.queries.test.ts apps/web/tests/queries.detail.test.ts
pnpm --filter web lint
pnpm --filter web typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit merchant/auth/article alignment**

```bash
git add apps/web/components/kinnso/pages/MerchantsCreatorsView.tsx apps/web/components/kinnso/CreatorMatchCard.tsx apps/web/components/kinnso/CreatorFilterDrawer.tsx apps/web/components/kinnso/pages/MissionPostWizard.tsx apps/web/app/[locale]/sign-in/page.tsx apps/web/app/[locale]/sign-up/page.tsx apps/web/app/[locale]/articles/page.tsx apps/web/app/[locale]/articles/[category]/page.tsx apps/web/app/[locale]/articles/[category]/[url]/page.tsx apps/web/tests/kinnso.MerchantsCreatorsView.test.tsx apps/web/tests/kinnso.CreatorMatchCard.test.tsx apps/web/tests/kinnso.MissionPostWizard.test.tsx apps/web/tests/auth.form.test.tsx apps/web/tests/auth.signup-page.test.tsx apps/web/tests/articles.queries.test.ts apps/web/tests/queries.detail.test.ts
git commit -m "feat(web): align merchant and entry surfaces with Market Passport"
```

---

### Task 7: Full Verification and Visual QA

**Files:**
- No planned file changes. If verification exposes a defect, reproduce it with a focused test in the relevant task area and commit that fix separately.

- [ ] **Step 1: Run complete automated gates**

Run:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

Expected: all pass.

- [ ] **Step 2: Start local dev server**

Run:

```bash
pnpm --filter web dev -- --port 3000
```

Expected: Next.js dev server serves the app at `http://localhost:3000`.

- [ ] **Step 3: Verify desktop pages in browser**

Open these URLs at desktop width:

- `http://localhost:3000/en`
- `http://localhost:3000/en/creators`
- `http://localhost:3000/en/merchants`
- `http://localhost:3000/en/explore`
- `http://localhost:3000/en/feed`
- `http://localhost:3000/en/studio`
- `http://localhost:3000/en/studio/scan`
- `http://localhost:3000/en/merchants/creators`

Expected:

- No blank page.
- Header remains usable.
- No incoherent overlapping text.
- Ticket stack is visible on homepage.
- Orange is present as action/accent, not as full-section gradient flood.
- Product pages remain dense and usable, not marketing-only.

- [ ] **Step 4: Verify mobile pages in browser**

Repeat the same URLs at a mobile width around 390px.

Expected:

- Mobile nav button exposes expanded/collapsed state.
- Hero text wraps without overflow.
- Ticket stack does not cover CTA or scan input.
- Horizontal scrollers are intentional and do not hide required actions.
- Forms remain usable.

- [ ] **Step 5: Verify reduced motion**

In browser devtools, emulate `prefers-reduced-motion: reduce`.

Expected:

- Marquee stops or becomes static.
- Ticket and hover animations do not run continuously.
- Spinners used for real loading remain understandable.

- [ ] **Step 6: Run palette scan**

Run:

```bash
rg -n "#|bg-kinnso-|text-kinnso-|from-kinnso|via-kinnso|to-kinnso" apps/web/app apps/web/components/kinnso | sed -n '1,220p'
```

Expected:

- No large orange gradient hero remains in `HomeView`, `CreatorsLandingView`, or `MerchantsLandingView`.
- Cream/orange classes appear alongside ink, green, gold/amber, blue, and edge tokens.

- [ ] **Step 7: Final status**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean working tree, with the task commits visible.
