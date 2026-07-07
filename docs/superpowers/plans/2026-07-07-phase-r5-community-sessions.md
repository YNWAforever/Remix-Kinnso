# Phase R5 — Community Sessions P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Community Sessions as a real, live feature — public listing/detail pages, RSVP email capture, YouTube live embed + replay playback, a creator Studio scheduler, an ops management console, and the homepage/sitemap unlocks the master spec's D4 decision requires.

**Architecture:** Two new tables (`community_sessions`, `session_rsvps`) plus a dedicated IP rate limiter, following this program's established RLS conventions exactly (public-read policies mirror `testimonials`/`experiences`, RSVP insert-only mirrors `agent_messages`/`agent_waitlist`). Three authoring surfaces share the same domain layer: public reads (`lib/sessions/public-queries.ts`), a creator-owned Studio CRUD (`lib/sessions/studio-actions.ts`, mirrors `lib/guides/actions.ts`), and an ops CRUD with full authority (`lib/admin/sessions-actions.ts`, mirrors `lib/admin/testimonials-actions.ts`). The homepage band and `platform_stats()` stub-to-real-query swap follows the exact contract R1B already locked in.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions) · Supabase Postgres + RLS · Vitest · existing `@kinnso/db` generated types.

---

## Ground truth notes (read before starting)

- **`creators.id` IS `auth.users.id` directly** (`create table public.creators (id uuid primary key references auth.users(id) ...)`, `supabase/migrations/20260614000009_creator_tables.sql`) — there is no separate `user_id` column to join through. This means `community_sessions`' creator-owner RLS policy is a direct `host_creator_id = auth.uid()` comparison, NOT a subquery like `experiences_owner_all` (which has to join through `merchant_profiles.user_id` because `merchant_profiles.id` is its own independently-generated PK, unlike `creators.id`). Do not copy the subquery shape from experiences — it would be over-complicated and wrong here.
- **`creators` already has a public-read RLS policy** (`creators_public_read`, `supabase/migrations/20260624000001_creator_public_profile.sql`): anon may SELECT any row where `status = 'active' and handle is not null and public_profile is not null` — every column on this table is public-safe (no follower/PII data lives on it). This means session host attribution can query `creators` directly in a second query (same two-query-no-embed shape as `experiences` → `merchant_public_profiles`), with **no new PII-safe view needed**. Edge case worth knowing: a session whose host creator does not yet meet that predicate (not yet active/public) will have its host attribution silently unavailable to anon reads — degrade to a generic label rather than crashing (same "reads never crash" stance as `getExperiencesForCity`).
- **RSVP writes must use `createSupabaseServerClient()`, not `createSupabasePublicClient()`.** The public client is a plain anon-key client with no session/cookie awareness — it cannot tell whether the caller is signed in, so it could never populate `user_id`. `appendAgentMessage` (R4) and every other identity-aware anon-or-authenticated write in this codebase uses the SSR-aware server client. Public reads (listing/detail/sitemap) correctly use the public client, same as `experiences`.
- **Every plan-phase decision beyond the design doc's literal text is called out inline as "PD-R5-N" the first time it comes up**, matching this program's own convention (see R4's plan for precedent).

---

### Task 1: Migration — `community_sessions`, `session_rsvps`, `rsvp_rate_limits`

**Files:**
- Create: `supabase/migrations/20260707100000_r5_community_sessions.sql`
- Test: `apps/web/tests/db.r5-community-sessions.test.ts`

**PD-R5-1**: the design doc's data-model table doesn't spell out grants/triggers — this task adds `updated_at` + `set_updated_at()` from day one (R1B's testimonials table had to add this in a follow-up migration; R5 doesn't repeat that mistake).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/db.r5-community-sessions.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260707100000_r5_community_sessions.sql'),
  'utf8',
)

