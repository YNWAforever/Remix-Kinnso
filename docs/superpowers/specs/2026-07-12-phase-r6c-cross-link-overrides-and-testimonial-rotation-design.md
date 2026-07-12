# Phase R6C — Cross-link Overrides & Testimonial Rotation — Design

> Third and final sub-phase of the master spec's Phase R6 ("Loops & Proof"), per the
> decomposition locked in R6A's own design spec: R6A covered real saves and post-booking
> reviews; R6B covers `/destinations` browse; R6C (this phase) covers cross-link
> automation + editorial overrides, and testimonial rotation. The tier-taxonomy naming
> decision (seed/rising/pro/elite → Explorer/Navigator/Pathfinder/Ambassador) remains a
> standalone, non-technical product decision out of scope for all three sub-phases.

## What R6C delivers

The master spec's entity table gives R6C its scope directly: *"Cross-links | R1 → R6 |
R1: heuristic city/tag matching embeds guide cards in articles... R6: better matching +
editorial override table, plus experience embeds."* Experience embeds are already done —
R3C shipped `ArticleExperienceLinks`/`GuideExperienceLinks`. What remains is "better
matching + editorial override table" for the article↔guide/experience cross-links, plus
the master spec's separate one-line mention of "testimonial rotation" (R6 phase blurb),
which the spec never elaborates on beyond that phrase.

R6C delivers three small, independent pieces: (1) a fix to stop wasting ILIKE match
attempts on article tag slugs that never match a city name; (2) two new editorial
override tables letting ops force-pin a specific guide or experience to a specific
article, shown ahead of (and merged with) the heuristic matches; (3) testimonial rotation
via random selection per request from the published pool, replacing today's fixed
`sort_order` ordering that shows every visitor the identical three quotes forever.

## Locked decisions (D-R6C-N)

- **D-R6C-1 (force-add only, no suppression)**: the override table lets ops pin a
  guide/experience to an article even when heuristic matching wouldn't surface it. It does
  NOT let ops explicitly hide/suppress a heuristic match they consider wrong. This covers
  the main real pain point (a great match the city-substring heuristic misses) without a
  second mechanism and a "does suppression win over pinning" precedence question neither
  the master spec nor current usage demands answering yet.
- **D-R6C-2 (two separate override tables, not one polymorphic table)**:
  `article_guide_overrides` and `article_experience_overrides`, each with a proper FK to
  its one target type, rather than a single table with a type-discriminator column and a
  loosely-typed target id. Simpler FK integrity (a broken guide reference is a constraint
  violation, not a runtime surprise), and matches this codebase's preference for small,
  single-purpose tables over premature generalization — the two tables are consumed by two
  already-separate components (`ArticleGuideLinks`, `ArticleExperienceLinks`) that never
  share a query path today.
- **D-R6C-3 (no admin UI this phase)**: ops manages overrides directly via the Supabase
  table editor, not a new `/admin` screen — the exact same deliberate scope-cut precedent
  as R6B's destinations table (D-R6B-4). Pinning a good match is expected to be an
  occasional, low-volume editorial action, not a bulk content-management workflow that
  justifies a dedicated UI this phase.
- **D-R6C-4 (matching fix is minimal, not an FTS upgrade)**: `ArticleGuideLinks.tsx` and
  `ArticleExperienceLinks.tsx` currently build their region-matching input as
  `[...(a.regions ?? []), ...(a.tag_slugs ?? [])]` before calling
  `getGuidesForRegions`/`getExperiencesForCity` — but `tag_slugs` entries (e.g. `"food"`,
  `"walking-tour"`) are never city-name-shaped, so every tag slug is a wasted ILIKE clause
  that can never match. The fix is to pass only `a.regions`. This phase does NOT reuse
  R4's `search_guides_and_experiences` FTS RPCs to broaden matching beyond city
  substrings — a real upgrade path, but a materially bigger change than "loops & proof"
  warrants alongside the other two pieces here, and better scoped as its own future phase
  once there's a concrete signal that ILIKE-on-city is actually missing real matches (not
  just wasting cycles on tags, which is today's *confirmed* problem).
- **D-R6C-5 (testimonial rotation = per-request random selection, no schedule, no
  featured flag)**: `getPublishedTestimonials` currently runs
  `.order('sort_order').order('created_at').limit(3)` — a fully deterministic query, so
  every visitor sees the identical three quotes forever, and whatever ops set as the
  lowest `sort_order` values is permanently "the testimonials" until someone manually
  reorders them. Rotation means: fetch every published row matching the locale/role
  filter (a small pool — currently 3 total, expected to grow slowly), shuffle it, and
  return the first 3. No time-based/seeded determinism, no new "featured" column — `
  sort_order` stays on the table (ops still uses it to express intent/preference) but
  stops being the literal display-order driver. This is deliberately the simplest
  interpretation of an intentionally vague master-spec phrase; a scheduled or
  weighted-rotation design is not precluded later but isn't warranted by anything in the
  spec today.
