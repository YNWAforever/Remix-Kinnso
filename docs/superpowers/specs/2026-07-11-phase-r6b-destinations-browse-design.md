# Phase R6B — Destinations Browse — Design

> Second of three sub-phases for the master spec's Phase R6 ("Loops & Proof"), per the
> decomposition already locked in R6A's own design spec: R6A covered real saves and
> post-booking reviews; R6B (this phase) covers `/destinations` browse; R6C (cross-link
> automation + editorial overrides + testimonial rotation) follows as its own cycle. The
> tier-taxonomy naming decision (seed/rising/pro/elite → Explorer/Navigator/Pathfinder/
> Ambassador) remains a standalone, non-technical product decision out of scope for all
> three sub-phases.

## What R6B delivers

The master spec's only concrete instruction for this phase is a five-word clause:
"`/destinations` browse goes real." `/destinations` currently exists only as R1A's
designed placeholder — a static, noindexed hero block with a single CTA out to
`/articles/destinations`, explicitly built to be replaced here. There is no destination or
region taxonomy anywhere in the codebase today: `guides.city` and `experiences.city` are
independent free-text columns matched by ILIKE substring, `articles.regions` is a text
array matched by array-membership, and R5's `community_sessions.destination_tags` (a text
array captured on every session form) has never been read by any query or rendered on any
page — a ready-made hook R6B is the first phase to actually use.

R6B replaces the placeholder with a real, ops-curated destinations index and a per-
destination detail page aggregating guides, experiences, and upcoming community sessions —
each surfaced through their own existing free-text/array location fields, with no backfill
or schema changes to any of those four tables.

## Locked decisions (D-R6B-N)

- **D-R6B-1 (content scope: guides + experiences + sessions, not articles)**: a
  destination page aggregates guides, experiences, and upcoming community sessions. It
  deliberately excludes `articles.regions` — that field already has its own dedicated
  cross-link mechanism (`ArticleGuideLinks`/`ArticleExperienceLinks`, the master spec's
  "R1: heuristic city/tag matching" row), and improving *that* matching plus adding an
  editorial-override table for it is explicitly R6C's scope, not R6B's. Folding articles
  into destination pages here would blur that boundary and duplicate matching logic R6C is
  meant to improve later.
