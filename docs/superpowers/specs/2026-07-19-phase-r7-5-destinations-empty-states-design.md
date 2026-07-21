# Phase R7.5 — Destinations Index and Empty States Design

**Date:** 2026-07-19
**Status:** Approved design
**Source of truth:** `kinnso-phase-r7-ux-hardening-spec.md` R7.5, the approved R1–R6 program design §7, and `docs/r7-ground-truth.md`
**Branch:** `codex/r7-5-destinations-empty-states`
**PR title:** `Phase R7.5 — Destinations index & empty states`

## 1. Goal and scope

Make every public browse surface honest and useful under the current inventory:

- `/destinations` is derived from published guides and experiences instead of the empty curated table.
- `/destinations/[slug]` shows the matching guides, experiences, articles, and live sessions with localized metadata and `ItemList` JSON-LD.
- `/sessions` keeps an honest, useful email-capture state while no sessions are live.
- `/articles` omits category sections with no published articles.

This phase does not add marketplace capabilities, author editorial content, alter frozen content URLs, or change the R7.2 navigation rule. It does not apply migrations to production without a separate explicit approval.

## 2. Verified starting state

The repository already ships the R6 destinations backend:

- `public.destinations` stores optional curated names, media, descriptions, match terms, and sort order.
- `apps/web/lib/destinations/queries.ts` reads only published curated rows.
- The index and detail routes already exist and use public clients under RLS.
- The detail route already loads guides, experiences, and sessions through shared matching queries.
- R7.3 provides `EntityMedia` and deterministic `MediaPlaceholder` rendering.
- R7.2 provides `getProductState()` and the `sessionsLive` flag.

Production read-only evidence on 2026-07-19:

- `public.destinations`: 0 rows.
- Published guides: 8 cities — Bali, Bangkok, Busan, Chiang Mai, Kyoto, Seoul, Singapore, and Tokyo; one guide in each city.
- Published experiences: 5 cities — Bali, Bangkok, Chiang Mai, Seoul, and Tokyo; one experience in each city.
- Published guide/experience city values have no case, spacing, or spelling mismatches today.
- None of those 13 inventory rows currently has approved entity media, so the honest fallback is `MediaPlaceholder`.
- `public.community_sessions`: 0 rows, therefore `sessionsLive` is false.

Untouched branch baseline: 6 focused Vitest files / 38 tests passed; all 8 workspace typecheck tasks passed.

## 3. Approaches considered

### A. Inventory view with curated overlay — selected

Create a public, security-invoker database view that aggregates published guide and experience inventory by normalized city. A published row in the existing `destinations` table may override presentation fields and matching aliases, but inventory determines whether a destination exists and supplies its counts.

This provides one source for the index, detail lookup, and sitemap while preserving the R6 operator-curation path.

### B. Materialize inventory into `destinations`

Triggers or scheduled synchronization would insert and update curated destination rows. This duplicates source-of-truth state, adds write-path failure modes, and makes unpublishing inventory harder to reason about.

### C. Aggregate in Next.js

The server could fetch every published guide and experience and group them in TypeScript. This avoids a migration but duplicates aggregation across pages and sitemap generation, increases query volume, and weakens database-level consistency.

## 4. Database design

### 4.1 `public.destination_index`

Add a new timestamped migration that creates `public.destination_index` as a normal Postgres view with `security_invoker = true`. The view runs with caller permissions, so existing RLS policies on `guides`, `experiences`, and `destinations` remain the enforcement boundary.

The migration explicitly grants `SELECT` to `anon` and `authenticated`. This is required because Supabase's 2026 Data API defaults no longer guarantee automatic exposure for new relations.

The view returns:

| Column | Meaning |
|---|---|
| `slug` | Curated published slug when matched; otherwise a deterministic city slug |
| `name` | Curated name when matched; otherwise the canonical trimmed inventory spelling |
| `hero_image_url` | Curated hero, then latest approved guide/experience media candidate, otherwise null |
| `description` | Curated description or null |
| `match_terms` | Distinct curated aliases plus observed inventory spellings and canonical city name |
| `guide_count` | Count of published guides in the normalized city |
| `experience_count` | Count of published experiences in the normalized city |
| `latest_published_at` | Latest guide/experience publication time for sitemap `lastmod` |
| `sort_order` | Curated order when available; generated destinations follow alphabetically |

City normalization is deterministic and intentionally conservative:

1. Trim leading/trailing whitespace.
2. Replace punctuation/whitespace runs with one space.
3. Lowercase for the grouping key.
4. Preserve a real observed spelling for display.
5. Slugify the normalized value with hyphens; use a stable short hash fallback only if no alphanumeric slug can be produced.

The curated overlay matches either its slug or any normalized value in `name` plus `match_terms`. Draft curated rows never override public inventory.

Only nonblank published inventory contributes a destination. A curated row without published inventory remains absent, preventing a primary browse surface from becoming an empty promise.

### 4.2 `public.session_waitlist`

Add an append-only session-interest table because `session_rsvps.session_id` is correctly non-null and cannot represent interest before a real session exists.

Fields: `id`, normalized `email`, optional `user_id`, `locale`, and `created_at`; a case-insensitive unique email index makes repeat submissions idempotent.

Security follows the existing RSVP pattern:

- RLS enabled.
- `anon` and `authenticated` may insert only a null `user_id` or their own `auth.uid()`.
- Only active ops may select rows.
- No update or delete grant for public roles.
- The server action reuses `check_and_increment_rsvp_rate_limit`, email validation, client-IP extraction, honeypot behavior, and duplicate-as-success semantics from `rsvpToSessionAction`. This is the same Community Sessions acquisition surface, so sharing its rate bucket is intentional.

