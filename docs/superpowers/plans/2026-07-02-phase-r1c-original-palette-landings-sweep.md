# Phase R1C — Original-Palette Revert, Landings & Honest Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Phase R1 by reverting the color palette to the original `kinnso-*` brand system (user decision 2026-07-02: "full legacy palette revert" — original cream/ink/orange, keeping the new layouts and Fraunces/Inter typography), shipping the `/for-creators` + `/for-merchants` landings, rewriting `/agent` as an honest traveller-agent waitlist with real email capture, retiring the ticket motif from all public pages, adding the article→guide cross-link module, and burning down the 22 R1 carry-forwards.

**Architecture:** The `kinnso-*` color tokens (already in `globals.css`) become the single canonical palette; every `kinnso2-*` color reference is renamed to its `kinnso-*` equivalent via a role-aware mapping (accent **text** uses `orangeDark`, accent **fills/focus** use `orange`) and the `kinnso2-*` tokens are deleted. `--font-display`/`--font-sans` are repointed to the Fraunces/Inter CJK-safe stacks, which re-typographs every surface (including studio/admin) without touching them. The `k2-*` utility classes and editorial primitives stay as the component system, recolored. Legacy `k-*` ticket-motif classes remain defined for studio/admin (internal-only debt, retired in a later phase) but are removed from every **public** page. New public routes follow the R1A/R1B pattern: `page.tsx` + view component + `buildPageMetadata` + `MARKETING_PATHS` + i18n group ×7 + parity registration.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 (`@theme` in `app/globals.css`) · Supabase (RLS, one new migration) · Vitest 4 · custom i18n (7 locales).

**Branch:** `feat/redesign-r1c`, cut from `origin/main` @ `0fc1f69` (PR #65 = R1A+R1B, already squash-merged; R1C is its own follow-up PR "Phase R1C — …"). All paths below are relative to the repo root; app paths inside `apps/web/`.

---

## Design-decision record (locked before any task)

**D-R1C-1 — Canonical palette = original `kinnso-*` tokens** (user-approved 2026-07-02, overriding the earlier "delete legacy tokens" R1C intent):

| Token | Value | Role |
|---|---|---|
| `kinnso-cream` | `#F8F1E6` | page background (was `kinnso2-paper`) |
| `kinnso-cream2` | `#EFE3D2` | panels/chips (was `kinnso2-sand`) |
| `kinnso-ink` | `#211B16` | text / dark bands (was `kinnso2-ink`) |
| `kinnso-orange` | `#F26A1F` | primary accent: button fills, focus rings, decorative dots (was `kinnso2-clay`) |
| `kinnso-orangeDark` | `#C24E0E` | hover fills + the ONLY orange allowed as text (was `kinnso2-clay-deep`, and replaces clay in text roles) |
| `kinnso-amber` | `#F4BD50` | highlight on dark bands only (was `kinnso2-sun`) |
| `kinnso-muted` | `#6D6257` | secondary text (k2 surfaces may keep `ink/70` opacities) |
| `kinnso-edge` | `#DED5C7` | hairlines (was `kinnso2-line`) |
| `kinnso-green`/`red`/`blue` | unchanged | semantic states (studio) |

`kinnso2-moss` has **no successor token** — its two usages are redesigned (Task 3). Because `kinnso-*` survives, studio/admin/missions surfaces (~200 legacy color references) need **zero** changes, and carry-forward #1 (focus-rule/`kinnso-orange` deletion coupling) **dissolves** — the global focus rule keeps `var(--color-kinnso-orange)` untouched.

**D-R1C-2 — Contrast floors (recomputed for the original palette; replaces the R1B moss/sun floors):**

| Pair | Ratio | Verdict |
|---|---|---|
| ink on cream | 15.1:1 | ✓ everything |
| muted on cream / cream2 | 5.3 / 4.69 | ✓ normal text — but cream2 has only 0.19 headroom: NEVER apply opacity to `kinnso-muted` on cream2 panels |
| cream on ink · white on ink | 15.2 / 17.0 | ✓ everything (muted-on-dark floor: `cream/60` min = 6.2:1 composited) |
| ink on orange (full opacity) | 5.6:1 | ✓ text on orange bands. Opacity floor: `ink/90` for small text (`ink/80` composites to 4.14:1 = FAIL) |
| amber on ink | 9.9:1 | ✓ text on dark bands. **NEVER text/outlines on cream/white** (1.5:1) |
| orangeDark on white / on cream | 4.79 / 4.26 | ✓ on white; **on cream = fails AA-normal by 0.24** — accepted brand deviation ②, documented in the carry-forward note for a future brand-a11y pass |
| orange on cream/white (as text) | 2.73 / 3.06 | ✗ — orange is fills/decoration ONLY, never text (including hover states — hover text is still text under WCAG 1.4.3) |
| orange focus ring on cream / on white | 2.73 / 3.06 | fails the 3:1 non-text floor (1.4.11) on cream; passes on white by 0.06 — this IS the original global rule the user asked back; accepted brand deviation ③ |
| white on orange (k2-btn-primary label) | 3.06:1 | fails AA at the rendered `text-sm font-bold` size (14px bold < 18.66px-bold large threshold) — restores the ORIGINAL `k-btn-primary` look; accepted brand deviation ① |

**Rules:** accent small text = `kinnso-orangeDark`, hover darkens to `kinnso-ink` (never brightens to orange); orange never as text in any state; amber never on light backgrounds (text OR outlines); ink-on-orange small text at ≥`/90` opacity; primary buttons = `bg-kinnso-orange text-white hover:bg-kinnso-orangeDark` (the original button); focus rings = `kinnso-orange` (original global rule, unchanged). **Three accepted brand AA deviations** (①②③ above) — all recorded in the carry-forwards note as inputs to a future brand-a11y pass.

**D-R1C-3 — Typography:** `--font-display` → Fraunces stack, `--font-sans` → Inter stack (values copied from the R1A `--font-k2-*` tokens, which are deleted). Bricolage Grotesque and DM Sans are removed from `next/font`; JetBrains Mono **stays** (`k-mono` is studio-internal). `k-display`, `k2-display`, and every `font-sans` consumer re-typograph automatically.

**D-R1C-4 — Ticket motif:** retired from every public page (locked D3). `MarketPassport` primitives + `k-*` classes stay defined for studio/admin only; final grep gate proves no public page imports them.

**D-R1C-5 — `/merchants`:** keeps its route + `MARKETING_PATHS` entry but is de-mocked (sample-missions grid deleted — master spec §4.1) and re-skinned; `/for-merchants` becomes the canonical acquisition landing and all acquisition links retarget to it. R2 restructures `/merchants` into the public directory.

**Controller handoff status (from PR #65):** migration `r1b_platform_stats_testimonials` IS applied on live (`20260702152125`); **3 testimonials are seeded but still `draft`** — publish them via `/admin/testimonials` at R1C PR time (checklist in Task 17).

---

## Scope guard (do NOT do in R1C)

No booking/experiences/Stripe (R2/R3); no `/api/agent` or live agent chat (R4 — `/agent` is a waitlist page); no sessions tables (R5); no studio/admin re-skin (k-* classes stay for internal surfaces); no edits to shipped migrations; content URLs (`/articles`, `/g/`, `/c/`) never move; `platform_stats()` RPC untouched (R3 owns the reshape); creator copilot untouched.

---

## File structure (created / modified)

**Created:** `supabase/migrations/20260703090000_r1c_agent_waitlist_and_testimonials_updated_at.sql` · `apps/web/lib/agent/waitlist-actions.ts` · `apps/web/components/kinnso/agent/AgentWaitlistForm.tsx` · `apps/web/components/kinnso/pages/AgentLandingView.tsx` · `apps/web/app/[locale]/for-creators/page.tsx` · `apps/web/components/kinnso/pages/ForCreatorsView.tsx` · `apps/web/app/[locale]/for-merchants/page.tsx` · `apps/web/components/kinnso/pages/ForMerchantsView.tsx` · `apps/web/components/kinnso/articles/ArticleGuideLinks.tsx` · tests for each.

**Modified (major):** `apps/web/app/globals.css` (single-palette rewrite) · `apps/web/app/layout.tsx` (fonts) · 17 `kinnso2-*` files (rename sweep) · `components/kinnso/GuideCard.tsx`, `pages/{ExploreView,CreatorsLandingView,MerchantsLandingView,CreatorProfileView}.tsx`, `app/[locale]/{g/[slug],articles/*,sign-in,sign-up}/…`, `_components/ComingSoonPage.tsx` (public de-ticketing) · `lib/i18n/messages/*.ts` ×7 · `lib/{guides,home}/queries.ts` · `lib/guides/types.ts` · `lib/creator-mock/*` (slim-down) · `lib/admin/*-actions.ts` + `testimonials-validation.ts` + `components/kinnso/admin/AdminTestimonialsView.tsx` (robustness) · `lib/seo/routes.ts` · `packages/db/types.ts` · `tests/{design.k2-tokens,i18n.locale-parity}.test.ts`.

**Deleted:** `components/kinnso/pages/AgentCopilotView.tsx` (replaced by AgentLandingView).

---

### Task 1: Branch hygiene + plan commit

**Files:** Create: `docs/superpowers/plans/2026-07-02-phase-r1c-original-palette-landings-sweep.md` (this file)

- [ ] **Step 1:** Confirm branch state — `git status --porcelain` must be clean except this plan file; `git log --oneline -1` must show `0fc1f69`. Current branch must be `feat/redesign-r1c`.
- [ ] **Step 2:** Commit:

```bash
git add docs/superpowers/plans/2026-07-02-phase-r1c-original-palette-landings-sweep.md
git commit -m "docs(web): Phase R1C plan — original-palette revert, landings, honest agent"
```

---

### Task 2: Palette canonicalization — globals.css, fonts, token-contract test

**Files:**
- Modify: `apps/web/app/globals.css` (the two `@theme` blocks + `@layer components` k2 rules)
- Modify: `apps/web/app/layout.tsx` (font exports)
- Test: `apps/web/tests/design.k2-tokens.test.ts` (rewrite)

- [ ] **Step 1: Rewrite the token-contract test to the NEW contract (fails first).** Replace the whole body of `apps/web/tests/design.k2-tokens.test.ts` with:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// R1C token contract (user decision 2026-07-02): the ORIGINAL kinnso-* palette is
// canonical again. kinnso2-* color tokens are gone; the k2-* editorial utilities
// stay, recolored to kinnso-*; Fraunces/Inter own --font-display/--font-sans; the
// legacy k-* ticket utilities stay DEFINED for studio/admin only.
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')
const layout = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8')

describe('R1C canonical design tokens', () => {
  it('keeps the original kinnso-* palette as the only color system', () => {
    expect(css).toContain('--color-kinnso-orange: #F26A1F')
    expect(css).toContain('--color-kinnso-orangeDark: #C24E0E')
    expect(css).toContain('--color-kinnso-cream: #F8F1E6')
    expect(css).toContain('--color-kinnso-cream2: #EFE3D2')
    expect(css).toContain('--color-kinnso-ink: #211B16')
    expect(css).toContain('--color-kinnso-edge: #DED5C7')
    expect(css).toContain('--color-kinnso-amber: #F4BD50')
  })

  it('has no kinnso2 color tokens or k2 font aliases left', () => {
    expect(css).not.toMatch(/--color-kinnso2-/)
    expect(css).not.toMatch(/--font-k2-/)
  })

  it('wires Fraunces and Inter to the canonical font tokens (CJK-safe stacks)', () => {
    expect(css).toMatch(/--font-display:\s*var\(--font-fraunces\)/)
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/)
    expect(css).toMatch(/--font-mono:\s*var\(--font-jetbrains-mono\)/)
    expect(layout).not.toContain('Bricolage_Grotesque')
    expect(layout).not.toContain('DM_Sans')
    expect(layout).toContain('Fraunces')
    expect(layout).toContain('Inter')
  })

  it('recolors the k2-* editorial utilities to the original palette', () => {
    for (const cls of ['.k2-container', '.k2-display', '.k2-eyebrow', '.k2-card', '.k2-hairline', '.k2-btn-primary', '.k2-btn-ghost']) {
      expect(css).toContain(cls)
    }
    expect(css).toMatch(/\.k2-btn-primary\s*\{[^}]*bg-kinnso-orange/)
    expect(css).toMatch(/\.k2-btn-primary\s*\{[^}]*hover:bg-kinnso-orangeDark/)
    expect(css).toMatch(/\.k2-eyebrow\s*\{[^}]*text-kinnso-orangeDark/)
    expect(css).toMatch(/\.k2-card\s*\{[^}]*border-kinnso-edge/)
  })

  it('keeps the original global focus rule on kinnso-orange', () => {
    expect(css).toMatch(/a:focus-visible,\s*button:focus-visible\s*\{\s*outline: 2px solid var\(--color-kinnso-orange\)/)
  })

  it('keeps the legacy k-* utilities for studio/admin (retired in a later phase)', () => {
    for (const cls of ['.k-container', '.k-card', '.k-btn-primary', '.k-ticket', '.k-route-stamp']) {
      expect(css).toContain(cls)
    }
  })
})
```

- [ ] **Step 2: Run it — must FAIL** (kinnso2 tokens still present):

```bash
cd apps/web && npx vitest run tests/design.k2-tokens.test.ts
```
Expected: FAIL on `has no kinnso2 color tokens` and the font assertions.

- [ ] **Step 3: Edit `apps/web/app/globals.css`.** Precise edits (line refs are pre-edit):
  1. In the LEGACY `@theme` block (lines ~35–37), repoint the font tokens (copy the CJK stacks from the current `--font-k2-*` values verbatim):
     ```css
     --font-display: var(--font-fraunces), 'Noto Serif TC', 'Songti TC', 'Noto Serif SC', 'Songti SC', 'Hiragino Mincho ProN', 'Yu Mincho', 'Nanum Myeongjo', 'AppleMyungjo', serif;
     --font-sans: var(--font-inter), 'PingFang TC', 'PingFang SC', 'Hiragino Sans', 'Noto Sans TC', 'Noto Sans SC', 'Noto Sans KR', 'Noto Sans Thai', system-ui, sans-serif;
     --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;
     ```
  2. DELETE the entire R1A `kinnso2` token sub-block (lines ~72–99: the `/* R1A "editorial travel journal" tokens */` comment, all 8 `--color-kinnso2-*` lines, and both `--font-k2-*` lines). Keep the `@utility shadow-kinnso` block.
  3. Replace the header comment of the legacy block ("Added ALONGSIDE… the final R1C task deletes the legacy block") with:
     ```css
     /* R1C: the ORIGINAL kinnso-* palette is the canonical design system again    */
     /* (user decision 2026-07-02). k2-* utilities below are the editorial         */
     /* component layer on top of it; k-* ticket utilities remain for studio/admin */
     /* only and are retired when those surfaces are redesigned.                   */
     ```
  4. In `@layer components`, rewrite the k2 rules (keep class names, swap colors/fonts):
     ```css
     .k2-container   { @apply mx-auto w-full max-w-[1200px] px-5 sm:px-8; }
     .k2-display     { font-family: var(--font-display); letter-spacing: -0.01em; }
     .k2-eyebrow     { @apply inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-orangeDark; } /* 4.79:1 on white, 4.26:1 on cream (fails AA-normal by 0.24 — accepted brand deviation ②, see R1C plan D-R1C-2). Never swap to kinnso-orange (2.73:1). */
     .k2-card        { @apply overflow-hidden rounded-[4px] border border-kinnso-edge bg-white; }
     .k2-hairline    { @apply border-t border-kinnso-edge; }
     .k2-btn-primary { @apply inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-orange px-6 py-2.5 text-sm font-bold tracking-wide text-white transition hover:bg-kinnso-orangeDark; }
     .k2-btn-ghost   { @apply inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] border border-kinnso-ink/25 px-6 py-2.5 text-sm font-semibold tracking-wide text-kinnso-ink transition hover:border-kinnso-ink hover:bg-kinnso-cream2/40; }

     .k2-btn-primary:focus-visible,
     .k2-btn-ghost:focus-visible {
       outline: 2px solid var(--color-kinnso-orange);
       outline-offset: 2px;
     }
     ```
  Do NOT touch the legacy `k-*` rules, the raw `--k-*` HSL channels, the radius tokens, keyframes, or either focus-visible rule (they already reference `kinnso-orange`).

- [ ] **Step 4: Edit `apps/web/app/layout.tsx`.** Delete the `Bricolage_Grotesque` and `DM_Sans` imports and their two `export const` blocks; update the import line to `import { JetBrains_Mono, Fraunces, Inter } from 'next/font/google'`; update the comment (line ~8) to `// JetBrains Mono stays for studio k-mono; Fraunces/Inter are the canonical display/body faces (R1C).`; set:
  ```ts
  export const fontVariables = `${jetBrainsMono.variable} ${fraunces.variable} ${inter.variable}`
  ```
  Then purge every other reference to the deleted fonts — code AND comments (the Task 17 gate requires absolute zero): `grep -rn "Bricolage\|DM_Sans\|dmSans\|bricolage" apps/web --include='*.ts*'` → fix each hit by deleting it.
- [ ] **Step 4b: Rewrite `apps/web/tests/layout.fonts.test.ts`** — it currently mocks `Bricolage_Grotesque`/`DM_Sans` factories (L9-10) and asserts `fontVariables` contains `--font-bricolage`/`--font-dm-sans` (L20-21). Keep only the `JetBrains_Mono`/`Fraunces`/`Inter` mocks and assert:

```ts
expect(fontVariables).toContain('--font-jetbrains-mono')
expect(fontVariables).toContain('--font-fraunces')
expect(fontVariables).toContain('--font-inter')
expect(fontVariables).not.toContain('--font-bricolage')
expect(fontVariables).not.toContain('--font-dm-sans')
```
- [ ] **Step 5:** `cd apps/web && npx vitest run tests/design.k2-tokens.test.ts tests/layout.fonts.test.ts` — Expected: PASS. Note: the app now has dangling `kinnso2-*` CLASS references in 17 files (colors silently resolve to nothing) — that is Task 3, immediately next; do not run the dev server between these tasks expecting correct colors.
- [ ] **Step 6: Commit:**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx apps/web/tests/design.k2-tokens.test.ts apps/web/tests/layout.fonts.test.ts
git commit -m "feat(web): R1C palette revert — original kinnso-* tokens canonical, Fraunces/Inter on canonical font tokens"
```

---

### Task 3: Role-aware `kinnso2-*` → `kinnso-*` rename sweep (17 files)

**Files:** Modify every file matching `grep -rl 'kinnso2-\|font-k2-' apps/web/app apps/web/components apps/web/lib apps/web/tests` — as of planning: `SiteChrome.tsx`, `Navbar.tsx`, `Footer.tsx`, `LocaleSwitcher.tsx` (no kinnso2 — verify only), `editorial/{SectionShell,EditorialCard,Eyebrow}.tsx`, `home/{Hero,StatsBar,HowItWorks,AgentTeaser,MerchantValue,CreatorCta}.tsx`, `pages/HomeView.tsx`, `app/[locale]/{page,destinations/page,sessions/page}.tsx`, plus any test referencing the classes.

- [ ] **Step 1: Mechanical sed (ORDER MATTERS — text/decoration variants before generic, deep before base):**

```bash
cd apps/web
grep -rl 'kinnso2-\|font-k2-' app components lib tests | xargs sed -i '' \
  -e 's/decoration-kinnso2-clay-deep/decoration-kinnso-orangeDark/g' \
  -e 's/decoration-kinnso2-clay/decoration-kinnso-orangeDark/g' \
  -e 's/text-kinnso2-clay-deep/text-kinnso-ink/g' \
  -e 's/text-kinnso2-clay/text-kinnso-orangeDark/g' \
  -e 's/outline-kinnso2-clay/outline-kinnso-orange/g' \
  -e 's/kinnso2-clay-deep/kinnso-orangeDark/g' \
  -e 's/kinnso2-clay/kinnso-orange/g' \
  -e 's/kinnso2-paper/kinnso-cream/g' \
  -e 's/kinnso2-sand/kinnso-cream2/g' \
  -e 's/kinnso2-line/kinnso-edge/g' \
  -e 's/kinnso2-ink/kinnso-ink/g' \
  -e 's/kinnso2-sun/kinnso-amber/g' \
  -e 's/font-k2-sans/font-sans/g' \
  -e 's/font-k2-display/font-display/g'
```

Rationale: `text-…-clay` sites (10: nav active/For-Merchants links, "see all →" links in HomeView) become `orangeDark` text; `text-…-clay-deep` only occurs in hover states (HomeView "see all" links) and maps to `hover:text-kinnso-ink` — hover DARKENS, never brightens to orange (D-R1C-2: hover text is still text). Fills/dots/focus-outlines take plain `orange` (the original focus/button language). `kinnso2-sun` TEXT sites (Footer column headers, AgentTeaser eyebrow) sit on dark bands where amber is 9.9:1 ✓; the CreatorCta dot is decorative; the SiteChrome skip-link OUTLINE is a hand exception (Step 3) because the outline draws against the cream page where amber is ~1.5:1. `kinnso2-moss` is deliberately NOT in the sed — its 2 sites are hand-redesigned next.

- [ ] **Step 2: Hand-redesign the two moss sites.**
  1. **`components/kinnso/home/CreatorCta.tsx`** — the moss band becomes the brand's orange moment (ink text = 5.6:1 ✓). Replace the whole file body:

```tsx
import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * Section 9 — creator recruitment. R1C: the original-brand orange band replaces
 * the retired moss band. All text is FULL-OPACITY ink (5.6:1 — D-R1C-2: ink/80
 * on orange fails AA for small text); the button/dots are ink fills.
 * CTA → /sign-up for now; Task 9 retargets it to /for-creators (master spec §4.1 §9).
 */
export function CreatorCta({ locale, t }: { locale: Locale; t: Messages['home'] }) {
  const bullets = [t.creatorBullet1, t.creatorBullet2, t.creatorBullet3]
  return (
    <section className="bg-kinnso-orange py-16 md:py-24">
      <div className="k2-container">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-ink">{t.creatorEyebrow}</p>
        <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.creatorHeading}</h2>
        <ul className="mt-6 max-w-2xl space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex gap-3 leading-relaxed text-kinnso-ink/90">
              <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-kinnso-ink" />
              {b}
            </li>
          ))}
        </ul>
        <Link
          href={`/${locale}/sign-up`}
          className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-ink px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t.creatorCta}
        </Link>
      </div>
    </section>
  )
}
```
  2. **`app/[locale]/sessions/page.tsx` line 31** — `<Eyebrow className="text-kinnso2-moss">` (post-sed it still says `kinnso2-moss` because moss was excluded) → drop the override entirely: `<Eyebrow>{t.eyebrow}</Eyebrow>`.

- [ ] **Step 3: Hand exceptions (post-sed touch-ups):**
  1. `components/kinnso/Footer.tsx` line 35: `text-kinnso-cream/50` → `text-kinnso-cream/60` (carry-forward #21 — a readability bump: cream/50 composites to 4.74:1 which already met AA; /60 = 6.2:1 gives real headroom).
  2. `components/kinnso/LocaleSwitcher.tsx` line 33: align the control with the new chrome — replace `rounded-pill` with `rounded-[3px]` (rest of the classes are already canonical `kinnso-*`; carry-forward #2 otherwise dissolves under the revert).
  3. `components/kinnso/SiteChrome.tsx` line 35 (skip link): the sed produced `focus:outline-kinnso-amber`, but the outline draws against the CREAM page (amber ≈1.5:1 there) — change it to `focus:outline-kinnso-orange` (matches the global focus rule; covered by accepted deviation ③).
  4. Verify no stray `kinnso2`/`k2 font` refs: `grep -rn "kinnso2-\|font-k2-" apps/web/app apps/web/components apps/web/lib apps/web/tests | grep -v tests/design.k2-tokens.test.ts` → **zero matches** (the design-token test keeps the literals in its negative assertions; never grep the repo root — `.next/` build artifacts contain stale matches).
- [ ] **Step 4: Run the design-affected suites:**

```bash
cd apps/web && npx vitest run tests/design.k2-tokens.test.ts tests/kinnso.route-parity.test.tsx tests/kinnso.Navbar.test.tsx tests/kinnso.home-bands.test.tsx tests/kinnso.home-hero-stats.test.tsx tests/home.host.test.tsx
```
Expected: PASS (these assert roles/text/hrefs, not color classes; fix any class-string assertion the sweep broke by updating it to the kinnso-* equivalent).
- [ ] **Step 5: Commit:**

```bash
git add -A apps/web
git commit -m "refactor(web): rename kinnso2-* usages to canonical kinnso-* palette (role-aware accents, orange CreatorCta band)"
```

---

### Task 4: Migration — `agent_waitlist` table + `testimonials.updated_at`

**Files:**
- Create: `supabase/migrations/20260703090000_r1c_agent_waitlist_and_testimonials_updated_at.sql`
- Modify: `packages/db/types.ts` (hand-add, MCP regen reconciles at PR time)

- [ ] **Step 1: Write the migration** (reuses `public.set_updated_at()` from `20260614000010_creator_triggers.sql`; `is_active_ops()` from the ops migrations):

```sql
-- R1C: (1) agent_waitlist — honest traveller-agent waitlist capture for /agent.
-- Insert-only for everyone (anon + authenticated); read is ops-only. No update/
-- delete policies (rows are append-only CRM capture; deletion is a manual ops SQL
-- decision until a console surface exists). Unique email = idempotent joins; the
-- server action treats 23505 as success.
-- DOCUMENTED §7 DEVIATION: this is an anon direct table INSERT, not an audited
-- SECURITY DEFINER RPC — acceptable because no money/state is touched, the table
-- is append-only, RLS blocks all reads, and the DB CHECK + unique constraint
-- bound the damage. Abuse control: honeypot in the form (see waitlist-actions);
-- per-IP rate limiting is a recorded carry-forward for the R4 agent hardening.
-- (2) testimonials.updated_at + touch trigger (R1B carry-forward #11).

create table if not exists public.agent_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  locale text check (locale is null or locale in ('en','zh-hk','zh-tw','zh-cn','ja','ko','th')),
  created_at timestamptz not null default now(),
  constraint agent_waitlist_email_shape
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254)
);

