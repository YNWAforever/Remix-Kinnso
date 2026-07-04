# Phase R3A-1 — Traveler Role & Booking Core Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `'traveler'` as a first-class `ViewerRole` (the new default for any
authenticated user who isn't ops, merchant, or an *active* creator), lay down the
complete booking-core data model (`traveler_profiles`, `experience_availability`,
`bookings`, `booking_events`), and let a merchant manage a date/capacity availability
calendar for each of their published experiences from the dashboard — with zero
regression to any existing creator-gated page.

**Architecture:** One migration adds the four new tables plus an `app_private`
gated-read helper (`experience_is_bookable`, same shape as the existing
`merchant_is_active`) and extends `handle_new_user()` (via `create or replace`, not by
editing the shipped trigger migration) to also bootstrap a blank `traveler_profiles` row
for every sign-up, mirroring the existing `creators`-row bootstrap. `resolveViewerRole`
and `useViewerRole` both gain a `creators.status = 'active'` check in their fallback
branch — this exact predicate is what `/studio/page.tsx` already uses as its own "real"
creator gate (its own comment says so), so every existing `role !== 'creator'` check
elsewhere in the app (11 call sites, audited in Ground Truth below) keeps working
unmodified: an onboarding-status user now correctly resolves to `'traveler'` instead of
a premature `'creator'`, which is a strict hardening, not a behavior break. Availability
management is owner-RLS CRUD (no RPC — no money, single-owner writes), following the
exact pattern already established by the R2B experiences CRUD.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase
Postgres (RLS, `SECURITY DEFINER` helpers), TypeScript, Vitest, Tailwind v4 (`kinnso-*`
/ `k2-*` tokens).

---

## Ground truth this plan relies on (verified 2026-07-04)