describe('R5 community_sessions + session_rsvps + rsvp_rate_limits migration', () => {
  it('creates community_sessions with the locked column set and status/type CHECKs', () => {
    expect(sql).toContain('create table public.community_sessions')
    expect(sql).toContain("check (type in ('destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro'))")
    expect(sql).toContain("check (status in ('scheduled','live','ended','cancelled'))")
    expect(sql).toContain("status text not null default 'scheduled'")
    expect(sql).toContain('host_creator_id uuid not null references public.creators(id)')
  })

  it('community_sessions RLS: public read excludes cancelled, owner policy uses direct auth.uid() equality (not a subquery)', () => {
    expect(sql).toContain('create policy community_sessions_public_read on public.community_sessions')
    expect(sql).toContain("using (status <> 'cancelled')")
    expect(sql).toContain('create policy community_sessions_owner_all on public.community_sessions')
    expect(sql).toContain('using (host_creator_id = auth.uid())')
    expect(sql).toContain('with check (host_creator_id = auth.uid())')
    expect(sql).toContain('create policy community_sessions_ops_all on public.community_sessions')
    expect(sql).toContain('is_active_ops()')
  })

  it('community_sessions has a set_updated_at trigger from the start', () => {
    expect(sql).toContain('add column if not exists updated_at')
    expect(sql).toMatch(/create trigger community_sessions_set_updated_at[\s\S]*execute (?:procedure|function) public\.set_updated_at\(\)/)
  })

  it('session_rsvps enforces email shape, uniqueness, and insert-only RLS with a NULL-safe owner check', () => {
    expect(sql).toContain('create table public.session_rsvps')
    expect(sql).toContain('references public.community_sessions(id) on delete cascade')
    expect(sql).toContain('unique(session_id, email)')
    expect(sql).toMatch(/email ~\* '\^\[\^@\[:space:\]\]\+@/)
    expect(sql).toContain('create policy session_rsvps_insert on public.session_rsvps')
    expect(sql).toContain('with check (user_id is null or user_id = auth.uid())')
    expect(sql).toContain('create policy session_rsvps_ops_read on public.session_rsvps')
    expect(sql).not.toContain('session_rsvps_public_read')
  })

  it('rsvp_rate_limits is a dedicated table/function, not a reuse of agent_rate_limits or checkout_rate_limits', () => {
    expect(sql).toContain('create table public.rsvp_rate_limits')
    expect(sql).not.toContain('agent_rate_limits')
    expect(sql).not.toContain('checkout_rate_limits')
    expect(sql).toContain('create or replace function public.check_and_increment_rsvp_rate_limit')
    expect(sql).toContain('security definer')
    expect(sql).toContain('grant execute on function public.check_and_increment_rsvp_rate_limit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.r5-community-sessions.test.ts`
Expected: FAIL — migration file does not exist yet (`ENOENT`).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260707100000_r5_community_sessions.sql

-- R5: Community Sessions P1 — two content tables + a dedicated RSVP rate limiter.
--
-- host_creator_id RLS note: creators.id IS auth.users.id directly (creators is a
-- one-row-per-auth-user table, see 20260614000009_creator_tables.sql), so the
-- creator-owner policy below is a direct `host_creator_id = auth.uid()` equality —
-- NOT a subquery through a separate profile table like experiences_owner_all needs
-- (merchant_profiles.id is its own independently-generated PK). Getting this right
-- matters: a subquery here would silently never match and lock every creator out of
-- their own sessions.
--
-- session_rsvps identity note: deliberately NOT an exactly-one-of XOR like
-- bookings/agent_messages. The design doc's own wording is "email + optional user_id
-- (CRM capture)" — email is always captured, user_id is populated only when the
-- visitor happens to be signed in. The insert policy is still NULL-safe against a
-- signed-in caller trying to claim someone else's user_id.
--
-- rsvp_rate_limits is its own table + function, not a reuse of agent_rate_limits or
-- checkout_rate_limits (house rule: each abuse-control surface gets its own copy,
-- since check_and_increment_agent_rate_limit hardcodes its own table name and
-- sharing would couple two features' unrelated abuse limits).

create table public.community_sessions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  host_creator_id uuid not null references public.creators(id),
  title text not null,
  description text not null,
  type text not null check (type in ('destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro')),
  starts_at timestamptz not null,
  duration_minutes integer not null,
  embed_url text,
  replay_url text,
  destination_tags text[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index community_sessions_starts_at_idx on public.community_sessions (starts_at);
create index community_sessions_host_idx on public.community_sessions (host_creator_id);

alter table public.community_sessions enable row level security;
revoke all on public.community_sessions from anon, authenticated;

-- Public read: anon + any signed-in role sees every non-cancelled session (scheduled,
-- live, and ended-with-or-without-a-replay all stay visible; cancelled is the ops-pull
-- path and should disappear from public view immediately).
create policy community_sessions_public_read on public.community_sessions
  for select to anon, authenticated using (status <> 'cancelled');

-- Creator owns their own sessions fully (create/edit/go-live/end/cancel their own).
create policy community_sessions_owner_all on public.community_sessions
  for all to authenticated
  using (host_creator_id = auth.uid())
  with check (host_creator_id = auth.uid());

-- Ops manage ANY session (create on a creator's behalf via a host picker, edit,
-- cancel, override status) regardless of who created it.
create policy community_sessions_ops_all on public.community_sessions
  for all to authenticated
  using (public.is_active_ops())
  with check (public.is_active_ops());

grant select on public.community_sessions to anon;
grant select, insert, update, delete on public.community_sessions to authenticated; -- gated by the policies above

alter table public.community_sessions
  add column if not exists updated_at timestamptz not null default now();

create trigger community_sessions_set_updated_at
  before update on public.community_sessions
  for each row execute procedure public.set_updated_at();

-- session_rsvps: append-only CRM capture. No anon SELECT policy exists at all — the
-- only reader is ops. Duplicate (session_id, email) inserts are expected to be
-- handled as success by the app layer (23505 unique-violation → ok:true), the same
-- idempotent-join shield agent_waitlist/agent_messages already established.
create table public.session_rsvps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.community_sessions(id) on delete cascade,
  email text not null check (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254
  ),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(session_id, email)
);

create index session_rsvps_session_idx on public.session_rsvps (session_id);

alter table public.session_rsvps enable row level security;
revoke all on public.session_rsvps from anon, authenticated;

-- Fails closed for anon: auth.uid() is null for an anon caller, so
-- "user_id = auth.uid()" can only be true for an authenticated caller claiming their
-- own real id (same shape as agent_messages_insert).
create policy session_rsvps_insert on public.session_rsvps
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

create policy session_rsvps_ops_read on public.session_rsvps
  for select to authenticated using (public.is_active_ops());

grant insert on public.session_rsvps to anon, authenticated;
grant select on public.session_rsvps to authenticated; -- gated to ops by the policy above

-- Dedicated IP rate limiter for the RSVP write path (own table/function, per house rule).
create table public.rsvp_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.rsvp_rate_limits enable row level security;
revoke all on table public.rsvp_rate_limits from anon, authenticated;

create or replace function public.check_and_increment_rsvp_rate_limit(
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
  insert into public.rsvp_rate_limits (ip, window_start, request_count)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set window_start = case
          when public.rsvp_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.rsvp_rate_limits.window_start
        end,
        request_count = case
          when public.rsvp_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.rsvp_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.check_and_increment_rsvp_rate_limit(text, integer, integer) from public;
grant execute on function public.check_and_increment_rsvp_rate_limit(text, integer, integer) to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.r5-community-sessions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260707100000_r5_community_sessions.sql apps/web/tests/db.r5-community-sessions.test.ts
git commit -m "feat(db): community_sessions + session_rsvps + rsvp_rate_limits (R5)"
```

---

### Task 2: Migration — `platform_stats()` gains `upcoming_sessions`

**Files:**
- Create: `supabase/migrations/20260707110000_r5_platform_stats_upcoming_sessions.sql`
- Test: `apps/web/tests/db.r5-platform-stats-upcoming-sessions.test.ts`

**PD-R5-2**: Postgres rejects `CREATE OR REPLACE FUNCTION` when the `RETURNS TABLE` column list changes (the exact wall R3C's Task 1 hit adding `completed_bookings`) — this migration must `DROP FUNCTION` first. The count is a plain RLS-respecting count in the function body (no `app_private` security-definer helper needed): `community_sessions_public_read` already lets anon see every non-cancelled row, so this SECURITY INVOKER function's count runs under the exact same visibility anon already has — nothing to bypass.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/db.r5-platform-stats-upcoming-sessions.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260707110000_r5_platform_stats_upcoming_sessions.sql'),
  'utf8',
)

describe('R5 platform_stats() upcoming_sessions migration', () => {
  it('drops the old function before recreating it (Postgres cannot CREATE OR REPLACE a changed RETURNS TABLE list)', () => {
    expect(sql).toContain('drop function public.platform_stats()')
  })

  it('recreates platform_stats with upcoming_sessions added to the RETURNS TABLE list', () => {
    expect(sql).toContain('active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint, upcoming_sessions bigint')
  })

  it('counts scheduled+live community_sessions rows, not a security-definer helper', () => {
    expect(sql).toMatch(/upcoming_sessions.*select count\(\*\) from public\.community_sessions\s+where status in \('scheduled','live'\)/s)
    expect(sql).not.toContain('app_private.count_upcoming_sessions')
  })

  it('re-establishes anon/authenticated EXECUTE grants explicitly', () => {
    expect(sql).toContain('revoke all on function public.platform_stats() from public, anon')
    expect(sql).toContain('grant execute on function public.platform_stats() to anon, authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.r5-platform-stats-upcoming-sessions.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260707110000_r5_platform_stats_upcoming_sessions.sql

-- R5: platform_stats() gains upcoming_sessions for the homepage social-proof bar.
-- Postgres rejects CREATE OR REPLACE FUNCTION when the RETURNS TABLE column list
-- changes (the same wall R3C's Task 1 hit adding completed_bookings) — DROP first.
-- SECURITY INVOKER, same as the original function: community_sessions_public_read
-- already lets anon see every non-cancelled row, so a plain count() here runs under
-- exactly the visibility anon already has. No app_private helper needed (unlike
-- completed_bookings, which has to bypass a table anon has zero SELECT on).

drop function public.platform_stats();

create function public.platform_stats()
returns table (
  active_creators bigint, published_guides bigint, destinations bigint,
  completed_bookings bigint, upcoming_sessions bigint
)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.creators
       where status = 'active' and handle is not null and public_profile is not null),
    (select count(*) from public.guides where status = 'published'),
    (select count(distinct city) from public.guides
       where status = 'published' and city is not null and city <> ''),
    app_private.count_completed_bookings(),
    (select count(*) from public.community_sessions where status in ('scheduled','live'));
$$;

revoke all on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.r5-platform-stats-upcoming-sessions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260707110000_r5_platform_stats_upcoming_sessions.sql apps/web/tests/db.r5-platform-stats-upcoming-sessions.test.ts
git commit -m "feat(db): platform_stats() gains upcoming_sessions (R5)"
```

---

### Task 3: Migration — drop the orphaned `agent_waitlist` table

**Files:**
- Create: `supabase/migrations/20260707120000_r5_drop_agent_waitlist.sql`
- Test: `apps/web/tests/db.r5-drop-agent-waitlist.test.ts`

**PD-R5-3** (D-R5-10 in the design doc): `agent_waitlist` has 0 live rows, its app code was deleted in R4, and it is currently a live anon-INSERT surface with zero consumers. This is a separate, small migration — not folded into Task 1's file — so it can be reviewed/reverted independently of the sessions schema.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/db.r5-drop-agent-waitlist.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260707120000_r5_drop_agent_waitlist.sql'),
  'utf8',
)

describe('R5 drop agent_waitlist migration', () => {
  it('drops the table (0 live rows, no consumer since R4 removed the app code)', () => {
    expect(sql).toContain('drop table if exists public.agent_waitlist')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.r5-drop-agent-waitlist.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260707120000_r5_drop_agent_waitlist.sql

-- R5 cleanup: agent_waitlist has 0 live rows (confirmed at plan time), its
-- server-action consumer (joinAgentWaitlistAction) was deleted in R4's waitlist
-- removal, and it is currently a live anon-INSERT surface with no reader beyond
-- ops. Dropping it closes a real, unnecessary attack-surface line item cheaply
-- while this phase is already touching adjacent RSVP/rate-limit schema.

drop table if exists public.agent_waitlist;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.r5-drop-agent-waitlist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260707120000_r5_drop_agent_waitlist.sql apps/web/tests/db.r5-drop-agent-waitlist.test.ts
git commit -m "chore(db): drop orphaned agent_waitlist table (R5)"
```

---

### Task 4: `lib/sessions/types.ts` + `lib/sessions/embed.ts`

**Files:**
- Create: `apps/web/lib/sessions/types.ts`
- Create: `apps/web/lib/sessions/embed.ts`
- Test: `apps/web/tests/sessions.embed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/sessions.embed.test.ts
import { describe, it, expect } from 'vitest'
import { parseSessionEmbedUrl } from '@/lib/sessions/embed'

describe('parseSessionEmbedUrl', () => {
  it('accepts a youtube.com/watch URL', () => {
    const r = parseSessionEmbedUrl('https://www.youtube.com/watch?v=abc123XYZ_-')
    expect(r).toEqual({
      id: 'abc123XYZ_-',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc123XYZ_-',
      watchUrl: 'https://www.youtube.com/watch?v=abc123XYZ_-',
    })
  })

  it('accepts youtube.com/live/<id> and youtube.com/embed/<id>', () => {
    expect(parseSessionEmbedUrl('https://youtube.com/live/liveId123')?.id).toBe('liveId123')
    expect(parseSessionEmbedUrl('https://youtube.com/embed/embedId456')?.id).toBe('embedId456')
  })

  it('accepts a youtu.be short URL', () => {
    expect(parseSessionEmbedUrl('https://youtu.be/shortId789')?.id).toBe('shortId789')
  })

  it('rejects non-YouTube hosts (Zoom, Vimeo, generic sites)', () => {
    expect(parseSessionEmbedUrl('https://zoom.us/j/1234567890')).toBeNull()
    expect(parseSessionEmbedUrl('https://vimeo.com/123456789')).toBeNull()
    expect(parseSessionEmbedUrl('https://example.com/video')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseSessionEmbedUrl('not a url')).toBeNull()
    expect(parseSessionEmbedUrl('')).toBeNull()
  })

  it('rejects a youtube.com/watch URL with no v= param', () => {
    expect(parseSessionEmbedUrl('https://www.youtube.com/watch')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/sessions.embed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/sessions/types.ts
export const SESSION_TYPES = ['destination_briefing', 'ask_a_creator', 'merchant_spotlight', 'new_creator_intro'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export const SESSION_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

/** Form-string input shared by the Studio (creator) and ops create/edit forms. */
export type SessionInput = {
  title: string
  description: string
  type: SessionType
  startsAt: string // ISO or datetime-local form string; parsed/validated downstream
  durationMinutes: string // form-string; '' invalid, R5 always requires a value
  embedUrl: string // '' = not set yet
  replayUrl: string // '' = not set yet
  destinationTags: string // comma-separated form-string; parsed downstream
}
```

```typescript
// apps/web/lib/sessions/embed.ts
export type ParsedSessionEmbed = { id: string; embedUrl: string; watchUrl: string }

/**
 * YouTube-only in P1 (D-R5-2) — validates and normalizes a host-supplied embed_url
 * or replay_url into a sandboxed youtube-nocookie.com embed src plus the original
 * watch URL. Mirrors lib/missions/proof-url.ts's YouTube branch (watch/shorts/embed/
 * live/youtu.be forms), scoped to this one platform rather than shared, since the
 * two features' URL shapes and callers differ.
 */
export function parseSessionEmbedUrl(input: string): ParsedSessionEmbed | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(?:www|m)\./i, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null = null

  if (host === 'youtube.com') {
    if (parts[0] === 'watch') {
      id = url.searchParams.get('v')
    } else {
      const i = parts.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'live')
      if (i >= 0 && parts[i + 1]) id = parts[i + 1]
    }
  } else if (host === 'youtu.be') {
    id = parts[0] ?? null
  }

  if (!id) return null
  return {
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/sessions.embed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/sessions/types.ts apps/web/lib/sessions/embed.ts apps/web/tests/sessions.embed.test.ts
git commit -m "feat(web): session types + YouTube embed URL validator"
```

---

### Task 5: `lib/sessions/validation.ts`

**Files:**
- Create: `apps/web/lib/sessions/validation.ts`
- Test: `apps/web/tests/sessions.validation.test.ts`

**PD-R5-4**: the design doc's D-R5-4 clarification ("go live" disabled until `embed_url` is set) is enforced here as a plain function (`canGoLive`), not a DB constraint, so both the Studio and ops status-transition actions (Tasks 8 and 9) can share one source of truth and surface the same error message.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/sessions.validation.test.ts
import { describe, it, expect } from 'vitest'
import { validateSessionInput, canGoLive } from '@/lib/sessions/validation'
import type { SessionInput } from '@/lib/sessions/types'

const validInput: SessionInput = {
  title: 'Tokyo late-night ramen: ask me anything',
  description: 'Bring your questions about ramen shops that stay open past midnight.',
  type: 'ask_a_creator',
  startsAt: '2027-01-15T18:00:00.000Z',
  durationMinutes: '45',
  embedUrl: '',
  replayUrl: '',
  destinationTags: 'Tokyo, Japan',
}

describe('validateSessionInput', () => {
  it('accepts a fully valid input and parses destinationTags/durationMinutes/startsAt', () => {
    const result = validateSessionInput(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parsed.destinationTags).toEqual(['Tokyo', 'Japan'])
      expect(result.parsed.durationMinutes).toBe(45)
      expect(result.parsed.startsAt).toBe('2027-01-15T18:00:00.000Z')
      expect(result.parsed.embedUrl).toBeNull()
      expect(result.parsed.replayUrl).toBeNull()
    }
  })

  it('rejects an empty title', () => {
    const result = validateSessionInput({ ...validInput, title: '  ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.title).toBeTruthy()
  })

  it('rejects an invalid session type', () => {
    const result = validateSessionInput({ ...validInput, type: 'not_a_real_type' as never })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.type).toBeTruthy()
  })

  it('rejects a non-positive or non-integer duration', () => {
    expect(validateSessionInput({ ...validInput, durationMinutes: '0' }).ok).toBe(false)
    expect(validateSessionInput({ ...validInput, durationMinutes: '12.5' }).ok).toBe(false)
    expect(validateSessionInput({ ...validInput, durationMinutes: '' }).ok).toBe(false)
  })

  it('rejects an unparsable startsAt', () => {
    const result = validateSessionInput({ ...validInput, startsAt: 'not a date' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.startsAt).toBeTruthy()
  })

  it('rejects a non-YouTube embedUrl', () => {
    const result = validateSessionInput({ ...validInput, embedUrl: 'https://zoom.us/j/123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.embedUrl).toBeTruthy()
  })

  it('rejects a non-YouTube replayUrl', () => {
    const result = validateSessionInput({ ...validInput, replayUrl: 'https://vimeo.com/123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.replayUrl).toBeTruthy()
  })

  it('accepts a valid YouTube embedUrl and stores it trimmed, as-given', () => {
    const result = validateSessionInput({ ...validInput, embedUrl: '  https://youtu.be/abc123  ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed.embedUrl).toBe('https://youtu.be/abc123')
  })

  it('parses an empty destinationTags string to an empty array, and trims/drops blanks', () => {
    const result = validateSessionInput({ ...validInput, destinationTags: ' Tokyo ,, Japan ,' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed.destinationTags).toEqual(['Tokyo', 'Japan'])
  })
})

describe('canGoLive', () => {
  it('is false without an embed_url', () => {
    expect(canGoLive({ embedUrl: null })).toBe(false)
  })
  it('is true with an embed_url', () => {
    expect(canGoLive({ embedUrl: 'https://youtu.be/abc123' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/sessions.validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/sessions/validation.ts
import { SESSION_TYPES, type SessionInput, type SessionType } from '@/lib/sessions/types'
import { parseSessionEmbedUrl } from '@/lib/sessions/embed'

export type ValidationErrors = Record<string, string[]>
export type ParsedSession = {
  title: string
  description: string
  type: SessionType
  startsAt: string // ISO
  durationMinutes: number
  embedUrl: string | null
  replayUrl: string | null
  destinationTags: string[]
}
export type SessionValidation =
  | { ok: true; parsed: ParsedSession }
  | { ok: false; errors: ValidationErrors }

function parseTags(raw: string): string[] {
  return raw.split(',').map((t) => t.trim()).filter(Boolean)
}

export function validateSessionInput(input: SessionInput): SessionValidation {
  const errors: ValidationErrors = {}

  const title = input.title.trim()
  if (!title) errors.title = ['required']
  else if (title.length > 160) errors.title = ['too_long']

  const description = input.description.trim()
  if (!description) errors.description = ['required']

  if (!(SESSION_TYPES as readonly string[]).includes(input.type)) errors.type = ['invalid']

  const startsAtDate = new Date(input.startsAt)
  if (Number.isNaN(startsAtDate.getTime())) errors.startsAt = ['invalid_date']

  const durationRaw = input.durationMinutes.trim()
  const duration = Number(durationRaw)
  if (!durationRaw || !Number.isInteger(duration) || duration <= 0) errors.durationMinutes = ['invalid_number']

  const embedUrl = input.embedUrl.trim()
  if (embedUrl && !parseSessionEmbedUrl(embedUrl)) errors.embedUrl = ['invalid_youtube_url']

  const replayUrl = input.replayUrl.trim()
  if (replayUrl && !parseSessionEmbedUrl(replayUrl)) errors.replayUrl = ['invalid_youtube_url']

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    parsed: {
      title,
      description,
      type: input.type,
      startsAt: startsAtDate.toISOString(),
      durationMinutes: duration,
      embedUrl: embedUrl || null,
      replayUrl: replayUrl || null,
      destinationTags: parseTags(input.destinationTags),
    },
  }
}

/** D-R5-4: a session cannot be marked live with nothing to embed. */
export function canGoLive(session: { embedUrl: string | null }): boolean {
  return Boolean(session.embedUrl)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/sessions.validation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/sessions/validation.ts apps/web/tests/sessions.validation.test.ts
git commit -m "feat(web): validateSessionInput + canGoLive"
```

---

### Task 6: `lib/sessions/public-queries.ts`

**Files:**
- Create: `apps/web/lib/sessions/public-queries.ts`
- Test: `apps/web/tests/sessions.public-queries.test.ts`

Host attribution is a second, separate query against `creators` — same no-embed shape as `experiences` → `merchant_public_profiles`, except `creators` is read directly (no PII-safe view needed, see the Ground Truth notes at the top of this plan). A session whose host row doesn't satisfy `creators_public_read` (not yet active/public) degrades to `host: null` rather than throwing — the detail/listing views must handle that (Tasks 12-13).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/sessions.public-queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: () => ({ from: fromMock }) }))

import {
  getUpcomingSessionsList, getReplaySessions, getSessionBySlug, getSessionsForSitemap,
} from '@/lib/sessions/public-queries'

const sessionRow = {
  id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
  type: 'ask_a_creator', starts_at: '2027-01-15T18:00:00.000Z', duration_minutes: 45,
  embed_url: 'https://youtu.be/abc123', replay_url: null, destination_tags: ['Tokyo'],
  status: 'scheduled', host_creator_id: 'creator-1',
}
const creatorRow = { id: 'creator-1', handle: 'sora', display_name: 'Sora' }

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'in', 'eq', 'not', 'order', 'limit', 'maybeSingle']
  for (const m of methods) builder[m] = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => finalValue)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(finalValue).then(resolve)
  return builder
}

beforeEach(() => { fromMock.mockReset() })

describe('getUpcomingSessionsList', () => {
  it('queries scheduled+live sessions ordered by starts_at ascending, then attaches host', async () => {
    const sessionsChain = chain({ data: [sessionRow], error: null })
    const creatorsChain = chain({ data: [creatorRow], error: null })
    fromMock.mockImplementation((table: string) => (table === 'community_sessions' ? sessionsChain : creatorsChain))

    const result = await getUpcomingSessionsList()
    expect(sessionsChain.in).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    expect(sessionsChain.order).toHaveBeenCalledWith('starts_at', { ascending: true })
    expect(result).toEqual([{
      id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
      type: 'ask_a_creator', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: 'https://youtu.be/abc123', replayUrl: null, destinationTags: ['Tokyo'],
      status: 'scheduled', host: { handle: 'sora', displayName: 'Sora' },
    }])
  })
})

describe('getReplaySessions', () => {
  it('queries ended sessions with a non-null replay_url, ordered by starts_at descending', async () => {
    const sessionsChain = chain({ data: [], error: null })
    fromMock.mockReturnValue(sessionsChain)
    await getReplaySessions()
    expect(sessionsChain.eq).toHaveBeenCalledWith('status', 'ended')
    expect(sessionsChain.not).toHaveBeenCalledWith('replay_url', 'is', null)
    expect(sessionsChain.order).toHaveBeenCalledWith('starts_at', { ascending: false })
  })
})

describe('getSessionBySlug', () => {
  it('returns null when no row matches', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: null }))
    expect(await getSessionBySlug('does-not-exist')).toBeNull()
  })

  it('degrades host to null when the creator row is not publicly readable', async () => {
    const sessionsChain = chain({ data: sessionRow, error: null })
    const creatorsChain = chain({ data: [], error: null })
    fromMock.mockImplementation((table: string) => (table === 'community_sessions' ? sessionsChain : creatorsChain))
    const result = await getSessionBySlug('tokyo-ramen-ama')
    expect(result?.host).toBeNull()
  })
})

describe('getSessionsForSitemap', () => {
  it('includes upcoming and ended-with-replay sessions only', async () => {
    const upcomingChain = chain({ data: [{ slug: 'a', starts_at: '2027-01-01T00:00:00.000Z' }], error: null })
    const replayChain = chain({ data: [{ slug: 'b', starts_at: '2026-06-01T00:00:00.000Z' }], error: null })
    let call = 0
    fromMock.mockImplementation(() => (call++ === 0 ? upcomingChain : replayChain))
    const result = await getSessionsForSitemap()
    expect(result).toEqual([
      { slug: 'a', lastmod: '2027-01-01T00:00:00.000Z' },
      { slug: 'b', lastmod: '2026-06-01T00:00:00.000Z' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/sessions.public-queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/sessions/public-queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { SessionStatus, SessionType } from '@/lib/sessions/types'

export type PublicSession = {
  id: string
  slug: string
  title: string
  description: string
  type: SessionType
  startsAt: string
  durationMinutes: number
  embedUrl: string | null
  replayUrl: string | null
  destinationTags: string[]
  status: SessionStatus
  /** null = the host creator's public profile isn't live yet (degrade, don't crash). */
  host: { handle: string; displayName: string } | null
}

const SESSION_COLUMNS = 'id, slug, title, description, type, starts_at, duration_minutes, embed_url, replay_url, destination_tags, status, host_creator_id'

type SessionRow = {
  id: string; slug: string; title: string; description: string; type: SessionType
  starts_at: string; duration_minutes: number; embed_url: string | null; replay_url: string | null
  destination_tags: string[] | null; status: SessionStatus; host_creator_id: string
}

function toDomain(r: SessionRow, host: { handle: string; displayName: string } | null): PublicSession {
  return {
    id: r.id, slug: r.slug, title: r.title, description: r.description, type: r.type,
    startsAt: r.starts_at, durationMinutes: r.duration_minutes,
    embedUrl: r.embed_url, replayUrl: r.replay_url, destinationTags: r.destination_tags ?? [],
    status: r.status, host,
  }
}

/**
 * Second, separate query against `creators` — same no-embed shape as
 * experiences -> merchant_public_profiles. Unlike merchants, `creators` is safe to
 * read directly (creators_public_read already restricts anon to public-safe rows),
 * so no dedicated view is needed. A host row that isn't publicly readable (not yet
 * active/public) is simply absent from the map -> degrades to host: null.
 */
async function attachHost(
  supabase: ReturnType<typeof createSupabasePublicClient>,
  rows: SessionRow[],
): Promise<PublicSession[]> {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.map((r) => r.host_creator_id))]
  const { data: creators, error } = await supabase.from('creators').select('id, handle, display_name').in('id', ids)
  if (error) throw error
  const hostById = new Map(
    (creators ?? []).map((c) => [c.id as string, { handle: c.handle as string, displayName: c.display_name as string }]),
  )
  return rows.map((r) => toDomain(r, hostById.get(r.host_creator_id) ?? null))
}

export async function getUpcomingSessionsList(limit = 20): Promise<PublicSession[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('community_sessions')
    .select(SESSION_COLUMNS)
    .in('status', ['scheduled', 'live'])
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return attachHost(supabase, (data ?? []) as unknown as SessionRow[])
}

export async function getReplaySessions(limit = 20): Promise<PublicSession[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('community_sessions')
    .select(SESSION_COLUMNS)
    .eq('status', 'ended')
    .not('replay_url', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return attachHost(supabase, (data ?? []) as unknown as SessionRow[])
}

export async function getSessionBySlug(slug: string): Promise<PublicSession | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('community_sessions')
    .select(SESSION_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [result] = await attachHost(supabase, [data as unknown as SessionRow])
  return result
}

/** Upcoming + ended-with-replay only — cancelled and any other end state excluded. */
export async function getSessionsForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data: upcoming, error: upcomingError } = await supabase
    .from('community_sessions')
    .select('slug, starts_at')
    .in('status', ['scheduled', 'live'])
  if (upcomingError) throw upcomingError
  const { data: replays, error: replayError } = await supabase
    .from('community_sessions')
    .select('slug, starts_at')
    .eq('status', 'ended')
    .not('replay_url', 'is', null)
  if (replayError) throw replayError
  return [...(upcoming ?? []), ...(replays ?? [])].map((r) => ({
    slug: r.slug as string,
    lastmod: (r.starts_at as string | null) ?? null,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/sessions.public-queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/sessions/public-queries.ts apps/web/tests/sessions.public-queries.test.ts
git commit -m "feat(web): public session queries (listing, replays, detail, sitemap)"
```

---

### Task 7: `lib/admin/guard.ts` gains `requireCreatorAction`

**Files:**
- Modify: `apps/web/lib/admin/guard.ts`
- Test: `apps/web/tests/admin.guard.test.ts` (extend the existing file)

**PD-R5-5**: no `requireCreatorAction` gate exists yet — the one creator-owned Studio CRUD precedent (`lib/guides/actions.ts`) inlines its own `getAuthedCreator` helper instead. Since `creators.id` IS `auth.uid()` directly (see Ground Truth notes), this gate needs no extra lookup query — simpler than `requireMerchantAction`, which has to resolve a separate `merchant_profiles.id`. Adding it to `guard.ts` completes the three-role set (`requireOpsAction`/`requireMerchantAction`/`requireCreatorAction`) in one place rather than duplicating inline auth logic in a new file.

- [ ] **Step 1: Write the failing test**

Add to the existing `apps/web/tests/admin.guard.test.ts` (read it first to match its exact mocking conventions for `resolveViewerRole` and `supabase.auth.getUser`):

```typescript
describe('requireCreatorAction', () => {
  it('fails for an anon caller', async () => {
    const supabase = { auth: { getUser: async () => ({ data: { user: null } }) } }
    const result = await requireCreatorAction(supabase as never)
    expect(result.ok).toBe(false)
  })

  it('fails for a signed-in non-creator (e.g. a traveller)', async () => {
    roleMock.mockResolvedValueOnce('traveler')
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }
    const result = await requireCreatorAction(supabase as never)
    expect(result.ok).toBe(false)
  })

  it('succeeds for a signed-in creator, returning the user (id doubles as creators.id)', async () => {
    roleMock.mockResolvedValueOnce('creator')
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'creator-1' } } }) } }
    const result = await requireCreatorAction(supabase as never)
    expect(result).toEqual({ ok: true, user: { id: 'creator-1' } })
  })
})
```

(Import `requireCreatorAction` alongside whatever gates the file already imports from `@/lib/admin/guard`; reuse the file's existing `roleMock`/`resolveViewerRole` mock setup rather than declaring a new one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.guard.test.ts`
Expected: FAIL — `requireCreatorAction` is not exported.

- [ ] **Step 3: Implement**

In `apps/web/lib/admin/guard.ts`, add directly below `requireOpsAction`:

```typescript
/**
 * Action gate: typed failure for anon/non-creator; ok+user for a creator.
 * Unlike requireMerchantAction, no extra lookup is needed — creators.id IS
 * auth.uid() directly (creators is a one-row-per-auth-user table), so
 * user.id can be used as host_creator_id / community_sessions ownership
 * directly by the caller.
 */
export async function requireCreatorAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  if ((await resolveViewerRole(supabase)) !== 'creator') return formError('Creator access is required')
  return { ok: true, user }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.guard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/guard.ts apps/web/tests/admin.guard.test.ts
git commit -m "feat(web): requireCreatorAction gate"
```

---

### Task 8: `lib/sessions/studio-actions.ts` — creator-owned Studio CRUD

**Files:**
- Create: `apps/web/lib/sessions/studio-actions.ts`
- Test: `apps/web/tests/sessions.studio-actions.test.ts`

Mirrors `lib/experiences/actions.ts`'s shape (gate → validate → write, scoped by owner id, revalidate the owner's list path), using `requireCreatorAction` (Task 7) instead of `requireMerchantAction`, and `host_creator_id = gate.user.id` directly (no separate merchant-profile-id resolution needed).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/sessions.studio-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionInput } from '@/lib/sessions/types'

const { requireCreatorActionMock, fromMock, revalidatePathMock } = vi.hoisted(() => ({
  requireCreatorActionMock: vi.fn(async () => ({ ok: true, user: { id: 'creator-1' } })),
  fromMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: requireCreatorActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { createSessionAction, updateSessionAction, setSessionStatusAction } from '@/lib/sessions/studio-actions'

const validInput: SessionInput = {
  title: 'Tokyo ramen AMA', description: 'Ask away.', type: 'ask_a_creator',
  startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: '45',
  embedUrl: '', replayUrl: '', destinationTags: 'Tokyo',
}

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'select', 'eq', 'single', 'maybeSingle']) builder[m] = vi.fn(() => builder)
  builder.single = vi.fn(async () => finalValue)
  builder.maybeSingle = vi.fn(async () => finalValue)
  return builder
}

beforeEach(() => {
  requireCreatorActionMock.mockClear()
  requireCreatorActionMock.mockResolvedValue({ ok: true, user: { id: 'creator-1' } })
  fromMock.mockReset()
  revalidatePathMock.mockClear()
})

describe('createSessionAction', () => {
  it('fails the gate for a non-creator', async () => {
    requireCreatorActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Creator access is required'] } })
    const result = await createSessionAction(validInput, { locale: 'en' })
    expect(result.ok).toBe(false)
  })

  it('inserts with host_creator_id = the gated creator id, and revalidates the Studio list', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1', slug: 'tokyo-ramen-ama-abc123' }, error: null }))
    const result = await createSessionAction(validInput, { locale: 'en' })
    expect(result).toEqual({ ok: true, id: 'sess-1', slug: 'tokyo-ramen-ama-abc123' })
    const insertedRow = (fromMock.mock.results[0].value.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(insertedRow.host_creator_id).toBe('creator-1')
    expect(insertedRow.title).toBe('Tokyo ramen AMA')
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/studio/sessions')
  })

  it('returns validation errors without touching the database', async () => {
    const result = await createSessionAction({ ...validInput, title: '' }, { locale: 'en' })
    expect(result.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('setSessionStatusAction', () => {
  it('refuses to go live without an embed_url set', async () => {
    fromMock.mockReturnValue(chain({ data: { embed_url: null }, error: null }))
    const result = await setSessionStatusAction('sess-1', 'live', { locale: 'en' })
    expect(result.ok).toBe(false)
  })

  it('allows going live once embed_url is set', async () => {
    const readChain = chain({ data: { embed_url: 'https://youtu.be/abc' }, error: null })
    const writeChain = chain({ data: { id: 'sess-1' }, error: null })
    let call = 0
    fromMock.mockImplementation(() => (call++ === 0 ? readChain : writeChain))
    const result = await setSessionStatusAction('sess-1', 'live', { locale: 'en' })
    expect(result.ok).toBe(true)
  })

  it('scopes the update to the gated creator (host_creator_id eq)', async () => {
    const readChain = chain({ data: { embed_url: 'https://youtu.be/abc' }, error: null })
    const writeChain = chain({ data: { id: 'sess-1' }, error: null })
    let call = 0
    fromMock.mockImplementation(() => (call++ === 0 ? readChain : writeChain))
    await setSessionStatusAction('sess-1', 'live', { locale: 'en' })
    expect(writeChain.eq).toHaveBeenCalledWith('host_creator_id', 'creator-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/sessions.studio-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/sessions/studio-actions.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorAction } from '@/lib/admin/guard'
import { makeSlug } from '@/lib/guides/slug'
import { validateSessionInput, canGoLive, type ValidationErrors } from '@/lib/sessions/validation'
import type { SessionInput } from '@/lib/sessions/types'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
const listPath = (locale: Locale) => `/${locale}/studio/sessions`

function toRow(p: ReturnType<typeof validateSessionInput> extends { ok: true; parsed: infer P } ? P : never) {
  return {
    title: p.title,
    description: p.description,
    type: p.type,
    starts_at: p.startsAt,
    duration_minutes: p.durationMinutes,
    embed_url: p.embedUrl,
    replay_url: p.replayUrl,
    destination_tags: p.destinationTags,
  }
}

export async function createSessionAction(
  rawInput: SessionInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('community_sessions')
    .insert({
      host_creator_id: gate.user.id,
      slug: makeSlug(validation.parsed.title, randomUUID().slice(0, 6)),
      ...toRow(validation.parsed),
    })
    .select('id, slug')
    .single()
  if (error || !data) {
    if (error) console.error('[sessions:studio] create failed', error)
    return formError('Session could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

export async function updateSessionAction(
  id: string,
  rawInput: SessionInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('community_sessions')
    .update(toRow(validation.parsed))
    .eq('id', id)
    .eq('host_creator_id', gate.user.id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[sessions:studio] update failed', error)
    return formError('Session could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string }
}

/**
 * Shared by Studio and ops (Task 9 wraps its own ops-scoped version). "live"
 * requires an embed_url (D-R5-4) — checked by reading the row first, RLS-scoped
 * to the caller's own sessions.
 */
export async function setSessionStatusAction(
  id: string,
  status: 'live' | 'ended' | 'cancelled',
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; status: typeof status }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  if (status === 'live') {
    const { data: current } = await supabase
      .from('community_sessions')
      .select('embed_url')
      .eq('id', id)
      .eq('host_creator_id', gate.user.id)
      .maybeSingle()
    if (!current) return formError('Session not found')
    if (!canGoLive({ embedUrl: current.embed_url as string | null })) {
      return formError('Add a live embed URL before going live')
    }
  }

  const { data, error } = await supabase
    .from('community_sessions')
    .update({ status })
    .eq('id', id)
    .eq('host_creator_id', gate.user.id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[sessions:studio] setStatus failed', error)
    return formError('Status could not be changed')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string, status }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/sessions.studio-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/sessions/studio-actions.ts apps/web/tests/sessions.studio-actions.test.ts
git commit -m "feat(web): creator Studio session actions (create/update/status)"
```

---

### Task 9: `lib/admin/sessions-queries.ts` + `lib/admin/sessions-actions.ts` — ops CRUD + RSVP read

**Files:**
- Create: `apps/web/lib/admin/sessions-queries.ts`
- Create: `apps/web/lib/admin/sessions-actions.ts`
- Test: `apps/web/tests/admin.sessions-queries.test.ts`
- Test: `apps/web/tests/admin.sessions-actions.test.ts`

Mirrors `testimonials-queries.ts`/`testimonials-actions.ts` exactly, plus a host picker (ops creates on a creator's behalf) and a read-only RSVP list per session (the CRM export surface, D-R5-6). Function names are `admin`-prefixed to avoid any confusion with Task 8's Studio versions, since both modules genuinely export a `createSessionAction`-shaped function with different authority.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/tests/admin.sessions-queries.test.ts
import { describe, it, expect, vi } from 'vitest'
import { listAllSessions, listSessionRsvps, listCreatorsForHostPicker } from '@/lib/admin/sessions-queries'

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) builder[m] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(finalValue).then(resolve)
  return builder
}

describe('listAllSessions', () => {
  it('orders by starts_at descending and includes cancelled rows (ops sees everything)', async () => {
    const sessionsChain = chain({ data: [], error: null })
    const supabase = { from: vi.fn(() => sessionsChain) }
    await listAllSessions(supabase as never)
    expect(sessionsChain.order).toHaveBeenCalledWith('starts_at', { ascending: false })
  })

  it('throws on a real error rather than silently returning []', async () => {
    const supabase = { from: vi.fn(() => chain({ data: null, error: new Error('boom') })) }
    await expect(listAllSessions(supabase as never)).rejects.toThrow()
  })
})

describe('listSessionRsvps', () => {
  it('filters to the given session id', async () => {
    const rsvpChain = chain({ data: [], error: null })
    const supabase = { from: vi.fn(() => rsvpChain) }
    await listSessionRsvps(supabase as never, 'sess-1')
    expect(rsvpChain.eq).toHaveBeenCalledWith('session_id', 'sess-1')
  })
})

describe('listCreatorsForHostPicker', () => {
  it('returns id/handle/display_name for the ops host-picker dropdown', async () => {
    const creatorsChain = chain({ data: [{ id: 'c1', handle: 'sora', display_name: 'Sora' }], error: null })
    const supabase = { from: vi.fn(() => creatorsChain) }
    const result = await listCreatorsForHostPicker(supabase as never)
    expect(result).toEqual([{ id: 'c1', handle: 'sora', displayName: 'Sora' }])
  })
})
```

```typescript
// apps/web/tests/admin.sessions-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionInput } from '@/lib/sessions/types'

const { requireOpsActionMock, fromMock } = vi.hoisted(() => ({
  requireOpsActionMock: vi.fn(async () => ({ ok: true, user: { id: 'ops1' } })),
  fromMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: requireOpsActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { adminCreateSessionAction, adminSetSessionStatusAction, adminDeleteSessionAction } from '@/lib/admin/sessions-actions'

const validInput: SessionInput = {
  title: 'Merchant spotlight: Kyoto tea house', description: 'Meet the team.', type: 'merchant_spotlight',
  startsAt: '2027-02-01T10:00:00.000Z', durationMinutes: '30', embedUrl: '', replayUrl: '', destinationTags: 'Kyoto',
}

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'delete', 'select', 'eq', 'single', 'maybeSingle']) builder[m] = vi.fn(() => builder)
  builder.single = vi.fn(async () => finalValue)
  builder.maybeSingle = vi.fn(async () => finalValue)
  return builder
}

beforeEach(() => { requireOpsActionMock.mockClear(); fromMock.mockReset() })

describe('adminCreateSessionAction', () => {
  it('fails the gate for a non-ops caller', async () => {
    requireOpsActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const result = await adminCreateSessionAction('creator-9', validInput, { locale: 'en' })
    expect(result.ok).toBe(false)
  })

  it('inserts with host_creator_id = the picked creator, not the ops caller', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1', slug: 'merchant-spotlight-abc' }, error: null }))
    await adminCreateSessionAction('creator-9', validInput, { locale: 'en' })
    const insertedRow = (fromMock.mock.results[0].value.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(insertedRow.host_creator_id).toBe('creator-9')
  })
})

describe('adminSetSessionStatusAction', () => {
  it('can cancel any session regardless of host, without an embed_url check', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1' }, error: null }))
    const result = await adminSetSessionStatusAction('sess-1', 'cancelled', { locale: 'en' })
    expect(result.ok).toBe(true)
  })

  it('still refuses to go live without an embed_url', async () => {
    fromMock.mockReturnValue(chain({ data: { embed_url: null }, error: null }))
    const result = await adminSetSessionStatusAction('sess-1', 'live', { locale: 'en' })
    expect(result.ok).toBe(false)
  })
})

describe('adminDeleteSessionAction', () => {
  it('deletes any session (no host scope)', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1' }, error: null }))
    const result = await adminDeleteSessionAction('sess-1', { locale: 'en' })
    expect(result.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/admin.sessions-queries.test.ts tests/admin.sessions-actions.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/admin/sessions-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type AdminSession = Database['public']['Tables']['community_sessions']['Row']
export type SessionRsvp = Database['public']['Tables']['session_rsvps']['Row']

/** Ops full read, cancelled rows included (community_sessions_ops_all grants this). */
export async function listAllSessions(supabase: SupabaseClient<Database>): Promise<AdminSession[]> {
  const { data, error } = await supabase
    .from('community_sessions')
    .select('*')
    .order('starts_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** The CRM-export read surface (D-R5-6) — ops only, per session_rsvps_ops_read. */
export async function listSessionRsvps(supabase: SupabaseClient<Database>, sessionId: string): Promise<SessionRsvp[]> {
  const { data, error } = await supabase
    .from('session_rsvps')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Populates the ops "create on a creator's behalf" host picker. */
export async function listCreatorsForHostPicker(
  supabase: SupabaseClient<Database>,
): Promise<{ id: string; handle: string | null; displayName: string | null }[]> {
  const { data, error } = await supabase
    .from('creators')
    .select('id, handle, display_name')
    .order('display_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id as string, handle: c.handle as string | null, displayName: c.display_name as string | null }))
}
```

```typescript
// apps/web/lib/admin/sessions-actions.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateSessionInput, canGoLive } from '@/lib/sessions/validation'
import type { SessionInput } from '@/lib/sessions/types'
import { makeSlug } from '@/lib/guides/slug'
import { LOCALES, type Locale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const adminSessionsPath = (locale: Locale) => `/${locale}/admin/sessions`

function revalidateSessionSurfaces(locale: Locale) {
  revalidatePath(adminSessionsPath(locale))
  for (const l of LOCALES) {
    revalidatePath(`/${l}`)
    revalidatePath(`/${l}/sessions`)
  }
}

export async function adminCreateSessionAction(
  hostCreatorId: string,
  rawInput: SessionInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const p = validation.parsed
  const { data, error } = await supabase
    .from('community_sessions')
    .insert({
      host_creator_id: hostCreatorId,
      slug: makeSlug(p.title, randomUUID().slice(0, 6)),
      title: p.title, description: p.description, type: p.type,
      starts_at: p.startsAt, duration_minutes: p.durationMinutes,
      embed_url: p.embedUrl, replay_url: p.replayUrl, destination_tags: p.destinationTags,
    })
    .select('id, slug')
    .single()
  if (error || !data) {
    if (error) console.error('[admin:sessions] create failed', error)
    return formError('Session could not be created')
  }

  revalidateSessionSurfaces(options.locale)
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

export async function adminUpdateSessionAction(
  id: string,
  rawInput: SessionInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const p = validation.parsed
  const { data, error } = await supabase
    .from('community_sessions')
    .update({
      title: p.title, description: p.description, type: p.type,
      starts_at: p.startsAt, duration_minutes: p.durationMinutes,
      embed_url: p.embedUrl, replay_url: p.replayUrl, destination_tags: p.destinationTags,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:sessions] update failed', error)
    return formError('Session could not be saved')
  }

  revalidateSessionSurfaces(options.locale)
  return { ok: true, id: data.id as string }
}

/** No host scope (ops can act on any session) — otherwise identical to the Studio version. */
export async function adminSetSessionStatusAction(
  id: string,
  status: 'live' | 'ended' | 'cancelled',
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; status: typeof status }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  if (status === 'live') {
    const { data: current } = await supabase.from('community_sessions').select('embed_url').eq('id', id).maybeSingle()
    if (!current) return formError('Session not found')
    if (!canGoLive({ embedUrl: current.embed_url as string | null })) {
      return formError('Add a live embed URL before going live')
    }
  }

  const { data, error } = await supabase
    .from('community_sessions')
    .update({ status })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:sessions] setStatus failed', error)
    return formError('Status could not be changed')
  }

  revalidateSessionSurfaces(options.locale)
  return { ok: true, id: data.id as string, status }
}

export async function adminDeleteSessionAction(
  id: string,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.from('community_sessions').delete().eq('id', id).select('id').maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:sessions] delete failed', error)
    return formError('Session could not be deleted')
  }

  revalidateSessionSurfaces(options.locale)
  return { ok: true, id: data.id as string }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/admin.sessions-queries.test.ts tests/admin.sessions-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/sessions-queries.ts apps/web/lib/admin/sessions-actions.ts apps/web/tests/admin.sessions-queries.test.ts apps/web/tests/admin.sessions-actions.test.ts
git commit -m "feat(web): ops session CRUD + RSVP read + host picker"
```

---

### Task 10: `lib/sessions/rsvp-actions.ts` — the anon+authenticated RSVP write

**Files:**
- Create: `apps/web/lib/sessions/rsvp-actions.ts`
- Test: `apps/web/tests/sessions.rsvp-actions.test.ts`

Combines the `joinAgentWaitlistAction` honeypot/idempotent-insert pattern with the R4 IP-rate-limit shape (`getClientIp` + a `check_and_increment_*` RPC), using `createSupabaseServerClient()` (not the public client) so a signed-in visitor's `user_id` is correctly attached (see Ground Truth notes).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/sessions.rsvp-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUserMock, rpcMock, insertMock, getClientIpMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
  insertMock: vi.fn(async () => ({ error: null })),
  getClientIpMock: vi.fn(async () => '203.0.113.5'),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: () => ({ insert: insertMock }),
  }),
}))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))

import { rsvpToSessionAction } from '@/lib/sessions/rsvp-actions'

beforeEach(() => {
  getUserMock.mockResolvedValue({ data: { user: null } })
  rpcMock.mockResolvedValue({ data: true, error: null })
  insertMock.mockResolvedValue({ error: null })
})

describe('rsvpToSessionAction', () => {
  it('returns a fake success without inserting when the honeypot is filled', async () => {
    const result = await rsvpToSessionAction('sess-1', 'bot@example.com', 'filled')
    expect(result).toEqual({ ok: true })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without inserting or rate-limit-checking', async () => {
    const result = await rsvpToSessionAction('sess-1', 'not-an-email')
    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('checks the rate limit with the real client IP before inserting', async () => {
    await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(rpcMock).toHaveBeenCalledWith('check_and_increment_rsvp_rate_limit', {
      p_ip: '203.0.113.5', p_max_requests: 10, p_window_seconds: 3600,
    })
  })

  it('returns rate_limited and never inserts when the RPC disallows', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: false, error: 'rate_limited' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts with user_id: null for an anon caller', async () => {
    await rsvpToSessionAction('sess-1', 'Traveller@Example.com  ')
    expect(insertMock).toHaveBeenCalledWith({ session_id: 'sess-1', email: 'traveller@example.com', user_id: null })
  })

  it('inserts with the signed-in user_id when the caller is authenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })
    await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(insertMock).toHaveBeenCalledWith({ session_id: 'sess-1', email: 'traveller@example.com', user_id: 'traveler-1' })
  })

  it('treats a unique-violation (23505) as success, not a failure', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate' } })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: true })
  })

  it('returns failed on any other insert error', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '23503', message: 'fk violation' } })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: false, error: 'failed' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/sessions.rsvp-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/sessions/rsvp-actions.ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/http/client-ip'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RSVP_RATE_LIMIT = { maxRequests: 10, windowSeconds: 3600 } as const

export type RsvpResult = { ok: true } | { ok: false; error: 'invalid' | 'rate_limited' | 'failed' }

/**
 * Anon-or-authenticated RSVP insert (session_rsvps_insert RLS, D-R5-5). `hp` is the
 * form honeypot: bots that fill it get a fake success and no insert (same shield as
 * joinAgentWaitlistAction). A unique-violation (23505) on (session_id, email) is
 * success, not failure — re-RSVPing is a no-op and this doubles as an
 * email-enumeration shield. Uses the SSR-aware server client (not the public
 * client) specifically so a signed-in visitor's user_id is attached.
 */
export async function rsvpToSessionAction(sessionId: string, email: string, hp?: string): Promise<RsvpResult> {
  if (hp) return { ok: true }
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) return { ok: false, error: 'invalid' }

  const supabase = await createSupabaseServerClient()
  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc('check_and_increment_rsvp_rate_limit', {
    p_ip: ip,
    p_max_requests: RSVP_RATE_LIMIT.maxRequests,
    p_window_seconds: RSVP_RATE_LIMIT.windowSeconds,
  })
  if (rateLimitError) return { ok: false, error: 'failed' }
  if (!allowed) return { ok: false, error: 'rate_limited' }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('session_rsvps').insert({
    session_id: sessionId,
    email: normalized,
    user_id: user?.id ?? null,
  })
  if (error && error.code !== '23505') {
    console.error('[sessions:rsvp] rsvp failed', error)
    return { ok: false, error: 'failed' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/sessions.rsvp-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/sessions/rsvp-actions.ts apps/web/tests/sessions.rsvp-actions.test.ts
git commit -m "feat(web): RSVP action — honeypot, rate limit, idempotent insert"
```

---

### Task 11: `lib/seo/jsonld.ts` gains `sessionEventJsonLd`

**Files:**
- Modify: `apps/web/lib/seo/jsonld.ts`
- Test: `apps/web/tests/seo.jsonld.test.ts` (create if it doesn't already exist covering this file; otherwise extend it)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/seo.jsonld.test.ts (add this describe block; keep any existing content in the file)
import { describe, it, expect } from 'vitest'
import { sessionEventJsonLd } from '@/lib/seo/jsonld'

describe('sessionEventJsonLd', () => {
  it('builds an Event with a VirtualLocation pointed at the embed URL', () => {
    const ld = sessionEventJsonLd({
      name: 'Tokyo ramen AMA', description: 'Ask away.', url: 'https://www.kinnso.ai/en/sessions/tokyo-ramen-ama',
      startDate: '2027-01-15T18:00:00.000Z', status: 'scheduled', embedUrl: 'https://youtu.be/abc123', hostName: 'Sora',
    })
    expect(ld).toMatchObject({
      '@context': 'https://schema.org', '@type': 'Event',
      name: 'Tokyo ramen AMA', startDate: '2027-01-15T18:00:00.000Z',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'VirtualLocation', url: 'https://youtu.be/abc123' },
      performer: { '@type': 'Person', name: 'Sora' },
    })
  })

  it('falls back to the session page url as the location when no embed is set yet', () => {
    const ld = sessionEventJsonLd({
      name: 'A', description: 'B', url: 'https://www.kinnso.ai/en/sessions/a',
      startDate: '2027-01-15T18:00:00.000Z', status: 'scheduled', embedUrl: null, hostName: null,
    })
    expect((ld.location as Record<string, unknown>).url).toBe('https://www.kinnso.ai/en/sessions/a')
    expect(ld.performer).toBeUndefined()
  })

  it('maps a cancelled session to EventCancelled', () => {
    const ld = sessionEventJsonLd({
      name: 'A', description: 'B', url: 'https://www.kinnso.ai/en/sessions/a',
      startDate: '2027-01-15T18:00:00.000Z', status: 'cancelled', embedUrl: null, hostName: null,
    })
    expect(ld.eventStatus).toBe('https://schema.org/EventCancelled')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/seo.jsonld.test.ts`
Expected: FAIL — `sessionEventJsonLd` is not exported.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/seo/jsonld.ts`:

```typescript
export function sessionEventJsonLd(i: {
  name: string; description: string; url: string
  startDate: string
  status: 'scheduled' | 'live' | 'ended' | 'cancelled'
  embedUrl: string | null
  hostName: string | null
}): Record<string, unknown> {
  // schema.org has no "ended"/"live" EventStatus value — a session that happened as
  // scheduled (live or ended) is still EventScheduled; only an explicit cancellation
  // gets its own value.
  const eventStatus = i.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled'
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Event',
    name: i.name, description: i.description, url: i.url,
    startDate: i.startDate,
    eventStatus,
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: i.embedUrl ?? i.url },
  }
  if (i.hostName) ld.performer = { '@type': 'Person', name: i.hostName }
  return ld
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/seo.jsonld.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/seo/jsonld.ts apps/web/tests/seo.jsonld.test.ts
git commit -m "feat(web): sessionEventJsonLd builder"
```

---

### Task 12: `/sessions` listing page (replaces the R1A placeholder)

**Files:**
- Modify: `apps/web/app/[locale]/sessions/page.tsx` (full rewrite)
- Create: `apps/web/components/kinnso/pages/SessionsListingView.tsx`
- Delete: `apps/web/tests/sessions.host.test.tsx` (replaced by the new test below — its assertions are for the retired placeholder, not something to keep passing)
- Test: `apps/web/tests/kinnso.sessions-listing.host.test.tsx`
- Modify: `apps/web/lib/seo/routes.ts` (add `/sessions` to `MARKETING_PATHS`)

**PD-R5-6**: joining `MARKETING_PATHS` here is the deliberate SEO flip the design doc calls for — done in this task, not silently, since it changes what the sitemap includes.

- [ ] **Step 1: Read `apps/web/app/[locale]/explore/page.tsx` first** (the closest public-listing precedent: `revalidate = 300`, single query, hands data to a view component).

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/kinnso.sessions-listing.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getUpcomingSessionsListMock, getReplaySessionsMock } = vi.hoisted(() => ({
  getUpcomingSessionsListMock: vi.fn(async () => []),
  getReplaySessionsMock: vi.fn(async () => []),
}))
vi.mock('@/lib/sessions/public-queries', () => ({
  getUpcomingSessionsList: getUpcomingSessionsListMock,
  getReplaySessions: getReplaySessionsMock,
}))

import SessionsPage from '@/app/[locale]/sessions/page'
import { MARKETING_PATHS } from '@/lib/seo/routes'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/sessions listing host', () => {
  it('is a real public page now, in MARKETING_PATHS', () => {
    expect(MARKETING_PATHS).toContain('/sessions')
  })

  it('renders an empty state when there are no upcoming sessions or replays', async () => {
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.sessions.emptyUpcoming)).toBeTruthy()
  })

  it('renders upcoming sessions linking to their detail page', async () => {
    getUpcomingSessionsListMock.mockResolvedValueOnce([{
      id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
      type: 'ask_a_creator', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: null, replayUrl: null, destinationTags: ['Tokyo'], status: 'scheduled',
      host: { handle: 'sora', displayName: 'Sora' },
    }])
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /Tokyo ramen AMA/ }).getAttribute('href')).toBe('/en/sessions/tokyo-ramen-ama')
  })

  it('renders a separate replays section for ended sessions with a replay', async () => {
    getReplaySessionsMock.mockResolvedValueOnce([{
      id: 's2', slug: 'kyoto-temples-recap', title: 'Kyoto temples recap', description: 'The replay.',
      type: 'destination_briefing', startsAt: '2026-12-01T09:00:00.000Z', durationMinutes: 30,
      embedUrl: null, replayUrl: 'https://youtu.be/xyz', destinationTags: ['Kyoto'], status: 'ended',
      host: { handle: 'nina', displayName: 'Nina' },
    }])
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.sessions.replaysHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Kyoto temples recap/ }).getAttribute('href')).toBe('/en/sessions/kyoto-temples-recap')
  })

  it('404s unknown locales', async () => {
    vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
    await expect(SessionsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.sessions-listing.host.test.tsx`
Expected: FAIL — old placeholder still renders / `MARKETING_PATHS` does not contain `/sessions`.

- [ ] **Step 4: Delete the retired placeholder test, flip `MARKETING_PATHS`, implement the page + view**

```bash
rm apps/web/tests/sessions.host.test.tsx
```

In `apps/web/lib/seo/routes.ts`, add `/sessions` to `MARKETING_PATHS`:

```typescript
export const MARKETING_PATHS = [
  '', '/explore', '/creators', '/agent', '/about', '/contact', '/merchants', '/legal/creator-terms', '/for-creators', '/for-merchants', '/sessions',
] as const
```

```typescript
// apps/web/app/[locale]/sessions/page.tsx (full rewrite)
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getUpcomingSessionsList, getReplaySessions } from '@/lib/sessions/public-queries'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { SessionsListingView } from '@/components/kinnso/pages/SessionsListingView'

export const revalidate = 300

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/sessions', locale: locale as Locale, title: dict.seo.sessions.title, description: dict.seo.sessions.description })
}

export default async function SessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const [upcoming, replays] = await Promise.all([getUpcomingSessionsList(), getReplaySessions()])
  return <SessionsListingView locale={locale as Locale} t={messages.sessions} upcoming={upcoming} replays={replays} />
}
```

```typescript
// apps/web/components/kinnso/pages/SessionsListingView.tsx
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

function SessionGrid({ locale, sessions }: { locale: Locale; sessions: PublicSession[] }) {
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="mt-8 grid gap-5 md:grid-cols-3">
      {sessions.map((s) => (
        <Link key={s.id} href={`/${locale}/sessions/${s.slug}`} className="group">
          <EditorialCard kicker={dateTimeFmt.format(new Date(s.startsAt))} title={s.title}>
            {s.host ? `@${s.host.handle}` : null}
          </EditorialCard>
        </Link>
      ))}
    </div>
  )
}

export function SessionsListingView({
  locale, t, upcoming, replays,
}: {
  locale: Locale
  t: Messages['sessions']
  upcoming: PublicSession[]
  replays: PublicSession[]
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.upcomingHeading}</h2>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-kinnso-ink/70">{t.emptyUpcoming}</p>
        ) : (
          <SessionGrid locale={locale} sessions={upcoming} />
        )}
      </SectionShell>

      {replays.length > 0 ? (
        <SectionShell className="k2-hairline">
          <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.replaysHeading}</h2>
          <SessionGrid locale={locale} sessions={replays} />
        </SectionShell>
      ) : null}
    </div>
  )
}

export default SessionsListingView
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.sessions-listing.host.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\[locale\]/sessions/page.tsx apps/web/components/kinnso/pages/SessionsListingView.tsx apps/web/tests/kinnso.sessions-listing.host.test.tsx apps/web/lib/seo/routes.ts
git rm apps/web/tests/sessions.host.test.tsx
git commit -m "feat(web): /sessions real listing page, joins MARKETING_PATHS"
```

---

### Task 13: `/sessions/[slug]` detail page — embed, replay, RSVP, Event JSON-LD

**Files:**
- Create: `apps/web/app/[locale]/sessions/[slug]/page.tsx`
- Create: `apps/web/components/kinnso/pages/SessionDetailView.tsx`
- Modify: `apps/web/lib/seo/metadata.ts` (add `buildSessionMetadata`)
- Modify: `apps/web/app/sitemap.ts` (feed in `getSessionsForSitemap`)
- Test: `apps/web/tests/kinnso.sessions-detail.host.test.tsx`

- [ ] **Step 1: Read `apps/web/app/[locale]/experiences/[slug]/page.tsx` first** (the exact detail-page shape being mirrored: `generateStaticParams` returns `[]`, `notFound()` on missing rows, `auth.getUser()` makes the page request-dynamic).

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/kinnso.sessions-detail.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getSessionBySlugMock, getUserMock, rsvpMock } = vi.hoisted(() => ({
  getSessionBySlugMock: vi.fn(async () => null),
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  rsvpMock: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/sessions/public-queries', () => ({ getSessionBySlug: getSessionBySlugMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/lib/sessions/rsvp-actions', () => ({ rsvpToSessionAction: rsvpMock }))

import SessionDetailPage from '@/app/[locale]/sessions/[slug]/page'
import en from '@/lib/i18n/messages/en'

const liveSession = {
  id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
  type: 'ask_a_creator' as const, startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
  embedUrl: 'https://youtu.be/abc123', replayUrl: null, destinationTags: ['Tokyo'],
  status: 'scheduled' as const, host: { handle: 'sora', displayName: 'Sora' },
}

describe('/[locale]/sessions/[slug] detail host', () => {
  it('404s when the session does not exist', async () => {
    await expect(
      SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the embed iframe for a scheduled session with an embed_url', async () => {
    getSessionBySlugMock.mockResolvedValueOnce(liveSession)
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('src')).toContain('youtube-nocookie.com/embed/abc123')
  })

  it('renders a replay iframe for an ended session with a replay_url instead of the live embed', async () => {
    getSessionBySlugMock.mockResolvedValueOnce({
      ...liveSession, status: 'ended', embedUrl: null, replayUrl: 'https://youtu.be/xyz789',
    })
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    expect(document.querySelector('iframe')?.getAttribute('src')).toContain('youtube-nocookie.com/embed/xyz789')
  })

  it('prefills the RSVP email input for a signed-in visitor', async () => {
    getSessionBySlugMock.mockResolvedValueOnce(liveSession)
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'traveller@example.com' } } })
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    expect(screen.getByLabelText(en.sessions.rsvpEmailLabel)).toHaveValue('traveller@example.com')
  })

  it('submits the RSVP form and shows a confirmation', async () => {
    getSessionBySlugMock.mockResolvedValueOnce(liveSession)
    const ui = await SessionDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo-ramen-ama' }) })
    render(ui)
    fireEvent.change(screen.getByLabelText(en.sessions.rsvpEmailLabel), { target: { value: 'me@example.com' } })
    fireEvent.click(screen.getByText(en.sessions.rsvpSubmit))
    await screen.findByText(en.sessions.rsvpConfirmed)
    expect(rsvpMock).toHaveBeenCalledWith('s1', 'me@example.com', '')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.sessions-detail.host.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Add to `apps/web/lib/seo/metadata.ts`:

```typescript
export function buildSessionMetadata(i: { slug: string; locale: Locale; title: string; description: string }): Metadata {
  const { canonical, languages } = hreflangFor((l) => abs(l, `/sessions/${i.slug}`), i.locale, LOCALES)
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'website', url: canonical, title: i.title, description: i.description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale],
    },
    twitter: { card: 'summary_large_image', title: i.title, description: i.description },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}
```

In `apps/web/app/sitemap.ts`: import `getSessionsForSitemap` from `@/lib/sessions/public-queries`, add it to the `Promise.all` destructure in `buildAllSitemapEntries`, and append a loop matching the experiences one:

```typescript
for (const s of sessions) {
  const lastModified = s.lastmod ? new Date(s.lastmod) : undefined
  for (const l of LOCALES) {
    out.push({ url: `${SITE_URL}/${l}/sessions/${s.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
  }
}
```

```typescript
// apps/web/app/[locale]/sessions/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getSessionBySlug } from '@/lib/sessions/public-queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildSessionMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, sessionEventJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { SessionDetailView } from '@/components/kinnso/pages/SessionDetailView'

export function generateStaticParams() {
  return [] // DB-only; resolve on demand, same choice as /experiences/[slug]
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const session = await getSessionBySlug(slug)
  if (!session) return { title: 'Session not found', robots: { index: false, follow: false } }
  return buildSessionMetadata({ slug, locale: locale as Locale, title: session.title, description: session.description })
}

export default async function SessionDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const session = await getSessionBySlug(slug)
  if (!session) notFound()

  const supabase = await createSupabaseServerClient()
  // auth.getUser() makes this page request-dynamic — needed so the RSVP form can
  // prefill a signed-in visitor's email (same trade-off the experiences page and
  // the agent page already accept).
  const { data: { user } } = await supabase.auth.getUser()

  const canonical = `${SITE_URL}/${locale}/sessions/${slug}`
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.sessions.title, url: `${SITE_URL}/${locale}/sessions` },
      { name: session.title, url: canonical },
    ]),
    sessionEventJsonLd({
      name: session.title, description: session.description, url: canonical,
      startDate: session.startsAt, status: session.status,
      embedUrl: session.embedUrl ?? session.replayUrl,
      hostName: session.host?.displayName ?? null,
    }),
  ]

  return (
    <>
      <JsonLd data={ld} />
      <SessionDetailView locale={locale as Locale} t={messages.sessions} session={session} viewerEmail={user?.email ?? null} />
    </>
  )
}
```

```typescript
// apps/web/components/kinnso/pages/SessionDetailView.tsx
'use client'
import { useState } from 'react'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { rsvpToSessionAction } from '@/lib/sessions/rsvp-actions'
import { parseSessionEmbedUrl } from '@/lib/sessions/embed'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

function EmbedFrame({ url, title }: { url: string; title: string }) {
  const parsed = parseSessionEmbedUrl(url)
  if (!parsed) return null
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        src={parsed.embedUrl}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

export function SessionDetailView({
  locale, t, session, viewerEmail,
}: {
  locale: Locale
  t: Messages['sessions']
  session: PublicSession
  viewerEmail: string | null
}) {
  const [email, setEmail] = useState(viewerEmail ?? '')
  const [hp, setHp] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' })

  const showLiveEmbed = (session.status === 'scheduled' || session.status === 'live') && session.embedUrl
  const showReplay = session.status === 'ended' && session.replayUrl

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    const result = await rsvpToSessionAction(session.id, email, hp)
    setStatus(result.ok ? 'done' : 'error')
  }

  const typeLabel: Record<string, string> = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }

  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell>
        <Eyebrow>{typeLabel[session.type]}</Eyebrow>
        <h1 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{session.title}</h1>
        <p className="mt-2 text-kinnso-ink/70">{dateTimeFmt.format(new Date(session.startsAt))}</p>
        {session.host ? <p className="mt-1 text-sm text-kinnso-ink/70">@{session.host.handle}</p> : null}
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{session.description}</p>

        {showLiveEmbed ? <div className="mt-8"><EmbedFrame url={session.embedUrl as string} title={session.title} /></div> : null}
        {showReplay ? <div className="mt-8"><EmbedFrame url={session.replayUrl as string} title={session.title} /></div> : null}

        <div className="mt-10 max-w-md">
          {status === 'done' ? (
            <p className="font-semibold text-kinnso-ink">{t.rsvpConfirmed}</p>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-3">
              <label className="block text-sm font-semibold text-kinnso-ink">
                {t.rsvpEmailLabel}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="k2-input mt-1 w-full"
                />
              </label>
              {/* Honeypot: hidden from sighted users, off-screen instead of display:none so
                  simple bots that skip CSS-hidden fields still fill it in. */}
              <input
                type="text"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="absolute -left-[9999px]"
                aria-hidden="true"
              />
              <button type="submit" disabled={status === 'submitting'} className="k2-btn-primary">
                {t.rsvpSubmit}
              </button>
              {status === 'error' ? <p className="text-sm text-red-600">{t.rsvpError}</p> : null}
            </form>
          )}
        </div>
      </SectionShell>
    </div>
  )
}

export default SessionDetailView
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.sessions-detail.host.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\[locale\]/sessions/\[slug\]/page.tsx apps/web/components/kinnso/pages/SessionDetailView.tsx apps/web/lib/seo/metadata.ts apps/web/app/sitemap.ts apps/web/tests/kinnso.sessions-detail.host.test.tsx
git commit -m "feat(web): /sessions/[slug] detail page — embed, replay, RSVP, Event JSON-LD"
```

---

### Task 14: Homepage — `getUpcomingSessions()` real query, cards become links

**Files:**
- Modify: `apps/web/lib/home/queries.ts:79-95` (the `UpcomingSession` type + `getUpcomingSessions` stub)
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx:162-180` (Section 7 — add the link + slug)
- Test: extend `apps/web/tests/home.queries.test.ts` and `apps/web/tests/kinnso.HomeView.test.tsx`

**D-R5-8**: `UpcomingSession` gains `slug` but keeps `id`/`title`/`hostHandle`/`startsAt` — the R1B "HomeView will not change shape" promise holds as closely as possible while fixing the one real gap (cards were dead-end, non-clickable).

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe('getUpcomingSessions (R5 stub)', ...)` block in `apps/web/tests/home.queries.test.ts` (it tests the now-retired stub behavior) with:

```typescript
describe('getUpcomingSessions (R5)', () => {
  it('queries community_sessions for scheduled+live rows, joins host handle, and returns the UpcomingSession contract including slug', async () => {
    const sessionRow = { id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', starts_at: '2027-01-15T18:00:00.000Z', host_creator_id: 'creator-1' }
    const limit = vi.fn(async () => ({ data: [sessionRow], error: null }))
    const order = vi.fn(() => ({ limit }))
    const inStatus = vi.fn(() => ({ order }))
    const selectSessions = vi.fn(() => ({ in: inStatus }))

    const inIds = vi.fn(async () => ({ data: [{ id: 'creator-1', handle: 'sora' }], error: null }))
    const selectCreators = vi.fn(() => ({ in: inIds }))

    publicClientMock.mockReturnValue({
      from: vi.fn((table: string) => (table === 'community_sessions' ? { select: selectSessions } : { select: selectCreators })),
    })

    const result = await getUpcomingSessions()
    expect(inStatus).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    expect(order).toHaveBeenCalledWith('starts_at', { ascending: true })
    expect(limit).toHaveBeenCalledWith(3)
    expect(inIds).toHaveBeenCalledWith('id', ['creator-1'])
    expect(result).toEqual([{ id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', hostHandle: 'sora', startsAt: '2027-01-15T18:00:00.000Z' }])
  })

  it('drops a session whose host is not yet publicly readable rather than showing a broken handle', async () => {
    const sessionRow = { id: 's1', slug: 'x', title: 'X', starts_at: '2027-01-01T00:00:00.000Z', host_creator_id: 'creator-1' }
    const limit = vi.fn(async () => ({ data: [sessionRow], error: null }))
    publicClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'community_sessions'
          ? { select: () => ({ in: () => ({ order: () => ({ limit }) }) }) }
          : { select: () => ({ in: async () => ({ data: [], error: null }) }) },
      ),
    })
    expect(await getUpcomingSessions()).toEqual([])
  })

  it('degrades to [] on any query error, same reads-never-crash stance as getPublishedGuides', async () => {
    publicClientMock.mockReturnValue({
      from: vi.fn(() => ({ select: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) })),
    })
    expect(await getUpcomingSessions()).toEqual([])
  })
})
```

Add to `apps/web/tests/kinnso.HomeView.test.tsx`: read the file first, add `slug: 'tokyo-briefing'` to the existing session fixture (the one currently shaped `{id:'s1', title:'Tokyo briefing', hostHandle:'sora', startsAt:'2026-08-01T10:00:00Z'}`), and add this case in the same describe block that already covers the Sessions band:

```typescript
it('links each Sessions band card to its detail page', () => {
  render(<HomeView locale="en" t={t} guides={[]} stats={null} testimonials={[]} articles={[]} sessions={[
    { id: 's1', slug: 'tokyo-briefing', title: 'Tokyo briefing', hostHandle: 'sora', startsAt: '2026-08-01T10:00:00Z' },
  ]} />)
  expect(screen.getByRole('link', { name: /Tokyo briefing/ }).getAttribute('href')).toBe('/en/sessions/tokyo-briefing')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/home.queries.test.ts tests/kinnso.HomeView.test.tsx`
Expected: FAIL — `getUpcomingSessions` still returns `[]` unconditionally; `slug` is missing from the type and the fixture; cards are not links.

- [ ] **Step 3: Implement**

Replace lines 79-95 of `apps/web/lib/home/queries.ts`:

```typescript
export interface UpcomingSession {
  id: string
  slug: string
  title: string
  hostHandle: string
  startsAt: string // ISO timestamp
}

/**
 * Upcoming (scheduled or live) sessions for the homepage band, oldest-first, capped
 * to 3. Degrades to [] on any failure (same reads-never-crash stance as
 * getPublishedGuides) — a query error hides the band, it never crashes the
 * homepage. Host attribution is a second query against `creators` (same no-embed
 * two-query shape as lib/sessions/public-queries.ts); a session whose host isn't
 * publicly readable yet is simply dropped from this list rather than shown with a
 * broken handle.
 */
export async function getUpcomingSessions(): Promise<UpcomingSession[]> {
  try {
    const supabase = createSupabasePublicClient()
    const { data, error } = await supabase
      .from('community_sessions')
      .select('id, slug, title, starts_at, host_creator_id')
      .in('status', ['scheduled', 'live'])
      .order('starts_at', { ascending: true })
      .limit(3)
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) return []

    const ids = [...new Set(rows.map((r) => r.host_creator_id as string))]
    const { data: creators, error: creatorsError } = await supabase.from('creators').select('id, handle').in('id', ids)
    if (creatorsError) throw creatorsError
    const handleById = new Map((creators ?? []).map((c) => [c.id as string, c.handle as string]))

    return rows
      .filter((r) => handleById.has(r.host_creator_id as string))
      .map((r) => ({
        id: r.id as string,
        slug: r.slug as string,
        title: r.title as string,
        hostHandle: handleById.get(r.host_creator_id as string) as string,
        startsAt: r.starts_at as string,
      }))
  } catch {
    return []
  }
}
```

In `apps/web/components/kinnso/pages/HomeView.tsx`, wrap each session card in a `Link` (`Link` is already imported at the top of the file):

```typescript
{sessions.map((s) => (
  <li key={s.id}>
    <Link href={p(`/sessions/${s.slug}`)} className="k2-card block p-5 transition hover:border-kinnso-orangeDark">
      <p className="text-sm text-kinnso-ink/70">{dateTimeFmt.format(new Date(s.startsAt))}</p>
      <h3 className="mt-2 text-lg font-semibold text-kinnso-ink">{s.title}</h3>
      <p className="mt-1 text-sm text-kinnso-ink/70">@{s.hostHandle}</p>
    </Link>
  </li>
))}
```

(This replaces the existing `<li className="k2-card p-5">...</li>` block at lines 172-176 — move the `p-5`/border styling onto the `Link` since it's now the clickable surface.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/home.queries.test.ts tests/kinnso.HomeView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/home/queries.ts apps/web/components/kinnso/pages/HomeView.tsx apps/web/tests/home.queries.test.ts apps/web/tests/kinnso.HomeView.test.tsx
git commit -m "feat(web): real getUpcomingSessions query, homepage session cards link out"
```

---

### Task 15: `platform_stats()` consumer — `PlatformStats` type + `StatsBar` display

**Files:**
- Modify: `apps/web/lib/home/queries.ts` (the `PlatformStats` interface, `STAT_THRESHOLDS`, `getPlatformStats` mapping)
- Modify: `apps/web/components/kinnso/home/StatsBar.tsx`
- Test: extend `apps/web/tests/home.queries.test.ts` and the `StatsBar` test file (find it — likely `apps/web/tests/kinnso.StatsBar.test.tsx` or covered inline in `kinnso.HomeView.test.tsx`; read to confirm before editing)

- [ ] **Step 1: Write the failing tests**

Extend the existing `getPlatformStats` describe block in `apps/web/tests/home.queries.test.ts`:

```typescript
it('maps upcoming_sessions alongside the existing stats', async () => {
  publicClientMock.mockReturnValue({
    rpc: vi.fn(async () => ({
      data: [{ active_creators: 12, published_guides: 48, destinations: 9, completed_bookings: 4, upcoming_sessions: 6 }],
      error: null,
    })),
  })
  expect(await getPlatformStats()).toEqual({
    activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4, upcomingSessions: 6,
  })
})
```

Update the existing thresholds assertion in the same file:

```typescript
it('exports the honesty thresholds as constants', () => {
  expect(STAT_THRESHOLDS).toEqual({
    activeCreators: 5, publishedGuides: 10, destinations: 3, completedBookings: 3, upcomingSessions: 1,
  })
  expect(MIN_VISIBLE_STATS).toBe(2)
})
```

Add a `StatsBar` test (find the existing test file for it first — extend rather than duplicate):

```typescript
it('shows the upcoming-sessions stat once it meets its threshold (1)', () => {
  render(<StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4, upcomingSessions: 1 }} />)
  expect(screen.getByText(en.home.statUpcomingSessions)).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/home.queries.test.ts` (and the StatsBar test file once located)
Expected: FAIL — `upcomingSessions` missing from the type/mapping/thresholds/display.

- [ ] **Step 3: Implement**

In `apps/web/lib/home/queries.ts`, update the `PlatformStats` interface, `STAT_THRESHOLDS`, and the mapping in `getPlatformStats`:

```typescript
export interface PlatformStats {
  activeCreators: number
  publishedGuides: number
  destinations: number
  completedBookings: number
  upcomingSessions: number
}

export const STAT_THRESHOLDS = {
  activeCreators: 5,
  publishedGuides: 10,
  destinations: 3,
  completedBookings: 3,
  upcomingSessions: 1, // any real upcoming session is honest content worth surfacing
} as const
```

```typescript
export async function getPlatformStats(): Promise<PlatformStats | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase.rpc('platform_stats')
  if (error) return null
  const row = (data ?? [])[0]
  if (!row) return null
  return {
    activeCreators: Number(row.active_creators),
    publishedGuides: Number(row.published_guides),
    destinations: Number(row.destinations),
    completedBookings: Number(row.completed_bookings),
    upcomingSessions: Number(row.upcoming_sessions),
  }
}
```

In `apps/web/components/kinnso/home/StatsBar.tsx`, add the new entry to the `entries` array:

```typescript
{ key: 'sessions', value: stats.upcomingSessions, min: STAT_THRESHOLDS.upcomingSessions, label: t.statUpcomingSessions },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/home.queries.test.ts` (and the StatsBar test file)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/home/queries.ts apps/web/components/kinnso/home/StatsBar.tsx apps/web/tests/home.queries.test.ts
git commit -m "feat(web): upcoming_sessions joins the homepage social-proof bar"
```

---

### Task 16: `/studio/sessions` — creator Studio scheduler

**Files:**
- Create: `apps/web/app/[locale]/studio/sessions/page.tsx` (list)
- Create: `apps/web/app/[locale]/studio/sessions/new/page.tsx`
- Create: `apps/web/app/[locale]/studio/sessions/[id]/edit/page.tsx`
- Create: `apps/web/components/kinnso/pages/MySessionsView.tsx` (list)
- Create: `apps/web/components/kinnso/pages/SessionForm.tsx` (shared create/edit form, client)
- Modify: `apps/web/components/kinnso/StudioQuickLinks.tsx` (add a sessions tile)
- Test: `apps/web/tests/studio.sessions.host.test.tsx`

- [ ] **Step 1: Read `apps/web/app/[locale]/studio/guides/page.tsx` and `apps/web/components/kinnso/pages/MyGuidesView.tsx` first** — the exact creator-owned list-page shape being mirrored (inline `getUser()` + `redirect` gate, direct scoped query, hand rows to a view component).

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/studio.sessions.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))

const { getUserMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  fromMock: vi.fn(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, from: fromMock }) }))

import StudioSessionsPage from '@/app/[locale]/studio/sessions/page'

beforeEach(() => { getUserMock.mockResolvedValue({ data: { user: null } }) })

describe('/studio/sessions host', () => {
  it('redirects anon to sign-in', async () => {
    await expect(StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('scopes the query to the signed-in creator\'s own sessions', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'creator-1' } } })
    const eqMock = vi.fn(() => ({ order: async () => ({ data: [], error: null }) }))
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqMock }) })
    await StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(eqMock).toHaveBeenCalledWith('host_creator_id', 'creator-1')
  })

  it('renders the empty state for a creator with no sessions yet', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'creator-1' } } })
    const ui = await StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /New session/ })).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/studio.sessions.host.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// apps/web/app/[locale]/studio/sessions/page.tsx
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MySessionsView } from '@/components/kinnso/pages/MySessionsView'
import type { SessionListItem } from '@/lib/sessions/types'

export default async function StudioSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  const { data } = await supabase
    .from('community_sessions')
    .select('id, slug, title, type, starts_at, status, embed_url')
    .eq('host_creator_id', user.id)
    .order('starts_at', { ascending: false })

  const sessions: SessionListItem[] = (data ?? []).map((s) => ({
    id: s.id, slug: s.slug, title: s.title, type: s.type,
    startsAt: s.starts_at, status: s.status, embedUrl: s.embed_url,
  }))

  return <MySessionsView locale={locale as Locale} t={messages.studioSessions} sessions={sessions} />
}
```

```typescript
// apps/web/lib/sessions/types.ts — append (do not remove existing exports)
export type SessionListItem = {
  id: string; slug: string; title: string; type: SessionType
  startsAt: string; status: SessionStatus; embedUrl: string | null
}
```

```typescript
// apps/web/components/kinnso/pages/MySessionsView.tsx
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { SessionListItem } from '@/lib/sessions/types'
import { TicketCard } from '@/components/kinnso/MarketPassport'

const statusLabel = (t: Messages['studioSessions'], status: SessionListItem['status']) => ({
  scheduled: t.statusScheduled, live: t.statusLive, ended: t.statusEnded, cancelled: t.statusCancelled,
}[status])

export function MySessionsView({ locale, t, sessions }: { locale: Locale; t: Messages['studioSessions']; sessions: SessionListItem[] }) {
  const p = (path: string) => `/${locale}${path}`
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <main>
      <section className="k-container py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.listPill}</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.listHeading}</h1>
            <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.listSubtitle}</p>
          </div>
          <Link href={p('/studio/sessions/new')} className="k-btn-primary inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> {t.newButton}
          </Link>
        </div>

        {sessions.length === 0 ? (
          <div className="mt-10 rounded-lg bg-kinnso-cream2 p-8 text-center">
            <h2 className="text-xl font-bold text-kinnso-ink">{t.emptyTitle}</h2>
            <p className="mt-2 text-kinnso-muted">{t.emptyBody}</p>
          </div>
        ) : (
          <ul className="mt-10 grid gap-4">
            {sessions.map((s) => (
              <TicketCard key={s.id} as="li" className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-kinnso-ink">{s.title}</p>
                  <p className="text-sm text-kinnso-muted">{dateTimeFmt.format(new Date(s.startsAt))}</p>
                </div>
                <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{statusLabel(t, s.status)}</span>
                <Link href={p(`/studio/sessions/${s.id}/edit`)} className="k-btn-ghost text-sm">{t.edit}</Link>
              </TicketCard>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default MySessionsView
```

```typescript
// apps/web/components/kinnso/pages/SessionForm.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SESSION_TYPES, type SessionInput, type SessionType } from '@/lib/sessions/types'
import type { ValidationErrors } from '@/lib/sessions/validation'
import type { Messages } from '@/lib/i18n/messages/en'

type SaveResult = { ok: true; id: string; slug?: string } | { ok: false; errors: ValidationErrors }

/** Shared by the Studio (creator) and ops create/edit pages — the caller supplies
 *  which server action to call and where to navigate on success. */
export function SessionForm({
  t, typeLabel, initial, onSave, onDoneHref,
}: {
  t: Messages['studioSessions']
  typeLabel: Record<SessionType, string>
  initial: Partial<SessionInput> | null
  onSave: (input: SessionInput) => Promise<SaveResult>
  onDoneHref: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [type, setType] = useState<SessionType>((initial?.type as SessionType) ?? 'ask_a_creator')
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? '')
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes ?? '')
  const [embedUrl, setEmbedUrl] = useState(initial?.embedUrl ?? '')
  const [replayUrl, setReplayUrl] = useState(initial?.replayUrl ?? '')
  const [destinationTags, setDestinationTags] = useState(initial?.destinationTags ?? '')
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const result = await onSave({ title, description, type, startsAt, durationMinutes, embedUrl, replayUrl, destinationTags })
      if (result.ok) router.push(onDoneHref)
      else setErrors(result.errors)
    } finally {
      setSaving(false)
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-kinnso-edge bg-white px-3 py-2 font-normal'
  const err = (key: string) => (errors[key] ? <span className="mt-1 block text-sm font-normal text-red-600">{errors[key][0]}</span> : null)

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.titleLabel}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        {err('title')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.descriptionLabel}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={field} />
        {err('description')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.typeLabel}
        <select value={type} onChange={(e) => setType(e.target.value as SessionType)} className={field}>
          {SESSION_TYPES.map((st) => <option key={st} value={st}>{typeLabel[st]}</option>)}
        </select>
        {err('type')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.startsAtLabel}
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} />
        {err('startsAt')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.durationLabel}
        <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={field} />
        {err('durationMinutes')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.embedUrlLabel}
        <input value={embedUrl} onChange={(e) => setEmbedUrl(e.target.value)} placeholder={t.embedUrlPlaceholder} className={field} />
        {err('embedUrl')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.replayUrlLabel}
        <input value={replayUrl} onChange={(e) => setReplayUrl(e.target.value)} placeholder={t.replayUrlPlaceholder} className={field} />
        {err('replayUrl')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.destinationTagsLabel}
        <input value={destinationTags} onChange={(e) => setDestinationTags(e.target.value)} placeholder={t.destinationTagsPlaceholder} className={field} />
      </label>
      {errors.form ? <p className="text-sm text-red-600">{errors.form[0]}</p> : null}
      <button type="submit" disabled={saving} className="k-btn-primary">{t.saveButton}</button>
    </form>
  )
}

export default SessionForm
```

```typescript
// apps/web/app/[locale]/studio/sessions/new/page.tsx
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSessionAction } from '@/lib/sessions/studio-actions'
import { SESSION_TYPES } from '@/lib/sessions/types'
import { SessionForm } from '@/components/kinnso/pages/SessionForm'

export default async function NewStudioSessionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  const t = messages.studioSessions
  const typeLabel = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }
  return (
    <main className="k-container py-12">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.formNewHeading}</h1>
      <div className="mt-6 max-w-2xl">
        <SessionForm
          t={t}
          typeLabel={typeLabel}
          initial={null}
          onSave={(input) => createSessionAction(input, { locale: locale as Locale })}
          onDoneHref={`/${locale}/studio/sessions`}
        />
      </div>
    </main>
  )
}
```

```typescript
// apps/web/app/[locale]/studio/sessions/[id]/edit/page.tsx
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { updateSessionAction } from '@/lib/sessions/studio-actions'
import { SessionForm } from '@/components/kinnso/pages/SessionForm'

export default async function EditStudioSessionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  const { data: session } = await supabase
    .from('community_sessions')
    .select('title, description, type, starts_at, duration_minutes, embed_url, replay_url, destination_tags')
    .eq('id', id)
    .eq('host_creator_id', user.id)
    .maybeSingle()
  if (!session) notFound()

  const t = messages.studioSessions
  const typeLabel = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }
  return (
    <main className="k-container py-12">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.formEditHeading}</h1>
      <div className="mt-6 max-w-2xl">
        <SessionForm
          t={t}
          typeLabel={typeLabel}
          initial={{
            title: session.title, description: session.description, type: session.type,
            startsAt: session.starts_at, durationMinutes: String(session.duration_minutes),
            embedUrl: session.embed_url ?? '', replayUrl: session.replay_url ?? '',
            destinationTags: (session.destination_tags ?? []).join(', '),
          }}
          onSave={(input) => updateSessionAction(id, input, { locale: locale as Locale })}
          onDoneHref={`/${locale}/studio/sessions`}
        />
      </div>
    </main>
  )
}
```

In `apps/web/components/kinnso/StudioQuickLinks.tsx`, add one entry to the `tools` array (needs a new icon import, e.g. `Video` from `lucide-react`):

```typescript
{ href: '/studio/sessions', title: t.sessionsTitle, desc: t.sessionsDesc, live: true, icon: <Video aria-hidden="true" className="h-5 w-5" /> },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/studio.sessions.host.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\[locale\]/studio/sessions apps/web/components/kinnso/pages/MySessionsView.tsx apps/web/components/kinnso/pages/SessionForm.tsx apps/web/components/kinnso/StudioQuickLinks.tsx apps/web/lib/sessions/types.ts apps/web/tests/studio.sessions.host.test.tsx
git commit -m "feat(web): /studio/sessions creator scheduler (list, new, edit)"
```

---

### Task 17: `/admin/sessions` — ops console (host picker, status controls, RSVP read)

**Files:**
- Modify: `apps/web/components/kinnso/pages/SessionForm.tsx` (Task 16 — add an optional host picker section)
- Modify: `apps/web/lib/admin/sessions-actions.ts` (Task 9 — add `listSessionRsvpsForAdminAction`)
- Create: `apps/web/components/kinnso/admin/AdminSessionsView.tsx`
- Create: `apps/web/app/[locale]/admin/sessions/page.tsx`
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx` (add the nav entry)
- Test: `apps/web/tests/admin.sessions.host.test.tsx`

- [ ] **Step 1: Read `apps/web/app/[locale]/admin/testimonials/page.tsx` and `AdminTestimonialsView.tsx` again** (already read in full during plan-writing — the exact list/form-toggle shape and gate pattern this mirrors).

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/admin.sessions.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { roleMock, getUserMock, listSessionsMock, listCreatorsMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
  listSessionsMock: vi.fn(async () => []),
  listCreatorsMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/sessions-queries', () => ({ listAllSessions: listSessionsMock, listCreatorsForHostPicker: listCreatorsMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/components/kinnso/admin/AdminSessionsView', () => ({ AdminSessionsView: () => <div data-testid="admin-sessions-view" /> }))

import AdminSessionsPage from '@/app/[locale]/admin/sessions/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops')
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
})

describe('/admin/sessions host', () => {
  it('notFounds for a non-ops viewer', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminSessionsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects anon to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(AdminSessionsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('renders the sessions view for ops, fetching both sessions and the host-picker list', async () => {
    const ui = await AdminSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(ui).toBeTruthy()
    expect(listSessionsMock).toHaveBeenCalled()
    expect(listCreatorsMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.sessions.host.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Add an optional host-picker section to `SessionForm` (`apps/web/components/kinnso/pages/SessionForm.tsx`) — add this prop to the component's signature and render it right after the title field when present:

```typescript
  hostPicker,
}: {
  // ...existing props from Task 16...
  hostPicker?: {
    creators: { id: string; handle: string | null; displayName: string | null }[]
    value: string
    onChange: (id: string) => void
  }
}) {
```

```typescript
{hostPicker ? (
  <label className="block text-sm font-bold text-kinnso-ink">
    {t.hostPickerLabel}
    <select value={hostPicker.value} onChange={(e) => hostPicker.onChange(e.target.value)} className={field}>
      <option value="">{t.hostPickerPlaceholder}</option>
      {hostPicker.creators.map((c) => (
        <option key={c.id} value={c.id}>{c.displayName ?? c.handle ?? c.id}</option>
      ))}
    </select>
    {err('host')}
  </label>
) : null}
```

Add to `apps/web/lib/admin/sessions-actions.ts`:

```typescript
import { listSessionRsvps } from '@/lib/admin/sessions-queries'
// ...
export async function listSessionRsvpsForAdminAction(sessionId: string) {
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return { ok: false as const, rsvps: [] }
  const rsvps = await listSessionRsvps(supabase, sessionId)
  return { ok: true as const, rsvps }
}
```

```typescript
// apps/web/app/[locale]/admin/sessions/page.tsx
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { listAllSessions, listCreatorsForHostPicker } from '@/lib/admin/sessions-queries'
import {
  adminCreateSessionAction, adminUpdateSessionAction, adminSetSessionStatusAction,
  adminDeleteSessionAction, listSessionRsvpsForAdminAction,
} from '@/lib/admin/sessions-actions'
import { AdminSessionsView } from '@/components/kinnso/admin/AdminSessionsView'

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'ops') notFound()

  const [sessions, creators] = await Promise.all([listAllSessions(supabase), listCreatorsForHostPicker(supabase)])

  const loc = locale as Locale
  return (
    <AdminSessionsView
      t={messages.sessionsAdmin}
      sessions={sessions}
      creators={creators}
      onCreate={(hostCreatorId, input) => adminCreateSessionAction(hostCreatorId, input, { locale: loc })}
      onUpdate={(id, input) => adminUpdateSessionAction(id, input, { locale: loc })}
      onSetStatus={(id, status) => adminSetSessionStatusAction(id, status, { locale: loc })}
      onDelete={(id) => adminDeleteSessionAction(id, { locale: loc })}
      onListRsvps={(id) => listSessionRsvpsForAdminAction(id)}
    />
  )
}
```

```typescript
// apps/web/components/kinnso/admin/AdminSessionsView.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { SessionForm } from '@/components/kinnso/pages/SessionForm'
import type { ActionResult } from '@/lib/admin/result'
import type { AdminSession, SessionRsvp } from '@/lib/admin/sessions-queries'
import { SESSION_TYPES, type SessionInput, type SessionType } from '@/lib/sessions/types'
import { canGoLive } from '@/lib/sessions/validation'
import type { Messages } from '@/lib/i18n/messages/en'

type MutateResult = ActionResult<{ id: string }>
type T = Messages['sessionsAdmin']

export function AdminSessionsView({
  t, sessions, creators, onCreate, onUpdate, onSetStatus, onDelete, onListRsvps,
}: {
  t: T
  sessions: AdminSession[]
  creators: { id: string; handle: string | null; displayName: string | null }[]
  onCreate: (hostCreatorId: string, input: SessionInput) => Promise<ActionResult<{ id: string; slug: string }>>
  onUpdate: (id: string, input: SessionInput) => Promise<MutateResult>
  onSetStatus: (id: string, status: 'live' | 'ended' | 'cancelled') => Promise<MutateResult>
  onDelete: (id: string) => Promise<MutateResult>
  onListRsvps: (id: string) => Promise<{ ok: boolean; rsvps: SessionRsvp[] }>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<AdminSession | 'new' | null>(null)
  const [hostId, setHostId] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [rsvpsBySession, setRsvpsBySession] = useState<Record<string, SessionRsvp[]>>({})

  const typeLabel: Record<SessionType, string> = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }
  const statusLabel: Record<AdminSession['status'], string> = {
    scheduled: t.statusScheduled, live: t.statusLive, ended: t.statusEnded, cancelled: t.statusCancelled,
  }

  async function mutate(id: string, run: () => Promise<MutateResult>, fallback: string) {
    setBusyId(id)
    setRowErrors((e) => ({ ...e, [id]: '' }))
    try {
      const res = await run()
      if (res.ok) router.refresh()
      else setRowErrors((e) => ({ ...e, [id]: res.errors.form?.[0] ?? fallback }))
    } catch {
      setRowErrors((e) => ({ ...e, [id]: fallback }))
    } finally {
      setBusyId(null)
    }
  }

  async function toggleRsvps(id: string) {
    if (rsvpsBySession[id]) {
      setRsvpsBySession((r) => { const next = { ...r }; delete next[id]; return next })
      return
    }
    const result = await onListRsvps(id)
    if (result.ok) setRsvpsBySession((r) => ({ ...r, [id]: result.rsvps }))
  }

  if (editing !== null) {
    const current = editing === 'new' ? null : editing
    return (
      <main>
        <h1 className="k-display">{current ? t.formEditTitle : t.formNewTitle}</h1>
        <div className="mt-6 max-w-2xl">
          <SessionForm
            t={t}
            typeLabel={typeLabel}
            initial={current ? {
              title: current.title, description: current.description, type: current.type,
              startsAt: current.starts_at, durationMinutes: String(current.duration_minutes),
              embedUrl: current.embed_url ?? '', replayUrl: current.replay_url ?? '',
              destinationTags: (current.destination_tags ?? []).join(', '),
            } : null}
            hostPicker={current ? undefined : { creators, value: hostId, onChange: setHostId }}
            onSave={(input) => (current ? onUpdate(current.id, input) : onCreate(hostId, input))}
            onDoneHref="."
          />
        </div>
        <button type="button" onClick={() => setEditing(null)} className="mt-4 text-sm font-bold text-kinnso-ink">
          {t.formCancel}
        </button>
      </main>
    )
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="k-display">{t.title}</h1>
          <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
        </div>
        <button onClick={() => { setHostId(''); setEditing('new') }} className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white">
          {t.newCta}
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="mt-8 text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-8 grid gap-4">
          {sessions.map((s) => (
            <TicketCard key={s.id} className="p-5">
              <p className="text-kinnso-ink">{s.title}</p>
              <p className="mt-1 text-sm text-kinnso-muted">
                {typeLabel[s.type as SessionType]} · {statusLabel[s.status as AdminSession['status']]} · {new Date(s.starts_at).toLocaleString()}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-bold">
                <button className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => setEditing(s)}>{t.actEdit}</button>
                {s.status === 'scheduled' && canGoLive({ embedUrl: s.embed_url }) ? (
                  <button disabled={busyId === s.id} className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => mutate(s.id, () => onSetStatus(s.id, 'live'), t.actGoLive)}>
                    {t.actGoLive}
                  </button>
                ) : null}
                {s.status === 'live' ? (
                  <button disabled={busyId === s.id} className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => mutate(s.id, () => onSetStatus(s.id, 'ended'), t.actEnd)}>
                    {t.actEnd}
                  </button>
                ) : null}
                {s.status !== 'ended' && s.status !== 'cancelled' ? (
                  <button disabled={busyId === s.id} className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => mutate(s.id, () => onSetStatus(s.id, 'cancelled'), t.actCancel)}>
                    {t.actCancel}
                  </button>
                ) : null}
                <button className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => toggleRsvps(s.id)}>{t.actViewRsvps}</button>
                <button
                  disabled={busyId === s.id}
                  className="text-kinnso-ink hover:text-kinnso-orange"
                  onClick={() => { if (window.confirm(t.deleteConfirm)) void mutate(s.id, () => onDelete(s.id), t.actDelete) }}
                >
                  {t.actDelete}
                </button>
              </div>
              {rowErrors[s.id] ? <p className="mt-2 text-sm text-red-600">{rowErrors[s.id]}</p> : null}
              {rsvpsBySession[s.id] ? (
                <ul className="mt-3 rounded-lg bg-kinnso-cream2 p-3 text-sm text-kinnso-ink">
                  {rsvpsBySession[s.id].length === 0
                    ? <li>{t.rsvpsEmpty}</li>
                    : rsvpsBySession[s.id].map((r) => <li key={r.id}>{r.email}</li>)}
                </ul>
              ) : null}
            </TicketCard>
          ))}
        </div>
      )}
    </main>
  )
}