After local migration verification, regenerate `packages/db/types.ts` and include the generated view/table types in the same PR.

## 5. Application architecture

### 5.1 Destination query boundary

`apps/web/lib/destinations/queries.ts` remains the only public destination-query module.

Its `Destination` domain shape gains `guideCount`, `experienceCount`, and `latestPublishedAt`. The existing functions keep their public names but read `destination_index`:

- `getPublishedDestinations()` returns every inventory-backed city in curated-order/alphabetical order.
- `getDestinationBySlug(slug)` resolves generated and curated destinations.
- `getDestinationsForSitemap()` returns the same slugs and inventory-derived `lastmod`.

This preserves current route imports while removing the empty-table dependency.

### 5.2 `/destinations`

Each card renders:

- City name.
- `EntityMedia` using the view's media candidate; production currently falls back to the deterministic branded placeholder.
- Guide and experience counts, showing only non-zero counts and joining both with the localized separator.
- Curated description only when present.

Count copy uses locale dictionary templates with singular/other variants where the locale needs them. No count is hardcoded in a component.

The existing route stays ISR-rendered and indexable. The old generic empty message remains as defensive fallback for a truly empty marketplace, but current production renders eight cards.

### 5.3 `/destinations/[slug]`

The route resolves the destination from the inventory view and returns `notFound()` for unknown slugs. It loads independent modules concurrently:

- Guides via existing normalized region matching.
- Experiences via existing normalized city matching.
- Articles via the existing published article search heuristic using destination name/aliases.
- Sessions only when `getProductState().sessionsLive` is true.

The view shows only non-empty sections. A destination always has at least a guide or experience because inventory creates the destination; articles and sessions are optional.

Metadata uses localized dictionary copy when no curated description exists. JSON-LD includes the existing breadcrumb plus a new `ItemList` containing only rendered guides, experiences, articles, and sessions, each with its canonical localized URL and position.

### 5.4 `/sessions` empty state

When both upcoming sessions and replays are empty, replace the bare sentence with a value-framed empty state and a localized email form: “Get notified when sessions open.”

The form submits to a new `joinSessionWaitlistAction`, uses the same user-visible result states as RSVP (success, invalid, rate-limited, and failed), and includes an off-screen honeypot. When any real session exists, the normal upcoming/replay listing remains unchanged and the generic waitlist is not shown.

### 5.5 Articles index

After the existing concurrent category queries resolve, filter out sections whose `items` array is empty. No category heading or arrow renders without at least one published article. Category routes are unchanged; sitemap-category policy remains owned by R7.8.

## 6. Error handling and static-rendering constraints

- Destination view query errors retain the established fail-loud behavior so CI/build catches schema drift; they are not converted into a misleading empty marketplace.
- An unknown destination slug returns the branded 404 through `notFound()`.
- Optional destination modules return empty arrays and disappear when they have no matching content.
- Session waitlist validation and rate-limit failures return typed results; raw database errors are logged server-side and never exposed to the visitor.
- Marketing pages keep their current ISR/static behavior. No request cookies or user-specific database reads enter destination pages.
- The session waitlist server action is invoked only after client submission and does not make the listing page dynamic.

## 7. Localization and accessibility

All new UI and metadata strings are added to all seven locale dictionaries and covered by locale parity. This includes destination count labels, article heading, destination metadata fallback, session empty-state value copy, form labels, button text, and result messages.

`EntityMedia` supplies meaningful alt text for real media and its placeholder remains decorative. Form controls have visible labels, status messages use an appropriate live region, and the honeypot is removed from keyboard navigation.

## 8. Testing strategy

Implementation follows red-green-refactor for each behavior.

### Migration and query contracts

- Migration test asserts `security_invoker`, explicit grants, published-only inventory, normalization, curated overlay, accurate counts, session-waitlist RLS, and absence of public read/write escalation.
- Local Supabase integration test inserts mixed-case/spacing city fixtures and proves they aggregate to one destination with accurate guide/experience counts.
- Query tests map the new view shape, preserve ordering, resolve slugs, and drive sitemap rows from inventory.

### Host and component tests

- Destination index renders counts, hides zero counts, links all cards, and uses honest media fallback.
- Destination detail renders articles, gates sessions under both product states, hides empty optional headings, localizes metadata, and emits ordered `ItemList` JSON-LD.
- Unknown destination slugs still 404.
- Sessions listing renders the capture only when both lists are empty.
- Session waitlist action covers honeypot, validation, rate limiting, authenticated/anonymous inserts, duplicates, and database failure.
- Articles index omits an empty category while preserving populated categories.
- Locale-parity and sitemap tests cover all new keys and inventory-derived destination entries.

### Verification before PR

- Focused Vitest suites for every touched surface.
- Local Supabase reset plus migration/query integration assertions.
- `pnpm typecheck`, lint, honesty lint, and locale parity.
- Relevant Playwright smoke journeys for destinations, sessions empty state, and articles category visibility.
- Production build with the established Vercel-safe environment.
- Read-only production verification of city counts and mismatch report before requesting migration approval.

## 9. Delivery boundaries

- One Conventional Commit series on `codex/r7-5-destinations-empty-states`.
- One squash-merged PR titled `Phase R7.5 — Destinations index & empty states`.
- The PR records the production city audit. Current mismatch list: none.
- Migration files may be pushed and reviewed, but applying them to production requires explicit user approval after CI and review are green.
