# Phase R10.3 — Notifications Backbone + Honest Inbox — Design

**Status:** Approved by user 2026-08-17, pending implementation plan.

## Goal

Replace `/studio/inbox`'s generic "coming soon" stub with a real, honest notification feed:
a creator who has a submission decided, a settlement created, or a payout batch created,
paid, or cancelled sees it in their inbox — nothing more, nothing fabricated.

## Context

This is R10.3 in the R10–R13 "creator income engine" roadmap
(`~/Downloads/kinnso-roadmap-r10-r13.md`), the last sub-phase of R10 and the direct successor
to R10.2 (payout handoff, PR #111). R10.0 (merged), R10.1 (PR #110, open), and R10.2 (PR #111,
open) are the prerequisite phases; none of their PRs need to be merged first — R10.3 only
depends on the *tables and RPCs* those phases define existing in the migration history, which
they already do on this branch lineage.

The roadmap's R10.3 entry (§4, "Notifications backbone + honest inbox") specifies the Adfocate
`0022` grammar as precedent: trigger-only inserts wrapped in `exception when others then null`,
`grant update (read_at)` only, an 8 KiB payload cap, and the explicit invariant "NEVER roll
back the earn loop" — a notification failing to write must never fail the business transaction
that triggered it.

**Deviation from the roadmap's literal trigger list, agreed with the user:** the roadmap lists
six trigger events (submission approved/rejected/revision-requested — three; settlement
created — one; payout batch created/paid — two). It was written before R10.2 shipped
`admin_cancel_payout` as its own real, cancellable outcome. A creator notified "payout batch
created" deserves to know if it's later cancelled — this design adds `payout_batch.cancelled`
as a seventh trigger, following the identical pattern as the other six.

## Out of scope