alter table public.agent_waitlist enable row level security;

create policy agent_waitlist_public_insert on public.agent_waitlist
  for insert to anon, authenticated
  with check (true);

create policy agent_waitlist_ops_read on public.agent_waitlist
  for select to authenticated
  using (public.is_active_ops());

revoke all on table public.agent_waitlist from anon, authenticated;
grant insert on table public.agent_waitlist to anon, authenticated;
grant select on table public.agent_waitlist to authenticated;

alter table public.testimonials
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists testimonials_set_updated_at on public.testimonials;
create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute procedure public.set_updated_at();
```

- [ ] **Step 2: Hand-update `packages/db/types.ts`:** add `agent_waitlist` to `Tables` (Row: `{ id: string; email: string; locale: string | null; created_at: string }`; Insert: `{ id?: string; email: string; locale?: string | null; created_at?: string }`; Update: all optional; `Relationships: []`) following the exact shape of the `testimonials` entry beside it, and add `updated_at: string` to `testimonials` Row (+ optional in Insert/Update).
- [ ] **Step 3:** `pnpm --filter web typecheck` — Expected: PASS (no consumers yet).
- [ ] **Step 4: Commit:**

```bash
git add supabase/migrations/20260703090000_r1c_agent_waitlist_and_testimonials_updated_at.sql packages/db/types.ts
git commit -m "feat(db): agent_waitlist (insert-only RLS) + testimonials.updated_at touch trigger"
```
**Do NOT apply to live from this sandbox** — application happens via Supabase MCP `apply_migration` (name `r1c_agent_waitlist_and_testimonials_updated_at`) in the Task 17 handoff.

---

### Task 5: Homepage data polish (carry-forwards #16 #17 #19 + testimonials role filter)

**Files:**
- Modify: `apps/web/lib/guides/queries.ts:25-33` · `apps/web/lib/home/queries.ts:54-70` · `apps/web/app/[locale]/page.tsx:30-44` · `apps/web/components/kinnso/pages/HomeView.tsx` · `apps/web/lib/i18n/messages/*.ts` ×7 (`home.testimonialsHeading`)
- Test: `apps/web/tests/guides.queries.test.ts` · `apps/web/tests/home.queries.test.ts` · `apps/web/tests/home.host.test.tsx`

- [ ] **Step 1: Failing tests first.** In `tests/guides.queries.test.ts` add (if the file's existing supabase chain mock does not already expose per-method spies, add this self-contained one):

```ts
const limitSpy = vi.fn().mockResolvedValue({ data: [] })
const chain: Record<string, unknown> = {}
Object.assign(chain, {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  order: vi.fn(() => chain), limit: limitSpy,
  then: (resolve: (v: { data: never[] }) => void) => resolve({ data: [] }), // awaiting the bare chain (no limit) also resolves
})
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: () => ({ from: vi.fn(() => chain) }) }))

it('getPublishedGuides forwards a row limit when given', async () => {
  await getPublishedGuides(6)
  expect(limitSpy).toHaveBeenCalledWith(6)
})
```
In `tests/home.queries.test.ts` add (its chain mock already exists for testimonials — capture the `eq` spy off it):
```ts
it('getPublishedTestimonials filters by author_role when given', async () => {
  await getPublishedTestimonials('en', 'creator')
  expect(eqSpy).toHaveBeenCalledWith('author_role', 'creator')
})
```
Run: `cd apps/web && npx vitest run tests/guides.queries.test.ts tests/home.queries.test.ts` — Expected: FAIL (new params unknown).

- [ ] **Step 2: Implement.**
  1. `lib/guides/queries.ts` — `getPublishedGuides(limit?: number)`: after `.order('published_at', { ascending: false })` add `if (limit !== undefined) query = query.limit(limit)` (restructure to `let query = supabase.from(…)…`; `const { data } = await query`).
  2. `lib/home/queries.ts` — `getPublishedTestimonials(locale: Locale, role?: Testimonial['authorRole'])`: build the query in a `let`, and before `.limit(3)` add `if (role) query = query.eq('author_role', role)`.
  3. `app/[locale]/page.tsx` line ~32: `getPublishedGuides()` → `getPublishedGuides(6)`; AND line 44: `guides={guides.slice(0, 6)}` → `guides={guides}` (carry-forward #16 names BOTH slices — this is the second one).
  4. `HomeView.tsx` line 89: `guides.slice(0, 6).map` → `guides.map` (query now bounds it; Hero's internal top-3 pick is unchanged).
  5. **#19 guard:** in HomeView, above the `return`, add `const linkableArticles = articles.filter((a) => toUrlCategory(a.category))` and switch section 6 to `linkableArticles.length > 0 ?` + `linkableArticles.slice(0, 3).map(…)` (drop the inner `if (!cat) return null` fallback to `null` — `cat` is now always truthy but keep the guard for type narrowing).
  6. **#17 a11y name:** give the testimonials strip an accessible name — replace the strip's opening with:

```tsx
<SectionShell className="k2-hairline" aria-labelledby="home-testimonials-heading">
  <h2 id="home-testimonials-heading" className="sr-only">{t.testimonialsHeading}</h2>
```
  `SectionShell` doesn't forward unknown props — extend it: add `...rest` spread (`{ as, className, children, ...rest }: { … } & HTMLAttributes<HTMLElement>`) and apply to `<Tag {...rest}>`.
  7. Add `testimonialsHeading` to the `home` group in the `Messages` interface and ALL 7 locale files: en `'What people say about KINNSO'` · zh-hk `'大家點睇 KINNSO'` · zh-tw `'大家怎麼看 KINNSO'` · zh-cn `'大家怎么看 KINNSO'` · ja `'KINNSO利用者の声'` · ko `'KINNSO 사용자들의 이야기'` · th `'เสียงจากผู้ใช้ KINNSO'`.
- [ ] **Step 3:** Run: `cd apps/web && npx vitest run tests/guides.queries.test.ts tests/home.queries.test.ts tests/home.host.test.tsx tests/i18n.locale-parity.test.ts` — Expected: PASS.
- [ ] **Step 4: Commit:** `git add -A apps/web && git commit -m "feat(web): guide limit at query, testimonial role filter, homepage articles guard + a11y section name"`

---

### Task 6: `/agent` honest rewrite — traveller waitlist with real capture

The current `AgentCopilotView` markets the CREATOR copilot while the homepage's "Join the agent waitlist" CTA points here expecting the TRAVELLER agent — dishonest twice over. Replace it wholesale.

**Files:**
- Create: `apps/web/lib/agent/waitlist-actions.ts` · `apps/web/components/kinnso/agent/AgentWaitlistForm.tsx` · `apps/web/components/kinnso/pages/AgentLandingView.tsx`
- Delete: `apps/web/components/kinnso/pages/AgentCopilotView.tsx`
- Modify: `apps/web/app/[locale]/agent/page.tsx` (swap view import only) · `lib/i18n/messages/*.ts` ×7 (`agent` group REWRITE + `seo.agent` values) · `tests/i18n.locale-parity.test.ts` (GROUPS gains `'agent'` — it was never registered: confirmed missing from the list, exactly the class of bug carry-forward #6 predicts)
- Test: Create `apps/web/tests/agent.waitlist-actions.test.ts` · `apps/web/tests/agent.landing.test.tsx`

- [ ] **Step 1: Failing action test.** Create `tests/agent.waitlist-actions.test.ts` (mock `@/lib/supabase/public` the same way `tests/home.queries.test.ts` does):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn()
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: () => ({ insert: insertMock }) }),
}))

import { joinAgentWaitlistAction } from '@/lib/agent/waitlist-actions'

describe('joinAgentWaitlistAction', () => {
  beforeEach(() => insertMock.mockReset())

  it('rejects an invalid email without touching the DB', async () => {
    expect(await joinAgentWaitlistAction('en', 'not-an-email')).toEqual({ ok: false, error: 'invalid' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('normalizes and inserts a valid email', async () => {
    insertMock.mockResolvedValue({ error: null })
    expect(await joinAgentWaitlistAction('en', '  Traveller@Example.COM ')).toEqual({ ok: true })
    expect(insertMock).toHaveBeenCalledWith({ email: 'traveller@example.com', locale: 'en' })
  })

  it('treats a duplicate email (23505) as success — idempotent join', async () => {
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    expect(await joinAgentWaitlistAction('en', 'a@b.co')).toEqual({ ok: true })
  })

  it('reports (and logs) other DB errors as failed', async () => {
    insertMock.mockResolvedValue({ error: { code: '42501', message: 'nope' } })
    expect(await joinAgentWaitlistAction('en', 'a@b.co')).toEqual({ ok: false, error: 'failed' })
  })

  it('honeypot submissions get a fake success and never touch the DB', async () => {
    expect(await joinAgentWaitlistAction('en', 'a@b.co', 'bot-filled-this')).toEqual({ ok: true })
    expect(insertMock).not.toHaveBeenCalled()
  })
})
```
Run: `cd apps/web && npx vitest run tests/agent.waitlist-actions.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: `lib/agent/waitlist-actions.ts`:**

```ts
'use server'

import { isLocale, type Locale } from '@/lib/i18n/config'
import { createSupabasePublicClient } from '@/lib/supabase/public'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type WaitlistResult = { ok: true } | { ok: false; error: 'invalid' | 'failed' }

/**
 * Anon-writable, insert-only waitlist join (RLS: agent_waitlist_public_insert —
 * a documented §7 deviation, see the R1C migration header). Unique-violation
 * (23505) is a success: joining twice is a no-op, and this doubles as an
 * email-enumeration shield — the response never reveals whether an address was
 * already on the list. `hp` is the form honeypot: bots that fill it get a fake
 * success and no insert. Per-IP rate limiting is a recorded R4 carry-forward.
 */
