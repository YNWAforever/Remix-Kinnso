# Front-of-House Slice 3e — Real Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `/feed` from real published guides (via the existing `getPublishedGuides()`) in the current stream layout, replacing the `feedItems` mock.

**Architecture:** Web-only. `/feed` becomes an ISR server page mirroring `/explore`: it awaits `getPublishedGuides()` and passes the guides to a refactored presentational `FeedView` that renders each guide as a stream card linking to `/g/[slug]`. No new query, schema, or migration.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript, Tailwind v4, Vitest 4 + jsdom + @testing-library/react.

---

## Conventions for this plan

- **Repo:** code lives in `kinnso-v3/` (default branch `main`). This plan doc lives in the same repo. Paths below are relative to `kinnso-v3/`. Commit from inside `kinnso-v3` (`git rev-parse --show-toplevel` ends in `/kinnso-v3`).
- **Branch:** already created — `feat/front-of-house-slice3e-real-feed` off `origin/main`. Do not create/switch branches.
- **Commands:** single test → `pnpm --filter web exec vitest run <path-rel-to-apps/web>`; `pnpm --filter web typecheck`; `pnpm --filter web lint`; `pnpm --filter web build`.
- **Tests** live under `apps/web/tests/`; jsdom files start with `// @vitest-environment jsdom`.
- **TDD:** failing test → red → implement → green → commit. End every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Do NOT delete the `feedItems` mock** from `lib/creator-mock/data.ts` — it has a dedicated test (`creator-mock.feed.test.ts`). Only stop importing it in `FeedView`.
- **No migration.** `/feed` relies on the 300s ISR backstop for freshness; do not add `/feed` to the guide-publish `revalidatePath` (avoids coupling to `lib/guides/actions.ts`).

## File Structure

| File | New/Mod | Responsibility |
|---|---|---|
| `apps/web/lib/i18n/messages/en.ts` | Mod | `feed.empty` interface key + en value |
| `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Mod | `feed.empty` translated (parity) |
| `apps/web/components/kinnso/pages/FeedView.tsx` | Mod | Take `items: Guide[]`; stream cards → `/g/[slug]`; empty state; drop `feedItems` import |
| `apps/web/tests/kinnso.FeedView.test.tsx` | Mod | Render real items + links + empty state |
| `apps/web/app/[locale]/feed/page.tsx` | Mod | ISR (`revalidate = 300`) + `getPublishedGuides()` → `FeedView` |
| `apps/web/tests/feed.host.test.tsx` | New | Host maps real guides → cards |

**Dependency order:** Task 1 (i18n) → Task 2 (FeedView + test) → Task 3 (host + test) → Task 4 (gate).

---

### Task 1: i18n — `feed.empty` (7 locales)

**Files:** Modify `apps/web/lib/i18n/messages/en.ts` + `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`

The `feed` group already exists (`pill`, `heading`, `subtitle`, `savesLabel`) and is already in the `i18n.locale-parity` `GROUPS` list, so adding a key is automatically parity-guarded.

- [ ] **Step 1: Add `empty` to the `Messages` interface (`en.ts`)**

In `apps/web/lib/i18n/messages/en.ts`, in the `Messages` interface `feed: { … }` group, add `empty: string` (after `savesLabel: string`):

```ts
  feed: { pill: string; heading: string; subtitle: string; savesLabel: string; empty: string }
```

(Match the existing formatting of that interface line/block; only add the `empty: string` member.)

- [ ] **Step 2: Add the en value (`en.ts`)**

In the exported `en` object's `feed` group, add after `savesLabel`:

```ts
    empty: 'No guides yet. Check back soon for new travel guides.',
```

- [ ] **Step 3: Add `empty` to each non-en locale**

Add an `empty` key to the `feed` group in each file, with the same key, translated:
- `zh-hk.ts`: `empty: '暫時未有指南，請稍後再來查看新的旅遊指南。',`
- `zh-tw.ts`: `empty: '暫時沒有指南，請稍後再來查看新的旅遊指南。',`
- `zh-cn.ts`: `empty: '暂时没有指南，请稍后再来查看新的旅游指南。',`
- `ja.ts`: `empty: 'まだガイドがありません。新しい旅行ガイドをお待ちください。',`
- `ko.ts`: `empty: '아직 가이드가 없습니다. 새로운 여행 가이드를 기다려 주세요.',`
- `th.ts`: `empty: 'ยังไม่มีไกด์ กลับมาดูไกด์ท่องเที่ยวใหม่ ๆ เร็ว ๆ นี้',`

- [ ] **Step 4: Verify parity + typecheck**

Run: `pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts && pnpm --filter web typecheck`
Expected: PASS (every locale's `feed` group has identical keys; interface satisfied).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "feat(web): add feed.empty i18n key (Slice 3e)"
```

