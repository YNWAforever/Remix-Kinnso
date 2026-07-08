# Phase R6A — Saves & Reviews — Design

> First of three sub-phases for the master spec's Phase R6 ("Loops & Proof"), split for
> the same reason R1/R2/R3 each split into A/B/C: R6 as written bundles five largely
> independent sub-features (real saves, post-booking reviews, `/destinations` browse,
> cross-link automation, testimonial rotation) with almost no shared mechanics. R6A covers
> the two most closely related items — real saves and post-booking reviews, the traveller
> loop's "proof" mechanics per the master spec's §3 loop description. R6B (destinations
> browse) and R6C (cross-links + editorial overrides + testimonial rotation) follow as
> their own spec/plan/implementation cycles. The tier-taxonomy naming decision (seed/
> rising/pro/elite → Explorer/Navigator/Pathfinder/Ambassador) is a standalone product
> decision, not a build, and is out of scope for all three sub-phases.

## What R6A delivers

Real save/bookmark actions on guides and experiences (closing the gap where
`guides.saves_count` has existed since R1 but nothing has ever written to it), and
post-booking star ratings + optional text reviews that feed `aggregateRating` JSON-LD on
guide and experience detail pages. The `/trips` "Saved" tab — already built, deliberately
hidden per decision `D-R3-5` — goes live.

## Locked decisions (D-R6A-N)

- **D-R6A-1 (review eligibility)**: a booking is reviewable only once its `status` reaches
  `completed` (merchant has explicitly called `mark_booking_completed`), not merely
  `confirmed` (payment succeeded, trip may not have happened). This resolves an internal
  contradiction in the master spec (one line says "confirmed bookings can review," the
  loop description calls it a "post-trip review") in favor of the stricter, more honest
  reading — a review is a claim about an experience that occurred. Since exactly 0
  bookings are `completed` live today, reviews launch genuinely empty, consistent with this
  program's standing no-fake-content principle.
- **D-R6A-2 (review content)**: a required 1-5 star rating plus an optional free-text body.
  The star rating is what `aggregateRating`'s math needs; the optional text preserves real
  social-proof value without forcing every reviewer to write something.
- **D-R6A-3 (review moderation)**: auto-publish immediately on submission, no pre-publish
  ops queue. The reviewer already holds a real, verified `completed` booking — a much
  stronger anti-abuse signal than an open text form — so requiring ops approval before the
  platform has any reviews at all would just add friction at the worst possible time.
  Ops retain a post-hoc hide action (a `status` toggle), matching testimonials' shape but
  applied *after* publish rather than *before*.
- **D-R6A-4 (guest bookings cannot review)**: only bookings with a real `traveler_user_id`
  are reviewable. A guest checkout (`guest_email`, no account) has no identity to own a
  review's RLS against — this falls out of the same sign-in requirement saves already need,
  not a separate restriction invented for reviews.
- **D-R6A-5 (saves scope: guides AND experiences)**: both content types get saves, not
  just guides — despite the master spec's data-model table literally naming the feature
  `guide_saves` and only guides having an existing `saves_count` column today. Two parallel
  tables (`guide_saves`, `experience_saves`), not one polymorphic table, matching this
  codebase's established "each feature/content-type gets its own table" convention (seen in
  `agent_rate_limits` and `checkout_rate_limits` — two separate, byte-for-byte-identical
  tables rather than one shared table with a discriminator column, both confirmed merged to
  `main`; R5's in-flight `rsvp_rate_limits`, PR #79, follows the same convention but had not
  merged to `main` as of this writing, so it is not cited here as a merged precedent).
- **D-R6A-6 (saves require sign-in, no anon path)**: consistent with the one existing
  save/bookmark precedent in this codebase, `merchant_saved_creators` (owner-scoped RLS,
  no anon grant at all). An anon visitor sees the save button; clicking it routes to
  sign-in rather than silently failing.
- **D-R6A-7 (aggregateRating is a live query, not a trigger-maintained column)**: unlike
  `saves_count` (a single incrementing integer, cheap and correct to maintain via trigger),
  a rating aggregate needs both an average and a count, and review volume will be tiny for
  the foreseeable future (0 completed bookings exist live today across the whole platform).
  A live `avg()`/`count()` query at read time is simpler and avoids trigger-consistency
  complexity for a two-number aggregate that changes rarely.
- **D-R6A-8 (guide JSON-LD gains aggregateRating as a new optional field, not a new emitter)**:
  guides currently only get `Article`-type JSON-LD (`lib/seo/jsonld.ts`'s `articleJsonLd`
  equivalent for guides) with no product/rating shape. Since schema.org's `Article` (via
  `CreativeWork`) natively supports `aggregateRating`, this phase adds it as an optional
  field to guides' existing JSON-LD rather than inventing a parallel `Product` emitter —
  guides aren't literally products, and this is a smaller diff. Experiences already have a
  `Product`-typed JSON-LD (`experienceOfferJsonLd`) and simply gain the same optional field.
  Both omit the field entirely when zero published reviews exist — never a fake
  `"ratingCount": 0`.

