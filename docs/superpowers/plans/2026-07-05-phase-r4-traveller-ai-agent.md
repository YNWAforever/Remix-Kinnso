# Phase R4 — Traveller AI Agent v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live, anon-accessible chat agent at `/agent` (and `POST /api/agent`) that
retrieves across published guides, articles, and experiences, replacing the current
waitlist-only page, with rate limiting, per-message satisfaction rating, and booking
attribution tying back into R3C's `source_surface` mechanism.

**Architecture:** New `search_guides`/`search_experiences` Postgres RPCs (mirroring the
existing `search_articles` full-text-search shape) exposed to the model as three AI SDK
tools. A single `agent_messages` table (no separate "conversations" table — see the
Ground Truth note below) logs every turn, keyed by `traveler_user_id` when signed in or
a client-generated `anon_session_id` when anon. `POST /api/agent` mirrors the creator
copilot's `streamText()`/`.toUIMessageStreamResponse()` shape exactly, gated by a new,
dedicated IP rate-limit RPC (a sibling to R3A-2's checkout one, not the same table). A
new `AgentChatView` client component mirrors `CreatorCopilotView`'s `useChat()` shape.

**Tech Stack:** Next.js 16 App Router (Server Components + a streaming Route Handler +
a `'use server'` action), `ai` SDK v6 (`streamText`, `ToolSet`) + `@ai-sdk/react`
(`useChat`) via Vercel AI Gateway, Supabase Postgres (RLS + 2 new SECURITY DEFINER RPCs
+ native full-text search), Vitest.

**Parent spec:** `docs/superpowers/specs/2026-07-05-phase-r4-traveller-ai-agent-design.md`
(§2 D-R4-1 through D-R4-7). **Builds on:** `feat/revision-r3c` (PR #75, not yet merged) —
this phase's `ALLOWED_SOURCE_SURFACES` extension (Task 4) is its only real R3C
dependency; everything else is independent.

**Ground truth note (refines the design doc's D-R4-4 during planning):** the design doc
sketched two tables (`agent_conversations` + `agent_messages`). Grounding this plan
against the REAL creator copilot precedent (`copilot_messages`) shows a simpler,
proven-in-this-codebase shape: **one table**, no explicit "conversation" row at all — a
creator's whole thread is just every non-archived `copilot_messages` row for their
`creator_id`, ordered by `created_at`. This plan applies the same pattern: **one**
`agent_messages` table, keyed by `traveler_user_id` (signed in) or a client-generated
`anon_session_id` (anon) — mutually exclusive, mirroring `bookings`' own
`traveler_user_id`/`guest_email` mutual-exclusivity precedent from R3A-1. This satisfies
D-R4-4's actual requirement (every conversation persisted; only sign-in unlocks reading
it back) with one fewer table and no "how do we hand the client a conversation id from a
streaming response" problem to solve. Confirm you agree with this simplification before
starting Task 2 — if not, stop and flag it rather than building the 2-table version
silently different from what's written here.

---

## 0. Ground truth (surveyed 2026-07-05, this session, against the `feat-revision-r4` worktree)

- **The creator copilot is the exact template for the route/UI/query shapes.**
  `app/api/copilot/route.ts`: auth → tier/limit check → `appendMessage` (user turn) →
  `streamText({model, system, messages: await convertToModelMessages(messages), tools,
  stopWhen: stepCountIs(5), onError, onFinish})` → `result.toUIMessageStreamResponse()`.
  The try/catch around `streamText()` itself only catches **synchronous** setup errors;
  Gateway/auth/credit failures resolve lazily mid-stream and are only observable via
  `onError` — this shape is reused verbatim for `/api/agent`, just without the
  creator-only auth gate and tier policy.
- **`lib/copilot/queries.ts`'s `appendMessage`/`countUserMessagesToday` are the query
  patterns to mirror** — plain `Client = SupabaseClient<Database>` parameter, throw on
  insert error, UTC-midnight date math via `new Date(Date.UTC(...))`.
- **`lib/http/client-ip.ts`'s `getClientIp()`** (reads `x-forwarded-for`/`x-real-ip`,
  falls back to `'unknown'`, documented as "best-effort, not a security boundary") is
  reused as-is — no changes needed.
- **The R3A-2 rate-limit RPC (`check_and_increment_checkout_rate_limit`) is NOT reused
  directly** — it hardcodes the table name `checkout_rate_limits` inside its SQL body
  (not parameterized), so calling it for agent traffic would share one per-IP bucket
  between two unrelated features (heavy agent chatting could inadvertently rate-limit
  that IP's checkout attempts, and vice versa). This plan creates a **sibling** RPC +
  table with the identical shape (Task 3), not a shared one — flagged as an open risk in
  the design doc, resolved here.
- **`search_articles`** (`supabase/migrations/20260614000008_search_rpc.sql`) is the
  real template: `language sql stable security invoker`, `websearch_to_tsquery('simple',
  p_q)` against a precomputed `tsv` column, `ilike` fallback, `grant execute ... to anon,
  authenticated`. Neither `guides` nor `experiences` has a `tsv` column yet — Task 1 adds
  one to each as a `generated always as (...) stored` column (Postgres 17, confirmed live
  version, supports this natively — no trigger needed).
- **`guides`** (`20260619000001_guides.sql`): `title`, `summary`, `city` are all `not
  null`; existing RLS already grants anon `SELECT` on `status = 'published'` rows —
  the new `tsv` column needs no new grant, it rides the existing column-blind `SELECT`
  grant.
- **`experiences`** (`20260704090000_r2b_merchant_public_fields_and_experiences.sql`):
  `summary`/`description` are nullable, `title`/`city` are `not null`; existing RLS
  grants anon `SELECT` on `status = 'published' AND merchant active` rows — same
  "no new grant needed" situation.
- **`booking-types.ts`** (from R3C, already on this branch's ancestry) has
  `ALLOWED_SOURCE_SURFACES = ['guide', 'article', 'experience_page', 'direct'] as const`
  — Task 4 adds `'agent'` here and to the live `bookings.source_surface` CHECK
  constraint (new migration; R3A-1's shipped one is never edited).
- **The current `/agent` page** (`app/[locale]/agent/page.tsx` → `AgentLandingView.tsx`)
  is a waitlist: header, 3-card value-prop grid, `AgentWaitlistForm` (email capture via
  `joinAgentWaitlistAction`, insert-only into `agent_waitlist`), footer CTA. Per D-R4-7,
  the value-prop cards survive as an empty state; the waitlist form itself is removed
  (the agent is live now — no need to collect an email for a waitlist).
- **The homepage's `AgentTeaser.tsx`** (Section 5 of `HomeView.tsx`) is the waitlist CTA
  block referenced in the design doc — its copy/link flips from "join the waitlist" to
  "Try AI Agent" → `/agent`.
- **`agent` i18n group** already has ~20 waitlist-specific keys (`en.ts` lines ~730-740
  type decl, ~1706-1720 values) plus 5 home-section keys (`agentEyebrow`/`agentTitle`/
  `agentBody`/`agentCta`/`agentNote`). Chat-specific keys are additive to the same
  `agent` group (not a new namespace), per the design doc's stated preference.

## 1. Phase decisions carried from the design doc (see the design doc §2 for full rationale)

D-R4-1 (all 3 content types) · D-R4-2 (free-text chat, tool-calling) · D-R4-3 (fixed
Haiku model, no tier policy) · D-R4-4 (persist every message; only sign-in unlocks
read-back — **single-table refinement per the Ground Truth note above**) · D-R4-5
(thumbs up/down per assistant message) · D-R4-6 (`'agent'` source_surface) · D-R4-7
(`/agent` becomes live chat; value-prop cards survive as empty state).

**New plan-phase decision, PD-R4-1 · Rating goes through a SECURITY DEFINER RPC, not a
raw table UPDATE grant.** `agent_messages` has no stable "owner" column usable by RLS for
anon rows (only a client-supplied `anon_session_id`) — RLS can't cheaply express "the
caller who inserted this row may update just its `rating` column" for an anonymous role.
Instead, `rate_agent_message(p_message_id, p_rating, p_anon_session_id)` (SECURITY
DEFINER) checks the caller either owns the row via `auth.uid()` (signed in) or supplies
the matching `anon_session_id` (anon) before updating — same trust shape as R3's
guest-booking-confirmation-by-unguessable-Stripe-session-id precedent (D-R3-2): proving
you know an opaque, hard-to-guess value is the authorization, not a stored identity.

## 2. Data model

```
agent_messages
  id uuid pk default gen_random_uuid()
  traveler_user_id uuid references auth.users(id)   -- nullable
  anon_session_id uuid                                -- nullable; exactly one of the two set
  role text not null check (role in ('user','assistant'))
  content text not null
  tool_calls jsonb
  rating text check (rating in ('up','down'))
  created_at timestamptz not null default now()
  constraint agent_messages_exactly_one_identity check (
    (traveler_user_id is not null and anon_session_id is null) or
    (traveler_user_id is null and anon_session_id is not null)
  )

agent_rate_limits          -- sibling to checkout_rate_limits, NOT shared with it
  ip text primary key
  window_start timestamptz not null default now()
  request_count integer not null default 1

guides.tsv         -- new generated column (tsvector)
experiences.tsv    -- new generated column (tsvector)
```

## 3. Security invariants

1. **No service-role expansion.** `agent_messages` inserts go through normal RLS
   (insert-only for anon/authenticated), not `createSupabaseServiceClient()` — the
   service-role import count stays at exactly 2 files (Stripe webhook, Travelpayouts
   cron) after this phase.
2. **No anon read-back of conversation history, ever** — `agent_messages` has zero anon
   SELECT policy; only an authenticated traveller can read rows where
   `traveler_user_id = auth.uid()`.
3. **Rating is RPC-gated (PD-R4-1)**, checking real ownership (auth.uid() or a matching
   opaque anon_session_id) before any mutation — never a bare table UPDATE grant.
4. **The new rate limiter is a dedicated table/RPC**, never sharing state with the
   existing checkout rate limiter.
5. **Search tool failures degrade to an empty result, never throw into the model's
   tool-call loop** — same "reads never crash the page" stance as every other public
   query in this codebase.
6. **`agent_messages` insert RLS must reject a spoofed `traveler_user_id`** — the check
   clause requires `traveler_user_id is null or traveler_user_id = auth.uid()`, which
   fails closed for an anon caller (whose `auth.uid()` is null) attempting to claim a
   non-null `traveler_user_id`.

---

## Task 1: `search_guides` / `search_experiences` — new full-text search RPCs

**Files:**
- Create: `supabase/migrations/20260705100000_r4_search_guides_and_experiences.sql`
- Test: `apps/web/tests/db.r4-search-guides-experiences.test.ts`

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/web/tests/db.r4-search-guides-experiences.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705100000_r4_search_guides_and_experiences.sql'),
  'utf8',
)

describe('search_guides / search_experiences migration', () => {
  it('adds a generated tsvector column to guides, indexed with gin', () => {
    expect(sql).toContain('alter table public.guides add column tsv tsvector')
    expect(sql).toContain('generated always as')
    expect(sql).toContain('create index guides_tsv_idx on public.guides using gin(tsv)')
  })
  it('adds a generated tsvector column to experiences, indexed with gin', () => {
    expect(sql).toContain('alter table public.experiences add column tsv tsvector')
    expect(sql).toContain('create index experiences_tsv_idx on public.experiences using gin(tsv)')
  })
  it('search_guides is SECURITY INVOKER and uses websearch_to_tsquery', () => {
    expect(sql).toContain('create or replace function public.search_guides')
    expect(sql).toContain('security invoker')
    expect(sql).toContain("websearch_to_tsquery('simple', p_q)")
    expect(sql).toContain('grant execute on function public.search_guides')
  })
  it('search_experiences is SECURITY INVOKER, filters to published, and uses websearch_to_tsquery', () => {
    expect(sql).toContain('create or replace function public.search_experiences')
    expect(sql).toContain("websearch_to_tsquery('simple', p_q)")
    expect(sql).toContain("status = 'published'")
    expect(sql).toContain('grant execute on function public.search_experiences')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.r4-search-guides-experiences.test.ts`
Expected: FAIL — `ENOENT` (migration file does not exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260705100000_r4_search_guides_and_experiences.sql

-- R4 (design doc D-R4-1): full-text search over guides and experiences, mirroring the
-- existing search_articles() shape exactly (websearch_to_tsquery over a precomputed
-- tsvector, SECURITY INVOKER so anon only ever sees rows the existing RLS already
-- allows). Both tables get a `generated always as (...) stored` tsvector column —
-- Postgres 17 (this project's live version) supports this natively, no trigger needed.

alter table public.guides
  add column tsv tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(city, ''))
  ) stored;

create index guides_tsv_idx on public.guides using gin(tsv);

alter table public.experiences
  add column tsv tsvector generated always as (
    to_tsvector('simple',
      coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, ''))
  ) stored;

create index experiences_tsv_idx on public.experiences using gin(tsv);

create or replace function public.search_guides(
  p_q      text default null,
  p_city   text default null,
  p_limit  int  default 12,
  p_offset int  default 0
)
returns table (
  slug text, title text, summary text, city text, cover_url text,
  saves_count integer, creator_handle text, published_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select g.slug, g.title, g.summary, g.city, g.cover_url, g.saves_count, g.creator_handle, g.published_at
    from public.guides g
    where g.status = 'published'
      and (p_city is null or p_city = '' or g.city ilike '%' || p_city || '%')
      and (
        p_q is null or p_q = ''
        or g.tsv @@ websearch_to_tsquery('simple', p_q)
        or g.title ilike '%' || p_q || '%'
      )
  )
  select slug, title, summary, city, cover_url, saves_count, creator_handle, published_at,
         count(*) over () as total_count
  from base
  order by published_at desc, slug asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_guides(text, text, int, int) to anon, authenticated;

create or replace function public.search_experiences(
  p_q      text default null,
  p_city   text default null,
  p_limit  int  default 12,
  p_offset int  default 0
)
returns table (
  slug text, title text, summary text, city text, price_amount numeric, currency text,
  cover_url text, merchant_profile_id uuid, published_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select e.slug, e.title, e.summary, e.city, e.price_amount, e.currency, e.cover_url,
           e.merchant_profile_id, e.published_at
    from public.experiences e
    where e.status = 'published'
      and exists (select 1 from public.merchant_profiles m where m.id = e.merchant_profile_id and m.status = 'active')
      and (p_city is null or p_city = '' or e.city ilike '%' || p_city || '%')
      and (
        p_q is null or p_q = ''
        or e.tsv @@ websearch_to_tsquery('simple', p_q)
        or e.title ilike '%' || p_q || '%'
      )
  )
  select slug, title, summary, city, price_amount, currency, cover_url, merchant_profile_id, published_at,
         count(*) over () as total_count
  from base
  order by published_at desc, slug asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_experiences(text, text, int, int) to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.r4-search-guides-experiences.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260705100000_r4_search_guides_and_experiences.sql apps/web/tests/db.r4-search-guides-experiences.test.ts
git commit -m "feat(db): search_guides/search_experiences full-text search RPCs"
```

---

## Task 2: `agent_messages` table + RLS

**Files:**
- Create: `supabase/migrations/20260705110000_r4_agent_messages.sql`
- Test: `apps/web/tests/db.r4-agent-messages.test.ts`

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/web/tests/db.r4-agent-messages.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705110000_r4_agent_messages.sql'),
  'utf8',
)

describe('agent_messages migration', () => {
  it('creates the table with the mutually-exclusive identity constraint', () => {
    expect(sql).toContain('create table public.agent_messages')
    expect(sql).toContain('constraint agent_messages_exactly_one_identity check')
  })
  it('restricts role and rating to their allowed values', () => {
    expect(sql).toContain("check (role in ('user','assistant'))")
    expect(sql).toContain("check (rating in ('up','down'))")
  })
  it('enables RLS with insert-only anon/authenticated access and no anon select', () => {
    expect(sql).toContain('alter table public.agent_messages enable row level security')
    expect(sql).toContain('agent_messages_insert')
    expect(sql).toContain('traveler_user_id is null or traveler_user_id = auth.uid()')
    expect(sql).not.toContain('for select to anon')
  })
  it('grants owner-scoped select to authenticated only', () => {
    expect(sql).toContain('agent_messages_owner_select')
    expect(sql).toContain('traveler_user_id = auth.uid()')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.r4-agent-messages.test.ts`
Expected: FAIL — `ENOENT`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260705110000_r4_agent_messages.sql

-- R4 (design doc D-R4-4, plan Ground Truth note): a single message-log table, no
-- separate "conversations" table — mirrors copilot_messages' shape exactly (a
-- traveller's/anon session's "thread" is just every row sharing their identity,
-- ordered by created_at). Anon gets a client-generated anon_session_id in place of a
-- real user id; the two identity columns are mutually exclusive, same pattern as
-- bookings.traveler_user_id/guest_email. No anon SELECT ever — sign-in is required to
-- read a thread back (D-R4-4's actual requirement).

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  traveler_user_id uuid references auth.users(id) on delete cascade,
  anon_session_id uuid,
  role text not null check (role in ('user','assistant')),
  content text not null,
  tool_calls jsonb,
  rating text check (rating in ('up','down')),
  created_at timestamptz not null default now(),
  constraint agent_messages_exactly_one_identity check (
    (traveler_user_id is not null and anon_session_id is null) or
    (traveler_user_id is null and anon_session_id is not null)
  )
);

create index agent_messages_traveler_idx on public.agent_messages (traveler_user_id, created_at);
create index agent_messages_anon_session_idx on public.agent_messages (anon_session_id, created_at);

alter table public.agent_messages enable row level security;

-- Insert-only for both anon and authenticated. The check clause fails closed for an
-- anon caller trying to claim a traveler_user_id: auth.uid() is null for anon, so
-- "traveler_user_id = auth.uid()" can only be true for an authenticated caller
-- claiming their own real id.
create policy agent_messages_insert on public.agent_messages
  for insert to anon, authenticated
  with check (traveler_user_id is null or traveler_user_id = auth.uid());

-- Only a signed-in traveller can ever read their own rows back. No anon select policy
-- exists at all — this is the concrete meaning of "sign-in unlocks saved history".
create policy agent_messages_owner_select on public.agent_messages
  for select to authenticated
  using (traveler_user_id = auth.uid());

grant select, insert on public.agent_messages to anon, authenticated;
revoke update, delete on public.agent_messages from anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.r4-agent-messages.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260705110000_r4_agent_messages.sql apps/web/tests/db.r4-agent-messages.test.ts
git commit -m "feat(db): agent_messages table (single-table conversation log, insert-only RLS)"
```

---

## Task 3: Agent rate limit RPC + `rate_agent_message` RPC

**Files:**
- Create: `supabase/migrations/20260705120000_r4_agent_rate_limit_and_rating_rpc.sql`
- Test: `apps/web/tests/db.r4-agent-rate-limit-and-rating.test.ts`

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/web/tests/db.r4-agent-rate-limit-and-rating.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705120000_r4_agent_rate_limit_and_rating_rpc.sql'),
  'utf8',
)

describe('agent rate limit + rating migration', () => {
  it('creates a dedicated agent_rate_limits table, separate from checkout_rate_limits', () => {
    expect(sql).toContain('create table public.agent_rate_limits')
    expect(sql).not.toContain('checkout_rate_limits')
  })
  it('check_and_increment_agent_rate_limit mirrors the checkout RPC shape', () => {
    expect(sql).toContain('create or replace function public.check_and_increment_agent_rate_limit')
    expect(sql).toContain('security definer')
    expect(sql).toContain('grant execute on function public.check_and_increment_agent_rate_limit')
  })
  it('rate_agent_message validates the rating value and checks ownership before updating', () => {
    expect(sql).toContain('create or replace function public.rate_agent_message')
    expect(sql).toContain("if p_rating not in ('up','down')")
    expect(sql).toContain('v_traveler_user_id != auth.uid()')
    expect(sql).toContain('v_anon_session_id != p_anon_session_id')
    expect(sql).toContain("and role = 'assistant'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.r4-agent-rate-limit-and-rating.test.ts`
Expected: FAIL — `ENOENT`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260705120000_r4_agent_rate_limit_and_rating_rpc.sql

-- R4: (1) a DEDICATED IP rate limiter for /api/agent — deliberately NOT the same table
-- as R3A-2's checkout_rate_limits, since that RPC hardcodes the table name in its SQL
-- body (not parameterized); sharing it would couple two unrelated features' abuse
-- limits (plan PD notes this explicitly). Identical shape, new table, new function.
-- (2) rate_agent_message(): SECURITY DEFINER because agent_messages has no RLS-cheap
-- "owner" concept for anon rows — this checks real ownership (auth.uid() for signed-in,
-- a client-supplied opaque anon_session_id for anon) before allowing the one mutation
-- (rating) this table ever needs (PD-R4-1), same trust shape as the R3 guest-booking
-- confirmation-by-unguessable-session-id precedent.

create table public.agent_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.agent_rate_limits enable row level security;
revoke all on table public.agent_rate_limits from anon, authenticated;

create or replace function public.check_and_increment_agent_rate_limit(
  p_ip text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.agent_rate_limits (ip, window_start, request_count)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set window_start = case
          when public.agent_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.agent_rate_limits.window_start
        end,
        request_count = case
          when public.agent_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.agent_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.check_and_increment_agent_rate_limit(text, integer, integer) from public;
grant execute on function public.check_and_increment_agent_rate_limit(text, integer, integer) to anon, authenticated;

create or replace function public.rate_agent_message(
  p_message_id uuid,
  p_rating text,
  p_anon_session_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_traveler_user_id uuid;
  v_anon_session_id uuid;
begin
  if p_rating not in ('up', 'down') then
    raise exception 'invalid_rating';
  end if;

  select traveler_user_id, anon_session_id into v_traveler_user_id, v_anon_session_id
    from public.agent_messages
    where id = p_message_id and role = 'assistant';

  if not found then
    raise exception 'not_found';
  end if;

  if v_traveler_user_id is not null then
    if v_traveler_user_id != auth.uid() then
      raise exception 'forbidden';
    end if;
  else
    if p_anon_session_id is null or v_anon_session_id != p_anon_session_id then
      raise exception 'forbidden';
    end if;
  end if;

  update public.agent_messages set rating = p_rating where id = p_message_id;
end;
$$;

revoke all on function public.rate_agent_message(uuid, text, uuid) from public;
grant execute on function public.rate_agent_message(uuid, text, uuid) to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.r4-agent-rate-limit-and-rating.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260705120000_r4_agent_rate_limit_and_rating_rpc.sql apps/web/tests/db.r4-agent-rate-limit-and-rating.test.ts
git commit -m "feat(db): dedicated agent rate-limit RPC + rate_agent_message RPC"
```

---

## Task 4: `'agent'` source_surface — extends R3C's attribution mechanism

**Files:**
- Modify: `apps/web/lib/experiences/booking-types.ts`
- Create: `supabase/migrations/20260705130000_r4_bookings_agent_source_surface.sql`
- Test: `apps/web/tests/db.r4-bookings-agent-source-surface.test.ts`
- Test: extend `apps/web/tests/experiences.booking-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/tests/db.r4-bookings-agent-source-surface.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705130000_r4_bookings_agent_source_surface.sql'),
  'utf8',
)

describe('bookings.source_surface gains agent', () => {
  it('drops and recreates the CHECK constraint including agent', () => {
    expect(sql).toContain('alter table public.bookings drop constraint')
    expect(sql).toContain("check (source_surface in ('guide','article','experience_page','direct','agent'))")
  })
})
```

Add a test to `apps/web/tests/experiences.booking-actions.test.ts` (read the file first —
this extends the same describe block Task 9 of R3C added, using its established
`resolveAttribution`/`getGuideBySlugMock` conventions):

```typescript
it('accepts sourceSurface "agent" and passes it straight through with no attribution lookup', async () => {
  mockAvailabilityLookup(openAvailability)
  sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
  const insertMock = vi.fn(() => Promise.resolve({ error: null }))
  fromMock.mockReturnValueOnce({ insert: insertMock })

  const res = await createCheckoutSessionAction(
    'exp1',
    { availabilityId: 'avail1', qty: '2' },
    { locale: 'en', sourceSurface: 'agent' },
  )

  expect(getGuideBySlugMock).not.toHaveBeenCalled()
  expect(insertMock).toHaveBeenCalledWith(
    expect.objectContaining({ source_surface: 'agent', creator_id: null, guide_id: null }),
  )
  expect(res.ok).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/db.r4-bookings-agent-source-surface.test.ts tests/experiences.booking-actions.test.ts`
Expected: FAIL — migration file missing; `'agent'` not in `ALLOWED_SOURCE_SURFACES` so
`resolveAttribution` currently falls back to `'experience_page'` for it, failing the new
assertion.

- [ ] **Step 3: Implement — types**

In `apps/web/lib/experiences/booking-types.ts`:

```typescript
export const ALLOWED_SOURCE_SURFACES = ['guide', 'article', 'experience_page', 'direct', 'agent'] as const
```

(Only this one array literal changes — `BookingSourceSurface`'s derivation from it is
unchanged, and `resolveAttribution` in `booking-actions.ts` needs no code change at all:
it already passes through any allow-listed surface that isn't `'guide'` as-is with null
ids, which is exactly the desired behavior for `'agent'`.)

- [ ] **Step 4: Write the migration**

First confirm the real constraint name by reading
`supabase/migrations/20260704110000_r3a1_traveler_role_and_booking_core.sql` (search for
`source_surface` — Postgres auto-names an inline `check` constraint on a column
`bookings_source_surface_check` unless the original migration named it explicitly;
confirm which before writing the `drop constraint` line, don't guess).

```sql
-- supabase/migrations/20260705130000_r4_bookings_agent_source_surface.sql

-- R4 (design doc D-R4-6): bookings made via an agent-surfaced experience link get
-- source_surface = 'agent', reusing R3C's attribution query-param mechanism unchanged
-- (?src=agent, same as ?src=guide/?src=article). creator_id/guide_id stay null for
-- agent-attributed bookings (the agent isn't tied to a specific creator the way a guide
-- CTA is) — resolveAttribution() already handles this correctly with zero code changes,
-- since it only special-cases sourceSurface === 'guide'.

alter table public.bookings drop constraint bookings_source_surface_check;

alter table public.bookings
  add constraint bookings_source_surface_check
  check (source_surface in ('guide','article','experience_page','direct','agent'));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/db.r4-bookings-agent-source-surface.test.ts tests/experiences.booking-actions.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/experiences/booking-types.ts supabase/migrations/20260705130000_r4_bookings_agent_source_surface.sql apps/web/tests/db.r4-bookings-agent-source-surface.test.ts apps/web/tests/experiences.booking-actions.test.ts
git commit -m "feat(db): bookings.source_surface gains 'agent'"
```

---

## Task 5: `lib/agent/config.ts` + `lib/agent/policy.ts`

**Files:**
- Create: `apps/web/lib/agent/config.ts`
- Create: `apps/web/lib/agent/policy.ts`
- Test: `apps/web/tests/agent.policy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/agent.policy.test.ts
import { describe, it, expect } from 'vitest'
import { AGENT_MODEL, AGENT_RATE_LIMIT } from '@/lib/agent/policy'
import { isAgentConfigured } from '@/lib/agent/config'

describe('agent policy', () => {
  it('uses the same cheap model slug the copilot uses for its seed tier', () => {
    expect(AGENT_MODEL).toBe('anthropic/claude-haiku-4.5')
  })
  it('exports fixed rate-limit numbers', () => {
    expect(AGENT_RATE_LIMIT).toEqual({ maxRequests: 20, windowSeconds: 3600 })
  })
})

describe('isAgentConfigured', () => {
  it('mirrors isCopilotConfigured\'s AI Gateway check', () => {
    // Same env-driven check as the copilot; if this ever diverges from
    // isCopilotConfigured's logic, that's a deliberate decision to flag, not drift.
    expect(typeof isAgentConfigured()).toBe('boolean')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/agent.policy.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/agent/config.ts

/** True when the Vercel AI Gateway has credentials available (key locally, OIDC on
 *  Vercel) — identical check to isCopilotConfigured(), duplicated rather than shared
 *  since the two features are deliberately independent (design doc: creator copilot
 *  stays untouched) and this is a two-line check, not worth a shared import that would
 *  couple their config surfaces. */
export function isAgentConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY) || process.env.VERCEL === '1'
}
```

```typescript
// apps/web/lib/agent/policy.ts

/** Fixed cheap model for all traveller-agent requests — no tier policy needed,
 *  travellers have no tier (design doc D-R4-3). Same slug the copilot uses for its
 *  seed tier. */
export const AGENT_MODEL = 'anthropic/claude-haiku-4.5'

/** IP rate limit for POST /api/agent — a dedicated bucket (agent_rate_limits), never
 *  shared with the checkout rate limiter (plan PD note, Task 3). 20 requests/hour is
 *  generous enough for a real back-and-forth conversation while bounding abuse cost. */
export const AGENT_RATE_LIMIT = { maxRequests: 20, windowSeconds: 3600 } as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/agent.policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/agent/config.ts apps/web/lib/agent/policy.ts apps/web/tests/agent.policy.test.ts
git commit -m "feat(web): agent config + fixed model/rate-limit policy"
```

---

## Task 6: `lib/agent/queries.ts` — message logging

**Files:**
- Create: `apps/web/lib/agent/queries.ts`
- Test: `apps/web/tests/agent.queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/agent.queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appendAgentMessage } from '@/lib/agent/queries'

const state = vi.hoisted(() => ({ lastInsert: null as unknown }))

function makeClient() {
  return {
    from: () => ({
      insert: (v: unknown) => { state.lastInsert = v; return Promise.resolve({ error: null }) },
    }),
  }
}

beforeEach(() => { state.lastInsert = null })

describe('appendAgentMessage', () => {
  it('inserts a traveler_user_id-keyed row when signed in', async () => {
    await appendAgentMessage(makeClient() as never, { travelerUserId: 'u1' }, 'user', 'hi')
    expect(state.lastInsert).toMatchObject({ traveler_user_id: 'u1', anon_session_id: null, role: 'user', content: 'hi' })
  })

  it('inserts an anon_session_id-keyed row when anon', async () => {
    await appendAgentMessage(makeClient() as never, { anonSessionId: 'session-1' }, 'assistant', 'hello')
    expect(state.lastInsert).toMatchObject({ traveler_user_id: null, anon_session_id: 'session-1', role: 'assistant', content: 'hello' })
  })

  it('throws a descriptive error when the insert fails', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }) }
    await expect(appendAgentMessage(client as never, { travelerUserId: 'u1' }, 'user', 'hi')).rejects.toThrow(/appendAgentMessage failed/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/agent.queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/agent/queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

/** Exactly one of travelerUserId/anonSessionId must be set — mirrors
 *  agent_messages' own mutually-exclusive-identity CHECK constraint. */
export type AgentIdentity = { travelerUserId: string; anonSessionId?: never } | { travelerUserId?: never; anonSessionId: string }

export async function appendAgentMessage(
  supabase: Client,
  identity: AgentIdentity,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: unknown,
): Promise<void> {
  const { error } = await supabase.from('agent_messages').insert({
    traveler_user_id: identity.travelerUserId ?? null,
    anon_session_id: identity.anonSessionId ?? null,
    role,
    content,
    tool_calls: (toolCalls as never) ?? null,
  })
  if (error) throw new Error(`appendAgentMessage failed: ${error.message}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/agent.queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/agent/queries.ts apps/web/tests/agent.queries.test.ts
git commit -m "feat(web): appendAgentMessage — single-table conversation logging"
```

---

## Task 7: `lib/agent/tools.ts` — the three retrieval tools

**Files:**
- Create: `apps/web/lib/agent/tools.ts`
- Test: `apps/web/tests/agent.tools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/agent.tools.test.ts
import { describe, it, expect, vi } from 'vitest'
import { makeAgentTools } from '@/lib/agent/tools'

describe('makeAgentTools', () => {
  it('exposes searchGuides, searchArticles, searchExperiences', () => {
    const supabase = { rpc: vi.fn() }
    const tools = makeAgentTools(supabase as never, 'en')
    expect(Object.keys(tools)).toEqual(['searchGuides', 'searchArticles', 'searchExperiences'])
  })

  it('searchGuides calls the search_guides RPC and degrades to [] on error, never throwing', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    const tools = makeAgentTools({ rpc } as never, 'en')
    const result = await tools.searchGuides.execute({ query: 'Tokyo', city: 'Tokyo' }, { toolCallId: 't1', messages: [] })
    expect(rpc).toHaveBeenCalledWith('search_guides', { p_q: 'Tokyo', p_city: 'Tokyo', p_limit: 5, p_offset: 0 })
    expect(result).toEqual([])
  })

  it('searchArticles passes the caller\'s locale through to search_articles', async () => {
    const rpc = vi.fn(async () => ({ data: [{ url: '/a', title: 'A', summary: 's' }], error: null }))
    const tools = makeAgentTools({ rpc } as never, 'ja')
    const result = await tools.searchArticles.execute({ query: 'ramen' }, { toolCallId: 't1', messages: [] })
    expect(rpc).toHaveBeenCalledWith('search_articles', { p_locale: 'ja', p_q: 'ramen', p_limit: 5, p_offset: 0 })
    expect(result).toEqual([{ url: '/a', title: 'A', summary: 's' }])
  })

  it('searchExperiences calls the search_experiences RPC', async () => {
    const rpc = vi.fn(async () => ({ data: [{ slug: 'e1', title: 'E' }], error: null }))
    const tools = makeAgentTools({ rpc } as never, 'en')
    const result = await tools.searchExperiences.execute({ query: 'sunset tour', city: 'Hong Kong' }, { toolCallId: 't1', messages: [] })
    expect(rpc).toHaveBeenCalledWith('search_experiences', { p_q: 'sunset tour', p_city: 'Hong Kong', p_limit: 5, p_offset: 0 })
    expect(result).toEqual([{ slug: 'e1', title: 'E' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/agent.tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/agent/tools.ts
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { Locale } from '@/lib/i18n/config'

type Client = SupabaseClient<Database>

/** Every tool degrades to [] on any RPC error rather than throwing into the model's
 *  tool-call loop — same "reads never crash the page" stance as every other public
 *  query in this codebase (getGuidesForRegions, getExperiencesForCity, etc.). A flaky
 *  search just means the agent says it couldn't find anything for that query. */
async function safeRpc(supabase: Client, fn: string, args: Record<string, unknown>): Promise<unknown[]> {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) {
    console.error(`[agent:tools] ${fn} failed`, error)
    return []
  }
  return (data as unknown[]) ?? []
}

export function makeAgentTools(supabase: Client, locale: Locale): ToolSet {
  return {
    searchGuides: tool({
      description: 'Search published creator guides by free-text query and/or city.',
      inputSchema: z.object({
        query: z.string().describe('Free-text search query, e.g. "quiet beaches" or "street food"'),
        city: z.string().optional().describe('Optional city filter, e.g. "Tokyo"'),
      }),
      execute: async ({ query, city }) =>
        safeRpc(supabase, 'search_guides', { p_q: query, p_city: city ?? null, p_limit: 5, p_offset: 0 }),
    }),
    searchArticles: tool({
      description: 'Search published articles by free-text query, in the traveller\'s current locale.',
      inputSchema: z.object({
        query: z.string().describe('Free-text search query'),
      }),
      execute: async ({ query }) =>
        safeRpc(supabase, 'search_articles', { p_locale: locale, p_q: query, p_limit: 5, p_offset: 0 }),
    }),
    searchExperiences: tool({
      description: 'Search published, bookable experiences by free-text query and/or city.',
      inputSchema: z.object({
        query: z.string().describe('Free-text search query, e.g. "sunset boat tour"'),
        city: z.string().optional().describe('Optional city filter'),
      }),
      execute: async ({ query, city }) =>
        safeRpc(supabase, 'search_experiences', { p_q: query, p_city: city ?? null, p_limit: 5, p_offset: 0 }),
    }),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/agent.tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/agent/tools.ts apps/web/tests/agent.tools.test.ts
git commit -m "feat(web): agent retrieval tools (searchGuides/searchArticles/searchExperiences)"
```

---

## Task 8: `POST /api/agent` — the streaming route

**Files:**
- Create: `apps/web/app/api/agent/route.ts`
- Test: `apps/web/tests/api.agent.route.test.ts`

- [ ] **Step 1: Read `apps/web/app/api/copilot/route.ts` and `apps/web/tests/copilot.route.host.test.ts` first**, in full — this task's route and test mirror them closely (see Task 8's Context note below for exact reuse).

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/api.agent.route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { streamTextMock, getUserMock, rpcMock, getClientIpMock, configuredMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(() => ({ toUIMessageStreamResponse: () => new Response('stream', { status: 200 }) })),
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
  getClientIpMock: vi.fn(async () => '1.2.3.4'),
  configuredMock: vi.fn(() => true),
}))

vi.mock('ai', () => ({
  streamText: streamTextMock,
  stepCountIs: (n: number) => n,
  convertToModelMessages: (m: unknown) => m,
  tool: (def: unknown) => def,
}))
vi.mock('@/lib/agent/config', () => ({ isAgentConfigured: configuredMock }))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/agent/queries', () => ({ appendAgentMessage: vi.fn(async () => {}) }))
vi.mock('@/lib/agent/tools', () => ({ makeAgentTools: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))

import { POST } from '@/app/api/agent/route'

function req(body: unknown) {
  return new Request('http://localhost/api/agent', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  streamTextMock.mockClear()
  getUserMock.mockResolvedValue({ data: { user: null } })
  rpcMock.mockResolvedValue({ data: true, error: null })
  configuredMock.mockReturnValue(true)
})

describe('POST /api/agent', () => {
  it('503s when the gateway is unconfigured', async () => {
    configuredMock.mockReturnValueOnce(false)
    const res = await POST(req({ messages: [], locale: 'en', anonSessionId: 'sess-1' }))
    expect(res.status).toBe(503)
  })

  it('400s when anon and no anonSessionId is provided', async () => {
    const res = await POST(req({ messages: [], locale: 'en' }))
    expect(res.status).toBe(400)
  })

  it('429s when the IP rate limit is exceeded', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en', anonSessionId: 'sess-1' }))
    expect(res.status).toBe(429)
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it('streams for an anon caller with a valid anonSessionId, rate-limit passing', async () => {
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'plan a Tokyo trip' }] }], locale: 'en', anonSessionId: 'sess-1' }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('check_and_increment_agent_rate_limit', { p_ip: '1.2.3.4', p_max_requests: 20, p_window_seconds: 3600 })
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const arg = (streamTextMock.mock.calls[0] as unknown[])[0] as { model: string }
    expect(arg.model).toBe('anthropic/claude-haiku-4.5')
  })

  it('streams for a signed-in traveller without requiring anonSessionId', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en' }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/api.agent.route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// apps/web/app/api/agent/route.ts
import { NextResponse } from 'next/server'
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAgentConfigured } from '@/lib/agent/config'
import { AGENT_MODEL, AGENT_RATE_LIMIT } from '@/lib/agent/policy'
import { makeAgentTools } from '@/lib/agent/tools'
import { appendAgentMessage, type AgentIdentity } from '@/lib/agent/queries'
import { getClientIp } from '@/lib/http/client-ip'
import { isLocale, type Locale } from '@/lib/i18n/config'

export const maxDuration = 30

const SYSTEM_PROMPT = `You are the KINNSO travel agent. Help travellers plan trips using
only the search tools available to you (searchGuides, searchArticles,
searchExperiences) — never invent a place, guide, or experience that a search didn't
return. When you recommend a bookable experience, mention it can be booked directly on
KINNSO. Keep answers concise and conversational.`

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last) return ''
  const parts = (last as { parts?: Array<{ type: string; text?: string }> }).parts ?? []
  return parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ').trim()
}

export async function POST(req: Request) {
  if (!isAgentConfigured()) return NextResponse.json({ error: 'unconfigured' }, { status: 503 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[]; locale?: unknown; anonSessionId?: unknown
  }
  const messages = body.messages ?? []
  const locale: Locale = typeof body.locale === 'string' && isLocale(body.locale) ? body.locale : 'en'

  let identity: AgentIdentity
  if (user) {
    identity = { travelerUserId: user.id }
  } else {
    const anonSessionId = typeof body.anonSessionId === 'string' ? body.anonSessionId : ''
    if (!anonSessionId) return NextResponse.json({ error: 'missing_anon_session_id' }, { status: 400 })
    identity = { anonSessionId }
  }

  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc('check_and_increment_agent_rate_limit', {
    p_ip: ip,
    p_max_requests: AGENT_RATE_LIMIT.maxRequests,
    p_window_seconds: AGENT_RATE_LIMIT.windowSeconds,
  })
  if (rateLimitError) {
    console.error('[agent] rate limit check failed', rateLimitError)
    return NextResponse.json({ error: 'rate_limit_check_failed' }, { status: 500 })
  }
  if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const text = lastUserText(messages)
  if (text) await appendAgentMessage(supabase, identity, 'user', text)

  const tools = makeAgentTools(supabase, locale)

  try {
    const result = streamText({
      model: AGENT_MODEL,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      onError: ({ error }) => {
        console.error('[agent] stream error', error)
      },
      onFinish: async ({ text: out }: { text: string }) => {
        if (out) await appendAgentMessage(supabase, identity, 'assistant', out)
      },
    })
    return result.toUIMessageStreamResponse()
  } catch {
    return NextResponse.json({ error: 'gateway' }, { status: 502 })
  }
}
```

**Context (mirrors `app/api/copilot/route.ts` deliberately):** same try/catch scope
(only synchronous setup errors are caught; Gateway/auth/credit failures surface via
`onError` mid-stream, same as the copilot), same `appendMessage`-before-and-after-stream
pattern, same `streamText`/`.toUIMessageStreamResponse()` call shape. The differences
from the copilot are exactly the ones the design doc calls for: no creator-only auth
gate, no tier policy, IP rate limiting instead of a daily quota, and an
anon-or-signed-in identity resolution step the copilot doesn't need (copilot always has
a signed-in creator).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/api.agent.route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/agent/route.ts apps/web/tests/api.agent.route.test.ts
git commit -m "feat(web): POST /api/agent — anon-accessible streaming agent route"
```

---

## Task 9: `rateAgentMessageAction` — thumbs up/down server action

**Files:**
- Create: `apps/web/lib/agent/actions.ts`
- Test: `apps/web/tests/agent.actions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/agent.actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, createServerClientMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createServerClientMock: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: createServerClientMock }))

import { rateAgentMessageAction } from '@/lib/agent/actions'

beforeEach(() => {
  rpcMock.mockReset()
  createServerClientMock.mockReset()
  createServerClientMock.mockResolvedValue({ rpc: rpcMock })
})

describe('rateAgentMessageAction', () => {
  it('calls rate_agent_message with the message id, rating, and anonSessionId', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const result = await rateAgentMessageAction('msg-1', 'up', 'sess-1')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('rate_agent_message', {
      p_message_id: 'msg-1', p_rating: 'up', p_anon_session_id: 'sess-1',
    })
  })

  it('passes null for anonSessionId when signed in (no session id available)', async () => {
    rpcMock.mockResolvedValue({ error: null })
    await rateAgentMessageAction('msg-1', 'down', null)
    expect(rpcMock).toHaveBeenCalledWith('rate_agent_message', {
      p_message_id: 'msg-1', p_rating: 'down', p_anon_session_id: null,
    })
  })

  it('returns ok:false on an RPC error, without throwing', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'forbidden' } })
    const result = await rateAgentMessageAction('msg-1', 'up', 'sess-1')
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/agent.actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/agent/actions.ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type RateAgentMessageResult = { ok: true } | { ok: false }

export async function rateAgentMessageAction(
  messageId: string,
  rating: 'up' | 'down',
  anonSessionId: string | null,
): Promise<RateAgentMessageResult> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('rate_agent_message', {
    p_message_id: messageId,
    p_rating: rating,
    p_anon_session_id: anonSessionId,
  })
  if (error) {
    console.error('[agent:rate] rate_agent_message failed', error)
    return { ok: false }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/agent.actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/agent/actions.ts apps/web/tests/agent.actions.test.ts
git commit -m "feat(web): rateAgentMessageAction — thumbs up/down server action"
```

---

## Task 10: `AgentChatView` — the live chat UI

**Files:**
- Create: `apps/web/components/kinnso/pages/AgentChatView.tsx`
- Test: `apps/web/tests/kinnso.agent-chat-view.host.test.tsx`

- [ ] **Step 1: Read `apps/web/components/kinnso/pages/CreatorCopilotView.tsx` and `apps/web/tests/studio.copilot.host.test.tsx` first**, in full — mirror their `useChat()` shape and test-mocking pattern closely.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/kinnso.agent-chat-view.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { sendMessageMock, rateActionMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  rateActionMock: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Plan a Tokyo trip' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Here is a guide...' }] },
    ],
    sendMessage: sendMessageMock,
    status: 'ready',
    clearError: vi.fn(),
  }),
}))
vi.mock('ai', () => ({ DefaultChatTransport: vi.fn() }))
vi.mock('@/lib/agent/actions', () => ({ rateAgentMessageAction: rateActionMock }))

import en from '@/lib/i18n/messages/en'
import { AgentChatView } from '@/components/kinnso/pages/AgentChatView'

describe('AgentChatView', () => {
  it('renders the value-prop cards as an empty state when there are no messages', () => {
    vi.doMock('@ai-sdk/react', () => ({ useChat: () => ({ messages: [], sendMessage: sendMessageMock, status: 'ready', clearError: vi.fn() }) }))
    render(<AgentChatView locale="en" t={en.agent} configured={true} anonSessionId="sess-1" viewerSignedIn={false} />)
    expect(screen.getByText(en.agent.point1Title)).toBeTruthy()
  })

  it('renders messages and a thumbs up/down control under each assistant message', () => {
    render(<AgentChatView locale="en" t={en.agent} configured={true} anonSessionId="sess-1" viewerSignedIn={false} />)
    expect(screen.getByText('Here is a guide...')).toBeTruthy()
    expect(screen.getByLabelText(en.agent.ratingUpLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.agent.ratingDownLabel)).toBeTruthy()
  })

  it('clicking thumbs-up calls rateAgentMessageAction with the message id and anonSessionId', async () => {
    render(<AgentChatView locale="en" t={en.agent} configured={true} anonSessionId="sess-1" viewerSignedIn={false} />)
    fireEvent.click(screen.getByLabelText(en.agent.ratingUpLabel))
    expect(rateActionMock).toHaveBeenCalledWith('m2', 'up', 'sess-1')
  })

  it('sends the anonSessionId in the request body when not signed in', () => {
    render(<AgentChatView locale="en" t={en.agent} configured={true} anonSessionId="sess-1" viewerSignedIn={false} />)
    fireEvent.change(screen.getByPlaceholderText(en.agent.inputPlaceholder), { target: { value: 'hello' } })
    fireEvent.click(screen.getByText(en.agent.send))
    expect(sendMessageMock).toHaveBeenCalledWith({ text: 'hello' }, { body: { locale: 'en', anonSessionId: 'sess-1' } })
  })

  it('renders an unconfigured state when configured=false', () => {
    render(<AgentChatView locale="en" t={en.agent} configured={false} anonSessionId="sess-1" viewerSignedIn={false} />)
    expect(screen.getByText(en.agent.unconfiguredTitle)).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.agent-chat-view.host.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// apps/web/components/kinnso/pages/AgentChatView.tsx
'use client'
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Bot, Send, ThumbsDown, ThumbsUp, CalendarRange, Compass, MapPinned } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { rateAgentMessageAction } from '@/lib/agent/actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type UIMsg = { id: string; role: string; parts?: Array<{ type: string; text?: string }> }

function textOf(m: UIMsg): string {
  return (m.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
}

export function AgentChatView({ locale, t, configured, anonSessionId, viewerSignedIn }: {
  locale: Locale
  t: Messages['agent']
  configured: boolean
  anonSessionId: string
  viewerSignedIn: boolean
}) {
  const { messages, sendMessage, status, clearError } = useChat({
    transport: new DefaultChatTransport({ api: '/api/agent' }),
  } as never) as unknown as {
    messages: UIMsg[]
    sendMessage: (m: { text: string }, o?: unknown) => void
    status: string
    clearError: () => void
  }
  const [input, setInput] = useState('')
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({})
  const isError = status === 'error'
  const busy = status !== 'ready' && status !== 'error'

  if (!configured) {
    return (
      <main className="k2-container py-16">
        <div className="k2-card p-8 text-center">
          <Bot aria-hidden="true" className="mx-auto h-8 w-8 text-kinnso-orangeDark" />
          <h1 className="mt-3 text-2xl font-black text-kinnso-ink">{t.unconfiguredTitle}</h1>
          <p className="mt-2 text-kinnso-muted">{t.unconfiguredBody}</p>
        </div>
      </main>
    )
  }

  const onSend = () => {
    const text = input.trim()
    if (!text || busy) return
    if (isError) clearError()
    const body: { locale: Locale; anonSessionId?: string } = { locale }
    if (!viewerSignedIn) body.anonSessionId = anonSessionId
    sendMessage({ text }, { body })
    setInput('')
  }

  const onRate = async (messageId: string, rating: 'up' | 'down') => {
    setRatings((r) => ({ ...r, [messageId]: rating }))
    await rateAgentMessageAction(messageId, rating, viewerSignedIn ? null : anonSessionId)
  }

  const points = [
    { title: t.point1Title, body: t.point1Body, icon: <MapPinned aria-hidden="true" className="h-5 w-5" /> },
    { title: t.point2Title, body: t.point2Body, icon: <CalendarRange aria-hidden="true" className="h-5 w-5" /> },
    { title: t.point3Title, body: t.point3Body, icon: <Compass aria-hidden="true" className="h-5 w-5" /> },
  ]

  return (
    <main className="k2-container py-10">
      <header className="mb-6">
        <h1 className="k2-display flex items-center gap-2 text-3xl font-semibold"><Bot aria-hidden="true" className="h-7 w-7" /> {t.title}</h1>
        <p className="mt-2 text-kinnso-ink/70">{t.body}</p>
      </header>

      {messages.length === 0 ? (
        <div className="grid gap-5 md:grid-cols-3">
          {points.map((pt) => (
            <EditorialCard key={pt.title} title={pt.title}>
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{pt.icon}</span>
              {pt.body}
            </EditorialCard>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <span className="inline-block max-w-[80%] whitespace-pre-wrap rounded-2xl bg-kinnso-cream2 px-4 py-2 text-sm text-kinnso-ink">
                {textOf(m)}
              </span>
              {m.role === 'assistant' ? (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    aria-label={t.ratingUpLabel}
                    aria-pressed={ratings[m.id] === 'up'}
                    onClick={() => onRate(m.id, 'up')}
                    className="text-kinnso-muted hover:text-kinnso-orangeDark"
                  >
                    <ThumbsUp aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.ratingDownLabel}
                    aria-pressed={ratings[m.id] === 'down'}
                    onClick={() => onRate(m.id, 'down')}
                    className="text-kinnso-muted hover:text-kinnso-orangeDark"
                  >
                    <ThumbsDown aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-kinnso-muted">{t.toolWorking}</p> : null}
          {isError ? <p role="alert" className="text-sm font-medium text-kinnso-orangeDark">{t.errorGeneric}</p> : null}
        </div>
      )}

      <div className="mt-6 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder={t.inputPlaceholder}
          rows={2}
          className="k2-input flex-1 resize-none"
        />
        <button type="button" onClick={onSend} disabled={busy} className="k2-btn-primary inline-flex">
          {t.send} <Send aria-hidden="true" className="ml-2 h-4 w-4" />
        </button>
      </div>
    </main>
  )
}

export default AgentChatView
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.agent-chat-view.host.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/AgentChatView.tsx apps/web/tests/kinnso.agent-chat-view.host.test.tsx
git commit -m "feat(web): AgentChatView — live chat UI with thumbs up/down rating"
```

---

## Task 11: Wire up `/agent` page — remove the waitlist, generate/persist `anonSessionId`

**Files:**
- Modify: `apps/web/app/[locale]/agent/page.tsx`
- Test: `apps/web/tests/kinnso.agent-page.host.test.tsx`

- [ ] **Step 1: Read the current `apps/web/app/[locale]/agent/page.tsx` and `AgentLandingView.tsx` first.**

- [ ] **Step 2: Grep for other usages of `AgentWaitlistForm`/`joinAgentWaitlistAction`/`agent_waitlist` before deciding whether to delete them**

Run: `grep -rn "AgentWaitlistForm\|joinAgentWaitlistAction" apps/web --include="*.tsx" --include="*.ts"`
and check whether any admin/ops page reads the `agent_waitlist` table (e.g. an
`/admin/*` view listing collected emails). If nothing else references them, delete
`AgentLandingView.tsx`, `AgentWaitlistForm.tsx`, and `lib/agent/waitlist-actions.ts` as
part of this task (dead code — the agent is live now, no more waitlist). If an ops view
does read `agent_waitlist`, leave the table and the ops view alone; only remove the
now-superseded traveller-facing form/action/landing-view files. Report which case you
found in your final report — do not silently guess.

- [ ] **Step 3: Write the failing test**

```typescript
// apps/web/tests/kinnso.agent-page.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/agent/config', () => ({ isAgentConfigured: () => true }))
vi.mock('@/components/kinnso/pages/AgentChatView', () => ({
  AgentChatView: (p: { configured: boolean; viewerSignedIn: boolean; anonSessionId: string }) => (
    <div data-testid="chat-view" data-configured={String(p.configured)} data-signed-in={String(p.viewerSignedIn)} data-anon-session={p.anonSessionId} />
  ),
}))

import AgentPage from '@/app/[locale]/agent/page'

beforeEach(() => { getUserMock.mockResolvedValue({ data: { user: null } }) })

describe('/[locale]/agent host', () => {
  it('renders AgentChatView with viewerSignedIn=false and a generated anonSessionId for an anon visitor', async () => {
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    const view = screen.getByTestId('chat-view')
    expect(view.getAttribute('data-signed-in')).toBe('false')
    expect(view.getAttribute('data-anon-session')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('renders AgentChatView with viewerSignedIn=true for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('chat-view').getAttribute('data-signed-in')).toBe('true')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.agent-page.host.test.tsx`
Expected: FAIL — `AgentPage` still renders the waitlist view.

- [ ] **Step 5: Implement**

```typescript
// apps/web/app/[locale]/agent/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAgentConfigured } from '@/lib/agent/config'
import { AgentChatView } from '@/components/kinnso/pages/AgentChatView'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/agent', locale: locale as Locale, title: dict.seo.agent.title, description: dict.seo.agent.description })
}

export default async function AgentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  // auth.getUser() makes this page request-dynamic — needed so the chat view knows
  // whether to send an anonSessionId (same reasoning as the experience page's
  // equivalent comment from R3A-2).
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <AgentChatView
      locale={locale as Locale}
      t={messages.agent}
      configured={isAgentConfigured()}
      viewerSignedIn={Boolean(user)}
      anonSessionId={randomUUID()}
    />
  )
}
```

**Note on `anonSessionId` generation**: this generates a fresh UUID on every page
render (every hard navigation), which is fine for a first pass — the id only needs to be
stable *within one browser tab's chat session*, not across visits. If a future task wants
it to survive a page refresh mid-conversation, that's a client-side
`sessionStorage`-backed follow-up, not required for v1's exit criteria.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.agent-page.host.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/[locale]/agent/page.tsx" apps/web/tests/kinnso.agent-page.host.test.tsx
git commit -m "feat(web): /agent page renders the live chat, waitlist removed"
```

(If Step 2 found the waitlist form/action/landing-view to be dead code, include their
deletion in this same commit; if an ops view still reads `agent_waitlist`, note that in
the commit message and leave those files/table alone.)

---

## Task 12: Homepage `AgentTeaser` flips to a live link

**Files:**
- Modify: `apps/web/components/kinnso/home/AgentTeaser.tsx`
- Test: extend `apps/web/tests/kinnso.HomeView.test.tsx` (read it first — the shared
  `stats`/`t` fixtures already exist per earlier R3C work; extend, don't duplicate)

- [ ] **Step 1: Write the failing test**

Add to whichever describe block in `apps/web/tests/kinnso.HomeView.test.tsx` already
covers the `AgentTeaser` section (search the file for `agentCta`/`AgentTeaser` first —
extend that block; if none exists, add a new one following the file's existing
conventions):

```typescript
it('AgentTeaser links straight to /agent with live-chat copy, not waitlist copy', () => {
  // render HomeView with the existing fixtures; assert:
  expect(screen.getByText(en.home.agentCta)).toBeTruthy()
  const link = screen.getByText(en.home.agentCta).closest('a')
  expect(link?.getAttribute('href')).toBe('/en/agent')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.HomeView.test.tsx`
Expected: FAIL or PASS-but-wrong-copy — depends on whether `t.agentCta`'s value already
changed (it hasn't yet; Task 13 changes the i18n values). Confirm the test currently
checks the link `href` correctly resolves to `/agent` (this doesn't change) — the
substantive change is the i18n copy (Task 13), so this test mainly guards the `href`
staying correct through the edit.

- [ ] **Step 3: Implement**

`AgentTeaser.tsx`'s JSX needs no structural change — same `<Link href={\`/${locale}/agent\`}>` — only its doc comment updates to stop describing this as "waitlist framing":

```typescript
/**
 * Section 5 — AI Agent block. Links straight to the live chat at /agent
 * (R4 — no more waitlist framing; the agent is live).
 */
```

The actual copy change (`agentCta`/`agentNote`/`agentTitle`/`agentBody`) happens in
Task 13's i18n update, not here — this task only touches the doc comment, since the JSX
already reads its copy from `t.agent*` and needs no code change once those values flip.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.HomeView.test.tsx`
Expected: PASS (after Task 13's i18n change lands — if run before Task 13, this test's
`href` assertion should already pass since the link target doesn't change; only run the
full assertion set once Task 13 is also in).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/home/AgentTeaser.tsx apps/web/tests/kinnso.HomeView.test.tsx
git commit -m "docs(web): AgentTeaser comment reflects live-chat framing (copy in Task 13)"
```

---

## Task 13: i18n — new chat-specific `agent` keys + updated home/waitlist copy, ×7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (already covers new keys automatically
  via `Object.keys(en)` enumeration — no test code changes needed, just run it)

- [ ] **Step 1: Update the `agent` group's type declaration in `en.ts`**

Remove the waitlist-only keys (`formHeading`, `formBody`, `emailLabel`,
`emailPlaceholder`, `submitCta`, `successNote`, `errorInvalid`) since the waitlist form
is gone (Task 11), and add the new chat keys:

```typescript
agent: {
  eyebrow: string; title: string; body: string
  pointsHeading: string
  point1Title: string; point1Body: string
  point2Title: string; point2Body: string
  point3Title: string; point3Body: string
  honestNote: string; exploreCta: string; articlesCta: string
  errorGeneric: string
  inputPlaceholder: string; send: string; toolWorking: string
  ratingUpLabel: string; ratingDownLabel: string
  unconfiguredTitle: string; unconfiguredBody: string
}
```

(`honestNote`/`exploreCta`/`articlesCta`/`errorGeneric` are kept — `errorGeneric` is
reused as-is for the chat's stream-error message, matching the copilot's `errorGeneric`
naming; `honestNote`/`exploreCta`/`articlesCta` no longer make sense once the agent is
live and should be removed too, along with the fallback footer that used them in
`AgentLandingView` — but since `AgentLandingView` itself is deleted in Task 11, verify no
other file still imports these 3 keys before removing them; if Task 11 already deleted
`AgentLandingView`, they're safe to delete here.)

- [ ] **Step 2: Update `en.ts`'s values**

```typescript
agent: {
  eyebrow: 'KINNSO AI Agent',
  title: 'Your travel agent, grounded in real creator guides',
  body: 'Tell it where you\'re going and how you like to travel — it searches real published guides, articles, and bookable experiences to help you plan.',
  pointsHeading: 'What the agent does',
  point1Title: 'Grounded in real guides',
  point1Body: 'Every suggestion traces back to a published creator guide, article, or bookable experience — no invented spots.',
  point2Title: 'Plans around you',
  point2Body: 'Tell it your destination, dates and pace; it drafts an outline you can actually follow.',
  point3Title: 'Built for booking',
  point3Body: 'When it surfaces a bookable experience, you can book it right from the conversation.',
  errorGeneric: 'Something went wrong — please try again.',
  inputPlaceholder: 'Ask about a destination, dates, or style of trip...',
  send: 'Send',
  toolWorking: 'Searching...',
  ratingUpLabel: 'This response was helpful',
  ratingDownLabel: 'This response was not helpful',
  unconfiguredTitle: 'Agent temporarily unavailable',
  unconfiguredBody: 'The travel agent is temporarily offline — try again shortly, or explore guides and articles directly.',
},
```

- [ ] **Step 3: Update the `home` group's `agentCta`/`agentNote`/`agentTitle`/`agentBody` values in `en.ts`**

```typescript
agentTitle: 'An agent that plans like a local.',
agentBody: 'Tell it where you are going and how you like to travel — it searches real creator guides, articles, and bookable experiences, live.',
agentCta: 'Try the AI Agent',
agentNote: 'Live now — ask it to plan your next trip.',
```

(`agentEyebrow` is unchanged.)

- [ ] **Step 4: Apply the equivalent structural change + real translations to the other 6 locale files**

For each of `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`: remove the same
7 waitlist-only keys' values, add the 9 new chat keys with real, register-appropriate
translations (matching each file's existing tone — read a few neighboring `agent`/`home`
strings in that file first), and update `agentTitle`/`agentBody`/`agentCta`/`agentNote`
to reflect "live now," not "waitlist." Do not leave any locale with English left
untranslated — this is a hard requirement in this codebase, verified by
`tests/i18n.locale-parity.test.ts`'s structural check (it verifies key parity, not
translation quality, but the project's own standing convention is real translations
always, checked manually here).

- [ ] **Step 5: Run the parity test and the affected component tests**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts tests/kinnso.agent-chat-view.host.test.tsx tests/kinnso.agent-page.host.test.tsx tests/kinnso.HomeView.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): agent i18n — chat copy replaces waitlist copy, x7 locales"
```

---

## Task 14: Full-suite verification + apply migrations live + regenerate `@kinnso/db` types

**Files:** none new — verification only.

- [ ] **Step 1: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: all tests pass (baseline going into this phase was 1391/1391 passing, 31
skipped — expect 1391+new tests, 0 new failures, same skips).

- [ ] **Step 2: Typecheck + lint**

Run (from repo root): `pnpm typecheck && pnpm lint`
Expected: 0 errors in both (this phase's new tables/RPCs mean `@kinnso/db`'s types
won't reflect `agent_messages`/the new RPCs until Step 4 regenerates them — expect
typecheck failures on any file that references the new tables/RPCs by name against the
**old** generated types until then; this is the same "known, temporary, plan-scheduled
gap" pattern R3C's Task 1 hit).

- [ ] **Step 3: Apply all 4 of this phase's migrations to the live Supabase project**

**Ask the user for explicit confirmation before applying anything live** (same as R3C's
Task 14 — this is a production database mutation, not something to do unprompted).
Once confirmed, apply via the Supabase MCP `apply_migration` tool, in order:
`20260705100000_r4_search_guides_and_experiences.sql`,
`20260705110000_r4_agent_messages.sql`,
`20260705120000_r4_agent_rate_limit_and_rating_rpc.sql`,
`20260705130000_r4_bookings_agent_source_surface.sql`. After each, verify live via
`execute_sql`: confirm `search_guides`/`search_experiences` return real rows for a
real query; confirm `agent_messages`' RLS grants (`has_table_privilege`) show
insert-only for anon; confirm `rate_agent_message`/`check_and_increment_agent_rate_limit`
are SECURITY DEFINER with anon/authenticated EXECUTE; confirm the
`bookings_source_surface_check` constraint's definition now includes `'agent'`. Run
`get_advisors` (security) afterward and read the output for anything new.

- [ ] **Step 4: Regenerate `@kinnso/db` types**

Use the Supabase MCP `generate_typescript_types` tool against the same project, write
the result into `packages/db/types.ts` (same process as R3C's Task 14 — extract the
`types` field from the tool's JSON response, don't hand-edit).

- [ ] **Step 5: Re-run typecheck + full suite to confirm the gap from Step 2 is now closed**

Run: `pnpm typecheck` (from repo root) then `cd apps/web && npx vitest run`
Expected: 0 typecheck errors, full suite green.

- [ ] **Step 6: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): regenerate @kinnso/db types after applying the R4 migrations"
```

(If Steps 1-2 turned up any other issue, fix it and commit separately, describing what
the verification sweep caught — do not fold fixes into earlier task commits.)

---

## Task 15: Final holistic branch review

**Files:** none new — review only.

- [ ] **Step 1: Dispatch a fresh review subagent** (no context from implementation)
  across the whole `feat/revision-r4` branch diff against `feat/revision-r3c` (this
  branch's actual parent — not `main`, since it's stacked), matching the depth used for
  R3C's final review. Explicitly check:
  - **Security**: `createSupabaseServiceClient()` usage count is unchanged from R3C
    (this phase adds none); `agent_messages` has zero anon SELECT policy anywhere;
    `rate_agent_message`'s ownership check genuinely can't be bypassed (trace both the
    signed-in and anon branches); the rate-limit RPC/table are genuinely separate from
    `checkout_rate_limits`/`check_and_increment_checkout_rate_limit` (grep to confirm no
    accidental reuse crept in during implementation).
  - **The single-table simplification** (Ground Truth note, replacing the design doc's
    2-table sketch) actually delivers what D-R4-4 required: does a signed-in traveller's
    thread genuinely reconstruct correctly from `agent_messages` rows alone (ordered by
    `created_at`, filtered by `traveler_user_id`), with no missing state that the
    2-table version would have had?
  - **i18n parity**: all 7 locales, no leftover English-only placeholder text, no
    orphaned waitlist-only keys left in only some locale files.
  - **Dead code**: confirm Task 11's waitlist-removal decision was actually followed
    through consistently (no orphaned imports of deleted files).
  - Currency/attribution: agent-attributed bookings never sum across currencies, and
    `source_surface: 'agent'` bookings correctly have null `creator_id`/`guide_id`.

- [ ] **Step 2: Fix any Critical/Important findings directly** (same session, before
  proposing a PR) — re-run affected tests after each fix.

- [ ] **Step 3: Report remaining Minor/carry-forward findings**, then hand off per
  `finishing-a-development-branch`.

---

## Testing summary

Per-slice, following the established `*-queries.test.ts` / `*-actions.test.ts` /
`*.host.test.tsx` / `db.*-migration.test.ts` layering. New this phase: the first
route/component pair in this codebase built for BOTH anon and signed-in callers in one
code path (the copilot is creator-only; this is the first dual-mode auth surface),
tested via both branches explicitly in Task 8/11's tests.

## Out of scope (R4)

"Agent v2" full itinerary assembly · click-through attribution instrumentation ·
carrying a searched guide's own creator attribution through an agent-surfaced booking ·
any change to the creator copilot, `copilot_messages`, or its RLS · multi-language model
routing beyond the single fixed Haiku slug · `anonSessionId` surviving a page refresh
mid-conversation (noted as a plan-phase non-requirement in Task 11).

## Self-review (per writing-plans skill)

- **Spec coverage**: D-R4-1 (Task 1) · D-R4-2 (Task 8, tool-calling) · D-R4-3 (Task 5) ·
  D-R4-4 (Task 2, single-table refinement explicitly flagged) · D-R4-5 (Task 9/10) ·
  D-R4-6 (Task 4) · D-R4-7 (Task 11/12/13) all have concrete tasks. PD-R4-1 (rating RPC)
  is new, plan-phase-only, documented in §1.
- **Placeholder scan**: no TBD/TODO/"add appropriate" language; every code step has
  complete, real code, including all 4 SQL migrations, real i18n translations (not
  English-only stand-ins) for all 7 locales.
- **Type consistency**: `AgentIdentity` (Task 6) matches what `appendAgentMessage`
  (Task 6) and the route (Task 8) both use; `AGENT_MODEL`/`AGENT_RATE_LIMIT` (Task 5)
  are the exact values Task 8's route and its tests reference; `rate_agent_message`'s
  RPC parameter names (`p_message_id`/`p_rating`/`p_anon_session_id`, Task 3) match
  exactly what `rateAgentMessageAction` (Task 9) calls it with.