export async function joinAgentWaitlistAction(locale: Locale, email: string, hp?: string): Promise<WaitlistResult> {
  if (hp) return { ok: true }
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) return { ok: false, error: 'invalid' }

  const supabase = createSupabasePublicClient()
  const { error } = await supabase
    .from('agent_waitlist')
    .insert({ email: normalized, locale: isLocale(locale) ? locale : null })
  if (error && error.code !== '23505') {
    console.error('[agent:waitlist] join failed', error)
    return { ok: false, error: 'failed' }
  }
  return { ok: true }
}
```

- [ ] **Step 3:** `npx vitest run tests/agent.waitlist-actions.test.ts` — Expected: PASS.
- [ ] **Step 4: `components/kinnso/agent/AgentWaitlistForm.tsx`** (client; try/finally per carry-forward #14's lesson; `aria-live` status):

```tsx
'use client'
import { useState } from 'react'
import { joinAgentWaitlistAction } from '@/lib/agent/waitlist-actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AgentWaitlistForm({ locale, t }: { locale: Locale; t: Messages['agent'] }) {
  const [email, setEmail] = useState('')
  const [hp, setHp] = useState('') // honeypot — humans never see or fill it
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<'idle' | 'done' | 'invalid' | 'failed'>('idle')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await joinAgentWaitlistAction(locale, email, hp)
      setState(res.ok ? 'done' : res.error)
    } catch {
      setState('failed')
    } finally {
      setPending(false)
    }
  }

  if (state === 'done') {
    return <p aria-live="polite" className="text-kinnso-amber">{t.successNote}</p>
  }
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <input
        type="text"
        name="website"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <label className="flex-1">
        <span className="sr-only">{t.emailLabel}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder}
          autoComplete="email"
          className="min-h-[44px] w-full rounded-[3px] border border-kinnso-cream/30 bg-white/10 px-4 py-2.5 text-sm text-kinnso-cream placeholder:text-kinnso-cream/50 outline-none transition focus-visible:border-kinnso-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
        />
      </label>
      <button type="submit" disabled={pending} className="k2-btn-primary disabled:opacity-60">
        {t.submitCta}
      </button>
      <p aria-live="polite" role="status" className="basis-full text-sm text-kinnso-amber">
        {state === 'invalid' ? t.errorInvalid : state === 'failed' ? t.errorGeneric : ''}
      </p>
    </form>
  )
}
```

- [ ] **Step 5: `components/kinnso/pages/AgentLandingView.tsx`:**

```tsx
import Link from 'next/link'
import { CalendarRange, Compass, MapPinned } from 'lucide-react'
import { AgentWaitlistForm } from '@/components/kinnso/agent/AgentWaitlistForm'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * R1C honest traveller-agent waitlist (master spec §4.1: never feature a
 * non-live agent as live). Value framing + real email capture; R4 replaces
 * this page with the live chat surface.
 */
