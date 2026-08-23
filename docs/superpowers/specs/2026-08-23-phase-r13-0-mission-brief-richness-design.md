# Phase R13.0 — Mission Brief Richness — Design

**Status:** Approved by user 2026-08-23, pending implementation plan.

## Goal

Give merchants a richer way to brief creators on a mission — deliverables, requirements,
dos/don'ts, key messages, reference links, and an effort estimate — and surface that brief to
creators on the mission detail page. Purely additive: no existing mission behavior changes.

## Context

This is R13.0, the first sub-phase of R13 in the R10–R13 roadmap
(`~/Downloads/kinnso-roadmap-r10-r13.md`), and the roadmap explicitly calls it independent of
every other R13 sub-phase ("can ship earlier"). R10.\* and R11.\* are fully satisfied (R10–R12
all merged into `main`), so R13 as a whole is unblocked; R13.0 needs nothing from R13.1–R13.3.

The field set is adapted from a sibling repo, Adfocate (`New Adfocate/adfocate-2`), migrations
`0011_mission_brief.sql` and `0019_mission_brief_rich.sql`. Adfocate's actual columns are
`deliverables, requirements, platforms, effort` (0011) plus `target_audience, dos, donts,
key_messages, reference_links` (0019) — a superset of the roadmap's list. Adfocate itself has
no merchant-authoring UI for these fields, only a read-only display component
(`src/components/MissionBrief.tsx`), so there's no cross-repo UI pattern being ported, only the
schema/effort-enum shape.

## Decisions made during brainstorming

1. **Roadmap's field list only** — `deliverables`, `requirements`, `dos`, `donts`,
   `key_messages`, `reference_links`, `effort`. Adfocate's `platforms` and `target_audience`
   are deliberately excluded; they weren't part of what was actually scoped, and can be added
   later as their own small addition if a real need shows up.
2. **`effort` is a nullable text enum (`low`/`medium`/`high`)**, matching Adfocate exactly —
   not numeric hours, not freeform text. Simple to render as a single badge.
3. **All seven fields are optional, on every mission type.** No required fields, no
   type-specific gating (coupon_affiliate/hybrid/paid/receipt_cashback all get the same brief
   section). Existing missions get empty-array/null defaults automatically; no backfill.
4. **Array inputs are one-item-per-line textareas**, not a chip/tag list component. No
   repeatable-list input exists anywhere in this codebase today (checked); a textarea split on
   newlines is the fastest to build, fastest for merchants to fill in, and consistent with the
   wizard's existing plain-textarea feel. A polished chip-list UI is explicitly deferred — YAGNI
   until there's a reason one-per-line isn't good enough.
5. **`reference_links` gets URL-format validation at submit time**; every other field stays
   freeform. Each non-blank line must parse as a valid `http(s)` URL or the wizard blocks
   submit with an inline error, using the same validate-before-submit pattern
   `validateMissionDraft()` already applies to other fields.
6. **No separate edit flow.** Missions are create-only today — there is no existing route or
   UI for editing a mission after posting, for any field. The brief fields follow that same
   constraint; they're set once at creation via the wizard. If mission editing is added later,
   it covers these fields too, but that's out of scope here.
7. **No separate merchant-view component.** Merchants already view their own posted missions
   through the same creator-facing detail route/components everyone else uses — the brief
   fields render there for both audiences, no new view needed.

## Out of scope

- Adfocate's `platforms` and `target_audience` columns (see decision 1).
- Any merchant editor for existing missions (see decision 6) — missions remain create-only.
- A chip/tag-list input component (see decision 4) — one-per-line textarea only.
- R13.1 (opportunity matching), R13.2 (mission threads), R13.3 (operator CRM depth) — separate,
  independent sub-phases per the roadmap.

## Architecture

**Schema** — one additive migration on `missions`. Six `text[] not null default '{}'` columns
(matching the codebase's existing array-column convention — see `mission_milestone_
submissions.proof_urls`, `destination_tags`) plus one nullable `effort text check (effort in
('low','medium','high'))`. No FK, no trigger, no backfill — purely additive columns with safe
defaults, existing rows unaffected.

**Merchant editor** (`MissionPostWizard.tsx`) — a new "Brief details" section, mission-type-
agnostic, placed after the existing summary field and before the type-specific (coupon/paid/
receipt) sections: six one-item-per-line textareas plus an effort `<select>` (blank/low/medium/
high). `buildInput()` (defined inline in `MissionPostWizard.tsx`, where the draft is assembled
before submit) splits each textarea's value on newlines, trims each line, drops blanks, and
stores the result as the column's array. `validateMissionDraft()` (`lib/missions/validation.ts`) gains one new check:
every non-blank `reference_links` line must construct successfully as a URL (`new URL(line)`
wrapped in try/catch, or equivalent) with an `http`/`https` protocol; a single bad line fails
the whole submit with an inline error naming the offending line. All other new fields have no
format constraint beyond being optional strings.

**Creator-facing detail** (`lib/missions/detail.ts` + `CreatorMissionDetailView.tsx`) —
`MissionDetailRow` and `CreatorMissionDetail` gain the seven new fields (six `string[]`, one
`'low' | 'medium' | 'high' | null` for effort). `toCreatorMissionDetail()` maps them straight
through from the row. In the view, each non-empty array renders as its own bulleted `<section>`
immediately after the existing "Brief" section (own heading per field:
deliverables/requirements/dos/donts/key messages); `reference_links` renders as a list of real
`<a>` anchors, not plain text; `effort`, if set, renders as a small badge near the mission
title/status. Any empty array or null `effort` renders nothing at all — no "not specified"
placeholder — matching how the view already omits absent optional data like `couponCode`.

## Schema

```sql
alter table missions
  add column deliverables   text[] not null default '{}',
  add column requirements   text[] not null default '{}',
  add column dos            text[] not null default '{}',
  add column donts          text[] not null default '{}',
  add column key_messages   text[] not null default '{}',
  add column reference_links text[] not null default '{}',
  add column effort         text check (effort in ('low','medium','high'));
```

## UI

- Merchant wizard (`MissionPostWizard.tsx`): new "Brief details" section between summary and
  the type-specific sections — six labeled textareas + one effort select, all optional.
- Creator mission detail (`CreatorMissionDetailView.tsx`): up to five new bulleted sections
  (deliverables/requirements/dos/donts/key messages) after the existing Brief section, a linked
  list for reference links, and an effort badge — each rendered only when non-empty/non-null.
- i18n keys added to both the `missions` (wizard labels + the URL-validation error message) and
  `missionDetail` (section headings + the three effort-level labels) sections, replicated
  identically across all 7 locale files, or `tests/i18n.locale-parity.test.ts` fails.

## Testing

- **Migration-text contract test** for the new columns (types, defaults, the `effort` CHECK),
  in the established `db.*.test.ts` style.
- **Unit tests** for `validateMissionDraft()`'s new URL-check branch (valid lines, invalid
  lines, mixed, all-blank/empty array skipped entirely).
- **Unit tests** for the textarea-to-array line-splitting logic (blank-line dropping, whitespace
  trimming, single vs. multiple lines).
- **Unit tests** for `detail.ts`'s mapping of the seven new fields (empty arrays/null effort →
  omitted from the mapped object or rendered as empty, populated → passed through correctly).
- **Component test** for `CreatorMissionDetailView.tsx` confirming each new section renders only
  when its data is present, and is absent when empty/null (mirroring existing coverage for
  other optional fields like `couponCode`).