- **D-R6C-6 (overrides scope: article↔guide/experience only)**: the new override tables
  cover `ArticleGuideLinks` and `ArticleExperienceLinks` only. `GuideExperienceLinks`
  (guide→experience cross-links on guide detail pages) stays heuristic-only — the master
  spec's Cross-links row names "article↔guide/experience" specifically, not
  guide→experience, and there's no signal this second cross-link surface has the same
  "good match the heuristic misses" problem the article-facing one does.

## Data model

Two new tables, mirroring `destinations`' RLS shape (D-R6B-2's public-read/zero-write
pattern) rather than `testimonials`' ops-CRUD-via-RLS shape, since D-R6C-3 already rules
out any authenticated write path this phase:

```
article_guide_overrides:
  id uuid PK, article_id uuid FK->articles(id) on delete cascade,
  guide_id uuid FK->guides(id) on delete cascade,
  sort_order integer default 0, created_at timestamptz
  unique(article_id, guide_id)

article_experience_overrides:
  id uuid PK, article_id uuid FK->articles(id) on delete cascade,
  experience_id uuid FK->experiences(id) on delete cascade,
  sort_order integer default 0, created_at timestamptz
  unique(article_id, experience_id)
```

RLS: public SELECT (anon + authenticated) with no row-level filter (both tables are pure
ops-curated mappings with no draft/published concept of their own — an override row
either exists or it doesn't); zero INSERT/UPDATE/DELETE grant to anon/authenticated at
all, matching `destinations`' "ops writes directly via the Supabase table editor /
service_role only" convention.

## Routes & components

- **`apps/web/lib/articles/cross-link-overrides.ts`** (new): `getGuideOverridesForArticle
  (articleId)` and `getExperienceOverridesForArticle(articleId)`, each a straightforward
  join-and-map query (override table → target table) ordered by the override's own
  `sort_order`, returning the same `Guide[]`/`PublicExperience[]` shapes
  `getGuidesForRegions`/`getExperiencesForCity` already return — so the consuming
  components don't need two different card-rendering paths for pinned vs. heuristic
  results.
- **`ArticleGuideLinks.tsx` / `ArticleExperienceLinks.tsx`** (modified): each now fetches
  its override list and its heuristic list in parallel (`Promise.all`), then merges:
  pinned items first (in override `sort_order`), heuristic matches fill any remaining
  slots up to the existing display limit (3), skipping any heuristic match whose id is
  already present in the pinned list. The region-matching input passed to the heuristic
  call drops `tag_slugs` per D-R6C-4 — only `a.regions` is passed through.
- **`apps/web/lib/home/queries.ts`**: `getPublishedTestimonials` drops its
  `.order(...).order(...).limit(3)` tail, instead selecting all matching rows, shuffling
  (Fisher-Yates) in JS, and slicing to 3. Signature and return shape are unchanged, so
  `HomeView.tsx` and both landing pages (`/for-creators`, `/for-merchants`) need no
  changes at all.

## Testing

Per this program's established layering: a `db.*-migration.test.ts` SQL-assertion test
for each new override table (schema + RLS) → unit tests for
`getGuideOverridesForArticle`/`getExperienceOverridesForArticle` (mocked Supabase client,
mirroring existing query-test conventions) → unit tests for the merge logic in
`ArticleGuideLinks`/`ArticleExperienceLinks` (pinned-first ordering; dedupe when a
heuristic match is already pinned; correct heuristic-only fallback when no overrides
exist; the display limit is still respected after merging) → a unit test for the
testimonial shuffle confirming the returned set is always a subset of the filtered pool,
always the right size, and — via a mocked/seeded random source or a repeated-run
distribution check — genuinely reordered rather than a no-op passthrough.

## Out of scope (R6C)

A suppression mechanism for bad heuristic matches (D-R6C-1) — force-add only. An admin UI
for managing overrides (D-R6C-3) — Supabase table editor only, this phase. Any FTS-based
matching upgrade reusing R4's search RPCs (D-R6C-4) — the ILIKE technique is unchanged,
only the tag-slug waste is fixed. Overrides for `GuideExperienceLinks` (D-R6C-6) — stays
heuristic-only. Any scheduled/time-based rotation, a "featured" flag, or admin control
over rotation timing (D-R6C-5) — pure per-request randomization from the existing pool.
The tier-taxonomy naming decision — a standalone product decision the master spec
explicitly defers, unrelated to any R6 sub-phase's actual build.