- Repo: `/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3`, branch
  `main` @ `a90f048` (Phase R2C, PR #69, merged). Design spec:
  `docs/superpowers/specs/2026-07-04-phase-r3-booking-mvp-design.md` (§D-R3-1, D-R3-3
  partial — this plan builds `traveler_profiles`, `experience_availability`, `bookings`,
  `booking_events`; it does **not** build `booking_settlements` (R3B), Stripe
  Checkout/webhook, or any public booking UI (R3A-2) — see §6 Out of scope).
- Live Supabase project: `scryfkefedzuetfdtrvl` (org `eerkaskxrxxfrtgetuqx`).
- `ViewerRole` today: `'anon' | 'creator' | 'creator-pending' | 'merchant' | 'ops'`
  (`apps/web/lib/auth/viewer-role.ts:3`; `'creator-pending'` is dead — never produced,
  left untouched, out of scope for this plan).
- `resolveViewerRole` (`apps/web/lib/auth/viewer-role.ts:11-35`): ops check → merchant
  check → **unconditional `return 'creator'`** (line 34) with no query against
  `creators` at all. `useViewerRole` (`apps/web/lib/auth/useViewerRole.ts:24-39`) mirrors
  this exactly via `resolveSignedInRole`'s final ternary (line 38):
  `ops ? 'ops' : merchant ? 'merchant' : 'creator'`.
- `public.creators` (`supabase/migrations/20260614000009_creator_tables.sql:3-9`):
  `id uuid primary key references auth.users(id)`, `display_name text`,
  `status text not null default 'onboarding' check (status in ('onboarding','active'))`,
  `created_at`, `updated_at`. **The PK is `id`, not a separate `user_id` column** — every
  query against `creators` scoped to the current user must be `.eq('id', userId)`.
- `public.handle_new_user()` (`supabase/migrations/20260614000014_creator_auth_trigger.sql`,
  full file, 17 lines): `security definer`, inserts `creators (id) values (new.id) on
  conflict (id) do nothing`, bound to `on_auth_user_created after insert on auth.users`.
  Every signed-up user gets a blank `creators` row (`status = 'onboarding'`) — this is
  why the resolver's old unconditional-`'creator'` fallback existed, and also why the
  master spec's "traveler is default for sign-ups with no creator row" doesn't hold
  literally (everyone already has a row). **Resolved here**: redefine the check to
  `status = 'active'`, not row-existence.
- **`/studio/page.tsx:32-43` already anticipates exactly this ambiguity.** It does
  `if (role === 'merchant') redirect(...)`, `if (role === 'ops') redirect(...)`, then —
  its own comment at lines 36-37 — *"Active-creator gate. resolveViewerRole returns
  'creator' for onboarding users too, so status is the real check"* — and independently
  re-queries `creators.status` itself (line 38-43), redirecting to `/${loc}/creator`
  (the onboarding wizard) if not `'active'`. **This page needs zero changes**: it never
  branches on `role === 'creator'`, so it is unaffected either way.
- **Full audit of every other `role !== 'creator'` call site** (there is no exhaustive
  `switch` on `ViewerRole` anywhere in the codebase, confirmed by repo-wide grep — no
  compile-time exhaustiveness risk from adding `'traveler'` to the union):
  - `apps/web/app/[locale]/studio/offers/page.tsx:60`
  - `apps/web/app/[locale]/studio/copilot/page.tsx:28`
  - `apps/web/app/[locale]/studio/missions/page.tsx:137`
  - `apps/web/app/[locale]/studio/missions/[id]/page.tsx:32`
  - `apps/web/app/[locale]/studio/earnings/page.tsx:27`
  - `apps/web/app/[locale]/studio/tier/page.tsx:24`
  - `apps/web/app/[locale]/studio/insights/page.tsx:20`
  - `apps/web/app/[locale]/studio/perks/page.tsx:25`
  - `apps/web/app/api/copilot/route.ts:32`
  - `apps/web/lib/missions/invite-actions.ts:34`
  - `apps/web/lib/perks/actions.ts:17`

  Every one of these does `if (role !== 'creator') { notFound() | redirect() | 403 |
  formError() }` for the **same reason** `/studio/page.tsx`'s comment names: they were
  never reachable by an onboarding-status user through normal navigation anyway (since
  `/studio` itself redirects such a user to `/creator` before they'd ever click through
  to, say, `/studio/offers`). Redefining the fallback to require `status = 'active'`
  means a not-yet-active user hitting one of these URLs directly now gets the *same*
  "go finish onboarding" outcome one hop earlier and more consistently, instead of
  briefly seeing an empty/broken creator page. **None of these 11 files need any code
  change** — they keep checking `!== 'creator'` verbatim; only what `'creator'` means
  changes, and it changes to match what these call sites already assumed was true.
  `apps/web/app/[locale]/merchants/apply/page.tsx:29-32` and
  `apps/web/app/[locale]/ops/settlements/page.tsx:47-48` were also checked — they branch
  on `'merchant'`/`'ops'` only, unaffected.
- `apps/web/components/kinnso/Navbar.tsx` and `BrandContactCard.tsx` accept `role:
  ViewerRole` as a prop type only (no exhaustive branching found) — a new `'traveler'`
  value degrades gracefully to whatever their existing non-creator/non-merchant fallback
  rendering is today. No change needed; traveler-specific nav polish is out of scope
  (R3B/R3C concern per the design spec).
- `public.merchant_profiles`/`public.experiences` (R2A/R2B, live): owner-RLS pattern —
  `merchant_profile_id in (select id from merchant_profiles where user_id = auth.uid())`
  — is the exact template this plan reuses for `experience_availability`'s owner policy,
  one join-hop further (`experience_id in (select id from experiences where
  merchant_profile_id in (...))`).
- `app_private.merchant_is_active(target_merchant_id uuid)`
  (`supabase/migrations/20260704100000_fix_experiences_public_read_merchant_check.sql`,
  full file, 32 lines) — `security definer`, `stable`, `set search_path = public`,
  `schema app_private` locked down (`revoke all ... from public`, `grant usage ... to
  anon`), used inside an RLS `USING` clause so anon never needs a direct grant on the
  table being checked. This plan's `app_private.experience_is_bookable()` follows the
  identical shape, composing `merchant_is_active` inside it.
- `public.set_updated_at()` — existing generic trigger function (used by
  `testimonials_set_updated_at`, `experiences_set_updated_at`, etc.) — reused for all
  four new tables' `updated_at` triggers.
- `public.is_active_ops()` — existing helper (`security invoker`, checks
  `kinnso_ops_members`) — reused for every new table's ops-read policy.
- `apps/web/lib/admin/guard.ts:32-45` `requireMerchantAction(supabase)` already resolves
  the caller's own `merchant_profiles.id` (`gate.merchantId`) — reused as-is for every
  new availability action; no change to this file.
- Experiences CRUD template (`apps/web/lib/experiences/{actions,queries,types,
  validation}.ts`, `apps/web/app/[locale]/merchants/dashboard/experiences/{page.tsx,
  new/page.tsx,[experienceId]/edit/page.tsx}`, full files read this session) — this
  plan's availability files mirror this exactly: local `ActionFailure`/`ActionResult`
  types (not `lib/admin/result.ts`, which is ops-only), a `formError` helper, a
  scoped-select pre-check before mutating, `revalidatePath` on success.
- Migration naming: `YYYYMMDDHHMMSS_slug.sql`, seconds always `00`. Latest is
  `20260704100000_fix_experiences_public_read_merchant_check.sql`. This plan's
  migration: `20260704110000_r3a1_traveler_role_and_booking_core.sql`.
- `packages/db/types.ts` is hand-patched (2285 lines). Table entries are locally
  alphabetical (not a strict whole-file sort — a `Views`-like block of extra
  definer-views such as `merchant_public_profiles` is appended after the plain tables).
  `booking_events` and `bookings` insert immediately before the `copilot_messages` entry
  (line 584); `experience_availability` inserts immediately before the `experiences`
  entry (line 861); `traveler_profiles` inserts immediately after the `testimonials`
  entry (line 1784) and before the `merchant_public_profiles` view entry (line 1822).
  `Json` is the existing exported type for `jsonb` columns (`packages/db/types.ts:1`).
- `i18n`: `Messages` interface + English object both live in `en.ts` (2226 lines);
  `MerchantDashboardMessages` interface at `en.ts:75-136`, object literal at
  `en.ts:1953-1997+`. `tests/i18n.locale-parity.test.ts` auto-derives `GROUPS` from
  `Object.keys(en)` — extending an existing group needs no new registration, but every
  new key must exist in all 7 locale objects (parity is per-key inside a group, not just
  per-group).
- Vitest: run scoped subsets via `cd apps/web && npx vitest run <pattern>` (never
  `pnpm --filter web test -- <pattern>` — runs the full ~900-test suite and can time
  out).
- Supabase MCP tool `apply_migration` (`project_id: scryfkefedzuetfdtrvl`) applies a
  migration transactionally to the live project; `execute_sql` verifies it afterward.

## File map

| Path | Change |
|---|---|
| `supabase/migrations/20260704110000_r3a1_traveler_role_and_booking_core.sql` | Create |
| `packages/db/types.ts` | Modify (hand-patch: 4 new tables) |
| `apps/web/lib/auth/viewer-role.ts` | Modify |
| `apps/web/lib/auth/useViewerRole.ts` | Modify |
| `apps/web/lib/experiences/availability-types.ts` | Create |
| `apps/web/lib/experiences/availability-validation.ts` | Create |
| `apps/web/lib/experiences/availability-queries.ts` | Create |
| `apps/web/lib/experiences/availability-actions.ts` | Create |
| `apps/web/components/kinnso/pages/MerchantAvailabilityView.tsx` | Create |
| `apps/web/components/kinnso/pages/MerchantExperiencesView.tsx` | Modify (add "Availability" link) |
| `apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page.tsx` | Create |
| `apps/web/lib/i18n/messages/en.ts` | Modify (extend `MerchantDashboardMessages`) |
| `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Modify (mirror, translated) |
| `apps/web/tests/auth.viewer-role.test.ts` | Create |
| `apps/web/tests/auth.useViewerRole.test.tsx` | Modify |
| `apps/web/tests/experiences.availability-actions.test.ts` | Create |
| `apps/web/tests/experiences.availability-queries.test.ts` | Create |
| `apps/web/tests/merchants.availability.host.test.tsx` | Create |

---

### Task 1: Database migration — traveler role support + booking core tables

**Files:**
- Create: `supabase/migrations/20260704110000_r3a1_traveler_role_and_booking_core.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Phase R3A-1 — Traveler role support + booking-core data model.
-- (1) traveler_profiles: one row per auth user, bootstrapped by the same
--     handle_new_user() trigger that already bootstraps a blank `creators` row (every
--     sign-up gets both; role resolution — done in app code, not here — decides which
--     is "live" via creators.status, not row existence).
-- (2) experience_availability: per-date capacity rows for a bookable experience. Owner
--     (merchant) CRUD via the same ownership-chain pattern as `experiences`; public read
--     of open, future, bookable dates via a new app_private helper (no PII, but the
--     bookability check still needs to cross the merchant_profiles table, which anon
--     has no grant on — same reason merchant_is_active exists).
-- (3) bookings: the core booking record. Deliberately NO owner/anon UPDATE grant at all
--     in this migration — every status transition ships in a later phase (R3A-2's
--     webhook-driven RPC, R3B's ops/merchant RPCs). Rows are immutable to every client
--     once inserted. Exactly one of traveler_user_id/guest_email is set (CHECK).
-- (4) booking_events: audit trail, read-only to every role — all writes go through
--     SECURITY DEFINER RPCs added in a later phase (same shape as ops_audit_log).

-- ── 1. traveler_profiles ─────────────────────────────────────────────────────
create table public.traveler_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.traveler_profiles enable row level security;

create policy traveler_profiles_owner_select on public.traveler_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy traveler_profiles_owner_update on public.traveler_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy traveler_profiles_ops_select on public.traveler_profiles
  for select to authenticated
  using (public.is_active_ops());

create trigger traveler_profiles_set_updated_at
  before update on public.traveler_profiles
  for each row execute procedure public.set_updated_at();

-- No owner-insert policy: rows are bootstrapped only by handle_new_user()
-- (SECURITY DEFINER), matching the creators-row precedent exactly.
revoke all on table public.traveler_profiles from anon;
grant select, update on table public.traveler_profiles to authenticated;

-- ── 2. Extend handle_new_user() to also bootstrap a traveler_profiles row ───────
-- CREATE OR REPLACE on the existing function; the trigger `on_auth_user_created`
-- (created in 20260614000014_creator_auth_trigger.sql) calls it by name and needs no
-- change. The shipped migration file is never edited.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.creators (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.traveler_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ── 3. experience_availability ───────────────────────────────────────────────
create table public.experience_availability (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  date date not null,
  capacity integer not null check (capacity >= 0),
  booked_count integer not null default 0
    check (booked_count >= 0 and booked_count <= capacity),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experience_id, date)
);

create index experience_availability_experience_idx
  on public.experience_availability(experience_id, date);

alter table public.experience_availability enable row level security;

create policy experience_availability_owner_all on public.experience_availability
  for all to authenticated
  using (experience_id in (
    select id from public.experiences where merchant_profile_id in (
      select id from public.merchant_profiles where user_id = (select auth.uid()))))
  with check (experience_id in (
    select id from public.experiences where merchant_profile_id in (
      select id from public.merchant_profiles where user_id = (select auth.uid()))));

create or replace function app_private.experience_is_bookable(target_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.experiences e
    where e.id = target_experience_id
      and e.status = 'published'
      and app_private.merchant_is_active(e.merchant_profile_id)
  );
$$;
revoke all on function app_private.experience_is_bookable(uuid) from public;
grant execute on function app_private.experience_is_bookable(uuid) to anon, authenticated;

create policy experience_availability_public_read on public.experience_availability
  for select to anon, authenticated
  using (
    status = 'open'
    and date >= current_date
    and app_private.experience_is_bookable(experience_id)
  );

create trigger experience_availability_set_updated_at
  before update on public.experience_availability
  for each row execute procedure public.set_updated_at();

revoke all on table public.experience_availability from anon, authenticated;
grant select on table public.experience_availability to anon;
grant select, insert, update, delete on table public.experience_availability to authenticated;

-- ── 4. bookings ──────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id),
  availability_id uuid not null references public.experience_availability(id),
  traveler_user_id uuid references auth.users(id),
  guest_email text,
  qty integer not null check (qty > 0),
  unit_amount numeric(10,2) not null check (unit_amount >= 0),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  currency text not null check (currency in ('HKD','USD','SGD','JPY','KRW','THB','TWD','CNY')),
  status text not null default 'pending_payment'
    check (status in ('pending_payment','confirmed','completed','cancelled','refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  creator_id uuid references public.creators(id),
  guide_id uuid references public.guides(id),
  source_surface text check (source_surface in ('guide','article','experience_page','direct')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_traveler_xor_guest check (
    (traveler_user_id is not null and guest_email is null) or
    (traveler_user_id is null and guest_email is not null)
  )
);

create index bookings_experience_idx on public.bookings(experience_id);
create index bookings_availability_idx on public.bookings(availability_id);
create index bookings_traveler_idx on public.bookings(traveler_user_id);
create index bookings_status_idx on public.bookings(status, created_at desc);

alter table public.bookings enable row level security;

create policy bookings_owner_insert on public.bookings
  for insert to authenticated
  with check (traveler_user_id = (select auth.uid()) and status = 'pending_payment');

create policy bookings_guest_insert on public.bookings
  for insert to anon
  with check (traveler_user_id is null and guest_email is not null and status = 'pending_payment');

create policy bookings_owner_select on public.bookings
  for select to authenticated
  using (traveler_user_id = (select auth.uid()));

create policy bookings_ops_select on public.bookings
  for select to authenticated
  using (public.is_active_ops());

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

-- No UPDATE grant to anon or authenticated — every status transition (confirm, cancel,
-- complete, refund) ships as a SECURITY DEFINER RPC in a later phase. Rows are
-- immutable to every client once inserted.
revoke all on table public.bookings from anon, authenticated;
grant insert on table public.bookings to anon;
grant select, insert on table public.bookings to authenticated;

-- ── 5. booking_events ────────────────────────────────────────────────────────
create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events(booking_id, created_at);

alter table public.booking_events enable row level security;

create policy booking_events_owner_select on public.booking_events
  for select to authenticated
  using (booking_id in (select id from public.bookings where traveler_user_id = (select auth.uid())));

create policy booking_events_ops_select on public.booking_events
  for select to authenticated
  using (public.is_active_ops());

-- No insert/update/delete policy for any role — all writes go through SECURITY
-- DEFINER RPCs added in a later phase (mirrors ops_audit_log's write-only-via-RPC shape).
revoke all on table public.booking_events from anon, authenticated;
grant select on table public.booking_events to authenticated;
```

- [ ] **Step 2: Apply the migration to the live project**

Use the Supabase MCP tool `apply_migration` with `project_id: scryfkefedzuetfdtrvl`,
`name: r3a1_traveler_role_and_booking_core`, and the SQL body above.

- [ ] **Step 3: Verify live**

Run via the Supabase MCP `execute_sql` tool against `scryfkefedzuetfdtrvl`:

```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
    and table_name in ('traveler_profiles','experience_availability','bookings','booking_events')) as tables_created,
  (select count(*) from pg_policy where polrelid = 'public.traveler_profiles'::regclass) as traveler_profiles_policies,
  (select count(*) from pg_policy where polrelid = 'public.experience_availability'::regclass) as availability_policies,
  (select count(*) from pg_policy where polrelid = 'public.bookings'::regclass) as bookings_policies,
  (select count(*) from pg_policy where polrelid = 'public.booking_events'::regclass) as booking_events_policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = 'experience_is_bookable') as helper_exists,
  (select prosrc like '%traveler_profiles%' from pg_proc where proname = 'handle_new_user') as trigger_extended;
```

Expected: `tables_created=4`, `traveler_profiles_policies=3`,
`availability_policies=2`, `bookings_policies=4`, `booking_events_policies=2`,
`helper_exists=1`, `trigger_extended=true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260704110000_r3a1_traveler_role_and_booking_core.sql
git commit -m "feat(db): traveler_profiles + booking-core tables (experience_availability, bookings, booking_events)

Extends handle_new_user() to bootstrap a traveler_profiles row alongside the
existing creators row (every sign-up gets both; role resolution decides which
is live). Adds the full booking-core schema per the R3 design spec §D-R3-3 —
bookings has no UPDATE grant for any role; every status transition ships as an
audited RPC in a later phase."
```

---

### Task 2: Hand-patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add `booking_events` and `bookings` (insert immediately before the existing `copilot_messages` entry)**

```typescript
      booking_events: {
        Row: {
          booking_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      bookings: {
        Row: {
          availability_id: string
          created_at: string
          creator_id: string | null
          currency: string
          experience_id: string
          guest_email: string | null
          guide_id: string | null
          id: string
          qty: number
          source_surface: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number
          traveler_user_id: string | null
          unit_amount: number
          updated_at: string
        }
        Insert: {
          availability_id: string
          created_at?: string
          creator_id?: string | null
          currency: string
          experience_id: string
          guest_email?: string | null
          guide_id?: string | null
          id?: string
          qty: number
          source_surface?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount: number
          traveler_user_id?: string | null
          unit_amount: number
          updated_at?: string
        }
        Update: {
          availability_id?: string
          created_at?: string
          creator_id?: string | null
          currency?: string
          experience_id?: string
          guest_email?: string | null
          guide_id?: string | null
          id?: string
          qty?: number
          source_surface?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number
          traveler_user_id?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 2: Add `experience_availability` (insert immediately before the existing `experiences` entry)**

```typescript
      experience_availability: {
        Row: {
          booked_count: number
          capacity: number
          created_at: string
          date: string
          experience_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          booked_count?: number
          capacity: number
          created_at?: string
          date: string
          experience_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          booked_count?: number
          capacity?: number
          created_at?: string
          date?: string
          experience_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Add `traveler_profiles` (insert immediately after the existing `testimonials` entry, before the `merchant_public_profiles` view entry)**

```typescript
      traveler_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          locale: string | null
          marketing_opt_in: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          locale?: string | null
          marketing_opt_in?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          locale?: string | null
          marketing_opt_in?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors introduced by this file.

- [ ] **Step 5: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-patch types.ts for booking-core tables"
```

---

### Task 3: Server-side role resolution — `resolveViewerRole` gains the traveler fallback

**Files:**
- Modify: `apps/web/lib/auth/viewer-role.ts`
- Test: `apps/web/tests/auth.viewer-role.test.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
// apps/web/tests/auth.viewer-role.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolveViewerRole } from '@/lib/auth/viewer-role'

type Row = Record<string, unknown> | null

function fakeSupabase(opts: {
  user: { id: string } | null
  ops?: Row
  merchant?: Row
  creator?: Row
}) {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data:
          table === 'kinnso_ops_members' ? (opts.ops ?? null)
          : table === 'merchant_profiles' ? (opts.merchant ?? null)
          : table === 'creators' ? (opts.creator ?? null)
          : null,
        error: null,
      }),
    }
    return builder
  }
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from,
  } as never
}

describe('resolveViewerRole', () => {
  it('returns anon when there is no session', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: null }))
    expect(role).toBe('anon')
  })

  it('returns ops for an active ops member, even with a merchant profile', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, ops: { id: 'ops1' }, merchant: { id: 'm1' } }),
    )
    expect(role).toBe('ops')
  })

  it('returns merchant for a user with a merchant profile', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: { id: 'u1' }, merchant: { id: 'm1' } }))
    expect(role).toBe('merchant')
  })

  it('returns creator for a user with an active creator profile', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, creator: { status: 'active' } }),
    )
    expect(role).toBe('creator')
  })

  it('returns traveler for a user whose creator profile is still onboarding', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, creator: { status: 'onboarding' } }),
    )
    expect(role).toBe('traveler')
  })

  it('returns traveler for a user with no creators row at all', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: { id: 'u1' } }))
    expect(role).toBe('traveler')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/auth.viewer-role.test.ts`
Expected: FAIL — the "onboarding" and "no creators row" cases currently resolve to
`'creator'` (old unconditional fallback), not `'traveler'`.

- [ ] **Step 3: Update the implementation**

```typescript
// apps/web/lib/auth/viewer-role.ts
import type { createSupabaseServerClient } from '@/lib/supabase/server'

