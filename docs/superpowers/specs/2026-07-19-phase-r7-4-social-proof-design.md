# Phase R7.4: Social Proof Surfaces Design

**Status:** Approved
**Date:** 2026-07-19
**Scope:** KINNSO Phase R7.4 — social proof surfaces

## Goal

Make KINNSO's public social proof visible without overstating product maturity. The homepage must show real platform counts that meet their honesty thresholds and replace all sub-threshold metrics with one qualitative, localized “Growing fast” chip. Published testimonials must remain real, locale-aware, and audience-matched.

This design is governed by the Phase R7 UX Hardening specification and the conventions in §7 of `2026-07-02-product-revision-program-design.md`.

## Ground Truth

| Surface | Discovered state | Design consequence |
| --- | --- | --- |
| Platform stats | `platform_stats()` and `getPlatformStats()` already return creators, published guides, destinations, completed bookings, and upcoming sessions | Reuse the existing public RPC and map only the four metrics named by R7.4 into the stats bar |
| Stats visibility | `StatsBar` currently hides every sub-threshold metric and hides the whole bar unless at least two metrics pass | Remove the whole-bar minimum and render one aggregate qualitative chip whenever any of the four metrics is below threshold |
| Homepage order | `HomeView` already renders `Hero`, `StatsBar`, testimonials, then how-it-works | Preserve the existing section placement |
| Testimonials | `getPublishedTestimonials()` already filters published rows by locale and optional `author_role`, shuffles the pool, and caps output at three | Preserve the data boundary and add regression coverage for the three public callers |
| Empty testimonial state | Homepage, creator, and merchant views already omit their testimonial section when the supplied list is empty | Preserve and test the current honest empty state |
| Ops management | A testimonial list/create/toggle console and secured actions already exist | Do not add duplicate CRUD or a migration |
| Cache policy | The homepage and both audience landing pages currently revalidate every 300 seconds; testimonial mutations explicitly refresh locale homepages only | Move all three social-proof pages to an approximately one-hour ISR window and extend mutation revalidation to both audience landing pages |

## Constraints

- Never display a zero count or fabricate a numeric value.
- Only counts returned by `platform_stats()` may be rendered as platform metrics.
- The R7.4 bar contains active creators, published guides, destinations, and completed bookings only. Upcoming sessions remain a separate homepage content surface.
- Preserve the current threshold values unless a later authoritative specification changes them.
- Public reads remain anonymous and protected by RLS.
- Add every new UI string to all seven locale files and preserve locale parity.
- Do not add a database migration or duplicate the existing testimonial operator console.
- Query failure must not take down a public page.

## Stats Bar Behavior

The stats bar builds four ordered metric candidates:

1. Active creators, threshold 5.
2. Published guides, threshold 10.
3. Destinations, threshold 3.
4. Completed bookings, threshold 3.

Each metric at or above its threshold renders its real, locale-formatted count and existing localized label. Metrics below threshold are not rendered individually.

If one or more metrics is below threshold, the bar appends exactly one qualitative list item using a new localized `statGrowingFast` message. The chip has no numeric value and does not identify which internal metric is below threshold. This is the approved aggregate-chip behavior.

The resulting states are:

| RPC result | Rendered result |
| --- | --- |
| Unavailable or invalid | No stats bar; the homepage remains available |
| All four metrics below threshold | One “Growing fast” chip |
| Some metrics pass | Every passing real count plus one “Growing fast” chip |
| All four metrics pass | Four real counts and no qualitative chip |

The obsolete `MIN_VISIBLE_STATS` rule is removed. The component never renders `0`, a below-threshold number, or the upcoming-sessions metric.

## Testimonials

The existing query remains the single data boundary:

- Homepage: published testimonials matching the requested locale or global locale, across all audience roles, shuffled and capped at three.
- `/for-creators`: the same published and locale-aware pool restricted to `author_role = 'creator'`.
- `/for-merchants`: the same published and locale-aware pool restricted to `author_role = 'merchant'`.

The public surfaces render up to three rows returned by the database and never invent quotes to reach a minimum. If no eligible rows exist, the section is omitted entirely. A pool of fewer than three real rows may render fewer than three; operations content readiness remains responsible for supplying the desired two-to-three homepage testimonials.

The existing testimonial operations console is sufficient. Its create and publish-toggle actions remain behind the current operations authorization boundary. Their shared revalidation helper will refresh the homepage plus both audience landing pages for every locale after a successful mutation.

## Localization

Add `home.statGrowingFast` to the canonical English message type and all seven locale dictionaries. The copy is a short qualitative status, not a disguised count. Existing stat and testimonial keys remain unchanged.

Locale parity tests must fail if any dictionary omits the new key. The stats component receives the message through its existing typed `Messages['home']` prop.

## Caching and Freshness

Set `revalidate = 3600` on:

- `/[locale]`
- `/[locale]/for-creators`
- `/[locale]/for-merchants`

This implements the R7.4 approximately one-hour ISR requirement consistently for public social-proof reads. Extend the testimonial operator action helper to explicitly revalidate all three paths for every locale after a successful mutation, so an editorial publish or unpublish does not have to wait for the passive ISR interval.

## Error Handling

`getPlatformStats()` continues to return `null` on RPC errors or missing rows, and `StatsBar` continues to render nothing for `null`. This preserves the public reads-never-crash convention.

`getPublishedTestimonials()` continues to treat missing or failed read data as an empty pool. Each view then omits its section, avoiding broken shells, placeholder quotes, or leaked database errors.

## Verification Strategy

Focused unit and host coverage will verify:

- A null stats result hides the bar.
- Four sub-threshold metrics render exactly one localized qualitative chip and no number.
- Mixed data renders every passing real count plus exactly one chip.
- Boundary values count as passing.
- All passing metrics render without the chip.
- Zero and upcoming-session labels never appear in the R7.4 bar.
- The platform RPC mapper still maps all returned fields without changing the database contract.
- Homepage testimonials remain capped at three real published rows.
- Creator and merchant pages pass only their audience role into the testimonial query.
- Empty testimonial arrays omit each section.
- All seven locale dictionaries contain the new key.
- All three public social-proof pages use the one-hour revalidation constant.

Run focused R7.4 Vitest suites, TypeScript validation, and the production build. The repository-wide baseline is currently expected to retain 27 unrelated Supabase-connected failures across 12 integration files when the external test database is unreachable; new focused tests must pass independently.

## Deployment and Rollback

R7.4 is application-only. No Supabase migration, generated database type change, production data write, Stripe change, or Vercel configuration change is required.

Rollback is a normal application rollback. Restoring the prior component and cache constants reverts the visible behavior; no data repair is needed.

## Out of Scope

- Publishing or fabricating testimonial content.
- Changing stat thresholds.
- Showing upcoming sessions as a platform-scale metric.
- Creating a second testimonial administration surface.
- Changing testimonial schema, RLS, or production rows.
- Redesigning the homepage beyond the existing stats and testimonial sections.

## Approved Decisions

- Render every threshold-passing real count plus one aggregate localized “Growing fast” chip whenever any authoritative metric is below threshold.
- Use only the four metrics named in R7.4.
- Preserve the existing testimonial query and operations console.
- Hide testimonial sections only when their eligible result set is empty; never invent rows.
- Use a one-hour ISR interval on all three public social-proof pages, extending mutation revalidation to cover each path.