- Email or push delivery (roadmap's own exclusion) — in-app inbox only.
- Creator↔merchant messaging (R13.2).
- Realtime/live-updating badge (see "Data delivery" below) — fetch-on-load only, consistent
  with every other studio page built in R10.0–R10.2.
- Notification deletion/archival UI — `read_at` is the only mutable field; nothing is ever
  deleted by a user action in this phase.

## Schema

One new table, `public.notifications`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `creator_id` | `uuid not null references public.creators(id)` | |
| `notification_type` | `text not null` | one of the six trigger names below, dot-separated (`submission.approved`, `payout_batch.cancelled`, etc.) — the client's i18n lookup key |
| `entity_type` | `text not null` | what the notification is about (`mission`, `mission_settlement`, `payout_batch`) — used to compute the click-through link |
| `entity_id` | `uuid not null` | the id of that entity |
| `payload` | `jsonb not null default '{}'::jsonb` | only the interpolation values a template needs (e.g. `{mission_title, currency, amount}`) — never pre-rendered text. Capped at 8 KiB (enforced by a `check (pg_column_size(payload) <= 8192)` constraint) |
| `read_at` | `timestamptz` | null until read |
| `created_at` | `timestamptz not null default now()` | |

**No pre-rendered copy is ever stored.** KINNSO's i18n is custom (not next-intl) across 7
locales, and this codebase has no per-creator locale preference tracked anywhere — baking
English (or any one locale's) text into a row at insert time would either be wrong for 6/7
locales forever, or require re-translating historical rows if a creator's locale preference
were ever added later. Copy lives in `lib/i18n/messages/*.ts`, keyed by `notification_type`,
interpolated with `payload` at render time — the same principle R10.0's honesty rules already
established for this codebase (see [[i18n-translation-fidelity-gotcha]] in project memory: a
locale's copy must actually match the underlying data, not just exist).

**RLS:** enabled, exactly two policies — self-`select` (`creator_id = auth.uid()`) and a
self-`update` restricted by column grant (`grant update (read_at) to authenticated`, no other
column is grantable, matching the `revoke all` + explicit re-grant convention every table in
this codebase follows). **No insert policy and no insert grant to any client role** — every
row is written by a `SECURITY DEFINER` trigger function, which bypasses RLS as the function
owner.

Index: `(creator_id, created_at desc)` for the feed query, and a partial index
`(creator_id) where read_at is null` for the unread-count lookup.

## Seven triggers, one shared shape

| `notification_type` | Fires on | Source table |
|---|---|---|
| `submission.approved` | `mission_milestone_submissions` status → `approved` | existing R11-adjacent table (already shipped) |
| `submission.rejected` | → `rejected` | same |
| `submission.revision_requested` | → `revision_requested` | same |
| `settlement.created` | `mission_settlements` insert | R10.1 |
| `payout_batch.created` | `creator_payout_batches` insert | R10.2 |
| `payout_batch.paid` | `creator_payout_batches` status → `paid` | R10.2 |
| `payout_batch.cancelled` | `creator_payout_batches` status → `cancelled` | R10.2, added per this design's agreed deviation |

Every trigger function follows the identical shape:

```sql
create or replace function public.notify_<name>() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.notifications (creator_id, notification_type, entity_type, entity_id, payload)
    values (<resolved creator id>, '<type>', '<entity_type>', <entity id>, <jsonb payload>);
  exception when others then
    -- Per Adfocate 0022: a notification failure must NEVER roll back the earn loop.
    null;
  end;
  return new; -- or null for an AFTER trigger, matching each source table's existing convention
end;
$$;
```

The inner `begin/exception` block is the load-bearing part: it scopes the swallow-everything
guard to just the insert, not the whole trigger function, so a bug in the *resolution* logic
(e.g. failing to find the right `creator_id`) still surfaces loudly in Postgres logs rather
than being silently eaten — only the actual insert's own failure (constraint violation,
payload too large, etc.) is swallowed.

Resolving `creator_id` per trigger:
- `submission.*`: via `mission_participants.creator_id` (same join `mission_settlements_visible_select` already uses).
- `settlement.created`: via `mission_participants.creator_id` (same as R10.0's `creator_earnings_summary`).
- `payout_batch.*`: `creator_payout_batches.creator_id` directly — no join needed.

## Read RPC

`public.notifications_mine()` — `SECURITY DEFINER`, `stable`, mirrors
`creator_payout_batches_mine()`'s exact gate (active-creator check, `errcode 42501` on
failure). Returns a `jsonb` array of the caller's most recent 50 notifications, newest first,
each object carrying every column above in camelCase. 50 is a starting number, not a hard
architectural commitment — cheap to change later, and notification volume per creator is
naturally bounded by activity (missions/settlements/payouts), not an append-only ledger like
R10.2's payout batches, so this isn't expected to be a scaling concern soon.

A second, cheap query for the unread *count* (not the full 50 rows) backs the quicklinks
badge — either a second RPC (`notifications_unread_count()`) or folded into the same response
as a `{ notifications: [...], unreadCount: n }` shape. Leaning toward the combined shape to
avoid a second round trip on `/studio/inbox` itself, with the `/studio` hub page (which only
needs the count, not the full list) calling a lighter dedicated count-only RPC to respect
R10.0's "zero extra round trips on `/studio`" constraint — final call left to the
implementation plan, since it's a mechanical choice with no user-facing difference.

## UI

`/studio/inbox` replaces its `renderComingSoonPage` stub with a page built on the same
`Section`/list conventions `StudioEarningsView` established in R10.2: one list, each row
rendering `t.notifications[notification_type]` interpolated with `payload`, a relative
timestamp, and an unread-state visual treatment (following whatever existing unread/read
visual convention this codebase already has, if any — otherwise a simple dot/weight
distinction, decided at implementation time rather than here).

**Click-through**: each row is a link, computed from `entity_type`/`entity_id`:
- `mission` → `/studio/missions/[id]`
- `mission_settlement` → `/studio/earnings` (settlements aren't individually routable; the
  earnings page is the correct destination)
- `payout_batch` → `/studio/earnings` (same — payout batches render on the earnings page,
  not their own route)

Clicking a row also marks it read (calls the `read_at` update action, matching the disabled-
while-pending pattern established in every mutation this codebase has built since R10.0).

**Badge**: `StudioQuickLinks.tsx`'s Inbox tile flips `live: true`, and gains an unread-count
badge (small numeric pill, following whatever badge-with-count pattern exists elsewhere in
this codebase, or a simple styled `<span>` if none does — implementation-time detail).

## i18n

New keys under a `notifications` namespace (or nested in an existing one — implementation
detail): one interpolated template string per `notification_type` (7, including the
cancellation addition), plus `inboxEmpty`, `inboxHeading`, `markRead`/equivalent action label
if needed, `unreadBadgeLabel` for screen-reader context on the count pill. All ×7 locales,
verified by the existing `i18n.locale-parity.test.ts` recursive key-path check — same pattern
as R10.2's Task 10.

## Testing

- **Migration-text contract tests** for the table, RLS, grants, and each trigger function —
  same style as every R10.1/R10.2 migration test (`db.*.test.ts`).
- **Fault-injection test** (the roadmap's explicit acceptance criterion): force a
  `notifications` insert to fail inside one trigger (e.g. temporarily violate the payload-size
  check, or drop a required column via a `before insert` interceptor in the test's own
  transaction) and assert the *parent* action (submission approval, settlement creation, or
  payout batch mutation) still succeeds — proving the `exception when others then null` guard
  actually holds, not just that it's present in the SQL text.
- **Live RLS proof** (final task, same shape as R10.1/R10.2's `*.rls.test.ts`): a creator sees
  only their own notifications, the unread count matches, marking read persists, and no client
  role can insert directly.
- **Locale-parity extension**, matching R10.2 Task 10.
- **Component/host tests** for the inbox page and the quicklinks badge, following
  `StudioEarningsView`'s existing test conventions.

## Open questions left to the implementation plan (not architectural, safe to decide inline)

1. Combined `{notifications, unreadCount}` response vs. two separate RPCs (see "Read RPC").
2. Exact unread/read visual treatment on each row (no strong existing convention to follow).
3. Badge/pill styling on the quicklinks tile (no strong existing convention to follow).

These are deliberately left open because they're implementation-detail decisions with no
architectural weight — resolving them now would be premature precision this design doesn't
need.
