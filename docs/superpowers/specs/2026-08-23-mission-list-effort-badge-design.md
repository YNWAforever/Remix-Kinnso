# Mission List Effort Badge — Design

**Status:** Approved by user 2026-08-23, pending implementation plan.

## Goal

Surface a mission's effort estimate (added in R13.0, currently only visible after opening a
mission's detail page) as a small badge on the creator-facing mission list, so a creator can
triage effort while browsing without opening every mission.

## Context

R13.0 ("Mission Brief Richness") added an optional `effort` column (`low`/`medium`/`high`,
nullable) to `missions`, along with six richer brief-content array fields (deliverables,
requirements, dos, donts, key_messages, reference_links). It surfaced `effort` in exactly two
places: the merchant wizard (setting it at creation) and the full creator-facing mission detail
page (`CreatorMissionDetailView.tsx`, as a badge). The creator-facing mission LIST
(`CreatorMissionsView.tsx`, backed by `listCreatorMerchantMissions`/`creatorMissionSelect` in
`lib/missions/queries.ts`) never fetches or displays `effort` — a creator only learns a
mission's effort level after opening it. This was flagged as a legitimate, deliberately
out-of-scope observation during R13.0's final holistic review, not a defect: R13.0's own design
doc named only "merchant-editor + creator-facing detail page" as in scope.

## Decisions made during brainstorming

1. **Effort badge only** — no separate "has a detailed brief" indicator for the other six brief
   fields. Effort is a single enum, cheap to render as a badge, and directly answers "how much
   work is this" before opening a mission. The other fields are prose meant to be read in full
   on the detail page, not summarized at a glance.
2. **Creator-facing list only** (`CreatorMissionsView.tsx`) — not the separate merchant-side
   list (`MerchantMissionsView.tsx`, showing a merchant their own posted missions). The badge's
   value is helping a creator triage a mission they don't yet know much about; a merchant
   already knows the effort of missions they wrote themselves.
3. **Both list sections** — "My missions" (already joined) and "Available missions" (browsing
   to decide) both render the badge. Both sections already share the same `TicketCard`
   badge-row markup, so gating it to only one section would add conditional complexity for no
   real benefit.
4. **Reuse `MissionEffort` end-to-end, no new type.** Same enum, same narrowing approach
   R13.0's `detail.ts` already established (`narrowEffort`-style: any DB string not in
   `{low, medium, high}` becomes `null`, never passed through raw).
5. **One relocated i18n key**, not a new phrasing. `missions.effortBadgeLabel: (level) => string`
   reuses R13.0's exact translated content from `missionDetail.effortBadgeLabel`, just added to
   the `missions` section since that's the `t` prop `CreatorMissionsView.tsx` actually receives
   (it doesn't receive `missionDetail`). Same 7-locale content, no re-translation needed.

## Out of scope

- The "has a detailed brief" indicator for deliverables/requirements/dos/donts/key_messages
  (decision 1).
- `MerchantMissionsView.tsx` (decision 2).
- Any change to the merchant wizard, the schema, or the detail page — those are R13.0's
  finished work, untouched here.
- `MissionDetailView.tsx` (the ops/admin submission-review queue) — confirmed during R13.0's
  final review to be a different kind of view (a review table, not a mission-content display)
  and out of scope for the same reason it was out of scope for R13.0 itself.

## Architecture

**Query** — `creatorMissionSelect` (`lib/missions/queries.ts`), which backs
`listCreatorMerchantMissions` and therefore `CreatorMissionsView.tsx` via
`apps/web/app/[locale]/studio/missions/page.tsx`, gains one new flat column: `effort`. This is
the only query change; no new columns needed since R13.0 already added `effort` to the
`missions` table.

**Type threading** — `studio/missions/page.tsx`'s `CreatorMissionRow` type gains
`effort: string | null` (matching the raw-row convention used elsewhere in that file, e.g.
`mission_type: string | null`). Its `mapCreatorMission()` function narrows the raw string to
`MissionEffort | null` using the same defensive pattern as R13.0's `detail.ts` (`narrowEffort`)
— reusing `missionEfforts`/`MissionEffort` imported from `lib/missions/types.ts`, not a
hand-rolled duplicate set (this was a specific review finding on R13.0's own Task 8; this phase
should not reintroduce it). `CreatorMissionCard` (the mapped type consumed by
`CreatorMissionsView.tsx`) gains `effort: MissionEffort | null`.

**Rendering** — `CreatorMissionsView.tsx` renders the badge in the same badge-row `<div>` that
already holds `MissionStatusBadge` and the conditional "Funded" badge, in both the "My
missions" and "Available missions" `TicketCard` blocks (two separate `.map()` calls in the
current component, both need the same small addition). Rendered only when `mission.effort` is
truthy — nothing shown otherwise, matching every other optional-field convention this codebase
already uses (R13.0's own detail-page sections, `couponCode`, etc.).

## i18n

One new function-typed key, `effortBadgeLabel: (level: 'low' | 'medium' | 'high') => string`,
added to the `missions` section (interface + object literal) of `en.ts`, and as an object
literal to the other 6 locale files (`zh-hk`, `zh-tw`, `zh-cn`, `ja`, `ko`, `th`) — using the
exact same translated strings already written for `missionDetail.effortBadgeLabel` in R13.0
(verified faithful translations at the time, no reason to re-derive them).

## Testing

- **Unit test** for `creatorMissionSelect` containing `effort` (text-contract style, matching
  R13.0's `mission.queries.test.ts` pattern).
- **Unit test** for `mapCreatorMission()`'s effort narrowing (populated, null, and an
  unrecognized string all map correctly), matching R13.0's `detail.ts` test style.
- **Component test** for `CreatorMissionsView.tsx` confirming the badge renders in both list
  sections when `effort` is set, and renders in neither when `effort` is null.
- **i18n locale-parity test** (existing, no changes needed — walks every key automatically).
