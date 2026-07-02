# Phase R1A — Design System + Site Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "editorial travel journal" design system (kinnso2-\* tokens, Fraunces/Inter typography, k2-\* primitives) and rebuild the site chrome (navbar + footer) on the new traveller-first IA, including designed noindex placeholders for `/destinations` and `/sessions` — without touching any page that R1B/R1C will migrate.

**Architecture:** New `kinnso2-*` Tailwind v4 `@theme` tokens and `k2-*` component classes are added ALONGSIDE the legacy `kinnso-*`/`k-*` system in `apps/web/app/globals.css` (legacy is deleted in R1C's final task; the `kinnso2`/`k2` prefix makes that cleanup a grep). Fraunces (variable display serif) + Inter (body) join the existing next/font exports in `apps/web/app/layout.tsx` with CJK-safe fallback stacks. `Navbar`/`Footer`/`SiteChrome` are rebuilt in place (same files, same props, same client-side `useViewerRole` contract so public pages stay statically generable); two new locale routes render designed editorial placeholders via new `components/kinnso/editorial/` primitives.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 (`@theme` in `globals.css`, no config file) · next/font/google · custom i18n (7 locales, typed `Messages`) · Vitest 4 + Testing Library (jsdom).

**Branch:** `feat/redesign-r1a`, cut from `feat/product-revision-program` HEAD (`85c0216`) so the master spec + this plan ride along. NOT from `main`.

**Scope guard (do NOT do in R1A):** no homepage changes (R1B), no `/for-creators`/`/for-merchants` landings, no page re-skins, no mock-data removal, no `platform_stats`/`testimonials` migrations, no kinnso-\* token removal (all R1B/R1C). The "For Merchants" nav link points at `/merchants` today; R1C swaps the href to `/for-merchants`.

---

## File Structure

### Created
| Path (repo-relative) | Responsibility |
|---|---|
| `apps/web/components/kinnso/editorial/SectionShell.tsx` | Editorial band: max-width container + vertical rhythm |
| `apps/web/components/kinnso/editorial/Eyebrow.tsx` | Small-caps kicker label |
| `apps/web/components/kinnso/editorial/EditorialCard.tsx` | Photo-top magazine card with hairline border |
| `apps/web/app/[locale]/destinations/page.tsx` | Designed noindex placeholder for /destinations |
| `apps/web/app/[locale]/sessions/page.tsx` | Designed noindex placeholder for /sessions |
| `apps/web/tests/design.k2-tokens.test.ts` | Executable contract for kinnso2 tokens + k2 utilities |
| `apps/web/tests/layout.fonts.test.ts` | Asserts Fraunces/Inter variables are wired |
| `apps/web/tests/kinnso.editorial.test.tsx` | Unit tests for the three editorial primitives |
| `apps/web/tests/destinations.host.test.tsx` | Host test for the /destinations placeholder |
| `apps/web/tests/sessions.host.test.tsx` | Host test for the /sessions placeholder |

### Modified
| Path | Change |
|---|---|
| `apps/web/app/globals.css` | ADD kinnso2 `@theme` tokens (after the `:root` `--k-*` block, line 70) + k2 utilities (inside `@layer components`, lines 99–141); legacy untouched |
| `apps/web/app/layout.tsx` (lines 1–28) | Add Fraunces + Inter font exports; extend `fontVariables` |
| `apps/web/lib/i18n/messages/en.ts` | nav keys (iface lines 434–440, values 1279–1285), footer keys (441–446 / 1286–1293), new `destinationsSoon`/`sessionsSoon` groups (after `comingSoon`, iface line 467 / values 1343–1347) |
| `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Same key additions, translated |
| `apps/web/components/kinnso/Navbar.tsx` | Rebuild: new IA + editorial skin (full rewrite, same props) |
| `apps/web/components/kinnso/Footer.tsx` | Rebuild: 4-column IA + dark-ink editorial skin (full rewrite, same props) |
| `apps/web/components/kinnso/SiteChrome.tsx` (lines 33–38) | Skip link uses `nav.skipToContent` + new-token skin |
| `apps/web/tests/i18n.locale-parity.test.ts` (line 15) | Register `destinationsSoon`, `sessionsSoon` in GROUPS |
| `apps/web/tests/kinnso.Navbar.test.tsx` | Rewritten for new IA |
| `apps/web/tests/kinnso.Footer.test.tsx` | Rewritten for new columns |
| `apps/web/tests/kinnso.SiteChrome.test.tsx` | Localized skip-link assertions |
| `apps/web/tests/layout.siteChrome.test.tsx` (font mock, lines 15–19) | Mock gains Fraunces + Inter |

### Deliberately NOT modified
- `apps/web/lib/seo/routes.ts` — `/destinations` and `/sessions` are noindexed placeholders: NOT added to `MARKETING_PATHS` (no sitemap entry) and NOT added to `ROBOTS_DISALLOW` (noindex meta is the gate; they become real public pages in R5/R6).
- `apps/web/app/[locale]/layout.tsx` — body keeps `bg-cream text-ink` (legacy) until R1B re-skins the homepage; chrome components carry their own kinnso2 backgrounds.
- `apps/web/app/[locale]/_components/ComingSoonPage.tsx` — still used by `/studio/inbox`; untouched.

**Test environment note:** `apps/web` vitest requires `apps/web/.env.test` (see repo CLAUDE.md); `vitest.setup.ts` throws without it. All test commands in this plan are scoped file runs: `cd apps/web && npx vitest run tests/<file>` — NEVER `pnpm --filter web test -- <pattern>` (runs all ~899 tests and times out).

---

## Task 0 — Branch setup

**Files:** none (git only)

- [ ] Confirm you are on the program branch at the expected HEAD:
  ```bash
  git -C . branch --show-current   # expect: feat/product-revision-program
  git log --oneline -1             # expect: 85c0216 docs(product): product revision program master design (R1-R6)
  ```
- [ ] Confirm the working tree is clean apart from this plan file (`git status --short` shows only `docs/superpowers/plans/2026-07-02-phase-r1a-design-system-chrome.md` if it hasn't been committed yet).
- [ ] Create the phase branch FROM the program branch (spec + plan ride along):
  ```bash
  git checkout -b feat/redesign-r1a
  ```
- [ ] If the plan file is untracked, commit it now:
  ```bash
  git add docs/superpowers/plans/2026-07-02-phase-r1a-design-system-chrome.md
  git commit -m "docs(web): R1A design-system + chrome implementation plan" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 1 — kinnso2 design tokens (alongside legacy)

**Files:**
- Create: `apps/web/tests/design.k2-tokens.test.ts`
- Modify: `apps/web/app/globals.css` (insert after the `:root` raw-HSL block that ends at line 70 with `--k-blue:        211 60% 45%;` `}`)

- [ ] Write the failing token-contract test. Create `apps/web/tests/design.k2-tokens.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { readFileSync } from 'node:fs'
  import { join } from 'node:path'

  // R1A token contract: the kinnso2-* editorial system must exist ALONGSIDE the
  // legacy kinnso-* system (legacy is removed only in R1C's final task). String
  // assertions on globals.css keep this executable without a CSS pipeline.
  // NOTE: token declarations in globals.css use exactly one space after the colon
  // so these substring checks hold.
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

  describe('kinnso2 editorial design tokens (R1A)', () => {
    it.each([
      ['--color-kinnso2-paper', '#FAF6EF'],
      ['--color-kinnso2-ink', '#26201A'],
      ['--color-kinnso2-clay', '#B9482B'],
      ['--color-kinnso2-clay-deep', '#93361F'],
      ['--color-kinnso2-sand', '#E8DCC8'],
      ['--color-kinnso2-moss', '#4A5D43'],
      ['--color-kinnso2-sun', '#D99A2B'],
      ['--color-kinnso2-line', '#D8CDBB'],
    ])('defines %s: %s', (token, hex) => {
      expect(css).toContain(`${token}: ${hex}`)
    })

    it('keeps the legacy kinnso-* tokens until the R1C sweep', () => {
      expect(css).toContain('--color-kinnso-orange: #F26A1F')
      expect(css).toContain('--color-kinnso-cream: #F8F1E6')
    })
  })
  ```

- [ ] Run it and watch it fail:
  ```bash
  cd apps/web && npx vitest run tests/design.k2-tokens.test.ts
  ```
  Expected: 8 failures ("defines --color-kinnso2-…"), 1 pass (legacy tokens).

- [ ] Implement the tokens. In `apps/web/app/globals.css`, immediately AFTER this existing block (lines 58–70):

  ```css
  /* Raw HSL channels for components that build colors inline via hsl(var(--k-*)). */
  :root {
    --k-orange:      20 89% 53%;
    --k-orange-dark: 21 87% 41%;
    --k-amber:       35 90% 56%;
    --k-cream:       33 100% 96%;
    --k-cream2:      35 100% 92%;
    --k-ink:         33 21% 10%;
    --k-muted:       36 8% 45%;
    --k-green:       147 50% 37%;
    --k-red:         6 64% 53%;
    --k-blue:        211 60% 45%;
  }
  ```

  insert this new block (exactly one space after each colon — the test depends on it):

  ```css
  /* ------------------------------------------------------------------------- */
  /* R1A "editorial travel journal" tokens (kinnso2-*).                         */
  /* Added ALONGSIDE the legacy kinnso-* market-passport system so unmigrated   */
  /* pages keep rendering; the final R1C task deletes the legacy block.         */
  /* Grep "kinnso2" / "k2-" to find every new-system usage.                     */
  /* ------------------------------------------------------------------------- */
  @theme {
    --color-kinnso2-paper: #FAF6EF; /* warm cream page background */
    --color-kinnso2-ink: #26201A; /* deep warm brown-black text */
    --color-kinnso2-clay: #B9482B; /* terracotta primary */
    --color-kinnso2-clay-deep: #93361F; /* terracotta hover / pressed */
    --color-kinnso2-sand: #E8DCC8; /* soft panel & chip background */
    --color-kinnso2-moss: #4A5D43; /* sage accent */
    --color-kinnso2-sun: #D99A2B; /* ochre highlight */
    --color-kinnso2-line: #D8CDBB; /* hairline borders */
  }
  ```

- [ ] Re-run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/design.k2-tokens.test.ts
  ```
- [ ] Commit:
  ```bash
  git add apps/web/app/globals.css apps/web/tests/design.k2-tokens.test.ts
  git commit -m "feat(web): add kinnso2 editorial design tokens alongside legacy palette" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 2 — Typography: Fraunces + Inter with CJK-safe fallbacks

**Files:**
- Create: `apps/web/tests/layout.fonts.test.ts`
- Modify: `apps/web/app/layout.tsx` (whole file, currently 28 lines: Bricolage_Grotesque + DM_Sans + JetBrains_Mono)
- Modify: `apps/web/app/globals.css` (append two font tokens inside the kinnso2 `@theme` block from Task 1)
- Modify: `apps/web/tests/layout.siteChrome.test.tsx` (font mock, lines 15–19)
- Test: `apps/web/tests/layout.fonts.test.ts`, `apps/web/tests/design.k2-tokens.test.ts`, `apps/web/tests/layout.siteChrome.test.tsx`

- [ ] Write the failing test. Create `apps/web/tests/layout.fonts.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect, vi } from 'vitest'

  // next/font/google factories are not callable under vitest (no SWC font
  // transform) — stub them, same pattern as tests/layout.siteChrome.test.tsx.
  // Each stub echoes the `variable` option it was called with, so the assertions
  // below bind layout.tsx's option strings to the var(--font-*) references that
  // globals.css uses.
  vi.mock('next/font/google', () => ({
    Bricolage_Grotesque: (o: { variable: string }) => ({ variable: o.variable }),
    DM_Sans: (o: { variable: string }) => ({ variable: o.variable }),
    JetBrains_Mono: (o: { variable: string }) => ({ variable: o.variable }),
    Fraunces: (o: { variable: string }) => ({ variable: o.variable }),
    Inter: (o: { variable: string }) => ({ variable: o.variable }),
  }))

  import { fontVariables } from '@/app/layout'

  describe('R1A typography wiring', () => {
    it('exposes Fraunces + Inter variables alongside the legacy fonts', () => {
      for (const v of ['--font-fraunces', '--font-inter', '--font-bricolage', '--font-dm-sans', '--font-jetbrains-mono']) {
        expect(fontVariables).toContain(v)
      }
    })
  })
  ```

- [ ] Run it and watch it fail:
  ```bash
  cd apps/web && npx vitest run tests/layout.fonts.test.ts
  ```
  Expected failure: `fontVariables` does not contain `--font-fraunces`.

- [ ] Implement. Replace the ENTIRE contents of `apps/web/app/layout.tsx` with:

  ```tsx
  import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono, Fraunces, Inter } from 'next/font/google'

  // Brand fonts wired via next/font so the @theme font tokens in globals.css resolve
  // to real font files. The `<html>` element lives in app/[locale]/layout.tsx, so these
  // variable classes are applied there.
  //
  // R1A adds the editorial pair (Fraunces display serif + Inter body) as NEW variables;
  // Bricolage / DM Sans / JetBrains Mono stay until the R1C sweep retires the legacy
  // kinnso-* system.
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

  // Fraunces and Inter are variable fonts — no `weight` list needed; next/font
  // serves the variable axis. Fraunces only covers Latin: CJK/Thai fall through
  // to the system serif stacks declared in the --font-k2-display token.
  export const fraunces = Fraunces({
    subsets: ['latin'],
    variable: '--font-fraunces',
  })

  export const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
  })

  export const fontVariables = `${bricolage.variable} ${dmSans.variable} ${jetBrainsMono.variable} ${fraunces.variable} ${inter.variable}`

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return children
  }
  ```

- [ ] Add the font tokens to `apps/web/app/globals.css`. Inside the kinnso2 `@theme` block from Task 1, after the line `--color-kinnso2-line: #D8CDBB; /* hairline borders */`, add:

  ```css

    /* Editorial type. Fraunces covers Latin; CJK falls through the shared stack
       below. Font matching is per-glyph and ignores lang, so the stack is
       TC-first — correct for zh-hk/zh-tw, but on Apple platforms ja/ko text
       matches the TC faces' kanji/hanja glyphs before Hiragino/Nanum is reached
       (ja renders in Chinese glyph forms). Acceptable for R1A; revisit with
       :lang() overrides if ja/ko typography matters later. Thai has no serif
       tradition and falls to generic `serif`. On Windows, zh/ko coverage relies
       on the generic fallback resolving per the html lang attribute. */
    --font-k2-display: var(--font-fraunces), 'Noto Serif TC', 'Songti TC', 'Noto Serif SC', 'Songti SC', 'Hiragino Mincho ProN', 'Yu Mincho', 'Nanum Myeongjo', 'AppleMyungjo', serif;
    --font-k2-sans: var(--font-inter), 'PingFang TC', 'PingFang SC', 'Hiragino Sans', 'Noto Sans TC', 'Noto Sans SC', 'Noto Sans KR', 'Noto Sans Thai', system-ui, sans-serif;
  ```

  (Tailwind v4 generates `font-k2-display` / `font-k2-sans` utilities from these.)

- [ ] Extend the token test. In `apps/web/tests/design.k2-tokens.test.ts`, add inside the `describe` block, after the legacy-tokens `it`:

  ```ts
    it('registers the k2 font tokens with CJK-safe fallback stacks', () => {
      expect(css).toContain('--font-k2-display: var(--font-fraunces)')
      expect(css).toContain("'Noto Serif TC'")
      expect(css).toContain('--font-k2-sans: var(--font-inter)')
      expect(css).toContain("'Noto Sans Thai'")
    })
  ```

- [ ] Update the existing layout test's font mock (it will otherwise crash: `Fraunces is not a function`). In `apps/web/tests/layout.siteChrome.test.tsx`, replace:

  ```ts
  vi.mock('next/font/google', () => ({
    Bricolage_Grotesque: () => ({ variable: 'font-bricolage' }),
    DM_Sans: () => ({ variable: 'font-dm-sans' }),
    JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
  }))
  ```

  with:

  ```ts
  vi.mock('next/font/google', () => ({
    Bricolage_Grotesque: () => ({ variable: 'font-bricolage' }),
    DM_Sans: () => ({ variable: 'font-dm-sans' }),
    JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
    Fraunces: () => ({ variable: 'font-fraunces' }),
    Inter: () => ({ variable: 'font-inter' }),
  }))
  ```

- [ ] Run all three — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/layout.fonts.test.ts tests/design.k2-tokens.test.ts tests/layout.siteChrome.test.tsx
  ```
- [ ] Commit:
  ```bash
  git add apps/web/app/layout.tsx apps/web/app/globals.css apps/web/tests/layout.fonts.test.ts apps/web/tests/design.k2-tokens.test.ts apps/web/tests/layout.siteChrome.test.tsx
  git commit -m "feat(web): wire Fraunces + Inter editorial fonts with CJK-safe fallbacks" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 3 — k2 utilities + editorial primitives

**Files:**
- Create: `apps/web/components/kinnso/editorial/SectionShell.tsx`, `apps/web/components/kinnso/editorial/Eyebrow.tsx`, `apps/web/components/kinnso/editorial/EditorialCard.tsx`
- Create: `apps/web/tests/kinnso.editorial.test.tsx`
- Modify: `apps/web/app/globals.css` (append utilities inside `@layer components`, whose last rule is `.k-route-markers__labels { … }` at line 140)
- Modify: `apps/web/tests/design.k2-tokens.test.ts` (utility assertions)
- Test: `apps/web/tests/kinnso.editorial.test.tsx`, `apps/web/tests/design.k2-tokens.test.ts`

- [ ] Write the failing component test. Create `apps/web/tests/kinnso.editorial.test.tsx` with EXACTLY:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'
  import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
  import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
  import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'

  afterEach(cleanup)

  describe('editorial primitives (R1A)', () => {
    it('SectionShell wraps children in the k2 container band', () => {
      render(
        <SectionShell>
          <p>INNER</p>
        </SectionShell>,
      )
      const inner = screen.getByText('INNER')
      expect(inner.closest('.k2-container')).toBeTruthy()
      expect(inner.closest('section')).toBeTruthy()
    })

    it('SectionShell can render as a div and merge classes', () => {
      render(
        <SectionShell as="div" className="bg-kinnso2-paper">
          <p>INNER2</p>
        </SectionShell>,
      )
      const band = screen.getByText('INNER2').closest('div.bg-kinnso2-paper')
      expect(band).toBeTruthy()
    })

    it('SectionShell className override wins over the default rhythm', () => {
      render(
        <SectionShell className="py-8">
          <p>INNER3</p>
        </SectionShell>,
      )
      const section = screen.getByText('INNER3').closest('section')
      expect(section?.className).toContain('py-8')
      // tailwind-merge drops the conflicting py-14 default so the caller wins
      expect(section?.className).not.toContain('py-14')
    })

    it('Eyebrow renders a small-caps kicker', () => {
      render(<Eyebrow>From the journal</Eyebrow>)
      expect(screen.getByText('From the journal').className).toContain('k2-eyebrow')
    })

    it('EditorialCard renders media slot, kicker, title, body and footer', () => {
      render(
        // external href: @next/next/no-html-link-for-pages forbids raw <a> to app pages
        <EditorialCard media={<span>MEDIA</span>} kicker="Tokyo" title="Night markets" footer={<a href="https://example.com/read">Read</a>}>
          Body copy
        </EditorialCard>,
      )
      expect(screen.getByText('MEDIA')).toBeTruthy()
      expect(screen.getByText('Tokyo')).toBeTruthy()
      expect(screen.getByRole('heading', { level: 3, name: 'Night markets' })).toBeTruthy()
      expect(screen.getByText('Body copy')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Read' })).toBeTruthy()
    })

    it('EditorialCard omits the media band when no media is given', () => {
      const { container } = render(<EditorialCard title="No photo" />)
      expect(container.querySelector('[data-slot="media"]')).toBeNull()
    })

    it('EditorialCard titleAs="h2" renders a level-2 heading', () => {
      render(<EditorialCard titleAs="h2" title="Top story" />)
      expect(screen.getByRole('heading', { level: 2, name: 'Top story' })).toBeTruthy()
    })
  })
  ```

- [ ] Run it and watch it fail (module not found):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.editorial.test.tsx
  ```

- [ ] Create `apps/web/components/kinnso/editorial/SectionShell.tsx`:

  ```tsx
  import type { ReactNode } from 'react'

  import { cn } from '@/lib/utils'

  /**
   * R1A editorial band: consistent max-width + vertical rhythm for every
   * editorial-journal surface. Server component — no client state.
   */
  export function SectionShell({
    as: Tag = 'section',
    className = '',
    children,
  }: {
    as?: 'section' | 'div' | 'header'
    className?: string
    children: ReactNode
  }) {
    return (
      <Tag className={cn('py-14 md:py-20', className)}>
        <div className="k2-container">{children}</div>
      </Tag>
    )
  }
  ```

- [ ] Create `apps/web/components/kinnso/editorial/Eyebrow.tsx`:

  ```tsx
  import type { ReactNode } from 'react'

  import { cn } from '@/lib/utils'

  /** Small-caps kicker above editorial headlines ("DESTINATIONS", "FROM THE JOURNAL"). */
  export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <p className={cn('k2-eyebrow', className)}>{children}</p>
  }
  ```

- [ ] Create `apps/web/components/kinnso/editorial/EditorialCard.tsx`:

  ```tsx
  import type { ReactNode } from 'react'

  import { cn } from '@/lib/utils'

  import { Eyebrow } from './Eyebrow'

  /**
   * Magazine-style card: media band on top, hairline border, generous text block.
   * `media` is a slot (pass your own <Image>) so this stays a dumb server component
   * and tests never need a next/image mock. The media child must fill the 4:3 box
   * (e.g. next/image `fill` + `object-cover`) or it letterboxes on the sand background.
   */
  export function EditorialCard({
    media,
    kicker,
    title,
    titleAs: TitleTag = 'h3',
    children,
    footer,
    className = '',
  }: {
    media?: ReactNode
    kicker?: ReactNode
    title: string
    titleAs?: 'h2' | 'h3' | 'h4'
    children?: ReactNode
    footer?: ReactNode
    className?: string
  }) {
    return (
      <article className={cn('k2-card flex flex-col', className)}>
        {media ? (
          <div data-slot="media" className="aspect-[4/3] w-full overflow-hidden bg-kinnso2-sand">
            {media}
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-2 p-5">
          {kicker ? <Eyebrow>{kicker}</Eyebrow> : null}
          <TitleTag className="k2-display text-xl font-semibold text-kinnso2-ink">{title}</TitleTag>
          {children ? <div className="text-sm leading-relaxed text-kinnso2-ink/70">{children}</div> : null}
          {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
        </div>
      </article>
    )
  }
  ```

- [ ] Add the k2 utility classes. In `apps/web/app/globals.css`, inside `@layer components { … }`, immediately after the last existing rule:

  ```css
    .k-route-markers__labels { @apply flex items-center justify-between gap-3; }
  ```

  and BEFORE the layer's closing `}`, append:

  ```css

    /* R1A editorial primitives (k2-*) — used by components/kinnso/editorial/*
       and the rebuilt chrome. Same utility-class-in-globals.css pattern as k-*. */
    .k2-container   { @apply mx-auto w-full max-w-[1200px] px-5 sm:px-8; }
    .k2-display     { font-family: var(--font-k2-display); letter-spacing: -0.01em; }
    .k2-eyebrow     { @apply inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso2-clay; } /* clay on sand is ~3.85:1 — don't place eyebrows on kinnso2-sand panels (AA fail); white/paper only */
    .k2-card        { @apply overflow-hidden rounded-[4px] border border-kinnso2-line bg-white; }
    .k2-hairline    { @apply border-t border-kinnso2-line; }
    .k2-btn-primary { @apply inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso2-clay px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-kinnso2-clay-deep; }
    .k2-btn-ghost   { @apply inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] border border-kinnso2-ink/25 px-6 py-2.5 text-sm font-semibold tracking-wide text-kinnso2-ink transition hover:border-kinnso2-ink hover:bg-kinnso2-sand/40; }

    .k2-btn-primary:focus-visible,
    .k2-btn-ghost:focus-visible {
      outline: 2px solid var(--color-kinnso2-clay);
      outline-offset: 2px;
    }
  ```

- [ ] Extend the token test. In `apps/web/tests/design.k2-tokens.test.ts`, add inside the `describe` block after the font-tokens `it`:

  ```ts
    it.each(['k2-container', 'k2-display', 'k2-eyebrow', 'k2-card', 'k2-hairline', 'k2-btn-primary', 'k2-btn-ghost'])(
      'registers the .%s utility class',
      (cls) => {
        expect(css).toContain(`.${cls}`)
      },
    )
  ```

- [ ] Run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.editorial.test.tsx tests/design.k2-tokens.test.ts
  ```
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/editorial apps/web/app/globals.css apps/web/tests/kinnso.editorial.test.tsx apps/web/tests/design.k2-tokens.test.ts
  git commit -m "feat(web): add k2 editorial primitives (SectionShell, Eyebrow, EditorialCard, buttons)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 4 — i18n: new strings in ALL 7 locales + parity registration

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface: nav lines 434–440, footer 441–446, after `comingSoon` line 467; values: nav 1279–1285, footer 1286–1293, after `comingSoon` block 1343–1347)
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts` (same three insertion points, anchored below)
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` (GROUPS, line 15)
- Test: `apps/web/tests/i18n.locale-parity.test.ts`

New keys: `nav.linkExplore/linkDestinations/linkSessions/linkForMerchants`; `footer.colExplore/lGuides/lDestinations/lArticles/lSessions`; groups `destinationsSoon` + `sessionsSoon` (each `{ eyebrow, title, body, cta }`). Old keys (`nav.linkMerchants`, `nav.linkGuides`, `footer.lCaseStudies`, `footer.lPress`, …) are KEPT — parity only requires identical shapes across locales; unused-key removal is R1C's job.

- [ ] Register the new groups in the parity test FIRST (this is the failing test). In `apps/web/tests/i18n.locale-parity.test.ts`, replace line 15:

  ```ts
    'studio', 'creatorProfile', 'merchants', 'missions', 'missionDetail', 'ops', 'nav', 'footer', 'home', 'comingSoon',
  ```

  with:

  ```ts
    'studio', 'creatorProfile', 'merchants', 'missions', 'missionDetail', 'ops', 'nav', 'footer', 'home', 'comingSoon',
    'destinationsSoon', 'sessionsSoon',
  ```

- [ ] Run it and watch it fail (`en defines the three new groups` fails — `destinationsSoon` is undefined):
  ```bash
  cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts
  ```

- [ ] Update the `Messages` interface in `apps/web/lib/i18n/messages/en.ts`. In the `nav` group (lines 434–440), after the line `linkInsights: string`, add:

  ```ts
      linkExplore: string; linkDestinations: string; linkSessions: string; linkForMerchants: string
  ```

  In the `footer` group (lines 441–446), after the line ending `…colCompany: string`, add:

  ```ts
      colExplore: string; lGuides: string; lDestinations: string; lArticles: string; lSessions: string
  ```

  After line 467 (`comingSoon: { heading: string; body: string; back: string }`), add:

  ```ts
    destinationsSoon: { eyebrow: string; title: string; body: string; cta: string }
    sessionsSoon: { eyebrow: string; title: string; body: string; cta: string }
  ```

- [ ] Add the EN values. In the `nav` value block (lines 1279–1285), after `linkInsights: 'Insights',` add:

  ```ts
      linkExplore: 'Explore', linkDestinations: 'Destinations', linkSessions: 'Sessions', linkForMerchants: 'For Merchants',
  ```

  In the `footer` value block, after `colCreators: 'Creators', colMerchants: 'Merchants', colCompany: 'Company',` add:

  ```ts
      colExplore: 'Explore', lGuides: 'Guides', lDestinations: 'Destinations', lArticles: 'Articles', lSessions: 'Sessions',
  ```

  After the `comingSoon` value block (lines 1343–1347), add:

  ```ts
    destinationsSoon: {
      eyebrow: 'Destinations',
      title: 'Every city, told by the people who know it.',
      body: 'We are stitching KINNSO guides and stories into a browsable atlas of destinations — the food streets, the side alleys, the day trips locals actually take. While we finish it, our destination stories are the best place to start.',
      cta: 'Read destination stories',
    },
    sessionsSoon: {
      eyebrow: 'Community Sessions',
      title: 'Live briefings from creators on the ground.',
      body: 'Community Sessions are small live conversations — destination briefings, ask-a-creator hours, and merchant spotlights, hosted by the creators behind our guides. We are lining up the first hosts now.',
      cta: 'Meet the creators',
    },
  ```

- [ ] Re-run the parity test — expect: `en defines…` passes, all six locale-vs-en cases FAIL (missing keys). That confirms the harness sees the additions.

- [ ] Add the six translations. Anchors per file: (a) nav — after the `linkInsights: '…',` line; (b) footer — after the `colCreators/colMerchants/colCompany` line; (c) groups — immediately after that file's `comingSoon: { … },` block.

  **`zh-hk.ts`** (traditional + HK phrasing, warm/insider voice):
  ```ts
      linkExplore: '探索', linkDestinations: '目的地', linkSessions: '社群活動', linkForMerchants: '商家專區',
  ```
  ```ts
      colExplore: '探索', lGuides: '攻略', lDestinations: '目的地', lArticles: '文章', lSessions: '社群活動',
  ```
  ```ts
    destinationsSoon: {
      eyebrow: '目的地',
      title: '每個城市，由最熟路嘅人講畀你聽。',
      body: '我哋而家將 KINNSO 創作者嘅攻略同故事，整合成一個可以慢慢逛嘅目的地地圖——地道食街、橫街窄巷、本地人真係會去嘅一日遊。整理期間，不妨先由目的地文章開始睇起。',
      cta: '睇目的地文章',
    },
    sessionsSoon: {
      eyebrow: '社群活動',
      title: '創作者現場連線，畀你第一手旅遊情報。',
      body: '社群活動係小型直播聚會——目的地簡報、創作者問答、商家焦點，全部由寫攻略嘅創作者親自主持。第一批主持人已經喺度準備緊。',
      cta: '認識我哋嘅創作者',
    },
  ```

  **`zh-tw.ts`**:
  ```ts
      linkExplore: '探索', linkDestinations: '目的地', linkSessions: '社群活動', linkForMerchants: '商家專區',
  ```
  ```ts
      colExplore: '探索', lGuides: '攻略', lDestinations: '目的地', lArticles: '文章', lSessions: '社群活動',
  ```
  ```ts
    destinationsSoon: {
      eyebrow: '目的地',
      title: '每座城市，由最懂它的人來說。',
      body: '我們正在把 KINNSO 創作者的攻略與故事，整理成一份可以慢慢瀏覽的目的地地圖——道地美食街、巷弄小店、在地人真正會去的一日遊。在完成之前，先從目的地文章開始探索吧。',
      cta: '閱讀目的地文章',
    },
    sessionsSoon: {
      eyebrow: '社群活動',
      title: '來自現場創作者的即時分享。',
      body: '社群活動是小型線上聚會——目的地簡報、創作者問答、商家焦點，都由撰寫攻略的創作者親自主持。首批主持人正在籌備中。',
      cta: '認識我們的創作者',
    },
  ```
  (Fix the comma typo: use full-width `，` after 「在完成之前」.)

  **`zh-cn.ts`**:
  ```ts
      linkExplore: '探索', linkDestinations: '目的地', linkSessions: '社区活动', linkForMerchants: '商家专区',
  ```
  ```ts
      colExplore: '探索', lGuides: '攻略', lDestinations: '目的地', lArticles: '文章', lSessions: '社区活动',
  ```
  ```ts
    destinationsSoon: {
      eyebrow: '目的地',
      title: '每座城市，都由最懂它的人来讲述。',
      body: '我们正在把 KINNSO 创作者的攻略和故事，整理成一份可以慢慢浏览的目的地地图——地道美食街、小巷店铺、本地人真正会去的一日游。在完成之前，先从目的地文章开始探索吧。',
      cta: '阅读目的地文章',
    },
    sessionsSoon: {
      eyebrow: '社区活动',
      title: '来自一线创作者的实时分享。',
      body: '社区活动是小型线上聚会——目的地简报、创作者问答、商家焦点，均由撰写攻略的创作者亲自主持。首批主持人正在筹备中。',
      cta: '认识我们的创作者',
    },
  ```

  **`ja.ts`**:
  ```ts
      linkExplore: '探す', linkDestinations: '旅行先', linkSessions: 'セッション', linkForMerchants: '加盟店の方へ',
  ```
  ```ts
      colExplore: '探す', lGuides: 'ガイド', lDestinations: '旅行先', lArticles: '記事', lSessions: 'セッション',
  ```
  ```ts
    destinationsSoon: {
      eyebrow: '旅行先',
      title: 'その街を一番知る人が、その街を語る。',
      body: 'KINNSOのクリエイターが書いたガイドやストーリーを、旅行先ごとにゆっくり眺められる地図に編集しています。地元の人が本当に通う食の路地や日帰りコースまで。完成までの間は、旅行先の記事からぜひご覧ください。',
      cta: '旅行先の記事を読む',
    },
    sessionsSoon: {
      eyebrow: 'コミュニティセッション',
      title: '現地クリエイターによるライブブリーフィング。',
      body: 'コミュニティセッションは少人数のライブイベントです。旅行先ブリーフィング、クリエイターへのQ&A、加盟店スポットライトなど、ガイドを書いた本人がホストを務めます。最初のホストを現在準備中です。',
      cta: 'クリエイターに会う',
    },
  ```

  **`ko.ts`**:
  ```ts
      linkExplore: '둘러보기', linkDestinations: '여행지', linkSessions: '세션', linkForMerchants: '가맹점 안내',
  ```
  ```ts
      colExplore: '둘러보기', lGuides: '가이드', lDestinations: '여행지', lArticles: '아티클', lSessions: '세션',
  ```
  ```ts
    destinationsSoon: {
      eyebrow: '여행지',
      title: '그 도시를 가장 잘 아는 사람이 들려주는 이야기.',
      body: 'KINNSO 크리에이터의 가이드와 스토리를 여행지별로 천천히 둘러볼 수 있는 지도로 엮고 있어요. 현지인이 진짜 가는 먹자골목과 당일치기 코스까지. 완성될 때까지는 여행지 아티클부터 먼저 만나보세요.',
      cta: '여행지 아티클 읽기',
    },
    sessionsSoon: {
      eyebrow: '커뮤니티 세션',
      title: '현지 크리에이터의 라이브 브리핑.',
      body: '커뮤니티 세션은 소규모 라이브 모임이에요. 여행지 브리핑, 크리에이터 Q&A, 가맹점 스포트라이트까지 — 가이드를 쓴 크리에이터가 직접 진행해요. 첫 호스트들을 지금 준비하고 있어요.',
      cta: '크리에이터 만나기',
    },
  ```

  **`th.ts`**:
  ```ts
      linkExplore: 'สำรวจ', linkDestinations: 'จุดหมาย', linkSessions: 'เซสชัน', linkForMerchants: 'สำหรับร้านค้า',
  ```
  ```ts
      colExplore: 'สำรวจ', lGuides: 'ไกด์', lDestinations: 'จุดหมาย', lArticles: 'บทความ', lSessions: 'เซสชัน',
  ```
  ```ts
    destinationsSoon: {
      eyebrow: 'จุดหมาย',
      title: 'ทุกเมือง เล่าโดยคนที่รู้จักมันดีที่สุด',
      body: 'เรากำลังรวบรวมไกด์และเรื่องราวจากครีเอเตอร์ KINNSO ให้กลายเป็นแผนที่จุดหมายที่ค่อยๆ เลือกดูได้ — ถนนสายของกิน ตรอกซอกซอย และทริปวันเดียวที่คนท้องถิ่นไปกันจริงๆ ระหว่างนี้เริ่มต้นจากบทความจุดหมายก่อนได้เลย',
      cta: 'อ่านบทความจุดหมาย',
    },
    sessionsSoon: {
      eyebrow: 'คอมมูนิตี้เซสชัน',
      title: 'ไลฟ์สดจากครีเอเตอร์ตัวจริงในพื้นที่',
      body: 'คอมมูนิตี้เซสชันคือวงพูดคุยสดขนาดเล็ก — บรีฟจุดหมาย ถามตอบกับครีเอเตอร์ และสปอตไลต์ร้านค้า โดยครีเอเตอร์เจ้าของไกด์เป็นผู้ดำเนินรายการเอง เรากำลังเตรียมโฮสต์รุ่นแรกอยู่',
      cta: 'ทำความรู้จักครีเอเตอร์',
    },
  ```

- [ ] Run — expect ALL PASS (all 7 locales identical shapes):
  ```bash
  cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts
  ```
- [ ] Typecheck the message files compile against the widened interface:
  ```bash
  pnpm --filter web typecheck
  ```
  Expected: exit 0.
- [ ] Commit:
  ```bash
  git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
  git commit -m "i18n(web): add R1A nav/footer/placeholder strings across all 7 locales" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 5 — Navbar rebuild (traveller-first IA, editorial skin)

**Files:**
- Modify: `apps/web/components/kinnso/Navbar.tsx` (full rewrite; current file is 105 lines)
- Test: `apps/web/tests/kinnso.Navbar.test.tsx` (full rewrite)

Contract preserved: same props `{ locale, role, t: Messages['nav'] }`; role resolved client-side by `useViewerRole` in SiteChrome (do NOT read cookies here); `LocaleSwitcher` kept; mobile hamburger kept with the same `kinnso-mobile-menu` id + conditional `aria-controls` pattern; merchant extra links kept; role CTAs preserved exactly (anon → Apply as Creator `/sign-up` + Sign in; creator → Open Studio `/studio`; creator-pending → pill `/creators/apply`; merchant → Post a Mission `/merchants/post`).

- [ ] Replace `apps/web/tests/kinnso.Navbar.test.tsx` ENTIRELY with the failing spec:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach, vi } from 'vitest'
  import { render, screen, cleanup, fireEvent } from '@testing-library/react'

  let mockPathname = '/en'

  afterEach(() => {
    cleanup()
    mockPathname = '/en'
  })

  vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => mockPathname,
    useSearchParams: () => new URLSearchParams(),
  }))

  import { Navbar } from '@/components/kinnso/Navbar'
  import en from '@/lib/i18n/messages/en'

  describe('Navbar (R1A editorial IA)', () => {
    it('renders the traveller-first base anchors for all roles, locale-prefixed', () => {
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      const expected = [
        [en.nav.linkExplore, '/en/explore'],
        [en.nav.linkDestinations, '/en/destinations'],
        [en.nav.linkArticles, '/en/articles'],
        [en.nav.linkSessions, '/en/sessions'],
        [en.nav.linkAgent, '/en/agent'],
        [en.nav.linkCreators, '/en/creators'],
      ] as const
      for (const [name, href] of expected) {
        expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(href)
      }
      expect(screen.getByRole('link', { name: 'KINNSO' }).getAttribute('href')).toBe('/en')
    })

    it('shows a For Merchants link → /en/merchants (href swaps to /for-merchants in R1C)', () => {
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      expect(screen.getByRole('link', { name: en.nav.linkForMerchants }).getAttribute('href')).toBe('/en/merchants')
    })

    it('anon shows Sign in + Apply CTA → /en/sign-up', () => {
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      expect(screen.getByRole('link', { name: en.nav.signIn }).getAttribute('href')).toBe('/en/sign-in')
      expect(screen.getByRole('link', { name: en.nav.ctaApply }).getAttribute('href')).toBe('/en/sign-up')
    })

    it('creator shows Open Studio; merchant keeps queue + creator search + insights + Post a Mission', () => {
      render(<Navbar locale="en" role="creator" t={en.nav} />)
      expect(screen.getByRole('link', { name: en.nav.ctaOpenStudio }).getAttribute('href')).toBe('/en/studio')
      cleanup()
      render(<Navbar locale="en" role="merchant" t={en.nav} />)
      expect(screen.getAllByRole('link', { name: en.nav.linkMissions })[0].getAttribute('href')).toBe('/en/merchants/missions')
      expect(screen.getByRole('link', { name: en.nav.ctaPostMission }).getAttribute('href')).toBe('/en/merchants/post')
      expect(screen.getAllByRole('link', { name: en.nav.linkFindCreators })[0].getAttribute('href')).toBe('/en/merchants/creators')
      expect(screen.getAllByRole('link', { name: en.nav.linkInsights })[0].getAttribute('href')).toBe('/en/merchants/insights')
    })

    it('creator-pending renders the pending pill CTA → /en/creators/apply', () => {
      render(<Navbar locale="en" role="creator-pending" t={en.nav} />)
      expect(screen.getByRole('link', { name: en.nav.ctaPending }).getAttribute('href')).toBe('/en/creators/apply')
    })

    it('does not render a Travelers/feed anchor (consolidated into /explore)', () => {
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
      expect(hrefs).not.toContain('/en/feed')
      expect(hrefs).toContain('/en/explore')
    })

    it('renders the locale switcher', () => {
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      expect(screen.getByLabelText(en.nav.language)).toBeTruthy()
    })

    it('uses localized text for the mobile menu toggle label', () => {
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      expect(screen.getByRole('button', { name: en.nav.menuToggle })).toBeTruthy()
    })

    it('connects the mobile menu button to the collapsible region only while it is open', () => {
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      const button = screen.getByRole('button', { name: en.nav.menuToggle })
      expect(button.getAttribute('aria-expanded')).toBe('false')
      expect(button.getAttribute('aria-controls')).toBeNull()
      fireEvent.click(button)
      expect(button.getAttribute('aria-expanded')).toBe('true')
      expect(button.getAttribute('aria-controls')).toBe('kinnso-mobile-menu')
      expect(document.getElementById('kinnso-mobile-menu')).toBeTruthy()
    })

    it('marks the matching base anchor with aria-current="page" and leaves siblings unmarked', () => {
      mockPathname = '/en/explore'
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      expect(screen.getByRole('link', { name: en.nav.linkExplore }).getAttribute('aria-current')).toBe('page')
      expect(screen.getByRole('link', { name: en.nav.linkDestinations }).getAttribute('aria-current')).toBeNull()
    })

    it('prefix-matches nested paths for aria-current (e.g. /creators/apply → Creators)', () => {
      mockPathname = '/en/creators/apply'
      render(<Navbar locale="en" role="anon" t={en.nav} />)
      expect(screen.getByRole('link', { name: en.nav.linkCreators }).getAttribute('aria-current')).toBe('page')
    })

    it('merchant sub-row owns the active state on /merchants/creators; base Creators stays inactive', () => {
      mockPathname = '/en/merchants/creators'
      render(<Navbar locale="en" role="merchant" t={en.nav} />)
      expect(screen.getByRole('link', { name: en.nav.linkFindCreators }).getAttribute('aria-current')).toBe('page')
      expect(screen.getByRole('link', { name: en.nav.linkCreators }).getAttribute('aria-current')).toBeNull()
    })

    it('merchant does not get a For Merchants link (desktop or tray)', () => {
      render(<Navbar locale="en" role="merchant" t={en.nav} />)
      expect(screen.queryByRole('link', { name: en.nav.linkForMerchants })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: en.nav.menuToggle }))
      expect(screen.queryByRole('link', { name: en.nav.linkForMerchants })).toBeNull()
    })

    it('merchant deep-links render in the desktop sub-row and again in the open mobile tray', () => {
      render(<Navbar locale="en" role="merchant" t={en.nav} />)
      expect(screen.getAllByRole('link', { name: en.nav.linkMissions }).length).toBeGreaterThanOrEqual(1)
      fireEvent.click(screen.getByRole('button', { name: en.nav.menuToggle }))
      expect(screen.getAllByRole('link', { name: en.nav.linkMissions }).length).toBeGreaterThanOrEqual(2)
    })
  })
  ```

- [ ] Run it and watch the IA cases fail (old navbar has no `linkExplore`/`linkDestinations`/`linkSessions`/`linkForMerchants` anchors):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.Navbar.test.tsx
  ```