export function AgentLandingView({ locale, t }: { locale: Locale; t: Messages['agent'] }) {
  const p = (path: string) => `/${locale}${path}`
  const points = [
    { title: t.point1Title, body: t.point1Body, icon: <MapPinned aria-hidden="true" className="h-5 w-5" /> },
    { title: t.point2Title, body: t.point2Body, icon: <CalendarRange aria-hidden="true" className="h-5 w-5" /> },
    { title: t.point3Title, body: t.point3Body, icon: <Compass aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <div className="grid gap-5 md:grid-cols-3">
          {points.map((pt) => (
            <EditorialCard key={pt.title} title={pt.title}>
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{pt.icon}</span>
              {pt.body}
            </EditorialCard>
          ))}
        </div>
      </SectionShell>

      <section className="bg-kinnso-ink py-16 md:py-24">
        <div className="k2-container">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-amber">{t.formHeading}</p>
          <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso-cream md:text-4xl">{t.formBody}</h2>
          <div className="mt-8"><AgentWaitlistForm locale={locale} t={t} /></div>
        </div>
      </section>

      <SectionShell>
        <p className="max-w-2xl leading-relaxed text-kinnso-ink/70">{t.honestNote}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Link href={p('/explore')} className="k2-btn-primary">{t.exploreCta}</Link>
          <Link href={p('/articles')} className="k2-btn-ghost">{t.articlesCta}</Link>
        </div>
      </SectionShell>
    </main>
  )
}

export default AgentLandingView
```

- [ ] **Step 6:** Delete `components/kinnso/pages/AgentCopilotView.tsx` AND its test `tests/kinnso.AgentCopilotView.test.tsx` (it imports the deleted module and asserts deleted `agent.heroTitle`/`value1Title` keys — typecheck breaks otherwise). Rewrite `tests/agent.host.test.tsx`: it asserts `en.agent.heroTitle`; replace its host assertion with the new keys (heading = `en.agent.title`, waitlist button = `en.agent.submitCta`). In `app/[locale]/agent/page.tsx` swap the import/usage to `AgentLandingView` (same `t={messages.agent}` prop; metadata line already uses `dict.seo.agent` — unchanged shape). **JSON-LD/robots decision (spec §7):** `/agent` keeps the layout-level Organization/WebSite JSON-LD like every marketing page (no per-page JSON-LD, matching /about, /contact); `ROBOTS_DISALLOW` untouched (route is public and already in MARKETING_PATHS).
- [ ] **Step 7: i18n — REWRITE the `agent` group** (interface in `en.ts` + values in all 7; delete every old key: `heroPill…ctaButton`). New interface:

```ts
agent: {
  eyebrow: string; title: string; body: string
  point1Title: string; point1Body: string
  point2Title: string; point2Body: string
  point3Title: string; point3Body: string
  formHeading: string; formBody: string
  emailLabel: string; emailPlaceholder: string; submitCta: string
  successNote: string; errorInvalid: string; errorGeneric: string
  honestNote: string; exploreCta: string; articlesCta: string
}
```

**en:**
```ts
agent: {
  eyebrow: 'KINNSO AI Agent',
  title: 'A travel agent grounded in real creators’ guides',
  body: 'Ask for a plan and get real places pulled from published creator guides and articles — not generic lists. The agent is in private preview while we wire it to live guides.',
  point1Title: 'Grounded in real guides', point1Body: 'Every suggestion traces back to a published creator guide or article — no invented spots.',
  point2Title: 'Plans around you', point2Body: 'Tell it your destination, dates and pace; it drafts an outline you can actually follow.',
  point3Title: 'Built for booking', point3Body: 'When direct booking ships, recommendations will link straight to bookable stays and experiences.',
  formHeading: 'Be first in line', formBody: 'Leave your email and we’ll invite you when the agent opens.',
  emailLabel: 'Email address', emailPlaceholder: 'you@example.com', submitCta: 'Join the waitlist',
  successNote: 'You’re on the list — we’ll email you when the agent opens.',
  errorInvalid: 'Enter a valid email address.', errorGeneric: 'Something went wrong — please try again.',
  honestNote: 'The agent isn’t live yet — we only ship it when it’s genuinely useful. Until then, the same knowledge is all here:',
  exploreCta: 'Explore guides', articlesCta: 'Read articles',
},
```
**zh-hk:**
```ts
agent: {
  eyebrow: 'KINNSO AI 旅行助理',
  title: '一個識得創作者私藏路線嘅 AI 旅行助理',
  body: '講低你想點玩，助理就會由已發佈嘅創作者攻略同文章入面搵真實好去處——唔係行貨清單。目前處於私人測試階段，我哋正將佢接通至最新攻略。',
  point1Title: '建基於真實攻略', point1Body: '每個建議都可以追溯到已發佈嘅創作者攻略或文章，冇作出嚟嘅景點。',
  point2Title: '跟你嘅節奏計劃', point2Body: '話低目的地、日期同步伐，助理會草擬一個真係行得通嘅行程大綱。',
  point3Title: '為預訂而生', point3Body: '直接預訂功能推出後，建議會直接連去可預訂嘅住宿同體驗。',
  formHeading: '搶先體驗', formBody: '留低電郵，助理開放時我哋會第一時間邀請你。',
  emailLabel: '電郵地址', emailPlaceholder: 'you@example.com', submitCta: '加入等候名單',
  successNote: '已加入名單——助理開放時我哋會電郵通知你。',
  errorInvalid: '請輸入有效嘅電郵地址。', errorGeneric: '出咗啲問題——請再試一次。',
  honestNote: '助理仲未推出——我哋只會喺佢真係好用嘅時候先出街。而家不妨先睇睇：',
  exploreCta: '探索攻略', articlesCta: '閱讀文章',
},
```
**zh-tw:**
```ts
agent: {
  eyebrow: 'KINNSO AI 旅遊助理',
  title: '一個懂創作者私房路線的 AI 旅遊助理',
  body: '說出你的旅行想法，助理會從已發布的創作者攻略與文章中找出真實好去處——不是制式清單。目前為私人預覽，我們正將它接上最新攻略。',
  point1Title: '根植於真實攻略', point1Body: '每個建議都能追溯到已發布的創作者攻略或文章，沒有憑空捏造的景點。',
  point2Title: '照你的步調規劃', point2Body: '告訴它目的地、日期與節奏，它會擬出一份真的走得完的行程大綱。',
  point3Title: '為預訂而生', point3Body: '直接預訂功能上線後，建議會直接連到可預訂的住宿與體驗。',
  formHeading: '搶先體驗', formBody: '留下電子郵件，助理開放時我們會第一時間邀請你。',
  emailLabel: '電子郵件', emailPlaceholder: 'you@example.com', submitCta: '加入候補名單',
  successNote: '已加入名單——助理開放時我們會寄信通知你。',
  errorInvalid: '請輸入有效的電子郵件。', errorGeneric: '發生錯誤——請再試一次。',
  honestNote: '助理尚未上線——我們只在它真正好用時推出。在那之前，同樣的知識都在這裡：',
  exploreCta: '探索攻略', articlesCta: '閱讀文章',
},
```
**zh-cn:**
```ts
agent: {
  eyebrow: 'KINNSO AI 旅行助理',
  title: '一个懂创作者私藏路线的 AI 旅行助理',
  body: '说出你的旅行想法，助理会从已发布的创作者攻略与文章中找出真实好去处——不是模板清单。目前为私人预览，我们正在将它接入最新攻略。',
  point1Title: '基于真实攻略', point1Body: '每个建议都能追溯到已发布的创作者攻略或文章，没有凭空编造的景点。',
  point2Title: '按你的节奏规划', point2Body: '告诉它目的地、日期和节奏，它会拟出一份真正走得完的行程大纲。',
  point3Title: '为预订而生', point3Body: '直接预订功能上线后，建议会直接链接到可预订的住宿与体验。',
  formHeading: '抢先体验', formBody: '留下邮箱，助理开放时我们会第一时间邀请你。',
  emailLabel: '邮箱地址', emailPlaceholder: 'you@example.com', submitCta: '加入等候名单',
  successNote: '已加入名单——助理开放时我们会邮件通知你。',
  errorInvalid: '请输入有效的邮箱地址。', errorGeneric: '出了点问题——请重试。',
  honestNote: '助理尚未上线——我们只在它真正好用时发布。在此之前，同样的知识都在这里：',
  exploreCta: '探索攻略', articlesCta: '阅读文章',
},
```
**ja:**
```ts
agent: {
  eyebrow: 'KINNSO AIエージェント',
  title: 'クリエイターの実体験ガイドに根ざしたAI旅行エージェント',
  body: '行きたい旅を伝えると、公開済みのクリエイターガイドや記事から実在のスポットを提案します。ありきたりのリストではありません。現在はプライベートプレビュー中です。',
  point1Title: '実在ガイドが根拠', point1Body: 'すべての提案は公開済みのガイドや記事まで遡れます。架空のスポットはありません。',
  point2Title: 'あなたに合わせた計画', point2Body: '目的地・日程・ペースを伝えるだけで、実際に回れる旅程の下書きを作ります。',
  point3Title: '予約を見据えた設計', point3Body: '直接予約の提供開始後は、予約可能な宿泊や体験へそのままリンクします。',
  formHeading: 'いち早く体験', formBody: 'メールアドレスを登録すると、公開時に最初にご招待します。',
  emailLabel: 'メールアドレス', emailPlaceholder: 'you@example.com', submitCta: 'ウェイトリストに登録',
  successNote: '登録しました。公開時にメールでお知らせします。',
  errorInvalid: '有効なメールアドレスを入力してください。', errorGeneric: 'エラーが発生しました。もう一度お試しください。',
  honestNote: 'エージェントはまだ公開前です。本当に役立つものになってからお届けします。それまでは、同じ知識をこちらでどうぞ：',
  exploreCta: 'ガイドを探す', articlesCta: '記事を読む',
},
```
**ko:**
```ts
agent: {
  eyebrow: 'KINNSO AI 에이전트',
  title: '크리에이터의 진짜 가이드에 기반한 AI 여행 에이전트',
  body: '원하는 여행을 알려주면 공개된 크리에이터 가이드와 아티클에서 실제 장소를 찾아 제안합니다. 뻔한 목록이 아닙니다. 현재 비공개 프리뷰 중입니다.',
  point1Title: '진짜 가이드 기반', point1Body: '모든 제안은 공개된 크리에이터 가이드나 아티클로 거슬러 올라갑니다. 지어낸 장소는 없습니다.',
  point2Title: '나에게 맞춘 계획', point2Body: '목적지, 날짜, 여행 속도를 알려주면 실제로 소화할 수 있는 일정 초안을 만들어 줍니다.',
  point3Title: '예약까지 이어지는 설계', point3Body: '직접 예약 기능이 열리면 추천이 예약 가능한 숙소와 체험으로 바로 연결됩니다.',
  formHeading: '가장 먼저 만나보세요', formBody: '이메일을 남기시면 에이전트 공개 시 가장 먼저 초대해 드립니다.',
  emailLabel: '이메일 주소', emailPlaceholder: 'you@example.com', submitCta: '대기 명단 등록',
  successNote: '등록되었습니다. 에이전트가 열리면 이메일로 알려 드립니다.',
  errorInvalid: '유효한 이메일 주소를 입력하세요.', errorGeneric: '문제가 발생했습니다. 다시 시도해 주세요.',
  honestNote: '에이전트는 아직 공개 전입니다. 정말 쓸모 있을 때 선보이겠습니다. 그때까지 같은 지식을 여기에서 만나보세요:',
  exploreCta: '가이드 둘러보기', articlesCta: '아티클 읽기',
},
```
**th:**
```ts
agent: {
  eyebrow: 'KINNSO AI เอเจนต์',
  title: 'เอเจนต์ท่องเที่ยว AI ที่อิงจากไกด์จริงของครีเอเตอร์',
  body: 'บอกทริปที่อยากไป แล้วเอเจนต์จะค้นสถานที่จริงจากไกด์และบทความของครีเอเตอร์ที่เผยแพร่แล้ว ไม่ใช่ลิสต์สำเร็จรูป ตอนนี้อยู่ในช่วงพรีวิวส่วนตัว',
  point1Title: 'อิงจากไกด์จริง', point1Body: 'ทุกคำแนะนำย้อนกลับไปยังไกด์หรือบทความที่เผยแพร่แล้วได้เสมอ ไม่มีสถานที่ที่แต่งขึ้นเอง',
  point2Title: 'วางแผนตามสไตล์คุณ', point2Body: 'บอกจุดหมาย วันเดินทาง และจังหวะการเที่ยว แล้วรับโครงร่างทริปที่เดินตามได้จริง',
  point3Title: 'ออกแบบเพื่อการจอง', point3Body: 'เมื่อระบบจองตรงเปิดใช้ คำแนะนำจะลิงก์ตรงไปยังที่พักและประสบการณ์ที่จองได้',
  formHeading: 'เป็นคนแรกที่ได้ลอง', formBody: 'ทิ้งอีเมลไว้ แล้วเราจะเชิญคุณทันทีที่เอเจนต์เปิดให้ใช้',
  emailLabel: 'อีเมล', emailPlaceholder: 'you@example.com', submitCta: 'เข้าคิวรอใช้งาน',
  successNote: 'อยู่ในรายชื่อแล้ว เราจะอีเมลแจ้งเมื่อเอเจนต์เปิดให้ใช้',
  errorInvalid: 'กรุณากรอกอีเมลที่ถูกต้อง', errorGeneric: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
  honestNote: 'เอเจนต์ยังไม่เปิดให้ใช้ เราจะปล่อยเมื่อมันมีประโยชน์จริงเท่านั้น ระหว่างนี้ความรู้เดียวกันอยู่ที่นี่:',
  exploreCta: 'สำรวจไกด์', articlesCta: 'อ่านบทความ',
},
```

Also update `seo.agent` values in all 7 (same `{title, description}` shape) to traveller framing — en: `title: 'KINNSO AI travel agent — join the waitlist'`, `description: 'An AI travel agent grounded in real creator guides. Join the waitlist to be first in when it opens.'`; translate in the same register as the blocks above (zh-hk `'KINNSO AI 旅行助理 — 加入等候名單'` etc.).

- [ ] **Step 8: Register `'agent'` in the parity GROUPS** (`tests/i18n.locale-parity.test.ts` line ~14 — it was missing; the Task 15 hardening makes such gaps impossible).
- [ ] **Step 9: Host test.** Create `tests/agent.landing.test.tsx` (mirror `tests/home.host.test.tsx`'s render pattern):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { AgentLandingView } from '@/components/kinnso/pages/AgentLandingView'

vi.mock('@/lib/agent/waitlist-actions', () => ({ joinAgentWaitlistAction: vi.fn() }))

describe('AgentLandingView', () => {
  it('renders honest waitlist framing: capture form, no live-agent claims, escape hatches', () => {
    render(<AgentLandingView locale="en" t={en.agent} />)
    expect(screen.getByRole('heading', { level: 1, name: en.agent.title })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.agent.submitCta })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.agent.exploreCta })).toBeTruthy()
    expect(document.querySelector('input[type="email"]')).toBeTruthy()
  })
})
```
- [ ] **Step 10:** Run: `cd apps/web && npx vitest run tests/agent.waitlist-actions.test.ts tests/agent.landing.test.tsx tests/agent.host.test.tsx tests/i18n.locale-parity.test.ts tests/kinnso.route-parity.test.tsx` — Expected: PASS. Then `pnpm --filter web typecheck` — PASS (proves no stale `agent.*` key consumers survive).
- [ ] **Step 11: Commit:** `git add -A apps/web && git commit -m "feat(web): honest traveller-agent waitlist page with real email capture (i18n ×7)"`

---

### Task 7: `/for-creators` landing

**Files:**
- Create: `apps/web/app/[locale]/for-creators/page.tsx` · `apps/web/components/kinnso/pages/ForCreatorsView.tsx` · `apps/web/tests/for-creators.host.test.tsx`
- Modify: `apps/web/lib/seo/routes.ts:8-10` (MARKETING_PATHS) · `lib/i18n/messages/*.ts` ×7 (new `forCreators` group + `seo.forCreators`) · `tests/i18n.locale-parity.test.ts` (GROUPS + `'forCreators'`)

- [ ] **Step 1: `ForCreatorsView.tsx`:**

```tsx
import Link from 'next/link'
import { BadgeDollarSign, Compass, PenLine } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Testimonial } from '@/lib/home/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** R1C creator-acquisition landing (master spec §6 R1). Testimonials are
 *  role-filtered to creators and data-gated (spec §5 row: surfaced on homepage
 *  AND both landing pages — carry-forward #18). */
export function ForCreatorsView({ locale, t, testimonials }: {
  locale: Locale; t: Messages['forCreators']; testimonials: Testimonial[]
}) {
  const p = (path: string) => `/${locale}${path}`
  const steps = [
    { title: t.step1Title, body: t.step1Body, icon: <PenLine aria-hidden="true" className="h-5 w-5" /> },
    { title: t.step2Title, body: t.step2Body, icon: <Compass aria-hidden="true" className="h-5 w-5" /> },
    { title: t.step3Title, body: t.step3Body, icon: <BadgeDollarSign aria-hidden="true" className="h-5 w-5" /> },
  ]
  const bullets = [t.why1, t.why2, t.why3]
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.heroEyebrow}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.heroTitle}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.heroSub}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href={p('/sign-up')} className="k2-btn-primary">{t.heroCtaPrimary}</Link>
          <Link href={p('/explore')} className="k2-btn-ghost">{t.heroCtaSecondary}</Link>
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <Eyebrow>{t.howEyebrow}</Eyebrow>
        <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.howHeading}</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <EditorialCard title={s.title} kicker={`0${i + 1}`}>
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{s.icon}</span>
                {s.body}
              </EditorialCard>
            </li>
          ))}
        </ol>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <div className="grid gap-10 lg:grid-cols-2">
          <h2 className="k2-display max-w-md text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.whyHeading}</h2>
          <ul className="space-y-4">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3 leading-relaxed text-kinnso-ink/80">
                <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-kinnso-orange" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </SectionShell>

      {testimonials.length > 0 ? (
        <SectionShell className="k2-hairline" aria-labelledby="for-creators-testimonials">
          <h2 id="for-creators-testimonials" className="sr-only">{t.testimonialsHeading}</h2>
          <ul className="grid gap-10 md:grid-cols-3">
            {testimonials.map((q) => (
              <li key={q.id}>
                <figure>
                  <blockquote className="k2-display text-xl leading-snug text-kinnso-ink">&ldquo;{q.quote}&rdquo;</blockquote>
                  <figcaption className="mt-3 text-sm text-kinnso-ink/70">— {q.authorName}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </SectionShell>
      ) : null}

      <section className="bg-kinnso-orange py-16 md:py-24">
        <div className="k2-container">
          <h2 className="k2-display max-w-2xl text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.ctaTitle}</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/85">{t.ctaBody}</p>
          <Link href={p('/sign-up')} className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-ink px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{t.ctaButton}</Link>
        </div>
      </section>
    </main>
  )
}

export default ForCreatorsView
```

- [ ] **Step 2: `app/[locale]/for-creators/page.tsx`** (exact R1A/R1B page pattern):

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ForCreatorsView } from '@/components/kinnso/pages/ForCreatorsView'
import { getPublishedTestimonials } from '@/lib/home/queries'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const revalidate = 300

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/for-creators', locale: locale as Locale, title: dict.seo.forCreators.title, description: dict.seo.forCreators.description })
}

