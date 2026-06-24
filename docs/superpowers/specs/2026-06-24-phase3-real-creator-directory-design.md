# Phase 3 — Real Creator Directory — design

**Date:** 2026-06-24
**Status:** Approved (design); pending spec review → implementation plan
**Repo:** `kinnso-v3` (web app `apps/web`, DB package `@kinnso/db`, migrations `supabase/migrations`)
**Parent spec:** `docs/superpowers/specs/2026-06-24-product-reorg-roadmap-design.md` (Phase 3 row)
**Builds on:** Phase 1 (honest nav, PR #37) and Phase 2 (de-mock spine + Copilot, PR #38), both merged to `main` (`1a3ae74`).

---

## Purpose

Turn the creator directory and public profiles from 100% mock into real, honest surfaces. Today `/c/[handle]` renders entirely from `lib/creator-mock` and `/creators` is an apply-focused marketing landing with no real creators. This phase delivers the **"get discovered" payoff**: a browsable directory of real creators and a real public profile per creator, rendered only from data the platform actually has.

Governing principles inherited from the parent spec: **no fabricated data on owned/public surfaces**, **no dead clicks**, **honest over impressive**.

## Current state (audit)

- **`creators` table:** `id` (= `auth.users.id`), `display_name`, `status` (`'onboarding' | 'active'`), timestamps. RLS **owner-only**; `anon` SELECT revoked. No handle/bio/public fields.
- **`creator_dna` table:** `creator_id` (unique), `ai_draft`/`final`/`source` (JSONB), `status` (`'draft' | 'published'`). RLS **owner-only**. `final` holds the real scan DNA: `bio`, `niches`, `content_pillars`, `tone`, `audience.{top_geos, top_locales}`, `platforms[{platform, followers, avg_engagement, verified}]`, `languages`.
- **`guides` table:** already **public-read** for `status='published'`; carries `creator_id` + denormalized `creator_handle` + `creator_name`.
- **Publish flow** (`components/onboarding/DnaReviewForm.tsx:42-93`): **client-side**, via the owner-scoped browser client — updates `creator_dna` → `status='published'` then `creators` → `status='active'`. It forces `verified: false` on every platform (`:58`). There is **no server action** to hook.
- **Handle today:** there is **no canonical handle**. `guides/actions.ts:78` computes `slugify(display_name)` on the fly at guide-creation time — not stored, not unique, not stable across renames.
- **`/c/[handle]`** (`app/[locale]/c/[handle]/page.tsx`): resolves via `getCreator(handle)` (mock). **`CreatorProfileView`** renders many fabricated metrics (score, tier, ER, 90-day reach, driven GMV, follower stat cards, content-mix %, audience %, top-tags, engagement trend, destinations/places/posts, city drawer, brand-contact card, non-persisted follow toggle).
- **`/creators`** (`CreatorsLandingView`): post-Phase-2 honest marketing (hero + how-it-works + apply CTA); no directory.
- **`/g/[slug]`** (`app/[locale]/g/[slug]/page.tsx`): dead `source==='mock'` branches at `:44` and `:100-106` (unreachable since Phase 2 made guides real-only).

## Decisions (locked with the user)

1. **Public profile content:** *qualitative DNA + platform/verified badges*. Show bio, niches, content pillars, tone, audience regions + locales, languages, **which platforms** the creator is on (+ a verified tick when `verified===true`), and their **published guides**. Do **not** publish raw follower counts or avg-engagement. (Note: `verified` is forced `false` at publish today, so verified ticks won't render yet — the badge is a forward-compatible affordance; platform presence is the real signal.)
2. **Directory placement:** *`/creators` becomes directory-first* — the real creator grid is the primary content, with a compact apply CTA retained at top and bottom.
3. **Branch base:** Phase 3 branches off `main` **after** PR #38 merged (done — `1a3ae74`), avoiding the squash-merge stranding gotcha.

## Architecture

### A. Data model — one migration

Enrich `creators` with a **public, denormalized projection**, keeping the full `creator_dna` private (so raw follower counts are never exposed):

| New column on `creators` | Type | Purpose |
|---|---|---|
| `handle` | `text` + `UNIQUE` | canonical public identity (the `/c/[handle]` key) |
| `bio` | `text` | denormalized from `creator_dna.final.bio` |
| `public_profile` | `jsonb` | curated public projection (below) |

`public_profile` shape (only the agreed public set — **no follower counts, no avg_engagement**):

```jsonc
{
  "niches": string[],
  "content_pillars": string[],
  "tone": string[],
  "audience_geos": string[],     // final.audience.top_geos
  "audience_locales": string[],  // final.audience.top_locales
  "languages": string[],
  "platforms": [{ "platform": "instagram"|"youtube"|"threads", "verified": boolean }]
}
```

**Denormalization via DB trigger** (chosen because publish is client-side and onboarding is "keep, don't redesign"):

- A `SECURITY DEFINER` Postgres function + trigger on `creator_dna` **AFTER INSERT OR UPDATE**. When the row's `status='published'` and `final IS NOT NULL`, it writes onto the matching `creators` row:
  - `handle` — generated from `slugify(display_name)` with collision de-dup (append `-2`, `-3`, …) **only if `creators.handle` is null** (handles are stable once minted).
  - `bio` and `public_profile` — projected from `final` (always refreshed on re-publish so edits propagate).
- A `slugify(text)` SQL helper (lowercase, non-alphanumeric → `-`, collapse/trim dashes, fallback `creator` when empty).
- **Backfill** in the same migration: for every existing `creators` row that is `status='active'` with a `published` `creator_dna`, run the same projection + handle generation.

*Alternative considered & rejected:* hooking the app-side publish (client) to write the projection — client-side unique-handle generation is racy and would touch the keep-as-is onboarding flow. A DB trigger makes the invariant "active+published creator ⇒ has handle + public_profile" hold for all future creators with zero app change.

**RLS & grants:**

- New **public-read** policy on `creators`: `SELECT` for `anon`/`public` where `status='active' AND handle IS NOT NULL AND public_profile IS NOT NULL`. Existing owner-only `select`/`update` policies stay (RLS policies are OR'd).
- `GRANT SELECT ON creators TO anon` (columns are all public-safe: `id, display_name, status, handle, bio, public_profile, timestamps` — **no follower data lives on this table**).
- `creator_dna` RLS is **unchanged** (stays fully private).

### B. Read layer — `lib/creators/queries.ts` (new, mirrors `lib/guides/queries.ts`)

- `PublicCreator` / `CreatorSummary` types (local; no mock types).
- `getPublicCreators(): Promise<CreatorSummary[]>` — anon client; `creators` filtered to discoverable rows, ordered `created_at desc`. Computes each creator's **published-guide count** from a single `guides` query, grouped by the stable **`creator_id`** in JS (not `creator_handle`, which can drift from a collision-deduped handle). Returns `[]` when none (honest empty state).
- `getCreatorByHandle(handle): Promise<PublicCreator | null>` — one creator row by `handle` (`maybeSingle`); then that creator's published guides via `creator_id` (stable FK). `null` when not found.
- A pure mapper projects `public_profile` JSONB → typed fields. Reuse `lib/studio/identity.ts:initialsFrom` for avatar initials.

### C. UI — de-mock, real-only

**`CreatorProfileView` rebuilt** to render only real data:

- **Keep / build:** deterministic gradient banner + initials avatar (from handle/name), display name, `@handle`, bio, niche/pillar/tone chips, audience regions + locales + languages, platform chips (verified tick when `true`), and the **published-guides grid** (real `GuideCard`s) with an empty note when the creator has none.
- **Drop entirely:** score ring, tier badge, ER, 90-day reach, driven GMV, follower-count stat cards, content-mix %, audience %, top-tags cloud, engagement trend chart, destinations/places/posts, the city drawer, the brand-contact "Send brief" card, and the non-persisted follow toggle (no follows backend = dead click).

**`/creators` → directory-first** (`CreatorsLandingView` restructured): real creator-card grid is primary, with an **honest empty state** when none are published, plus a **compact apply CTA** top and bottom. A `CreatorCard` renders initials avatar, name, `@handle`, niche chips, guide count, and "View profile" → `/c/[handle]`.

**`/c/[handle]/page.tsx`** swaps `getCreator` (mock) → `getCreatorByHandle` (real); `notFound()` on miss; SEO metadata from real fields.

### D. Consistency, cleanup, i18n

- **Guide handle consistency:** `guides/actions.ts` reads `creators.handle` (fallback to `slugify(display_name)` only if null) so guide author links and profile URLs share one canonical handle.
- **Dead code:** remove the `source==='mock'` branches in `g/[slug]/page.tsx` (`:44`, `:100-106`). `creator-mock` stays only for the Studio scan demo + tests; `/c/[handle]` and `CreatorProfileView` stop importing it.
- **i18n:** new keys for the directory (heading, sub, empty-state, viewProfile, guideCount) and the rebuilt profile sections (niches, pillars, tone, audience, platforms, languages, guides); remove obsolete `creatorProfile` metric keys. **All 7 locales + the `Messages` interface** (strict parity test enforces it).

## Components & boundaries

- `supabase/migrations/<ts>_creator_public_profile.sql` — columns, `slugify`, trigger fn + trigger, RLS policy, grant, backfill. *Owns the public-projection invariant.*
- `apps/web/lib/creators/queries.ts` — the only public read path for creators. *Depends on the anon client + the migration's RLS.*
- `apps/web/components/kinnso/pages/CreatorProfileView.tsx` — pure presentational, real props only.
- `apps/web/components/kinnso/pages/CreatorsLandingView.tsx` — directory-first; consumes `CreatorSummary[]`.
- `apps/web/components/kinnso/CreatorCard.tsx` — directory card (may replace/realign the existing mock card).
- Route pages wire queries → views.

## Testing

TDD per workstream (red → green → commit):

- **Migration/RLS/trigger:** verified **live** against the hosted Supabase (`scryfkefedzuetfdtrvl`) via the Supabase MCP — apply migration, seed a creator + published DNA, assert anon can read the projection (not follower counts), assert handle minted + unique, assert re-publish refreshes projection.
- **`lib/creators/queries.ts`:** unit tests mocking `@/lib/supabase/public` (chainable builder, same pattern as `guides.queries.test.ts`) — discoverable filtering, guide-count tally, empty array, handle lookup, null-not-found.
- **`CreatorProfileView`:** renders real fields; asserts **no** fabricated metrics/sections present; locale-scoped guide links.
- **`CreatorsLandingView` / directory:** card per creator, honest empty state, apply CTA present, `/c/[handle]` links locale-scoped.
- **Host tests:** `c.handle.host.test.tsx` (real query mocked) + `creators` index host.
- **Guide handle consistency** + **`/g/[slug]` cleanup** regression.
- Gate: `tsc --noEmit`, `lint`, `build`, touched test files (run with `--no-file-parallelism` after `pkill -f vitest` to dodge the known env timeout flake). Live anon smoke test of `/creators` + a real `/c/[handle]`.

## Out of scope / non-goals

- Avatar/banner **uploads** (no pipeline) — deterministic placeholders only; no image columns added (YAGNI).
- Follows / favourites backend (drop the dead toggle; don't build it).
- Real numeric metrics pipeline (score/tier/ER/reach/GMV) — explicitly excluded until a real source exists.
- Directory **search/filter** (location/niche/tier facets) — backlog; the soft-launch directory is an unfiltered grid. (Add when creator volume warrants it.)
- A user-facing **handle picker** in onboarding — handles are auto-minted this phase; a picker is a later enhancement.
- The merchant creator-search surface (`/merchants/creators`) — separate, cut-from-nav backlog item.

## Success criteria

- A real, active, published creator is discoverable at `/creators` and has a working `/c/[handle]` rendering only real data.
- No fabricated numbers anywhere on the public profile or directory.
- Anon users can read the public projection but **cannot** read follower counts or any private DNA.
- `/creators` shows an honest empty state when no creators are published.
- Guide author links and profile URLs resolve to the same canonical handle.
- `tsc`/`lint`/`build` clean; touched tests green; live smoke test passes.
