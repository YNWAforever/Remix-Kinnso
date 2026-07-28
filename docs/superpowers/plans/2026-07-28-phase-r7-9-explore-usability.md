# Phase R7.9 Explore Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add URL-stable destination filtering, card-field search, verified-save sorting, loading skeletons, responsive filters, empty-state reset, and 12-card progressive disclosure to the statically generated Explore page.

**Architecture:** The locale server page fetches published guides and canonical destinations during SSG/ISR and passes both datasets to a client discovery controller. Pure helpers prepare, filter, sort, paginate, parse, and serialize discovery state; the client controller updates the current URL with `history.replaceState`, while a focused controls component renders the desktop sidebar and Radix-backed mobile bottom sheet.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4, Radix UI Sheet, Vitest 4.1.8, Testing Library, Playwright 1.50, Supabase local seed SQL.

## Global Constraints

- Explore remains guide-only; do not add experience tabs or a mixed feed.
- Keep `export const revalidate = 300` and all seven locale variants statically generated.
- Do not consume request-time `searchParams` in `apps/web/app/[locale]/explore/page.tsx`.
- Load guides through `getPublishedGuides()` and canonical destinations through `getPublishedDestinations()` only.
- Destination controls include only `Destination` rows with `guideCount > 0`.
- One canonical destination may be selected at a time.
- Search only title, creator handle, city, canonical destination name, and `matchTerms`.
- "Most saved" appears only when at least one published guide has `saves > 0`.
- Client filtering, sorting, and pagination do not issue a network request or show artificial loading.
- URL state uses `destination`, `q`, `sort`, and `page`; omit default values and call `window.history.replaceState`.
- Reveal guides in groups of exactly 12.
- Add every visible string to `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, and `zh-cn`.
- Preserve existing guide URLs, cards, creator attribution, metadata, sitemap, robots, JSON-LD, publication rules, and anonymous reads.
- Follow TDD: observe each focused test fail before writing its implementation.

---

## File Structure

### Create

- `apps/web/lib/explore/discovery.ts` — pure discovery state, canonical matching, filtering, stable sorting, pagination, and URL parsing/serialization.
- `apps/web/tests/explore.discovery.test.ts` — exhaustive unit contract for the pure discovery model.
- `apps/web/components/kinnso/explore/ExploreControls.tsx` — responsive desktop sidebar and mobile bottom-sheet controls.
- `apps/web/tests/kinnso.ExploreControls.test.tsx` — focused control rendering, conditional sort, and modal behavior.
- `apps/web/components/kinnso/explore/ExploreDiscovery.tsx` — client state, debounce, URL replacement, result grid, empty state, and Load more.
- `apps/web/app/[locale]/explore/loading.tsx` — route-level initial-navigation skeleton.
- `apps/web/tests/explore.host.test.tsx` — static host wiring and canonical-destination degradation.
- `apps/e2e/specs/explore-usability.spec.ts` — seeded browser acceptance journey.

### Modify

- `apps/web/components/kinnso/pages/ExploreView.tsx` — retain the editorial hero and delegate discovery UI to `ExploreDiscovery`.
- `apps/web/app/[locale]/explore/page.tsx` — load guides and destinations in parallel and pass both to the view.
- `apps/web/tests/kinnso.ExploreView.test.tsx` — replace the one-card-grid assertion with discovery, pagination, URL, empty-state, and sheet interactions.
- `apps/web/lib/i18n/messages/en.ts` — extend the authoritative `Messages['explore']` type and English copy.
- `apps/web/lib/i18n/messages/zh-hk.ts`
- `apps/web/lib/i18n/messages/zh-tw.ts`
- `apps/web/lib/i18n/messages/ja.ts`
- `apps/web/lib/i18n/messages/ko.ts`
- `apps/web/lib/i18n/messages/th.ts`
- `apps/web/lib/i18n/messages/zh-cn.ts`
- `supabase/seed.sql` — add twelve deterministic published Tokyo guides for Most saved and page-two E2E coverage.

## Shared Interfaces

Task 1 establishes these contracts. Later tasks must import them instead of
redeclaring equivalent types.

```ts
export const EXPLORE_PAGE_SIZE = 12
export const EXPLORE_SEARCH_DEBOUNCE_MS = 250

export type ExploreSort = 'newest' | 'most-saved'

export interface ExploreState {
  destination: string | null
  q: string
  sort: ExploreSort
  page: number
}

export type ExploreDestination = Pick<
  Destination,
  'slug' | 'name' | 'matchTerms' | 'guideCount'
>

export interface IndexedGuide {
  guide: Guide
  destination: ExploreDestination | null
  sourceIndex: number
  searchText: string
}

export interface ExploreResults {
  visible: Guide[]
  total: number
  hasMore: boolean
}
```

---

### Task 1: Pure Explore discovery model

**Files:**

- Create: `apps/web/lib/explore/discovery.ts`
- Create: `apps/web/tests/explore.discovery.test.ts`

**Interfaces:**

- Consumes: `Guide` from `@/lib/guides/types` and `Destination` from `@/lib/destinations/queries`.
- Produces: the shared types above plus `eligibleExploreDestinations`, `canSortByMostSaved`, `indexExploreGuides`, `parseExploreState`, `serializeExploreState`, and `selectExploreResults`.

- [ ] **Step 1: Write the failing discovery-model tests**

Create `apps/web/tests/explore.discovery.test.ts` with fixtures for Tokyo, Seoul,
an unmatched guide, stable save ties, malformed parameters, and 13 visible
guides. The assertions must include the following exact behaviors:

```ts
import { describe, expect, it } from 'vitest'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import {
  EXPLORE_PAGE_SIZE,
  canSortByMostSaved,
  eligibleExploreDestinations,
  indexExploreGuides,
  parseExploreState,
  selectExploreResults,
  serializeExploreState,
} from '@/lib/explore/discovery'

const destinations: Destination[] = [
  {
    slug: 'tokyo', name: 'Tokyo', matchTerms: ['東京', 'Shinjuku'], guideCount: 2,
    experienceCount: 0, heroImageUrl: null, description: null, latestPublishedAt: null,
  },
  {
    slug: 'seoul', name: 'Seoul', matchTerms: ['서울'], guideCount: 1,
    experienceCount: 0, heroImageUrl: null, description: null, latestPublishedAt: null,
  },
  {
    slug: 'empty', name: 'Empty', matchTerms: [], guideCount: 0,
    experienceCount: 1, heroImageUrl: null, description: null, latestPublishedAt: null,
  },
]