---

### Task 2: `FeedView` — real guide items + empty state

**Files:** Modify `apps/web/components/kinnso/pages/FeedView.tsx`; Modify `apps/web/tests/kinnso.FeedView.test.tsx`

- [ ] **Step 1: Rewrite the test (red)**

Replace the entire contents of `apps/web/tests/kinnso.FeedView.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FeedView } from '@/components/kinnso/pages/FeedView'
import type { Guide } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const guide = (over: Partial<Guide> = {}): Guide => ({
  slug: 'tokyo-eats',
  title: 'Tokyo Eats',
  cover: 'https://img.example/cover.jpg',
  city: 'Tokyo',
  saves: 1234,
  creatorHandle: 'mei',
  ...over,
})

describe('FeedView', () => {
  it('renders real guides as feed cards linking to the guide detail', () => {
    render(<FeedView locale="en" t={en.feed} items={[guide()]} />)
    expect(screen.getByText('Tokyo Eats')).toBeTruthy()
    expect(screen.getByText('@mei')).toBeTruthy()
    expect(screen.getByText(/1,234 saves/)).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/en/g/tokyo-eats')
  })

  it('shows the empty state when there are no items', () => {
    render(<FeedView locale="en" t={en.feed} items={[]} />)
    expect(screen.getByText(en.feed.empty)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/kinnso.FeedView.test.tsx`
Expected: FAIL — current `FeedView` takes no `items` prop and renders the `feedItems` mock (no `@mei`, no `/en/g/...` link).

- [ ] **Step 3: Rewrite `FeedView.tsx`**

Replace the entire contents of `apps/web/components/kinnso/pages/FeedView.tsx` with:

```tsx
import Link from 'next/link'
import { Bookmark, MapPin } from 'lucide-react'
import type { Guide } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

function avatarInitial(handle: string) {
  return handle.replace(/^@/, '').charAt(0).toUpperCase() || '?'
}

export function FeedView({ locale, t, items }: { locale: Locale; t: Messages['feed']; items: Guide[] }) {
  return (
    <main>
      <section className="k-container py-12">
        <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.pill}</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.heading}</h1>
        <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.subtitle}</p>
        {items.length === 0 ? (
          <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
        ) : (
          <div className="mx-auto mt-10 grid max-w-2xl gap-6">
            {items.map((g) => (
              <Link key={g.slug} href={`/${locale}/g/${g.slug}`} className="group block">
                <article className="k-card overflow-hidden">
                  <div className="aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url('${g.cover}')` }} />
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-kinnso-cream2 text-sm font-bold text-kinnso-ink">
                        {avatarInitial(g.creatorHandle)}
                      </span>
                      <p className="text-sm font-bold text-kinnso-ink">@{g.creatorHandle}</p>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-kinnso-ink">{g.title}</p>
                    <div className="mt-2 flex items-center gap-4 text-sm text-kinnso-muted">
                      {g.city && (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{g.city}</span>
                      )}
                      <span className="inline-flex items-center gap-1"><Bookmark className="h-4 w-4" />{g.saves.toLocaleString()} {t.savesLabel}</span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default FeedView
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/kinnso.FeedView.test.tsx`
Expected: PASS (2 tests). Then `pnpm --filter web typecheck` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/FeedView.tsx apps/web/tests/kinnso.FeedView.test.tsx
git commit -m "feat(web): FeedView renders real published guides (Slice 3e)"
```

---

### Task 3: `/feed` host — ISR + real guides

**Files:** Modify `apps/web/app/[locale]/feed/page.tsx`; Create `apps/web/tests/feed.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

Create `apps/web/tests/feed.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(cleanup)