- [ ] Replace `apps/web/components/kinnso/Navbar.tsx` ENTIRELY with:

  ```tsx
  'use client'
  import React, { useState } from "react";
  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import { Menu, X } from "lucide-react";
  import LocaleSwitcher from "@/components/kinnso/LocaleSwitcher";
  import type { ViewerRole } from "@/lib/auth/viewer-role";
  import type { Locale } from "@/lib/i18n/config";
  import type { Messages } from "@/lib/i18n/messages/en";

  /**
   * R1A editorial navbar. Role is resolved CLIENT-side (useViewerRole in SiteChrome)
   * so public pages stay statically generable — this component only receives the
   * resolved role. IA (all roles): Explore · Destinations · Articles · Sessions ·
   * AI Agent · Creators; right side carries "For Merchants" (→ /merchants until the
   * R1C landing split moves it to /for-merchants) + the role-aware CTA.
   * Merchant deep links (mission queue / creator search / insights) live on a slim
   * second row under the main row — nine top-row anchors overflow the container at
   * every width — and merchants skip the redundant "For Merchants" link. Desktop
   * chrome is gated at xl: (tablets get the hamburger) so the row never overflows
   * at 768–1100px.
   */
  export const Navbar: React.FC<{ locale: Locale; role: ViewerRole; t: Messages["nav"] }> = ({ locale, role, t }) => {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const p = (path: string) => `/${locale}${path}`;
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
    // Active state is underline + clay (not color-only); the on-skin focus ring
    // overrides the legacy global orange focus rule.
    const navLinkClass = (active: boolean) =>
      `whitespace-nowrap px-3 py-2 text-sm font-medium tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay ${
        active ? "text-kinnso2-clay underline underline-offset-8 decoration-2 decoration-kinnso2-clay" : "text-kinnso2-ink/75 hover:text-kinnso2-ink"
      }`;

    const baseAnchors = [
      { to: "/explore",      label: t.linkExplore },
      { to: "/destinations", label: t.linkDestinations },
      { to: "/articles",     label: t.linkArticles },
      { to: "/sessions",     label: t.linkSessions },
      { to: "/agent",        label: t.linkAgent },
      { to: "/creators",     label: t.linkCreators },
    ];
    // Merchant deep links: slim second row on desktop + tray entries on mobile —
    // never on the top row, which cannot fit nine anchors.
    const merchantAnchors = [
      { to: "/merchants/missions", label: t.linkMissions },
      { to: "/merchants/creators", label: t.linkFindCreators },
      { to: "/merchants/insights", label: t.linkInsights },
    ];
    const trayAnchors = role === "merchant" ? [...baseAnchors, ...merchantAnchors] : baseAnchors;

    const cta = (() => {
      if (role === "creator") return { label: t.ctaOpenStudio, to: "/studio", className: "k2-btn-primary" };
      if (role === "creator-pending") return { label: t.ctaPending, to: "/creators/apply", className: "inline-flex min-h-[44px] items-center rounded-[3px] bg-kinnso2-sand px-4 py-2 text-sm font-semibold text-kinnso2-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay" };
      if (role === "merchant") return { label: t.ctaPostMission, to: "/merchants/post", className: "k2-btn-primary" };
      return { label: t.ctaApply, to: "/sign-up", className: "k2-btn-primary" };
    })();

    const forMerchantsHref = p("/merchants");

    return (
      <header className="sticky top-0 z-40 border-b border-kinnso2-line bg-kinnso2-paper/95 font-k2-sans backdrop-blur">
        <div className="k2-container flex h-16 items-center justify-between gap-4">
          <Link href={p("")} aria-label="KINNSO" className="flex items-baseline gap-1.5">
            <span className="k2-display text-2xl font-semibold tracking-tight text-kinnso2-ink">KINNSO</span>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-kinnso2-clay" />
          </Link>

          <nav className="hidden items-center gap-1 xl:flex">
            {baseAnchors.map((a) => {
              const href = p(a.to);
              return (
                <Link key={a.to} href={href} aria-current={isActive(href) ? "page" : undefined} className={navLinkClass(isActive(href))}>
                  {a.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 xl:flex">
            {role !== "merchant" && (
              <Link
                href={forMerchantsHref}
                aria-current={isActive(forMerchantsHref) ? "page" : undefined}
                className={`whitespace-nowrap px-2 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay ${
                  isActive(forMerchantsHref) ? "text-kinnso2-clay underline underline-offset-8 decoration-2 decoration-kinnso2-clay" : "text-kinnso2-ink/75 hover:text-kinnso2-ink"
                }`}
              >
                {t.linkForMerchants}
              </Link>
            )}
            <LocaleSwitcher locale={locale} t={t} />
            {role === "anon" && (
              <Link href={p("/sign-in")} className="whitespace-nowrap px-3 py-2 text-sm font-semibold text-kinnso2-ink transition hover:text-kinnso2-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay">{t.signIn}</Link>
            )}
            <Link href={p(cta.to)} className={cta.className}>{cta.label}</Link>
          </div>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-kinnso2-ink transition hover:bg-kinnso2-sand/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay xl:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={t.menuToggle}
            aria-expanded={open}
            // Only reference the menu region while it is actually in the DOM
            // (it mounts on open); pointing aria-controls at an absent element is an ARIA error.
            aria-controls={open ? "kinnso-mobile-menu" : undefined}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>

        {role === "merchant" && (
          <nav aria-label={t.linkMissions} className="hidden border-t border-kinnso2-line xl:block">
            <div className="k2-container flex h-10 items-center gap-1">
              {merchantAnchors.map((a) => {
                const href = p(a.to);
                return (
                  <Link key={a.to} href={href} aria-current={isActive(href) ? "page" : undefined} className={navLinkClass(isActive(href))}>
                    {a.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {open && (
          <div id="kinnso-mobile-menu" className="border-t border-kinnso2-line bg-kinnso2-paper xl:hidden">
            <div className="k2-container flex flex-col gap-1 py-3">
              <nav aria-label={t.menuToggle} className="flex flex-col gap-1">
                {trayAnchors.map((a) => (
                  <Link key={a.to} href={p(a.to)} onClick={() => setOpen(false)} className="whitespace-nowrap px-3 py-2 text-sm font-medium text-kinnso2-ink transition hover:text-kinnso2-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay">
                    {a.label}
                  </Link>
                ))}
                {role !== "merchant" && (
                  <Link href={forMerchantsHref} onClick={() => setOpen(false)} className="whitespace-nowrap px-3 py-2 text-sm font-medium text-kinnso2-ink/75 transition hover:text-kinnso2-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay">
                    {t.linkForMerchants}
                  </Link>
                )}
              </nav>
              <div className="mt-2 flex items-center justify-between gap-3">
                <LocaleSwitcher locale={locale} t={t} />
                <div className="flex items-center gap-2">
                  {role === "anon" && (
                    <Link href={p("/sign-in")} onClick={() => setOpen(false)} className="whitespace-nowrap px-3 py-2 text-sm font-semibold text-kinnso2-ink transition hover:text-kinnso2-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay">{t.signIn}</Link>
                  )}
                  <Link href={p(cta.to)} onClick={() => setOpen(false)} className={cta.className}>{cta.label}</Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>
    );
  };

  export default Navbar;
  ```