export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'traveler' | 'ops'

/**
 * Server: derive the viewer's role from the cookie session. Mirrors the client
 * hook's resolution so the public host and client chrome agree.
 * Server-safe — no React or browser imports, so a Server Component can import
 * this without crossing the client boundary.
 */
export async function resolveViewerRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ViewerRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'anon'

  const { data: ops } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (ops) return 'ops'

  const { data: merchant } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (merchant) return 'merchant'

  // Every sign-up gets a blank `creators` row (handle_new_user()), so row
  // existence alone can't distinguish a real creator from a traveler who never
  // touched onboarding. `status = 'active'` is the same bar /studio/page.tsx
  // already uses as its own "real" creator gate.
  const { data: creator } = await supabase
    .from('creators')
    .select('status')
    .eq('id', user.id)
    .maybeSingle()
  if (creator?.status === 'active') return 'creator'

  return 'traveler'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/auth.viewer-role.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/viewer-role.ts apps/web/tests/auth.viewer-role.test.ts
git commit -m "feat(web): resolveViewerRole gains the traveler fallback

'creator' now requires creators.status = 'active' (the same bar
/studio/page.tsx already used as its own real gate), not mere row existence —
every signed-up user has a blank creators row via handle_new_user(), so row
existence alone never distinguished a real creator from a traveler."
```

---

### Task 4: Client-side role resolution — `useViewerRole` mirrors the server change

**Files:**
- Modify: `apps/web/lib/auth/useViewerRole.ts`
- Modify: `apps/web/tests/auth.useViewerRole.test.tsx`

- [ ] **Step 1: Update the test file's mock and add the new failing test**

Replace the `from` mock (add a `creatorProfile` fixture and a `creators` branch), update
the existing "resolves to creator" test to require an active creator profile, and add a
new test for the traveler fallback:

```typescript
// apps/web/tests/auth.useViewerRole.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'