const guide = (slug: string, city: string, saves = 0, title = slug): Guide => ({
  slug, title, city, saves, cover: null, creatorHandle: `${slug}-creator`,
})

describe('Explore discovery model', () => {
  it('offers only canonical destinations with published guides', () => {
    expect(eligibleExploreDestinations(destinations).map(({ slug }) => slug)).toEqual(['tokyo', 'seoul'])
  })

  it('matches exact normalized city values to canonical names and aliases', () => {
    const indexed = indexExploreGuides(
      [guide('name', ' Tokyo '), guide('alias', '東京'), guide('unknown', 'Osaka')],
      destinations,
    )
    expect(indexed.map(({ destination }) => destination?.slug ?? null)).toEqual(['tokyo', 'tokyo', null])
  })

  it('searches only card fields plus canonical destination terms', () => {
    const indexed = indexExploreGuides(
      [{ ...guide('ramen', 'Tokyo'), title: 'Night ramen', creatorHandle: 'ada' }],
      destinations,
    )
    for (const q of ['ramen', 'ADA', 'tokyo', 'shinjuku', '  night   ramen ']) {
      expect(selectExploreResults(indexed, { destination: null, q, sort: 'newest', page: 1 }).total).toBe(1)
    }
    expect(selectExploreResults(indexed, { destination: null, q: 'body-only-copy', sort: 'newest', page: 1 }).total).toBe(0)
  })

  it('filters one destination and keeps unmatched guides in All only', () => {
    const indexed = indexExploreGuides(
      [guide('tokyo-guide', 'Tokyo'), guide('seoul-guide', 'Seoul'), guide('unknown', 'Osaka')],
      destinations,
    )
    expect(selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 1 }).total).toBe(3)
    expect(selectExploreResults(indexed, { destination: 'tokyo', q: '', sort: 'newest', page: 1 }).visible.map(({ slug }) => slug))
      .toEqual(['tokyo-guide'])
  })

  it('preserves newest input order and uses it to break save-count ties', () => {
    const indexed = indexExploreGuides(
      [guide('newest', 'Tokyo', 2), guide('tie-newer', 'Tokyo', 5), guide('tie-older', 'Tokyo', 5)],
      destinations,
    )
    expect(selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 1 }).visible.map(({ slug }) => slug))
      .toEqual(['newest', 'tie-newer', 'tie-older'])
    expect(selectExploreResults(indexed, { destination: null, q: '', sort: 'most-saved', page: 1 }).visible.map(({ slug }) => slug))
      .toEqual(['tie-newer', 'tie-older', 'newest'])
  })

  it('enables Most saved only for a verified positive count', () => {
    expect(canSortByMostSaved([guide('zero', 'Tokyo', 0)])).toBe(false)
    expect(canSortByMostSaved([guide('saved', 'Tokyo', 1)])).toBe(true)
  })

  it('normalizes valid URL state and rejects unsupported values', () => {
    expect(parseExploreState(
      new URLSearchParams('destination=tokyo&q=%20Night%20%20ramen%20&sort=most-saved&page=2'),
      new Set(['tokyo', 'seoul']),
      true,
    )).toEqual({ destination: 'tokyo', q: 'Night ramen', sort: 'most-saved', page: 2 })
    expect(parseExploreState(
      new URLSearchParams('destination=missing&sort=popular&page=-4'),
      new Set(['tokyo']),
      false,
    )).toEqual({ destination: null, q: '', sort: 'newest', page: 1 })
  })

  it('omits defaults and serializes non-default state in a stable order', () => {
    expect(serializeExploreState({ destination: null, q: '', sort: 'newest', page: 1 }).toString()).toBe('')
    expect(serializeExploreState({
      destination: 'tokyo', q: 'Night ramen', sort: 'most-saved', page: 2,
    }).toString()).toBe('destination=tokyo&q=Night+ramen&sort=most-saved&page=2')
  })

  it('reveals exactly twelve cards per requested page', () => {
    const indexed = indexExploreGuides(
      Array.from({ length: 13 }, (_, index) => guide(`guide-${index + 1}`, 'Tokyo')),
      destinations,
    )
    const first = selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 1 })
    const second = selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 2 })
    expect(first.visible).toHaveLength(EXPLORE_PAGE_SIZE)
    expect(first).toMatchObject({ total: 13, hasMore: true })
    expect(second.visible).toHaveLength(13)
    expect(second.hasMore).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```bash
pnpm --filter web exec vitest run tests/explore.discovery.test.ts
```

Expected: FAIL because `@/lib/explore/discovery` does not exist.

- [ ] **Step 3: Implement the pure discovery model**

Create `apps/web/lib/explore/discovery.ts`. Use exact equality for normalized
guide-city-to-destination matching, preserve the source index for stable ties,
and keep URL defaults out of serialization:

```ts
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'

export const EXPLORE_PAGE_SIZE = 12
export const EXPLORE_SEARCH_DEBOUNCE_MS = 250
export type ExploreSort = 'newest' | 'most-saved'
export interface ExploreState { destination: string | null; q: string; sort: ExploreSort; page: number }
export type ExploreDestination = Pick<Destination, 'slug' | 'name' | 'matchTerms' | 'guideCount'>
export interface IndexedGuide {
  guide: Guide
  destination: ExploreDestination | null
  sourceIndex: number
  searchText: string
}
export interface ExploreResults { visible: Guide[]; total: number; hasMore: boolean }

const cleanWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ')
const normalize = (value: string) => cleanWhitespace(value).toLocaleLowerCase()

export function eligibleExploreDestinations(destinations: Destination[]): ExploreDestination[] {
  return destinations
    .filter(({ guideCount }) => guideCount > 0)
    .map(({ slug, name, matchTerms, guideCount }) => ({ slug, name, matchTerms, guideCount }))
}

export function canSortByMostSaved(guides: Guide[]): boolean {
  return guides.some(({ saves }) => Number.isFinite(saves) && saves > 0)
}

export function indexExploreGuides(guides: Guide[], destinations: ExploreDestination[]): IndexedGuide[] {
  return guides.map((guide, sourceIndex) => {
    const city = normalize(guide.city)
    const destination = destinations.find((candidate) =>
      [candidate.name, ...candidate.matchTerms].some((term) => normalize(term) === city),
    ) ?? null
    const searchText = normalize([
      guide.title,
      guide.creatorHandle,
      guide.city,
      destination?.name ?? '',
      ...(destination?.matchTerms ?? []),
    ].join(' '))
    return { guide, destination, sourceIndex, searchText }
  })
}

export function parseExploreState(
  params: URLSearchParams,
  destinationSlugs: ReadonlySet<string>,
  allowMostSaved: boolean,
): ExploreState {
  const requestedDestination = params.get('destination')
  const requestedSort = params.get('sort')
  const requestedPage = Number(params.get('page') ?? '1')
  return {
    destination: requestedDestination && destinationSlugs.has(requestedDestination) ? requestedDestination : null,
    q: cleanWhitespace(params.get('q') ?? ''),
    sort: requestedSort === 'most-saved' && allowMostSaved ? 'most-saved' : 'newest',
    page: Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1,
  }
}

export function serializeExploreState(state: ExploreState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.destination) params.set('destination', state.destination)
  if (cleanWhitespace(state.q)) params.set('q', cleanWhitespace(state.q))
  if (state.sort !== 'newest') params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

export function selectExploreResults(indexed: IndexedGuide[], state: ExploreState): ExploreResults {
  const query = normalize(state.q)
  const filtered = indexed.filter(({ destination, searchText }) =>
    (!state.destination || destination?.slug === state.destination) &&
    (!query || searchText.includes(query)),
  )
  const sorted = state.sort === 'most-saved'
    ? [...filtered].sort((a, b) => (b.guide.saves - a.guide.saves) || (a.sourceIndex - b.sourceIndex))
    : filtered
  const visible = sorted.slice(0, state.page * EXPLORE_PAGE_SIZE).map(({ guide }) => guide)
  return { visible, total: sorted.length, hasMore: visible.length < sorted.length }
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm --filter web exec vitest run tests/explore.discovery.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit the discovery model**

```bash
git add apps/web/lib/explore/discovery.ts apps/web/tests/explore.discovery.test.ts
git commit -m "feat(explore): define discovery state model"
```

---

### Task 2: Seven-locale Explore control copy

**Files:**

- Modify: `apps/web/lib/i18n/messages/en.ts:871-875,2023-2030`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts:762-769`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts:762-769`
- Modify: `apps/web/lib/i18n/messages/ja.ts:762-769`
- Modify: `apps/web/lib/i18n/messages/ko.ts:762-769`
- Modify: `apps/web/lib/i18n/messages/th.ts:762-769`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts:762-769`
- Test: `apps/web/tests/i18n.locale-parity.test.ts`

**Interfaces:**

- Produces: `Messages['explore']` with the existing six keys plus the sixteen keys below.
- Consumed by: `ExploreControls`, `ExploreDiscovery`, and `ExploreView`.

- [ ] **Step 1: Extend the locale parity test with required Explore keys**

Add this assertion to `apps/web/tests/i18n.locale-parity.test.ts`:

```ts
it('defines the complete Explore discovery contract', () => {
  expect(Object.keys(en.explore).sort()).toEqual([
    'activeFilters', 'allDestinations', 'closeFilters', 'destinationFilterLabel',
    'emptyFilteredBody', 'emptyFilteredTitle', 'emptyNote', 'filters',
    'filtersDescription', 'gridHeading', 'heading', 'loadMore', 'mostSaved',
    'newest', 'pill', 'resetFilters', 'resultsLabel', 'savesLabel',
    'searchLabel', 'searchPlaceholder', 'showResults', 'sortLabel', 'subtitle',
  ].sort())
})
```

- [ ] **Step 2: Run locale parity and observe the missing-key failure**

Run:

```bash
pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts
```

Expected: FAIL because the English Explore dictionary lacks the discovery keys.

- [ ] **Step 3: Add the authoritative type and exact translations**

Extend the English `Messages['explore']` declaration with:

```ts
destinationFilterLabel: string; allDestinations: string
searchLabel: string; searchPlaceholder: string
sortLabel: string; newest: string; mostSaved: string
filters: string; filtersDescription: string; activeFilters: string
resultsLabel: string; showResults: string
emptyFilteredTitle: string; emptyFilteredBody: string
resetFilters: string; loadMore: string; closeFilters: string
```

Add these exact values to each locale's `explore` object:

| Key | en | zh-hk | zh-tw | ja | ko | th | zh-cn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `destinationFilterLabel` | Destinations | 目的地 | 目的地 | 目的地 | 여행지 | จุดหมาย | 目的地 |
| `allDestinations` | All destinations | 所有目的地 | 所有目的地 | すべての目的地 | 모든 여행지 | จุดหมายทั้งหมด | 所有目的地 |
| `searchLabel` | Search guides | 搜尋攻略 | 搜尋攻略 | ガイドを検索 | 가이드 검색 | ค้นหาไกด์ | 搜索攻略 |
| `searchPlaceholder` | Search guides, creators or cities | 搜尋攻略、創作者或城市 | 搜尋攻略、創作者或城市 | ガイド、クリエイター、都市を検索 | 가이드, 크리에이터 또는 도시 검색 | ค้นหาไกด์ ครีเอเตอร์ หรือเมือง | 搜索攻略、创作者或城市 |
| `sortLabel` | Sort by | 排序方式 | 排序方式 | 並び順 | 정렬 | เรียงตาม | 排序方式 |
| `newest` | Newest | 最新 | 最新 | 新着順 | 최신순 | ใหม่ล่าสุด | 最新 |
| `mostSaved` | Most saved | 最多收藏 | 最多收藏 | 保存数順 | 저장 많은 순 | บันทึกมากที่สุด | 最多收藏 |
| `filters` | Filters | 篩選 | 篩選 | フィルター | 필터 | ตัวกรอง | 筛选 |
| `filtersDescription` | Choose one destination and a sort order. | 選擇一個目的地同排序方式。 | 選擇一個目的地與排序方式。 | 目的地を1つ選び、並び順を指定します。 | 여행지 하나와 정렬 방식을 선택하세요. | เลือกหนึ่งจุดหมายและลำดับการเรียง | 选择一个目的地和排序方式。 |
| `activeFilters` | Active filters | 已啟用篩選 | 已啟用篩選 | 適用中のフィルター | 적용된 필터 | ตัวกรองที่ใช้อยู่ | 已启用筛选 |
| `resultsLabel` | {count} guides | {count} 篇攻略 | {count} 篇攻略 | {count}件のガイド | 가이드 {count}개 | ไกด์ {count} รายการ | {count} 篇攻略 |
| `showResults` | Show {count} results | 顯示 {count} 個結果 | 顯示 {count} 個結果 | {count}件の結果を表示 | 결과 {count}개 보기 | แสดง {count} ผลลัพธ์ | 显示 {count} 个结果 |
| `emptyFilteredTitle` | No guides match these filters | 沒有符合篩選條件的攻略 | 沒有符合篩選條件的攻略 | 条件に一致するガイドがありません | 조건에 맞는 가이드가 없습니다 | ไม่พบไกด์ที่ตรงกับตัวกรอง | 没有符合筛选条件的攻略 |
| `emptyFilteredBody` | Try another search or reset the filters. | 試下其他搜尋，或者重設篩選。 | 請嘗試其他搜尋或重設篩選。 | 検索条件を変えるか、フィルターをリセットしてください。 | 다른 검색어를 시도하거나 필터를 초기화하세요. | ลองค้นหาแบบอื่นหรือรีเซ็ตตัวกรอง | 尝试其他搜索或重置筛选。 |
| `resetFilters` | Reset filters | Reset 篩選 | 重設篩選 | フィルターをリセット | 필터 초기화 | รีเซ็ตตัวกรอง | 重置筛选 |
| `loadMore` | Load more | 顯示更多 | 顯示更多 | もっと見る | 더 보기 | โหลดเพิ่มเติม | 显示更多 |
| `closeFilters` | Close filters | 關閉篩選 | 關閉篩選 | フィルターを閉じる | 필터 닫기 | ปิดตัวกรอง | 关闭筛选 |