- [ ] Run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.Navbar.test.tsx
  ```
- [ ] Regression check the chrome tests that render the Navbar (skip-link test still asserts the old literal — it must still pass; it changes in Task 7):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.SiteChrome.test.tsx tests/layout.siteChrome.test.tsx
  ```
  Expected: PASS (they only assert `ctaApply` / `footer.tagline` / skip-link, all unchanged).
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/Navbar.tsx apps/web/tests/kinnso.Navbar.test.tsx
  git commit -m "feat(web): rebuild navbar with traveller-first IA and editorial skin" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 6 — Footer rebuild (four-column editorial IA)

**Files:**
- Modify: `apps/web/components/kinnso/Footer.tsx` (full rewrite; current file is 42 lines)
- Test: `apps/web/tests/kinnso.Footer.test.tsx` (full rewrite)

- [ ] Replace `apps/web/tests/kinnso.Footer.test.tsx` ENTIRELY with the failing spec:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'
  import Footer from '@/components/kinnso/Footer'
  import en from '@/lib/i18n/messages/en'

  afterEach(cleanup)

  describe('Footer (R1A editorial IA)', () => {
    it('renders the new Explore column with locale-prefixed links', () => {
      render(<Footer locale="ja" t={en.footer} />)
      expect(screen.getByText(en.footer.colExplore)).toBeTruthy()
      expect(screen.getByRole('link', { name: en.footer.lGuides }).getAttribute('href')).toBe('/ja/explore')
      expect(screen.getByRole('link', { name: en.footer.lDestinations }).getAttribute('href')).toBe('/ja/destinations')
      expect(screen.getByRole('link', { name: en.footer.lArticles }).getAttribute('href')).toBe('/ja/articles')
      expect(screen.getByRole('link', { name: en.footer.lSessions }).getAttribute('href')).toBe('/ja/sessions')
    })

    it('keeps the Creators column (Apply / Studio / Missions / Earnings)', () => {
      render(<Footer locale="en" t={en.footer} />)
      expect(screen.getByText(en.footer.colCreators)).toBeTruthy()
      expect(screen.getByRole('link', { name: en.footer.lApply }).getAttribute('href')).toBe('/en/sign-up')
      expect(screen.getByRole('link', { name: en.footer.lStudio }).getAttribute('href')).toBe('/en/studio')
      expect(screen.getByRole('link', { name: en.footer.lMissions }).getAttribute('href')).toBe('/en/studio/missions')
      expect(screen.getByRole('link', { name: en.footer.lEarnings }).getAttribute('href')).toBe('/en/studio/earnings')
    })

    it('routes "How it works" to the merchant landing, not a pricing page', () => {
      render(<Footer locale="en" t={en.footer} />)
      expect(screen.getByRole('link', { name: en.footer.lPricing }).getAttribute('href')).toBe('/en/merchants')
      expect(screen.getByRole('link', { name: en.footer.lPostMission }).getAttribute('href')).toBe('/en/merchants/post')
    })

    it('keeps the Company column honest (single /about, no Case studies / Press)', () => {
      render(<Footer locale="en" t={en.footer} />)
      const aboutLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/en/about')
      expect(aboutLinks).toHaveLength(1)
      expect(screen.queryByText(en.footer.lCaseStudies)).toBeNull()
      expect(screen.queryByText(en.footer.lPress)).toBeNull()
      expect(screen.getByRole('link', { name: en.footer.lContact }).getAttribute('href')).toBe('/en/contact')
      expect(screen.getByRole('link', { name: en.footer.lLegal }).getAttribute('href')).toBe('/en/legal/creator-terms')
    })

    it('renders tagline + rights and no non-functional social labels', () => {
      render(<Footer locale="en" t={en.footer} />)
      expect(screen.getByText(en.footer.tagline)).toBeTruthy()
      expect(screen.getByText(en.footer.rights)).toBeTruthy()
      expect(screen.queryByText('Instagram')).toBeNull()
      expect(screen.queryByText('WhatsApp')).toBeNull()
    })
  })
  ```

- [ ] Run it and watch the Explore-column case fail:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.Footer.test.tsx
  ```