## Data model

**`guide_saves`** (new table):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `guide_id` | uuid | `references guides(id) on delete cascade` |
| `traveler_user_id` | uuid | `references auth.users(id) on delete cascade`, NOT NULL |
| `created_at` | timestamptz | default `now()` |

`unique(guide_id, traveler_user_id)`. RLS: owner-scoped SELECT/INSERT/DELETE
(`traveler_user_id = auth.uid()`), no anon grant at all — same shape as
`merchant_saved_creators`. A trigger on insert/delete increments/decrements
`guides.saves_count` (the existing, currently-inert column).

**`experience_saves`** (new table): identical shape, `experience_id` instead of
`guide_id`. Requires a new `saves_count integer not null default 0` column on
`experiences` (doesn't exist today) plus its own trigger, mirroring `guide_saves` exactly.

**`reviews`** (new table):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `booking_id` | uuid | `references bookings(id) on delete cascade`, **unique** |
| `traveler_user_id` | uuid | `references auth.users(id) on delete cascade`, NOT NULL |
| `rating` | smallint | `check (rating between 1 and 5)`, NOT NULL |
| `body` | text | nullable |
| `status` | text | `check (status in ('published','hidden'))`, default `'published'` |
| `created_at` | timestamptz | default `now()` |

RLS: INSERT gated to `authenticated` `with check` clauses enforcing (a)
`traveler_user_id = auth.uid()`, (b) the referenced booking's own `traveler_user_id`
matches the caller and its `status = 'completed'` (an `exists(...)` subquery against
`bookings`, the real enforcement boundary — mirrors R5's cancelled-session RLS fix
pattern), and (c) uniqueness on `booking_id` (one review per booking). Public SELECT of
`status = 'published'` rows for anon + authenticated. Ops-only UPDATE (the `status`
toggle), no public UPDATE/DELETE.

**Aggregate query** (used by both guide and experience detail pages, and by the new
JSON-LD fields): a plain query, not an RPC — following this codebase's established
`lib/<domain>/queries.ts` convention (e.g. `lib/guides/queries.ts`, `lib/experiences/
queries.ts`) — computing `avg(rating), count(*) from reviews where status = 'published'`,
joined through `reviews.booking_id → bookings.{guide_id|experience_id}` (whichever the
`bookings` table already keys on) to scope to the relevant guide/experience row.

## Routes & components

- **Save/unsave toggle**: a new small client component wired into `GuideCard`, the guide
  detail page, `ExperienceCard` (new), and the experience detail page. Anon click → route
  to sign-in. Signed-in click → insert/delete via a server action, matching the existing
  `merchant_saved_creators` toggle's shape but as its own distinct action module (not
  shared code) to keep the two save concepts (merchant→creator vs. traveller→content)
  conceptually and structurally separate, per the earlier ground-truth survey's caution.
- **`/trips` "Saved" tab**: replaces the current static "coming soon" copy with two real
  sections — "Saved guides" and "Saved experiences" — each a simple list linking through to
  the real content page. No new detail UI; this is a query-and-link surface.
- **Review CTA + form**: appears on any `/trips` row whose booking is `completed` and has
  no review yet, and on the experience `booked` confirmation page's `completed` branch.
  Star input (1-5, required) + optional text area, submitted via a server action.
- **Review display**: guide and experience detail pages show the aggregate (average +
  count, omitted entirely at zero) plus a list of published review text. No reviewer
  identity beyond a generic "a KINNSO traveller" label — nothing in this codebase currently
  exposes a traveller's identity publicly, and the spec doesn't ask for it.
- **`aggregateRating` JSON-LD**: added as an optional field to the existing guide JSON-LD
  builder and to `experienceOfferJsonLd`, sourced from the aggregate query above.

## Testing

Per-surface, following this program's established layering: `db.*-migration.test.ts` for
the three new tables + triggers + RLS → `lib/{saves,reviews}/{queries,actions}.test.ts` →
`*.host.test.tsx` for the save toggle components, the `/trips` Saved tab, the review CTA/
form, and the updated guide/experience detail pages → a JSON-LD test extending the
existing `seo.jsonld.test.ts` coverage.

## Out of scope (R6A)

`/destinations` browse, cross-link automation, editorial overrides, and testimonial
rotation (all R6B/R6C); the tier-taxonomy naming decision (a standalone product decision,
not a build); ops moderation queue for reviews (auto-publish per D-R6A-3; only a post-hoc
hide action exists); reviewer identity/profile display; review editing or deletion by the
traveller after submission; saves/reviews for content types other than guides/experiences
(e.g. no session reviews — R5's Community Sessions are entirely separate); any email
notification tied to saves or reviews (no mailer integration exists anywhere in this
codebase, same standing constraint every prior phase has hit).