- **D-R6B-2 (a new curated `destinations` table, not a full taxonomy, not pure dynamic
  derivation)**: destinations are ops-curated rows (slug, name, hero image, description,
  matching aliases) — not a foreign-key taxonomy replacing `guides.city` etc. (too large a
  migration for one sub-phase, touching four existing tables' data), and not derived live
  from `distinct(guides.city)` (no control over presentation, no way to exclude noisy/test
  city strings, no way to list a destination with zero content yet while ops prepares it).
  Each destination still matches guides/experiences/sessions via their existing free-text
  fields, using the exact ILIKE-substring technique already established in
  `getGuidesForRegions`/`getExperiencesForCity`, and array-overlap for session
  `destination_tags` — no new matching primitive invented.
- **D-R6B-3 (index + detail pages)**: `/destinations` is a grid of published destinations
  (hero image, name, description) ordered by a manual `sort_order`; each links to
  `/destinations/[slug]`, which shows that destination's guides, experiences, and upcoming
  sessions in three sections. This matches the placeholder's own "browsable atlas of
  destinations" copy and gives each destination an individually indexable, shareable URL —
  the natural target for the nav/footer links that already point at bare `/destinations`.
- **D-R6B-4 (no admin CRUD in this phase)**: ops manages the `destinations` table directly
  via the Supabase table editor for now, not through a new `/admin/destinations` screen.
  This is a deliberate, documented scope cut (matching this program's own precedent, e.g.
  R3's hidden Saved tab) — a real admin surface (list, form, image handling) is
  meaningfully more work than the traveller-facing browse surface this phase is actually
  about, and is better sized as its own follow-up once there are a handful of real
  destinations to manage.
- **D-R6B-5 (the homepage "destinations" stat switches to counting the new table)**:
  `platform_stats()`'s `destinations` column currently returns
  `count(distinct city) from guides where status = 'published'`. It changes to
  `count(*) from destinations where status = 'published'` — consistent with the new
  curated list rather than a raw, possibly-noisy city-string count, and a small, contained
  change to a function this program has already extended twice (R3C's bookings count,
  R5's upcoming-sessions count).

## Data model

**`destinations`** (new table):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `slug` | text unique | URL segment, e.g. `tokyo` |
| `name` | text | Display name, e.g. `Tokyo` |
| `hero_image_url` | text | |
| `description` | text | Short editorial blurb shown on both index card and detail hero |
| `match_terms` | text[] | Aliases matched against `guides.city`/`experiences.city` (ILIKE,
  same sanitize-then-substring technique as `getGuidesForRegions`/`getExperiencesForCity`)
  and `community_sessions.destination_tags` (array-overlap `&&`). Lets a destination catch
  guides tagged with a nearby neighborhood string (e.g. `Shibuya, Tokyo`) without requiring
  exact equality to `name`. |
| `sort_order` | integer default 0 | Manual index-page ordering |
| `status` | text check (`draft`,`published`) default `draft` | Public read scoped to
  `published`, matching this program's established content-gating convention |
| `published_at` | timestamptz nullable | |
| `created_at`, `updated_at` | timestamptz | |

RLS: public SELECT (anon + authenticated) of `status = 'published'` rows only. No
INSERT/UPDATE/DELETE grant to anon/authenticated at all — per D-R6B-4, only
service-role/ops-via-Supabase-editor writes this table in this phase, so there's no
traveller- or creator-facing write path to gate.

**Aggregate queries** (three, one per content type, each parameterized by a destination's
own `match_terms`, mirroring `getGuidesForRegions`/`getExperiencesForCity`'s existing
sanitize-then-match shape rather than inventing a new technique):
- Guides: `guides.city ilike any(sanitized match_terms as %term%)`, published only.
- Experiences: same shape against `experiences.city`, published only.
- Sessions: `community_sessions.destination_tags && match_terms` (array-overlap), upcoming
  (status in `scheduled`/`live`) only, reusing the same status filter already used by
  `getUpcomingSessionsList`.

## Routes & components

- **`/destinations` (replaces the R1A placeholder in full)**: fetches all `published`
  destinations ordered by `sort_order`, renders a card grid (hero image, name,
  description) linking to `/destinations/[slug]`. Added to `MARKETING_PATHS`
  (`apps/web/lib/seo/routes.ts`), which both drops the current `noindex` and adds it to the
  existing per-locale sitemap loop.
- **`/destinations/[slug]` (new route)**: hero (name, description, hero image) followed by
  three sections — guides, experiences, upcoming sessions — each rendering the relevant
  existing card component (`GuideCard`, `ExperienceCard` from R6A, a session card/link
  matching `SessionsListingView`'s existing row shape) or a plain empty-state message when
  a section has no matches, never fake content. A new `getDestinationsForSitemap()`
  query feeds a new per-destination loop in `apps/web/app/sitemap.ts`, mirroring the
  existing guides/experiences/sessions sitemap builders exactly.
- **Nav/footer**: already link to bare `/destinations` (`Navbar.tsx`, `Footer.tsx`) — no
  change needed.
- **`platform_stats()`**: the D-R6B-5 one-line change to the `destinations` column's query.
- **i18n**: the `destinationsSoon` group (eyebrow/title/body/cta) is replaced by a new
  `destinations` group (index heading + empty-state copy, detail-page section headings and
  per-section empty states) — same shape as R5's own `sessionsSoon` → `sessions` rollout,
  added across all 7 locales.

## Testing

Per-surface, following this program's established layering: a `db.*-migration.test.ts`
SQL-assertion test for the new table + RLS → `lib/destinations/queries.ts` unit tests
(mocked Supabase client, following the `getGuidesForRegions`/`getExperiencesForCity`
pattern) → `*.host.test.tsx` for both the index and detail pages → an update to the
existing sitemap test for the new per-destination entries. `apps/web/tests/
destinations.host.test.tsx` (currently asserts the placeholder renders, is noindexed, and
is excluded from `MARKETING_PATHS`) gets rewritten in full — all three assertions flip.

## Out of scope (R6B)

Articles (`articles.regions`) participating in destination aggregation, and any
improvement to the article↔guide/experience cross-link matcher or an editorial-override
table for it — both explicitly R6C's scope per the master spec's own Cross-links row, not
this phase's. An admin CRUD for managing destinations (D-R6B-4) — ops uses the Supabase
table editor directly. Any backfill or schema change to `guides.city`, `experiences.city`,
`articles.regions`, or `community_sessions.destination_tags` — all four stay exactly as
they are; `destinations.match_terms` is the only new column anywhere. The tier-taxonomy
naming decision — a standalone product decision the master spec explicitly defers,
unrelated to any R6 sub-phase's actual build. Testimonial rotation — R6C's scope.
