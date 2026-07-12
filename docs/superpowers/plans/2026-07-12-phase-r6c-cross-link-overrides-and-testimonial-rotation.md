# Phase R6C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let ops force-pin a guide/experience to a specific article (editorial override,
merged ahead of heuristic matches), stop wasting ILIKE cross-link matches on article tag
slugs, and rotate the homepage's testimonials randomly per request instead of showing the
same three forever.

**Architecture:** Two new ops-curated, public-read-only override tables
(`article_guide_overrides`, `article_experience_overrides`), each queried by a new
function living alongside the domain's existing query functions (`guides/queries.ts`,
`experiences/public-queries.ts`). `ArticleGuideLinks`/`ArticleExperienceLinks` fetch both
the override list and the heuristic list in parallel and merge (pinned first, heuristic
fills remaining slots, de-duplicated). `getPublishedTestimonials` drops its deterministic
`ORDER BY ... LIMIT 3` for a fetch-all-then-shuffle-then-slice approach.

**Tech Stack:** Next.js 16 App Router (Server Components), Supabase Postgres + RLS,
Vitest 4.

**Design spec:**
`docs/superpowers/specs/2026-07-12-phase-r6c-cross-link-overrides-and-testimonial-rotation-design.md`

---

## Task 1: `article_guide_overrides` + `article_experience_overrides` migration

**Files:**
- Create: `supabase/migrations/20260712100000_r6c_article_cross_link_overrides.sql`
- Test: `apps/web/tests/db.r6c-article-cross-link-overrides.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/db.r6c-article-cross-link-overrides.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260712100000_r6c_article_cross_link_overrides.sql'),
  'utf8',
)

describe('R6C article cross-link overrides migration', () => {
  it('creates article_guide_overrides with the locked column set and uniqueness constraint', () => {
    expect(sql).toContain('create table public.article_guide_overrides')
    expect(sql).toContain('article_id uuid not null references public.articles(id) on delete cascade')
    expect(sql).toContain('guide_id uuid not null references public.guides(id) on delete cascade')
    expect(sql).toContain('unique(article_id, guide_id)')
  })

  it('creates article_experience_overrides with the locked column set and uniqueness constraint', () => {
    expect(sql).toContain('create table public.article_experience_overrides')
    expect(sql).toContain('article_id uuid not null references public.articles(id) on delete cascade')
    expect(sql).toContain('experience_id uuid not null references public.experiences(id) on delete cascade')
    expect(sql).toContain('unique(article_id, experience_id)')
  })

  it('both tables: public read, zero write grant to anon/authenticated (ops writes via table editor only)', () => {
    expect(sql).toContain('alter table public.article_guide_overrides enable row level security')
    expect(sql).toContain('create policy article_guide_overrides_public_read on public.article_guide_overrides')
    expect(sql).toContain('alter table public.article_experience_overrides enable row level security')
    expect(sql).toContain('create policy article_experience_overrides_public_read on public.article_experience_overrides')
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.article_guide_overrides/)
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.article_experience_overrides/)
    expect(sql).toContain('grant select on public.article_guide_overrides to anon, authenticated')
    expect(sql).toContain('grant select on public.article_experience_overrides to anon, authenticated')
  })

  it('indexes both tables by article_id for the per-article override lookup', () => {
    expect(sql).toContain('create index article_guide_overrides_article_idx on public.article_guide_overrides (article_id, sort_order)')
    expect(sql).toContain('create index article_experience_overrides_article_idx on public.article_experience_overrides (article_id, sort_order)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run db.r6c-article-cross-link-overrides -v`