export default async function ForCreatorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const [messages, testimonials] = await Promise.all([
    getDictionary(locale as Locale),
    getPublishedTestimonials(locale as Locale, 'creator'),
  ])
  return <ForCreatorsView locale={locale as Locale} t={messages.forCreators} testimonials={testimonials} />
}
```

- [ ] **Step 3: i18n `forCreators` group** — interface (en.ts) + values ×7. Interface:

```ts
forCreators: {
  heroEyebrow: string; heroTitle: string; heroSub: string
  heroCtaPrimary: string; heroCtaSecondary: string
  howEyebrow: string; howHeading: string
  step1Title: string; step1Body: string
  step2Title: string; step2Body: string
  step3Title: string; step3Body: string
  whyHeading: string; why1: string; why2: string; why3: string
  testimonialsHeading: string
  ctaTitle: string; ctaBody: string; ctaButton: string
}
```

**en:** `heroEyebrow: 'For Creators'` · `heroTitle: 'Turn your travel taste into income'` · `heroSub: 'Publish the guides you already give friends, run real brand missions, and earn from the places you genuinely recommend.'` · `heroCtaPrimary: 'Apply as a creator'` · `heroCtaSecondary: 'See creator guides'` · `howEyebrow: 'How it works'` · `howHeading: 'Three steps to your first payout'` · `step1Title: 'Publish guides'` / `step1Body: 'Turn your favourite city into a guide travellers actually use — your voice, your picks.'` · `step2Title: 'Run missions'` / `step2Body: 'Take on briefs from vetted brands that fit your niche. No spray-and-pray sponsorships.'` · `step3Title: 'Earn and grow'` / `step3Body: 'Get paid per mission, earn affiliate commissions, and level up to unlock better offers.'` · `whyHeading: 'Why creators choose KINNSO'` · `why1: 'You keep your voice — merchants brief you, they don’t script you.'` · `why2: 'Transparent payouts with a real ledger, not a black box.'` · `why3: 'Your guides keep earning after the trip ends — bookings are coming, and your recommendations power them.'` · `testimonialsHeading: 'Creators on KINNSO'` · `ctaTitle: 'Your next trip could pay for itself'` · `ctaBody: 'Apply in minutes. Publish your first guide this week.'` · `ctaButton: 'Apply as a creator'`

**zh-hk:** `heroEyebrow: '創作者專區'` · `heroTitle: '將你嘅旅行品味變成收入'` · `heroSub: '將你本身會推介畀朋友嘅路線出成攻略，接真實品牌任務，靠你真心推薦嘅地方賺錢。'` · `heroCtaPrimary: '申請成為創作者'` · `heroCtaSecondary: '睇創作者攻略'` · `howEyebrow: '點運作'` · `howHeading: '三步拎到第一筆收入'` · `step1Title: '發佈攻略'` / `step1Body: '將你最熟嘅城市寫成旅人真係用得着嘅攻略——你嘅風格，你嘅私藏。'` · `step2Title: '接任務'` / `step2Body: '接啱你定位、經審核品牌嘅brief，唔使亂接廣告。'` · `step3Title: '賺錢升級'` / `step3Body: '每個任務有酬勞，仲有聯盟佣金；等級越高，offer越好。'` · `whyHeading: '點解創作者揀KINNSO'` · `why1: '你保留自己把聲——商戶只會畀brief，唔會寫稿畀你讀。'` · `why2: '透明數簿，每筆收入有紀錄，唔係黑盒。'` · `why3: '旅程完咗，攻略照賺——預訂功能即將推出，你嘅推薦就係入口。'` · `testimonialsHeading: '創作者心聲'` · `ctaTitle: '下一次旅行，可以自己賺返嚟'` · `ctaBody: '幾分鐘完成申請，今個禮拜出第一份攻略。'` · `ctaButton: '申請成為創作者'`

**zh-tw / zh-cn / ja / ko / th:** author ALL five remaining locale blocks IN THIS TASK, before this task's commit (not deferred to any later task) — same registers as Task 6's locale blocks (zh-tw formal-friendly 繁體, zh-cn simplified, ja です/ます, ko -합니다/-하세요 formal, th polite), matching the tone of the zh-hk example above. The parity test gates key completeness; translation quality is on you — NO English placeholder values in non-en files, ever.

Also add `seo.forCreators: { title, description }` to the `seo` group interface + all 7 values — en: `title: 'Become a KINNSO travel creator'`, `description: 'Publish travel guides, run vetted brand missions, and earn from the places you genuinely recommend.'`

- [ ] **Step 4:** `lib/seo/routes.ts` — add `'/for-creators'` to `MARKETING_PATHS` (this task) — sitemap picks it up automatically. Register `'forCreators'` in parity GROUPS. **JSON-LD/robots decision (spec §7):** like every marketing route, the page inherits the layout-level Organization/WebSite JSON-LD (no per-page structured data — same as /about and /contact); `ROBOTS_DISALLOW` needs no change (public route).
- [ ] **Step 5: Host test** `tests/for-creators.host.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ForCreatorsView } from '@/components/kinnso/pages/ForCreatorsView'

describe('ForCreatorsView', () => {
  it('renders hero, steps, and CTA → /sign-up; hides empty testimonials strip', () => {
    render(<ForCreatorsView locale="en" t={en.forCreators} testimonials={[]} />)
    expect(screen.getByRole('heading', { level: 1, name: en.forCreators.heroTitle })).toBeTruthy()
    const applyLinks = screen.getAllByRole('link', { name: en.forCreators.heroCtaPrimary })
    expect(applyLinks[0].getAttribute('href')).toBe('/en/sign-up')
    expect(document.getElementById('for-creators-testimonials')).toBeNull()
  })

  it('shows the testimonials strip when quotes exist', () => {
    render(<ForCreatorsView locale="en" t={en.forCreators} testimonials={[{ id: '1', quote: 'Great', authorName: 'A', authorRole: 'creator' }]} />)
    expect(document.getElementById('for-creators-testimonials')).toBeTruthy()
  })
})
```
- [ ] **Step 6:** Run: `cd apps/web && npx vitest run tests/for-creators.host.test.tsx tests/i18n.locale-parity.test.ts tests/kinnso.route-parity.test.tsx` — Expected: PASS.
- [ ] **Step 7: Commit:** `git add -A apps/web && git commit -m "feat(web): /for-creators acquisition landing (i18n ×7, sitemap, role-filtered testimonials)"`

---

### Task 8: `/for-merchants` landing + `/merchants` de-mock

**Files:**
- Create: `apps/web/app/[locale]/for-merchants/page.tsx` · `apps/web/components/kinnso/pages/ForMerchantsView.tsx` · `apps/web/tests/for-merchants.host.test.tsx`
- Modify: `components/kinnso/pages/MerchantsLandingView.tsx` (de-mock + de-ticket) · `lib/seo/routes.ts` (`'/for-merchants'`) · `lib/i18n/messages/*.ts` ×7 (`forMerchants` group, `seo.forMerchants`, DELETE `merchantsLanding.samplesHeading/samplesSub`) · parity GROUPS + `'forMerchants'`

- [ ] **Step 1: `ForMerchantsView.tsx`** — created by copying a file that exists in the working tree at this point: `cp apps/web/components/kinnso/pages/ForCreatorsView.tsx apps/web/components/kinnso/pages/ForMerchantsView.tsx`, then apply exactly these deltas (Task 7 must be complete first — it is, per task order):
  1. Rename component/export `ForCreatorsView` → `ForMerchantsView`; prop type `Messages['forCreators']` → `Messages['forMerchants']`; doc comment audience → merchants.
  2. Icons import: `{ BadgeDollarSign, Compass, PenLine }` → `{ FileText, Send, Users }`; steps array icons in order: `FileText`, `Users`, `Send`.
  3. Hero primary CTA href `p('/sign-up')` → `p('/merchants/post')`; secondary `p('/explore')` → `p('/contact')`.
  4. Final CTA band button href `p('/sign-up')` → `p('/merchants/post')`.
  5. Testimonials strip: both `id` and `aria-labelledby` `for-creators-testimonials` → `for-merchants-testimonials`.
  Nothing else changes — the `t.` key names are identical because the `forMerchants` interface mirrors `forCreators`.
- [ ] **Step 2: `app/[locale]/for-merchants/page.tsx`** — identical to Task 7 Step 2 with `/for-merchants`, `seo.forMerchants`, `messages.forMerchants`, `getPublishedTestimonials(locale, 'merchant')`, `ForMerchantsView`.
- [ ] **Step 3: i18n `forMerchants` group** — same key shape as `forCreators` (interface identical, rename group). **en:** `heroEyebrow: 'For Merchants'` · `heroTitle: 'Reach travellers through creators they trust'` · `heroSub: 'Brief vetted travel creators, pay on published results, and turn their genuine recommendations into your next customers.'` · `heroCtaPrimary: 'Post a mission'` · `heroCtaSecondary: 'Talk to us'` · `howEyebrow: 'How it works'` · `howHeading: 'Launch a campaign in three steps'` · `step1Title: 'Post a brief'` / `step1Body: 'Describe the mission, target cities and payout — it takes minutes.'` · `step2Title: 'Creators apply'` / `step2Body: 'Vetted creators who fit your brand pick up the brief and produce real content.'` · `step3Title: 'Pay on results'` / `step3Body: 'Approve published work and pay for outcomes — with attribution you can verify.'` · `whyHeading: 'Why merchants choose KINNSO'` · `why1: 'Creators are vetted with real audience data, not follower counts.'` · `why2: 'You approve work before you pay — no surprises.'` · `why3: 'Direct booking is coming: creator recommendations will link straight to your bookable inventory.'` · `testimonialsHeading: 'Merchants on KINNSO'` · `ctaTitle: 'Your next campaign starts with a brief'` · `ctaBody: 'Post your first mission today — our team reviews every brief within 48 hours.'` · `ctaButton: 'Post a mission'` — author ALL six remaining locale blocks IN THIS TASK before the commit (registers per Task 6's blocks; no English placeholders), and `seo.forMerchants` ×7 (en `title: 'Work with vetted travel creators — KINNSO for merchants'`, `description: 'Brief vetted travel creators, pay on published results, and reach travellers who trust them.'`). **JSON-LD/robots decision (spec §7):** layout-level Organization/WebSite JSON-LD covers this route (matches all marketing pages); `ROBOTS_DISALLOW` unchanged.
- [ ] **Step 4: Rewrite `/merchants` as a merchant HUB** (de-mock per master spec §4.1 + de-duplicate: with `/for-merchants` as the canonical acquisition landing, keeping a second acquisition pitch at `/merchants` would be near-duplicate indexable content — instead it becomes the signed-in merchant's front door, with an acquisition pointer for newcomers; R2 replaces it with the public directory — D-R1C-5). Replace `MerchantsLandingView.tsx` with:

```tsx
import Link from 'next/link'
import { ArrowRight, FileText, LineChart, Users } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** R1C: /merchants is the merchant HUB (mock sample-missions grid removed —
 *  master spec §4.1; acquisition copy lives at /for-merchants to avoid
 *  duplicate content). R2 turns this route into the public merchant directory. */
export function MerchantsLandingView({ locale, t }: { locale: Locale; t: Messages['merchantsLanding'] }) {
  const p = (path: string) => `/${locale}${path}`
  const cards = [
    { title: t.cardPostTitle, body: t.cardPostBody, href: p('/merchants/post'), icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardCreatorsTitle, body: t.cardCreatorsBody, href: p('/merchants/creators'), icon: <Users aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardMissionsTitle, body: t.cardMissionsBody, href: p('/merchants/missions'), icon: <LineChart aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.heroPill}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-5xl">{t.hubTitle}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.hubSub}</p>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <div className="grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group">
              <EditorialCard title={c.title} footer={<span className="inline-flex items-center gap-1 text-sm font-semibold text-kinnso-orangeDark">{t.cardOpen} <ArrowRight aria-hidden="true" className="h-4 w-4" /></span>}>
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{c.icon}</span>
                {c.body}
              </EditorialCard>
            </Link>
          ))}
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <p className="max-w-2xl leading-relaxed text-kinnso-ink/70">{t.newHereNote}</p>
        <Link href={p('/for-merchants')} className="k2-btn-ghost mt-6">{t.newHereCta}</Link>
      </SectionShell>
    </main>
  )
}