- [ ] Replace `apps/web/components/kinnso/Footer.tsx` ENTIRELY with:

  ```tsx
  import Link from "next/link";
  import type { Locale } from "@/lib/i18n/config";
  import type { Messages } from "@/lib/i18n/messages/en";

  /** R1A editorial footer: dark-ink band, four columns (Explore / Creators / Merchants / Company). */
  const Footer = ({ locale, t }: { locale: Locale; t: Messages["footer"] }) => {
    const p = (path: string) => `/${locale}${path}`;
    const cols = [
      { title: t.colExplore,   links: [[t.lGuides, "/explore"], [t.lDestinations, "/destinations"], [t.lArticles, "/articles"], [t.lSessions, "/sessions"]] as const },
      { title: t.colCreators,  links: [[t.lApply, "/sign-up"], [t.lStudio, "/studio"], [t.lMissions, "/studio/missions"], [t.lEarnings, "/studio/earnings"]] as const },
      { title: t.colMerchants, links: [[t.lPostMission, "/merchants/post"], [t.lPricing, "/merchants"]] as const },
      { title: t.colCompany,   links: [[t.lAbout, "/about"], [t.lAgent, "/agent"], [t.lContact, "/contact"], [t.lLegal, "/legal/creator-terms"]] as const },
    ];
    return (
      <footer className="bg-kinnso2-ink font-k2-sans text-kinnso2-paper">
        <div className="k2-container grid gap-10 py-14 md:grid-cols-5">
          <div>
            <span className="k2-display text-2xl font-semibold tracking-tight text-kinnso2-paper">KINNSO</span>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-kinnso2-paper/60">{t.tagline}</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso2-sun">{c.title}</h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                {c.links.map(([label, href]) => (
                  <li key={`${label}-${href}`}>
                    <Link href={p(href)} className="text-kinnso2-paper/80 transition hover:text-kinnso2-paper">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-kinnso2-paper/15">
          <div className="k2-container flex items-center justify-center py-4 text-xs text-kinnso2-paper/50 sm:justify-start">
            <span>{t.rights}</span>
          </div>
        </div>
      </footer>
    );
  };

  export default Footer;
  ```