const { getPublishedGuidesMock } = vi.hoisted(() => ({ getPublishedGuidesMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: getPublishedGuidesMock }))

import FeedPage from '@/app/[locale]/feed/page'

beforeEach(() => {
  getPublishedGuidesMock.mockReset()
  getPublishedGuidesMock.mockResolvedValue([
    { slug: 'kyoto-temples', title: 'Kyoto Temples', cover: 'https://img.example/k.jpg', city: 'Kyoto', saves: 88, creatorHandle: 'rin' },
  ])
})

describe('/[locale]/feed host', () => {
  it('renders real published guides as feed cards', async () => {
    const ui = await FeedPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Kyoto Temples')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/en/g/kyoto-temples')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/feed.host.test.tsx`
Expected: FAIL — the current host renders `FeedView` without `items` (mock-backed), so no `Kyoto Temples`/`/en/g/...` link, and the `getPublishedGuides` mock is never called.

- [ ] **Step 3: Update the host**

Replace the entire contents of `apps/web/app/[locale]/feed/page.tsx` with (mirrors `/explore`):

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { FeedView } from '@/components/kinnso/pages/FeedView'
import { getPublishedGuides } from '@/lib/guides/queries'

export const revalidate = 300

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function FeedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const guides = await getPublishedGuides()
  return <FeedView locale={locale as Locale} t={messages.feed} items={guides} />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/feed.host.test.tsx`
Expected: PASS (1 test). Then `pnpm --filter web typecheck` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/[locale]/feed/page.tsx" apps/web/tests/feed.host.test.tsx
git commit -m "feat(web): /feed shows real published guides (ISR) (Slice 3e)"
```

---

### Task 4: Full-suite gate + verification

**Files:** none (verification only — fix forward if red)

- [ ] **Step 1: Typecheck** — `pnpm --filter web typecheck` → 0 errors.
- [ ] **Step 2: Lint** — `pnpm --filter web lint` → 0 errors and no new warnings attributable to Slice 3e (`FeedView` already used `<img>`-free background-image covers; no new `no-img-element` warnings).
- [ ] **Step 3: Full test suite** — `pnpm --filter web exec vitest run --no-file-parallelism` → all green (incl. updated `kinnso.FeedView`, new `feed.host`, parity; the pre-existing `creator-mock.feed.test.ts` still passes since `feedItems` is untouched).
- [ ] **Step 4: Build** — `pnpm --filter web build` → succeeds; confirm `/[locale]/feed` is now **ƒ/ISR (`revalidate`)** rather than fully static `○`, and `/explore` + `/g/[slug]` are unaffected.
- [ ] **Step 5: Commit (only if fix-forward changes were made)**

```bash
git add -A
git commit -m "chore(web): Slice 3e full-gate verification"
```

---

## Self-Review

**1. Spec coverage:**
- `/feed` → real guides via `getPublishedGuides`, ISR → Task 3. ✓
- `FeedView` takes `items`, stream cards → `/g/[slug]`, initials avatar, `@handle`, title, city+saves, empty state → Task 2. ✓
- Drop `feedItems` import (keep the mock + its test) → Task 2 (rewrite removes the import). ✓
- `feed.empty` × 7 + parity → Task 1. ✓
- Tests (FeedView, host, parity) + gate confirming ISR → Tasks 2, 3, 4. ✓
- No migration; no `revalidatePath('/feed')` coupling → intentional per Conventions. ✓ (documented deviation from the spec's optional revalidate mention — ISR backstop suffices.)

**2. Placeholder scan:** No "TBD"/"similar to". The only non-verbatim content is the 6 non-en `empty` translations (Task 1 Step 3), provided as concrete strings; the parity test guards the key.

**3. Type consistency:** `Guide` (from `@/lib/creator-mock`) is the item type in `FeedView` (Task 2), the host's `getPublishedGuides()` return (Task 3), and both tests' fixtures. `Messages['feed']` gains `empty` in Task 1 and is consumed by `FeedView` in Task 2. The host passes `items={guides}` matching `FeedView`'s `items: Guide[]`.

---

## Execution Handoff

Small, sequential, web-only slice (no gated step). Recommended: execute inline (it's ~3 trivial TDD tasks), or subagent-driven if preferred. Finish with push + PR.