- [ ] **Step 4: Run locale parity**

Run:

```bash
pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts
```

Expected: PASS for all seven locales and the complete Explore key contract.

- [ ] **Step 5: Commit the locale contract**

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(i18n): localize explore discovery controls"
```

---

### Task 3: Responsive Explore controls

**Files:**

- Create: `apps/web/components/kinnso/explore/ExploreControls.tsx`
- Create: `apps/web/tests/kinnso.ExploreControls.test.tsx`

**Interfaces:**

- Consumes: `ExploreDestination`, `ExploreSort`, and `Messages['explore']`.
- Produces:

```ts
export interface ExploreControlsProps {
  t: Messages['explore']
  destinations: ExploreDestination[]
  destination: string | null
  searchValue: string
  sort: ExploreSort
  total: number
  allowMostSaved: boolean
  onDestinationChange: (destination: string | null) => void
  onSearchChange: (value: string) => void
  onSortChange: (sort: ExploreSort) => void
  children: ReactNode
}
```

- [ ] **Step 1: Write failing control and bottom-sheet tests**

Create `apps/web/tests/kinnso.ExploreControls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ExploreControls, type ExploreControlsProps } from '@/components/kinnso/explore/ExploreControls'
import en from '@/lib/i18n/messages/en'

const destinations = [{ slug: 'tokyo', name: 'Tokyo', matchTerms: ['東京'], guideCount: 2 }]
afterEach(cleanup)

function renderControls(overrides: Partial<ExploreControlsProps> = {}) {
  const props: ExploreControlsProps = {
    t: en.explore,
    destinations,
    destination: null,
    searchValue: '',
    sort: 'newest',
    total: 2,
    allowMostSaved: true,
    onDestinationChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
    children: <div data-testid="results">Results</div>,
    ...overrides,
  }
  render(<ExploreControls {...props} />)
  return props
}

describe('ExploreControls', () => {
  it('renders labelled controls, result content, and Most saved when verified', () => {
    renderControls()
    expect(screen.getByRole('searchbox', { name: en.explore.searchLabel })).toBeVisible()
    expect(screen.getByRole('group', { name: en.explore.destinationFilterLabel })).toBeVisible()
    expect(screen.getByRole('radio', { name: en.explore.allDestinations })).toBeChecked()
    expect(screen.getByRole('option', { name: en.explore.mostSaved })).toBeVisible()
    expect(screen.getByRole('button', { name: new RegExp(en.explore.filters) })).toBeVisible()
    expect(screen.getByTestId('results')).toBeVisible()
  })

  it('hides Most saved when every verified count is zero', () => {
    renderControls({ allowMostSaved: false })
    expect(screen.queryByRole('option', { name: en.explore.mostSaved })).not.toBeInTheDocument()
  })

  it('hides destination controls when canonical inventory is unavailable', () => {
    renderControls({ destinations: [] })
    expect(screen.queryByRole('group', { name: en.explore.destinationFilterLabel })).not.toBeInTheDocument()
    expect(screen.getByTestId('results')).toBeVisible()
  })

  it('emits destination, search, and sort changes', () => {
    const props = renderControls()
    fireEvent.click(screen.getByRole('radio', { name: 'Tokyo' }))
    fireEvent.change(screen.getByRole('searchbox', { name: en.explore.searchLabel }), {
      target: { value: 'ramen' },
    })
    fireEvent.change(screen.getByLabelText(en.explore.sortLabel), {
      target: { value: 'most-saved' },
    })
    expect(props.onDestinationChange).toHaveBeenCalledWith('tokyo')
    expect(props.onSearchChange).toHaveBeenCalledWith('ramen')
    expect(props.onSortChange).toHaveBeenCalledWith('most-saved')
  })

  it('opens a labelled bottom sheet and closes it with Escape', () => {
    renderControls()
    const trigger = screen.getByRole('button', { name: new RegExp(en.explore.filters) })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: en.explore.filters })).toBeVisible()
    expect(screen.getByText(en.explore.filtersDescription)).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: en.explore.filters })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

```bash
pnpm --filter web exec vitest run tests/kinnso.ExploreControls.test.tsx
```

Expected: FAIL because `ExploreControls` does not exist.

- [ ] **Step 3: Implement the responsive control/layout component**

Create `apps/web/components/kinnso/explore/ExploreControls.tsx`:

```tsx
"use client"

import { useState, type ReactNode } from 'react'
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import type { ExploreDestination, ExploreSort } from '@/lib/explore/discovery'
import type { Messages } from '@/lib/i18n/messages/en'

export interface ExploreControlsProps {
  t: Messages['explore']
  destinations: ExploreDestination[]
  destination: string | null
  searchValue: string
  sort: ExploreSort
  total: number
  allowMostSaved: boolean
  onDestinationChange: (destination: string | null) => void
  onSearchChange: (value: string) => void
  onSortChange: (sort: ExploreSort) => void
  children: ReactNode
}

const withCount = (template: string, count: number) => template.replace('{count}', String(count))

export function ExploreControls(props: ExploreControlsProps) {
  const {
    t, destinations, destination, searchValue, sort, total, allowMostSaved,
    onDestinationChange, onSearchChange, onSortChange, children,
  } = props
  const [open, setOpen] = useState(false)
  const activeCount = Number(destination !== null) + Number(sort !== 'newest')
  const hasDestinations = destinations.length > 0
  const options = [{ slug: null, name: t.allDestinations }, ...destinations.map(({ slug, name }) => ({ slug, name }))]

  const destinationOptions = hasDestinations ? (
    <fieldset aria-label={t.destinationFilterLabel} className="space-y-2">
      <legend className="mb-3 text-sm font-semibold text-kinnso-ink">{t.destinationFilterLabel}</legend>
      {options.map((option) => (
        <label key={option.slug ?? 'all'}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-full px-3 text-sm text-kinnso-ink focus-within:ring-2 focus-within:ring-kinnso-ink">
          <input type="radio" name="explore-destination" value={option.slug ?? ''}
            checked={destination === option.slug}
            onChange={() => onDestinationChange(option.slug)} />
          <span>{option.name}</span>
        </label>
      ))}
    </fieldset>
  ) : null

  const sortSelect = (
    <label className="grid gap-2 text-sm font-semibold text-kinnso-ink">
      {t.sortLabel}
      <select value={sort} onChange={(event) => onSortChange(event.target.value as ExploreSort)}
        className="min-h-11 rounded-full border border-kinnso-edge bg-white px-4 font-normal">
        <option value="newest">{t.newest}</option>
        {allowMostSaved ? <option value="most-saved">{t.mostSaved}</option> : null}
      </select>
    </label>
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-2 text-sm font-semibold text-kinnso-ink">
          {t.searchLabel}
          <input type="search" value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="min-h-11 rounded-full border border-kinnso-edge bg-white px-4 font-normal" />
        </label>
        <button type="button" onClick={() => setOpen(true)}
          className="k-btn-secondary self-end lg:hidden"
          aria-label={activeCount ? `${t.filters}, ${activeCount} ${t.activeFilters}` : t.filters}>
          {t.filters}{activeCount ? ` (${activeCount})` : ''}
        </button>
        <div className="hidden self-end lg:block">{sortSelect}</div>
      </div>

      <div className={`mt-6 grid gap-8 ${hasDestinations ? 'lg:grid-cols-[14rem_minmax(0,1fr)]' : ''}`}>
        {hasDestinations ? <aside className="hidden lg:block">{destinationOptions}</aside> : null}
        <div>{children}</div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false}
          className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-kinnso-cream">
          <SheetHeader className="text-left">
            <div className="flex items-center justify-between gap-4">
              <SheetTitle>{t.filters}</SheetTitle>
              <SheetClose asChild>
                <button type="button" className="k-btn-ghost">{t.closeFilters}</button>
              </SheetClose>
            </div>
            <SheetDescription>{t.filtersDescription}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 px-4">{destinationOptions}{sortSelect}</div>
          <SheetFooter>
            <button type="button" className="k-btn-primary w-full" onClick={() => setOpen(false)}>
              {withCount(t.showResults, total)}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

The shared Sheet supplies modal focus trapping, background inertness, Escape
close, and focus restoration. The explicit localized `SheetClose` avoids the
shared primitive's English-only default label.

- [ ] **Step 4: Run the focused control tests**

```bash
pnpm --filter web exec vitest run tests/kinnso.ExploreControls.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit the responsive control surface**

```bash
git add apps/web/components/kinnso/explore/ExploreControls.tsx apps/web/tests/kinnso.ExploreControls.test.tsx
git commit -m "feat(explore): add responsive discovery controls"
```

---

### Task 4: URL-stable discovery controller and result states

**Files:**

- Create: `apps/web/components/kinnso/explore/ExploreDiscovery.tsx`
- Modify: `apps/web/components/kinnso/pages/ExploreView.tsx`
- Modify: `apps/web/tests/kinnso.ExploreView.test.tsx`

**Interfaces:**

- Consumes: Task 1 helpers, Task 2 messages, Task 3 `ExploreControls`, `GuideCard`.
- Produces:

```ts
export interface ExploreDiscoveryProps {
  locale: Locale
  t: Messages['explore']
  guides: Guide[]
  destinations: Destination[]
}
```

- [ ] **Step 1: Add failing interaction, URL, empty, live-region, and pagination tests**

Update the Vitest import to include `beforeEach` and `vi`, and the Testing
Library import to include `fireEvent`, `screen`, and `waitFor`. Reset
`window.history.replaceState({}, '', '/en/explore')` in `beforeEach`.
Use `vi.useFakeTimers()` for the 250 ms search debounce and reset
`window.history.replaceState({}, '', '/en/explore')` in `beforeEach`.
Add these behaviors to `apps/web/tests/kinnso.ExploreView.test.tsx`:

```tsx
it('filters by canonical destination and replaces the current URL', () => {
  const replaceSpy = vi.spyOn(window.history, 'replaceState')
  render(<ExploreView locale="en" t={en.explore} guides={[
    { ...guides[0], slug: 'tokyo', city: '東京' },
    { ...guides[1], slug: 'seoul', city: 'Seoul' },
  ]} destinations={[
    ...destinations,
    { ...destinations[0], slug: 'seoul', name: 'Seoul', matchTerms: [], guideCount: 1 },
  ]} />)
  fireEvent.click(screen.getByRole('radio', { name: 'Tokyo' }))
  expect(screen.getByRole('heading', { level: 3, name: guides[0].title })).toBeVisible()
  expect(screen.queryByRole('heading', { level: 3, name: guides[1].title })).not.toBeInTheDocument()
  expect(replaceSpy).toHaveBeenLastCalledWith(window.history.state, '', '/en/explore?destination=tokyo')
})

it('debounces card-field search, resets page, and announces the result count', async () => {
  vi.useFakeTimers()
  render(<ExploreView locale="en" t={en.explore} guides={guides} destinations={destinations} />)
  fireEvent.change(screen.getByRole('searchbox', { name: en.explore.searchLabel }), {
    target: { value: guides[0].creatorHandle },
  })
  expect(window.location.search).toBe('')
  await vi.advanceTimersByTimeAsync(250)
  expect(window.location.search).toContain('q=')
  expect(screen.getByRole('status')).toHaveTextContent('1')
  vi.useRealTimers()
})

it('restores valid direct URL state after hydration', async () => {
  window.history.replaceState({}, '', '/en/explore?destination=tokyo&page=2')
  render(<ExploreView locale="en" t={en.explore}
    guides={Array.from({ length: 13 }, (_, index) => ({
      ...guides[0], slug: `tokyo-${index}`, title: `Tokyo ${index}`, city: 'Tokyo',
    }))} destinations={destinations} />)
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Tokyo' })).toBeChecked())
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(13)
})

it('reveals twelve cards, loads the thirteenth, and persists page=2', () => {
  render(<ExploreView locale="en" t={en.explore}
    guides={Array.from({ length: 13 }, (_, index) => ({
      ...guides[0], slug: `guide-${index}`, title: `Guide ${index}`,
    }))} destinations={destinations} />)
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12)
  fireEvent.click(screen.getByRole('button', { name: en.explore.loadMore }))
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(13)
  expect(window.location.search).toBe('?page=2')
  expect(screen.queryByRole('button', { name: en.explore.loadMore })).not.toBeInTheDocument()
})

it('keeps controls visible in filtered-empty state and resets all state', async () => {
  vi.useFakeTimers()
  render(<ExploreView locale="en" t={en.explore} guides={guides} destinations={destinations} />)
  fireEvent.change(screen.getByRole('searchbox', { name: en.explore.searchLabel }), {
    target: { value: 'definitely-no-match' },
  })
  await vi.advanceTimersByTimeAsync(250)
  expect(screen.getByText(en.explore.emptyFilteredTitle)).toBeVisible()
  expect(screen.getByRole('searchbox', { name: en.explore.searchLabel })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: en.explore.resetFilters }))
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(guides.length)
  expect(window.location.search).toBe('')
  vi.useRealTimers()
})
```

