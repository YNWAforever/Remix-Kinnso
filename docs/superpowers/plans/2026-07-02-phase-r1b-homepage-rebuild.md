# Phase R1B — Homepage Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the creator-recruiting homepage with the 10-section dual-sided homepage from the master spec (§4.1), built in the R1A editorial design system: locked traveller-first hero on real guide covers, a threshold-gated `platform_stats` social-proof bar, curated `testimonials` (new table + ops CRUD at `/admin/testimonials`), audience-toggle How-it-works, real featured guides + latest articles, an honest AI-Agent waitlist band, a data-gated Sessions section, merchant/creator CTA bands — and zero mock data left on the page (ScanWidget, PassportHeroStack, EarningsTicker, Unsplash hotlinks all gone).

**Architecture:** One new migration ships both DB objects (`testimonials` table with RLS + `platform_stats()` SECURITY DEFINER count RPC); `packages/db/types.ts` gains hand-written types in the generated style (live regen is a controller handoff). A new `apps/web/lib/home/queries.ts` domain owns homepage reads via `createSupabasePublicClient()` (stats, testimonials, and a typed `getUpcomingSessions()` stub that returns `[]` until R5). `HomeView` is rebuilt from scratch in place (same file, new props `{ locale, t, guides, stats, testimonials, articles, sessions }`); non-trivial sections live one-per-file in `components/kinnso/home/` (Hero, StatsBar, HowItWorks, AgentTeaser, MerchantValue, CreatorCta) on the R1A `SectionShell`/`Eyebrow`/`EditorialCard` + `k2-*` primitives; featured guides, testimonials, articles, and sessions render inline in HomeView. `app/[locale]/page.tsx` fetches everything in a single `Promise.all` and adds `export const revalidate = 300`. The ops CRUD follows the Phase-6B admin pattern exactly (`requireOpsPage`/`requireOpsAction`, `ActionResult`, camel→snake `toRow`, per-locale i18n group, legacy admin skin — the operator console is not part of the R1 public re-skin). The i18n `home` group is net-replaced across all 7 locales inside this phase (new keys land in Task 3; the 17 legacy-only keys are deleted in Task 7's same edit as the consumer rebuild so every commit stays green).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 (`kinnso2-*` tokens + `k2-*` utilities from R1A) · Supabase (Postgres + RLS + SECURITY DEFINER RPC) · custom i18n (7 locales, typed `Messages`) · Vitest 4 + Testing Library (jsdom).

**Branch:** `feat/redesign-r1b` cut from `feat/redesign-r1a` HEAD (R1 phases stack; the whole of R1 lands later as one squash PR after R1C).

**Scope guard (do NOT do in R1B):** no `/for-creators`/`/for-merchants` landings, no `/agent` page rewrite, no re-skin sweep of other pages, no legacy `kinnso-*`/`k-*` token removal, no `lib/seo/routes.ts`/sitemap/robots changes (the homepage is already indexed), no chrome changes (`Navbar`/`Footer`/`SiteChrome` are R1A-final), no edits to shipped migrations. The `Guide` TYPE stays imported from `@/lib/creator-mock` until R1C relocates it. Merchant CTA points at `/merchants` (R1C retargets `/for-merchants` — commented in code). Hero primary CTA points at `/explore` (R4 flips it to the live agent — commented in code).

---

## File Structure

### Created
| Path (repo-relative) | Responsibility |
|---|---|
| `supabase/migrations/20260702120000_r1b_platform_stats_testimonials.sql` | `platform_stats()` SECURITY DEFINER RPC + `testimonials` table with RLS (one migration, both objects) |
| `apps/web/lib/home/queries.ts` | Home data lib: `getPlatformStats()` + exported display thresholds, `getPublishedTestimonials(locale)`, `getUpcomingSessions()` R5-typed stub |
| `apps/web/components/kinnso/home/Hero.tsx` | Section 1: locked headline, real-cover collage (≥3 covers) or purely typographic fallback |
| `apps/web/components/kinnso/home/StatsBar.tsx` | Section 2a: threshold-gated stats (no zeros; <2 passing → null) |
| `apps/web/components/kinnso/home/HowItWorks.tsx` | Section 3: client component, traveller-default tabs, NO URL state |
| `apps/web/components/kinnso/home/AgentTeaser.tsx` | Section 5: dark-ink waitlist band → `/{locale}/agent`, no email capture |
| `apps/web/components/kinnso/home/MerchantValue.tsx` | Section 8: 3 bullets, CTA → `/{locale}/merchants` (R1C comment) |
| `apps/web/components/kinnso/home/CreatorCta.tsx` | Section 9: moss band, 3 bullets, CTA → `/{locale}/sign-up` |
| `apps/web/lib/admin/testimonials-validation.ts` | `TestimonialInput` + field validation (perks-validation pattern) |
| `apps/web/lib/admin/testimonials-queries.ts` | Ops full-read `listAllTestimonials` (throws, no silent `[]`) |
| `apps/web/lib/admin/testimonials-actions.ts` | create / update / setStatus / delete server actions (`ActionResult`) |
| `apps/web/components/kinnso/admin/AdminTestimonialsView.tsx` | Ops CRUD UI + inline form (legacy admin skin, like AdminPerksView) |
| `apps/web/app/[locale]/admin/testimonials/page.tsx` | Ops page host: `requireOpsPage` + `'use server'` action wrappers |
| `apps/web/tests/db.r1b-migration.test.ts` | Executable string-contract on the migration SQL (design.k2-tokens pattern) |
| `apps/web/tests/home.queries.test.ts` | lib/home unit tests — Supabase MOCKED (house pattern, no live DB) |
| `apps/web/tests/kinnso.home-hero-stats.test.tsx` | Hero collage/fallback + StatsBar threshold gating |
| `apps/web/tests/kinnso.home-how-it-works.test.tsx` | Tab default + switching |
| `apps/web/tests/kinnso.home-bands.test.tsx` | AgentTeaser (waitlist, no input), MerchantValue, CreatorCta |
| `apps/web/tests/admin.testimonials-validation.test.ts` | Validation unit tests |
| `apps/web/tests/admin.testimonials-queries.test.ts` | Ops list read: rows + error propagation |
| `apps/web/tests/admin.testimonials-actions.test.ts` | Actions: gate, validation, camel→snake payloads, no-row failures |
| `apps/web/tests/admin.testimonials.host.test.tsx` | `/admin/testimonials` host: notFound for non-ops, renders for ops |

### Modified
| Path | Change |
|---|---|
| `apps/web/lib/i18n/messages/en.ts` | REPLACE `home` group (new 63-key shape; 17 legacy keys ride along until Task 7) + new `seo.home` strings + `admin.navTestimonials` + new `testimonialsAdmin` group |
| `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Same changes, fully translated (all 7 locales change together — parity stays green) |
| `apps/web/tests/i18n.locale-parity.test.ts` | Register `testimonialsAdmin` in GROUPS (Task 10) |
| `apps/web/components/kinnso/pages/HomeView.tsx` | REBUILT from scratch: 10-section assembly, new props |
| `apps/web/app/[locale]/page.tsx` | `export const revalidate = 300`, single `Promise.all` fetch, new HomeView props |
| `apps/web/tests/kinnso.HomeView.test.tsx` | Task 3: one hero literal updated; Task 7: rewritten for the new sections |
| `apps/web/tests/home.host.test.tsx` | Rewritten: mocks all home fetches, asserts `revalidate === 300` + new seo.home |
| `apps/web/tests/kinnso.route-parity.test.tsx` | HomeView invocation gains the new props (still renders chrome + homepage and asserts hrefs are route-backed) |
| `apps/web/components/kinnso/admin/AdminShell.tsx` | Nav gains the Testimonials item |
| `apps/web/tests/kinnso.AdminShell.test.tsx` | Asserts the new nav link |
| `packages/db/types.ts` | Hand-written `testimonials` table + `platform_stats` function types in the generated style (regen = controller handoff) |

### Deleted (Task 8, greps shown there)
| Path | Why |
|---|---|
| `apps/web/components/kinnso/EarningsTicker.tsx` | Dead: ZERO consumers anywhere (fabricated payouts ticker) |
| `apps/web/components/kinnso/PassportHeroStack.tsx` | Only consumer was the old HomeView (hardcoded payouts/scores) |
| `apps/web/components/kinnso/ScanWidget.tsx` | Only consumer was the old HomeView — verified NOT used by studio or any other page |
| `apps/web/tests/kinnso.ScanWidget.test.tsx` | Tests a deleted component |

### Deliberately NOT modified
- `apps/web/components/kinnso/{Navbar,Footer,SiteChrome}.tsx` — R1A chrome is final for this phase; the homepage renders inside it.
- `apps/web/lib/seo/routes.ts`, `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts` — no new public routes; the homepage (`''`) is already in the sitemap.
- `apps/web/app/globals.css` — every token/utility needed already shipped in R1A; no legacy `kinnso-*` removals (R1C).
- `apps/web/components/kinnso/{GuideCard,MarketPassport}.tsx` — still consumed by `/explore`, creator profiles, and the admin console until R1C re-skins them.
- `apps/web/lib/creator-mock/` — the `Guide` TYPE stays exported from here (type-only imports remain legal); the mock DATA is simply no longer imported by any homepage surface.
- `apps/web/app/[locale]/opengraph-image.tsx` — hardcoded legacy alt text is R1C re-skin-sweep territory.
- `apps/web/app/[locale]/agent/page.tsx`, `apps/web/app/[locale]/merchants/*` — R1C.

**Test environment note:** `apps/web` vitest requires `apps/web/.env.test` (see repo CLAUDE.md); `vitest.setup.ts` throws without it. All test commands in this plan are scoped file runs: `cd apps/web && npx vitest run tests/<file>` — NEVER `pnpm --filter web test -- <pattern>` (runs all ~900 tests and times out). Every unit test here MOCKS Supabase; nothing depends on the live DB or on the migration being applied.

---

## Task 0 — Branch setup

**Files:** none (git only)

- [ ] Confirm you are on the R1A branch (its HEAD carries the design system + chrome this phase builds on):
  ```bash
  git branch --show-current   # expect: feat/redesign-r1a
  git log --oneline -3        # expect the R1A verification/placeholder commits at the top
  ```
- [ ] Confirm the working tree is clean apart from this plan file (`git status --short` shows only `docs/superpowers/plans/2026-07-02-phase-r1b-homepage-rebuild.md` if uncommitted).
- [ ] Create the phase branch FROM `feat/redesign-r1a` (R1 phases stack into one squash PR later):
  ```bash
  git checkout -b feat/redesign-r1b
  ```
- [ ] If the plan file is untracked, commit it now:
  ```bash
  git add docs/superpowers/plans/2026-07-02-phase-r1b-homepage-rebuild.md
  git commit -m "docs(web): R1B homepage rebuild implementation plan" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 1 — Migration: `platform_stats()` RPC + `testimonials` table (+ hand-written db types)

**Files:**
- Create: `supabase/migrations/20260702120000_r1b_platform_stats_testimonials.sql`
- Create: `apps/web/tests/db.r1b-migration.test.ts`
- Modify: `packages/db/types.ts` (two insertions in the generated style)
- Test: `apps/web/tests/db.r1b-migration.test.ts`

Both DB objects ship in ONE timestamped migration (timestamp format matches the existing `YYYYMMDDHHMMSS_name.sql` files; `20260702120000` sorts after the shipped `20260702090000_admin_mission_analytics.sql`). Applying it to the live Supabase project is a CONTROLLER handoff step (Task 11) — no test in this plan requires it.

- [ ] Write the failing contract test. Create `apps/web/tests/db.r1b-migration.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { readFileSync } from 'node:fs'
  import { join } from 'node:path'

  // Executable contract on the R1B migration (same string-assert pattern as
  // tests/design.k2-tokens.test.ts): unit tests mock Supabase, so this file is
  // what pins the SQL the controller will apply via MCP apply_migration.
  const sql = readFileSync(
    join(process.cwd(), '../../supabase/migrations/20260702120000_r1b_platform_stats_testimonials.sql'),
    'utf8',
  )

  describe('platform_stats() RPC', () => {
    it('is a SECURITY DEFINER aggregate with a pinned search_path', () => {
      expect(sql).toContain('create or replace function public.platform_stats()')
      expect(sql).toContain('security definer')
      expect(sql).toContain('set search_path = public')
    })
    it('counts active public creators, published guides, and distinct guide cities', () => {
      expect(sql).toContain("status = 'active' and handle is not null and public_profile is not null")
      expect(sql).toContain("from public.guides where status = 'published'")
      expect(sql).toContain('count(distinct city)')
    })
    it('is executable by anon (public homepage read) and carries NO bookings stat until R3', () => {
      expect(sql).toContain('grant execute on function public.platform_stats() to anon, authenticated')
      expect(sql.toLowerCase()).not.toContain('booking')
    })
  })

  describe('testimonials table', () => {
    it('has the locked columns and check constraints', () => {
      expect(sql).toContain('create table if not exists public.testimonials')
      expect(sql).toContain('id uuid primary key default gen_random_uuid()')
      expect(sql).toContain('quote text not null')
      expect(sql).toContain('author_name text not null')
      expect(sql).toContain("author_role text not null check (author_role in ('creator','traveller','merchant'))")
      expect(sql).toContain("status text not null default 'draft' check (status in ('draft','published'))")
      expect(sql).toContain('sort_order int not null default 0')
    })
    it('is RLS-locked: anon reads published only; ops manage all', () => {
      expect(sql).toContain('alter table public.testimonials enable row level security')
      expect(sql).toContain('revoke all on public.testimonials from anon, authenticated')
      expect(sql).toContain("for select to anon, authenticated using (status = 'published')")
      expect(sql).toContain('using (public.is_active_ops()) with check (public.is_active_ops())')
    })
  })
  ```

- [ ] Run it and watch it fail (file not found):
  ```bash
  cd apps/web && npx vitest run tests/db.r1b-migration.test.ts
  ```

- [ ] Create `supabase/migrations/20260702120000_r1b_platform_stats_testimonials.sql` with EXACTLY:

  ```sql
  -- Phase R1B — homepage social proof: platform_stats RPC + curated testimonials.
  -- Reuses public.is_active_ops() (6A, 20260626130000) — do NOT redefine here.

  -- 1. Honest aggregate counts for the homepage social-proof bar.
  --    SECURITY DEFINER because anon RLS hides creators rows entirely; the function
  --    returns ONLY aggregate counts, so no row data can leak. "Active creator" =
  --    active status + claimed handle + published public profile. Destinations =
  --    distinct cities across published guides. Deliberately NO bookings count
  --    until R3 ships direct booking (master spec §5, threshold-gated display).
  create or replace function public.platform_stats()
  returns table (active_creators bigint, published_guides bigint, destinations bigint)
  language sql stable security definer set search_path = public as $$
    select
      (select count(*) from public.creators
         where status = 'active' and handle is not null and public_profile is not null),
      (select count(*) from public.guides where status = 'published'),
      (select count(distinct city) from public.guides
         where status = 'published' and city is not null and city <> '');
  $$;
  -- Public homepage read: unlike the ops RPCs, anon MUST be able to execute this.
  revoke all on function public.platform_stats() from public;
  grant execute on function public.platform_stats() to anon, authenticated;

  -- 2. Curated testimonials — ops-managed; surfaced on the homepage now and the
  --    R1C landing pages later. locale null = show in every locale.
  create table if not exists public.testimonials (
    id uuid primary key default gen_random_uuid(),
    quote text not null,
    author_name text not null,
    author_role text not null check (author_role in ('creator','traveller','merchant')),
    locale text,
    status text not null default 'draft' check (status in ('draft','published')),
    sort_order int not null default 0,
    created_at timestamptz not null default now()
  );
  alter table public.testimonials enable row level security;
  revoke all on public.testimonials from anon, authenticated;

  -- anon (and any signed-in non-ops user) sees published rows only.
  drop policy if exists testimonials_public_read on public.testimonials;
  create policy testimonials_public_read on public.testimonials
    for select to anon, authenticated using (status = 'published');

  -- ops manage everything, drafts included.
  drop policy if exists testimonials_ops_all on public.testimonials;
  create policy testimonials_ops_all on public.testimonials
    for all to authenticated using (public.is_active_ops()) with check (public.is_active_ops());

  grant select on public.testimonials to anon;
  grant select, insert, update, delete on public.testimonials to authenticated; -- gated by the policies above
  ```

- [ ] Re-run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/db.r1b-migration.test.ts
  ```

- [ ] Regenerate the db types — EXPECTED TO FAIL in this environment (needs live-DB access):
  ```bash
  pnpm --filter @kinnso/db gen
  ```
  If (and only if) it fails, hand-write the additions below — they follow the generated style already in `packages/db/types.ts` (verified against the `partner_perks` Row/Insert/Update block and the `list_active_perks` Functions entry). The controller re-runs the real regen after applying the migration (Task 11 handoff); note the generated file is not strictly alphabetical, so appending at the stated anchors is safe.

- [ ] In `packages/db/types.ts`, immediately AFTER the `seo_redirects: { … }` table block (the last entry inside `Tables`, ends near line 1652) and BEFORE the `Functions: {` line, insert:

  ```ts
        testimonials: {
          Row: {
            author_name: string
            author_role: string
            created_at: string
            id: string
            locale: string | null
            quote: string
            sort_order: number
            status: string
          }
          Insert: {
            author_name: string
            author_role: string
            created_at?: string
            id?: string
            locale?: string | null
            quote: string
            sort_order?: number
            status?: string
          }
          Update: {
            author_name?: string
            author_role?: string
            created_at?: string
            id?: string
            locale?: string | null
            quote?: string
            sort_order?: number
            status?: string
          }
          Relationships: []
        }
  ```

- [ ] In the same file, inside `Functions`, immediately AFTER the `merchant_insights: { Args: never; Returns: Json }` entry, insert:

  ```ts
        platform_stats: {
          Args: never
          Returns: {
            active_creators: number
            published_guides: number
            destinations: number
          }[]
        }
  ```

- [ ] Typecheck (proves the hand-written types parse and nothing regressed):
  ```bash
  pnpm --filter web typecheck
  ```
- [ ] Commit:
  ```bash
  git add supabase/migrations/20260702120000_r1b_platform_stats_testimonials.sql packages/db/types.ts apps/web/tests/db.r1b-migration.test.ts
  git commit -m "feat(db): platform_stats RPC + testimonials table for homepage social proof" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 2 — Home data lib: `apps/web/lib/home/queries.ts`

**Files:**
- Create: `apps/web/lib/home/queries.ts`
- Create: `apps/web/tests/home.queries.test.ts`
- Test: `apps/web/tests/home.queries.test.ts`

Articles are deliberately NOT re-implemented here: `searchArticles({ locale, page: 1, perPage: 3 })` from `@/lib/articles/queries` already returns the 3 latest visible articles for a locale (the `search_articles` RPC orders by `coalesce(edit_at, published_at) desc` and joins the locale's translation) — the homepage reuses it in Task 7/`page.tsx` instead of adding a near-duplicate query.

- [ ] Write the failing test. Create `apps/web/tests/home.queries.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect, vi } from 'vitest'

  const { publicClientMock } = vi.hoisted(() => ({ publicClientMock: vi.fn() }))
  vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: publicClientMock }))

  import {
    getPlatformStats,
    getPublishedTestimonials,
    getUpcomingSessions,
    STAT_THRESHOLDS,
    MIN_VISIBLE_STATS,
  } from '@/lib/home/queries'

  describe('getPlatformStats', () => {
    it('maps the RPC row to camelCase numbers', async () => {
      publicClientMock.mockReturnValue({
        rpc: vi.fn(async () => ({ data: [{ active_creators: 12, published_guides: 48, destinations: 9 }], error: null })),
      })
      expect(await getPlatformStats()).toEqual({ activeCreators: 12, publishedGuides: 48, destinations: 9 })
    })
    it('degrades to null on RPC failure (stats bar hides; homepage stays up)', async () => {
      publicClientMock.mockReturnValue({ rpc: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) })
      expect(await getPlatformStats()).toBeNull()
    })
    it('returns null when the RPC yields no row', async () => {
      publicClientMock.mockReturnValue({ rpc: vi.fn(async () => ({ data: [], error: null })) })
      expect(await getPlatformStats()).toBeNull()
    })
  })

  describe('getPublishedTestimonials', () => {
    it('reads published rows for the locale OR all-locale rows, ordered, capped at 3', async () => {
      const limit = vi.fn(async () => ({
        data: [{ id: 't1', quote: 'q', author_name: 'Mei', author_role: 'creator' }],
        error: null,
      }))
      const order2 = vi.fn(() => ({ limit }))
      const order1 = vi.fn(() => ({ order: order2 }))
      const or = vi.fn(() => ({ order: order1 }))
      const eq = vi.fn(() => ({ or }))
      const select = vi.fn(() => ({ eq }))
      publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

      const rows = await getPublishedTestimonials('zh-hk')
      expect(eq).toHaveBeenCalledWith('status', 'published')
      expect(or).toHaveBeenCalledWith('locale.is.null,locale.eq.zh-hk')
      expect(order1).toHaveBeenCalledWith('sort_order', { ascending: true })
      expect(limit).toHaveBeenCalledWith(3)
      expect(rows).toEqual([{ id: 't1', quote: 'q', authorName: 'Mei', authorRole: 'creator' }])
    })
  })

  describe('getUpcomingSessions (R5 stub)', () => {
    it('returns an empty list so the homepage Sessions section data-gates off', async () => {
      expect(await getUpcomingSessions()).toEqual([])
    })
  })

  describe('display thresholds (locked R1B decisions)', () => {
    it('exports the honesty thresholds as constants', () => {
      expect(STAT_THRESHOLDS).toEqual({ activeCreators: 5, publishedGuides: 10, destinations: 3 })
      expect(MIN_VISIBLE_STATS).toBe(2)
    })
  })
  ```

- [ ] Run it and watch it fail (module not found):
  ```bash
  cd apps/web && npx vitest run tests/home.queries.test.ts
  ```

- [ ] Create `apps/web/lib/home/queries.ts` with EXACTLY:

  ```ts
  import { createSupabasePublicClient } from '@/lib/supabase/public'
  import type { Locale } from '@/lib/i18n/config'

  /** Aggregate counts from the `platform_stats()` SECURITY DEFINER RPC. */
  export interface PlatformStats {
    activeCreators: number
    publishedGuides: number
    destinations: number
  }

  /**
   * Display thresholds (master spec §4.1 honesty rule): a stat below its
   * threshold is NOT rendered — no zeros, no fake "growing fast" numbers.
   */
  export const STAT_THRESHOLDS = {
    activeCreators: 5,
    publishedGuides: 10,
    destinations: 3,
  } as const

  /** Fewer than this many passing stats → the whole social-proof bar renders null. */
  export const MIN_VISIBLE_STATS = 2

  /**
   * Honest platform counts for the social-proof bar. Degrades to null on any
   * failure — the bar hides rather than taking the homepage down (same
   * reads-never-crash stance as getPublishedGuides()).
   */
  export async function getPlatformStats(): Promise<PlatformStats | null> {
    const supabase = createSupabasePublicClient()
    const { data, error } = await supabase.rpc('platform_stats')
    if (error) return null
    const row = (data ?? [])[0]
    if (!row) return null
    return {
      activeCreators: Number(row.active_creators),
      publishedGuides: Number(row.published_guides),
      destinations: Number(row.destinations),
    }
  }

  export interface Testimonial {
    id: string
    quote: string
    authorName: string
    authorRole: 'creator' | 'traveller' | 'merchant'
  }

  /**
   * Published testimonials for a locale: rows whose locale matches OR is null
   * (= all locales), ordered by sort_order then created_at, max 3. RLS already
   * hides drafts from the anon client; the eq() filter documents intent.
   */
  export async function getPublishedTestimonials(locale: Locale): Promise<Testimonial[]> {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('testimonials')
      .select('id, quote, author_name, author_role')
      .eq('status', 'published')
      .or(`locale.is.null,locale.eq.${locale}`)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(3)
    return (data ?? []).map((r) => ({
      id: r.id as string,
      quote: r.quote as string,
      authorName: r.author_name as string,
      authorRole: r.author_role as Testimonial['authorRole'],
    }))
  }

  /** The shape R5's community_sessions rows will map into. */
  export interface UpcomingSession {
    id: string
    title: string
    hostHandle: string
    startsAt: string // ISO timestamp
  }

  /**
   * DATA-GATED stub until R5 ships `community_sessions`: returns [] so the
   * homepage Sessions section renders null — no fake content, no empty
   * carousels. R5 replaces this body with a real query; the return type is
   * already the R5 contract, so HomeView will not change shape.
   */
  export async function getUpcomingSessions(): Promise<UpcomingSession[]> {
    return []
  }
  ```

- [ ] Re-run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/home.queries.test.ts
  ```
- [ ] Commit:
  ```bash
  git add apps/web/lib/home/queries.ts apps/web/tests/home.queries.test.ts
  git commit -m "feat(web): home data lib — platform stats, testimonials, sessions stub" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 3 — i18n: new `home` shape + `seo.home` across ALL 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface `home` group lines 449–457; values `home` block lines 1300–1330; `seo.home` values lines 861–865)
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (each file: `seo.home` near line 12; top-level `home` group near line 451)
- Modify: `apps/web/tests/kinnso.HomeView.test.tsx` (ONE hardcoded literal)
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (group `home` is already registered — parity is the gate)

**Strategy (keeps every commit green):** the new 63-key shape lands now in all 7 files; the 17 keys ONLY the pre-rebuild HomeView consumes (`heroPill`, `applyCta`, `step1Title`…`step4Desc`, `merchantWall`, `travelersTitle/Desc/Cta`, `merchantsTitle/Desc/Cta`) are kept temporarily under a `// R1B-legacy` comment WITH THEIR CURRENT VALUES in each file, and are deleted in Task 7 in the same edit that rebuilds their only consumer. Net effect across the phase: the entire `home` group is replaced. Six keys exist in BOTH shapes (`heroTitle`, `heroSubtitle`, `howHeading`, `howSub`, `featuredHeading`, `featuredSub`, `featuredSeeAll`, `featuredEmpty`) — they take their NEW values now; the old HomeView renders the new copy harmlessly for the few commits until Task 7.

- [ ] Update the `Messages` interface in `apps/web/lib/i18n/messages/en.ts`. Replace the whole `home: { … }` interface block (lines 449–457) with:

  ```ts
    home: {
      heroEyebrow: string; heroTitle: string; heroSubtitle: string
      heroPrimaryCta: string; heroSecondaryCta: string
      statCreators: string; statGuides: string; statDestinations: string
      roleCreator: string; roleTraveller: string; roleMerchant: string
      howEyebrow: string; howHeading: string; howSub: string
      howTabTravellers: string; howTabCreators: string; howTabMerchants: string
      howT1Title: string; howT1Desc: string; howT2Title: string; howT2Desc: string; howT3Title: string; howT3Desc: string
      howC1Title: string; howC1Desc: string; howC2Title: string; howC2Desc: string; howC3Title: string; howC3Desc: string
      howM1Title: string; howM1Desc: string; howM2Title: string; howM2Desc: string; howM3Title: string; howM3Desc: string
      featuredEyebrow: string; featuredHeading: string; featuredSub: string; featuredSeeAll: string; featuredEmpty: string
      agentEyebrow: string; agentTitle: string; agentBody: string; agentCta: string; agentNote: string
      articlesEyebrow: string; articlesHeading: string; articlesSeeAll: string
      sessionsEyebrow: string; sessionsHeading: string; sessionsSub: string
      merchantEyebrow: string; merchantHeading: string
      merchantBullet1: string; merchantBullet2: string; merchantBullet3: string; merchantCta: string
      creatorEyebrow: string; creatorHeading: string
      creatorBullet1: string; creatorBullet2: string; creatorBullet3: string; creatorCta: string
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      heroPill: string; applyCta: string
      step1Title: string; step1Desc: string; step2Title: string; step2Desc: string
      step3Title: string; step3Desc: string; step4Title: string; step4Desc: string
      merchantWall: string
      travelersTitle: string; travelersDesc: string; travelersCta: string
      merchantsTitle: string; merchantsDesc: string; merchantsCta: string
    }
  ```

- [ ] Watch it fail: the interface now demands keys no locale file defines.
  ```bash
  pnpm --filter web typecheck
  ```
  Expected: errors in `en.ts` + all six locale files (missing `heroEyebrow`, …).

- [ ] Replace the EN `home` VALUE block (lines 1300–1330) with:

  ```ts
    home: {
      heroEyebrow: 'The travel creator marketplace',
      heroTitle: 'Real creators. Real places. Book the trip you actually want.',
      heroSubtitle: 'Discover guides from trusted travel creators. Plan with AI. Book in one place.',
      heroPrimaryCta: 'Start Planning',
      heroSecondaryCta: 'Browse Creators',
      statCreators: 'active creators', statGuides: 'published guides', statDestinations: 'destinations covered',
      roleCreator: 'Creator', roleTraveller: 'Traveller', roleMerchant: 'Merchant',
      howEyebrow: 'How it works',
      howHeading: 'One platform, three ways in.',
      howSub: 'Travel it, create it, or host it — KINNSO turns real local knowledge into real trips.',
      howTabTravellers: 'For Travellers', howTabCreators: 'For Creators', howTabMerchants: 'For Merchants',
      howT1Title: 'Find your people',
      howT1Desc: 'Browse guides by creators who actually live and travel the places you want to go.',
      howT2Title: 'Save the real spots',
      howT2Desc: 'Every guide is a route of real cafés, streets, and stays — not top-ten filler.',
      howT3Title: 'Plan and book in one place',
      howT3Desc: 'Shape the trip with AI help, then book your picks without leaving KINNSO.',
      howC1Title: 'Scan your profile',
      howC1Desc: 'Connect your socials and KINNSO maps the cities you genuinely know.',
      howC2Title: 'Publish your guides',
      howC2Desc: 'Turn your routes into guides travellers can follow, save, and book from.',
      howC3Title: 'Earn from your knowledge',
      howC3Desc: 'Brand missions, affiliate offers, and booking commissions — paid honestly.',
      howM1Title: 'Post a mission',
      howM1Desc: 'Brief vetted creators who already cover your city and your kind of customer.',
      howM2Title: 'Get authentic coverage',
      howM2Desc: 'Creators fold your experience into guides that travellers actually trust.',
      howM3Title: 'See what it drives',
      howM3Desc: 'Track creator coverage today — and attributed bookings once direct booking opens.',
      featuredEyebrow: 'Featured guides',
      featuredHeading: 'Guides worth packing.',
      featuredSub: 'The latest city guides published by KINNSO creators.',
      featuredSeeAll: 'See all guides',
      featuredEmpty: 'No published guides yet — the first ones are on their way.',
      agentEyebrow: 'KINNSO AI Agent',
      agentTitle: 'An agent that plans like a local.',
      agentBody: 'Tell it where you are going and how you like to travel — the KINNSO agent draws on real creator guides, not generic lists, to shape your trip. It is in private preview while we teach it the streets.',
      agentCta: 'Join the agent waitlist',
      agentNote: 'In private preview — live trip chat is coming soon.',
      articlesEyebrow: 'From the journal',
      articlesHeading: 'Stories from the ground.',
      articlesSeeAll: 'Read all articles',
      sessionsEyebrow: 'Community Sessions',
      sessionsHeading: 'Live from the places you are going.',
      sessionsSub: 'Small live briefings hosted by the creators behind our guides.',
      merchantEyebrow: 'For merchants',
      merchantHeading: 'Put your experience inside the guides travellers trust.',
      merchantBullet1: 'Work with vetted creators who already cover your city.',
      merchantBullet2: 'Reach travellers while they plan — inside real guides, not ad slots.',
      merchantBullet3: 'Follow every collaboration in one transparent pipeline.',
      merchantCta: 'Explore KINNSO for merchants',
      creatorEyebrow: 'For creators',
      creatorHeading: 'Your city knowledge is worth more than exposure.',
      creatorBullet1: 'Publish guides that keep working long after you post them.',
      creatorBullet2: 'Take on missions from merchants who value your route.',
      creatorBullet3: 'Earn honestly — real work, real payouts, no fabricated metrics.',
      creatorCta: 'Apply as a creator',
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      heroPill: 'Creator route / HK -> JP -> TW',
      applyCta: 'Apply as Creator',
      step1Title: 'Scan a handle', step1Desc: 'Connect IG, Threads, TikTok, or YouTube signals.',
      step2Title: 'Prove your cities', step2Desc: 'KINNSO maps travel posts, places, and audience fit.',
      step3Title: 'Match with missions', step3Desc: 'Merchants send briefs based on your route and score.',
      step4Title: 'Publish and earn', step4Desc: 'Turn guides, partner links, and briefs into payouts.',
      merchantWall: 'Partner stamps',
      travelersTitle: 'For Travelers', travelersDesc: 'Follow real creators, save guide tickets, and book the exact same spots.', travelersCta: 'Explore Guides',
      merchantsTitle: 'For Merchants', merchantsDesc: 'Issue a mission ticket and match with creators who already own the route.', merchantsCta: 'Post a Mission',
    },
  ```

- [ ] Replace the EN `seo.home` VALUES (lines 861–865, inside the `seo` block) with:

  ```ts
      home: {
        title: 'Real travel guides by real creators',
        description:
          'Discover city guides from trusted travel creators, plan with the KINNSO AI agent, and book the trip you actually want — all in one place.',
      },
  ```

- [ ] Add the six translations. In EACH locale file: (a) replace the whole top-level `home: { … }` block (near line 451) with the block below, KEEPING that file's existing 17 legacy lines verbatim at the end under the same `// R1B-legacy` comment (copy them from the block being replaced — values unchanged); (b) replace the `home` object inside the top-of-file `seo` block (near line 12) with the given `seo.home`.

  **`zh-hk.ts`** (colloquial HK traditional, warm insider voice; terminology matches R1A: 攻略/創作者/商家/旅人/AI 助手/社群活動/目的地):
  ```ts
    home: {
      heroEyebrow: '旅遊創作者市集',
      heroTitle: '真人推薦，真實地方。預訂你真正想去嘅旅程。',
      heroSubtitle: '睇信得過嘅旅遊創作者攻略、用 AI 計劃行程，一個地方搞掂晒。',
      heroPrimaryCta: '開始計劃行程',
      heroSecondaryCta: '睇下創作者',
      statCreators: '位活躍創作者', statGuides: '份已發佈攻略', statDestinations: '個目的地',
      roleCreator: '創作者', roleTraveller: '旅人', roleMerchant: '商家',
      howEyebrow: '點樣運作',
      howHeading: '一個平台，三種玩法。',
      howSub: '去旅行、做創作、定係做東道主——KINNSO 將地道知識變成真正嘅旅程。',
      howTabTravellers: '旅人', howTabCreators: '創作者', howTabMerchants: '商家',
      howT1Title: '搵啱你嘅人',
      howT1Desc: '睇下真係住喺、行勻你想去嘅地方嘅創作者寫嘅攻略。',
      howT2Title: '儲低地道好去處',
      howT2Desc: '每份攻略都係真實嘅咖啡店、街道同住宿路線——唔係十大排行榜嗰啲行貨。',
      howT3Title: '一個地方計劃埋預訂',
      howT3Desc: '用 AI 幫手執行程，之後喺 KINNSO 直接訂你心水嘅體驗。',
      howC1Title: '掃描你嘅帳號',
      howC1Desc: '連結你嘅社交帳號，KINNSO 幫你畫出你真正熟嘅城市地圖。',
      howC2Title: '發佈你嘅攻略',
      howC2Desc: '將你嘅路線變成旅人可以跟住行、儲低、預訂嘅攻略。',
      howC3Title: '用知識賺錢',
      howC3Desc: '品牌任務、聯盟優惠、預訂佣金——誠實出糧。',
      howM1Title: '發佈任務',
      howM1Desc: '向已審核、真正熟你城市同客路嘅創作者落簡報。',
      howM2Title: '獲得真實推薦',
      howM2Desc: '創作者將你嘅體驗寫入旅人真正信任嘅攻略入面。',
      howM3Title: '睇到實際成效',
      howM3Desc: '而家可以追蹤創作者嘅推廣進度——直接預訂開通後仲睇到歸因訂單。',
      featuredEyebrow: '精選攻略',
      featuredHeading: '值得帶埋去旅行嘅攻略。',
      featuredSub: 'KINNSO 創作者最新發佈嘅城市攻略。',
      featuredSeeAll: '睇全部攻略',
      featuredEmpty: '仲未有已發佈嘅攻略——第一批就快嚟。',
      agentEyebrow: 'KINNSO AI 助手',
      agentTitle: '一個好似本地人咁計劃行程嘅 AI。',
      agentBody: '話畀佢知你去邊、鍾意點玩——KINNSO AI 助手會用真實創作者攻略幫你設計行程，唔係求其畀個通用清單你。而家佢喺私人測試階段，我哋仲教緊佢認路。',
      agentCta: '加入 AI 助手候補名單',
      agentNote: '私人測試中——即時行程對話快將推出。',
      articlesEyebrow: '旅誌',
      articlesHeading: '嚟自當地嘅故事。',
      articlesSeeAll: '睇全部文章',
      sessionsEyebrow: '社群活動',
      sessionsHeading: '喺你想去嘅地方現場直播。',
      sessionsSub: '由攻略作者親自主持嘅小型直播簡報。',
      merchantEyebrow: '商家專區',
      merchantHeading: '將你嘅體驗放入旅人信任嘅攻略。',
      merchantBullet1: '同已審核、真正熟你城市嘅創作者合作。',
      merchantBullet2: '喺旅人計劃行程嗰陣接觸佢哋——喺真攻略入面，唔係廣告位。',
      merchantBullet3: '喺一條透明嘅流程入面跟進每次合作。',
      merchantCta: '了解 KINNSO 商家服務',
      creatorEyebrow: '創作者',
      creatorHeading: '你嘅城市知識，唔止值一句「幫你曝光」。',
      creatorBullet1: '發佈長賣長有嘅攻略，post 完好耐都仲幫你做嘢。',
      creatorBullet2: '接重視你路線嘅商家任務。',
      creatorBullet3: '誠實賺錢——真工作、真收入，冇造假數據。',
      creatorCta: '申請成為創作者',
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      // (keep this file's existing heroPill…merchantsCta lines here, values unchanged)
    },
  ```
  ```ts
      home: {
        title: '真人創作者寫嘅旅遊攻略',
        description: '喺 KINNSO 發掘信得過嘅旅遊創作者攻略，用 AI 助手計劃行程，一個地方預訂你真正想去嘅旅程。',
      },
  ```

  **`zh-tw.ts`**:
  ```ts
    home: {
      heroEyebrow: '旅遊創作者市集',
      heroTitle: '真實創作者、真實地方。預訂你真正想要的旅程。',
      heroSubtitle: '探索值得信賴的旅遊創作者攻略、用 AI 規劃行程，一站完成預訂。',
      heroPrimaryCta: '開始規劃',
      heroSecondaryCta: '瀏覽創作者',
      statCreators: '位活躍創作者', statGuides: '份已發布攻略', statDestinations: '個目的地',
      roleCreator: '創作者', roleTraveller: '旅人', roleMerchant: '商家',
      howEyebrow: '如何運作',
      howHeading: '一個平台，三種入口。',
      howSub: '旅行、創作、或是接待——KINNSO 把在地知識變成真正的旅程。',
      howTabTravellers: '旅人', howTabCreators: '創作者', howTabMerchants: '商家',
      howT1Title: '找到對的人',
      howT1Desc: '瀏覽真正住在、走遍你想去之地的創作者所寫的攻略。',
      howT2Title: '收藏道地景點',
      howT2Desc: '每份攻略都是真實咖啡館、街區與住宿的路線——不是十大排行榜的填充內容。',
      howT3Title: '一站規劃與預訂',
      howT3Desc: '用 AI 協助整理行程，然後直接在 KINNSO 預訂你的口袋名單。',
      howC1Title: '掃描你的帳號',
      howC1Desc: '連結社群帳號，KINNSO 會描繪出你真正熟悉的城市版圖。',
      howC2Title: '發布你的攻略',
      howC2Desc: '把路線變成旅人可以跟隨、收藏、預訂的攻略。',
      howC3Title: '用知識獲得收入',
      howC3Desc: '品牌任務、聯盟優惠與預訂佣金——誠實入帳。',
      howM1Title: '發布任務',
      howM1Desc: '向已審核、真正了解你的城市與客群的創作者發出簡報。',
      howM2Title: '獲得真實報導',
      howM2Desc: '創作者把你的體驗寫進旅人真正信任的攻略。',
      howM3Title: '看見實際成效',
      howM3Desc: '現在就能追蹤創作者的報導——直接預訂開放後，還能看到歸因訂單。',
      featuredEyebrow: '精選攻略',
      featuredHeading: '值得放進行李的攻略。',
      featuredSub: 'KINNSO 創作者最新發布的城市攻略。',
      featuredSeeAll: '看全部攻略',
      featuredEmpty: '還沒有已發布的攻略——第一批正在路上。',
      agentEyebrow: 'KINNSO AI 助手',
      agentTitle: '像在地人一樣規劃行程的 AI。',
      agentBody: '告訴它你要去哪裡、喜歡怎麼玩——KINNSO AI 助手會運用真實創作者攻略、而非通用清單，替你形塑旅程。目前為私人預覽，我們還在教它認路。',
      agentCta: '加入 AI 助手候補名單',
      agentNote: '私人預覽中——即時行程對話即將推出。',
      articlesEyebrow: '旅誌',
      articlesHeading: '來自現場的故事。',
      articlesSeeAll: '閱讀全部文章',
      sessionsEyebrow: '社群活動',
      sessionsHeading: '從你要去的地方現場連線。',
      sessionsSub: '由攻略作者親自主持的小型直播簡報。',
      merchantEyebrow: '商家專區',
      merchantHeading: '把你的體驗放進旅人信任的攻略。',
      merchantBullet1: '與已審核、真正熟悉你城市的創作者合作。',
      merchantBullet2: '在旅人規劃行程的當下觸及他們——在真實攻略裡，而非廣告版位。',
      merchantBullet3: '在一條透明的流程中追蹤每一次合作。',
      merchantCta: '了解 KINNSO 商家方案',
      creatorEyebrow: '創作者',
      creatorHeading: '你的城市知識，值得的不只是曝光。',
      creatorBullet1: '發布持續帶來價值的攻略，貼文之後仍不斷運作。',
      creatorBullet2: '承接重視你路線的商家任務。',
      creatorBullet3: '誠實獲利——真實工作、真實收入，絕不造假數據。',
      creatorCta: '申請成為創作者',
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      // (keep this file's existing heroPill…merchantsCta lines here, values unchanged)
    },
  ```
  ```ts
      home: {
        title: '真實創作者寫的旅遊攻略',
        description: '在 KINNSO 探索值得信賴的旅遊創作者攻略，用 AI 助手規劃行程，一站預訂你真正想要的旅程。',
      },
  ```

  **`zh-cn.ts`**:
  ```ts
    home: {
      heroEyebrow: '旅行创作者市集',
      heroTitle: '真实创作者、真实地方。预订你真正想要的旅程。',
      heroSubtitle: '发现值得信赖的旅行创作者攻略、用 AI 规划行程，一站完成预订。',
      heroPrimaryCta: '开始规划',
      heroSecondaryCta: '浏览创作者',
      statCreators: '位活跃创作者', statGuides: '份已发布攻略', statDestinations: '个目的地',
      roleCreator: '创作者', roleTraveller: '旅行者', roleMerchant: '商家',
      howEyebrow: '如何运作',
      howHeading: '一个平台，三种方式。',
      howSub: '旅行、创作、或是接待——KINNSO 把在地知识变成真正的旅程。',
      howTabTravellers: '旅行者', howTabCreators: '创作者', howTabMerchants: '商家',
      howT1Title: '找到对的人',
      howT1Desc: '浏览真正住在、走遍你想去之地的创作者写下的攻略。',
      howT2Title: '收藏地道去处',
      howT2Desc: '每份攻略都是真实咖啡馆、街区与住宿的路线——不是十大榜单式的凑数内容。',
      howT3Title: '一站规划与预订',
      howT3Desc: '用 AI 帮你整理行程，然后直接在 KINNSO 预订心仪的体验。',
      howC1Title: '扫描你的账号',
      howC1Desc: '关联社交账号，KINNSO 会描绘出你真正熟悉的城市版图。',
      howC2Title: '发布你的攻略',
      howC2Desc: '把路线变成旅行者可以跟随、收藏、预订的攻略。',
      howC3Title: '用知识获得收入',
      howC3Desc: '品牌任务、联盟优惠与预订佣金——诚实入账。',
      howM1Title: '发布任务',
      howM1Desc: '向已审核、真正了解你的城市与客群的创作者发出简报。',
      howM2Title: '获得真实报道',
      howM2Desc: '创作者把你的体验写进旅行者真正信任的攻略。',
      howM3Title: '看见实际成效',
      howM3Desc: '现在就能跟踪创作者的报道——直接预订开放后，还能看到归因订单。',
      featuredEyebrow: '精选攻略',
      featuredHeading: '值得装进行李的攻略。',
      featuredSub: 'KINNSO 创作者最新发布的城市攻略。',
      featuredSeeAll: '看全部攻略',
      featuredEmpty: '还没有已发布的攻略——第一批正在路上。',
      agentEyebrow: 'KINNSO AI 助手',
      agentTitle: '像本地人一样规划行程的 AI。',
      agentBody: '告诉它你要去哪里、喜欢怎么玩——KINNSO AI 助手会运用真实创作者攻略、而非通用清单，为你打磨旅程。目前处于私人预览阶段，我们还在教它认路。',
      agentCta: '加入 AI 助手等候名单',
      agentNote: '私人预览中——实时行程对话即将上线。',
      articlesEyebrow: '旅志',
      articlesHeading: '来自现场的故事。',
      articlesSeeAll: '阅读全部文章',
      sessionsEyebrow: '社区活动',
      sessionsHeading: '从你要去的地方现场连线。',
      sessionsSub: '由攻略作者亲自主持的小型直播简报。',
      merchantEyebrow: '商家专区',
      merchantHeading: '把你的体验放进旅行者信任的攻略。',
      merchantBullet1: '与已审核、真正熟悉你城市的创作者合作。',
      merchantBullet2: '在旅行者规划行程的当下触达他们——在真实攻略里，而非广告位。',
      merchantBullet3: '在一条透明的流程中跟进每一次合作。',
      merchantCta: '了解 KINNSO 商家方案',
      creatorEyebrow: '创作者',
      creatorHeading: '你的城市知识，值得的不只是曝光。',
      creatorBullet1: '发布持续带来价值的攻略，发出之后仍不断运作。',
      creatorBullet2: '承接重视你路线的商家任务。',
      creatorBullet3: '诚实获利——真实工作、真实收入，绝不造假数据。',
      creatorCta: '申请成为创作者',
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      // (keep this file's existing heroPill…merchantsCta lines here, values unchanged)
    },
  ```
  ```ts
      home: {
        title: '真实创作者写的旅行攻略',
        description: '在 KINNSO 发现值得信赖的旅行创作者攻略，用 AI 助手规划行程，一站预订你真正想要的旅程。',
      },
  ```

  **`ja.ts`** (加盟店/クリエイター/ガイド/AIエージェント/旅行先/セッション per R1A):
  ```ts
    home: {
      heroEyebrow: 'トラベルクリエイターのマーケットプレイス',
      heroTitle: '本物のクリエイター、本物の場所。本当に行きたい旅を予約しよう。',
      heroSubtitle: '信頼できるトラベルクリエイターのガイドに出会い、AIで計画し、ひとつの場所で予約まで。',
      heroPrimaryCta: '旅の計画を始める',
      heroSecondaryCta: 'クリエイターを見る',
      statCreators: '人のアクティブクリエイター', statGuides: '本の公開ガイド', statDestinations: 'の旅行先',
      roleCreator: 'クリエイター', roleTraveller: '旅行者', roleMerchant: '加盟店',
      howEyebrow: '使い方',
      howHeading: 'ひとつのプラットフォーム、3つの入り口。',
      howSub: '旅する人も、つくる人も、迎える人も——KINNSOは地元の知恵を本物の旅に変えます。',
      howTabTravellers: '旅行者向け', howTabCreators: 'クリエイター向け', howTabMerchants: '加盟店向け',
      howT1Title: '気の合う案内人を見つける',
      howT1Desc: '行きたい街に実際に住み、歩き尽くしたクリエイターのガイドを探せます。',
      howT2Title: '本物のスポットを保存',
      howT2Desc: 'どのガイドも、実在するカフェ・路地・宿のルート。ありきたりなランキングではありません。',
      howT3Title: '計画も予約もひとつの場所で',
      howT3Desc: 'AIの力を借りて旅程を整え、気になる体験をKINNSOでそのまま予約。',
      howC1Title: 'プロフィールをスキャン',
      howC1Desc: 'SNSを連携すると、KINNSOがあなたの本当に詳しい街をマッピングします。',
      howC2Title: 'ガイドを公開',
      howC2Desc: 'あなたのルートを、旅行者がたどり、保存し、予約できるガイドに。',
      howC3Title: '知識を収入に',
      howC3Desc: 'ブランドミッション、アフィリエイト、予約コミッション——誠実にお支払いします。',
      howM1Title: 'ミッションを掲載',
      howM1Desc: 'あなたの街と客層を本当に知る、審査済みクリエイターに依頼できます。',
      howM2Title: '本物の紹介を獲得',
      howM2Desc: 'クリエイターがあなたの体験を、旅行者が信頼するガイドに織り込みます。',
      howM3Title: '成果を確認',
      howM3Desc: '掲載状況は今すぐ追跡可能。直接予約の開始後は、予約の帰属も見えるようになります。',
      featuredEyebrow: '注目のガイド',
      featuredHeading: '旅に連れて行きたいガイド。',
      featuredSub: 'KINNSOクリエイターが公開した最新の街ガイド。',
      featuredSeeAll: 'すべてのガイドを見る',
      featuredEmpty: '公開ガイドはまだありません——最初の一本がもうすぐ届きます。',
      agentEyebrow: 'KINNSO AIエージェント',
      agentTitle: '地元の人のように旅を組み立てるAI。',
      agentBody: '行き先と旅のスタイルを伝えるだけ。KINNSOのAIエージェントは、汎用リストではなく本物のクリエイターガイドをもとに旅を形にします。現在はプライベートプレビュー中——街の歩き方を学習させています。',
      agentCta: 'ウェイトリストに登録',
      agentNote: 'プライベートプレビュー中——ライブの旅行チャットは近日公開。',
      articlesEyebrow: 'ジャーナル',
      articlesHeading: '現地からのストーリー。',
      articlesSeeAll: 'すべての記事を読む',
      sessionsEyebrow: 'コミュニティセッション',
      sessionsHeading: 'これから行く街から、ライブでお届け。',
      sessionsSub: 'ガイドを書いたクリエイター本人がホストする少人数のライブブリーフィング。',
      merchantEyebrow: '加盟店の方へ',
      merchantHeading: 'あなたの体験を、旅行者が信頼するガイドの中へ。',
      merchantBullet1: 'あなたの街を本当に知る審査済みクリエイターと組めます。',
      merchantBullet2: '旅行者が計画しているその瞬間に届く——広告枠ではなく、本物のガイドの中で。',
      merchantBullet3: 'すべてのコラボレーションを透明なパイプラインで追跡。',
      merchantCta: 'KINNSOの加盟店プランを見る',
      creatorEyebrow: 'クリエイターの方へ',
      creatorHeading: 'あなたの街の知識は「露出」以上の価値がある。',
      creatorBullet1: '公開後もずっと働き続けるガイドをつくれます。',
      creatorBullet2: 'あなたのルートを評価する加盟店のミッションに参加。',
      creatorBullet3: '誠実な報酬——本物の仕事、本物の収入。数字の水増しはしません。',
      creatorCta: 'クリエイター登録に申し込む',
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      // (keep this file's existing heroPill…merchantsCta lines here, values unchanged)
    },
  ```
  ```ts
      home: {
        title: '本物のクリエイターがつくる旅行ガイド',
        description: '信頼できるトラベルクリエイターのガイドに出会い、KINNSOのAIエージェントで計画し、本当に行きたい旅をひとつの場所で予約。',
      },
  ```

  **`ko.ts`** (가맹점/크리에이터/가이드/AI 에이전트/여행지/세션 per R1A; friendly 해요체 in descriptions):
  ```ts
    home: {
      heroEyebrow: '여행 크리에이터 마켓플레이스',
      heroTitle: '진짜 크리에이터, 진짜 장소. 정말 가고 싶은 여행을 예약하세요.',
      heroSubtitle: '믿을 수 있는 여행 크리에이터의 가이드를 만나고, AI로 계획하고, 한곳에서 예약까지.',
      heroPrimaryCta: '여행 계획 시작하기',
      heroSecondaryCta: '크리에이터 둘러보기',
      statCreators: '명의 활동 크리에이터', statGuides: '개의 공개 가이드', statDestinations: '곳의 여행지',
      roleCreator: '크리에이터', roleTraveller: '여행자', roleMerchant: '가맹점',
      howEyebrow: '이용 방법',
      howHeading: '하나의 플랫폼, 세 가지 방식.',
      howSub: '여행하든, 만들든, 맞이하든 — KINNSO는 현지의 진짜 지식을 진짜 여행으로 바꿔요.',
      howTabTravellers: '여행자', howTabCreators: '크리에이터', howTabMerchants: '가맹점',
      howT1Title: '취향이 맞는 안내자 찾기',
      howT1Desc: '가고 싶은 도시에 실제로 살고, 걸어 본 크리에이터의 가이드를 둘러보세요.',
      howT2Title: '진짜 장소 저장하기',
      howT2Desc: '모든 가이드는 실제 카페, 골목, 숙소로 이어진 루트예요. 뻔한 순위 리스트가 아니에요.',
      howT3Title: '한곳에서 계획하고 예약하기',
      howT3Desc: 'AI의 도움으로 일정을 다듬고, 마음에 든 경험을 KINNSO에서 바로 예약하세요.',
      howC1Title: '프로필 스캔',
      howC1Desc: '소셜 계정을 연결하면 KINNSO가 당신이 진짜 잘 아는 도시를 지도로 그려요.',
      howC2Title: '가이드 발행',
      howC2Desc: '나만의 루트를 여행자가 따라가고, 저장하고, 예약할 수 있는 가이드로 만들어요.',
      howC3Title: '지식으로 수익 만들기',
      howC3Desc: '브랜드 미션, 제휴 오퍼, 예약 커미션까지 — 정직하게 정산해요.',
      howM1Title: '미션 등록',
      howM1Desc: '당신의 도시와 고객층을 진짜 아는, 검증된 크리에이터에게 브리핑을 보내세요.',
      howM2Title: '진정성 있는 소개 받기',
      howM2Desc: '크리에이터가 여행자들이 신뢰하는 가이드 속에 당신의 경험을 담아요.',
      howM3Title: '성과 확인하기',
      howM3Desc: '지금은 크리에이터의 소개 현황을, 직접 예약이 열리면 귀속된 예약까지 확인할 수 있어요.',
      featuredEyebrow: '추천 가이드',
      featuredHeading: '여행 가방에 넣고 싶은 가이드.',
      featuredSub: 'KINNSO 크리에이터가 발행한 최신 도시 가이드예요.',
      featuredSeeAll: '모든 가이드 보기',
      featuredEmpty: '아직 공개된 가이드가 없어요 — 첫 가이드가 곧 도착해요.',
      agentEyebrow: 'KINNSO AI 에이전트',
      agentTitle: '현지인처럼 여행을 설계하는 AI.',
      agentBody: '어디로 가는지, 어떻게 여행하고 싶은지 말해 주세요. KINNSO AI 에이전트는 뻔한 목록이 아니라 진짜 크리에이터 가이드를 바탕으로 여행을 그려요. 지금은 프라이빗 프리뷰 단계로, 골목길을 하나하나 가르치는 중이에요.',
      agentCta: 'AI 에이전트 대기 명단 참여',
      agentNote: '프라이빗 프리뷰 중 — 실시간 여행 채팅이 곧 열려요.',
      articlesEyebrow: '저널',
      articlesHeading: '현장에서 온 이야기.',
      articlesSeeAll: '모든 아티클 읽기',
      sessionsEyebrow: '커뮤니티 세션',
      sessionsHeading: '당신이 갈 곳에서, 라이브로.',
      sessionsSub: '가이드를 쓴 크리에이터가 직접 진행하는 소규모 라이브 브리핑이에요.',
      merchantEyebrow: '가맹점 안내',
      merchantHeading: '여행자가 신뢰하는 가이드 안에 당신의 경험을 담으세요.',
      merchantBullet1: '당신의 도시를 이미 잘 아는 검증된 크리에이터와 협업하세요.',
      merchantBullet2: '여행자가 계획을 세우는 바로 그 순간에 닿아요 — 광고 지면이 아닌 진짜 가이드 안에서.',
      merchantBullet3: '모든 협업을 투명한 파이프라인 하나로 관리해요.',
      merchantCta: 'KINNSO 가맹점 알아보기',
      creatorEyebrow: '크리에이터',
      creatorHeading: '당신의 도시 지식은 노출보다 더 가치 있어요.',
      creatorBullet1: '올리고 나서도 오래도록 일하는 가이드를 발행하세요.',
      creatorBullet2: '당신의 루트를 알아보는 가맹점의 미션에 참여하세요.',
      creatorBullet3: '정직한 수익 — 진짜 일, 진짜 정산, 부풀린 지표는 없어요.',
      creatorCta: '크리에이터 지원하기',
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      // (keep this file's existing heroPill…merchantsCta lines here, values unchanged)
    },
  ```
  ```ts
      home: {
        title: '진짜 크리에이터가 만든 여행 가이드',
        description: '믿을 수 있는 여행 크리에이터의 가이드를 만나고, KINNSO AI 에이전트로 계획하고, 정말 가고 싶은 여행을 한곳에서 예약하세요.',
      },
  ```

  **`th.ts`** (ครีเอเตอร์/ไกด์/ร้านค้า/ผู้ช่วย AI/จุดหมาย/เซสชัน per R1A):
  ```ts
    home: {
      heroEyebrow: 'มาร์เก็ตเพลสของทราเวลครีเอเตอร์',
      heroTitle: 'ครีเอเตอร์ตัวจริง สถานที่จริง จองทริปที่คุณอยากไปจริงๆ',
      heroSubtitle: 'ค้นพบไกด์จากทราเวลครีเอเตอร์ที่เชื่อถือได้ วางแผนด้วย AI และจองครบในที่เดียว',
      heroPrimaryCta: 'เริ่มวางแผนทริป',
      heroSecondaryCta: 'ดูครีเอเตอร์',
      statCreators: 'ครีเอเตอร์ที่แอ็กทีฟ', statGuides: 'ไกด์ที่เผยแพร่แล้ว', statDestinations: 'จุดหมาย',
      roleCreator: 'ครีเอเตอร์', roleTraveller: 'นักเดินทาง', roleMerchant: 'ร้านค้า',
      howEyebrow: 'วิธีใช้งาน',
      howHeading: 'แพลตฟอร์มเดียว สามทางเข้า',
      howSub: 'จะเที่ยว จะสร้างคอนเทนต์ หรือจะต้อนรับนักเดินทาง — KINNSO เปลี่ยนความรู้ท้องถิ่นของจริงให้กลายเป็นทริปจริง',
      howTabTravellers: 'นักเดินทาง', howTabCreators: 'ครีเอเตอร์', howTabMerchants: 'ร้านค้า',
      howT1Title: 'เจอคนที่ใช่',
      howT1Desc: 'เลือกดูไกด์จากครีเอเตอร์ที่อาศัยและเดินจริงในเมืองที่คุณอยากไป',
      howT2Title: 'เซฟที่เด็ดของจริง',
      howT2Desc: 'ทุกไกด์คือเส้นทางของคาเฟ่ ตรอกซอย และที่พักที่มีอยู่จริง — ไม่ใช่ลิสต์สิบอันดับทั่วไป',
      howT3Title: 'วางแผนและจองในที่เดียว',
      howT3Desc: 'จัดทริปด้วยความช่วยเหลือจาก AI แล้วจองสิ่งที่ถูกใจได้ใน KINNSO เลย',
      howC1Title: 'สแกนโปรไฟล์ของคุณ',
      howC1Desc: 'เชื่อมต่อโซเชียลของคุณ แล้ว KINNSO จะวาดแผนที่เมืองที่คุณรู้จักจริงๆ',
      howC2Title: 'เผยแพร่ไกด์ของคุณ',
      howC2Desc: 'เปลี่ยนเส้นทางของคุณให้เป็นไกด์ที่นักเดินทางตามรอย เซฟ และจองได้',
      howC3Title: 'สร้างรายได้จากความรู้',
      howC3Desc: 'มิชชันจากแบรนด์ ดีลพันธมิตร และค่าคอมมิชชันจากการจอง — จ่ายกันตรงไปตรงมา',
      howM1Title: 'ลงมิชชัน',
      howM1Desc: 'ส่งบรีฟถึงครีเอเตอร์ที่ผ่านการตรวจสอบ และรู้จักเมืองกับลูกค้าของคุณจริงๆ',
      howM2Title: 'ได้รับการแนะนำแบบจริงใจ',
      howM2Desc: 'ครีเอเตอร์นำประสบการณ์ของคุณไปไว้ในไกด์ที่นักเดินทางเชื่อถือ',
      howM3Title: 'เห็นผลลัพธ์ชัดเจน',
      howM3Desc: 'ติดตามการแนะนำของครีเอเตอร์ได้แล้ววันนี้ — และเห็นยอดจองแบบระบุที่มาเมื่อเปิดจองตรง',
      featuredEyebrow: 'ไกด์แนะนำ',
      featuredHeading: 'ไกด์ที่ควรแพ็กใส่กระเป๋า',
      featuredSub: 'ไกด์เมืองล่าสุดที่ครีเอเตอร์ KINNSO เผยแพร่',
      featuredSeeAll: 'ดูไกด์ทั้งหมด',
      featuredEmpty: 'ยังไม่มีไกด์ที่เผยแพร่ — ชุดแรกกำลังมา',
      agentEyebrow: 'ผู้ช่วย AI ของ KINNSO',
      agentTitle: 'AI ที่วางแผนทริปเหมือนคนท้องถิ่น',
      agentBody: 'บอกมันว่าคุณจะไปไหนและชอบเที่ยวแบบไหน — ผู้ช่วย AI ของ KINNSO จะใช้ไกด์จากครีเอเตอร์ตัวจริง ไม่ใช่ลิสต์สำเร็จรูป มาช่วยออกแบบทริปของคุณ ตอนนี้อยู่ในช่วงพรีวิวส่วนตัว เรากำลังสอนมันให้รู้จักทุกตรอกซอกซอย',
      agentCta: 'เข้าคิวรอใช้ผู้ช่วย AI',
      agentNote: 'อยู่ในช่วงพรีวิวส่วนตัว — แชตวางแผนทริปแบบสดกำลังจะมา',
      articlesEyebrow: 'จากบันทึกเดินทาง',
      articlesHeading: 'เรื่องเล่าจากหน้างานจริง',
      articlesSeeAll: 'อ่านบทความทั้งหมด',
      sessionsEyebrow: 'คอมมูนิตี้เซสชัน',
      sessionsHeading: 'ไลฟ์สดจากที่ที่คุณกำลังจะไป',
      sessionsSub: 'บรีฟสดวงเล็กๆ ที่ครีเอเตอร์เจ้าของไกด์เป็นผู้ดำเนินรายการเอง',
      merchantEyebrow: 'สำหรับร้านค้า',
      merchantHeading: 'นำประสบการณ์ของคุณเข้าไปอยู่ในไกด์ที่นักเดินทางเชื่อถือ',
      merchantBullet1: 'ร่วมงานกับครีเอเตอร์ที่ผ่านการตรวจสอบและรู้จักเมืองของคุณอยู่แล้ว',
      merchantBullet2: 'เข้าถึงนักเดินทางตอนที่เขากำลังวางแผน — ในไกด์ของจริง ไม่ใช่พื้นที่โฆษณา',
      merchantBullet3: 'ติดตามทุกความร่วมมือในไปป์ไลน์เดียวที่โปร่งใส',
      merchantCta: 'ดูบริการ KINNSO สำหรับร้านค้า',
      creatorEyebrow: 'สำหรับครีเอเตอร์',
      creatorHeading: 'ความรู้เรื่องเมืองของคุณมีค่ามากกว่าแค่ยอดวิว',
      creatorBullet1: 'เผยแพร่ไกด์ที่ทำงานให้คุณต่อเนื่องแม้โพสต์ผ่านไปนาน',
      creatorBullet2: 'รับมิชชันจากร้านค้าที่เห็นคุณค่าของเส้นทางคุณ',
      creatorBullet3: 'รายได้แบบตรงไปตรงมา — งานจริง เงินจริง ไม่มีตัวเลขปลอม',
      creatorCta: 'สมัครเป็นครีเอเตอร์',
      // R1B-legacy — pre-rebuild HomeView only; Task 7 deletes these with their consumer:
      // (keep this file's existing heroPill…merchantsCta lines here, values unchanged)
    },
  ```
  ```ts
      home: {
        title: 'ไกด์ท่องเที่ยวจากครีเอเตอร์ตัวจริง',
        description: 'ค้นพบไกด์เมืองจากทราเวลครีเอเตอร์ที่เชื่อถือได้ วางแผนด้วยผู้ช่วย AI ของ KINNSO และจองทริปที่คุณอยากไปจริงๆ ได้ในที่เดียว',
      },
  ```

- [ ] Patch the ONE hardcoded literal in `apps/web/tests/kinnso.HomeView.test.tsx` (the old HomeView now renders the new shared-key hero copy). Replace:

  ```ts
      expect(screen.getByRole('heading', { level: 1, name: 'Trips that pay their way.' })).toBeTruthy()
  ```

  with:

  ```ts
      expect(screen.getByRole('heading', { level: 1, name: 'Real creators. Real places. Book the trip you actually want.' })).toBeTruthy()
  ```

  (The `'Creator route / HK -> JP -> TW'` assertion stays — `heroPill` is a legacy key whose value is unchanged.)

- [ ] Verify everything is green:
  ```bash
  pnpm --filter web typecheck
  cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts tests/kinnso.HomeView.test.tsx tests/home.host.test.tsx
  ```
  Expected: ALL PASS (parity sees identical shapes in all 7; the old homepage tests pass against the transitional values).
- [ ] Commit:
  ```bash
  git add apps/web/lib/i18n/messages apps/web/tests/kinnso.HomeView.test.tsx
  git commit -m "i18n(web): new R1B home + seo.home strings across all 7 locales (legacy keys ride until the rebuild)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 4 — Section components: Hero + StatsBar

**Files:**
- Create: `apps/web/components/kinnso/home/Hero.tsx`, `apps/web/components/kinnso/home/StatsBar.tsx`
- Create: `apps/web/tests/kinnso.home-hero-stats.test.tsx`
- Test: `apps/web/tests/kinnso.home-hero-stats.test.tsx`

House pattern notes: guide covers render with plain `<img>` (same as `GuideCard.tsx` — no next/image remotePatterns config exists for Supabase storage hosts). `Eyebrow` renders clay text — fine here because both sections sit on paper/white (the `k2-eyebrow` AA note in globals.css).

- [ ] Write the failing test. Create `apps/web/tests/kinnso.home-hero-stats.test.tsx` with EXACTLY:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'

  afterEach(cleanup)

  import { Hero } from '@/components/kinnso/home/Hero'
  import { StatsBar } from '@/components/kinnso/home/StatsBar'
  import en from '@/lib/i18n/messages/en'

  const guide = (slug: string, cover = `/covers/${slug}.jpg`) => ({
    slug, title: `Guide ${slug}`, cover, city: 'Osaka', saves: 3, creatorHandle: 'mei',
  })

  describe('Hero (section 1)', () => {
    it('renders the locked headline, sub, and both CTAs', () => {
      render(<Hero locale="en" t={en.home} guides={[]} />)
      expect(
        screen.getByRole('heading', { level: 1, name: 'Real creators. Real places. Book the trip you actually want.' }),
      ).toBeTruthy()
      expect(screen.getByText('Discover guides from trusted travel creators. Plan with AI. Book in one place.')).toBeTruthy()
      expect(screen.getByRole('link', { name: new RegExp(en.home.heroPrimaryCta) }).getAttribute('href')).toBe('/en/explore')
      expect(screen.getByRole('link', { name: en.home.heroSecondaryCta }).getAttribute('href')).toBe('/en/creators')
    })

    it('renders an editorial collage from REAL guide covers when 3+ exist', () => {
      const { container } = render(<Hero locale="en" t={en.home} guides={[guide('a'), guide('b'), guide('c'), guide('d')]} />)
      const imgs = container.querySelectorAll('img')
      expect(imgs.length).toBe(3)
      expect(imgs[0].getAttribute('src')).toBe('/covers/a.jpg')
    })

    it('renders a purely typographic hero with fewer than 3 covers — no empty frames, no stock photos', () => {
      const { container } = render(<Hero locale="en" t={en.home} guides={[guide('a'), guide('b', '')]} />)
      expect(container.querySelectorAll('img').length).toBe(0)
    })
  })

  describe('StatsBar (section 2 — threshold-gated honesty)', () => {
    const t = en.home
    it('renders nothing when stats are unavailable', () => {
      const { container } = render(<StatsBar locale="en" t={t} stats={null} />)
      expect(container.innerHTML).toBe('')
    })
    it('renders nothing when fewer than 2 stats pass their thresholds', () => {
      const { container } = render(<StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 3, destinations: 2 }} />)
      expect(container.innerHTML).toBe('')
    })
    it('renders only stats at/above threshold — never zeros', () => {
      render(<StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 48, destinations: 0 }} />)
      expect(screen.getByText('12')).toBeTruthy()
      expect(screen.getByText('48')).toBeTruthy()
      expect(screen.getByText(t.statCreators)).toBeTruthy()
      expect(screen.queryByText(t.statDestinations)).toBeNull()
      expect(screen.queryByText('0')).toBeNull()
    })
    it('renders all three when all pass (boundary values count as passing)', () => {
      render(<StatsBar locale="en" t={t} stats={{ activeCreators: 5, publishedGuides: 10, destinations: 3 }} />)
      expect(screen.getByText(t.statCreators)).toBeTruthy()
      expect(screen.getByText(t.statGuides)).toBeTruthy()
      expect(screen.getByText(t.statDestinations)).toBeTruthy()
    })
  })
  ```

- [ ] Run it and watch it fail (modules not found):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.home-hero-stats.test.tsx
  ```

- [ ] Create `apps/web/components/kinnso/home/Hero.tsx` with EXACTLY:

  ```tsx
  import Link from 'next/link'
  import { ArrowRight } from 'lucide-react'
  import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
  // The Guide TYPE still lives in creator-mock until the R1C sweep relocates it.
  import type { Guide } from '@/lib/creator-mock'
  import type { Locale } from '@/lib/i18n/config'
  import type { Messages } from '@/lib/i18n/messages/en'

  /**
   * Section 1 — hero. Imagery is REAL published guide covers (editorial collage
   * of up to 3). With fewer than 3 covers we render a purely typographic hero —
   * no empty frames, no stock photography, no Unsplash hotlinks anywhere on the
   * rebuilt homepage. Primary CTA targets /explore until R4 flips it to the
   * live AI agent.
   */
  export function Hero({ locale, t, guides }: { locale: Locale; t: Messages['home']; guides: Guide[] }) {
    const p = (path: string) => `/${locale}${path}`
    const covers = guides.filter((g) => g.cover).slice(0, 3)
    const showCollage = covers.length >= 3
    return (
      <section className="border-b border-kinnso2-line bg-kinnso2-paper">
        <div className={`k2-container grid gap-12 py-16 md:py-24 ${showCollage ? 'lg:grid-cols-[1.1fr_0.9fr]' : ''}`}>
          <div className="flex flex-col justify-center">
            <Eyebrow>{t.heroEyebrow}</Eyebrow>
            <h1 className="k2-display mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-kinnso2-ink md:text-6xl">
              {t.heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-kinnso2-ink/70">{t.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* → /explore until R4: the live agent then becomes the primary planning entry. */}
              <Link href={p('/explore')} className="k2-btn-primary">
                {t.heroPrimaryCta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href={p('/creators')} className="k2-btn-ghost">{t.heroSecondaryCta}</Link>
            </div>
          </div>
          {showCollage ? (
            <div className="grid grid-cols-2 gap-3 self-center">
              <div className="row-span-2 overflow-hidden rounded-[4px] border border-kinnso2-line bg-kinnso2-sand">
                <img
                  src={covers[0].cover}
                  alt={covers[0].title}
                  width={640}
                  height={880}
                  loading="eager"
                  className="h-full w-full object-cover"
                />
              </div>
              {covers.slice(1).map((g) => (
                <div key={g.slug} className="aspect-[4/3] overflow-hidden rounded-[4px] border border-kinnso2-line bg-kinnso2-sand">
                  <img
                    src={g.cover}
                    alt={g.title}
                    width={640}
                    height={480}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    )
  }
  ```

- [ ] Create `apps/web/components/kinnso/home/StatsBar.tsx` with EXACTLY:

  ```tsx
  import { MIN_VISIBLE_STATS, STAT_THRESHOLDS, type PlatformStats } from '@/lib/home/queries'
  import type { Locale } from '@/lib/i18n/config'
  import type { Messages } from '@/lib/i18n/messages/en'

  /**
   * Section 2 — social-proof bar. Honesty rules (master spec §4.1 + locked R1B
   * decisions): a stat below its threshold is NOT rendered (no zeros, no fake
   * "growing fast" numbers), and fewer than MIN_VISIBLE_STATS passing stats
   * hides the whole bar. Server component; numbers formatted per locale.
   */
  export function StatsBar({ locale, t, stats }: { locale: Locale; t: Messages['home']; stats: PlatformStats | null }) {
    if (!stats) return null
    const entries = [
      { key: 'creators', value: stats.activeCreators, min: STAT_THRESHOLDS.activeCreators, label: t.statCreators },
      { key: 'guides', value: stats.publishedGuides, min: STAT_THRESHOLDS.publishedGuides, label: t.statGuides },
      { key: 'destinations', value: stats.destinations, min: STAT_THRESHOLDS.destinations, label: t.statDestinations },
    ].filter((s) => s.value >= s.min)
    if (entries.length < MIN_VISIBLE_STATS) return null
    const fmt = new Intl.NumberFormat(locale)
    return (
      <div className="border-b border-kinnso2-line bg-kinnso2-paper">
        <ul className="k2-container flex flex-wrap items-baseline gap-x-12 gap-y-4 py-8">
          {entries.map((s) => (
            <li key={s.key} className="flex items-baseline gap-2">
              <span className="k2-display text-3xl font-semibold text-kinnso2-ink">{fmt.format(s.value)}</span>
              <span className="text-sm text-kinnso2-ink/60">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  ```

- [ ] Re-run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.home-hero-stats.test.tsx
  ```
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/home apps/web/tests/kinnso.home-hero-stats.test.tsx
  git commit -m "feat(web): homepage hero + threshold-gated stats bar" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 5 — Section component: HowItWorks (client tabs)

**Files:**
- Create: `apps/web/components/kinnso/home/HowItWorks.tsx`
- Create: `apps/web/tests/kinnso.home-how-it-works.test.tsx`
- Test: `apps/web/tests/kinnso.home-how-it-works.test.tsx`

- [ ] Write the failing test. Create `apps/web/tests/kinnso.home-how-it-works.test.tsx` with EXACTLY:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach } from 'vitest'
  import { render, screen, cleanup, fireEvent } from '@testing-library/react'

  afterEach(cleanup)

  import { HowItWorks } from '@/components/kinnso/home/HowItWorks'
  import en from '@/lib/i18n/messages/en'

  describe('HowItWorks (section 3)', () => {
    it('defaults to the traveller steps', () => {
      render(<HowItWorks t={en.home} />)
      expect(screen.getByRole('tab', { name: en.home.howTabTravellers }).getAttribute('aria-selected')).toBe('true')
      expect(screen.getByText(en.home.howT1Title)).toBeTruthy()
      expect(screen.getByText(en.home.howT3Desc)).toBeTruthy()
      expect(screen.queryByText(en.home.howC1Title)).toBeNull()
      expect(screen.queryByText(en.home.howM1Title)).toBeNull()
    })

    it('switches to creator steps on tab click (pure client state — no URL change)', () => {
      render(<HowItWorks t={en.home} />)
      fireEvent.click(screen.getByRole('tab', { name: en.home.howTabCreators }))
      expect(screen.getByRole('tab', { name: en.home.howTabCreators }).getAttribute('aria-selected')).toBe('true')
      expect(screen.getByText(en.home.howC1Title)).toBeTruthy()
      expect(screen.queryByText(en.home.howT1Title)).toBeNull()
    })

    it('switches to merchant steps', () => {
      render(<HowItWorks t={en.home} />)
      fireEvent.click(screen.getByRole('tab', { name: en.home.howTabMerchants }))
      expect(screen.getByText(en.home.howM1Title)).toBeTruthy()
      expect(screen.getByText(en.home.howM3Desc)).toBeTruthy()
    })
  })
  ```

- [ ] Run it and watch it fail (module not found):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.home-how-it-works.test.tsx
  ```

- [ ] Create `apps/web/components/kinnso/home/HowItWorks.tsx` with EXACTLY:

  ```tsx
  'use client'
  import { useState } from 'react'
  import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
  import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
  import type { Messages } from '@/lib/i18n/messages/en'

  type Audience = 'traveller' | 'creator' | 'merchant'

  /**
   * Section 3 — how it works. Traveller steps by default with For Creators /
   * For Merchants toggle tabs. Pure client tab state — deliberately NO URL
   * state (locked R1B decision), so the homepage stays a single static route.
   */
  export function HowItWorks({ t }: { t: Messages['home'] }) {
    const [audience, setAudience] = useState<Audience>('traveller')
    const tabs: { id: Audience; label: string }[] = [
      { id: 'traveller', label: t.howTabTravellers },
      { id: 'creator', label: t.howTabCreators },
      { id: 'merchant', label: t.howTabMerchants },
    ]
    const steps: Record<Audience, { title: string; desc: string }[]> = {
      traveller: [
        { title: t.howT1Title, desc: t.howT1Desc },
        { title: t.howT2Title, desc: t.howT2Desc },
        { title: t.howT3Title, desc: t.howT3Desc },
      ],
      creator: [
        { title: t.howC1Title, desc: t.howC1Desc },
        { title: t.howC2Title, desc: t.howC2Desc },
        { title: t.howC3Title, desc: t.howC3Desc },
      ],
      merchant: [
        { title: t.howM1Title, desc: t.howM1Desc },
        { title: t.howM2Title, desc: t.howM2Desc },
        { title: t.howM3Title, desc: t.howM3Desc },
      ],
    }
    return (
      <SectionShell>
        <Eyebrow>{t.howEyebrow}</Eyebrow>
        <h2 className="k2-display mt-3 max-w-xl text-3xl font-semibold text-kinnso2-ink md:text-4xl">{t.howHeading}</h2>
        <p className="mt-3 max-w-xl text-kinnso2-ink/70">{t.howSub}</p>
        <div role="tablist" aria-label={t.howEyebrow} className="mt-8 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`how-tab-${tab.id}`}
              aria-selected={audience === tab.id}
              aria-controls="how-steps"
              onClick={() => setAudience(tab.id)}
              className={`min-h-[40px] rounded-[3px] px-4 py-2 text-sm font-semibold tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay ${
                audience === tab.id
                  ? 'bg-kinnso2-ink text-kinnso2-paper'
                  : 'border border-kinnso2-ink/25 text-kinnso2-ink hover:border-kinnso2-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div id="how-steps" role="tabpanel" aria-labelledby={`how-tab-${audience}`}>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {steps[audience].map((s, i) => (
              <li key={s.title} className="border-t-2 border-kinnso2-ink pt-4">
                <span className="k2-display text-sm font-semibold text-kinnso2-clay">{`0${i + 1}`}</span>
                <h3 className="mt-2 text-lg font-semibold text-kinnso2-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-kinnso2-ink/70">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </SectionShell>
    )
  }
  ```

- [ ] Re-run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.home-how-it-works.test.tsx
  ```
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/home/HowItWorks.tsx apps/web/tests/kinnso.home-how-it-works.test.tsx
  git commit -m "feat(web): homepage how-it-works audience tabs" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 6 — Section components: AgentTeaser + MerchantValue + CreatorCta

**Files:**
- Create: `apps/web/components/kinnso/home/AgentTeaser.tsx`, `apps/web/components/kinnso/home/MerchantValue.tsx`, `apps/web/components/kinnso/home/CreatorCta.tsx`
- Create: `apps/web/tests/kinnso.home-bands.test.tsx`
- Test: `apps/web/tests/kinnso.home-bands.test.tsx`

Color discipline (locked): `kinnso2-sun` (ochre) appears ONLY on dark ink (AgentTeaser eyebrow) or as decorative dots (CreatorCta bullets on moss) — never as text on paper, never under white text. Body copy on dark bands uses `text-kinnso2-paper/70` or stronger; `paper/50` is reserved for ≥12px meta text like the Footer rights bar.

- [ ] Write the failing test. Create `apps/web/tests/kinnso.home-bands.test.tsx` with EXACTLY:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'

  afterEach(cleanup)

  import { AgentTeaser } from '@/components/kinnso/home/AgentTeaser'
  import { MerchantValue } from '@/components/kinnso/home/MerchantValue'
  import { CreatorCta } from '@/components/kinnso/home/CreatorCta'
  import en from '@/lib/i18n/messages/en'

  describe('AgentTeaser (section 5 — waitlist framing)', () => {
    it('shows value copy + waitlist CTA to /agent and NO email capture', () => {
      const { container } = render(<AgentTeaser locale="en" t={en.home} />)
      expect(screen.getByText(en.home.agentTitle)).toBeTruthy()
      expect(screen.getByText(en.home.agentBody)).toBeTruthy()
      expect(screen.getByText(en.home.agentNote)).toBeTruthy()
      expect(screen.getByRole('link', { name: new RegExp(en.home.agentCta) }).getAttribute('href')).toBe('/en/agent')
      expect(container.querySelector('input')).toBeNull()
      expect(container.querySelector('form')).toBeNull()
    })
  })

  describe('MerchantValue (section 8)', () => {
    it('renders the three benefit bullets and the CTA to /merchants', () => {
      render(<MerchantValue locale="en" t={en.home} />)
      for (const b of [en.home.merchantBullet1, en.home.merchantBullet2, en.home.merchantBullet3]) {
        expect(screen.getByText(b)).toBeTruthy()
      }
      expect(screen.getByRole('link', { name: en.home.merchantCta }).getAttribute('href')).toBe('/en/merchants')
    })
  })

  describe('CreatorCta (section 9)', () => {
    it('renders the three bullets and the CTA to /sign-up', () => {
      render(<CreatorCta locale="en" t={en.home} />)
      for (const b of [en.home.creatorBullet1, en.home.creatorBullet2, en.home.creatorBullet3]) {
        expect(screen.getByText(b)).toBeTruthy()
      }
      expect(screen.getByRole('link', { name: en.home.creatorCta }).getAttribute('href')).toBe('/en/sign-up')
    })
  })
  ```

- [ ] Run it and watch it fail (modules not found):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.home-bands.test.tsx
  ```

- [ ] Create `apps/web/components/kinnso/home/AgentTeaser.tsx` with EXACTLY:

  ```tsx
  import Link from 'next/link'
  import { ArrowRight } from 'lucide-react'
  import type { Locale } from '@/lib/i18n/config'
  import type { Messages } from '@/lib/i18n/messages/en'

  /**
   * Section 5 — AI Agent block, WAITLIST framing (master spec rule: never
   * feature a non-live agent). Value copy + CTA to /{locale}/agent only —
   * deliberately NO email capture in R1B. R4 flips this band to "Try the AI
   * Agent" with live chat. Ochre eyebrow is allowed here: it sits on dark ink.
   * Hand-rolled eyebrow (not <Eyebrow>) because that component is clay-on-paper.
   */
  export function AgentTeaser({ locale, t }: { locale: Locale; t: Messages['home'] }) {
    return (
      <section className="bg-kinnso2-ink py-16 md:py-24">
        <div className="k2-container">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso2-sun">{t.agentEyebrow}</p>
          <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso2-paper md:text-4xl">{t.agentTitle}</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-kinnso2-paper/70">{t.agentBody}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href={`/${locale}/agent`} className="k2-btn-primary">
              {t.agentCta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <p className="text-sm text-kinnso2-paper/70">{t.agentNote}</p>
          </div>
        </div>
      </section>
    )
  }
  ```

- [ ] Create `apps/web/components/kinnso/home/MerchantValue.tsx` with EXACTLY:

  ```tsx
  import Link from 'next/link'
  import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
  import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
  import type { Locale } from '@/lib/i18n/config'
  import type { Messages } from '@/lib/i18n/messages/en'

  /** Section 8 — merchant value prop: three honest benefit bullets on paper. */
  export function MerchantValue({ locale, t }: { locale: Locale; t: Messages['home'] }) {
    const bullets = [t.merchantBullet1, t.merchantBullet2, t.merchantBullet3]
    return (
      <SectionShell className="k2-hairline">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>{t.merchantEyebrow}</Eyebrow>
            <h2 className="k2-display mt-3 max-w-md text-3xl font-semibold text-kinnso2-ink md:text-4xl">
              {t.merchantHeading}
            </h2>
          </div>
          <div>
            <ul className="space-y-4">
              {bullets.map((b) => (
                <li key={b} className="flex gap-3 leading-relaxed text-kinnso2-ink/80">
                  <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-kinnso2-clay" />
                  {b}
                </li>
              ))}
            </ul>
            {/* → /merchants until R1C ships the /for-merchants landing; retarget there in the R1C sweep. */}
            <Link href={`/${locale}/merchants`} className="k2-btn-ghost mt-8">{t.merchantCta}</Link>
          </div>
        </div>
      </SectionShell>
    )
  }
  ```

- [ ] Create `apps/web/components/kinnso/home/CreatorCta.tsx` with EXACTLY:

  ```tsx
  import Link from 'next/link'
  import type { Locale } from '@/lib/i18n/config'
  import type { Messages } from '@/lib/i18n/messages/en'

  /**
   * Section 9 — creator recruitment. Moss band for editorial contrast with the
   * ink agent band; paper-on-moss text with a paper button (clay would fight
   * the moss). Sun dots are decorative accents only.
   */
  export function CreatorCta({ locale, t }: { locale: Locale; t: Messages['home'] }) {
    const bullets = [t.creatorBullet1, t.creatorBullet2, t.creatorBullet3]
    return (
      <section className="bg-kinnso2-moss py-16 md:py-24">
        <div className="k2-container">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso2-paper/70">{t.creatorEyebrow}</p>
          <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso2-paper md:text-4xl">{t.creatorHeading}</h2>
          <ul className="mt-6 max-w-2xl space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3 leading-relaxed text-kinnso2-paper/85">
                <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-kinnso2-sun" />
                {b}
              </li>
            ))}
          </ul>
          <Link
            href={`/${locale}/sign-up`}
            className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso2-paper px-6 py-2.5 text-sm font-semibold tracking-wide text-kinnso2-ink transition hover:bg-white"
          >
            {t.creatorCta}
          </Link>
        </div>
      </section>
    )
  }
  ```

- [ ] Re-run — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/kinnso.home-bands.test.tsx
  ```
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/home apps/web/tests/kinnso.home-bands.test.tsx
  git commit -m "feat(web): homepage agent teaser, merchant value, creator CTA bands" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 7 — HomeView rebuild + route wiring + legacy-key deletion

**Files:**
- Modify (full rewrite): `apps/web/components/kinnso/pages/HomeView.tsx`
- Modify (full rewrite): `apps/web/app/[locale]/page.tsx`
- Modify (full rewrite): `apps/web/tests/kinnso.HomeView.test.tsx`, `apps/web/tests/home.host.test.tsx`
- Modify: `apps/web/tests/kinnso.route-parity.test.tsx` (HomeView invocation only)
- Modify: `apps/web/lib/i18n/messages/*.ts` ×7 (delete the 17 `// R1B-legacy` keys — same edit as their only consumer's rebuild)
- Test: all five test files above + `tests/i18n.locale-parity.test.ts`

This task is atomic on purpose: HomeView's props change, so its page host, its tests, and the legacy i18n keys must move together for every gate (typecheck, parity, vitest) to stay green at the commit boundary.

- [ ] Rewrite `apps/web/tests/kinnso.HomeView.test.tsx` ENTIRELY with the failing spec:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'

  afterEach(cleanup)

  import HomeView from '@/components/kinnso/pages/HomeView'
  import en from '@/lib/i18n/messages/en'

  const guides = [
    { slug: 'real-osaka', title: 'Real Osaka Guide', cover: '/a.jpg', city: 'Osaka', saves: 12, creatorHandle: 'mei' },
    { slug: 'real-seoul', title: 'Real Seoul Guide', cover: '/b.jpg', city: 'Seoul', saves: 7, creatorHandle: 'jun' },
    { slug: 'real-tokyo', title: 'Real Tokyo Guide', cover: '/c.jpg', city: 'Tokyo', saves: 5, creatorHandle: 'aki' },
  ]
  const stats = { activeCreators: 12, publishedGuides: 48, destinations: 9 }
  const testimonials = [
    { id: 't1', quote: 'KINNSO paid me for what I already knew.', authorName: 'Mei', authorRole: 'creator' as const },
  ]
  const articles = [
    {
      url: 'osaka-food-streets', category: 'destination', thumbnails: ['/th.jpg'], rating: null,
      published_at: '2026-06-01T00:00:00Z', edit_at: null, title: 'Osaka food streets', summary: 'Where locals actually eat.',
    },
  ]
  const sessions = [{ id: 's1', title: 'Tokyo briefing', hostHandle: 'aki', startsAt: '2026-08-01T10:00:00Z' }]

  const base = { locale: 'en' as const, t: en.home, guides, stats, testimonials, articles, sessions }

  describe('HomeView (R1B 10-section homepage)', () => {
    it('renders the locked hero with both CTAs and a real-cover collage', () => {
      const { container } = render(<HomeView {...base} />)
      expect(
        screen.getByRole('heading', { level: 1, name: 'Real creators. Real places. Book the trip you actually want.' }),
      ).toBeTruthy()
      expect(screen.getByRole('link', { name: new RegExp(en.home.heroPrimaryCta) }).getAttribute('href')).toBe('/en/explore')
      expect(screen.getByRole('link', { name: en.home.heroSecondaryCta }).getAttribute('href')).toBe('/en/creators')
      expect(container.querySelector('img[src="/a.jpg"]')).toBeTruthy()
    })

    it('renders passing stats and the testimonial pull-quote with its role label', () => {
      render(<HomeView {...base} />)
      expect(screen.getByText('12')).toBeTruthy()
      expect(screen.getByText(en.home.statGuides)).toBeTruthy()
      expect(screen.getByText(/KINNSO paid me for what I already knew\./)).toBeTruthy()
      expect(screen.getByText(new RegExp(`Mei.*${en.home.roleCreator}`))).toBeTruthy()
    })

    it('renders guides as editorial cards linking to guide detail routes', () => {
      render(<HomeView {...base} />)
      expect(screen.getByRole('link', { name: /Real Osaka Guide/ }).getAttribute('href')).toBe('/en/g/real-osaka')
      expect(screen.getByRole('link', { name: new RegExp(en.home.featuredSeeAll) }).getAttribute('href')).toBe('/en/explore')
    })

    it('renders the articles highlight linking into /articles/<category>/<url>', () => {
      render(<HomeView {...base} />)
      expect(screen.getByRole('link', { name: /Osaka food streets/ }).getAttribute('href')).toBe(
        '/en/articles/destinations/osaka-food-streets',
      )
    })

    it('renders sessions when real ones exist', () => {
      render(<HomeView {...base} />)
      expect(screen.getByText(en.home.sessionsHeading)).toBeTruthy()
      expect(screen.getByText('Tokyo briefing')).toBeTruthy()
      expect(screen.getByText('@aki')).toBeTruthy()
    })

    it('merchant and creator CTAs land on their locked routes', () => {
      render(<HomeView {...base} />)
      expect(screen.getByRole('link', { name: en.home.merchantCta }).getAttribute('href')).toBe('/en/merchants')
      expect(screen.getByRole('link', { name: en.home.creatorCta }).getAttribute('href')).toBe('/en/sign-up')
      expect(screen.getByRole('link', { name: new RegExp(en.home.agentCta) }).getAttribute('href')).toBe('/en/agent')
    })

    it('data-gates every proof section: nothing fake when the data is empty', () => {
      const { container } = render(
        <HomeView {...base} guides={[]} stats={null} testimonials={[]} articles={[]} sessions={[]} />,
      )
      expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
      expect(screen.queryByText(en.home.sessionsHeading)).toBeNull()
      expect(screen.queryByText(en.home.articlesHeading)).toBeNull()
      expect(container.querySelector('blockquote')).toBeNull()
      expect(container.querySelector('img')).toBeNull() // typographic hero, no empty frames
    })

    it('contains no Unsplash imagery and no legacy mock widgets', () => {
      const { container } = render(<HomeView {...base} />)
      expect(container.querySelector('img[src*="unsplash"]')).toBeNull()
      expect(container.querySelector('.k-ticket')).toBeNull()
    })
  })
  ```

- [ ] Run it and watch it fail (old HomeView has neither the props nor the sections):
  ```bash
  cd apps/web && npx vitest run tests/kinnso.HomeView.test.tsx
  ```

- [ ] Rewrite `apps/web/components/kinnso/pages/HomeView.tsx` ENTIRELY:

  ```tsx
  import Link from 'next/link'
  import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
  import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
  import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
  import { AgentTeaser } from '@/components/kinnso/home/AgentTeaser'
  import { CreatorCta } from '@/components/kinnso/home/CreatorCta'
  import { Hero } from '@/components/kinnso/home/Hero'
  import { HowItWorks } from '@/components/kinnso/home/HowItWorks'
  import { MerchantValue } from '@/components/kinnso/home/MerchantValue'
  import { StatsBar } from '@/components/kinnso/home/StatsBar'
  import type { SearchResult } from '@/lib/articles/queries'
  // The Guide TYPE stays sourced from creator-mock until the R1C sweep relocates it.
  import type { Guide } from '@/lib/creator-mock'
  import type { PlatformStats, Testimonial, UpcomingSession } from '@/lib/home/queries'
  import { toUrlCategory, type Locale } from '@/lib/i18n/config'
  import type { Messages } from '@/lib/i18n/messages/en'

  /**
   * R1B homepage — the 10 sections of master spec §4.1, in order:
   *  1 Hero · 2 Social proof (stats bar + pull-quotes) · 3 How it works ·
   *  4 Featured guides · 5 AI Agent (waitlist) · 6 Articles highlight ·
   *  7 Community Sessions (data-gated until R5) · 8 Merchant value ·
   *  9 Creator CTA · 10 Footer (rendered by SiteChrome — no work here).
   * Every proof section is data-gated: empty data renders nothing, never filler.
   */
  export function HomeView({
    locale, t, guides, stats, testimonials, articles, sessions,
  }: {
    locale: Locale
    t: Messages['home']
    guides: Guide[]
    stats: PlatformStats | null
    testimonials: Testimonial[]
    articles: SearchResult['items']
    sessions: UpcomingSession[]
  }) {
    const p = (path: string) => `/${locale}${path}`
    const roleLabel: Record<Testimonial['authorRole'], string> = {
      creator: t.roleCreator, traveller: t.roleTraveller, merchant: t.roleMerchant,
    }
    const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
    const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })

    return (
      <div className="bg-kinnso2-paper font-k2-sans">
        {/* 1 — Hero (locked copy; real covers or typographic fallback) */}
        <Hero locale={locale} t={t} guides={guides} />

        {/* 2 — Social proof: threshold-gated counts + curated pull-quotes */}
        <StatsBar locale={locale} t={t} stats={stats} />
        {testimonials.length > 0 ? (
          <SectionShell className="k2-hairline">
            <ul className="grid gap-10 md:grid-cols-3">
              {testimonials.map((q) => (
                <li key={q.id}>
                  <figure>
                    <blockquote className="k2-display text-xl leading-snug text-kinnso2-ink">
                      &ldquo;{q.quote}&rdquo;
                    </blockquote>
                    <figcaption className="mt-3 text-sm text-kinnso2-ink/60">
                      — {q.authorName} · {roleLabel[q.authorRole]}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </SectionShell>
        ) : null}

        {/* 3 — How it works (traveller default; client tabs, no URL state) */}
        <HowItWorks t={t} />

        {/* 4 — Featured guides (up to 6, real DB) */}
        <SectionShell className="k2-hairline">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>{t.featuredEyebrow}</Eyebrow>
              <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso2-ink md:text-4xl">{t.featuredHeading}</h2>
              <p className="mt-2 text-kinnso2-ink/70">{t.featuredSub}</p>
            </div>
            <Link href={p('/explore')} className="text-sm font-semibold text-kinnso2-clay transition hover:text-kinnso2-clay-deep">
              {t.featuredSeeAll} →
            </Link>
          </div>
          {guides.length === 0 ? (
            <p className="mt-8 text-kinnso2-ink/60">{t.featuredEmpty}</p>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {guides.slice(0, 6).map((g) => (
                <Link key={g.slug} href={p(`/g/${g.slug}`)} className="group">
                  <EditorialCard
                    media={
                      g.cover ? (
                        <img
                          src={g.cover}
                          alt={g.title}
                          width={640}
                          height={480}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : undefined
                    }
                    kicker={g.city}
                    title={g.title}
                  >
                    @{g.creatorHandle}
                  </EditorialCard>
                </Link>
              ))}
            </div>
          )}
        </SectionShell>

        {/* 5 — AI Agent (waitlist framing until R4) */}
        <AgentTeaser locale={locale} t={t} />

        {/* 6 — Articles highlight (3 latest; hidden when none) */}
        {articles.length > 0 ? (
          <SectionShell>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>{t.articlesEyebrow}</Eyebrow>
                <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso2-ink md:text-4xl">{t.articlesHeading}</h2>
              </div>
              <Link href={p('/articles')} className="text-sm font-semibold text-kinnso2-clay transition hover:text-kinnso2-clay-deep">
                {t.articlesSeeAll} →
              </Link>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {articles.slice(0, 3).map((a) => {
                const cat = toUrlCategory(a.category)
                if (!cat) return null
                return (
                  <Link key={a.url} href={p(`/articles/${cat}/${a.url}`)} className="group">
                    <EditorialCard
                      media={
                        a.thumbnails[0] ? (
                          <img
                            src={a.thumbnails[0]}
                            alt={a.title ?? ''}
                            width={640}
                            height={480}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                        ) : undefined
                      }
                      kicker={a.published_at ? dateFmt.format(new Date(a.published_at)) : undefined}
                      title={a.title ?? a.url}
                    >
                      {a.summary}
                    </EditorialCard>
                  </Link>
                )
              })}
            </div>
          </SectionShell>
        ) : null}

        {/* 7 — Community Sessions: DATA-GATED. getUpcomingSessions() returns []
            until R5 ships community_sessions, so this renders null today — no
            fake content, no empty carousel. */}
        {sessions.length > 0 ? (
          <SectionShell className="k2-hairline">
            <Eyebrow>{t.sessionsEyebrow}</Eyebrow>
            <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso2-ink md:text-4xl">{t.sessionsHeading}</h2>
            <p className="mt-2 max-w-xl text-kinnso2-ink/70">{t.sessionsSub}</p>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {sessions.map((s) => (
                <li key={s.id} className="k2-card p-5">
                  <p className="text-sm text-kinnso2-ink/60">{dateTimeFmt.format(new Date(s.startsAt))}</p>
                  <h3 className="mt-2 text-lg font-semibold text-kinnso2-ink">{s.title}</h3>
                  <p className="mt-1 text-sm text-kinnso2-ink/70">@{s.hostHandle}</p>
                </li>
              ))}
            </ul>
          </SectionShell>
        ) : null}

        {/* 8 — Merchant value prop */}
        <MerchantValue locale={locale} t={t} />

        {/* 9 — Creator CTA */}
        <CreatorCta locale={locale} t={t} />

        {/* 10 — Footer: R1A chrome renders it via SiteChrome. No work here. */}
      </div>
    )
  }

  export default HomeView
  ```

- [ ] Rewrite `apps/web/app/[locale]/page.tsx` ENTIRELY:

  ```tsx
  import type { Metadata } from 'next'
  import { notFound } from 'next/navigation'
  import { HomeView } from '@/components/kinnso/pages/HomeView'
  import { searchArticles } from '@/lib/articles/queries'
  import { getPublishedGuides } from '@/lib/guides/queries'
  import { getPlatformStats, getPublishedTestimonials, getUpcomingSessions } from '@/lib/home/queries'
  import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
  import { getDictionary } from '@/lib/i18n/dictionaries'
  import { buildPageMetadata } from '@/lib/seo/metadata'

  /** ISR: honest stats + fresh guides at most 5 minutes stale. */
  export const revalidate = 300

  export function generateStaticParams() {
    return LOCALES.map((locale) => ({ locale }))
  }

  export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params
    if (!isLocale(locale)) return {}
    const dict = await getDictionary(locale as Locale)
    return buildPageMetadata({ path: '', locale: locale as Locale, title: dict.seo.home.title, description: dict.seo.home.description })
  }

  /** /[locale] — the 10-section dual-sided homepage (R1B rebuild). */
  export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params
    if (!isLocale(locale)) notFound()
    const loc = locale as Locale
    const [messages, guides, stats, testimonials, articleResult, sessions] = await Promise.all([
      getDictionary(loc),
      getPublishedGuides(),
      getPlatformStats(),
      getPublishedTestimonials(loc),
      // Articles highlight degrades to hidden rather than crashing the homepage
      // (searchArticles rethrows after its internal retry).
      searchArticles({ locale: loc, page: 1, perPage: 3 }).catch(() => ({ items: [], total: 0, page: 1, perPage: 3 })),
      getUpcomingSessions(),
    ])
    return (
      <HomeView
        locale={loc}
        t={messages.home}
        guides={guides.slice(0, 6)}
        stats={stats}
        testimonials={testimonials}
        articles={articleResult.items}
        sessions={sessions}
      />
    )
  }
  ```

- [ ] Rewrite `apps/web/tests/home.host.test.tsx` ENTIRELY:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach, vi } from 'vitest'
  import { render, screen, cleanup } from '@testing-library/react'

  afterEach(cleanup)
  vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
  vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: async () => [] }))
  vi.mock('@/lib/articles/queries', () => ({ searchArticles: async () => ({ items: [], total: 0, page: 1, perPage: 3 }) }))
  vi.mock('@/lib/home/queries', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/home/queries')>()),
    getPlatformStats: async () => null,
    getPublishedTestimonials: async () => [],
    getUpcomingSessions: async () => [],
  }))

  import LocaleHome, { generateMetadata, revalidate } from '@/app/[locale]/page'
  import en from '@/lib/i18n/messages/en'

  describe('/[locale] home host', () => {
    it('renders the rebuilt homepage from mocked (empty) data without filler', async () => {
      const ui = await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
      render(ui)
      expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
      expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
      expect(screen.queryByText(en.home.sessionsHeading)).toBeNull()
    })
    it('ISR-revalidates every 5 minutes', () => {
      expect(revalidate).toBe(300)
    })
    it('uses the updated seo.home strings', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
      expect(meta.title).toBe(en.seo.home.title)
      expect(meta.description).toBe(en.seo.home.description)
    })
    it('404s unknown locales', async () => {
      await expect(LocaleHome({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    })
  })
  ```

- [ ] Update `apps/web/tests/kinnso.route-parity.test.tsx`: replace the single HomeView line

  ```tsx
      collectInternalLinks(<HomeView locale="en" t={en.home} guides={[]} />).forEach((href) => hrefs.add(href))
  ```

  with:

  ```tsx
      collectInternalLinks(
        <HomeView locale="en" t={en.home} guides={[]} stats={null} testimonials={[]} articles={[]} sessions={[]} />,
      ).forEach((href) => hrefs.add(href))
  ```

  (Everything else in the file stays — it keeps proving every chrome + homepage href is backed by a real route under `app/[locale]/`.)

- [ ] Delete the 17 legacy keys — from the `Messages` interface in `en.ts` AND from the value blocks in ALL 7 locale files, remove the `// R1B-legacy …` comment and every line for:
  `heroPill`, `applyCta`, `step1Title`, `step1Desc`, `step2Title`, `step2Desc`, `step3Title`, `step3Desc`, `step4Title`, `step4Desc`, `merchantWall`, `travelersTitle`, `travelersDesc`, `travelersCta`, `merchantsTitle`, `merchantsDesc`, `merchantsCta`.
  The rebuilt HomeView is their only consumer and it no longer reads them; all 7 files change together so parity stays green. Verify no stragglers:
  ```bash
  grep -rn "heroPill\|merchantWall\|travelersCta\|merchantsCta\|applyCta" apps/web/lib apps/web/components apps/web/app apps/web/tests
  ```
  Expected: NO matches.

- [ ] Run the full gate for this task — expect ALL PASS:
  ```bash
  pnpm --filter web typecheck
  cd apps/web && npx vitest run tests/kinnso.HomeView.test.tsx tests/home.host.test.tsx tests/kinnso.route-parity.test.tsx tests/i18n.locale-parity.test.ts
  ```
- [ ] Commit:
  ```bash
  git add apps/web/components/kinnso/pages/HomeView.tsx "apps/web/app/[locale]/page.tsx" apps/web/lib/i18n/messages apps/web/tests/kinnso.HomeView.test.tsx apps/web/tests/home.host.test.tsx apps/web/tests/kinnso.route-parity.test.tsx
  git commit -m "feat(web): rebuild HomeView as the 10-section editorial homepage with ISR route wiring" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 8 — Mock-data removal

**Files:**
- Delete: `apps/web/components/kinnso/EarningsTicker.tsx`, `apps/web/components/kinnso/PassportHeroStack.tsx`, `apps/web/components/kinnso/ScanWidget.tsx`, `apps/web/tests/kinnso.ScanWidget.test.tsx`
- Test: `apps/web/tests/kinnso.HomeView.test.tsx`, `apps/web/tests/kinnso.route-parity.test.tsx` (rerun — nothing may break)

Consumer evidence (grep run against the pre-R1B tree, 2026-07-02 — re-verify below):
`grep -rln "PassportHeroStack\|EarningsTicker\|ScanWidget" apps/web --include="*.ts" --include="*.tsx"` returned exactly: the three component files themselves, `components/kinnso/pages/HomeView.tsx` (rebuilt in Task 7 — imports removed), and `tests/kinnso.ScanWidget.test.tsx`. In particular **ScanWidget has NO studio consumer** (the fake 1.6 s scan only ever lived on the homepage) → it is deleted, not kept. **EarningsTicker has ZERO consumers anywhere** (dead since the Phase-1 honest-navigation pass) → deleted.

- [ ] Re-verify the claim on the CURRENT tree (post-Task-7 the only hits must be the four files being deleted):
  ```bash
  grep -rln "PassportHeroStack\|EarningsTicker\|ScanWidget" apps/web --include="*.ts" --include="*.tsx"
  ```
  Expected output, nothing else:
  ```
  apps/web/components/kinnso/EarningsTicker.tsx
  apps/web/components/kinnso/PassportHeroStack.tsx
  apps/web/components/kinnso/ScanWidget.tsx
  apps/web/tests/kinnso.ScanWidget.test.tsx
  ```
  If ANY other file appears, STOP and report — do not delete.
- [ ] Delete the four files:
  ```bash
  git rm apps/web/components/kinnso/EarningsTicker.tsx apps/web/components/kinnso/PassportHeroStack.tsx apps/web/components/kinnso/ScanWidget.tsx apps/web/tests/kinnso.ScanWidget.test.tsx
  ```
- [ ] Prove the homepage surfaces are clean — both greps must return NOTHING:
  ```bash
  grep -rin "unsplash" apps/web/components/kinnso/pages/HomeView.tsx apps/web/components/kinnso/home/
  grep -rn "from '@/lib/creator-mock'" apps/web/components/kinnso/pages/HomeView.tsx apps/web/components/kinnso/home/ | grep -v "import type"
  ```
  (The second allows ONLY type-only imports of `Guide` — the mock DATA must not be imported.)
- [ ] Confirm nothing referenced the deleted files:
  ```bash
  pnpm --filter web typecheck
  cd apps/web && npx vitest run tests/kinnso.HomeView.test.tsx tests/kinnso.route-parity.test.tsx
  ```
  Expected: exit 0 / ALL PASS.
- [ ] Commit:
  ```bash
  git commit -m "refactor(web): remove homepage mock components (ScanWidget, PassportHeroStack, EarningsTicker)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 9 — Admin testimonials lib: validation + queries + actions

**Files:**
- Create: `apps/web/lib/admin/testimonials-validation.ts`, `apps/web/lib/admin/testimonials-queries.ts`, `apps/web/lib/admin/testimonials-actions.ts`
- Create: `apps/web/tests/admin.testimonials-validation.test.ts`, `apps/web/tests/admin.testimonials-queries.test.ts`, `apps/web/tests/admin.testimonials-actions.test.ts`
- Test: the three new test files

Follows the Phase-6B perks slice patterns exactly: `requireOpsAction` gate first, field validation returning `ValidationErrors`, camelCase→snake_case `toRow`, `ActionResult<T>` returns, `formError` on write failures, `revalidatePath` after success. New wrinkle: testimonials feed the ISR homepage, so successful writes also revalidate every locale homepage.

- [ ] Write the failing validation test. Create `apps/web/tests/admin.testimonials-validation.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { validateTestimonialInput, type TestimonialInput } from '@/lib/admin/testimonials-validation'

  const valid: TestimonialInput = {
    quote: 'KINNSO paid me for what I already knew.',
    authorName: 'Mei',
    authorRole: 'creator',
    locale: null,
    sortOrder: 0,
  }

  describe('validateTestimonialInput', () => {
    it('accepts a valid input (locale null = all locales)', () => {
      expect(validateTestimonialInput(valid)).toEqual({})
    })
    it('accepts a concrete locale', () => {
      expect(validateTestimonialInput({ ...valid, locale: 'zh-hk' })).toEqual({})
    })
    it('requires quote and author name', () => {
      const errors = validateTestimonialInput({ ...valid, quote: '  ', authorName: '' })
      expect(errors.quote).toBeTruthy()
      expect(errors.authorName).toBeTruthy()
    })
    it('rejects an unknown role', () => {
      expect(validateTestimonialInput({ ...valid, authorRole: 'influencer' as never }).authorRole).toBeTruthy()
    })
    it('rejects an unknown locale', () => {
      expect(validateTestimonialInput({ ...valid, locale: 'fr' as never }).locale).toBeTruthy()
    })
    it('rejects a fractional sort order', () => {
      expect(validateTestimonialInput({ ...valid, sortOrder: 1.5 }).sortOrder).toBeTruthy()
    })
  })
  ```

- [ ] Run it and watch it fail (module not found):
  ```bash
  cd apps/web && npx vitest run tests/admin.testimonials-validation.test.ts
  ```

- [ ] Create `apps/web/lib/admin/testimonials-validation.ts` with EXACTLY:

  ```ts
  import type { ValidationErrors } from '@/lib/admin/result'
  import { isLocale, type Locale } from '@/lib/i18n/config'

  export const TESTIMONIAL_ROLES = ['creator', 'traveller', 'merchant'] as const
  export type TestimonialRole = (typeof TESTIMONIAL_ROLES)[number]

  export type TestimonialInput = {
    quote: string
    authorName: string
    authorRole: TestimonialRole
    /** null = show in every locale; otherwise an exact locale code. */
    locale: Locale | null
    sortOrder: number
  }

  /** Field-level validation for the ops testimonial form. Returns `{}` when valid. */
  export function validateTestimonialInput(input: TestimonialInput): ValidationErrors {
    const errors: ValidationErrors = {}
    if (!String(input.quote ?? '').trim()) errors.quote = ['Quote is required']
    if (!String(input.authorName ?? '').trim()) errors.authorName = ['Author name is required']
    if (!TESTIMONIAL_ROLES.includes(input.authorRole)) errors.authorRole = ['Invalid author role']
    if (input.locale !== null && !isLocale(input.locale)) errors.locale = ['Invalid locale']
    if (!Number.isInteger(input.sortOrder)) errors.sortOrder = ['Sort order must be a whole number']
    return errors
  }

  ```

- [ ] Re-run — expect ALL PASS. Then write the failing queries test. Create `apps/web/tests/admin.testimonials-queries.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect } from 'vitest'
  import type { SupabaseClient } from '@supabase/supabase-js'
  import type { Database } from '@kinnso/db'
  import { listAllTestimonials } from '@/lib/admin/testimonials-queries'

  function clientWith(result: { data: unknown; error: unknown }) {
    return {
      from: () => ({ select: () => ({ order: () => ({ order: async () => result }) }) }),
    } as unknown as SupabaseClient<Database>
  }

  describe('listAllTestimonials', () => {
    it('returns the rows (drafts included — this is the ops read)', async () => {
      const rows = [{ id: 't1', status: 'draft' }]
      expect(await listAllTestimonials(clientWith({ data: rows, error: null }))).toEqual(rows)
    })
    it('propagates errors — no silent empty list', async () => {
      await expect(listAllTestimonials(clientWith({ data: null, error: new Error('boom') }))).rejects.toThrow('boom')
    })
  })
  ```

- [ ] Run it and watch it fail, then create `apps/web/lib/admin/testimonials-queries.ts` with EXACTLY:

  ```ts
  import type { SupabaseClient } from '@supabase/supabase-js'
  import type { Database } from '@kinnso/db'

  export type AdminTestimonial = Database['public']['Tables']['testimonials']['Row']

  /**
   * Ops full read of the testimonial catalog, drafts included (the
   * `testimonials_ops_all` RLS policy grants ops SELECT over everything; a
   * non-ops caller would see only published rows — but this is only ever
   * called behind requireOpsPage). Errors propagate (no silent []).
   */
  export async function listAllTestimonials(supabase: SupabaseClient<Database>): Promise<AdminTestimonial[]> {
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  }
  ```

- [ ] Re-run — expect ALL PASS. Then write the failing actions test. Create `apps/web/tests/admin.testimonials-actions.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'

  const { gateMock, serverClientMock, revalidateMock } = vi.hoisted(() => ({
    gateMock: vi.fn(async () => ({ ok: true, user: { id: 'ops1' } })),
    serverClientMock: vi.fn(),
    revalidateMock: vi.fn(),
  }))
  vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))
  vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: serverClientMock }))
  vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

  import {
    createTestimonialAction,
    updateTestimonialAction,
    setTestimonialStatusAction,
    deleteTestimonialAction,
  } from '@/lib/admin/testimonials-actions'
  import type { TestimonialInput } from '@/lib/admin/testimonials-validation'

  const input: TestimonialInput = {
    quote: 'KINNSO paid me for what I already knew.',
    authorName: 'Mei',
    authorRole: 'creator',
    locale: null,
    sortOrder: 0,
  }

  /** Chainable stub capturing insert/update/delete payloads; `row: null` models "no row matched" (stale id / RLS). */
  function makeClient(opts: { row?: unknown; error?: unknown } = {}) {
    const row = 'row' in opts ? opts.row : { id: 't1' }
    const calls: { insert?: Record<string, unknown>; update?: Record<string, unknown>; deleted?: boolean } = {}
    const client = {
      from: () => ({
        insert: (r: Record<string, unknown>) => {
          calls.insert = r
          return { select: () => ({ single: async () => ({ data: row, error: opts.error ?? null }) }) }
        },
        update: (r: Record<string, unknown>) => {
          calls.update = r
          return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: row, error: opts.error ?? null }) }) }) }
        },
        delete: () => {
          calls.deleted = true
          return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: row, error: opts.error ?? null }) }) }) }
        },
      }),
    }
    return { client, calls }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    gateMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
  })

  describe('createTestimonialAction', () => {
    it('rejects a non-ops caller BEFORE writing', async () => {
      gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } } as never)
      const { client, calls } = makeClient()
      serverClientMock.mockResolvedValue(client)
      const r = await createTestimonialAction('en', input)
      expect(r.ok).toBe(false)
      expect(calls.insert).toBeUndefined()
    })
    it('rejects invalid input BEFORE writing', async () => {
      const { client, calls } = makeClient()
      serverClientMock.mockResolvedValue(client)
      const r = await createTestimonialAction('en', { ...input, quote: ' ' })
      expect(r.ok).toBe(false)
      expect(calls.insert).toBeUndefined()
    })
    it('maps camelCase input to snake_case columns and leaves status to the draft default', async () => {
      const { client, calls } = makeClient()
      serverClientMock.mockResolvedValue(client)
      const r = await createTestimonialAction('en', input)
      expect(r.ok).toBe(true)
      expect(calls.insert).toEqual({
        quote: 'KINNSO paid me for what I already knew.',
        author_name: 'Mei',
        author_role: 'creator',
        locale: null,
        sort_order: 0,
      })
      // admin list + all 7 locale homepages (ISR) refresh
      expect(revalidateMock).toHaveBeenCalledWith('/en/admin/testimonials')
      expect(revalidateMock).toHaveBeenCalledWith('/zh-hk')
    })
  })

  describe('updateTestimonialAction', () => {
    it('returns a form error when no row matched', async () => {
      const { client } = makeClient({ row: null })
      serverClientMock.mockResolvedValue(client)
      const r = await updateTestimonialAction('en', 't-stale', input)
      expect(r.ok).toBe(false)
    })
  })

  describe('setTestimonialStatusAction', () => {
    it('publishes a testimonial', async () => {
      const { client, calls } = makeClient()
      serverClientMock.mockResolvedValue(client)
      const r = await setTestimonialStatusAction('en', 't1', 'published')
      expect(r.ok).toBe(true)
      expect(calls.update).toEqual({ status: 'published' })
    })
    it('rejects a status outside draft/published WITHOUT writing', async () => {
      const { client, calls } = makeClient()
      serverClientMock.mockResolvedValue(client)
      const r = await setTestimonialStatusAction('en', 't1', 'archived' as never)
      expect(r.ok).toBe(false)
      expect(calls.update).toBeUndefined()
    })
  })

  describe('deleteTestimonialAction', () => {
    it('deletes and reports ok', async () => {
      const { client, calls } = makeClient()
      serverClientMock.mockResolvedValue(client)
      const r = await deleteTestimonialAction('en', 't1')
      expect(r.ok).toBe(true)
      expect(calls.deleted).toBe(true)
    })
    it('returns a form error when nothing was deleted', async () => {
      const { client } = makeClient({ row: null })
      serverClientMock.mockResolvedValue(client)
      const r = await deleteTestimonialAction('en', 't-stale')
      expect(r.ok).toBe(false)
    })
  })
  ```

- [ ] Run it and watch it fail, then create `apps/web/lib/admin/testimonials-actions.ts` with EXACTLY:

  ```ts
  import { revalidatePath } from 'next/cache'
  import { requireOpsAction } from '@/lib/admin/guard'
  import { formError, type ActionResult } from '@/lib/admin/result'
  import { validateTestimonialInput, type TestimonialInput } from '@/lib/admin/testimonials-validation'
  import { LOCALES, type Locale } from '@/lib/i18n/config'
  import { createSupabaseServerClient } from '@/lib/supabase/server'

  const adminTestimonialsPath = (locale: Locale) => `/${locale}/admin/testimonials`

  /**
   * Testimonials feed the ISR homepage (revalidate = 300): refresh the admin
   * list now, plus every locale homepage so a publish shows up without waiting
   * out the ISR window.
   */
  function revalidateTestimonialSurfaces(locale: Locale) {
    revalidatePath(adminTestimonialsPath(locale))
    for (const l of LOCALES) revalidatePath(`/${l}`)
  }

  /**
   * camelCase form input → snake_case columns. `status` is deliberately absent:
   * new rows start at the DB default 'draft'; publishing is its own action.
   */
  function toRow(input: TestimonialInput) {
    return {
      quote: input.quote.trim(),
      author_name: input.authorName.trim(),
      author_role: input.authorRole,
      locale: input.locale,
      sort_order: input.sortOrder,
    }
  }

  export async function createTestimonialAction(
    locale: Locale,
    input: TestimonialInput,
  ): Promise<ActionResult<{ id: string }>> {
    'use server'
    const supabase = await createSupabaseServerClient()
    const gate = await requireOpsAction(supabase)
    if (!gate.ok) return gate
    const errors = validateTestimonialInput(input)
    if (Object.keys(errors).length) return { ok: false, errors }

    const { data, error } = await supabase.from('testimonials').insert(toRow(input)).select('id').single()
    if (error || !data) return formError('Testimonial could not be created')

    revalidateTestimonialSurfaces(locale)
    return { ok: true, id: data.id as string }
  }

  export async function updateTestimonialAction(
    locale: Locale,
    id: string,
    input: TestimonialInput,
  ): Promise<ActionResult<{ id: string }>> {
    'use server'
    const supabase = await createSupabaseServerClient()
    const gate = await requireOpsAction(supabase)
    if (!gate.ok) return gate
    const errors = validateTestimonialInput(input)
    if (Object.keys(errors).length) return { ok: false, errors }

    const { data, error } = await supabase
      .from('testimonials')
      .update(toRow(input))
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error || !data) return formError('Testimonial could not be updated')

    revalidateTestimonialSurfaces(locale)
    return { ok: true, id }
  }

  export async function setTestimonialStatusAction(
    locale: Locale,
    id: string,
    status: 'draft' | 'published',
  ): Promise<ActionResult<{ id: string; status: 'draft' | 'published' }>> {
    'use server'
    const supabase = await createSupabaseServerClient()
    const gate = await requireOpsAction(supabase)
    if (!gate.ok) return gate
    if (status !== 'draft' && status !== 'published') return formError('Invalid status')

    const { data, error } = await supabase
      .from('testimonials')
      .update({ status })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error || !data) return formError('Testimonial status could not be changed')

    revalidateTestimonialSurfaces(locale)
    return { ok: true, id, status }
  }

  export async function deleteTestimonialAction(
    locale: Locale,
    id: string,
  ): Promise<ActionResult<{ id: string }>> {
    'use server'
    const supabase = await createSupabaseServerClient()
    const gate = await requireOpsAction(supabase)
    if (!gate.ok) return gate

    const { data, error } = await supabase
      .from('testimonials')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error || !data) return formError('Testimonial could not be deleted')

    revalidateTestimonialSurfaces(locale)
    return { ok: true, id }
  }
  ```

- [ ] Run all three — expect ALL PASS:
  ```bash
  cd apps/web && npx vitest run tests/admin.testimonials-validation.test.ts tests/admin.testimonials-queries.test.ts tests/admin.testimonials-actions.test.ts
  ```
- [ ] Commit:
  ```bash
  git add apps/web/lib/admin/testimonials-validation.ts apps/web/lib/admin/testimonials-queries.ts apps/web/lib/admin/testimonials-actions.ts apps/web/tests/admin.testimonials-validation.test.ts apps/web/tests/admin.testimonials-queries.test.ts apps/web/tests/admin.testimonials-actions.test.ts
  git commit -m "feat(web): admin testimonials lib — validation, queries, actions" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 10 — `/admin/testimonials`: ops CRUD page, view, nav, i18n

**Files:**
- Create: `apps/web/components/kinnso/admin/AdminTestimonialsView.tsx`, `apps/web/app/[locale]/admin/testimonials/page.tsx`
- Create: `apps/web/tests/admin.testimonials.host.test.tsx`
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx` (one nav entry), `apps/web/tests/kinnso.AdminShell.test.tsx` (one assertion)
- Modify: `apps/web/lib/i18n/messages/en.ts` + the 6 locale files (`admin.navTestimonials` + new `testimonialsAdmin` group), `apps/web/tests/i18n.locale-parity.test.ts` (GROUPS)
- Test: `tests/i18n.locale-parity.test.ts`, `tests/admin.testimonials.host.test.tsx`, `tests/kinnso.AdminShell.test.tsx`

The view deliberately uses the LEGACY admin skin (`TicketCard`, `k-display`, `kinnso-*` classes — exactly like `AdminPerksView`): the operator console is not part of the R1 public re-skin.

- [ ] Failing test 1 — register the group. In `apps/web/tests/i18n.locale-parity.test.ts`, in the GROUPS array, after `'perks',` add `'testimonialsAdmin',`. Run and watch it fail (`en` does not define the group):
  ```bash
  cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts
  ```

- [ ] i18n interface (`apps/web/lib/i18n/messages/en.ts`): in the `admin` group interface, after `navMissions: string` add `navTestimonials: string`. Immediately AFTER the whole `perks: { … }` interface group, add:

  ```ts
    testimonialsAdmin: {
      title: string; subtitle: string; newCta: string; empty: string
      colAuthor: string; colStatus: string
      roleCreator: string; roleTraveller: string; roleMerchant: string; localeAll: string
      statusDraft: string; statusPublished: string
      actPublish: string; actUnpublish: string; actEdit: string; actDelete: string; deleteConfirm: string
      formNewTitle: string; formEditTitle: string
      formQuote: string; formAuthorName: string; formAuthorRole: string
      formLocale: string; formLocaleHint: string; formSortOrder: string
      formSave: string; formCancel: string
    }
  ```

- [ ] i18n values — EN (`en.ts`): in the `admin` value block, after `navMissions: 'Missions',` add `navTestimonials: 'Testimonials',`. Immediately AFTER the whole `perks: { … }` value block, add:

  ```ts
    testimonialsAdmin: {
      title: 'Testimonials',
      subtitle: 'Curate the quotes shown in the homepage social-proof section.',
      newCta: 'New testimonial',
      empty: 'No testimonials yet — add the first one.',
      colAuthor: 'Author', colStatus: 'Status',
      roleCreator: 'Creator', roleTraveller: 'Traveller', roleMerchant: 'Merchant', localeAll: 'All locales',
      statusDraft: 'Draft', statusPublished: 'Published',
      actPublish: 'Publish', actUnpublish: 'Unpublish', actEdit: 'Edit', actDelete: 'Delete',
      deleteConfirm: 'Delete this testimonial? This cannot be undone.',
      formNewTitle: 'New testimonial', formEditTitle: 'Edit testimonial',
      formQuote: 'Quote', formAuthorName: 'Author name', formAuthorRole: 'Author role',
      formLocale: 'Locale', formLocaleHint: 'Leave on "All locales" to show it in every language.', formSortOrder: 'Sort order',
      formSave: 'Save', formCancel: 'Cancel',
    },
  ```

- [ ] i18n values — the 6 translations (same two anchors per file: `admin` nav line + after the `perks` block):

  **`zh-hk.ts`** — nav: `navTestimonials: '用戶推薦',`
  ```ts
    testimonialsAdmin: {
      title: '用戶推薦',
      subtitle: '管理首頁社會認證區顯示嘅引言。',
      newCta: '新增推薦',
      empty: '仲未有推薦——加返第一條啦。',
      colAuthor: '作者', colStatus: '狀態',
      roleCreator: '創作者', roleTraveller: '旅人', roleMerchant: '商家', localeAll: '所有語言',
      statusDraft: '草稿', statusPublished: '已發佈',
      actPublish: '發佈', actUnpublish: '取消發佈', actEdit: '編輯', actDelete: '刪除',
      deleteConfirm: '確定刪除呢條推薦？呢個動作冇得復原。',
      formNewTitle: '新增推薦', formEditTitle: '編輯推薦',
      formQuote: '引言', formAuthorName: '作者名稱', formAuthorRole: '作者身份',
      formLocale: '語言', formLocaleHint: '揀「所有語言」就會喺每個語言版本顯示。', formSortOrder: '排序',
      formSave: '儲存', formCancel: '取消',
    },
  ```

  **`zh-tw.ts`** — nav: `navTestimonials: '用戶推薦',`
  ```ts
    testimonialsAdmin: {
      title: '用戶推薦',
      subtitle: '管理首頁社會認證區塊顯示的引言。',
      newCta: '新增推薦',
      empty: '還沒有推薦——先新增第一則吧。',
      colAuthor: '作者', colStatus: '狀態',
      roleCreator: '創作者', roleTraveller: '旅人', roleMerchant: '商家', localeAll: '所有語言',
      statusDraft: '草稿', statusPublished: '已發布',
      actPublish: '發布', actUnpublish: '取消發布', actEdit: '編輯', actDelete: '刪除',
      deleteConfirm: '確定刪除這則推薦？此動作無法復原。',
      formNewTitle: '新增推薦', formEditTitle: '編輯推薦',
      formQuote: '引言', formAuthorName: '作者名稱', formAuthorRole: '作者身分',
      formLocale: '語言', formLocaleHint: '保持「所有語言」即在每個語言版本顯示。', formSortOrder: '排序',
      formSave: '儲存', formCancel: '取消',
    },
  ```

  **`zh-cn.ts`** — nav: `navTestimonials: '用户推荐',`
  ```ts
    testimonialsAdmin: {
      title: '用户推荐',
      subtitle: '管理首页社会认证区块显示的引言。',
      newCta: '新增推荐',
      empty: '还没有推荐——先新增第一条吧。',
      colAuthor: '作者', colStatus: '状态',
      roleCreator: '创作者', roleTraveller: '旅行者', roleMerchant: '商家', localeAll: '所有语言',
      statusDraft: '草稿', statusPublished: '已发布',
      actPublish: '发布', actUnpublish: '取消发布', actEdit: '编辑', actDelete: '删除',
      deleteConfirm: '确定删除这条推荐？此操作无法撤销。',
      formNewTitle: '新增推荐', formEditTitle: '编辑推荐',
      formQuote: '引言', formAuthorName: '作者名称', formAuthorRole: '作者身份',
      formLocale: '语言', formLocaleHint: '保持"所有语言"即在每个语言版本显示。', formSortOrder: '排序',
      formSave: '保存', formCancel: '取消',
    },
  ```

  **`ja.ts`** — nav: `navTestimonials: 'お客様の声',`
  ```ts
    testimonialsAdmin: {
      title: 'お客様の声',
      subtitle: 'ホームページのソーシャルプルーフに表示する引用を管理します。',
      newCta: '新規追加',
      empty: 'まだありません——最初の一件を追加しましょう。',
      colAuthor: '投稿者', colStatus: 'ステータス',
      roleCreator: 'クリエイター', roleTraveller: '旅行者', roleMerchant: '加盟店', localeAll: 'すべての言語',
      statusDraft: '下書き', statusPublished: '公開中',
      actPublish: '公開', actUnpublish: '非公開にする', actEdit: '編集', actDelete: '削除',
      deleteConfirm: 'この声を削除しますか？この操作は取り消せません。',
      formNewTitle: '声を追加', formEditTitle: '声を編集',
      formQuote: '引用文', formAuthorName: '投稿者名', formAuthorRole: '投稿者の役割',
      formLocale: '言語', formLocaleHint: '「すべての言語」のままにすると全言語で表示されます。', formSortOrder: '表示順',
      formSave: '保存', formCancel: 'キャンセル',
    },
  ```

  **`ko.ts`** — nav: `navTestimonials: '추천사',`
  ```ts
    testimonialsAdmin: {
      title: '추천사',
      subtitle: '홈페이지 소셜 프루프 영역에 표시할 인용문을 관리해요.',
      newCta: '새 추천사',
      empty: '아직 추천사가 없어요 — 첫 번째를 추가해 보세요.',
      colAuthor: '작성자', colStatus: '상태',
      roleCreator: '크리에이터', roleTraveller: '여행자', roleMerchant: '가맹점', localeAll: '모든 언어',
      statusDraft: '초안', statusPublished: '게시됨',
      actPublish: '게시', actUnpublish: '게시 취소', actEdit: '수정', actDelete: '삭제',
      deleteConfirm: '이 추천사를 삭제할까요? 되돌릴 수 없어요.',
      formNewTitle: '새 추천사', formEditTitle: '추천사 수정',
      formQuote: '인용문', formAuthorName: '작성자 이름', formAuthorRole: '작성자 역할',
      formLocale: '언어', formLocaleHint: '"모든 언어"로 두면 모든 언어 버전에 표시돼요.', formSortOrder: '정렬 순서',
      formSave: '저장', formCancel: '취소',
    },
  ```

  **`th.ts`** — nav: `navTestimonials: 'เสียงจากผู้ใช้',`
  ```ts
    testimonialsAdmin: {
      title: 'เสียงจากผู้ใช้',
      subtitle: 'จัดการคำพูดที่แสดงในส่วนโซเชียลพรูฟของหน้าแรก',
      newCta: 'เพิ่มเสียงผู้ใช้',
      empty: 'ยังไม่มีเสียงจากผู้ใช้ — เพิ่มรายการแรกได้เลย',
      colAuthor: 'ผู้เขียน', colStatus: 'สถานะ',
      roleCreator: 'ครีเอเตอร์', roleTraveller: 'นักเดินทาง', roleMerchant: 'ร้านค้า', localeAll: 'ทุกภาษา',
      statusDraft: 'ฉบับร่าง', statusPublished: 'เผยแพร่แล้ว',
      actPublish: 'เผยแพร่', actUnpublish: 'ยกเลิกเผยแพร่', actEdit: 'แก้ไข', actDelete: 'ลบ',
      deleteConfirm: 'ลบรายการนี้หรือไม่? การกระทำนี้ย้อนกลับไม่ได้',
      formNewTitle: 'เพิ่มเสียงผู้ใช้', formEditTitle: 'แก้ไขเสียงผู้ใช้',
      formQuote: 'คำพูด', formAuthorName: 'ชื่อผู้เขียน', formAuthorRole: 'บทบาทผู้เขียน',
      formLocale: 'ภาษา', formLocaleHint: 'ปล่อยเป็น "ทุกภาษา" เพื่อแสดงในทุกเวอร์ชันภาษา', formSortOrder: 'ลำดับการแสดง',
      formSave: 'บันทึก', formCancel: 'ยกเลิก',
    },
  ```

- [ ] Re-run parity + typecheck — expect ALL PASS:
  ```bash
  pnpm --filter web typecheck
  cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts
  ```

- [ ] Failing test 2 — host + nav. Create `apps/web/tests/admin.testimonials.host.test.tsx` with EXACTLY:

  ```tsx
  // @vitest-environment jsdom
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

  const { roleMock, getUserMock, listMock } = vi.hoisted(() => ({
    roleMock: vi.fn(async () => 'ops'),
    getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
    listMock: vi.fn(async () => []),
  }))
  vi.mock('next/navigation', () => ({
    notFound: () => { throw new Error('NEXT_NOT_FOUND') },
    redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  }))
  vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
  vi.mock('@/lib/admin/testimonials-queries', () => ({ listAllTestimonials: listMock }))
  vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
  vi.mock('@/components/kinnso/admin/AdminTestimonialsView', () => ({
    AdminTestimonialsView: () => <div data-testid="testimonials-view" />,
  }))

  import AdminTestimonialsPage from '@/app/[locale]/admin/testimonials/page'

  beforeEach(() => {
    roleMock.mockResolvedValue('ops')
    getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
  })
  afterEach(() => vi.clearAllMocks())

  describe('/admin/testimonials host', () => {
    it('notFounds for a non-ops viewer', async () => {
      roleMock.mockResolvedValueOnce('creator')
      await expect(AdminTestimonialsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    })
    it('redirects anon to sign-in', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
      await expect(AdminTestimonialsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    })
    it('renders the testimonials view for ops', async () => {
      const ui = await AdminTestimonialsPage({ params: Promise.resolve({ locale: 'en' }) })
      expect(ui).toBeTruthy()
      expect(listMock).toHaveBeenCalled()
    })
    it('404s unknown locales', async () => {
      await expect(AdminTestimonialsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    })
  })
  ```

  And in `apps/web/tests/kinnso.AdminShell.test.tsx`, inside the existing nav-links test, after the `navCreators` assertion add:

  ```ts
      expect((screen.getByRole('link', { name: en.admin.navTestimonials }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/testimonials')
  ```

- [ ] Run both and watch them fail (page module missing; nav link missing):
  ```bash
  cd apps/web && npx vitest run tests/admin.testimonials.host.test.tsx tests/kinnso.AdminShell.test.tsx
  ```

- [ ] In `apps/web/components/kinnso/admin/AdminShell.tsx`, in the `nav` array after the perks entry, add:

  ```ts
      { href: `/${locale}/admin/testimonials`, label: t.navTestimonials },
  ```

- [ ] Create `apps/web/components/kinnso/admin/AdminTestimonialsView.tsx` with EXACTLY:

  ```tsx
  'use client'
  import { useState } from 'react'
  import { useRouter } from 'next/navigation'
  import { TicketCard } from '@/components/kinnso/MarketPassport'
  import type { ActionResult } from '@/lib/admin/result'
  import type { AdminTestimonial } from '@/lib/admin/testimonials-queries'
  import { TESTIMONIAL_ROLES, type TestimonialInput, type TestimonialRole } from '@/lib/admin/testimonials-validation'
  import { isLocale, LOCALES } from '@/lib/i18n/config'
  import type { Messages } from '@/lib/i18n/messages/en'

  type SaveResult = ActionResult<{ id: string }>
  type MutateResult = ActionResult<{ id: string }>
  type T = Messages['testimonialsAdmin']

  /**
   * Ops CRUD for homepage testimonials. Deliberately the LEGACY admin skin
   * (TicketCard / k-display / kinnso-*): the operator console is not part of
   * the R1 public re-skin.
   */
  export function AdminTestimonialsView({
    t, testimonials, onCreate, onUpdate, onSetStatus, onDelete,
  }: {
    t: T
    testimonials: AdminTestimonial[]
    onCreate: (input: TestimonialInput) => Promise<SaveResult>
    onUpdate: (id: string, input: TestimonialInput) => Promise<SaveResult>
    onSetStatus: (id: string, status: 'draft' | 'published') => Promise<MutateResult>
    onDelete: (id: string) => Promise<MutateResult>
  }) {
    const router = useRouter()
    const [editing, setEditing] = useState<AdminTestimonial | 'new' | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

    const roleLabel: Record<TestimonialRole, string> = {
      creator: t.roleCreator, traveller: t.roleTraveller, merchant: t.roleMerchant,
    }

    async function mutate(id: string, run: () => Promise<MutateResult>, fallback: string) {
      setBusyId(id)
      setRowErrors((e) => ({ ...e, [id]: '' }))
      const res = await run()
      setBusyId(null)
      if (res.ok) {
        router.refresh() // reconcile with the revalidated server truth
      } else {
        setRowErrors((e) => ({ ...e, [id]: res.errors.form?.[0] ?? fallback }))
      }
    }

    if (editing !== null) {
      const current = editing === 'new' ? null : editing
      return (
        <main>
          <h1 className="k-display">{current ? t.formEditTitle : t.formNewTitle}</h1>
          <div className="mt-6 max-w-2xl">
            <TestimonialForm
              t={t}
              roleLabel={roleLabel}
              testimonial={current}
              onSave={(input) => (current ? onUpdate(current.id, input) : onCreate(input))}
              onDone={() => { setEditing(null); router.refresh() }}
              onCancel={() => setEditing(null)}
            />
          </div>
        </main>
      )
    }

    return (
      <main>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="k-display">{t.title}</h1>
            <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
          </div>
          <button onClick={() => setEditing('new')} className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white">
            {t.newCta}
          </button>
        </div>
        {testimonials.length === 0 ? (
          <p className="mt-8 text-kinnso-muted">{t.empty}</p>
        ) : (
          <div className="mt-8 grid gap-4">
            {testimonials.map((row) => (
              <TicketCard key={row.id} className="p-5">
                <blockquote className="text-kinnso-ink">&ldquo;{row.quote}&rdquo;</blockquote>
                <p className="mt-2 text-sm text-kinnso-muted">
                  {row.author_name} · {roleLabel[row.author_role as TestimonialRole] ?? row.author_role} ·{' '}
                  {row.locale ?? t.localeAll} · #{row.sort_order}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-bold">
                  <span className={row.status === 'published' ? 'text-kinnso-orange' : 'text-kinnso-muted'}>
                    {row.status === 'published' ? t.statusPublished : t.statusDraft}
                  </span>
                  <button
                    disabled={busyId === row.id}
                    className="text-kinnso-ink hover:text-kinnso-orange"
                    onClick={() =>
                      mutate(row.id, () => onSetStatus(row.id, row.status === 'published' ? 'draft' : 'published'), t.colStatus)
                    }
                  >
                    {row.status === 'published' ? t.actUnpublish : t.actPublish}
                  </button>
                  <button className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => setEditing(row)}>
                    {t.actEdit}
                  </button>
                  <button
                    disabled={busyId === row.id}
                    className="text-kinnso-ink hover:text-kinnso-orange"
                    onClick={() => {
                      if (window.confirm(t.deleteConfirm)) void mutate(row.id, () => onDelete(row.id), t.actDelete)
                    }}
                  >
                    {t.actDelete}
                  </button>
                </div>
                {rowErrors[row.id] ? <p className="mt-2 text-sm text-red-600">{rowErrors[row.id]}</p> : null}
              </TicketCard>
            ))}
          </div>
        )}
      </main>
    )
  }

  function TestimonialForm({
    t, roleLabel, testimonial, onSave, onDone, onCancel,
  }: {
    t: T
    roleLabel: Record<TestimonialRole, string>
    testimonial: AdminTestimonial | null
    onSave: (input: TestimonialInput) => Promise<SaveResult>
    onDone: () => void
    onCancel: () => void
  }) {
    const [quote, setQuote] = useState(testimonial?.quote ?? '')
    const [authorName, setAuthorName] = useState(testimonial?.author_name ?? '')
    const [authorRole, setAuthorRole] = useState<TestimonialRole>((testimonial?.author_role as TestimonialRole) ?? 'creator')
    const [locale, setLocale] = useState<string>(testimonial?.locale ?? '')
    const [sortOrder, setSortOrder] = useState<number>(testimonial?.sort_order ?? 0)
    const [errors, setErrors] = useState<Record<string, string[]>>({})
    const [saving, setSaving] = useState(false)

    async function submit(e: React.FormEvent) {
      e.preventDefault()
      setSaving(true)
      const res = await onSave({
        quote,
        authorName,
        authorRole,
        locale: locale !== '' && isLocale(locale) ? locale : null,
        sortOrder,
      })
      setSaving(false)
      if (res.ok) onDone()
      else setErrors(res.errors)
    }

    const field = 'mt-1 w-full rounded-lg border border-kinnso-edge bg-white px-3 py-2 font-normal'
    const err = (key: string) =>
      errors[key] ? <span className="mt-1 block text-sm font-normal text-red-600">{errors[key][0]}</span> : null

    return (
      <form onSubmit={submit} className="grid gap-4">
        <label className="block text-sm font-bold text-kinnso-ink">
          {t.formQuote}
          <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={3} className={field} />
          {err('quote')}
        </label>
        <label className="block text-sm font-bold text-kinnso-ink">
          {t.formAuthorName}
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} className={field} />
          {err('authorName')}
        </label>
        <label className="block text-sm font-bold text-kinnso-ink">
          {t.formAuthorRole}
          <select value={authorRole} onChange={(e) => setAuthorRole(e.target.value as TestimonialRole)} className={field}>
            {TESTIMONIAL_ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel[r]}</option>
            ))}
          </select>
          {err('authorRole')}
        </label>
        <label className="block text-sm font-bold text-kinnso-ink">
          {t.formLocale}
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className={field}>
            <option value="">{t.localeAll}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-kinnso-muted">{t.formLocaleHint}</span>
          {err('locale')}
        </label>
        <label className="block text-sm font-bold text-kinnso-ink">
          {t.formSortOrder}
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className={field}
          />
          {err('sortOrder')}
        </label>
        {errors.form ? <p className="text-sm text-red-600">{errors.form[0]}</p> : null}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white">
            {t.formSave}
          </button>
          <button type="button" onClick={onCancel} className="rounded-full border border-kinnso-edge px-5 py-2 font-bold text-kinnso-ink">
            {t.formCancel}
          </button>
        </div>
      </form>
    )
  }
  ```

- [ ] Create `apps/web/app/[locale]/admin/testimonials/page.tsx` with EXACTLY:

  ```tsx
  import { notFound } from 'next/navigation'
  import { AdminTestimonialsView } from '@/components/kinnso/admin/AdminTestimonialsView'
  import { requireOpsPage } from '@/lib/admin/guard'
  import {
    createTestimonialAction,
    deleteTestimonialAction,
    setTestimonialStatusAction,
    updateTestimonialAction,
  } from '@/lib/admin/testimonials-actions'
  import { listAllTestimonials } from '@/lib/admin/testimonials-queries'
  import type { TestimonialInput } from '@/lib/admin/testimonials-validation'
  import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
  import { getDictionary } from '@/lib/i18n/dictionaries'
  import { createSupabaseServerClient } from '@/lib/supabase/server'

  export function generateStaticParams() {
    return LOCALES.map((locale) => ({ locale }))
  }

  export default async function AdminTestimonialsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params
    if (!isLocale(locale)) notFound()
    const loc = locale as Locale
    const supabase = await createSupabaseServerClient()
    // Gate inline: Next renders layout + page in parallel (the layout gate is not a barrier).
    await requireOpsPage(supabase, loc)
    const messages = await getDictionary(loc)
    const testimonials = await listAllTestimonials(supabase)

    async function onCreate(input: TestimonialInput) {
      'use server'
      return createTestimonialAction(loc, input)
    }
    async function onUpdate(id: string, input: TestimonialInput) {
      'use server'
      return updateTestimonialAction(loc, id, input)
    }
    async function onSetStatus(id: string, status: 'draft' | 'published') {
      'use server'
      return setTestimonialStatusAction(loc, id, status)
    }
    async function onDelete(id: string) {
      'use server'
      return deleteTestimonialAction(loc, id)
    }

    return (
      <AdminTestimonialsView
        t={messages.testimonialsAdmin}
        testimonials={testimonials}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onSetStatus={onSetStatus}
        onDelete={onDelete}
      />
    )
  }
  ```

- [ ] Run the gate — expect ALL PASS:
  ```bash
  pnpm --filter web typecheck
  cd apps/web && npx vitest run tests/admin.testimonials.host.test.tsx tests/kinnso.AdminShell.test.tsx tests/i18n.locale-parity.test.ts
  ```
- [ ] Commit:
  ```bash
  git add "apps/web/app/[locale]/admin/testimonials" apps/web/components/kinnso/admin apps/web/lib/i18n/messages apps/web/tests/admin.testimonials.host.test.tsx apps/web/tests/kinnso.AdminShell.test.tsx apps/web/tests/i18n.locale-parity.test.ts
  git commit -m "feat(web): /admin/testimonials ops CRUD with i18n across all 7 locales" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

---

## Task 11 — Full verification + handoff

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
  Expected: exit 0 (no new warnings from touched files; plain `<img>` matches the existing GuideCard pattern).
- [ ] Scoped run of EVERY test file this phase touched or created PLUS the route-parity guard (one command):
  ```bash
  cd apps/web && npx vitest run \
    tests/db.r1b-migration.test.ts \
    tests/home.queries.test.ts \
    tests/i18n.locale-parity.test.ts \
    tests/kinnso.home-hero-stats.test.tsx \
    tests/kinnso.home-how-it-works.test.tsx \
    tests/kinnso.home-bands.test.tsx \
    tests/kinnso.HomeView.test.tsx \
    tests/home.host.test.tsx \
    tests/kinnso.route-parity.test.tsx \
    tests/admin.testimonials-validation.test.ts \
    tests/admin.testimonials-queries.test.ts \
    tests/admin.testimonials-actions.test.ts \
    tests/admin.testimonials.host.test.tsx \
    tests/kinnso.AdminShell.test.tsx
  ```
  Expected: ALL PASS. (`kinnso.route-parity.test.tsx` renders Navbar ×4 roles + Footer + the rebuilt HomeView and asserts every internal href is backed by a real route under `app/[locale]/`.)
- [ ] Scope-guard greps (each must return NOTHING):
  ```bash
  git diff feat/redesign-r1a...HEAD -- apps/web/lib/seo/routes.ts apps/web/app/sitemap.ts apps/web/app/robots.ts       # empty: no SEO-surface changes
  git diff feat/redesign-r1a...HEAD -- apps/web/components/kinnso/Navbar.tsx apps/web/components/kinnso/Footer.tsx apps/web/components/kinnso/SiteChrome.tsx   # empty: chrome untouched
  git diff feat/redesign-r1a...HEAD -- apps/web/app/globals.css                                                        # empty: no token changes, no legacy kinnso-* removals
  ```
- [ ] Mock/honesty greps (must return NOTHING):
  ```bash
  grep -rin "unsplash" apps/web/components/kinnso/pages/HomeView.tsx apps/web/components/kinnso/home/
  grep -rn "from '@/lib/creator-mock'" apps/web/components/kinnso/pages/HomeView.tsx apps/web/components/kinnso/home/ | grep -v "import type"
  grep -rln "ScanWidget\|PassportHeroStack\|EarningsTicker" apps/web
  ```
- [ ] OPTIONAL sanity (full suite): `cd apps/web && npx vitest run` — roughly 19–37 pre-existing environment failures (search/sitemap/studio suites hitting a real Supabase project with dummy `.env.test` creds, some timing out) are EXPECTED in full-suite runs and are NOT regressions from this phase. Judge only the 14 files listed above.
- [ ] OPTIONAL visual smoke: `pnpm --filter web dev`, open `http://localhost:3000/en` — cream/terracotta editorial rendering, serif hero, no scan widget, no Unsplash; with an empty DB the stats bar, testimonials, articles, and sessions sections are simply absent (no filler). Check `/zh-hk` for the colloquial copy and `/en/admin/testimonials` as an ops user.
- [ ] If any step surfaced a fix, commit it as `fix(web): …` or `test(web): …` with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- [ ] **Controller handoff items (NOT for execution agents):**
  1. Apply the migration to the live Supabase project (ref `scryfkefedzuetfdtrvl`) via the Supabase MCP `apply_migration` with snake_case name `r1b_platform_stats_testimonials` and the exact SQL from Task 1. Tests do not require this — do it before deploy, not before merge.
  2. After applying, run the real type regen `pnpm --filter @kinnso/db gen` and commit any diff against the hand-written types (`fix(db): regenerate types after r1b migration`).
  3. Seed 1–3 published testimonials through `/admin/testimonials` (ops account) so section 2 has content; leave the stats bar to earn its thresholds honestly.
- [ ] Phase complete. Do NOT merge or open a PR from this plan — hand back for review; R1B lands inside the "Phase R1 — …" squash-merge flow after R1C.