- [ ] Run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.Footer.test.tsx
  ```
- [ ] Regression check (chrome tests assert `footer.tagline` presence only):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.SiteChrome.test.tsx tests/layout.siteChrome.test.tsx
  ```
  Expected: PASS.
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/Footer.tsx apps/web/tests/kinnso.Footer.test.tsx
  git commit -m "feat(web): rebuild footer with four-column editorial IA" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 7 — Drive-by fix: localize the SiteChrome skip link

**Files:**
- Modify: `apps/web/components/kinnso/SiteChrome.tsx` (lines 33–38: hardcoded "Skip to content")
- Test: `apps/web/tests/kinnso.SiteChrome.test.tsx` (full rewrite)

- [ ] Replace `apps/web/tests/kinnso.SiteChrome.test.tsx` ENTIRELY with (the new last test FAILS against current code because the skip link is hardcoded English):

  ```tsx
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
  ```

- [ ] Run it and watch ONLY the last test fail (link named 「跳到內容」 not found):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.SiteChrome.test.tsx
  ```

- [ ] Fix `apps/web/components/kinnso/SiteChrome.tsx`. Replace the skip-link block (lines 33–38):

  ```tsx
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-kinnso-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
        >
          Skip to content
        </a>
  ```

  with:

  ```tsx
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-kinnso2-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-kinnso2-paper focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-kinnso2-sun"
        >
          {nav.skipToContent}
        </a>
  ```

- [ ] Run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.SiteChrome.test.tsx tests/layout.siteChrome.test.tsx
  ```
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/SiteChrome.tsx apps/web/tests/kinnso.SiteChrome.test.tsx
  git commit -m "fix(web): localize the SiteChrome skip link via nav.skipToContent" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 8 — Designed placeholder: /destinations

