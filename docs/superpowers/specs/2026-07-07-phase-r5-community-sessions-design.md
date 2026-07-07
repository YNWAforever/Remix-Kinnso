# Phase R5 — Community Sessions P1 — Design

> Part of the [[product-revision-program]] (master design:
> `docs/superpowers/specs/2026-07-02-product-revision-program-design.md`, decision D4 and
> the R5 phase row). R1 through R4 are merged into `main` (@ `db4a2f5`). This is the fifth
> phase's own design doc, following the same brainstorm → spec → plan → implementation
> cycle used for R3C and R4.

## What R5 delivers

Community Sessions ship as a real, live feature: a public listing and detail page, RSVP
email capture, YouTube-embedded live sessions and replays, a creator-side scheduler in
Studio, and an ops-side management console. The homepage Sessions band (data-gated since
R1B) and the `/sessions` placeholder (noindexed since R1A) both unlock for real.

This is the master spec's D4 decision ("Community Sessions full P1") and the R5 phase row
verbatim: *"Tables + /sessions listing/detail; RSVP email capture; third-party live embed;
replay playback; creator Studio scheduler; ops session management; Event JSON-LD; homepage
Sessions section unlocks."*

## Locked decisions (D-R5-N)

- **D-R5-1 (authoring authority)**: Both creators and ops can create sessions. A creator
  schedules their own sessions from Studio (owner-RLS, no app-side authority check beyond
  auth — mirrors `experiences/actions.ts`). Ops can create a session on any creator's
  behalf (host picker), and can edit, cancel, or manage any session regardless of who
  created it (`is_active_ops()`, mirrors testimonials' ops-CRUD). This satisfies both scope
  items (Studio scheduler + ops management) without picking one over the other.
- **D-R5-2 (embed model)**: `embed_url`/`replay_url` are YouTube URLs only in P1
  (watch/live/`youtu.be`/shorts forms), validated and normalized server-side via a
  `parseProofUrl`-style allowlist (the existing `lib/missions/proof-url.ts` parser is the
  direct precedent — this phase adds an equivalent for sessions, not a shared import, since
  the two features' URL shapes and callers differ). Rendered as a sandboxed YouTube iframe
  on the detail page. Other platforms, and any join-link fallback for non-embeddable
  services, are explicitly deferred past P1.
- **D-R5-3 (publish flow)**: A creator-scheduled session is publicly listed immediately —
  no ops approval gate. Active creators are already vetted (same trust model as merchants
  publishing experiences instantly). Ops can cancel or unlist any session after the fact.
  This keeps the authoring path low-friction, which matters for hitting the program's
  leading indicator ("10+ sessions hosted" post-R5) from a cold start.
- **D-R5-4 (status is a manual column, not derived)**: `status` (`scheduled` / `live` /
  `ended` / `cancelled`) is set explicitly by host or ops action ("go live" / "end" /
  "cancel" buttons), matching every existing status column in this codebase (guides,
  experiences, missions) — none of them derive status from timestamps. `cancelled` is a new
  enum value beyond what the master spec's data-model row listed (`scheduled`/`live`/
  `ended`), added to give the ops-pull path (D-R5-3) somewhere to land. The "go live" action
  is disabled (app-layer, not a DB constraint) until `embed_url` is set — a session cannot
  be marked live with nothing to embed. `replay_url` remains optional at `ended`: a host who
  never uploads a replay simply has an ended session with no replay section on its detail
  page, which is a valid, unremarkable end state, not an error.
- **D-R5-5 (RSVP identity + write path)**: `session_rsvps` always captures email, and
  optionally `user_id` when the visitor is signed in — deliberately NOT an exactly-one-of
  XOR like `bookings`/`agent_messages`, because the master spec's own wording is "email +
  optional user_id (CRM capture)", not an identity-XOR requirement. Write path is a direct
  anon-insert (the `agent_waitlist` §7-deviation precedent: no money or account state is
  touched, so the audited-RPC convention is not required), with a honeypot field and a
  dedicated `rsvp_rate_limits` copy of the R4 IP limiter (each abuse-control table/function
  is its own copy per house rule — sharing would couple unrelated limits). Duplicate
  `(session_id, email)` inserts are treated as success (idempotent join, doubles as an
  email-enumeration shield).
- **D-R5-6 (no RSVP counts, no confirmation emails)**: P1 does not display RSVP counts
  anywhere public (the program's no-zeros/no-fake-content honesty rule extends naturally to
  "no fake popularity signals," and it keeps anon read access off `session_rsvps`
  entirely — ops read RSVPs via their own gated view). No confirmation or reminder emails
  are sent — no mailer integration exists anywhere in this codebase (same call the R2A
  merchant-application flow already made); RSVP is pure CRM capture, read from the ops
  console.
- **D-R5-7 (detail pages are slug-addressed)**: `community_sessions` gets a `slug` column
  (`makeSlug(title)`, reusing `lib/guides/slug.ts`) even though the master spec's
  data-model row didn't list one — every existing detail page in this codebase (guides,
  experiences, creators, merchants) is slug-addressed, and an id-only URL would be the only
  exception.