let sessionUser: { id: string } | null = null
let opsMember: { id: string } | null = null
let merchantProfile: { id: string } | null = null
let creatorProfile: { status: string } | null = null
let lookupBarrier: Promise<void> | null = null
const getUser = vi.fn(async () => ({ data: { user: sessionUser }, error: null }))
let authStateCallback: ((_event: string, session: { user: { id: string } } | null) => void | Promise<void>) | null = null
const onAuthStateChange = vi.fn((cb: typeof authStateCallback) => {
  authStateCallback = cb
  return {
    data: { subscription: { unsubscribe: vi.fn() } },
  }
})
const from = vi.fn((table: string) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (lookupBarrier) await lookupBarrier
      return {
        data:
          table === 'kinnso_ops_members'
            ? opsMember
            : table === 'merchant_profiles'
              ? merchantProfile
              : table === 'creators'
                ? creatorProfile
                : null,
        error: null,
      }
    }),
  }
  return builder
})

afterEach(() => {
  cleanup()
  sessionUser = null
  opsMember = null
  merchantProfile = null
  creatorProfile = null
  lookupBarrier = null
  authStateCallback = null
  vi.clearAllMocks()
})

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser, onAuthStateChange },
    from,
  }),
}))

import { useViewerRole } from '@/lib/auth/useViewerRole'

describe('useViewerRole', () => {
  it('defaults to anon before the session resolves', () => {
    sessionUser = null
    const { result } = renderHook(() => useViewerRole())
    expect(result.current).toBe('anon')
  })

  it('resolves to creator for a signed-in user with an active creator profile', async () => {
    sessionUser = { id: 'u1' }
    creatorProfile = { status: 'active' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('creator'))
  })

  it('resolves to traveler for a signed-in user with no active creator profile', async () => {
    sessionUser = { id: 'u1' }
    creatorProfile = { status: 'onboarding' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('traveler'))
  })

  it('resolves to merchant for a signed-in user with a merchant profile', async () => {
    sessionUser = { id: 'u1' }
    merchantProfile = { id: 'merchant-1' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('merchant'))
  })

  it('resolves to ops before merchant for an active ops member', async () => {
    sessionUser = { id: 'u1' }
    opsMember = { id: 'ops-1' }
    merchantProfile = { id: 'merchant-1' }
    const { result } = renderHook(() => useViewerRole())
    await waitFor(() => expect(result.current).toBe('ops'))
  })

  it('resolves auth state changes with merchant and ops lookups', async () => {
    sessionUser = null
    merchantProfile = { id: 'merchant-1' }
    const { result } = renderHook(() => useViewerRole())

    expect(result.current).toBe('anon')
    await act(async () => {
      await authStateCallback?.('SIGNED_IN', { user: { id: 'u1' } })
    })

    await waitFor(() => expect(result.current).toBe('merchant'))
  })

  it('ignores stale signed-in lookups after sign-out', async () => {
    let releaseLookup: () => void = () => {}
    sessionUser = null
    merchantProfile = { id: 'merchant-1' }
    lookupBarrier = new Promise((resolve) => {
      releaseLookup = resolve
    })
    const { result } = renderHook(() => useViewerRole())

    expect(result.current).toBe('anon')
    const signedInLookup = authStateCallback?.('SIGNED_IN', { user: { id: 'u1' } })
    expect(from).toHaveBeenCalledWith('merchant_profiles')

    await act(async () => {
      await authStateCallback?.('SIGNED_OUT', null)
    })
    expect(result.current).toBe('anon')

    await act(async () => {
      releaseLookup()
      await signedInLookup
    })
    expect(result.current).toBe('anon')
  })

  it('honors an explicit override', () => {
    sessionUser = null
    const { result } = renderHook(() => useViewerRole('merchant'))
    expect(result.current).toBe('merchant')
  })
})
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `cd apps/web && npx vitest run tests/auth.useViewerRole.test.tsx`
Expected: FAIL only on "resolves to traveler for a signed-in user with no active
creator profile" (old ternary never returns `'traveler'`); all other tests still pass
(the "resolves to creator" test passes today by coincidence, since the old
implementation ignores `creatorProfile` entirely).