**Files:**
- Create: `apps/web/app/[locale]/destinations/page.tsx`
- Create: `apps/web/tests/destinations.host.test.tsx`
- Test: `apps/web/tests/destinations.host.test.tsx`

Pattern: same host shape as `apps/web/app/[locale]/about/page.tsx` (`await params` → `isLocale` guard → `notFound()` → `getDictionary`), but metadata uses `noindexMetadata()` and the route is NOT added to `MARKETING_PATHS` (stays out of the sitemap; becomes a real indexed browse page in R6).

- [ ] Write the failing host test. Create `apps/web/tests/destinations.host.test.tsx` with EXACTLY:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach, vi } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'

  afterEach(cleanup)
  vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

  import DestinationsPage, { generateMetadata } from '@/app/[locale]/destinations/page'
  import { MARKETING_PATHS } from '@/lib/seo/routes'
  import en from '@/lib/i18n/messages/en'

  describe('/[locale]/destinations host', () => {
    it('renders the designed editorial placeholder (not the bare ComingSoonPage)', async () => {
      const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
      render(ui)
      expect(screen.getByRole('heading', { level: 1, name: en.destinationsSoon.title })).toBeTruthy()
      expect(screen.getByText(en.destinationsSoon.eyebrow)).toBeTruthy()
      expect(screen.getByText(en.destinationsSoon.body)).toBeTruthy()
      expect(screen.getByRole('link', { name: en.destinationsSoon.cta }).getAttribute('href')).toBe('/en/articles/destinations')
      expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
    })

    it('is noindexed and stays out of MARKETING_PATHS', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(MARKETING_PATHS).not.toContain('/destinations')
    })

    it('404s unknown locales', async () => {
      await expect(DestinationsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    })
  })
  ```

- [ ] Run it and watch it fail (module `@/app/[locale]/destinations/page` not found):
  ```bash
  cd apps/web && npx vitest run tests/destinations.host.test.tsx
  ```

- [ ] Create `apps/web/app/[locale]/destinations/page.tsx` with EXACTLY:

  ```tsx
  import type { Metadata } from 'next'
  import Link from 'next/link'
  import { notFound } from 'next/navigation'
  import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
  import { getDictionary } from '@/lib/i18n/dictionaries'
  import { noindexMetadata } from '@/lib/seo/metadata'
  import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
  import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'

  // R1A designed placeholder. Noindexed and deliberately NOT in MARKETING_PATHS —
  // the real destination-browse surface ships in R6 and flips this to indexable.
  export function generateStaticParams() {
    return LOCALES.map((locale) => ({ locale }))
  }

  export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params
    if (!isLocale(locale)) return {}
    const dict = await getDictionary(locale as Locale)
    return noindexMetadata(dict.destinationsSoon.title)
  }

  export default async function DestinationsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params
    if (!isLocale(locale)) notFound()
    const t = (await getDictionary(locale as Locale)).destinationsSoon
    return (
      <div className="bg-kinnso2-paper font-k2-sans">
        <SectionShell className="flex min-h-[60vh] items-center">
          <div className="max-w-2xl">
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso2-ink md:text-6xl">{t.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-kinnso2-ink/70">{t.body}</p>
            <div className="mt-8 flex items-center gap-4">
              <Link href={`/${locale}/articles/destinations`} className="k2-btn-primary">{t.cta}</Link>
            </div>
          </div>
        </SectionShell>
      </div>
    )
  }
  ```

- [ ] Run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/destinations.host.test.tsx
  ```