- [ ] **Step 2: Run the component test and observe missing controller behavior**

Run:

```bash
pnpm --filter web exec vitest run tests/kinnso.ExploreView.test.tsx
```

Expected: FAIL on filtering, URL replacement, debounce, pagination, and reset.

- [ ] **Step 3: Implement `ExploreDiscovery`**

Create a client component that:

1. Prepares eligible destinations and indexed guides with `useMemo`.
2. Derives `allowMostSaved` from positive guide saves.
3. Starts with `{ destination: null, q: '', sort: 'newest', page: 1 }`.
4. On mount, parses `window.location.search` and restores valid state.
5. Commits control changes through one `commit(next)` function.
6. Replaces the current URL with the serialized state.
7. Debounces only the search text by 250 ms.

Use this state/write core exactly:

```tsx
"use client"

import { useEffect, useMemo, useState } from 'react'
import GuideCard from '@/components/kinnso/GuideCard'
import { ExploreControls } from '@/components/kinnso/explore/ExploreControls'
import {
  EXPLORE_SEARCH_DEBOUNCE_MS,
  canSortByMostSaved,
  eligibleExploreDestinations,
  indexExploreGuides,
  parseExploreState,
  selectExploreResults,
  serializeExploreState,
  type ExploreSort,
  type ExploreState,
} from '@/lib/explore/discovery'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

const DEFAULT_STATE: ExploreState = { destination: null, q: '', sort: 'newest', page: 1 }
const withCount = (template: string, count: number) => template.replace('{count}', String(count))

export function ExploreDiscovery({ locale, t, guides, destinations }: {
  locale: Locale
  t: Messages['explore']
  guides: Guide[]
  destinations: Destination[]
}) {
  const eligible = useMemo(() => eligibleExploreDestinations(destinations), [destinations])
  const indexed = useMemo(() => indexExploreGuides(guides, eligible), [guides, eligible])
  const allowMostSaved = useMemo(() => canSortByMostSaved(guides), [guides])
  const destinationSlugs = useMemo(() => new Set(eligible.map(({ slug }) => slug)), [eligible])
  const [state, setState] = useState<ExploreState>(DEFAULT_STATE)
  const [searchValue, setSearchValue] = useState('')
  const [hydrated, setHydrated] = useState(false)

  const replaceUrl = (next: ExploreState) => {
    const query = serializeExploreState(next).toString()
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState(window.history.state, '', url)
  }
  const commit = (next: ExploreState) => {
    setState(next)
    replaceUrl(next)
  }

  useEffect(() => {
    const restored = parseExploreState(new URLSearchParams(window.location.search), destinationSlugs, allowMostSaved)
    setState(restored)
    setSearchValue(restored.q)
    setHydrated(true)
  }, [allowMostSaved, destinationSlugs])

  useEffect(() => {
    if (!hydrated || searchValue === state.q) return
    const timeout = window.setTimeout(() => {
      commit({ ...state, q: searchValue.trim().replace(/\s+/g, ' '), page: 1 })
    }, EXPLORE_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [hydrated, searchValue, state])

  const results = selectExploreResults(indexed, state)
  const reset = () => {
    setSearchValue('')
    commit(DEFAULT_STATE)
  }

  return (
    <section aria-labelledby="explore-grid-heading" className="mt-10">
      <ExploreControls
        t={t} destinations={eligible} destination={state.destination}
        searchValue={searchValue} sort={state.sort} total={results.total}
        allowMostSaved={allowMostSaved}
        onDestinationChange={(destination) => commit({ ...state, destination, page: 1 })}
        onSearchChange={setSearchValue}
        onSortChange={(sort: ExploreSort) => commit({ ...state, sort, page: 1 })}
      >
      <p role="status" aria-live="polite" className="mt-5 text-sm text-kinnso-muted">
        {withCount(t.resultsLabel, results.total)}
      </p>
      <h2 id="explore-grid-heading" className="sr-only">{t.gridHeading}</h2>
      {results.total ? (
        <>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.visible.map((guide) => (
              <GuideCard key={guide.slug} g={guide} locale={locale} savesLabel={t.savesLabel} />
            ))}
          </div>
          {results.hasMore ? (
            <div className="mt-8 text-center">
              <button type="button" className="k-btn-secondary"
                onClick={() => commit({ ...state, page: state.page + 1 })}>
                {t.loadMore}
              </button>
            </div>
          ) : <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>}
        </>
      ) : guides.length && (state.destination || state.q || state.sort !== 'newest') ? (
        <div className="mt-8 rounded-3xl border border-kinnso-edge bg-white p-8 text-center">
          <h3 className="text-xl font-semibold text-kinnso-ink">{t.emptyFilteredTitle}</h3>
          <p className="mt-2 text-kinnso-muted">{t.emptyFilteredBody}</p>
          <button type="button" className="k-btn-secondary mt-5" onClick={reset}>{t.resetFilters}</button>
        </div>
      ) : <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>}
      </ExploreControls>
    </section>
  )
}
```