- [ ] **Step 3: Update the implementation**

```typescript
// apps/web/lib/auth/useViewerRole.ts
'use client'
import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ViewerRole } from './viewer-role'
export type { ViewerRole } from './viewer-role'

/**
 * Thin viewer-role hook (replaces the redesign's MockAuthContext).
 * Reads the real Supabase session client-side; defaults to 'anon'.
 * Pass `override` to force a role (e.g. a merchant-context host).
 */
export function useViewerRole(override?: ViewerRole): ViewerRole {
  const [role, setRole] = useState<ViewerRole>('anon')

  useEffect(() => {
    // When a host forces a role, skip session resolution entirely; the
    // override is surfaced directly via the return value below (no
    // synchronous setState in the effect).
    if (override) return
    const supabase = createSupabaseBrowserClient()
    let active = true
    let latestResolution = 0

    const resolveSignedInRole = async (userId: string): Promise<ViewerRole> => {
      const [{ data: ops }, { data: merchant }, { data: creator }] = await Promise.all([
        supabase
          .from('kinnso_ops_members')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('merchant_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('creators')
          .select('status')
          .eq('id', userId)
          .maybeSingle(),
      ])
      if (ops) return 'ops'
      if (merchant) return 'merchant'
      if (creator?.status === 'active') return 'creator'
      return 'traveler'
    }

    const initialResolution = ++latestResolution
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || initialResolution !== latestResolution) return
      if (!data.user) {
        setRole('anon')
        return
      }
      const nextRole = await resolveSignedInRole(data.user.id)
      if (!active || initialResolution !== latestResolution) return
      setRole(nextRole)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const resolution = ++latestResolution
      if (!session?.user) {
        if (active) setRole('anon')
        return
      }
      const nextRole = await resolveSignedInRole(session.user.id)
      if (active && resolution === latestResolution) setRole(nextRole)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [override])

  return override ?? role
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/auth.useViewerRole.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/useViewerRole.ts apps/web/tests/auth.useViewerRole.test.tsx
git commit -m "feat(web): useViewerRole mirrors the server-side traveler fallback"
```

---

### Task 5: Availability validation, queries, and actions (merchant-owned)

**Files:**
- Create: `apps/web/lib/experiences/availability-types.ts`
- Create: `apps/web/lib/experiences/availability-validation.ts`
- Create: `apps/web/lib/experiences/availability-queries.ts`
- Create: `apps/web/lib/experiences/availability-actions.ts`
- Test: `apps/web/tests/experiences.availability-actions.test.ts`
- Test: `apps/web/tests/experiences.availability-queries.test.ts`

- [ ] **Step 1: Write the types module**

```typescript
// apps/web/lib/experiences/availability-types.ts
export type AvailabilityInput = {
  date: string // 'YYYY-MM-DD' form-string
  capacity: string // form-string; validated/parsed to an integer in validation
}
```

- [ ] **Step 2: Write the validation module**

```typescript
// apps/web/lib/experiences/availability-validation.ts
import type { AvailabilityInput } from '@/lib/experiences/availability-types'

export type ValidationErrors = Record<string, string[]>
export type ParsedAvailability = { date: string; capacity: number }
export type AvailabilityValidation =
  | { ok: true; parsed: ParsedAvailability }
  | { ok: false; errors: ValidationErrors }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Deliberately does NOT reject past dates client-side — the public read policy
 * (experience_availability_public_read, `date >= current_date`) already keeps a past
 * date from ever being bookable, and "today's server date" isn't reliably knowable in
 * every calling context. A past date a merchant adds simply never becomes visible.
 */
export function validateAvailabilityInput(input: AvailabilityInput): AvailabilityValidation {
  const errors: ValidationErrors = {}

  const date = input.date.trim()
  if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    errors.date = ['invalid_date']
  }

  const capacityRaw = input.capacity.trim()
  const capacity = Number(capacityRaw)
  if (!capacityRaw || !Number.isInteger(capacity) || capacity < 1) {
    errors.capacity = ['invalid_number']
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, parsed: { date, capacity } }
}
```

- [ ] **Step 3: Write the failing test for the queries module**

```typescript
// apps/web/tests/experiences.availability-queries.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { listExperienceAvailability } from '@/lib/experiences/availability-queries'

function fakeSupabase(rows: unknown[], error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: rows, error }) }),
      }),
    }),
  } as never
}

const row = { id: 'a1', date: '2026-08-01', capacity: 10, booked_count: 2, status: 'open' }

describe('listExperienceAvailability', () => {
  it('maps snake_case rows to camelCase', async () => {
    const rows = await listExperienceAvailability(fakeSupabase([row]), 'exp1')
    expect(rows).toEqual([{ id: 'a1', date: '2026-08-01', capacity: 10, bookedCount: 2, status: 'open' }])
  })

  it('propagates errors', async () => {
    await expect(listExperienceAvailability(fakeSupabase([], { message: 'boom' }), 'exp1')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/experiences.availability-queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/experiences/availability-queries'`

- [ ] **Step 5: Write the queries module**

```typescript
// apps/web/lib/experiences/availability-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type ExperienceAvailability = {
  id: string
  date: string
  capacity: number
  bookedCount: number
  status: 'open' | 'closed'
}

/** Owner-RLS list of one experience's availability dates, soonest first. Errors propagate. */
export async function listExperienceAvailability(
  supabase: SupabaseClient<Database>,
  experienceId: string,
): Promise<ExperienceAvailability[]> {
  const { data, error } = await supabase
    .from('experience_availability')
    .select('id, date, capacity, booked_count, status')
    .eq('experience_id', experienceId)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    capacity: r.capacity as number,
    bookedCount: r.booked_count as number,
    status: r.status as ExperienceAvailability['status'],
  }))
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/experiences.availability-queries.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Write the failing test for the actions module**

```typescript
// apps/web/tests/experiences.availability-actions.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireMerchantActionMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ from: fromMock }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addAvailabilityDateAction, closeAvailabilityDateAction } from '@/lib/experiences/availability-actions'

beforeEach(() => {
  requireMerchantActionMock.mockReset()
  fromMock.mockReset()
})