- [ ] Commit:
  ```bash
  git add "apps/web/app/[locale]/destinations" apps/web/tests/destinations.host.test.tsx
  git commit -m "feat(web): designed noindex placeholder for /destinations" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 9 — Designed placeholder: /sessions

**Files:**
- Create: `apps/web/app/[locale]/sessions/page.tsx`
- Create: `apps/web/tests/sessions.host.test.tsx`
- Test: `apps/web/tests/sessions.host.test.tsx`

Same pattern as Task 8; CTA points at the creator directory (`/creators`); moss accent on the eyebrow differentiates the Sessions surface. Route becomes the real Community Sessions listing in R5.

- [ ] Write the failing host test. Create `apps/web/tests/sessions.host.test.tsx` with EXACTLY:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach, vi } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'

  afterEach(cleanup)
  vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

  import SessionsPage, { generateMetadata } from '@/app/[locale]/sessions/page'
  import { MARKETING_PATHS } from '@/lib/seo/routes'
  import en from '@/lib/i18n/messages/en'

  describe('/[locale]/sessions host', () => {
    it('renders the designed editorial placeholder (not the bare ComingSoonPage)', async () => {
      const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
      render(ui)
      expect(screen.getByRole('heading', { level: 1, name: en.sessionsSoon.title })).toBeTruthy()
      expect(screen.getByText(en.sessionsSoon.eyebrow)).toBeTruthy()
      expect(screen.getByText(en.sessionsSoon.body)).toBeTruthy()
      expect(screen.getByRole('link', { name: en.sessionsSoon.cta }).getAttribute('href')).toBe('/en/creators')
      expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
    })

    it('is noindexed and stays out of MARKETING_PATHS', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(MARKETING_PATHS).not.toContain('/sessions')
    })

    it('404s unknown locales', async () => {
      await expect(SessionsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    })
  })
  ```

