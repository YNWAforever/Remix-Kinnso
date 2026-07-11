# Phase R6B — Destinations Browse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/destinations` R1A placeholder with a real, ops-curated destinations
index and per-destination detail page that aggregates guides, bookable experiences, and
upcoming community sessions.

**Architecture:** A new `destinations` table (ops-curated, public-read-only via RLS) holds
`slug`/`name`/`hero_image_url`/`description`/`match_terms text[]`/`sort_order`/`status`.
`/destinations` lists published destinations ordered by `sort_order`; `/destinations/[slug]`
aggregates content by matching each destination's `match_terms` against `guides.city` /
`experiences.city` (ILIKE, reusing the existing `getGuidesForRegions` sanitize-then-`.or()`
technique verbatim, plus a new `getExperiencesForCities` sibling) and against
`community_sessions.destination_tags` (a brand-new-to-this-codebase array-overlap
`.overlaps()` query). `platform_stats()`'s `destinations` column switches from a raw
distinct-city count to `count(*) from destinations where status='published'`.

**Tech Stack:** Next.js 16 App Router (Server Components), Supabase Postgres + RLS, Vitest 4.

**Design spec:** `docs/superpowers/specs/2026-07-11-phase-r6b-destinations-browse-design.md`

**Known external dependency (read before executing Task 9):** PR #80 (Phase R6A — Saves &
Reviews) is still open as of this plan's writing. `ExperienceCard.tsx` /
`ExperienceCardData` and `PublicExperience.savesCount` only exist once that PR merges to
`main`. Every task in this plan except Task 9 is independent of R6A and can execute
immediately. Task 9 (the destination detail page's Experiences section) has an explicit
precondition step — do not skip it or attempt to work around it by duplicating R6A's
component/field into this branch early.

---

## Task 1: `destinations` table migration (schema + RLS + supporting index)

**Files:**
- Create: `supabase/migrations/20260709090000_r6b_destinations.sql`
- Test: `apps/web/tests/db.r6b-destinations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/db.r6b-destinations.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260709090000_r6b_destinations.sql'),
  'utf8',
)

describe('R6B destinations migration', () => {
  it('creates destinations with the locked column set and status CHECK', () => {
    expect(sql).toContain('create table public.destinations')
    expect(sql).toContain("status text not null default 'draft' check (status in ('draft','published'))")
    expect(sql).toContain('slug text not null unique')
    expect(sql).toContain("match_terms text[] not null default '{}'")
  })

  it('has a status+sort_order index for the published/ordered index-page query', () => {
    expect(sql).toContain('create index destinations_status_sort_idx on public.destinations (status, sort_order)')
  })

  it('has an updated_at trigger', () => {
    expect(sql).toMatch(/create trigger destinations_set_updated_at[\s\S]*execute function public\.set_updated_at\(\)/)
  })

  it('RLS: public read is published-only, with zero write grant to anon/authenticated', () => {
    expect(sql).toContain('alter table public.destinations enable row level security')
    expect(sql).toContain('revoke all on public.destinations from anon, authenticated')
    expect(sql).toContain('create policy destinations_public_read on public.destinations')
    expect(sql).toContain("using (status = 'published')")
    expect(sql).not.toContain('destinations_ops_all')
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.destinations/)
    expect(sql).toContain('grant select on public.destinations to anon, authenticated')
  })

  it('adds a GIN index on community_sessions.destination_tags for the overlap match query', () => {
    expect(sql).toContain('create index community_sessions_destination_tags_idx')
    expect(sql).toContain('on public.community_sessions using gin (destination_tags)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run db.r6b-destinations -v`
Expected: FAIL — `ENOENT` (migration file doesn't exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260709090000_r6b_destinations.sql
-- Phase R6B — ops-curated destinations table (D-R6B-2). Public SELECT of published rows
-- only; no insert/update/delete grant to anon/authenticated at all (D-R6B-4 — ops writes
-- directly via the Supabase table editor / service_role, same zero-write-grant shape as
-- booking_events / mission_verification_jobs — see supabase-default-acl-gotcha for why the
-- grant must be explicit rather than assumed).

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  hero_image_url text,
  description text,
  match_terms text[] not null default '{}',
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index destinations_status_sort_idx on public.destinations (status, sort_order);

create trigger destinations_set_updated_at
  before update on public.destinations
  for each row execute function public.set_updated_at();

alter table public.destinations enable row level security;
revoke all on public.destinations from anon, authenticated;

create policy destinations_public_read on public.destinations
  for select to anon, authenticated using (status = 'published');

-- No insert/update/delete policy for any role — ops writes directly via the
-- Supabase table editor / service_role only (D-R6B-4; no admin CRUD this phase).
grant select on public.destinations to anon, authenticated;

-- Supports the community_sessions.destination_tags && match_terms aggregate query used by
-- getSessionsForDestination (Task 4) — no index existed on this array column before this.
create index community_sessions_destination_tags_idx
  on public.community_sessions using gin (destination_tags);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run db.r6b-destinations -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Apply the migration live**

Confirm with the user before running (per this program's live-migration-apply discipline —
every apply needs its own fresh confirmation, never inferred from an earlier "proceed"):

```bash
supabase db query --linked -f supabase/migrations/20260709090000_r6b_destinations.sql
supabase migration repair --status applied --linked 20260709090000
```

Confirm the repair step separately from the apply step, even though they're back-to-back.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260709090000_r6b_destinations.sql apps/web/tests/db.r6b-destinations.test.ts
git commit -m "feat(db): destinations table + RLS + community_sessions destination_tags GIN index"
```

---

## Task 2: `platform_stats()` destinations-count migration (D-R6B-5)

**Files:**
- Create: `supabase/migrations/20260709100000_r6b_platform_stats_destinations_count.sql`
- Test: `apps/web/tests/db.r6b-platform-stats-destinations-count.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/db.r6b-platform-stats-destinations-count.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260709100000_r6b_platform_stats_destinations_count.sql'),
  'utf8',
)

describe('R6B platform_stats() destinations-count migration', () => {
  it('does not drop the function (column list is unchanged, only a body expression changes)', () => {
    expect(sql).not.toContain('drop function')
    expect(sql).toContain('create or replace function public.platform_stats()')
  })

  it('keeps the 5-column RETURNS TABLE list unchanged', () => {
    expect(sql).toContain('active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint, upcoming_sessions bigint')
  })

  it('counts published destinations rows instead of distinct guide cities', () => {
    expect(sql).toMatch(/destinations bigint,[\s\S]*select count\(\*\) from public\.destinations where status = 'published'/)
    expect(sql).not.toContain('count(distinct city) from public.guides')
  })

  it('re-establishes anon/authenticated EXECUTE grants explicitly', () => {
    expect(sql).toContain('revoke all on function public.platform_stats() from public, anon')
    expect(sql).toContain('grant execute on function public.platform_stats() to anon, authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run db.r6b-platform-stats-destinations-count -v`
Expected: FAIL — `ENOENT`

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260709100000_r6b_platform_stats_destinations_count.sql
-- D-R6B-5: switch platform_stats()'s `destinations` column from a raw distinct-city count
-- over `guides` to a count of the new curated `destinations` table. The RETURNS TABLE
-- column list is unchanged (still 5 columns, same names/types) so a plain CREATE OR
-- REPLACE is correct here — DROP FUNCTION is only required when the column list itself
-- changes (see the R3C/R5 precedent in this same function's history), not when only one
-- column's body expression changes.

create or replace function public.platform_stats()
returns table (active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint, upcoming_sessions bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.creators
       where status = 'active' and handle is not null and public_profile is not null),
    (select count(*) from public.guides where status = 'published'),
    (select count(*) from public.destinations where status = 'published'),
    app_private.count_completed_bookings(),
    (select count(*) from public.community_sessions where status in ('scheduled','live'));
$$;

revoke all on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run db.r6b-platform-stats-destinations-count -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Apply the migration live**

Confirm with the user before running (separate confirmation from Task 1's apply/repair):

```bash
supabase db query --linked -f supabase/migrations/20260709100000_r6b_platform_stats_destinations_count.sql
supabase migration repair --status applied --linked 20260709100000
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260709100000_r6b_platform_stats_destinations_count.sql apps/web/tests/db.r6b-platform-stats-destinations-count.test.ts
git commit -m "feat(db): platform_stats() destinations column counts curated destinations table"
```

---

## Task 3: `destinations` core queries (list, by-slug, sitemap)

**Files:**
- Create: `apps/web/lib/destinations/queries.ts`
- Test: `apps/web/tests/destinations.queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/destinations.queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ list: [] as unknown[], single: null as unknown }))
const orderSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: (col: string, opts: unknown) => { orderSpy(col, opts); return builder },
        maybeSingle: async () => ({ data: state.single }),
        then: (onF: (v: { data: unknown }) => unknown) =>
          Promise.resolve({ data: state.list }).then(onF),
      }
      return builder
    },
  }),
}))

import { getPublishedDestinations, getDestinationBySlug, getDestinationsForSitemap } from '@/lib/destinations/queries'

const row = {
  slug: 'tokyo', name: 'Tokyo', hero_image_url: 'https://example.com/tokyo.jpg',
  description: 'Neon nights and quiet shrines.', match_terms: ['Tokyo', 'Shibuya', 'Shinjuku'],
}

beforeEach(() => {
  state.list = []
  state.single = null
  orderSpy.mockClear()
})

describe('getPublishedDestinations', () => {
  it('maps published rows ordered by sort_order ascending', async () => {
    state.list = [row]
    const result = await getPublishedDestinations()
    expect(result).toEqual([{
      slug: 'tokyo', name: 'Tokyo', heroImageUrl: 'https://example.com/tokyo.jpg',
      description: 'Neon nights and quiet shrines.', matchTerms: ['Tokyo', 'Shibuya', 'Shinjuku'],
    }])
    expect(orderSpy).toHaveBeenCalledWith('sort_order', { ascending: true })
  })

  it('returns [] when there are no published destinations', async () => {
    state.list = []
    expect(await getPublishedDestinations()).toEqual([])
  })

  it('defaults matchTerms to [] when the row has none', async () => {
    state.list = [{ ...row, match_terms: null }]
    const result = await getPublishedDestinations()
    expect(result[0].matchTerms).toEqual([])
  })
})

describe('getDestinationBySlug', () => {
  it('returns the mapped destination when a published row exists', async () => {
    state.single = row
    const dest = await getDestinationBySlug('tokyo')
    expect(dest?.name).toBe('Tokyo')
  })

  it('returns null when no row matches', async () => {
    state.single = null
    expect(await getDestinationBySlug('nowhere')).toBeNull()
  })
})

describe('getDestinationsForSitemap', () => {
  it('returns published slugs with a lastmod', async () => {
    state.list = [{ slug: 'tokyo', published_at: '2026-07-01T00:00:00Z' }]
    expect(await getDestinationsForSitemap()).toEqual([{ slug: 'tokyo', lastmod: '2026-07-01T00:00:00Z' }])
  })
  it('returns [] when there are no published destinations', async () => {
    state.list = []
    expect(await getDestinationsForSitemap()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run destinations.queries -v`
Expected: FAIL — cannot find module `@/lib/destinations/queries`

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/destinations/queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export interface Destination {
  slug: string
  name: string
  heroImageUrl: string | null
  description: string | null
  matchTerms: string[]
}

const DESTINATION_COLUMNS = 'slug, name, hero_image_url, description, match_terms'

interface DestinationRow {
  slug: string
  name: string
  hero_image_url: string | null
  description: string | null
  match_terms: string[] | null
}

function mapRowToDestination(r: DestinationRow): Destination {
  return {
    slug: r.slug,
    name: r.name,
    heroImageUrl: r.hero_image_url,
    description: r.description,
    matchTerms: r.match_terms ?? [],
  }
}

export async function getPublishedDestinations(): Promise<Destination[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('destinations')
    .select(DESTINATION_COLUMNS)
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
  return (data ?? []).map(mapRowToDestination)
}

export async function getDestinationBySlug(slug: string): Promise<Destination | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('destinations')
    .select(DESTINATION_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data ? mapRowToDestination(data) : null
}

export async function getDestinationsForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('destinations')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    lastmod: (r.published_at as string | null) ?? null,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run destinations.queries -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/destinations/queries.ts apps/web/tests/destinations.queries.test.ts
git commit -m "feat(web): destinations core queries (list, by-slug, sitemap)"
```

---

## Task 4: Destination-matching queries (experiences + sessions)

`getGuidesForRegions` (`apps/web/lib/guides/queries.ts`) already accepts a `string[]` of
region terms and needs no changes — a destination's `matchTerms` can be passed to it
directly. This task adds the two siblings that don't exist yet: an experiences-side
multi-term ILIKE match, and the sessions-side array-overlap match (the first `.overlaps()`
call anywhere in this codebase — confirmed via repo-wide grep during design research).

**Files:**
- Modify: `apps/web/lib/experiences/public-queries.ts`
- Modify: `apps/web/lib/sessions/public-queries.ts`
- Test: `apps/web/tests/experiences.public-queries.test.ts`
- Test: `apps/web/tests/sessions.public-queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/experiences.public-queries.test.ts` (below the existing
`getExperiencesForCity` describe block, using the same manual-chain mocking style already
in this file):

```ts
describe('getExperiencesForCities', () => {
  it('returns [] for an empty or noise-only term list without querying', async () => {
    expect(await getExperiencesForCities([])).toEqual([])
    expect(await getExperiencesForCities(['', ' ', 'x'])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('builds a sanitized ilike-or filter across all given terms', async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const order = vi.fn(() => ({ limit }))
    const or = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ or }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq })) })

    await getExperiencesForCities(['Tokyo', 'Shibuya, (Ward)'])
    expect(or).toHaveBeenCalledWith('city.ilike.%Tokyo%,city.ilike.%Shibuya Ward%')
    expect(limit).toHaveBeenCalledWith(6)
  })

  it('never throws — degrades to [] on query failure', async () => {
    fromMock.mockImplementation(() => { throw new Error('boom') })
    expect(await getExperiencesForCities(['Tokyo'])).toEqual([])
  })
})
```

Add `getExperiencesForCities` to this file's existing import line (line 9):

```ts
import { getExperienceBySlug, getExperiencesForCity, getExperiencesForCities, getExperiencesForSitemap, listPublishedExperiencesForMerchant } from '@/lib/experiences/public-queries'
```

Append to `apps/web/tests/sessions.public-queries.test.ts` (below the existing
`getUpcomingSessionsList`/`getReplaySessions` describe blocks). First add `'overlaps'` to
this file's existing `chain()` helper's `methods` array (currently
`['select', 'in', 'eq', 'not', 'order', 'limit', 'maybeSingle']`):

```ts
const methods = ['select', 'in', 'eq', 'not', 'order', 'limit', 'maybeSingle', 'overlaps']
```

Then add:

```ts
describe('getSessionsForDestination', () => {
  it('returns [] without querying when matchTerms is empty', async () => {
    expect(await getSessionsForDestination([])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('queries scheduled+live sessions overlapping the given match terms, then attaches host', async () => {
    const sessionsChain = chain({ data: [sessionRow], error: null })
    const creatorsChain = chain({ data: [creatorRow], error: null })
    fromMock.mockImplementation((table: string) => (table === 'community_sessions' ? sessionsChain : creatorsChain))

    const result = await getSessionsForDestination(['Tokyo'])
    expect(sessionsChain.in).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    expect(sessionsChain.overlaps).toHaveBeenCalledWith('destination_tags', ['Tokyo'])
    expect(result[0].host).toEqual({ handle: 'sora', displayName: 'Sora' })
  })

  it('never throws — degrades to [] on query failure', async () => {
    fromMock.mockImplementation(() => { throw new Error('boom') })
    expect(await getSessionsForDestination(['Tokyo'])).toEqual([])
  })
})
```

Add `getSessionsForDestination` to this file's existing import (line 7):

```ts
import {
  getUpcomingSessionsList, getReplaySessions, getSessionBySlug, getSessionsForSitemap, getSessionsForDestination,
} from '@/lib/sessions/public-queries'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run experiences.public-queries sessions.public-queries -v`
Expected: FAIL — `getExperiencesForCities`/`getSessionsForDestination` are not exported

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/experiences/public-queries.ts` (after `getExperiencesForCity`,
reusing the file's existing private `EXP_COLUMNS`/`ExpRow`/`toDomain`):

```ts
/**
 * Same as getExperiencesForCity but matches ANY of several sanitized terms via .or() —
 * mirrors getGuidesForRegions's array-of-terms shape (apps/web/lib/guides/queries.ts) for
 * destination pages whose match_terms can include neighborhood aliases alongside the
 * destination's own name. Reads never crash the destination page — failures degrade to
 * [], same stance as getExperiencesForCity.
 */
export async function getExperiencesForCities(cities: string[], limit = 6): Promise<PublicExperience[]> {
  const clean = [...new Set(cities
    .map((c) => c.normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim())
    .filter((c) => c.length >= 2))]
  if (clean.length === 0) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('experiences')
      .select(EXP_COLUMNS)
      .eq('status', 'published')
      .or(clean.map((c) => `city.ilike.%${c}%`).join(','))
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map((r) => toDomain(r as unknown as ExpRow, { slug: '', companyName: '' }))
  } catch {
    return []
  }
}
```

Append to `apps/web/lib/sessions/public-queries.ts` (after `getUpcomingSessionsList`,
reusing the file's existing private `SESSION_COLUMNS`/`SessionRow`/`attachHost`):

```ts
/**
 * Upcoming sessions tagged for a destination (array-overlap on destination_tags). First
 * .overlaps() query in this codebase — confirmed via repo-wide grep during R6B design
 * research that no existing call site uses this operator, so there is no in-repo example
 * to mirror the exact shape from. Reads never crash the destination page — failures
 * degrade to [], same stance as getGuidesForRegions/getExperiencesForCity.
 */
export async function getSessionsForDestination(matchTerms: string[], limit = 6): Promise<PublicSession[]> {
  if (matchTerms.length === 0) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data, error } = await supabase
      .from('community_sessions')
      .select(SESSION_COLUMNS)
      .in('status', ['scheduled', 'live'])
      .overlaps('destination_tags', matchTerms)
      .order('starts_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    return attachHost(supabase, (data ?? []) as unknown as SessionRow[])
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run experiences.public-queries sessions.public-queries -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/experiences/public-queries.ts apps/web/lib/sessions/public-queries.ts apps/web/tests/experiences.public-queries.test.ts apps/web/tests/sessions.public-queries.test.ts
git commit -m "feat(web): destination-matching queries — getExperiencesForCities, getSessionsForDestination"
```

---

## Task 5: i18n — add the new `destinations` message group (7 locales)

This is a pure addition — `destinationsSoon` is left in place and still used by the
not-yet-rewritten placeholder page. Removing it happens in Task 7, in the same task that
stops consuming it, to avoid the exact "component references a group before it lands"
ordering break this program's R5 phase hit (see the plan header's dependency note and the
`i18n translation fidelity` memory on getting translations right the first time, not just
key-complete).

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`

- [ ] **Step 1: Add the interface block to `en.ts`**

In `apps/web/lib/i18n/messages/en.ts`, find the `sessions: { ... }` interface block (it
ends with `typeMerchantSpotlight: string; typeNewCreatorIntro: string\n  }` immediately
before `sessionsAdmin: {`). Insert this new block between them:

```ts
  destinations: {
    eyebrow: string; title: string; body: string; empty: string
    guidesHeading: string; emptyGuides: string
    experiencesHeading: string; emptyExperiences: string
    sessionsHeading: string; emptySessions: string
  }
```

- [ ] **Step 2: Add the values block to `en.ts`**

Find the `sessions: { ... }` values block (ends with `typeNewCreatorIntro: 'New creator
intro',\n  },` immediately before `sessionsAdmin: {`). Insert this new block between them:

```ts
  destinations: {
    eyebrow: 'Destinations',
    title: 'Every city, told by the people who know it.',
    body: 'Browse curated destinations — the guides, bookable experiences, and live sessions our creators have covered so far.',
    empty: 'New destinations are on the way — check back soon.',
    guidesHeading: 'Guides',
    emptyGuides: 'No guides for this destination yet.',
    experiencesHeading: 'Experiences',
    emptyExperiences: 'No bookable experiences here yet.',
    sessionsHeading: 'Upcoming sessions',
    emptySessions: 'No sessions scheduled for this destination right now.',
  },
```

- [ ] **Step 3: Add the values block to the other 6 locale files**

Each locale file has only a values block (no interface — only `en.ts` carries
`interface Messages`). In each file, insert the matching block at the same location (right
before that file's own `sessionsAdmin: {` entry).

`apps/web/lib/i18n/messages/zh-hk.ts`:
```ts
  destinations: {
    eyebrow: '目的地',
    title: '每個城市，由最熟路嘅人講畀你聽。',
    body: '瀏覽精選目的地——睇吓我哋創作者目前為每個地方整理咗嘅攻略、可預約體驗同直播活動。',
    empty: '更多目的地即將上線，記得返嚟睇吓。',
    guidesHeading: '攻略',
    emptyGuides: '呢個目的地暫時未有攻略。',
    experiencesHeading: '體驗',
    emptyExperiences: '呢度暫時未有可預約嘅體驗。',
    sessionsHeading: '即將舉行嘅活動',
    emptySessions: '呢個目的地暫時未有安排活動。',
  },
```

`apps/web/lib/i18n/messages/zh-tw.ts`:
```ts
  destinations: {
    eyebrow: '目的地',
    title: '每座城市，由最懂它的人來說。',
    body: '瀏覽精選目的地——查看我們的創作者目前為每個地方整理的攻略、可預約體驗與直播活動。',
    empty: '更多目的地即將上線，敬請期待。',
    guidesHeading: '攻略',
    emptyGuides: '這個目的地目前還沒有攻略。',
    experiencesHeading: '體驗',
    emptyExperiences: '這裡目前還沒有可預約的體驗。',
    sessionsHeading: '即將舉行的活動',
    emptySessions: '這個目的地目前還沒有安排活動。',
  },
```

`apps/web/lib/i18n/messages/zh-cn.ts`:
```ts
  destinations: {
    eyebrow: '目的地',
    title: '每座城市，都由最懂它的人来讲述。',
    body: '浏览精选目的地——查看我们的创作者目前为每个地方整理的攻略、可预订体验和直播活动。',
    empty: '更多目的地即将上线，敬请期待。',
    guidesHeading: '攻略',
    emptyGuides: '这个目的地暂时还没有攻略。',
    experiencesHeading: '体验',
    emptyExperiences: '这里暂时还没有可预订的体验。',
    sessionsHeading: '即将举行的活动',
    emptySessions: '这个目的地暂时还没有安排活动。',
  },
```

`apps/web/lib/i18n/messages/ja.ts`:
```ts
  destinations: {
    eyebrow: '旅行先',
    title: 'その街を一番知る人が、その街を語る。',
    body: '厳選された旅行先を見てみましょう——クリエイターがこれまでにまとめたガイド、予約できる体験、ライブセッションをご覧いただけます。',
    empty: '新しい旅行先を準備中です。近日公開をお楽しみに。',
    guidesHeading: 'ガイド',
    emptyGuides: 'この旅行先のガイドはまだありません。',
    experiencesHeading: '体験',
    emptyExperiences: 'この旅行先で予約できる体験はまだありません。',
    sessionsHeading: '開催予定のセッション',
    emptySessions: 'この旅行先で予定されているセッションは現在ありません。',
  },
```

`apps/web/lib/i18n/messages/ko.ts`:
```ts
  destinations: {
    eyebrow: '여행지',
    title: '그 도시를 가장 잘 아는 사람이 들려주는 이야기.',
    body: '엄선된 여행지를 둘러보세요 — 크리에이터들이 지금까지 정리한 가이드, 예약 가능한 체험, 라이브 세션을 확인할 수 있어요.',
    empty: '새로운 여행지를 준비 중이에요. 곧 다시 확인해 주세요.',
    guidesHeading: '가이드',
    emptyGuides: '이 여행지의 가이드가 아직 없어요.',
    experiencesHeading: '체험',
    emptyExperiences: '이 여행지에서 예약 가능한 체험이 아직 없어요.',
    sessionsHeading: '예정된 세션',
    emptySessions: '이 여행지에서 예정된 세션이 현재 없어요.',
  },
```

`apps/web/lib/i18n/messages/th.ts`:
```ts
  destinations: {
    eyebrow: 'จุดหมาย',
    title: 'ทุกเมือง เล่าโดยคนที่รู้จักมันดีที่สุด',
    body: 'สำรวจจุดหมายที่คัดสรรมาแล้ว — ดูไกด์ ประสบการณ์ที่จองได้ และเซสชันสดที่ครีเอเตอร์ของเรารวบรวมไว้จนถึงตอนนี้',
    empty: 'จุดหมายใหม่ ๆ กำลังจะมา แวะมาดูอีกครั้งเร็ว ๆ นี้',
    guidesHeading: 'ไกด์',
    emptyGuides: 'จุดหมายนี้ยังไม่มีไกด์',
    experiencesHeading: 'ประสบการณ์',
    emptyExperiences: 'ที่นี่ยังไม่มีประสบการณ์ที่จองได้',
    sessionsHeading: 'เซสชันที่จะถึงนี้',
    emptySessions: 'ขณะนี้ยังไม่มีเซสชันที่กำหนดไว้สำหรับจุดหมายนี้',
  },
```

- [ ] **Step 4: Verify typecheck and locale parity**

Run: `pnpm --filter web typecheck`
Expected: PASS — every locale file's object literal satisfies the new `destinations` field
of `interface Messages`.

Run: `cd apps/web && npx vitest run i18n.locale-parity -v`
Expected: PASS — `destinations` now appears symmetrically in all 7 locale files (this test
needs no code changes; it auto-derives its group list from `en.ts`'s own keys).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "i18n(web): add destinations message group across all 7 locales"
```

---

## Task 6: SEO plumbing — `MARKETING_PATHS` + `buildDestinationMetadata`

**Files:**
- Modify: `apps/web/lib/seo/routes.ts`
- Modify: `apps/web/lib/seo/metadata.ts`
- Modify: `apps/web/tests/metadata.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/metadata.test.ts` (below the existing `buildGuideMetadata`
describe block), and add `buildDestinationMetadata` to this file's existing import list
(line 2-6):

```ts
describe('buildDestinationMetadata', () => {
  it('og:type=website, self-canonical, 7 hreflang under /destinations/<slug>', () => {
    const m = buildDestinationMetadata({ slug: 'tokyo', locale: 'en', title: 'Tokyo', description: 'Neon nights.' })
    expect(m.title).toBe('Tokyo')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/destinations/tokyo`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect((m.openGraph as any).type).toBe('website')
    expect((m.robots as any).index).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run metadata.test -v`
Expected: FAIL — `buildDestinationMetadata` is not exported

- [ ] **Step 3: Write the implementation**

In `apps/web/lib/seo/routes.ts`, add `/destinations` to `MARKETING_PATHS`:

```ts
export const MARKETING_PATHS = [
  '', '/explore', '/creators', '/agent', '/about', '/contact', '/merchants', '/legal/creator-terms', '/for-creators', '/for-merchants', '/sessions', '/destinations',
] as const
```

In `apps/web/lib/seo/metadata.ts`, add `buildDestinationMetadata` after
`buildSessionMetadata` (end of file):

```ts
export function buildDestinationMetadata(i: { slug: string; locale: Locale; title: string; description: string }): Metadata {
  const { canonical, languages } = hreflangFor((l) => abs(l, `/destinations/${i.slug}`), i.locale, LOCALES)
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'website', url: canonical, title: i.title, description: i.description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale],
    },
    twitter: { card: 'summary_large_image', title: i.title, description: i.description },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run metadata.test -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/seo/routes.ts apps/web/lib/seo/metadata.ts apps/web/tests/metadata.test.ts
git commit -m "feat(web): add /destinations to MARKETING_PATHS + buildDestinationMetadata"
```

---

## Task 7: `/destinations` index page — real data, indexable, replaces the placeholder

This task removes `destinationsSoon` from all 7 locale files (nothing will reference it
after this task lands) in the same commit that stops consuming it.

**Files:**
- Create: `apps/web/components/kinnso/pages/DestinationsIndexView.tsx`
- Modify: `apps/web/app/[locale]/destinations/page.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts` (remove `destinationsSoon`)
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (remove `destinationsSoon`)
- Modify: `apps/web/tests/destinations.host.test.tsx` (full rewrite)

- [ ] **Step 1: Write the failing test (full rewrite of the existing placeholder test)**

```tsx
// apps/web/tests/destinations.host.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getPublishedDestinationsMock } = vi.hoisted(() => ({
  getPublishedDestinationsMock: vi.fn(async (): Promise<import('@/lib/destinations/queries').Destination[]> => []),
}))
vi.mock('@/lib/destinations/queries', () => ({ getPublishedDestinations: getPublishedDestinationsMock }))

import DestinationsPage, { generateMetadata } from '@/app/[locale]/destinations/page'
import { MARKETING_PATHS } from '@/lib/seo/routes'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/destinations host', () => {
  it('renders published destinations as cards linking to their detail page', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([
      { slug: 'tokyo', name: 'Tokyo', heroImageUrl: 'https://x/tokyo.jpg', description: 'Neon nights.', matchTerms: ['Tokyo'] },
    ])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.destinations.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Tokyo/ }).getAttribute('href')).toBe('/en/destinations/tokyo')
  })

  it('shows the empty state when there are no published destinations', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.destinations.empty)).toBeTruthy()
  })

  it('is indexable and listed in MARKETING_PATHS', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.robots).toEqual({ index: true, follow: true, 'max-image-preview': 'large' })
    expect(MARKETING_PATHS).toContain('/destinations')
  })

  it('404s unknown locales', async () => {
    await expect(DestinationsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run destinations.host -v`
Expected: FAIL — page still renders the old placeholder copy/CTA, `en.destinations` is
undefined until Step 3 lands.

- [ ] **Step 3: Write `DestinationsIndexView`**

```tsx
// apps/web/components/kinnso/pages/DestinationsIndexView.tsx
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import type { Destination } from '@/lib/destinations/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function DestinationsIndexView({
  locale, t, destinations,
}: {
  locale: Locale
  t: Messages['destinations']
  destinations: Destination[]
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        {destinations.length === 0 ? (
          <p className="text-kinnso-ink/70">{t.empty}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {destinations.map((d) => (
              <Link key={d.slug} href={`/${locale}/destinations/${d.slug}`} className="group">
                <EditorialCard
                  media={d.heroImageUrl ? (
                    <img src={d.heroImageUrl} alt={d.name} width={640} height={480} loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  ) : undefined}
                  title={d.name}
                >
                  {d.description}
                </EditorialCard>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  )
}

export default DestinationsIndexView
```

- [ ] **Step 4: Rewrite the page**

```tsx
// apps/web/app/[locale]/destinations/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { getPublishedDestinations } from '@/lib/destinations/queries'
import { DestinationsIndexView } from '@/components/kinnso/pages/DestinationsIndexView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = (await getDictionary(locale as Locale)).destinations
  return buildPageMetadata({ path: '/destinations', locale: locale as Locale, title: t.title, description: t.body })
}

export default async function DestinationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = (await getDictionary(locale as Locale)).destinations
  const destinations = await getPublishedDestinations()
  return <DestinationsIndexView locale={locale as Locale} t={t} destinations={destinations} />
}
```

- [ ] **Step 5: Remove `destinationsSoon` from all 7 locale files**

In `apps/web/lib/i18n/messages/en.ts`, delete the interface line
`destinationsSoon: { eyebrow: string; title: string; body: string; cta: string }` and the
values block:
```ts
  destinationsSoon: {
    eyebrow: 'Destinations',
    title: 'Every city, told by the people who know it.',
    body: 'We are stitching KINNSO guides and stories into a browsable atlas of destinations — the food streets, the side alleys, the day trips locals actually take. While we finish it, our destination stories are the best place to start.',
    cta: 'Read destination stories',
  },
```

In each of `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`, delete that file's
own `destinationsSoon: { ... }` values block (the 6-line block with that locale's
`eyebrow`/`title`/`body`/`cta` strings, already quoted in full in the design research —
search for the literal key `destinationsSoon:` in each file, it appears exactly once).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx vitest run destinations.host -v`
Expected: PASS (4 tests)

Run: `pnpm --filter web typecheck`
Expected: PASS — confirms nothing else references `destinationsSoon` or `Messages['destinationsSoon']`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/kinnso/pages/DestinationsIndexView.tsx "apps/web/app/[locale]/destinations/page.tsx" apps/web/lib/i18n/messages/*.ts apps/web/tests/destinations.host.test.tsx
git commit -m "feat(web): real /destinations index — replaces R1A placeholder, indexable, destinationsSoon removed"
```

---

## Task 8: `/destinations/[slug]` detail page — hero + Guides + Sessions sections

The Experiences section is intentionally deferred to Task 9 (see the plan header's
dependency note) — this task ships a complete, real, two-section page rather than a
partial/placeholder three-section one.

**Files:**
- Create: `apps/web/components/kinnso/pages/DestinationDetailView.tsx`
- Create: `apps/web/app/[locale]/destinations/[slug]/page.tsx`
- Create: `apps/web/tests/destinations.slug.host.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/destinations.slug.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getDestinationBySlugMock, getGuidesForRegionsMock, getSessionsForDestinationMock } = vi.hoisted(() => ({
  getDestinationBySlugMock: vi.fn(async (): Promise<import('@/lib/destinations/queries').Destination | null> => null),
  getGuidesForRegionsMock: vi.fn(async (): Promise<import('@/lib/guides/types').Guide[]> => []),
  getSessionsForDestinationMock: vi.fn(async (): Promise<import('@/lib/sessions/public-queries').PublicSession[]> => []),
}))
vi.mock('@/lib/destinations/queries', () => ({ getDestinationBySlug: getDestinationBySlugMock }))
vi.mock('@/lib/guides/queries', () => ({ getGuidesForRegions: getGuidesForRegionsMock }))
vi.mock('@/lib/sessions/public-queries', () => ({ getSessionsForDestination: getSessionsForDestinationMock }))

import DestinationDetailPage from '@/app/[locale]/destinations/[slug]/page'
import en from '@/lib/i18n/messages/en'

const destination = {
  slug: 'tokyo', name: 'Tokyo', heroImageUrl: null,
  description: 'Neon nights and quiet shrines.', matchTerms: ['Tokyo'],
}

describe('/[locale]/destinations/[slug] detail host', () => {
  it('404s when the destination does not exist', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(null)
    await expect(
      DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'nowhere' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the destination hero and its guides', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getGuidesForRegionsMock.mockResolvedValueOnce([
      { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Tokyo', saves: 3, creatorHandle: 'teafan' },
    ])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Tokyo' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Kyoto Tea Houses/ }).getAttribute('href')).toBe('/en/g/kyoto-tea')
  })

  it('shows the empty-guides and empty-sessions copy when both are empty', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByText(en.destinations.emptyGuides)).toBeTruthy()
    expect(screen.getByText(en.destinations.emptySessions)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run destinations.slug.host -v`
Expected: FAIL — route/module don't exist yet

- [ ] **Step 3: Write `DestinationDetailView`**

```tsx
// apps/web/components/kinnso/pages/DestinationDetailView.tsx
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import GuideCard from '@/components/kinnso/GuideCard'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

function SessionCard({ locale, session }: { locale: Locale; session: PublicSession }) {
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <Link href={`/${locale}/sessions/${session.slug}`} className="group">
      <EditorialCard kicker={dateTimeFmt.format(new Date(session.startsAt))} title={session.title}>
        {session.host ? `@${session.host.handle}` : null}
      </EditorialCard>
    </Link>
  )
}

export function DestinationDetailView({
  locale, t, destination, guides, sessions, savesLabel,
}: {
  locale: Locale
  t: Messages['destinations']
  destination: Destination
  guides: Guide[]
  sessions: PublicSession[]
  savesLabel: string
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{destination.name}</h1>
          {destination.description ? (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{destination.description}</p>
          ) : null}
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.guidesHeading}</h2>
        {guides.length === 0 ? (
          <p className="mt-6 text-kinnso-ink/70">{t.emptyGuides}</p>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {guides.map((g) => <GuideCard key={g.slug} g={g} locale={locale} savesLabel={savesLabel} />)}
          </div>
        )}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.sessionsHeading}</h2>
        {sessions.length === 0 ? (
          <p className="mt-6 text-kinnso-ink/70">{t.emptySessions}</p>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {sessions.map((s) => <SessionCard key={s.id} locale={locale} session={s} />)}
          </div>
        )}
      </SectionShell>
    </div>
  )
}

export default DestinationDetailView
```

- [ ] **Step 4: Write the page**

```tsx
// apps/web/app/[locale]/destinations/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getDestinationBySlug } from '@/lib/destinations/queries'
import { getGuidesForRegions } from '@/lib/guides/queries'
import { getSessionsForDestination } from '@/lib/sessions/public-queries'
import { buildDestinationMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { DestinationDetailView } from '@/components/kinnso/pages/DestinationDetailView'

export function generateStaticParams() {
  // Destinations are DB-only; resolve on demand (dynamicParams defaults to true) — same
  // choice as /g/[slug] and /experiences/[slug].
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const destination = await getDestinationBySlug(slug)
  if (!destination) return { title: 'Destination not found', robots: { index: false, follow: false } }
  return buildDestinationMetadata({
    slug, locale: locale as Locale, title: destination.name,
    description: destination.description ?? `Guides, experiences, and sessions for ${destination.name}.`,
  })
}

export default async function DestinationDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const destination = await getDestinationBySlug(slug)
  if (!destination) notFound()

  const messages = await getDictionary(locale as Locale)
  const t = messages.destinations
  const [guides, sessions] = await Promise.all([
    getGuidesForRegions(destination.matchTerms),
    getSessionsForDestination(destination.matchTerms),
  ])

  const canonical = `${SITE_URL}/${locale}/destinations/${slug}`
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: t.eyebrow, url: `${SITE_URL}/${locale}/destinations` },
      { name: destination.name, url: canonical },
    ]),
  ]

  return (
    <>
      <JsonLd data={ld} />
      <DestinationDetailView
        locale={locale as Locale}
        t={t}
        destination={destination}
        guides={guides}
        sessions={sessions}
        savesLabel={messages.explore.savesLabel}
      />
    </>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run destinations.slug.host -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/DestinationDetailView.tsx "apps/web/app/[locale]/destinations/[slug]/page.tsx" apps/web/tests/destinations.slug.host.test.tsx
git commit -m "feat(web): /destinations/[slug] detail page — hero, guides, upcoming sessions"
```

---

## Task 9: `/destinations/[slug]` — Experiences section (gated on PR #80 / R6A merging)

**Precondition — do this before writing any code in this task:**

```bash
gh pr view 80 --json state,mergedAt
```

- If `state` is not `MERGED`: **stop here.** Report to the user that Task 9 is blocked on
  PR #80 (Phase R6A — Saves & Reviews) merging to `main`, since `ExperienceCard.tsx` /
  `ExperienceCardData` and `PublicExperience.savesCount` don't exist on `main` (or on this
  `feat/revision-r6b` branch) until it does. Do not port a duplicate copy of R6A's
  component or field onto this branch to unblock yourself — wait for the real merge, or
  ask the user how they want to sequence it.
- If `state` is `MERGED`: bring the branch up to date before continuing —
  ```bash
  git fetch origin
  git merge origin/main
  ```
  This branch and R6A modify one shared file (`apps/web/lib/experiences/public-queries.ts`
  — R6A adds `savesCount`/`saves_count`; R6B's Task 4 added `getExperiencesForCities`).
  Both are pure additions in different parts of the file, so a plain git merge should
  resolve cleanly; if git reports a conflict in that file, resolve it by keeping both
  additions (do not drop either side).

**Files:**
- Modify: `apps/web/components/kinnso/pages/DestinationDetailView.tsx`
- Modify: `apps/web/app/[locale]/destinations/[slug]/page.tsx`
- Modify: `apps/web/tests/destinations.slug.host.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/destinations.slug.host.test.tsx`:

```ts
// add to the vi.hoisted() block:
getExperiencesForCitiesMock: vi.fn(async (): Promise<import('@/lib/experiences/public-queries').PublicExperience[]> => []),
// add its own vi.mock:
vi.mock('@/lib/experiences/public-queries', () => ({ getExperiencesForCities: getExperiencesForCitiesMock }))
```

```tsx
it('renders the destination experiences section', async () => {
  getDestinationBySlugMock.mockResolvedValueOnce(destination)
  getExperiencesForCitiesMock.mockResolvedValueOnce([
    {
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
      city: 'Tokyo', priceAmount: 12000, currency: 'JPY', durationMinutes: null, coverUrl: null,
      publishedAt: '2026-07-01T00:00:00Z', savesCount: 5, merchant: { slug: '', companyName: '' },
    },
  ])
  const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
  render(ui)
  expect(screen.getByRole('link', { name: /Sunset junk boat tour/ }).getAttribute('href')).toBe('/en/experiences/sunset-tour')
})

it('shows the empty-experiences copy when there are none', async () => {
  getDestinationBySlugMock.mockResolvedValueOnce(destination)
  const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
  render(ui)
  expect(screen.getByText(en.destinations.emptyExperiences)).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run destinations.slug.host -v`
Expected: FAIL — `DestinationDetailView` doesn't accept an `experiences` prop yet

- [ ] **Step 3: Update `DestinationDetailView`**

Add the import and prop, and a third section, in
`apps/web/components/kinnso/pages/DestinationDetailView.tsx`:

```tsx
import ExperienceCard, { type ExperienceCardData } from '@/components/kinnso/ExperienceCard'
```

Extend the props type:

```tsx
export function DestinationDetailView({
  locale, t, destination, guides, experiences, sessions, savesLabel,
}: {
  locale: Locale
  t: Messages['destinations']
  destination: Destination
  guides: Guide[]
  experiences: ExperienceCardData[]
  sessions: PublicSession[]
  savesLabel: string
}) {
```

Add the section (between the guides section and the sessions section):

```tsx
      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.experiencesHeading}</h2>
        {experiences.length === 0 ? (
          <p className="mt-6 text-kinnso-ink/70">{t.emptyExperiences}</p>
        ) : (
          <div className="mt-8 grid gap-4">
            {experiences.map((e) => (
              <ExperienceCard key={e.slug} experience={e} locale={locale} savesLabel={savesLabel} />
            ))}
          </div>
        )}
      </SectionShell>
```

- [ ] **Step 4: Update the page**

In `apps/web/app/[locale]/destinations/[slug]/page.tsx`:

```tsx
import { getExperiencesForCities } from '@/lib/experiences/public-queries'
import type { ExperienceCardData } from '@/components/kinnso/ExperienceCard'
```

Replace the `Promise.all` and add the adapter:

```tsx
  const [guides, experiencesRaw, sessions] = await Promise.all([
    getGuidesForRegions(destination.matchTerms),
    getExperiencesForCities(destination.matchTerms),
    getSessionsForDestination(destination.matchTerms),
  ])
  const experiences: ExperienceCardData[] = experiencesRaw.map((e) => ({
    slug: e.slug, title: e.title, city: e.city,
    priceAmount: e.priceAmount, currency: e.currency,
    coverUrl: e.coverUrl, savesCount: e.savesCount,
  }))
```

Pass `experiences` to the view:

```tsx
      <DestinationDetailView
        locale={locale as Locale}
        t={t}
        destination={destination}
        guides={guides}
        experiences={experiences}
        sessions={sessions}
        savesLabel={messages.explore.savesLabel}
      />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run destinations.slug.host -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/DestinationDetailView.tsx "apps/web/app/[locale]/destinations/[slug]/page.tsx" apps/web/tests/destinations.slug.host.test.tsx
git commit -m "feat(web): /destinations/[slug] experiences section (post-R6A merge)"
```

---

## Task 10: Sitemap wiring

**Files:**
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/tests/sitemap.guides-creators.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/sitemap.guides-creators.test.ts`, alongside the existing
`vi.mock` calls at the top:

```ts
vi.mock('@/lib/destinations/queries', () => ({
  getDestinationsForSitemap: async () => [{ slug: 'tokyo', lastmod: '2026-07-01T00:00:00Z' }],
}))
```

Add a new describe block:

```ts
describe('sitemap — destinations', () => {
  it('emits each destination for all 7 locales', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const l of LOCALES) {
      expect(urls).toContain(`${SITE}/${l}/destinations/tokyo`)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run sitemap.guides-creators -v`
Expected: FAIL — no destination URLs are emitted yet

- [ ] **Step 3: Wire `app/sitemap.ts`**

Add the import (alongside the other query imports):

```ts
import { getDestinationsForSitemap } from '@/lib/destinations/queries'
```

Update the `Promise.all` destructure:

```ts
  const [articles, guides, creators, merchants, experiences, sessions, destinations] = await Promise.all([
    getPublishedForSitemap(), getGuidesForSitemap(), getCreatorsForSitemap(),
    getMerchantsForSitemap(), getExperiencesForSitemap(), getSessionsForSitemap(), getDestinationsForSitemap(),
  ])
```

Append a new loop after the existing `sessions` loop:

```ts
  for (const d of destinations) {
    const lastModified = d.lastmod ? new Date(d.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/destinations/${d.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run sitemap.guides-creators -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/sitemap.ts apps/web/tests/sitemap.guides-creators.test.ts
git commit -m "feat(web): wire destinations into the sitemap"
```

---

## Task 11: Final sweep

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
`pnpm --filter web test` from the repo root, it can time out on the full 900+-test suite).

- [ ] **Step 4: Self-review checklist**

- Confirm `destinationsSoon` no longer appears anywhere: `grep -rn destinationsSoon apps/web/` → no hits.
- Confirm `MARKETING_PATHS` contains `/destinations` and `apps/web/app/robots.ts`'s
  `ROBOTS_DISALLOW` was NOT touched (destinations is public, not a private tree).
- Confirm `i18n.locale-parity.test.ts` passes with zero edits to that file.
- Confirm the Task 9 precondition was genuinely satisfied (PR #80 merged) before that
  task's commit landed — `git log --oneline --all | grep -i "r6a\|saves"` and
  `gh pr view 80 --json state,mergedAt` should both confirm this.
- If Task 9 was skipped because R6A hadn't merged yet: note this plainly to the user
  rather than silently shipping a two-section detail page as if it were the full scope.

- [ ] **Step 5: Hand off**

Report the final task/commit list to the user and proceed to the
`finishing-a-development-branch` skill (verify tests → present the 4 standard options →
execute the chosen option).