Expected: FAIL — `ENOENT` (migration file doesn't exist yet)

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260712100000_r6c_article_cross_link_overrides.sql
-- Phase R6C — editorial override tables for article cross-links (D-R6C-2). Force-add
-- only (D-R6C-1): a row here always shows a specific guide/experience on a specific
-- article, ahead of and merged with the heuristic city-ILIKE matches. No admin UI this
-- phase (D-R6C-3) — ops writes directly via the Supabase table editor / service_role
-- only, same zero-write-grant shape as destinations (20260709090000_r6b_destinations.sql).

create table public.article_guide_overrides (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  guide_id uuid not null references public.guides(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(article_id, guide_id)
);

create index article_guide_overrides_article_idx on public.article_guide_overrides (article_id, sort_order);

alter table public.article_guide_overrides enable row level security;
revoke all on public.article_guide_overrides from anon, authenticated;

create policy article_guide_overrides_public_read on public.article_guide_overrides
  for select to anon, authenticated using (true);

-- No insert/update/delete policy for any role — ops writes directly via the
-- Supabase table editor / service_role only (D-R6C-3; no admin UI this phase).
grant select on public.article_guide_overrides to anon, authenticated;

create table public.article_experience_overrides (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(article_id, experience_id)
);

create index article_experience_overrides_article_idx on public.article_experience_overrides (article_id, sort_order);

alter table public.article_experience_overrides enable row level security;
revoke all on public.article_experience_overrides from anon, authenticated;

create policy article_experience_overrides_public_read on public.article_experience_overrides
  for select to anon, authenticated using (true);

grant select on public.article_experience_overrides to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run db.r6c-article-cross-link-overrides -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Apply the migration live**

Confirm with the user before running (per this program's live-migration-apply discipline
— every apply needs its own fresh confirmation):

```bash
supabase db query --linked -f supabase/migrations/20260712100000_r6c_article_cross_link_overrides.sql
supabase migration repair --status applied --linked 20260712100000
```

Confirm the repair step separately from the apply step.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260712100000_r6c_article_cross_link_overrides.sql apps/web/tests/db.r6c-article-cross-link-overrides.test.ts
git commit -m "feat(db): article_guide_overrides + article_experience_overrides tables"
```

---

## Task 2: `getGuideOverridesForArticle` query

**Files:**
- Modify: `apps/web/lib/guides/queries.ts`
- Modify: `apps/web/tests/articles.guide-links.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/articles.guide-links.test.ts` (this file already tests
`getGuidesForRegions` from the same source file with the manual-chain mocking style shown
below — reuse its existing `fromMock`/`chain` object if the file already defines one; the
snippet below is self-contained in case it needs its own mock setup):

```ts
describe('getGuideOverridesForArticle', () => {
  it('returns [] without querying guides when no overrides exist', async () => {
    const overridesLimit = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const order = vi.fn(() => overridesLimit())
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const fromMock = vi.fn(() => ({ select }))
    vi.mocked(await import('@/lib/supabase/public')).createSupabasePublicClient.mockReturnValue({ from: fromMock } as any)

    const { getGuideOverridesForArticle } = await import('@/lib/guides/queries')
    expect(await getGuideOverridesForArticle('article-1')).toEqual([])
    expect(fromMock).toHaveBeenCalledWith('article_guide_overrides')
    expect(fromMock).not.toHaveBeenCalledWith('guides')
  })

  it('preserves override sort_order and drops any pinned guide no longer published', async () => {
    const overridesResult = { data: [{ guide_id: 'g2' }, { guide_id: 'g1' }], error: null }
    const guidesResult = {
      data: [
        { id: 'g1', slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover_url: 'https://x/kyoto.jpg', city: 'Kyoto', saves_count: 3, creator_handle: 'teafan' },
      ],
      error: null,
    }
    const order = vi.fn(() => Promise.resolve(overridesResult))
    const eqOverrides = vi.fn(() => ({ order }))
    const selectOverrides = vi.fn(() => ({ eq: eqOverrides }))
    const eqGuides = vi.fn(() => Promise.resolve(guidesResult))
    const inGuides = vi.fn(() => ({ eq: eqGuides }))
    const selectGuides = vi.fn(() => ({ in: inGuides }))
    const fromMock = vi.fn((table: string) => (table === 'article_guide_overrides' ? { select: selectOverrides } : { select: selectGuides }))
    vi.mocked(await import('@/lib/supabase/public')).createSupabasePublicClient.mockReturnValue({ from: fromMock } as any)

    const { getGuideOverridesForArticle } = await import('@/lib/guides/queries')
    const result = await getGuideOverridesForArticle('article-1')
    // g2 was pinned first but isn't published/found -> dropped; g1 (pinned second) survives
    expect(result).toEqual([{ slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Kyoto', saves: 3, creatorHandle: 'teafan' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run articles.guide-links -v`
Expected: FAIL — `getGuideOverridesForArticle` is not exported

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/guides/queries.ts` (after `getGuidesForRegions`, reusing the
file's existing `mapRowToGuide`):

```ts
/**
 * Editorial override (D-R6C-1, force-add only): guides ops has explicitly pinned to this
 * article, shown ahead of and merged with the heuristic getGuidesForRegions matches. A
 * pinned guide that's no longer published (or was deleted) is silently dropped rather
 * than shown broken — same reads-never-crash stance as getGuidesForRegions.
 */
export async function getGuideOverridesForArticle(articleId: string): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  const { data: overrides } = await supabase
    .from('article_guide_overrides')
    .select('guide_id')
    .eq('article_id', articleId)
    .order('sort_order', { ascending: true })
  const guideIds = (overrides ?? []).map((o) => o.guide_id as string)
  if (guideIds.length === 0) return []

  const { data: rows } = await supabase
    .from('guides')
    .select('id, slug, title, cover_url, city, saves_count, creator_handle')
    .in('id', guideIds)
    .eq('status', 'published')
  const byId = new Map((rows ?? []).map((r) => [r.id as string, mapRowToGuide(r)]))
  return guideIds.map((id) => byId.get(id)).filter((g): g is Guide => g !== undefined)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run articles.guide-links -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/guides/queries.ts apps/web/tests/articles.guide-links.test.ts
git commit -m "feat(web): getGuideOverridesForArticle"
```

---

## Task 3: `getExperienceOverridesForArticle` query

**Files:**
- Modify: `apps/web/lib/experiences/public-queries.ts`
- Modify: `apps/web/tests/experiences.public-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/experiences.public-queries.test.ts`, and add
`getExperienceOverridesForArticle` to this file's existing import line:

```ts
describe('getExperienceOverridesForArticle', () => {
  it('returns [] without querying experiences when no overrides exist', async () => {
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    fromMock.mockReturnValue({ select })

    expect(await getExperienceOverridesForArticle('article-1')).toEqual([])
    expect(fromMock).toHaveBeenCalledWith('article_experience_overrides')
  })

  it('preserves override sort_order and drops any pinned experience no longer found', async () => {
    const overridesResult = { data: [{ experience_id: 'e2' }, { experience_id: 'e1' }], error: null }
    const expRow = {
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
      city: 'Hong Kong', price_amount: 480, currency: 'HKD', duration_minutes: 120,
      cover_url: null, merchant_profile_id: 'm1', published_at: '2026-07-01T00:00:00Z',
    }
    const order = vi.fn(() => Promise.resolve(overridesResult))
    const eqOverrides = vi.fn(() => ({ order }))
    const selectOverrides = vi.fn(() => ({ eq: eqOverrides }))
    const eqExp = vi.fn(() => Promise.resolve({ data: [expRow], error: null }))
    const inExp = vi.fn(() => ({ eq: eqExp }))
    const selectExp = vi.fn(() => ({ in: inExp }))
    fromMock.mockImplementation((table: string) => (table === 'article_experience_overrides' ? { select: selectOverrides } : { select: selectExp }))

    const result = await getExperienceOverridesForArticle('article-1')
    expect(result).toEqual([{
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
      city: 'Hong Kong', priceAmount: 480, currency: 'HKD', durationMinutes: 120,
      coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', merchant: { slug: '', companyName: '' },
    }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.public-queries -v`
Expected: FAIL — `getExperienceOverridesForArticle` is not exported

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/experiences/public-queries.ts` (after `getExperiencesForCity`,
reusing the file's existing private `EXP_COLUMNS`/`ExpRow`/`toDomain`):

```ts
/**
 * Editorial override (D-R6C-1, force-add only): experiences ops has explicitly pinned to
 * this article, shown ahead of and merged with the heuristic getExperiencesForCity
 * matches. No merchant join (same no-second-query placeholder shape as
 * getExperiencesForCity) -- a pinned experience no longer found is silently dropped.
 */
export async function getExperienceOverridesForArticle(articleId: string): Promise<PublicExperience[]> {
  const supabase = createSupabasePublicClient()
  const { data: overrides } = await supabase
    .from('article_experience_overrides')
    .select('experience_id')
    .eq('article_id', articleId)
    .order('sort_order', { ascending: true })
  const experienceIds = (overrides ?? []).map((o) => o.experience_id as string)
  if (experienceIds.length === 0) return []

  const { data: rows } = await supabase
    .from('experiences')
    .select(EXP_COLUMNS)
    .in('id', experienceIds)
  const byId = new Map((rows ?? []).map((r) => [(r as unknown as ExpRow).id, toDomain(r as unknown as ExpRow, { slug: '', companyName: '' })]))
  return experienceIds.map((id) => byId.get(id)).filter((e): e is PublicExperience => e !== undefined)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.public-queries -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/experiences/public-queries.ts apps/web/tests/experiences.public-queries.test.ts
git commit -m "feat(web): getExperienceOverridesForArticle"
```

---

## Task 4: `ArticleGuideLinks` — merge overrides + heuristic, fix tag_slugs waste

**Files:**
- Modify: `apps/web/components/kinnso/articles/ArticleGuideLinks.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Create: `apps/web/tests/kinnso.ArticleGuideLinks.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/kinnso.ArticleGuideLinks.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const { getGuidesForRegionsMock, getGuideOverridesForArticleMock } = vi.hoisted(() => ({
  getGuidesForRegionsMock: vi.fn(),
  getGuideOverridesForArticleMock: vi.fn(),
}))
vi.mock('@/lib/guides/queries', () => ({
  getGuidesForRegions: getGuidesForRegionsMock,
  getGuideOverridesForArticle: getGuideOverridesForArticleMock,
}))

import { ArticleGuideLinks } from '@/components/kinnso/articles/ArticleGuideLinks'
import en from '@/lib/i18n/messages/en'

const guide = (slug: string) => ({
  slug, title: `Guide ${slug}`, cover: 'https://x/y.jpg', city: 'Tokyo', saves: 1, creatorHandle: 'c',
})

describe('ArticleGuideLinks', () => {
  it('renders nothing when neither overrides nor heuristic matches exist', async () => {
    getGuideOverridesForArticleMock.mockResolvedValueOnce([])
    getGuidesForRegionsMock.mockResolvedValueOnce([])
    const jsx = await ArticleGuideLinks({ locale: 'en', regions: ['Osaka'], articleId: 'a1', t: en.article })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })

  it('shows pinned overrides first, then fills remaining slots with heuristic matches, deduped', async () => {
    getGuideOverridesForArticleMock.mockResolvedValueOnce([guide('pinned')])
    getGuidesForRegionsMock.mockResolvedValueOnce([guide('pinned'), guide('heuristic')])
    const jsx = await ArticleGuideLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article })
    render(jsx)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0].textContent).toContain('Guide pinned')
    expect(links[1].textContent).toContain('Guide heuristic')
  })

  it('renders heuristic-only when there are no overrides', async () => {
    getGuideOverridesForArticleMock.mockResolvedValueOnce([])
    getGuidesForRegionsMock.mockResolvedValueOnce([guide('a'), guide('b')])
    const jsx = await ArticleGuideLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article })
    render(jsx)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run kinnso.ArticleGuideLinks -v`
Expected: FAIL — `ArticleGuideLinks` doesn't accept an `articleId` prop yet, doesn't call `getGuideOverridesForArticle`

- [ ] **Step 3: Update `ArticleGuideLinks.tsx`**

```tsx
import GuideCard from '@/components/kinnso/GuideCard'
import { getGuidesForRegions, getGuideOverridesForArticle } from '@/lib/guides/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Planning a trip here?" — embeds up to 3 matching guide cards in an article
 *  (master spec §5 cross-links, R1 heuristic tier). Editorial overrides (D-R6C-1) are
 *  shown first, heuristic matches fill any remaining slots, deduped against the pinned
 *  set. Renders nothing without a match. */
export async function ArticleGuideLinks({ locale, regions, articleId, t }: {
  locale: Locale; regions: string[]; articleId: string; t: Messages['article']
}) {
  const [pinned, heuristic] = await Promise.all([
    getGuideOverridesForArticle(articleId),
    getGuidesForRegions(regions),
  ])
  const pinnedSlugs = new Set(pinned.map((g) => g.slug))
  const guides = [...pinned, ...heuristic.filter((g) => !pinnedSlugs.has(g.slug))].slice(0, 3)
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

- [ ] **Step 4: Update the call site in `page.tsx`**

In `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`, replace:

```tsx
          <ArticleGuideLinks locale={loc} regions={[...(a.regions ?? []), ...(a.tag_slugs ?? [])]} t={dict.article} />
```

with (drops `tag_slugs` per D-R6C-4, adds `articleId`):

```tsx
          <ArticleGuideLinks locale={loc} regions={a.regions ?? []} articleId={a.id} t={dict.article} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run kinnso.ArticleGuideLinks -v`
Expected: PASS (3 tests)

Run: `pnpm --filter web typecheck`
Expected: PASS (confirms the page.tsx call site matches the new prop signature)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/articles/ArticleGuideLinks.tsx "apps/web/app/[locale]/articles/[category]/[url]/page.tsx" apps/web/tests/kinnso.ArticleGuideLinks.test.tsx
git commit -m "feat(web): ArticleGuideLinks merges editorial overrides ahead of heuristic matches"
```

---

## Task 5: `ArticleExperienceLinks` — merge overrides + heuristic, fix tag_slugs waste

**Files:**
- Modify: `apps/web/components/kinnso/articles/ArticleExperienceLinks.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify: `apps/web/tests/articles.experience-links.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/articles.experience-links.test.tsx` (add
`getExperienceOverridesForArticleMock` to the existing `vi.hoisted`/`vi.mock` block for
`@/lib/experiences/public-queries`):

```tsx
// extend the existing vi.hoisted/vi.mock block at the top of the file to also export:
// getExperienceOverridesForArticle: getExperienceOverridesForArticleMock

it('shows pinned overrides first, then fills remaining slots with heuristic matches, deduped', async () => {
  getExperienceOverridesForArticleMock.mockResolvedValueOnce([experience('pinned')])
  getExperiencesForCityMock.mockResolvedValueOnce([experience('pinned'), experience('heuristic')])
  const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article })
  render(jsx)
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(2)
  expect(links[0].getAttribute('href')).toBe('/en/experiences/pinned?src=article')
  expect(links[1].getAttribute('href')).toBe('/en/experiences/heuristic?src=article')
})

it('renders heuristic-only when there are no overrides', async () => {
  getExperienceOverridesForArticleMock.mockResolvedValueOnce([])
  getExperiencesForCityMock.mockResolvedValueOnce([experience('a')])
  const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article })
  render(jsx)
  expect(screen.getAllByRole('link')).toHaveLength(1)
})
```

Also update the file's two existing test calls (`renders nothing when no experiences
match any region`, `renders up to 3 experience cards...`) to pass `articleId: 'a1'` and
mock `getExperienceOverridesForArticleMock.mockResolvedValueOnce([])` beforehand, since
the component will now call both functions unconditionally.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run articles.experience-links -v`
Expected: FAIL — `ArticleExperienceLinks` doesn't accept `articleId`, doesn't call `getExperienceOverridesForArticle`

- [ ] **Step 3: Update `ArticleExperienceLinks.tsx`**

```tsx
import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity, getExperienceOverridesForArticle } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Ready to book?" — sibling to ArticleGuideLinks, same regions heuristic (D-R3-7).
 *  Editorial overrides (D-R6C-1) are shown first, heuristic matches (first region with
 *  any match wins, no merge across regions) fill any remaining slots, deduped against the
 *  pinned set. Renders nothing without a match. */
export async function ArticleExperienceLinks({ locale, regions, articleId, t }: {
  locale: Locale; regions: string[]; articleId: string; t: Messages['article']
}) {
  let heuristic: Awaited<ReturnType<typeof getExperiencesForCity>> = []
  for (const region of regions) {
    heuristic = await getExperiencesForCity(region)
    if (heuristic.length > 0) break
  }
  const pinned = await getExperienceOverridesForArticle(articleId)
  const pinnedIds = new Set(pinned.map((e) => e.id))
  const experiences = [...pinned, ...heuristic.filter((e) => !pinnedIds.has(e.id))].slice(0, 3)
  if (experiences.length === 0) return null
  return (
    <aside aria-labelledby="article-experience-links" className="k2-hairline mt-10 pt-8">
      <p className="k2-eyebrow">{t.experiencesNearbyEyebrow}</p>
      <h2 id="article-experience-links" className="k2-display mt-3 text-2xl font-semibold text-kinnso-ink">{t.experiencesNearbyHeading}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {experiences.map((exp) => (
          <ExperienceLinkCard key={exp.id} locale={locale} experience={exp} hrefQuery="src=article" />
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Update the call site in `page.tsx`**

In `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`, replace:

```tsx
          <ArticleExperienceLinks locale={loc} regions={[...(a.regions ?? []), ...(a.tag_slugs ?? [])]} t={dict.article} />
```

with:

```tsx
          <ArticleExperienceLinks locale={loc} regions={a.regions ?? []} articleId={a.id} t={dict.article} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run articles.experience-links -v`
Expected: PASS (4 tests)

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/articles/ArticleExperienceLinks.tsx "apps/web/app/[locale]/articles/[category]/[url]/page.tsx" apps/web/tests/articles.experience-links.test.tsx
git commit -m "feat(web): ArticleExperienceLinks merges editorial overrides ahead of heuristic matches"
```

---

## Task 6: Testimonial rotation

**Files:**
- Modify: `apps/web/lib/home/queries.ts`
- Modify: `apps/web/tests/home.queries.test.ts`

- [ ] **Step 1: Write the failing test (rewrites the existing describe block)**

Replace the existing `describe('getPublishedTestimonials', ...)` block in
`apps/web/tests/home.queries.test.ts` with:

```ts
describe('getPublishedTestimonials', () => {
  it('reads published rows for the locale OR all-locale rows (no DB-side ordering/limit)', async () => {
    const or = vi.fn(() => Promise.resolve({
      data: [{ id: 't1', quote: 'q', author_name: 'Mei', author_role: 'creator' }],
      error: null,
    }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const rows = await getPublishedTestimonials('zh-hk')
    expect(eq).toHaveBeenCalledWith('status', 'published')
    expect(or).toHaveBeenCalledWith('locale.is.null,locale.eq.zh-hk')
    expect(rows).toEqual([{ id: 't1', quote: 'q', authorName: 'Mei', authorRole: 'creator' }])
  })

  it('filters by author_role when given', async () => {
    const eqRole = vi.fn(() => Promise.resolve({
      data: [{ id: 't2', quote: 'q2', author_name: 'Sam', author_role: 'creator' }],
      error: null,
    }))
    const or = vi.fn(() => ({ eq: eqRole }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    await getPublishedTestimonials('en', 'creator')
    expect(eqRole).toHaveBeenCalledWith('author_role', 'creator')
  })

  it('shuffles the pool and caps the result at 3, never inventing or duplicating rows', async () => {
    const or = vi.fn(() => Promise.resolve({
      data: [
        { id: 't1', quote: 'q1', author_name: 'A', author_role: 'creator' },
        { id: 't2', quote: 'q2', author_name: 'B', author_role: 'creator' },
        { id: 't3', quote: 'q3', author_name: 'C', author_role: 'creator' },
        { id: 't4', quote: 'q4', author_name: 'D', author_role: 'creator' },
        { id: 't5', quote: 'q5', author_name: 'E', author_role: 'creator' },
      ],
      error: null,
    }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const rows = await getPublishedTestimonials('en')
    expect(rows).toHaveLength(3)
    const allIds = ['t1', 't2', 't3', 't4', 't5']
    for (const r of rows) expect(allIds).toContain(r.id)
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  })

  it('returns fewer than 3 when the filtered pool itself has fewer than 3 rows', async () => {
    const or = vi.fn(() => Promise.resolve({
      data: [{ id: 't1', quote: 'q1', author_name: 'A', author_role: 'creator' }],
      error: null,
    }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    expect(await getPublishedTestimonials('en')).toHaveLength(1)
  })
})

describe('shuffle', () => {
  it('is a pure permutation of the input (same elements, same length)', () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffle(input, () => 0.5)
    expect(result).toHaveLength(5)
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('does not mutate the input array', () => {
    const input = [1, 2, 3]
    shuffle(input, () => 0.5)
    expect(input).toEqual([1, 2, 3])
  })

  it('produces the expected order for a fixed rand source (rand always 0 -> always swap with index 0)', () => {
    const result = shuffle([1, 2, 3, 4], () => 0)
    expect(result).toEqual([2, 3, 4, 1])
  })
})
```

Add `shuffle` to this test file's existing import line: `import { getPlatformStats,
getPublishedTestimonials, getUpcomingSessions, STAT_THRESHOLDS, MIN_VISIBLE_STATS, shuffle
} from '@/lib/home/queries'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run home.queries -v`
Expected: FAIL — `shuffle` not exported; old assertions on `.order()`/`.limit()` no longer match the mock chain shape

- [ ] **Step 3: Update `getPublishedTestimonials` in `apps/web/lib/home/queries.ts`**

Replace the existing `getPublishedTestimonials` function with:

```ts
/** Fisher-Yates shuffle. `rand` is injectable for deterministic tests; defaults to Math.random. */
export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Published testimonials for a locale: rows whose locale matches OR is null (= all
 * locales), filtered by author_role if given, then shuffled and capped at 3 (D-R6C-5) so
 * every visitor doesn't see the identical three quotes forever. RLS already hides drafts
 * from the anon client; the eq() filter documents intent. sort_order stays on the table
 * as an ops-organizational field but no longer drives display order.
 */
export async function getPublishedTestimonials(
  locale: Locale,
  role?: Testimonial['authorRole'],
): Promise<Testimonial[]> {
  const supabase = createSupabasePublicClient()
  let query = supabase
    .from('testimonials')
    .select('id, quote, author_name, author_role')
    .eq('status', 'published')
    .or(`locale.is.null,locale.eq.${locale}`)
  if (role) query = query.eq('author_role', role)
  const { data } = await query
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    quote: r.quote as string,
    authorName: r.author_name as string,
    authorRole: r.author_role as Testimonial['authorRole'],
  }))
  return shuffle(rows).slice(0, 3)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run home.queries -v`
Expected: PASS

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/home/queries.ts apps/web/tests/home.queries.test.ts
git commit -m "feat(web): testimonial rotation via per-request random selection"
```

---

## Task 7: Final sweep

**Files:** none new — verification only.

- [ ] **Step 1: Full repo typecheck**

Run: `pnpm typecheck`
Expected: PASS across all workspaces.

- [ ] **Step 2: Full repo lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Full web test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS (per the vitest-scoping-gotcha memory — do not run this via
`pnpm --filter web test` from the repo root).

- [ ] **Step 4: Self-review checklist**

- Confirm `tag_slugs` no longer appears in either
  `<ArticleGuideLinks .../>`/`<ArticleExperienceLinks .../>` call site in `page.tsx`:
  `grep -n "tag_slugs" "apps/web/app/[locale]/articles/[category]/[url]/page.tsx"` → no hits.
- Confirm both new tables show `select` grant only (no insert/update/delete) live:
  spot-check via `supabase db query --linked` or the Supabase dashboard.
- Confirm `getPublishedTestimonials`'s callers (`HomeView`/`/for-creators`/
  `/for-merchants` pages) needed zero changes — same function signature, same return
  shape.
- Confirm the `shuffle` helper is only used by `getPublishedTestimonials` today (no other
  caller expects the old deterministic order).

- [ ] **Step 5: Hand off**

Report the final task/commit list to the user and proceed to the
`finishing-a-development-branch` skill (verify tests → present the 4 standard options →
execute the chosen option).