describe('addAvailabilityDateAction', () => {
  it('rejects a non-merchant caller before touching the database', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns field errors for invalid input without touching the database', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const res = await addAvailabilityDateAction('exp1', { date: 'not-a-date', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.date).toBeTruthy()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns a friendly error when the experience is not owned by the caller', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('inserts a new availability row for an owned experience', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock
      .mockReturnValueOnce({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'exp1' }, error: null }) }) }) }),
      })
      .mockReturnValueOnce({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'avail1' }, error: null }) }) }),
      })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.id).toBe('avail1')
  })

  it('maps a duplicate-date unique violation to a friendly message', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock
      .mockReturnValueOnce({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'exp1' }, error: null }) }) }) }),
      })
      .mockReturnValueOnce({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } }) }) }),
      })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })
})

describe('closeAvailabilityDateAction', () => {
  it('rejects a non-merchant caller before touching the database', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await closeAvailabilityDateAction('exp1', 'avail1', { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('closes an owned availability row', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock.mockReturnValueOnce({
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'avail1' }, error: null }) }) }) }) }),
    })
    const res = await closeAvailabilityDateAction('exp1', 'avail1', { locale: 'en' })
    expect(res.ok).toBe(true)
  })

  it('returns a friendly error when RLS blocks the update (not owned)', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock.mockReturnValueOnce({
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
    })
    const res = await closeAvailabilityDateAction('exp1', 'avail1', { locale: 'en' })
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 8: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/experiences.availability-actions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/experiences/availability-actions'`

- [ ] **Step 9: Write the actions module**

```typescript
// apps/web/lib/experiences/availability-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { validateAvailabilityInput, type ValidationErrors } from '@/lib/experiences/availability-validation'
import type { AvailabilityInput } from '@/lib/experiences/availability-types'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
const availabilityPath = (locale: Locale, experienceId: string) =>
  `/${locale}/merchants/dashboard/experiences/${experienceId}/availability`

export async function addAvailabilityDateAction(
  experienceId: string,
  rawInput: AvailabilityInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const validation = validateAvailabilityInput(rawInput)
  if (!validation.ok) return validation
  const p = validation.parsed

  const { data: experience } = await supabase
    .from('experiences')
    .select('id')
    .eq('id', experienceId)
    .eq('merchant_profile_id', gate.merchantId)
    .maybeSingle()
  if (!experience) return formError('Experience not found')

  const { data, error } = await supabase
    .from('experience_availability')
    .insert({ experience_id: experienceId, date: p.date, capacity: p.capacity })
    .select('id')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return formError('A date already exists for this experience')
    if (error) console.error('[experiences:availability] add failed', error)
    return formError('Date could not be saved')
  }

  revalidatePath(availabilityPath(options.locale, experienceId))
  return { ok: true, id: data.id as string }
}

export async function closeAvailabilityDateAction(
  experienceId: string,
  id: string,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('experience_availability')
    .update({ status: 'closed' })
    .eq('id', id)
    .eq('experience_id', experienceId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[experiences:availability] close failed', error)
    return formError('Date could not be closed')
  }

  revalidatePath(availabilityPath(options.locale, experienceId))
  return { ok: true, id }
}
```

- [ ] **Step 10: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/experiences.availability-actions.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/experiences/availability-types.ts apps/web/lib/experiences/availability-validation.ts apps/web/lib/experiences/availability-queries.ts apps/web/lib/experiences/availability-actions.ts apps/web/tests/experiences.availability-actions.test.ts apps/web/tests/experiences.availability-queries.test.ts
git commit -m "feat(web): merchant-owned availability CRUD (queries + actions)"
```

---

### Task 6: Availability dashboard page, view component, and the "Manage availability" link

**Files:**
- Create: `apps/web/components/kinnso/pages/MerchantAvailabilityView.tsx`
- Create: `apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page.tsx`
- Modify: `apps/web/components/kinnso/pages/MerchantExperiencesView.tsx`
- Test: `apps/web/tests/merchants.availability.host.test.tsx`

- [ ] **Step 1: Write the view component**

```typescript
// apps/web/components/kinnso/pages/MerchantAvailabilityView.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { addAvailabilityDateAction, closeAvailabilityDateAction } from '@/lib/experiences/availability-actions'
import type { ExperienceAvailability } from '@/lib/experiences/availability-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

export function MerchantAvailabilityView({ locale, t, experienceId, experienceTitle, availability }: {
  locale: Locale; t: T; experienceId: string; experienceTitle: string; availability: ExperienceAvailability[]
}) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [capacity, setCapacity] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const p = (path: string) => `/${locale}${path}`
  const fieldClass = 'min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm'

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const res = await addAvailabilityDateAction(experienceId, { date, capacity }, { locale })
      if (res.ok) {
        setDate('')
        setCapacity('')
        router.refresh()
      } else {
        setFormError(res.errors.form?.[0] ?? res.errors.date?.[0] ?? res.errors.capacity?.[0] ?? t.errorGeneric)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleClose(id: string) {
    setBusyId(id)
    try {
      const res = await closeAvailabilityDateAction(experienceId, id, { locale })
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{experienceTitle}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.availTitle}</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-kinnso-ink/70">{t.availSubtitle}</p>
        <Link href={p('/merchants/dashboard/experiences')} className="mt-4 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">
          {t.availBackToExperience}
        </Link>
      </SectionShell>
      <SectionShell className="k2-hairline">
        <h2 className="text-lg font-semibold text-kinnso-ink">{t.availAddHeading}</h2>
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t.fieldDate}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.fieldCapacity}
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`${fieldClass} w-28`} required />
          </label>
          <button type="submit" disabled={busy} className="k2-btn-primary disabled:opacity-50">{t.addDateCta}</button>
          {formError ? <p className="w-full text-sm text-red-600">{formError}</p> : null}
        </form>
      </SectionShell>
      <SectionShell className="k2-hairline">
        {availability.length === 0 ? (
          <p className="text-kinnso-muted">{t.availEmpty}</p>
        ) : (
          <div className="grid gap-3">
            {availability.map((a) => (
              <div key={a.id} className="k2-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-kinnso-ink">{a.date}</p>
                  <p className="mt-1 text-sm text-kinnso-muted">
                    {t.colBooked}: {a.bookedCount}/{a.capacity} · {a.status === 'open' ? t.statusOpen : t.statusClosed}
                  </p>
                </div>
                {a.status === 'open' ? (
                  <button onClick={() => handleClose(a.id)} disabled={busyId === a.id}
                    className="k2-btn-ghost text-sm disabled:opacity-50">{t.actClose}</button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionShell>
    </main>
  )
}

export default MerchantAvailabilityView
```

- [ ] **Step 2: Write the page**

```typescript
// apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMyExperience } from '@/lib/experiences/queries'
import { listExperienceAvailability } from '@/lib/experiences/availability-queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantAvailabilityView } from '@/components/kinnso/pages/MerchantAvailabilityView'

export const metadata: Metadata = noindexMetadata()

export default async function ExperienceAvailabilityPage({ params }: {
  params: Promise<{ locale: string; experienceId: string }>
}) {
  const { locale, experienceId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const { data: profile } = await supabase
    .from('merchant_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!profile) notFound()
  const experience = await getMyExperience(supabase, profile.id as string, experienceId)
  if (!experience) notFound()
  const availability = await listExperienceAvailability(supabase, experienceId)
  const messages = await getDictionary(loc)
  return (
    <MerchantAvailabilityView
      locale={loc}
      t={messages.merchantDashboard}
      experienceId={experienceId}
      experienceTitle={experience.title}
      availability={availability}
    />
  )
}
```

- [ ] **Step 3: Add the "Manage availability" link to the experiences list**

In `apps/web/components/kinnso/pages/MerchantExperiencesView.tsx`, add a link next to the
existing "Edit" link (inside the `<div className="flex shrink-0 items-center gap-3">`
block):

```typescript
                  <Link href={p(`/merchants/dashboard/experiences/${exp.id}/edit`)}
                    className="text-sm font-semibold text-kinnso-orangeDark hover:underline">{t.actEdit}</Link>
                  <Link href={p(`/merchants/dashboard/experiences/${exp.id}/availability`)}
                    className="text-sm font-semibold text-kinnso-orangeDark hover:underline">{t.actAvailability}</Link>
```

(This is the only change to that file — everything else stays as-is.)

- [ ] **Step 4: Write the host test**

```typescript
// apps/web/tests/merchants.availability.host.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MerchantAvailabilityView } from '@/components/kinnso/pages/MerchantAvailabilityView'
import en from '@/lib/i18n/messages/en'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

describe('MerchantAvailabilityView', () => {
  it('renders the experience title, empty state, and add-date form', () => {
    render(
      <MerchantAvailabilityView
        locale="en"
        t={en.merchantDashboard}
        experienceId="exp1"
        experienceTitle="Tokyo After-Hours Izakaya Crawl"
        availability={[]}
      />,
    )
    expect(screen.getByText('Tokyo After-Hours Izakaya Crawl')).toBeInTheDocument()
    expect(screen.getByText(en.merchantDashboard.availEmpty)).toBeInTheDocument()
    expect(screen.getByText(en.merchantDashboard.addDateCta)).toBeInTheDocument()
  })

  it('renders existing availability rows with booked/capacity and status', () => {
    render(
      <MerchantAvailabilityView
        locale="en"
        t={en.merchantDashboard}
        experienceId="exp1"
        experienceTitle="Tokyo After-Hours Izakaya Crawl"
        availability={[{ id: 'a1', date: '2026-08-01', capacity: 10, bookedCount: 2, status: 'open' }]}
      />,
    )
    expect(screen.getByText('2026-08-01')).toBeInTheDocument()
    expect(screen.getByText(en.merchantDashboard.actClose)).toBeInTheDocument()
  })

  it('does not render a close button for an already-closed date', () => {
    render(
      <MerchantAvailabilityView
        locale="en"
        t={en.merchantDashboard}
        experienceId="exp1"
        experienceTitle="Tokyo After-Hours Izakaya Crawl"
        availability={[{ id: 'a1', date: '2026-08-01', capacity: 10, bookedCount: 10, status: 'closed' }]}
      />,
    )
    expect(screen.queryByText(en.merchantDashboard.actClose)).not.toBeInTheDocument()
  })
})
```

Note: this test imports `en` directly (not a mocked dictionary) since `MerchantAvailabilityView`
is a pure presentational client component — the `Messages['merchantDashboard']` keys used
here (`availEmpty`, `addDateCta`, `actClose`) are added in Task 7 below; this test will
fail to compile/run until Task 7 lands, which is expected — Task 7 runs immediately after
this one, before either is committed... actually run this test AFTER Task 7 (see Step 5).

- [ ] **Step 5: Run to verify it passes (after Task 7's i18n keys exist)**

Run: `cd apps/web && npx vitest run tests/merchants.availability.host.test.tsx`
Expected: PASS (3 tests) — only once Task 7's `en.ts` additions are in place.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/MerchantAvailabilityView.tsx apps/web/app/\[locale\]/merchants/dashboard/experiences/\[experienceId\]/availability/page.tsx apps/web/components/kinnso/pages/MerchantExperiencesView.tsx apps/web/tests/merchants.availability.host.test.tsx
git commit -m "feat(web): merchant availability calendar page + dashboard link"
```

(If your shell requires it, quote the bracketed paths: `"apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page.tsx"`.)

---

### Task 7: i18n — extend `MerchantDashboardMessages` across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`

- [ ] **Step 1: Extend the `MerchantDashboardMessages` interface in `en.ts`**

In `apps/web/lib/i18n/messages/en.ts`, add these keys inside `export interface
MerchantDashboardMessages { ... }` (`en.ts:75-136`), immediately before the closing `}`
at line 136:

```typescript
  actAvailability: string
  availTitle: string
  availSubtitle: string
  availBackToExperience: string
  availAddHeading: string
  fieldDate: string
  fieldCapacity: string
  addDateCta: string
  availEmpty: string
  colDate: string
  colCapacity: string
  colBooked: string
  statusOpen: string
  statusClosed: string
  actClose: string
  errInvalidDate: string
  errDuplicateDate: string
```

- [ ] **Step 2: Add the English object literal keys in `en.ts`**

Inside the `merchantDashboard: { ... }` object literal (`en.ts:1953+`), immediately
after the existing `errInvalidNumber: '...',` line (the last key before the closing
`},`):

```typescript
    actAvailability: 'Availability',
    availTitle: 'Manage availability',
    availSubtitle: 'Add the dates travellers can book, with a capacity for each.',
    availBackToExperience: 'Back to experiences',
    availAddHeading: 'Add a date',
    fieldDate: 'Date',
    fieldCapacity: 'Capacity',
    addDateCta: 'Add date',
    availEmpty: 'No availability yet. Add your first bookable date.',
    colDate: 'Date',
    colCapacity: 'Capacity',
    colBooked: 'Booked',
    statusOpen: 'Open',
    statusClosed: 'Closed',
    actClose: 'Close',
    errInvalidDate: 'Enter a valid date',
    errDuplicateDate: 'This date already exists for this experience',
```

- [ ] **Step 3: Add the matching translated block to `zh-hk.ts`**

Inside its `merchantDashboard` object literal (mirrors `en.ts`'s key set exactly, no
interface to update — only `en.ts` defines `Messages`):

```typescript
    actAvailability: '可訂日子',
    availTitle: '管理可訂日子',
    availSubtitle: '加入旅客可以預訂嘅日子,每個日子set一個名額上限。',
    availBackToExperience: '返回體驗列表',
    availAddHeading: '新增日子',
    fieldDate: '日期',
    fieldCapacity: '名額',
    addDateCta: '新增日期',
    availEmpty: '仲未有可訂日子,加入你第一個可預訂日期啦。',
    colDate: '日期',
    colCapacity: '名額',
    colBooked: '已訂',
    statusOpen: '開放中',
    statusClosed: '已關閉',
    actClose: '關閉',
    errInvalidDate: '請輸入有效日期',
    errDuplicateDate: '呢個日期已經存在',
```

- [ ] **Step 4: Add the matching translated block to `zh-tw.ts`**

```typescript
    actAvailability: '可訂日期',
    availTitle: '管理可訂日期',
    availSubtitle: '新增旅客可以預訂的日期,並設定每個日期的名額上限。',
    availBackToExperience: '返回體驗列表',
    availAddHeading: '新增日期',
    fieldDate: '日期',
    fieldCapacity: '名額',
    addDateCta: '新增日期',
    availEmpty: '尚無可訂日期,新增你的第一個可預訂日期吧。',
    colDate: '日期',
    colCapacity: '名額',
    colBooked: '已預訂',
    statusOpen: '開放中',
    statusClosed: '已關閉',
    actClose: '關閉',
    errInvalidDate: '請輸入有效日期',
    errDuplicateDate: '這個日期已經存在',
```

- [ ] **Step 5: Add the matching translated block to `zh-cn.ts`**

```typescript
    actAvailability: '可订日期',
    availTitle: '管理可订日期',
    availSubtitle: '添加旅客可以预订的日期,并为每个日期设置名额上限。',
    availBackToExperience: '返回体验列表',
    availAddHeading: '新增日期',
    fieldDate: '日期',
    fieldCapacity: '名额',
    addDateCta: '新增日期',
    availEmpty: '尚无可订日期,添加你的第一个可预订日期吧。',
    colDate: '日期',
    colCapacity: '名额',
    colBooked: '已预订',
    statusOpen: '开放中',
    statusClosed: '已关闭',
    actClose: '关闭',
    errInvalidDate: '请输入有效日期',
    errDuplicateDate: '该日期已经存在',
```

- [ ] **Step 6: Add the matching translated block to `ja.ts`**

```typescript
    actAvailability: '予約可能日',
    availTitle: '予約可能日を管理',
    availSubtitle: '旅行者が予約できる日付を追加し、それぞれの定員を設定します。',
    availBackToExperience: '体験一覧に戻る',
    availAddHeading: '日付を追加',
    fieldDate: '日付',
    fieldCapacity: '定員',
    addDateCta: '日付を追加',
    availEmpty: 'まだ予約可能日がありません。最初の予約可能日を追加しましょう。',
    colDate: '日付',
    colCapacity: '定員',
    colBooked: '予約済み',
    statusOpen: '受付中',
    statusClosed: '締切',
    actClose: '締め切る',
    errInvalidDate: '有効な日付を入力してください',
    errDuplicateDate: 'この日付はすでに登録されています',
```

- [ ] **Step 7: Add the matching translated block to `ko.ts`**

```typescript
    actAvailability: '예약 가능일',
    availTitle: '예약 가능일 관리',
    availSubtitle: '여행자가 예약할 수 있는 날짜를 추가하고 날짜마다 정원을 설정하세요.',
    availBackToExperience: '체험 목록으로 돌아가기',
    availAddHeading: '날짜 추가',
    fieldDate: '날짜',
    fieldCapacity: '정원',
    addDateCta: '날짜 추가',
    availEmpty: '아직 예약 가능일이 없습니다. 첫 예약 가능일을 추가해 보세요.',
    colDate: '날짜',
    colCapacity: '정원',
    colBooked: '예약됨',
    statusOpen: '오픈',
    statusClosed: '마감',
    actClose: '마감하기',
    errInvalidDate: '유효한 날짜를 입력하세요',
    errDuplicateDate: '이 날짜는 이미 등록되어 있습니다',
```

- [ ] **Step 8: Add the matching translated block to `th.ts`**

```typescript
    actAvailability: 'วันที่เปิดจอง',
    availTitle: 'จัดการวันที่เปิดจอง',
    availSubtitle: 'เพิ่มวันที่นักท่องเที่ยวสามารถจองได้ พร้อมกำหนดจำนวนที่นั่งสูงสุดแต่ละวัน',
    availBackToExperience: 'กลับไปที่รายการประสบการณ์',
    availAddHeading: 'เพิ่มวันที่',
    fieldDate: 'วันที่',
    fieldCapacity: 'จำนวนที่นั่ง',
    addDateCta: 'เพิ่มวันที่',
    availEmpty: 'ยังไม่มีวันที่เปิดจอง เพิ่มวันที่แรกของคุณเลย',
    colDate: 'วันที่',
    colCapacity: 'จำนวนที่นั่ง',
    colBooked: 'จองแล้ว',
    statusOpen: 'เปิดจอง',
    statusClosed: 'ปิดแล้ว',
    actClose: 'ปิดรับจอง',
    errInvalidDate: 'กรุณากรอกวันที่ให้ถูกต้อง',
    errDuplicateDate: 'วันที่นี้มีอยู่แล้ว',
```

- [ ] **Step 9: Run the i18n parity test**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS — every locale now has the same key set inside `merchantDashboard`.

- [ ] **Step 10: Now run Task 6's host test (deferred from Task 6 Step 5)**

Run: `cd apps/web && npx vitest run tests/merchants.availability.host.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/i18n/messages/en.ts apps/web/lib/i18n/messages/zh-hk.ts apps/web/lib/i18n/messages/zh-tw.ts apps/web/lib/i18n/messages/zh-cn.ts apps/web/lib/i18n/messages/ja.ts apps/web/lib/i18n/messages/ko.ts apps/web/lib/i18n/messages/th.ts
git commit -m "i18n(web): merchant availability calendar strings across all 7 locales"
```

---

### Task 8: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd apps/web && npx eslint . --max-warnings=0` (or `pnpm --filter web lint` from
repo root)
Expected: no errors.

- [ ] **Step 3: Run every test file this plan touched or added, scoped**

Run: `cd apps/web && npx vitest run tests/auth.viewer-role.test.ts tests/auth.useViewerRole.test.tsx tests/experiences.availability-actions.test.ts tests/experiences.availability-queries.test.ts tests/merchants.availability.host.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS, all files.

- [ ] **Step 4: Spot-check the blast-radius audit files did not need changes**

Run: `cd apps/web && npx vitest run tests/` filtered to any existing test file covering
the 11 audited call sites (e.g. an existing `studio.*` or `perks.*` test, if one exists —
grep `find apps/web/tests -iname "*studio*" -o -iname "*perks*" -o -iname "*copilot*"`
first). If any exist, run them and confirm they still pass unmodified — this is the
concrete confirmation that the Ground Truth section's blast-radius analysis held.

- [ ] **Step 5: Route/i18n parity**

Run: `cd apps/web && npx vitest run tests/kinnso.route-parity.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Final commit (only if any of the above required fixes)**

If Steps 1-5 were all green with no changes needed, there is nothing to commit here. If
a fix was required, commit it with a message describing exactly what verification step
caught it.

---

## Exit criteria

- Any authenticated user with no active creator profile and no merchant/ops row now
  resolves to `'traveler'` (both server and client), with zero code changes required at
  any of the 11 existing `!== 'creator'` gate call sites (verified in Task 8 Step 4).
- `traveler_profiles`, `experience_availability`, `bookings`, and `booking_events` exist
  live with complete RLS matching the design spec's D-R3-3 shape; `bookings` has no
  UPDATE grant for any role (status transitions are deferred to R3A-2/R3B's audited
  RPCs).
- A merchant can add and close per-date capacity rows for any of their own published
  experiences from `/merchants/dashboard/experiences/[experienceId]/availability`, with
  no public booking UI yet (that ships in R3A-2, per
  `docs/superpowers/specs/2026-07-04-phase-r3-booking-mvp-design.md` §7).

## Out of scope (this plan — see R3A-2)

Stripe Checkout Session creation, the Stripe webhook, the public booking widget
replacing `/experiences/[slug]`'s "Booking opens soon" state, the booking confirmation
page, guest-checkout abuse rate-limiting, `booking_events`-writing RPCs, and any
`booking_settlements`/merchant-booking-pipeline UI (R3B). This plan is schema- and
merchant-tooling-complete for booking; R3A-2 makes booking actually happen.