export default MerchantsLandingView
```
**i18n `merchantsLanding` group rewrite** (interface + ALL 7 locales; delete old keys `heroTitle, heroSubtitle, postCta, browseCta, howHeading, howSub, step1Title…step3Desc, samplesHeading, samplesSub, ctaTitle, ctaDesc, ctaButton`; keep `heroPill`): new keys — `hubTitle, hubSub, cardPostTitle, cardPostBody, cardCreatorsTitle, cardCreatorsBody, cardMissionsTitle, cardMissionsBody, cardOpen, newHereNote, newHereCta`. **en:** `hubTitle: 'Your missions, creators and results — one place'` · `hubSub: 'Everything you run on KINNSO starts here.'` · `cardPostTitle: 'Post a mission'` / `cardPostBody: 'Write a brief and put it in front of vetted creators.'` · `cardCreatorsTitle: 'Find creators'` / `cardCreatorsBody: 'Search vetted creators by niche, audience and platform.'` · `cardMissionsTitle: 'Track missions'` / `cardMissionsBody: 'Review applications, approve work and follow results.'` · `cardOpen: 'Open'` · `newHereNote: 'New to KINNSO? See how missions work and what creators can do for your brand.'` · `newHereCta: 'Why KINNSO for merchants'` — author the 6 remaining locale blocks IN THIS TASK (registers per Task 6). Note: deleting `merchantsLanding.heroTitle` also removes an American-spelling instance Task 15 would otherwise fix.
Then check `MissionCard` remaining consumers: `grep -rn "MissionCard" apps/web --include='*.tsx' | grep -v tests/` — if this view was the last production consumer, delete `components/kinnso/MissionCard.tsx` (its data type lives on for studio missions).
- [ ] **Step 5: Tests.** (a) Create `tests/for-merchants.host.test.tsx` — mirror Task 7 Step 5's code with `forMerchants` keys and href assertions on `/en/merchants/post` and `/en/contact`. (b) **Rewrite `tests/kinnso.MerchantsLandingView.test.tsx`** — it currently imports `missions` from creator-mock and asserts `missions[0].title` renders (the exact grid this step deletes): drop the creator-mock import, assert the hub instead — h1 = `en.merchantsLanding.hubTitle`, links to `/en/merchants/post|creators|missions`, link to `/en/for-merchants`, and `expect(screen.queryByText(/Sample|mission grid/i)).toBeNull()` is unnecessary once the import is gone.
- [ ] **Step 6:** Run: `cd apps/web && npx vitest run tests/for-merchants.host.test.tsx tests/kinnso.MerchantsLandingView.test.tsx tests/i18n.locale-parity.test.ts tests/kinnso.route-parity.test.tsx tests/home.host.test.tsx` — Expected: PASS. Note: `/merchants` links to `/for-merchants` from this task on, and `/for-merchants` exists (this task) — route-parity green.
- [ ] **Step 7: Commit:** `git add -A apps/web && git commit -m "feat(web): /for-merchants landing; de-mock and de-ticket /merchants (sample missions removed)"`

---

### Task 9: Acquisition-link retargets + merchant sub-row label (carry-forwards #4 #20)

**Files:**
- Modify: `components/kinnso/Navbar.tsx` · `components/kinnso/Footer.tsx` · `components/kinnso/home/{MerchantValue,CreatorCta}.tsx` · `lib/i18n/messages/*.ts` ×7 (`nav.merchantMenuLabel`, `footer.lForCreators`)
- Test: `tests/kinnso.Navbar.test.tsx` · `tests/kinnso.route-parity.test.tsx` (existing — reruns)

- [ ] **Step 1: Update ALL affected tests FIRST** (three files assert the old hrefs):
  1. `tests/kinnso.Navbar.test.tsx` line ~38's test `'shows a For Merchants link → /en/merchants (href swaps to /for-merchants in R1C)'`: rename to `'shows a For Merchants link → /en/for-merchants'` and assert `href === '/en/for-merchants'`. Add:

```ts
it('labels the merchant sub-row landmark with the dedicated menu label', () => {
  render(<Navbar locale="en" role="merchant" t={en.nav} />)
  expect(screen.getByRole('navigation', { name: en.nav.merchantMenuLabel })).toBeTruthy()
})
```
  2. `tests/kinnso.home-bands.test.tsx`: line ~30 asserts the MerchantValue CTA href `'/en/merchants'` → `'/en/for-merchants'`; line ~40 asserts the CreatorCta href `'/en/sign-up'` → `'/en/for-creators'` (rename both test descriptions to match).
  3. `tests/kinnso.Footer.test.tsx`: line ~31 asserts `lPricing` href `'/en/merchants'` → `'/en/for-merchants'`; add an assertion that `en.footer.lForCreators` links to `'/en/for-creators'`.
Run: `cd apps/web && npx vitest run tests/kinnso.Navbar.test.tsx tests/kinnso.home-bands.test.tsx tests/kinnso.Footer.test.tsx` — Expected: FAIL (retargets not applied yet).
- [ ] **Step 2: Retargets.**
  1. `Navbar.tsx:59` — `const forMerchantsHref = p("/for-merchants");` and update the file-header comment (line ~15-16) to say the link now points at the landing.
  2. `Navbar.tsx:114` — `aria-label={t.linkMissions}` → `aria-label={t.merchantMenuLabel}`.
  3. `Footer.tsx:11` — `[t.lPricing, "/merchants"]` → `[t.lPricing, "/for-merchants"]`.
  4. `Footer.tsx:10` — colCreators gains the landing as the first link: `links: [[t.lForCreators, "/for-creators"], [t.lApply, "/sign-up"], [t.lStudio, "/studio"], [t.lMissions, "/studio/missions"], [t.lEarnings, "/studio/earnings"]]`.
  5. `MerchantValue.tsx:28-29` — delete the retarget comment; `href={`/${locale}/for-merchants`}`.
  6. `CreatorCta.tsx` — `href={`/${locale}/sign-up`}` (Task 3 interim) → `href={`/${locale}/for-creators`}` (master spec §4.1 section 9).
- [ ] **Step 3: i18n:** add `merchantMenuLabel` to `nav` and `lForCreators` to `footer` (interface + 7 locales): en `'Merchant menu'` / `'For Creators'` · zh-hk `'商戶選單'` / `'創作者專區'` · zh-tw `'商戶選單'` / `'創作者專區'` · zh-cn `'商户菜单'` / `'创作者专区'` · ja `'マーチャントメニュー'` / `'クリエイター向け'` · ko `'머천트 메뉴'` / `'크리에이터 안내'` · th `'เมนูร้านค้า'` / `'สำหรับครีเอเตอร์'`.
- [ ] **Step 4:** Run: `cd apps/web && npx vitest run tests/kinnso.Navbar.test.tsx tests/kinnso.Footer.test.tsx tests/kinnso.route-parity.test.tsx tests/kinnso.home-bands.test.tsx tests/i18n.locale-parity.test.ts` — Expected: PASS (route-parity now proves `/for-creators` + `/for-merchants` are linked AND routed).
- [ ] **Step 5: Commit:** `git add -A apps/web && git commit -m "feat(web): retarget acquisition links to /for-creators + /for-merchants; dedicated merchant-menu label"`

---

### Task 10: Article→guide cross-link module (master spec §5 "Cross-links R1")

**Files:**
- Create: `apps/web/components/kinnso/articles/ArticleGuideLinks.tsx` · `apps/web/tests/articles.guide-links.test.ts`
- Modify: `lib/guides/queries.ts` (new query) · `app/[locale]/articles/[category]/[url]/page.tsx` (~line 94, after `<ArticleBlockRenderer>`) · `lib/i18n/messages/*.ts` ×7 (`article.guidesNearbyEyebrow/guidesNearbyHeading`)

- [ ] **Step 1: Failing query test** — create `tests/articles.guide-links.test.ts` with self-contained chain-mock plumbing:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const orSpy = vi.fn()
const limitSpy = vi.fn().mockResolvedValue({ data: [] })
const chain: Record<string, unknown> = {}
Object.assign(chain, {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  or: orSpy.mockImplementation(() => chain),
  order: vi.fn(() => chain), limit: limitSpy,
})
const fromMock = vi.fn(() => chain)
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: () => ({ from: fromMock }) }))

import { getGuidesForRegions } from '@/lib/guides/queries'

beforeEach(() => { fromMock.mockClear(); orSpy.mockClear(); limitSpy.mockClear().mockResolvedValue({ data: [] }) })

describe('getGuidesForRegions', () => {
  it('returns [] without querying when no usable region strings', async () => {
    expect(await getGuidesForRegions([])).toEqual([])
    expect(await getGuidesForRegions(['', ' ', 'x'])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
  it('builds a sanitized ilike-or filter over guide cities', async () => {
    await getGuidesForRegions(['Tokyo', 'Hong Kong, (HK)'])
    expect(orSpy).toHaveBeenCalledWith('city.ilike.%Tokyo%,city.ilike.%Hong Kong HK%')
  })
  it('never throws — returns [] on query failure', async () => {
    limitSpy.mockRejectedValueOnce(new Error('boom'))
    expect(await getGuidesForRegions(['Tokyo'])).toEqual([])
  })
})
```
Run — Expected: FAIL (function missing).
- [ ] **Step 2: Query** — append to `lib/guides/queries.ts`:

```ts
/**
 * R1C heuristic cross-link (master spec §5): guides whose city matches any of
 * an article's region strings. PostgREST .or() treats commas/parens as syntax,
 * so region strings are sanitized to [letters/numbers/spaces/hyphens] before
 * interpolation; sub-2-char fragments are dropped as noise. Reads never crash
 * the article page — failures degrade to [] (same stance as getPublishedGuides).
 */
export async function getGuidesForRegions(regions: string[], limit = 3): Promise<Guide[]> {
  const clean = [...new Set(regions
    .map((r) => r.normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim())
    .filter((r) => r.length >= 2))]
  if (clean.length === 0) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('guides')
      .select('slug, title, cover_url, city, saves_count, creator_handle')
      .eq('status', 'published')
      .or(clean.map((r) => `city.ilike.%${r}%`).join(','))
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(mapRowToGuide)
  } catch {
    return []
  }
}
```
Run — Expected: PASS.
- [ ] **Step 3: Component** `components/kinnso/articles/ArticleGuideLinks.tsx` (async server component, data-gated):

```tsx
import Link from 'next/link'
import GuideCard from '@/components/kinnso/GuideCard'
import { getGuidesForRegions } from '@/lib/guides/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Planning a trip here?" — embeds up to 3 matching guide cards in an article
 *  (master spec §5 cross-links, R1 heuristic tier). Renders nothing without a match. */
export async function ArticleGuideLinks({ locale, regions, t }: {
  locale: Locale; regions: string[]; t: Messages['article']
}) {
  const guides = await getGuidesForRegions(regions)
  if (guides.length === 0) return null
  return (
    <aside aria-labelledby="article-guide-links" className="k2-hairline mt-10 pt-8">
      <p className="k2-eyebrow">{t.guidesNearbyEyebrow}</p>
      <h2 id="article-guide-links" className="k2-display mt-3 text-2xl font-semibold text-kinnso-ink">{t.guidesNearbyHeading}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((g) => <GuideCard key={g.slug} g={g} locale={locale} />)}
      </div>
    </aside>
  )
}
```
- [ ] **Step 4: Wire it** — in `app/[locale]/articles/[category]/[url]/page.tsx`, directly after the `<ArticleBlockRenderer blocks={a.translation.content} />` line (~94), inside the `<article>`:

```tsx
<ArticleGuideLinks locale={locale as Locale} regions={[...(a.regions ?? []), ...(a.tag_slugs ?? [])]} t={dict.article} />
```
(Import it; spec §5 says "city/TAG matching", so tag slugs join the candidate list — the sanitizer strips slug hyphens' neighbours safely since hyphens are kept. Confirm the detail object exposes `regions` and `tag_slugs` — `ArticleDetail` has both; if the page destructures a narrower shape, add them to the select/mapping. Confirm the dictionary variable name in that page — it may be `dict` or `messages`.)
- [ ] **Step 5: i18n** — extend `article` group (interface + 7): `guidesNearbyEyebrow` / `guidesNearbyHeading` — en `'Planning a trip here?'` / `'Creator guides for this destination'` · zh-hk `'諗緊去呢度玩？'` / `'呢個目的地嘅創作者攻略'` · zh-tw `'正計劃去這裡？'` / `'這個目的地的創作者攻略'` · zh-cn `'正计划去这里？'` / `'这个目的地的创作者攻略'` · ja `'ここへ旅行を計画中？'` / `'この目的地のクリエイターガイド'` · ko `'이곳 여행을 계획 중이신가요?'` / `'이 여행지의 크리에이터 가이드'` · th `'กำลังวางแผนไปที่นี่?'` / `'ไกด์จากครีเอเตอร์สำหรับจุดหมายนี้'`.
- [ ] **Step 6:** Run: `cd apps/web && npx vitest run tests/articles.guide-links.test.ts tests/i18n.locale-parity.test.ts` — Expected: PASS. Commit: `git commit -am "feat(web): article→guide heuristic cross-links (Planning a trip here?)"`

---

### Task 11: Public de-ticketing I — GuideCard (editorial) + ExploreView

**Files:**
- Modify: `components/kinnso/GuideCard.tsx` (rebuild; same props — consumers untouched) · `components/kinnso/pages/ExploreView.tsx`
- Test: existing explore/home suites

- [ ] **Step 1: Rebuild `GuideCard.tsx`** (drops TicketCard/TicketDivider/ReceiptRow):

```tsx
import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import { EditorialCard } from "@/components/kinnso/editorial/EditorialCard";
import type { Guide } from "@/lib/creator-mock";
import type { Locale } from "@/lib/i18n/config";