export default AdminSessionsView
```

In `apps/web/components/kinnso/admin/AdminShell.tsx`, add one entry to the `nav` array:

```typescript
{ href: `/${locale}/admin/sessions`, label: t.navSessions },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.sessions.host.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/SessionForm.tsx apps/web/lib/admin/sessions-actions.ts apps/web/components/kinnso/admin/AdminSessionsView.tsx apps/web/app/\[locale\]/admin/sessions/page.tsx apps/web/components/kinnso/admin/AdminShell.tsx apps/web/tests/admin.sessions.host.test.tsx
git commit -m "feat(web): /admin/sessions ops console — host picker, status controls, RSVP read"
```

---

### Task 18: i18n — `sessions`/`studioSessions`/`sessionsAdmin` groups, `sessionsSoon` removed, ×7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
- Modify: `apps/web/lib/seo/dictionaries` group — add `seo.sessions` (used by Task 12/13's `generateMetadata`)
- Test: none new — `tests/i18n.locale-parity.test.ts` auto-registers new top-level groups; run it plus every host test touched by copy in this task.

**PD-R5-7**: `sessionsSoon` is now dead — its only consumer (the placeholder page) was deleted in Task 12. Removed from all 7 files, matching the R4 precedent of removing a dead i18n group once its last consumer is gone (R4 Task 13 caught the same class of leftover-copy mistake with `honestNote`/`exploreCta`/`articlesCta`; this plan doesn't repeat it).

- [ ] **Step 1: Update `en.ts`'s type declarations**

Remove the `sessionsSoon: { eyebrow: string; title: string; body: string; cta: string }` line (around line 726). Add `statUpcomingSessions: string` to the `home` group's type (next to `statCompletedBookings`, line 696). Add three new top-level groups:

```typescript
sessions: {
  eyebrow: string; title: string; body: string
  upcomingHeading: string; emptyUpcoming: string; replaysHeading: string
  rsvpEmailLabel: string; rsvpSubmit: string; rsvpConfirmed: string; rsvpError: string
  typeDestinationBriefing: string; typeAskACreator: string; typeMerchantSpotlight: string; typeNewCreatorIntro: string
}
studioSessions: {
  listPill: string; listHeading: string; listSubtitle: string
  newButton: string; emptyTitle: string; emptyBody: string
  statusScheduled: string; statusLive: string; statusEnded: string; statusCancelled: string
  edit: string
  formNewHeading: string; formEditHeading: string
  titleLabel: string; descriptionLabel: string; typeLabel: string
  startsAtLabel: string; durationLabel: string
  embedUrlLabel: string; embedUrlPlaceholder: string
  replayUrlLabel: string; replayUrlPlaceholder: string
  destinationTagsLabel: string; destinationTagsPlaceholder: string
  saveButton: string
  typeDestinationBriefing: string; typeAskACreator: string; typeMerchantSpotlight: string; typeNewCreatorIntro: string
}
sessionsAdmin: {
  title: string; subtitle: string; newCta: string; empty: string
  statusScheduled: string; statusLive: string; statusEnded: string; statusCancelled: string
  actEdit: string; actGoLive: string; actEnd: string; actCancel: string; actDelete: string; actViewRsvps: string
  deleteConfirm: string; rsvpsEmpty: string
  hostPickerLabel: string; hostPickerPlaceholder: string
  formNewTitle: string; formEditTitle: string; formCancel: string
  typeDestinationBriefing: string; typeAskACreator: string; typeMerchantSpotlight: string; typeNewCreatorIntro: string
}
```

Add `sessions: { title: string; description: string }` to the `seo` group's type declaration (next to the other page entries there, e.g. `agent`).

- [ ] **Step 2: Update `en.ts`'s values**

Remove the `sessionsSoon: { ... }` value block. Add `statUpcomingSessions: 'live sessions coming up',` next to `statCompletedBookings` in the `home` values block.

```typescript
sessions: {
  eyebrow: 'Community Sessions',
  title: 'Live briefings from creators on the ground.',
  body: 'Ask questions, get real answers, and watch replays from the creators behind our guides.',
  upcomingHeading: 'Upcoming',
  emptyUpcoming: 'No sessions scheduled right now — check back soon.',
  replaysHeading: 'Replays',
  rsvpEmailLabel: 'Your email',
  rsvpSubmit: 'RSVP',
  rsvpConfirmed: "You're on the list — we'll be in touch.",
  rsvpError: 'RSVP could not be saved — please try again.',
  typeDestinationBriefing: 'Destination briefing',
  typeAskACreator: 'Ask a creator',
  typeMerchantSpotlight: 'Merchant spotlight',
  typeNewCreatorIntro: 'New creator intro',
},
studioSessions: {
  listPill: 'Sessions', listHeading: 'Your sessions', listSubtitle: 'Schedule and manage your community sessions.',
  newButton: 'New session', emptyTitle: 'No sessions yet', emptyBody: 'Schedule your first session to start meeting your community live.',
  statusScheduled: 'Scheduled', statusLive: 'Live', statusEnded: 'Ended', statusCancelled: 'Cancelled',
  edit: 'Edit',
  formNewHeading: 'New session', formEditHeading: 'Edit session',
  titleLabel: 'Title', descriptionLabel: 'Description', typeLabel: 'Type',
  startsAtLabel: 'Starts at', durationLabel: 'Duration (minutes)',
  embedUrlLabel: 'Live embed URL (YouTube)', embedUrlPlaceholder: 'https://youtube.com/watch?v=...',
  replayUrlLabel: 'Replay URL (YouTube)', replayUrlPlaceholder: 'https://youtube.com/watch?v=...',
  destinationTagsLabel: 'Destinations (comma-separated)', destinationTagsPlaceholder: 'Tokyo, Japan',
  saveButton: 'Save',
  typeDestinationBriefing: 'Destination briefing', typeAskACreator: 'Ask a creator',
  typeMerchantSpotlight: 'Merchant spotlight', typeNewCreatorIntro: 'New creator intro',
},
sessionsAdmin: {
  title: 'Community Sessions', subtitle: 'Create, manage, and moderate sessions across all creators.',
  newCta: 'New session', empty: 'No sessions yet.',
  statusScheduled: 'Scheduled', statusLive: 'Live', statusEnded: 'Ended', statusCancelled: 'Cancelled',
  actEdit: 'Edit', actGoLive: 'Go live', actEnd: 'End', actCancel: 'Cancel', actDelete: 'Delete', actViewRsvps: 'View RSVPs',
  deleteConfirm: 'Delete this session? This cannot be undone.', rsvpsEmpty: 'No RSVPs yet.',
  hostPickerLabel: 'Host creator', hostPickerPlaceholder: 'Select a creator',
  formNewTitle: 'New session', formEditTitle: 'Edit session', formCancel: 'Cancel',
  typeDestinationBriefing: 'Destination briefing', typeAskACreator: 'Ask a creator',
  typeMerchantSpotlight: 'Merchant spotlight', typeNewCreatorIntro: 'New creator intro',
},
```

Add to the `seo` values block:

```typescript
sessions: { title: 'Community Sessions — KINNSO', description: 'Live briefings, Q&As, and replays from the creators behind our guides.' },
```

- [ ] **Step 3: Apply the equivalent change to the other 6 locale files**

For each of `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`: remove the `sessionsSoon` value block, add `statUpcomingSessions` to `home`, and add real, register-appropriate translations (read a few neighboring `studioGuides`/`testimonialsAdmin` strings in that file first to match tone) for the three new groups and `seo.sessions`. Do not leave English placeholder text in any non-English file.

- [ ] **Step 4: Run the parity test and every host test touched by this task's copy**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts tests/kinnso.sessions-listing.host.test.tsx tests/kinnso.sessions-detail.host.test.tsx tests/studio.sessions.host.test.tsx tests/admin.sessions.host.test.tsx tests/kinnso.HomeView.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): session i18n — sessions/studioSessions/sessionsAdmin groups, sessionsSoon removed, x7 locales"
```