- **D-R5-8 (homepage contract extended, not replaced)**: `UpcomingSession` gains a `slug`
  field (for linking — the shipped cards are currently non-clickable dead ends) but keeps
  `id`/`title`/`hostHandle`/`startsAt` as-is, honoring R1B's "HomeView will not change
  shape" promise as closely as possible while fixing the one real gap (no way to click
  through). The section unlock threshold stays a plain `length > 0` check — a single real
  upcoming session is honest content, not a fake carousel, so no minimum-count gate is
  added beyond what already exists.
- **D-R5-9 (`platform_stats()` gains `upcoming_sessions`)**: a count of `scheduled`+`live`
  rows, computed as a plain RLS-respecting count in the function body (no `app_private`
  security-definer helper needed, since the count is over already-public data — unlike
  `completed_bookings`, which must see rows anon has no SELECT policy on). This requires
  `DROP FUNCTION` + recreate, since Postgres rejects `CREATE OR REPLACE` on a changed
  `RETURNS TABLE` column list (the exact wall R3C's Task 1 hit) — grants must be
  re-established explicitly afterward (default-ACL auto-grant gotcha).
- **D-R5-10 (`agent_waitlist` cleanup folded in)**: a small, separate migration drops the
  orphaned `agent_waitlist` table (0 live rows, app code deleted in R4, currently a live
  anon-INSERT surface with zero consumers). Folded into this phase since R5 is already
  touching adjacent RSVP/rate-limit schema and it closes a real, live, unnecessary
  attack-surface line item cheaply.

## Data model

**`community_sessions`** (new migration):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `slug` | text | unique, generated at creation via `makeSlug(title, ...)` |
| `host_creator_id` | uuid | `references creators(id)`, NOT NULL — every session has a creator host, even ops-created ones (ops pick the host when creating on someone's behalf) |
| `title` | text | NOT NULL |
| `description` | text | NOT NULL |
| `type` | text | `CHECK IN ('destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro')` |
| `starts_at` | timestamptz | NOT NULL |
| `duration_minutes` | integer | NOT NULL |
| `embed_url` | text | nullable — host may add it after creating the session |
| `replay_url` | text | nullable — set once `status = 'ended'` |
| `destination_tags` | text[] | NOT NULL default `'{}'` |
| `status` | text | `CHECK IN ('scheduled','live','ended','cancelled')` default `'scheduled'` |
| `created_at` / `updated_at` | timestamptz | `set_updated_at()` trigger (existing helper) |

RLS: public SELECT of non-`cancelled` rows for anon + authenticated; creator-owner ALL via
a `creators.user_id = auth.uid()` subquery policy (mirrors `experiences_owner_all`); ops ALL
via `is_active_ops()`. Grants mirror `testimonials` (anon SELECT only; authenticated gets
SELECT/INSERT/UPDATE/DELETE, narrowed by policy).

**`session_rsvps`** (same migration):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `session_id` | uuid | `references community_sessions(id) on delete cascade` |
| `email` | text | NOT NULL, CHECK email-shape (same regex as `merchant_applications`) |
| `user_id` | uuid | nullable, `references auth.users(id) on delete cascade` |
| `created_at` | timestamptz | default `now()` |

`unique(session_id, email)`. RLS: insert-only for anon + authenticated,
`with check (user_id is null or user_id = auth.uid())` (fails closed for anon, same shape
as `agent_messages_insert`); SELECT ops-only. No update/delete grants to any client role.

**`rsvp_rate_limits`** (same migration): `ip text PK, window_start, request_count` +
`check_and_increment_rsvp_rate_limit(p_ip, p_max_requests, p_window_seconds)` SECURITY
DEFINER RPC — a straight copy of the R4 `agent_rate_limits`/
`check_and_increment_agent_rate_limit` shape, new table and function per house rule.

**Separate migration**: drop `agent_waitlist` (table, its two RLS policies, its grants) —
0 live rows, confirmed no application code references it since R4.

**`platform_stats()`**: `DROP FUNCTION` + recreate with an added `upcoming_sessions bigint`
column (count of `community_sessions` where `status IN ('scheduled','live')`); re-grant
EXECUTE to `anon, authenticated, service_role` explicitly.

## Routes & components

- **`/sessions`** (replaces the R1A placeholder): `revalidate = 300`, lists upcoming
  (`scheduled`/`live`, ordered by `starts_at`) and replays (`ended` with a `replay_url`)
  separately. Joins `MARKETING_PATHS` + sitemap (flips the placeholder-era assertions in
  `sessions.host.test.tsx` deliberately).
- **`/sessions/[slug]`**: mirrors the experiences detail-page pattern —
  `generateStaticParams` returns `[]` (DB-only, resolved on demand), `notFound()` on
  missing/cancelled sessions, host attribution read from the creator's already-public
  `handle`/`public_profile` fields (no new PII-safe view needed), a YouTube iframe for
  `scheduled`/`live` sessions with an `embed_url` or for `ended` sessions with a
  `replay_url`, an RSVP form (email + honeypot, prefilled from `auth.getUser()` when
  signed in — the same request-dynamic tradeoff the experiences page already accepts), and
  `Event` JSON-LD (new builder in `lib/seo/jsonld.ts`, using
  `location: { '@type': 'VirtualLocation', url: embed_url }` since every session is
  embed-based).
- **Homepage band**: `getUpcomingSessions()` gets a real query body (public client, filter
  `scheduled`/`live`, order by `starts_at`, small limit); `UpcomingSession` gains `slug`
  (D-R5-8); cards become links to `/sessions/[slug]`.
- **`/studio/sessions`** (new Studio tab): list of the creator's own sessions + a
  create/edit form + go-live/end/cancel actions, gated by owner-RLS (mirrors
  `experiences/actions.ts`, no additional app-side authority check).
- **`/admin/sessions`** (new ops console surface, new `AdminShell` nav entry): full CRUD on
  any session including a host picker for creating on a creator's behalf, status overrides,
  and a per-session RSVP list (the CRM export/read surface — ops-only per D-R5-6).

## Testing

Per-surface, following this program's established layering: `db.r5-community-sessions`
migration-string tests (table shape, RLS, rate-limit RPC) → `lib/sessions/{queries,
actions}.test.ts` → `kinnso.sessions-listing.host.test.tsx` +
`kinnso.sessions-detail.host.test.tsx` → `studio.sessions.host.test.tsx` +
`admin.sessions.host.test.tsx` → extend `home.queries.test.ts` /
`kinnso.HomeView.test.tsx` (real query replaces the `[]` stub) → flip
`sessions.host.test.tsx`'s placeholder-era assertions to their real-page equivalents.

## i18n

New `sessions` group (listing/detail copy, RSVP form labels, session-type labels, status
labels) + `studioSessions` / `adminSessions` groups, real translations across all 7
locales. The parity test auto-registers new top-level `en.ts` groups, so no test-file
changes are needed for coverage — only real, non-English-placeholder content in the other 6
files.

## SEO

`/sessions` and `/sessions/[slug]` join `MARKETING_PATHS`; a new `getSessionsForSitemap()`
feeds `app/sitemap.ts` (upcoming + ended-with-replay only; `cancelled` and never-published
drafts excluded); `Event` JSON-LD on detail pages as described above.

## Out of scope for R5

Confirmation or reminder emails (no mailer integration exists anywhere in this codebase);
public RSVP counts; feeding session content into the R4 traveller AI agent's retrieval
corpus (guides/articles/experiences only, unchanged); non-YouTube embed platforms or a
join-link fallback for non-embeddable services; any native video player (out of the whole
program, not just this phase, per the master spec's own out-of-scope list); per-session
cover images or host media uploads (no new Storage bucket — title/description/host
attribution is sufficient for P1); ops-approval gating on creator-created sessions
(D-R5-3 explicitly rejects this for P1).