- [ ] Run it and watch it fail (module not found):
  ```bash
  cd apps/web && npx vitest run tests/sessions.host.test.tsx
  ```

- [ ] Create `apps/web/app/[locale]/sessions/page.tsx` with EXACTLY:

  ```tsx
  import type { Metadata } from 'next'
  import Link from 'next/link'
  import { notFound } from 'next/navigation'
  import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
  import { getDictionary } from '@/lib/i18n/dictionaries'
  import { noindexMetadata } from '@/lib/seo/metadata'
  import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
  import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'

  // R1A designed placeholder. Noindexed and deliberately NOT in MARKETING_PATHS —
  // Community Sessions P1 (listing, RSVP, replays) ships in R5 and replaces this page.
  export function generateStaticParams() {
    return LOCALES.map((locale) => ({ locale }))
  }

  export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params
    if (!isLocale(locale)) return {}
    const dict = await getDictionary(locale as Locale)
    return noindexMetadata(dict.sessionsSoon.title)
  }

  export default async function SessionsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params
    if (!isLocale(locale)) notFound()
    const t = (await getDictionary(locale as Locale)).sessionsSoon
    return (
      <div className="bg-kinnso2-paper font-k2-sans">
        <SectionShell className="flex min-h-[60vh] items-center">
          <div className="max-w-2xl">
            <Eyebrow className="text-kinnso2-moss">{t.eyebrow}</Eyebrow>
            <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso2-ink md:text-6xl">{t.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-kinnso2-ink/70">{t.body}</p>
            <div className="mt-8 flex items-center gap-4">
              <Link href={`/${locale}/creators`} className="k2-btn-primary">{t.cta}</Link>
            </div>
          </div>
        </SectionShell>
      </div>
    )
  }
  ```

  (Note: `text-kinnso2-moss` on `Eyebrow` wins over the `k2-eyebrow` clay color because Tailwind utilities are emitted after the components layer.)

- [ ] Run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/sessions.host.test.tsx
  ```
- [ ] Commit:
  ```bash
  git add "apps/web/app/[locale]/sessions" apps/web/tests/sessions.host.test.tsx
  git commit -m "feat(web): designed noindex placeholder for /sessions" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 10 — Full verification

**Files:** none (verification only; commit only if fixes are needed)

- [ ] Typecheck the web app:
  ```bash
  pnpm --filter web typecheck
  ```
  Expected: exit 0.
- [ ] Lint:
  ```bash
  pnpm --filter web lint
  ```
  Expected: exit 0 (no new warnings from touched files).
- [ ] Scoped run of EVERY test file this phase touched or created (one command):
  ```bash
  cd apps/web && npx vitest run \
    tests/design.k2-tokens.test.ts \
    tests/layout.fonts.test.ts \
    tests/kinnso.editorial.test.tsx \
    tests/i18n.locale-parity.test.ts \
    tests/kinnso.Navbar.test.tsx \
    tests/kinnso.Footer.test.tsx \
    tests/kinnso.SiteChrome.test.tsx \
    tests/layout.siteChrome.test.tsx \
    tests/destinations.host.test.tsx \
    tests/sessions.host.test.tsx
  ```
  Expected: ALL PASS.
- [ ] Scope-guard greps (all must return nothing):
  ```bash
  git diff feat/product-revision-program...HEAD -- apps/web/lib/seo/routes.ts apps/web/app/sitemap.ts apps/web/app/robots.ts   # empty: no SEO surface changes
  git diff feat/product-revision-program...HEAD -- "apps/web/app/[locale]/page.tsx"                                            # empty: homepage untouched (R1B)
  git diff feat/product-revision-program...HEAD -- apps/web/app/globals.css | grep '^-' | grep -v '^---' | grep 'kinnso-'      # empty: no legacy token removed
  ```
- [ ] OPTIONAL sanity (full suite): `cd apps/web && npx vitest run` — note that roughly 19–37 pre-existing environment failures (search/sitemap/studio suites hitting a real Supabase project with dummy `.env.test` creds, some timing out) are EXPECTED in full-suite runs and are NOT regressions from this phase. Judge only the 10 files listed above.
- [ ] OPTIONAL visual smoke: `pnpm --filter web dev`, open `http://localhost:3000/en/destinations` and `/en/sessions`, confirm cream/terracotta editorial rendering, serif headlines, new navbar/footer, and tab-to-skip-link showing localized text on `/zh-hk`.
- [ ] If any step surfaced a fix, commit it as `fix(web): …` or `test(web): …` with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- [ ] Phase complete. Do NOT merge or open a PR from this plan — hand back for review; R1A lands inside the "Phase R1 — …" squash-merge flow after R1B/R1C.