- [ ] **Step 4: Replace the old grid in `ExploreView`**

Keep the existing hero markup and replace its grid/empty-note block with:

```tsx
import { ExploreDiscovery } from '@/components/kinnso/explore/ExploreDiscovery'
import type { Destination } from '@/lib/destinations/queries'

export function ExploreView({ locale, t, guides, destinations }: {
  locale: Locale
  t: Messages['explore']
  guides: Guide[]
  destinations: Destination[]
}) {
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell>
        <Eyebrow>{t.pill}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">
          {t.heading}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
        <ExploreDiscovery locale={locale} t={t} guides={guides} destinations={destinations} />
      </SectionShell>
    </main>
  )
}
```

- [ ] **Step 5: Run component and discovery tests**

Run:

```bash
pnpm --filter web exec vitest run tests/explore.discovery.test.ts tests/kinnso.ExploreControls.test.tsx tests/kinnso.ExploreView.test.tsx
```

Expected: PASS for pure matching/state and all responsive interaction cases.

- [ ] **Step 6: Commit the controller and result states**

```bash
git add apps/web/components/kinnso/explore/ExploreDiscovery.tsx apps/web/components/kinnso/pages/ExploreView.tsx apps/web/tests/kinnso.ExploreView.test.tsx
git commit -m "feat(explore): add URL-stable guide discovery"
```

---

### Task 5: Static page data wiring and route skeleton

**Files:**

- Modify: `apps/web/app/[locale]/explore/page.tsx:1-28`
- Create: `apps/web/app/[locale]/explore/loading.tsx`
- Create: `apps/web/tests/explore.host.test.tsx`

**Interfaces:**

- Consumes: `getPublishedGuides()`, `getPublishedDestinations()`, and the new `ExploreView` props.
- Produces: a static/ISR Explore host with both datasets and a navigation skeleton.

- [ ] **Step 1: Write failing host tests**

Create `apps/web/tests/explore.host.test.tsx` with hoisted mocks for both queries
and a captured `ExploreView` prop object:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
const mocks = vi.hoisted(() => ({
  guides: vi.fn(async () => [{ slug: 'tokyo', title: 'Tokyo', cover: null, city: 'Tokyo', saves: 0, creatorHandle: 'ada' }]),
  destinations: vi.fn(async () => [{
    slug: 'tokyo', name: 'Tokyo', matchTerms: ['東京'], guideCount: 1, experienceCount: 0,
    heroImageUrl: null, description: null, latestPublishedAt: null,
  }]),
}))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: mocks.guides }))
vi.mock('@/lib/destinations/queries', () => ({ getPublishedDestinations: mocks.destinations }))
vi.mock('@/components/kinnso/pages/ExploreView', () => ({
  ExploreView: (props: Record<string, unknown>) => {
    captured.props = props
    return <div data-testid="explore-view" />
  },
}))

import ExplorePage, { revalidate } from '@/app/[locale]/explore/page'
import ExploreLoading from '@/app/[locale]/explore/loading'