const GuideCard = ({ g, locale }: { g: Guide; locale: Locale }) => (
  <Link href={`/${locale}/g/${g.slug}`} className="group block">
    <EditorialCard
      media={
        <img src={g.cover} alt={g.title} width={640} height={480} loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
      }
      kicker={<span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="h-3 w-3" /> {g.city}</span>}
      title={g.title}
      footer={
        <div className="flex items-center justify-between border-t border-kinnso-edge pt-3 text-xs text-kinnso-muted">
          <span>@{g.creatorHandle}</span>
          <span className="inline-flex items-center gap-1"><Bookmark aria-hidden="true" className="h-3 w-3" /> {g.saves.toLocaleString()}</span>
        </div>
      }
    />
  </Link>
);

export default GuideCard;
```
(The `Guide` import flips to `@/lib/guides/types` in Task 14.)
- [ ] **Step 2: Rebuild `ExploreView.tsx`:**

```tsx
import GuideCard from '@/components/kinnso/GuideCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Guide } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExploreView({ locale, t, guides }: { locale: Locale; t: Messages['explore']; guides: Guide[] }) {
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell>
        <Eyebrow>{t.pill}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.heading}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
        <h2 className="sr-only">{t.gridHeading}</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g) => <GuideCard key={g.slug} g={g} locale={locale} />)}
        </div>
        <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>
      </SectionShell>
    </main>
  )
}

export default ExploreView
```
**Heading-hierarchy fix (same class of defect already fixed in Tasks 6 and 8 — pre-empted here):** `GuideCard` renders each guide title via `EditorialCard`, which defaults to `h3` — without an `h2` between the page's `h1` and those `h3`s, the hierarchy skips a level. Add a new `gridHeading` key to the `explore` i18n group (interface + all 7 locales) with natural copy like `'All guides'` (translate per-locale, matching each file's existing `explore` group register) — the `<h2 className="sr-only">` above renders it.
- [ ] **Step 3:** Run the suites that render these: `cd apps/web && npx vitest run tests/kinnso.route-parity.test.tsx tests/home.host.test.tsx` plus any explore view test (`ls tests | grep -i explore`) — Expected: PASS (fix any assertion pinned to ticket-motif DOM). Add an assertion to the explore view's own test confirming `screen.getByRole('heading', { level: 2, name: en.explore.gridHeading })` exists.
- [ ] **Step 4: Commit:** `git commit -am "refactor(web): GuideCard + ExploreView on editorial primitives (ticket motif off public surfaces)"`

---

### Task 12: Public de-ticketing II — `/g/[slug]` + articles headers

**Files:** Modify: `app/[locale]/g/[slug]/page.tsx` · `app/[locale]/articles/page.tsx:37-38` · `app/[locale]/articles/[category]/page.tsx:51-53` · `app/[locale]/articles/[category]/[url]/page.tsx:69,82-84`

- [ ] **Step 1: `/g/[slug]` edits** (line refs pre-edit):
  - L8: `import { RouteStamp, TicketCard } from '@/components/kinnso/MarketPassport'` → `import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'`
  - L67: `k-container py-8 md:py-12` → `k2-container py-8 md:py-12`
  - L83: `<RouteStamp>{guide.city}</RouteStamp>` → `<Eyebrow className="rounded-[3px] bg-white/90 px-3 py-1">{guide.city}</Eyebrow>`
  - L87: `<TicketCard className="absolute …">` → `<div className="k2-card absolute inset-x-4 bottom-4 p-5 sm:inset-x-6 sm:bottom-6 sm:p-7 md:inset-x-8 md:bottom-8">` (close tag L103 → `</div>`)
  - L88: `text-2xl font-black … text-kinnso-ink md:text-4xl` → `k2-display text-2xl font-semibold leading-tight text-kinnso-ink md:text-4xl`
  - L101: drop `k-mono` (keep the rest)
  - L111: `k-btn-ghost` → `k2-btn-ghost` (keep `mt-5 inline-flex text-sm`)
  - L116: `rounded-lg bg-kinnso-cream2` → `k2-card bg-kinnso-cream2` (aside)
  - L122: drop `k-mono`; `text-kinnso-orange hover:text-kinnso-orangeDark` → `text-kinnso-orangeDark hover:text-kinnso-ink` (accent-text rule: hover darkens, never to orange)
- [ ] **Step 2: Articles headers** — in all three files: `k-container` → `k2-container`; `k-display text-3xl font-black` → `k2-display text-3xl font-semibold` (`[url]/page.tsx` L82 also `md:text-4xl` keeps); `text-kinnso-muted` lines stay (canonical). L84 fallback notice: `rounded-lg bg-kinnso-cream2` → `rounded-[4px] border border-kinnso-edge bg-kinnso-cream2`.
- [ ] **Step 3:** Run: `cd apps/web && npx vitest run tests/kinnso.route-parity.test.tsx` + any guide/article page tests (`ls tests | grep -iE 'guide|article'`) — Expected: PASS. `pnpm --filter web typecheck` — PASS.
- [ ] **Step 4: Commit:** `git commit -am "refactor(web): guide detail + article pages on editorial chrome"`

---

### Task 13: Public de-ticketing III — creators surfaces, auth pages, ComingSoonPage, stray ink/*

**Files:** Modify: `components/kinnso/pages/CreatorsLandingView.tsx` · `components/kinnso/pages/CreatorProfileView.tsx` · `app/[locale]/_components/ComingSoonPage.tsx` · `app/[locale]/sign-in/page.tsx` · `app/[locale]/sign-up/page.tsx` · `components/onboarding/LiveProgress.tsx` + `components/onboarding/HandlesStep.tsx`

- [ ] **Step 1: `CreatorsLandingView.tsx`** (line refs pre-edit): L3 import → `{ EditorialCard }` from editorial + `{ Eyebrow }`, `{ SectionShell }`; L22 `k-page-band py-12 md:py-16` → `SectionShell as="header"` wrapper (keep the flex layout inside); L25 `RouteStamp` → `Eyebrow`; L26 `k-display mt-3 max-w-2xl` → `k2-display mt-3 max-w-2xl text-4xl font-semibold leading-[1.08] md:text-5xl text-kinnso-ink`; L29+L80 `k-btn-primary` → `k2-btn-primary`; L41-66 creator card: `TicketCard className="flex h-full flex-col p-5"` → `div className="k2-card flex h-full flex-col p-5"`; L48 drop `k-mono`; L55 chips `rounded-md bg-kinnso-cream2` stays; L62 `k-btn-ghost` → `k2-btn-ghost`; L71 empty state `rounded-lg` → `rounded-[4px] border border-kinnso-edge`; L76-83 final CTA `TicketCard p-8 text-center` → `div className="k2-card p-8 text-center"`; L36+L76 `k-container` → `k2-container`; heading weights `font-black` → `font-semibold` + `k2-display` where display-scale. Wrap page root in `bg-kinnso-cream font-sans` if not inherited.
- [ ] **Step 2: `CreatorProfileView.tsx`:** L2 drop MarketPassport import; L32 `k-container` → `k2-container`; L44 `TicketCard className="rounded-t-none p-6 sm:p-8"` → `div className="k2-card rounded-t-none p-6 sm:p-8"`; L45 `ring-kinnso-cream` stays; L48 `font-black` → `k2-display font-semibold`; L49+L77 drop `k-mono`; L79 (verified ✓ mark): change ONLY the ✓ glyph to `text-kinnso-green` inside an `aria-hidden` span — decorative; the adjacent verified LABEL becomes `text-kinnso-ink`, which carries the AA obligation. All other `kinnso-*` classes are canonical — leave.
- [ ] **Step 3: `ComingSoonPage.tsx`** — align with the destinations/sessions placeholders:

```tsx
import Link from 'next/link'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ComingSoonPage({ locale, title, t }: { locale: Locale; title: string; t: Messages['comingSoon'] }) {
  return (
    <main className="flex min-h-[70vh] items-center bg-kinnso-cream font-sans">
      <SectionShell as="div" className="w-full">
        <div className="max-w-2xl">
          <Eyebrow>{t.heading}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
          <Link href={`/${locale}`} className="k2-btn-primary mt-8">{t.back}</Link>
        </div>
      </SectionShell>
    </main>
  )
}
```
- [ ] **Step 4: Auth pages** — `sign-in/page.tsx` L38-40: keep `k-page-band` wrapper → replace with `bg-kinnso-cream font-sans`; `k-auth-card k-ticket … p-8` → `k-auth-card k2-card p-8`; `k-display text-2xl font-bold` → `k2-display text-2xl font-semibold`. Same treatment in `sign-up/page.tsx` (find the equivalent wrapper/card/heading lines). Stray unnamespaced ink classes (carry-forward #10): `sign-up/page.tsx` L77-86 `text-ink/70|text-ink/60|text-ink` → `text-kinnso-ink/70|text-kinnso-ink/60|text-kinnso-ink`; `LiveProgress.tsx` L67,79,267,274,287,291 and `HandlesStep.tsx` L135,173: every `ink/NN` / `border-ink` / `bg-ink` → the `kinnso-ink` equivalent (pure rename, keep opacities; L287's `text-ink/60 : text-ink/45` → `text-kinnso-ink/60 : text-kinnso-ink/45`).
- [ ] **Step 5:** Grep gate for this task (scope to source dirs — never the repo root, `.next/` has stale matches): `grep -rnE "(^|[^-])\b(text|bg|border)-ink\b|ink/[0-9]" apps/web/app apps/web/components --include='*.tsx' | grep -v kinnso-ink` → zero. Run: `cd apps/web && npx vitest run tests/kinnso.route-parity.test.tsx` + any creators/onboarding suites (`ls tests | grep -iE 'creator|onboard|sign'`) — Expected: PASS. `pnpm --filter web typecheck && pnpm --filter web lint` — PASS.
- [ ] **Step 6: Commit:** `git commit -am "refactor(web): creators/auth/coming-soon surfaces on editorial chrome; namespace stray ink/* classes"`

---

### Task 14: creator-mock slim-down + `Guide` type relocation (carry-forward #7)

**Files:** Modify: `lib/guides/types.ts` · `lib/creator-mock/types.ts` · `lib/creator-mock/data.ts` · `lib/creator-mock/helpers.ts` · `lib/creator-mock/index.ts` · importers: `lib/guides/queries.ts:2`, `components/kinnso/GuideCard.tsx`, `components/kinnso/pages/{HomeView,ExploreView}.tsx`, `components/kinnso/home/Hero.tsx:5`, `components/kinnso/pages/FeedView.tsx` (if alive)

- [ ] **Step 1: Relocate the type.** In `lib/guides/types.ts`: remove `import type { Guide } from '@/lib/creator-mock'` and define at the top:

```ts
/** Public guide-card shape (R1C: relocated from creator-mock — it was never mock data). */
export interface Guide {
  slug: string
  title: string
  cover: string
  city: string
  saves: number
  creatorHandle: string
}
```
Sweep importers with a QUOTE-AGNOSTIC pattern — `GuideCard.tsx` uses double quotes while the rest use single:

```bash
grep -rlE "import type \{ Guide \} from ['\"]@/lib/creator-mock['\"]" apps/web \
  | xargs sed -i '' -E "s|import type \{ Guide \} from ['\"]@/lib/creator-mock['\"]|import type { Guide } from '@/lib/guides/types'|"
grep -rn "Guide } from" apps/web --include='*.ts*' | grep creator-mock   # → zero
```
Then remove the now-stale "Guide TYPE stays in creator-mock" comments in `HomeView.tsx:12` and `Hero.tsx:4`. In `lib/creator-mock/types.ts` delete the `Guide` interface; in creator-mock, re-import it from `@/lib/guides/types` wherever the mock `guides` array needs the type.
- [ ] **Step 2: Delete zero-consumer exports** — confirmed orphans: `tickerSeed` + `TickerItem`, `merchantWorkingWith`, `merchantProfile`, `extendedCreators`, `computeMatch` (+ its helper types). For each: `grep -rn "<name>" apps/web apps/scan packages | grep -v creator-mock` → if only test hits, delete the export AND slim those tests; if zero hits, just delete. KEEP `tierMeta`, `sampleDna`, `engagementHistory` (studio-scan surface) and any array a surviving test imports as fixture (`guides`, `feedItems`, `merchantLogos`, `creators`). **DELETE `missions`** — its last production consumer went in Task 8's hub rewrite and its last test consumer went with the `kinnso.MerchantsLandingView.test.tsx` rewrite (verify: `grep -rn "\bmissions\b" apps/web --include='*.ts*' | grep creator-mock` → zero before deleting).
- [ ] **Step 3: FeedView liveness check** — `/feed` redirects to `/explore`; `grep -rn "FeedView" apps/web --include='*.tsx' --include='*.ts'` → if nothing routes to it, delete `components/kinnso/pages/FeedView.tsx` + its tests.
- [ ] **Step 4:** Run: `pnpm --filter web typecheck` then the full scoped suite touched by mocks: `cd apps/web && npx vitest run tests/` scoped to failures if any — Expected: green after fixture slimming.
- [ ] **Step 5: Commit:** `git commit -am "refactor(web): relocate Guide type to lib/guides; prune orphaned creator-mock exports"`

---

### Task 15: i18n cleanup — orphan keys, traveller spelling, register polish, parity hardening (carry-forwards #3 #5 #6 #15)

**Files:** Modify: `lib/i18n/messages/*.ts` ×7 · `tests/i18n.locale-parity.test.ts`

- [ ] **Step 1: Harden the parity test FIRST** (this is the guard that makes the deletions safe). In `tests/i18n.locale-parity.test.ts`, two fixes:
  1. Derive coverage from the dictionary instead of the hand-maintained list — a hand list can never catch UNREGISTERED groups (today `agent` was missing, and `breadcrumb`/`categories` are live on the article page yet unchecked). Replace the `GROUPS` constant with:

```ts
// Every top-level group in the en dictionary is parity-checked — nothing can be
// forgotten (R1C carry-forward #6: 'agent', 'breadcrumb', 'categories' were live
// but unregistered under the old hand list).
const GROUPS = Object.keys(en).sort() as (keyof typeof en)[]
```
  2. Inside the per-group loop, before comparing key paths, add the missing-group guard (`keyPaths(undefined)` returns `['']`, so an absent group passed silently — confirmed 4×):

```ts
expect(dict[g], `${locale} is missing group "${g}"`).toBeDefined()
```
Run the test — it may now FAIL by exposing REAL parity gaps in previously-unchecked groups (breadcrumb/categories/auth/…): fix each surfaced gap in the offending locale file — these are genuine bugs the old list hid, not test regressions.
- [ ] **Step 2: Delete orphan keys** from interface + ALL 7 locales: `nav.linkMerchants`, `nav.linkGuides`, `nav.linkTravelers`, `footer.lCaseStudies`, `footer.lPress`. Consumers first: `grep -rn "linkMerchants\|linkGuides\|linkTravelers\|lCaseStudies\|lPress" apps/web --include='*.tsx' --include='*.ts' | grep -v messages/` — zero COMPONENT consumers (confirmed at planning), but `tests/kinnso.Footer.test.tsx` references `en.footer.lCaseStudies`/`lPress` (~L38-39, honesty assertions on dead links): rewrite those two assertions to use the literal strings or delete them — otherwise typecheck breaks.
- [ ] **Step 3: British-spelling harmonization (en.ts only — carry-forward #5;** the DB CHECK bakes `'traveller'`): `explore.subtitle` → `'Discover hand-picked spots, saved by travellers like you.'` · `explore.heading` → `'What travellers are saving now'` · (`merchantsLanding.heroTitle` no longer exists — deleted in Task 8's hub rewrite) · check `home.roleTraveller` value, then `grep -n "ravelers" apps/web/lib/i18n/messages/en.ts` → zero after edits.
- [ ] **Step 4: Register polish:** zh-hk/zh-tw: `sed -i '' 's/社會認證/社會證明/g' lib/i18n/messages/zh-hk.ts lib/i18n/messages/zh-tw.ts`; zh-cn: `sed -i '' 's/社会认证/社会证明/g' lib/i18n/messages/zh-cn.ts`. ko `testimonialsAdmin` block: print it (`awk '/^  testimonialsAdmin: \{/,/^  \},$/' lib/i18n/messages/ko.ts`) and rewrite casual 해요체 endings to the formal register used elsewhere in the file — e.g. `'…추가해요'` → `'…추가하세요'`, `'…없어요'` → `'…없습니다'`; every value ends -합니다/-하세요/-십시오 or is a noun phrase.
- [ ] **Step 5:** Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts tests/kinnso.route-parity.test.tsx` — Expected: PASS. Commit: `git commit -am "i18n(web): drop orphan nav/footer keys, harmonize traveller spelling, polish ko/zh registers, harden parity test"`

---

### Task 16: Admin robustness batch (carry-forwards #12 #13 #14)

**Files:** Modify: `lib/admin/testimonials-actions.ts` · `lib/admin/testimonials-validation.ts` · `components/kinnso/admin/AdminTestimonialsView.tsx` · every `lib/admin/*-actions.ts` with the swallow pattern (perks, creators, merchants, team, users) · AdminPerksView (same busy pattern)
**Test:** `tests/admin.testimonials-actions.test.ts` (extend existing), `tests/admin.testimonials-view.test.tsx` (extend existing component coverage)

- [ ] **Step 1: #13 DB-error logging, tree-wide.** Pattern — in `testimonials-actions.ts` all four actions, change:

```ts
if (error || !data) return formError('Testimonial could not be created')
```
to:
```ts
if (error || !data) {
  if (error) console.error('[admin:testimonials] create failed', error)
  return formError('Testimonial could not be created')
}
```
(action name varies per site). Then sweep the rest: `grep -rn "formError(" apps/web/lib/admin/*-actions.ts` — at every site where a Supabase `error` object is in scope and unlogged, add the same tagged `console.error('[admin:<domain>] <action> failed', error)` line. Do NOT change return values or messages.
- [ ] **Step 2: #12 sort_order bounds as field errors.** `testimonials-validation.ts` — after the `Number.isInteger` check:

```ts
else if (input.sortOrder < -2147483648 || input.sortOrder > 2147483647) {
  errors.sortOrder = ['Sort order is out of range']
}
```
And in `AdminTestimonialsView.tsx`'s `TestimonialForm`, make the empty field fail validation instead of silently coercing to 0. The form currently keeps sortOrder as NUMBER state (L141: `useState<number>(testimonial?.sort_order ?? 0)`) with coercion in the input's onChange — refactor: change the state to `useState<string>(String(testimonial?.sort_order ?? 0))`, bind the input `value`/`onChange` to the raw string, and convert only at submit: `sortOrder: sortOrderValue.trim() === '' ? Number.NaN : Number(sortOrderValue)` — the validation's `Number.isInteger` check then rejects the NaN with the existing field error.
- [ ] **Step 3: #14 try/finally.** `AdminTestimonialsView.tsx` `mutate()` (L39-48):

```ts
async function mutate(id: string, run: () => Promise<MutateResult>, fallback: string) {
  setBusyId(id)
  setRowErrors((e) => ({ ...e, [id]: '' }))
  try {
    const res = await run()
    if (res.ok) router.refresh()
    else setRowErrors((e) => ({ ...e, [id]: res.errors.form?.[0] ?? fallback }))
  } catch {
    setRowErrors((e) => ({ ...e, [id]: fallback }))
  } finally {
    setBusyId(null)
  }
}
```
Same shape for `TestimonialForm`'s `setSaving` (L143-155) and the matching `busy`/`saving` handlers in `AdminPerksView` (locate: `grep -n "setBusy\|setSaving" apps/web/components/kinnso/admin/AdminPerksView.tsx`).
- [ ] **Step 4: Tests.** Extend the existing testimonials suites: (a) action test asserting `console.error` called on DB error (spy on console.error); (b) view test: `onSave` rejects → busy state clears and row error shows; (c) validation test: `sortOrder: 2 ** 31` → field error; `Number.NaN` → field error.
- [ ] **Step 5:** Run: `cd apps/web && npx vitest run tests/admin.testimonials-actions.test.ts tests/admin.testimonials-view.test.tsx` (adjust to actual test filenames: `ls tests | grep -i testimonial`) — Expected: PASS. Commit: `git commit -am "fix(web): admin actions log DB errors, sort_order bounds as field errors, busy-state try/finally"`

---

### Task 17: Phase verification, docs reconciliation & controller handoff

**Files:** Modify: `docs/superpowers/notes/2026-07-02-r1-carryforwards.md` (status sweep) · this plan (checkboxes)

- [ ] **Step 1: Full gates from repo root:**

```bash
pnpm --filter web typecheck   # PASS, zero errors
pnpm --filter web lint        # PASS
```
- [ ] **Step 2: Scoped test sweep** (memory gotcha: run vitest from apps/web, NOT via pnpm filter args):

```bash
cd apps/web && npx vitest run \
  tests/design.k2-tokens.test.ts tests/i18n.locale-parity.test.ts tests/kinnso.route-parity.test.tsx \
  tests/kinnso.Navbar.test.tsx tests/kinnso.home-bands.test.tsx tests/kinnso.home-hero-stats.test.tsx \
  tests/home.host.test.tsx tests/home.queries.test.ts tests/guides.queries.test.ts \
  tests/agent.waitlist-actions.test.ts tests/agent.landing.test.tsx \
  tests/for-creators.host.test.tsx tests/for-merchants.host.test.tsx tests/articles.guide-links.test.ts
```
Expected: ALL PASS. (route-parity is on the list per carry-forward #22.) Then the full web unit suite: `npx vitest run` — expected green except the documented real-Supabase timeouts on dummy creds.
- [ ] **Step 3: Grep gates:**

```bash
# Scope every gate to source dirs (.next/ build artifacts contain stale matches)
grep -rn "kinnso2-\|font-k2-" apps/web/app apps/web/components apps/web/lib apps/web/tests | grep -v tests/design.k2-tokens.test.ts  # → zero (that test keeps the literals in negative assertions)
grep -rn "Bricolage\|DM_Sans\|dmSans\|bricolage" apps/web/app apps/web/components apps/web/tests --include='*.ts*'  # → zero, comments included (Task 2 purged them)
# EXCEPTION (found during Task 2 execution): apps/web/lib/seo/og/{fonts.ts,card.tsx} bundle actual
# Bricolage-{Bold,Regular}.ttf binaries for next/og ImageResponse social-card generation — a
# SEPARATE system from next/font/google that Task 2 never touches. Renaming the label without
# matching Fraunces/Inter .ttf assets would silently regress OG-card typography, and this sandbox
# has no outbound network to source those binaries (same constraint as the R1B production-build
# note). Scoped exception: lib/seo/og/ keeps Bricolage. CARRY-FORWARD to a future task: source real
# Fraunces/Inter static .ttf files and migrate lib/seo/og/fonts.ts + card.tsx to match the canonical
# typography.
grep -rn "MarketPassport" apps/web/app apps/web/components/kinnso/pages apps/web/components/kinnso/home apps/web/components/kinnso/articles apps/web/components/kinnso/editorial  # → zero PUBLIC consumers (studio/admin/missions files are allowed)
grep -rn "from '@/lib/creator-mock'" apps/web/app apps/web/components apps/web/lib --include='*.tsx' --include='*.ts' | grep -vE "studio|Studio|Tier|Dna|admin"  # → zero
grep -rn "ravelers" apps/web/lib/i18n/messages/en.ts             # → zero
grep -rnE '["'"'"']/merchants["'"'"']' apps/web/components/kinnso/Navbar.tsx apps/web/components/kinnso/Footer.tsx apps/web/components/kinnso/home  # → zero acquisition links left (quote-agnostic; '/merchants/post' etc. don't match the closing-quote anchor)
```
- [ ] **Step 4: Visual smoke** — `pnpm --filter web dev` and eyeball `/en`, `/en/for-creators`, `/en/for-merchants`, `/en/agent`, `/en/explore`, one `/en/g/…`, one article (with a region match → cross-link block), `/en/creators`, `/en/merchants` (hub), `/en/sign-in`: original cream/orange palette everywhere, Fraunces headings, no terracotta/ochre/sage remnants, no ticket stubs on public pages. Repeat `/zh-hk/for-creators` + `/ja/agent` to sanity-check CJK copy renders (register + line-breaking). (Production build needs Vercel — Google Fonts is blocked in the sandbox, known from R1B.)
- [ ] **Step 5: Reconcile docs.** Update `docs/superpowers/notes/2026-07-02-r1-carryforwards.md`: mark items 2–22 done/dissolved with one-line notes (#1 dissolved by palette revert; #8 partially — Bricolage/DM Sans removed, JetBrains Mono deliberately KEPT for studio `k-mono`, retired with the studio re-skin; #9 ja/ko `:lang()` still optional-open). Record as NEW carry-forwards: the THREE accepted AA brand deviations from D-R1C-2 (future brand-a11y pass), per-IP rate limiting for `agent_waitlist` (R4 agent hardening), and the marketing-pages-JSON-LD decision (layout-level Organization/WebSite only). R3 notes: REPLACE the moss/sun contrast-floor line with the D-R1C-2 floors. Keep this plan's checkboxes in lockstep with shipped code.
- [ ] **Step 6: Commit + push:**

```bash
git add -A && git commit -m "docs(web): R1C verification sweep — carry-forwards reconciled"
git push -u origin feat/redesign-r1c
```
- [ ] **Step 7: CONTROLLER HANDOFF (at PR time, not from the sandbox):**
  1. Apply the migration via Supabase MCP `apply_migration`, name `r1c_agent_waitlist_and_testimonials_updated_at`, project `scryfkefedzuetfdtrvl`.
  2. `pnpm --filter @kinnso/db gen` and reconcile vs the hand-written `packages/db/types.ts` (expect key-order noise only).
  3. **Publish the 3 seeded testimonials** (currently `draft`) via `/admin/testimonials` so the homepage + landing strips render.
  4. Open PR: `Phase R1C — original palette revert, landings & honest agent waitlist` → `main`; verify Vercel preview (fonts, palette, both landings, waitlist form insert against live `agent_waitlist`).
- [ ] Phase complete. R1 exit criteria check: all 10 homepage sections live (R1B) ✓ zero mock data on public pages (R1B homepage + R1C `/merchants` samples) ✓.

---

## Self-review notes (kept for the executor)

- **Ordering:** Tasks 2→3 must land back-to-back (Task 2 deletes tokens the classes still reference until Task 3 renames them). Task 9's retargets require Task 7+8's routes (route-parity enforces). CreatorCta points at `/sign-up` from Task 3 until Task 9 retargets — every commit stays green. Task 8's ForMerchantsView is copied from Task 7's ForCreatorsView in the working tree.
- **Test files updated task-locally, never deferred:** every task that changes a href/key/component updates its asserting tests IN THAT TASK (Navbar+Footer+home-bands in Task 9; agent host tests in Task 6; MerchantsLandingView test in Task 8; layout.fonts in Task 2) — the Task 17 sweep verifies, it does not repair.
- **`kinnso-orangeDark` naming:** it is camelCase in the token (`--color-kinnso-orangeDark`) — Tailwind class is `text-kinnso-orangeDark`. The sed patterns rely on this exact casing; verify one usage renders before committing Task 3.
- **Locale copy:** all 7 locale blocks for every new/rewritten group are authored inside the task that introduces the group, before its commit — the parity test gates key completeness; translation quality is the executor's responsibility; NO English placeholders in non-en files.
- **Accepted AA brand deviations (3):** ① white-on-orange button labels (3.06:1 at text-sm/bold — below the large-text threshold, so a true AA fail), ② orangeDark-on-cream small text (4.26:1, fails by 0.24), ③ orange focus rings on cream (2.73:1 vs the 3:1 non-text floor — the original global rule the user asked back). All three documented in D-R1C-2, the globals.css comments, and recorded in the carry-forwards note for a future brand-a11y pass.