---

### Task 19: Full-suite verification + apply migrations live + regenerate `@kinnso/db` types

**Files:** none new — verification only.

- [ ] **Step 1: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: all tests pass. Baseline going into this phase was 1430/1461 passing, 31 skipped (post-R4) — expect 1430+new tests, 0 new failures, same skips. **Note**: this suite is known to be flaky under heavy concurrent session load (generic 5000ms timeouts on unrelated tests, confirmed during R4) — if a run shows scattered failures, re-run the specific failing files in isolation before treating it as a regression.

- [ ] **Step 2: Typecheck + lint**

Run (from repo root): `pnpm typecheck && pnpm lint`
Expected: 0 errors in both. This phase's new tables/RPCs (`community_sessions`, `session_rsvps`, `rsvp_rate_limits`, `check_and_increment_rsvp_rate_limit`) mean `@kinnso/db`'s generated types won't reflect them until Step 4 — expect typecheck failures on any file referencing the new tables/RPCs by name against the **old** generated types until then. This is the same "known, temporary, plan-scheduled gap" pattern R3C's and R4's final verification tasks both hit.

- [ ] **Step 3: Apply all 3 of this phase's migrations to the live Supabase project**

**Ask the user for explicit confirmation before applying anything live** (same gate as every prior phase — this is a production database mutation). Once confirmed, apply via `cd supabase/migrations && supabase db query --linked -f <file>` from the worktree root, in order: `20260707100000_r5_community_sessions.sql`, `20260707110000_r5_platform_stats_upcoming_sessions.sql`, `20260707120000_r5_drop_agent_waitlist.sql`. **Do not use `supabase db push`** — this project's remote migration ledger tracks MCP-applied migrations under different version stamps than local filenames (see the `supabase-migration-ledger-drift-gotcha` memory from R4); `db query --linked -f` executes raw SQL directly, bypassing the ledger entirely, which is the proven-safe path.