describe('/[locale]/explore host', () => {
  beforeEach(() => { captured.props = null; vi.clearAllMocks() })

  it('loads guides and canonical destinations for the static view', async () => {
    render(await ExplorePage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(mocks.guides).toHaveBeenCalledOnce()
    expect(mocks.destinations).toHaveBeenCalledOnce()
    expect(captured.props).toMatchObject({
      locale: 'en',
      guides: await mocks.guides.mock.results[0].value,
      destinations: await mocks.destinations.mock.results[0].value,
    })
    expect(revalidate).toBe(300)
  })

  it('passes an empty destination list through for graceful unfiltered browsing', async () => {
    mocks.destinations.mockResolvedValueOnce([])
    render(await ExplorePage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(captured.props?.destinations).toEqual([])
  })

  it('renders a labelled skeleton structure without visible copy', () => {
    const { container } = render(<ExploreLoading />)
    expect(container.querySelector('[data-explore-skeleton="true"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-guide-card-skeleton="true"]')).toHaveLength(6)
  })

  it('rejects an unknown locale', async () => {
    await expect(ExplorePage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the host test and verify missing destination/loading failures**

Run:

```bash
pnpm --filter web exec vitest run tests/explore.host.test.tsx
```

Expected: FAIL because the page does not request destinations and
`loading.tsx` does not exist.

- [ ] **Step 3: Load both static datasets in parallel**

Modify the page imports and body:

```tsx
import { getPublishedDestinations } from '@/lib/destinations/queries'

const [guides, destinations] = await Promise.all([
  getPublishedGuides(),
  getPublishedDestinations(),
])
return (
  <ExploreView
    locale={locale as Locale}
    t={messages.explore}
    guides={guides}
    destinations={destinations}
  />
)
```

Do not add a `searchParams` prop or change `revalidate`.

- [ ] **Step 4: Add the route skeleton**

Create `apps/web/app/[locale]/explore/loading.tsx`:

```tsx
export default function ExploreLoading() {
  return (
    <main className="bg-kinnso-cream font-sans" aria-busy="true" data-explore-skeleton="true">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="h-5 w-24 animate-pulse rounded-full bg-kinnso-edge" />
        <div className="mt-5 h-14 max-w-2xl animate-pulse rounded-2xl bg-kinnso-edge" />
        <div className="mt-4 h-6 max-w-xl animate-pulse rounded-xl bg-kinnso-edge" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="hidden h-72 animate-pulse rounded-3xl bg-kinnso-edge lg:block" />
          <div>
            <div className="h-11 animate-pulse rounded-full bg-kinnso-edge" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} data-guide-card-skeleton="true"
                  className="h-80 animate-pulse rounded-3xl bg-kinnso-edge" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Run host, view, and locale tests**

Run:

```bash
pnpm --filter web exec vitest run tests/explore.host.test.tsx tests/kinnso.ExploreControls.test.tsx tests/kinnso.ExploreView.test.tsx tests/i18n.locale-parity.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the static host and skeleton**

```bash
git add apps/web/app/[locale]/explore/page.tsx apps/web/app/[locale]/explore/loading.tsx apps/web/tests/explore.host.test.tsx
git commit -m "feat(explore): wire static discovery inventory"
```

---

### Task 6: Deterministic browser acceptance coverage

**Files:**

- Modify: `supabase/seed.sql:119-126`
- Create: `apps/e2e/specs/explore-usability.spec.ts`

**Interfaces:**

- Consumes: the local R7 smoke creator and original `r7-smoke-tokyo-guide`.
- Produces: 13 deterministic Tokyo guides, at least one positive save count,
  and an E2E journey for filter/search/sort/page/reset/share behavior.

- [ ] **Step 1: Write the failing Playwright journey**

Create `apps/e2e/specs/explore-usability.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('Explore state is URL-stable, reloadable, paginated, and resettable', async ({ page }) => {
  const response = await page.goto('/en/explore')
  expect(response?.status()).toBe(200)

  const historyLength = await page.evaluate(() => window.history.length)
  await expect(page.getByRole('searchbox', { name: 'Search guides' })).toBeVisible()
  await page.getByRole('radio', { name: 'Tokyo' }).check()
  await expect(page).toHaveURL(/destination=tokyo/)
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)

  await page.getByRole('searchbox', { name: 'Search guides' }).fill('R7')
  await expect(page).toHaveURL(/q=R7/)
  await page.getByLabel('Sort by').selectOption('most-saved')
  await expect(page).toHaveURL(/sort=most-saved/)
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)

  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(12)
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(13)

  await page.reload()
  await expect(page.getByRole('radio', { name: 'Tokyo' })).toBeChecked()
  await expect(page.getByLabel('Sort by')).toHaveValue('most-saved')
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(13)

  await page.getByRole('searchbox', { name: 'Search guides' }).fill('definitely-no-match')
  await expect(page.getByText('No guides match these filters')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search guides' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(page).toHaveURL('/en/explore')
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(12)
})

test('mobile filters use an accessible bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en/explore')
  const trigger = page.getByRole('button', { name: /^Filters/ })
  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('radio', { name: 'Tokyo' }).check()
  await expect(trigger).toContainText('(1)')
  await sheet.getByRole('button', { name: /Show 13 results/ }).click()
  await expect(sheet).toBeHidden()
  await expect(trigger).toBeFocused()
})
```

- [ ] **Step 2: Run the Playwright spec and observe insufficient seeded inventory**

Run with the repository's local E2E environment:

```bash
pnpm --filter @kinnso/e2e exec playwright test explore-usability
```

Expected: FAIL because only one deterministic Tokyo guide exists and Most saved
is unavailable.

- [ ] **Step 3: Add twelve deterministic Tokyo guides**

Immediately after the existing R7 smoke guide upsert in `supabase/seed.sql`, add:

```sql
insert into public.guides
  (id, creator_id, creator_handle, creator_name, slug, title, summary, cover_url, city, status, saves_count, published_at)
select
  ('00000000-0000-0000-0000-' || lpad((800 + n)::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000701'::uuid,
  'r7-smoke-creator',
  'R7 Smoke Creator',
  'r7-explore-tokyo-' || lpad(n::text, 2, '0'),
  'R7 Explore Tokyo Guide ' || lpad(n::text, 2, '0'),
  'Deterministic Explore pagination guide ' || n || '.',
  null,
  'Tokyo',
  'published',
  n,
  now() - make_interval(days => n)
from generate_series(1, 12) as series(n)
on conflict (id) do update set
  creator_id = excluded.creator_id,
  creator_handle = excluded.creator_handle,
  creator_name = excluded.creator_name,
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  cover_url = excluded.cover_url,
  city = excluded.city,
  status = excluded.status,
  saves_count = excluded.saves_count,
  published_at = excluded.published_at;
```

Ensure the original smoke guide upsert also assigns
`saves_count = excluded.saves_count`, preventing stale local counts from making
the fixture nondeterministic.

- [ ] **Step 4: Reset local Supabase and rerun the E2E spec**

Run:

```bash
pnpm supabase db reset
pnpm --filter @kinnso/e2e exec playwright test explore-usability
```

Expected: 2 passed.

- [ ] **Step 5: Run existing smoke regression specs**

Run:

```bash
pnpm --filter @kinnso/e2e exec playwright test destinations-empty-states honesty funnel-smoke notfound
```

Expected: all selected existing specs PASS with the expanded published-guide
inventory.

- [ ] **Step 6: Commit the deterministic acceptance coverage**

```bash
git add supabase/seed.sql apps/e2e/specs/explore-usability.spec.ts
git commit -m "test(e2e): cover explore discovery journey"
```

---

### Task 7: Full R7.9 verification

**Files:**

- Verify only; modify a touched file only when a command exposes an R7.9 regression.

**Interfaces:**

- Consumes: all Tasks 1–6.
- Produces: evidence that R7.9 is typed, localized, static/ISR, browser-functional,
  and free of regressions in the touched surface.

- [ ] **Step 1: Run all focused web tests**

```bash
pnpm --filter web exec vitest run tests/explore.discovery.test.ts tests/kinnso.ExploreControls.test.tsx tests/kinnso.ExploreView.test.tsx tests/explore.host.test.tsx tests/i18n.locale-parity.test.ts tests/guides.queries.test.ts tests/destinations.queries.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run workspace type checking**

```bash
pnpm typecheck
```

Expected: all workspace typecheck tasks PASS, including `web` and
`@kinnso/e2e`.

- [ ] **Step 3: Run web lint**

```bash
pnpm --filter web lint
```

Expected: exit 0 with no new Explore warnings.

- [ ] **Step 4: Build the production web app and verify static output**

```bash
pnpm --filter web build
```

Expected:

- Build exits 0.
- `/[locale]/explore` is marked static/SSG (`●` or `○`), not dynamic (`ƒ`).
- No `searchParams` or Suspense CSR-bailout warning is emitted for Explore.

- [ ] **Step 5: Run the R7.9 and regression E2E suite**

```bash
pnpm --filter @kinnso/e2e exec playwright test explore-usability destinations-empty-states honesty funnel-smoke notfound
```

Expected: all selected Playwright tests PASS in Chromium.

- [ ] **Step 6: Review the complete branch diff**

```bash
git diff --check codex/r7-8-seo-metadata...HEAD
git status --short
git log --oneline codex/r7-8-seo-metadata..HEAD
```

Expected:

- `git diff --check` has no output.
- The worktree is clean.
- The log contains the R7.9 design, plan, and focused conventional commits only.

- [ ] **Step 7: Resolve any verification failure in its owning task**

If Steps 1–6 expose an R7.9 regression, return to the task that owns the failing
file, add the regression assertion to that task's focused test, rerun its exact
test command, and use that task's exact `git add` and commit command. If no
correction is required, do not create an empty verification commit.