After each migration, verify live via `supabase db query --linked "<sql>"`:
- Confirm `community_sessions`/`session_rsvps`/`rsvp_rate_limits` exist (`information_schema.tables`).
- Confirm `community_sessions_public_read`/`community_sessions_owner_all`/`community_sessions_ops_all` and `session_rsvps_insert`/`session_rsvps_ops_read` policies exist with the expected `using`/`with check` clauses (`pg_policy` + `pg_get_expr`).
- Confirm anon has zero direct privileges on `rsvp_rate_limits` (RPC-only access).
- Confirm `check_and_increment_rsvp_rate_limit` is `security definer` with anon/authenticated EXECUTE (`pg_proc` + `proacl`).
- Confirm `platform_stats()`'s new `RETURNS TABLE` shape live (`pg_get_functiondef`) and that anon/authenticated EXECUTE grants survived the `DROP FUNCTION` + recreate.
- Confirm `agent_waitlist` no longer exists.

Once all 3 are applied, immediately run `supabase migration repair --status applied --linked 20260707100000 20260707110000 20260707120000 --linked` (**ask the user to confirm this specific command separately** — it's a distinct live-DB mutation from applying the migrations themselves, per the process lesson recorded after R4: a prior session ran this kind of repair without a separate confirmation, which should not recur) so this phase's migrations are correctly tracked and a future `supabase migration list --linked` doesn't show them as "local only."

- [ ] **Step 4: Regenerate `@kinnso/db` types**

Run (from repo root): `pnpm --filter @kinnso/db gen`. Confirm the new tables/functions appear: `grep -n "community_sessions\|session_rsvps\|rsvp_rate_limits\|check_and_increment_rsvp_rate_limit" packages/db/types.ts`.

- [ ] **Step 5: Re-run typecheck + full suite to confirm the gap from Step 2 is now closed**

Run: `pnpm typecheck` (from repo root) then `cd apps/web && npx vitest run`
Expected: 0 typecheck errors, full suite green.

- [ ] **Step 6: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): regenerate @kinnso/db types after applying the R5 migrations"
```

(If Steps 1-2 turned up any other issue, fix it and commit separately, describing what the verification sweep caught — do not fold fixes into earlier task commits.)

---

### Task 20: Final holistic branch review

**Files:** none new — review only.

- [ ] **Step 1: Dispatch a fresh review** (no context from implementation) across the whole `feat/revision-r5` branch diff against `main` (this branch's real parent — R5 was cut fresh from `main` post-R4, unlike the R3/R4 stacked branches, so there is no intermediate parent to diff against). Explicitly check:
  - **Security**: `community_sessions_owner_all`'s policy is a direct `host_creator_id = auth.uid()` equality, genuinely matching `creators.id`'s actual shape (re-verify against the live `creators` table definition, not just the plan's assumption); `session_rsvps` has zero anon SELECT policy anywhere; the RSVP rate limiter is genuinely separate from `agent_rate_limits`/`checkout_rate_limits` (grep to confirm no accidental reuse); `rsvpToSessionAction` uses `createSupabaseServerClient()` (not the public client) so `user_id` attribution is genuine, not spoofable via a client-supplied value.
  - **Authority boundaries (D-R5-1)**: a creator genuinely cannot edit or cancel another creator's session (trace `community_sessions_owner_all` against a crafted `host_creator_id` that isn't the caller's); ops genuinely can act on any session including creating on a creator's behalf (trace `adminCreateSessionAction`'s host picker end to end).
  - **The "go live requires embed_url" rule (D-R5-4)**: confirm it's enforced in *both* `setSessionStatusAction` (Studio) and `adminSetSessionStatusAction` (ops) — not just one of them.
  - **i18n parity**: all 7 locales, no leftover English-only placeholder text, `sessionsSoon` fully removed from every locale file (not just `en.ts`), no orphaned imports of the retired placeholder view.
  - **SEO**: `/sessions` and `/sessions/[slug]` genuinely appear in `MARKETING_PATHS`/the sitemap feed; `Event` JSON-LD renders with a real `startDate`/`eventStatus`; the noindex-and-excluded state of the OLD placeholder isn't accidentally still true anywhere (e.g. a stale `robots` entry).
  - **Homepage contract (D-R5-8)**: confirm `HomeView` genuinely didn't need any prop-shape change beyond adding `slug` — no other consumer of `UpcomingSession` was missed.
  - Currency/attribution is out of scope for this phase (no bookings/payments touched) — confirm the diff genuinely contains no changes to `bookings`, `booking_settlements`, or Stripe-adjacent code, which would indicate scope creep.

- [ ] **Step 2: Fix any Critical/Important findings directly** (same session, before proposing a PR) — re-run affected tests after each fix.

- [ ] **Step 3: Report remaining Minor/carry-forward findings**, then hand off per `finishing-a-development-branch`.

---

## Testing summary

Per-surface, following the established `db.*-migration.test.ts` / `*-queries.test.ts` / `*-actions.test.ts` / `*.host.test.tsx` layering used by every prior phase. New this phase: the first content type in this codebase with **three distinct authoring surfaces sharing one table** (public read-only, creator-owned Studio CRUD, ops full-authority CRUD) — tested via three separate action modules (`studio-actions.ts`, `admin/sessions-actions.ts`, `rsvp-actions.ts`) rather than one shared module, deliberately mirroring how `experiences` (merchant-owned) and `testimonials` (ops-owned) are already separate rather than unified.

## Out of scope (R5)

Confirmation or reminder emails (no mailer integration exists anywhere in this codebase); public RSVP counts; feeding session content into the R4 traveller AI agent's retrieval corpus (guides/articles/experiences only, unchanged); non-YouTube embed platforms or a join-link fallback for non-embeddable services; any native video player (out of the whole program, per the master spec); per-session cover images or host media uploads (no new Storage bucket); ops-approval gating on creator-created sessions (D-R5-3 explicitly rejects this for P1); a shared `requireCreatorAction`-style resolution for cases where a creator's `id` might ever diverge from `auth.uid()` (it doesn't, and isn't expected to — see Ground Truth notes).

## Self-review (per writing-plans skill)

- **Spec coverage**: every design-doc decision (D-R5-1 through D-R5-10) maps to a concrete task — D-R5-1 (Tasks 7-9), D-R5-2 (Task 4), D-R5-3 (Task 1's RLS, no approval gate anywhere in Tasks 8-9), D-R5-4 (Task 5's `canGoLive`, enforced in both Task 8 and Task 9), D-R5-5 (Tasks 1 and 10), D-R5-6 (Task 1's RLS + Task 9's ops-only RSVP read, no public count anywhere), D-R5-7 (Task 1's `slug` column), D-R5-8 (Task 14), D-R5-9 (Tasks 2 and 15), D-R5-10 (Task 3). All routes/components/testing/i18n/SEO sections of the design doc have matching tasks (12-13 routes, 19 testing/i18n mostly self-contained per task, 18 i18n, 12-13 SEO).
- **Placeholder scan**: no TBD/TODO/"add appropriate" language; every code step has complete, real code, including all 3 SQL migrations and real i18n translation instructions (not English-only stand-ins) for all 7 locales. (One earlier draft of Task 14's test steps used descriptive placeholders instead of executable test code — caught and rewritten with concrete, complete tests matching `home.queries.test.ts`'s actual existing mock convention before this plan was finalized.)
- **Type consistency**: `SessionInput`/`SessionType`/`SessionStatus`/`SessionListItem` (Task 4, extended in Task 16) are the exact types every downstream task (5, 6, 8, 9, 10, 16, 17) imports and uses — no divergent shapes. `ParsedSession` (Task 5) matches exactly what Tasks 8 and 9's `toRow`/insert payloads consume. `PublicSession` (Task 6) matches what Tasks 12-14 render. `canGoLive` (Task 5) is the single source of truth both status-transition actions (Tasks 8, 9) call, rather than two independent re-implementations of the same rule.
