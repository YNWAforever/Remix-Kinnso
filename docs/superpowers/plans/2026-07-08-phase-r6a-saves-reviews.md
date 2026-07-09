# Phase R6A — Saves & Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real save/unsave on guides and experiences (closing the gap where
`guides.saves_count` has existed since R1 but nothing ever wrote to it), and post-booking
star+text reviews gated on `bookings.status = 'completed'`, feeding an `aggregateRating`
field on guide and experience JSON-LD.

**Architecture:** Two new parallel save tables (`guide_saves`, `experience_saves`), each
with its own owner-scoped RLS and a trigger that maintains the content table's
`saves_count`. One new `reviews` table, insert-gated by RLS against the real booking
(never trusted from the client), with `experience_id`/`guide_id` denormalized onto the
row at insert time so public reads never have to join through `bookings`' owner-locked
RLS. New `lib/saves/` and `lib/reviews/` domains (cross-cutting guides+experiences,
matching the design spec's own testing-section naming) sit alongside the existing
per-content-type domains. Four UI surfaces: the guide detail page hero, the experience
detail page hero, the experience "booked" confirmation page's `completed` branch, and the
`/trips` page (real Saved sections + inline review CTA per completed booking).

**Tech Stack:** Next.js 16 App Router (Server Components + `'use server'` actions),
Supabase Postgres + RLS, Vitest 4 + Testing Library, this project's custom i18n
(`lib/i18n/messages/*.ts`, 7 locales).

**Design spec:** `docs/superpowers/specs/2026-07-08-phase-r6a-saves-reviews-design.md`
(decisions D-R6A-1..8).

**Scope note on save-toggle UI placement** (resolved during planning, not fully pinned in
the design spec): the design spec's "wired into GuideCard, the guide detail page,
ExperienceCard (new), and the experience detail page" names four integration points. This
plan wires all four for real, but deliberately does **not** thread live per-viewer saved
state into `GuideCard`'s three *pre-existing* consumers (`ArticleGuideLinks.tsx`,
`ExploreView.tsx`, `CreatorProfileView.tsx`) — that would require new auth-aware
data-fetching on three unresearched pages, well beyond this phase's actual required
surfaces. `GuideCard` gains the toggle capability as **optional** props
(`isSaved?`, `onSaveToggle?`) so those three call sites compile and render exactly as
today with zero changes. The toggle is genuinely wired only where the spec unambiguously
requires it: the guide detail page's own hero, the experience detail page's own hero, and
the new `/trips` Saved sections (which reuse `GuideCard`/the new `ExperienceCard` with the
optional props supplied). Wiring the remaining three `GuideCard` call sites is a
fast, well-understood follow-up once R6A ships (no new backend work — `isGuideSaved`
already exists by then) and should be called out to the user as an explicit, known gap
rather than silently left inconsistent.

---

## File Structure

**New files:**
- `supabase/migrations/20260706090000_r6a_saves_and_reviews.sql` — `guide_saves`,
  `experience_saves` (+ `experiences.saves_count` column), `reviews`, triggers, RLS,
  and an extension of `get_booking_by_checkout_session`
- `apps/web/tests/db.r6a-saves-and-reviews.test.ts` — SQL-assertion test for the above
- `apps/web/lib/admin/guard.ts` — MODIFY: add `requireTravelerAction`
- `apps/web/lib/saves/guide-actions.ts` — `saveGuideAction` / `unsaveGuideAction`
- `apps/web/lib/saves/guide-queries.ts` — `listSavedGuides` / `isGuideSaved`
- `apps/web/lib/saves/experience-actions.ts` — `saveExperienceAction` / `unsaveExperienceAction`
- `apps/web/lib/saves/experience-queries.ts` — `listSavedExperiences` / `isExperienceSaved`
- `apps/web/lib/reviews/types.ts` — `Review`, `RatingAggregate`
- `apps/web/lib/reviews/queries.ts` — rating aggregates, published-review lists, `hasReviewForBooking`
- `apps/web/lib/reviews/validation.ts` — `validateReviewInput`
- `apps/web/lib/reviews/actions.ts` — `submitReviewAction`
- `apps/web/tests/saves.guide-actions.test.ts`, `saves.guide-queries.test.ts`,
  `saves.experience-actions.test.ts`, `saves.experience-queries.test.ts`,
  `reviews.queries.test.ts`, `reviews.actions.test.ts`
- `apps/web/components/kinnso/GuideSaveButton.tsx` — dedicated hero-context save toggle
- `apps/web/components/kinnso/ExperienceSaveButton.tsx` — same, for experiences
- `apps/web/components/kinnso/ExperienceCard.tsx` — new compact reusable experience card
- `apps/web/components/kinnso/ReviewForm.tsx` — star rating + optional text form
- `apps/web/tests/kinnso.guide-save-button.test.tsx`, `kinnso.experience-card.test.tsx`,
  `kinnso.review-form.test.tsx`

**Modified files:**
- `apps/web/lib/bookings/types.ts`, `apps/web/lib/bookings/queries.ts` — add
  `experienceId`, `guideId`, `reviewId` to `TravelerBookingRow` / `listMyBookings`
- `apps/web/lib/experiences/booking-confirmation-queries.ts` — extend `BookingConfirmation`
  with `travelerUserId`, `experienceId`, `guideId`
- `apps/web/lib/seo/jsonld.ts` — optional `aggregateRating` on `articleJsonLd` and
  `experienceOfferJsonLd`
- `apps/web/app/[locale]/g/[slug]/page.tsx` — wire save toggle, rating aggregate, reviews
- `apps/web/components/kinnso/pages/ExperiencePublicView.tsx` +
  `apps/web/app/[locale]/experiences/[slug]/page.tsx` — same, for experiences
- `apps/web/app/[locale]/experiences/[slug]/booked/page.tsx` — review CTA on the
  `completed` branch
- `apps/web/components/kinnso/GuideCard.tsx` — optional `isSaved`/`onSaveToggle` props
- `apps/web/components/kinnso/pages/TravelerTripsView.tsx` +
  `apps/web/app/[locale]/trips/page.tsx` — real Saved sections, inline review CTA
- `apps/web/lib/i18n/messages/en.ts` (+ 6 other locale files) — `guideSave`,
  `experienceSave`, `reviews` groups; extend `TravelerTripsMessages`
- `apps/web/tests/jsonld.test.ts`, `bookings.queries.test.ts`,
  `experiences.booking-confirmation-queries.test.ts`,
  `experiences.booking-confirmation.host.test.tsx`, `g.slug.host.test.tsx`,
  `experiences.public-detail.host.test.tsx`, `trips.host.test.tsx`

---

## Task 1: Migration — `guide_saves` + `experience_saves` (+ `saves_count` triggers, RLS)

**Files:**
- Create: `supabase/migrations/20260706090000_r6a_saves_and_reviews.sql`
- Test: `apps/web/tests/db.r6a-saves-and-reviews.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/db.r6a-saves-and-reviews.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260706090000_r6a_saves_and_reviews.sql'),
  'utf8',
)

describe('R6A guide_saves + experience_saves migration', () => {
  it('creates guide_saves with a uuid PK, FK columns, and a uniqueness constraint', () => {
    expect(sql).toContain('create table public.guide_saves')
    expect(sql).toContain('guide_id uuid not null references public.guides(id) on delete cascade')
    expect(sql).toContain('traveler_user_id uuid not null references auth.users(id) on delete cascade')
    expect(sql).toContain('unique (guide_id, traveler_user_id)')
  })

  it('guide_saves RLS: owner-scoped, no anon grant, direct auth.uid() equality (not a subquery)', () => {
    expect(sql).toContain('create policy guide_saves_owner_all on public.guide_saves')
    expect(sql).toContain('using (traveler_user_id = auth.uid())')
    expect(sql).toContain('with check (traveler_user_id = auth.uid())')
    expect(sql).toMatch(/revoke all on public\.guide_saves from anon, authenticated/)
    expect(sql).toMatch(/grant select, insert, delete on public\.guide_saves to authenticated/)
  })

  it('adds experiences.saves_count and creates experience_saves with the same shape', () => {
    expect(sql).toContain('alter table public.experiences add column saves_count integer not null default 0')
    expect(sql).toContain('create table public.experience_saves')
    expect(sql).toContain('experience_id uuid not null references public.experiences(id) on delete cascade')
    expect(sql).toContain('unique (experience_id, traveler_user_id)')
    expect(sql).toContain('create policy experience_saves_owner_all on public.experience_saves')
  })

  it('both save tables get a count-sync trigger, and the trigger functions have no client-role grant', () => {
    expect(sql).toMatch(/create trigger guide_saves_sync_count_trigger\s+after insert or delete on public\.guide_saves/)
    expect(sql).toContain('update public.guides set saves_count = saves_count + 1 where id = new.guide_id')
    expect(sql).toContain('update public.guides set saves_count = greatest(saves_count - 1, 0) where id = old.guide_id')
    expect(sql).toMatch(/create trigger experience_saves_sync_count_trigger\s+after insert or delete on public\.experience_saves/)
    expect(sql).toContain('update public.experiences set saves_count = saves_count + 1 where id = new.experience_id')
    expect(sql).toContain('update public.experiences set saves_count = greatest(saves_count - 1, 0) where id = old.experience_id')
    expect(sql).toMatch(/revoke all on function public\.guide_saves_sync_count\(\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/revoke all on function public\.experience_saves_sync_count\(\) from public, anon, authenticated, service_role/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run db.r6a-saves-and-reviews`
Expected: FAIL — `ENOENT` reading the migration file (it doesn't exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- R6A (design doc D-R6A-1..8): traveller-facing saves on guides/experiences, and
-- post-booking star+text reviews feeding aggregateRating JSON-LD. Two parallel save
-- tables (not one polymorphic table) mirror the agent_rate_limits/checkout_rate_limits
-- "one table per feature" convention. reviews (added in a later section of this same
-- file) denormalizes experience_id/guide_id from the booking at insert time -- see
-- that section's own comment for why.

-- ── 1. guide_saves ────────────────────────────────────────────────────────────
create table public.guide_saves (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, traveler_user_id)
);

alter table public.guide_saves enable row level security;

create policy guide_saves_owner_all on public.guide_saves
  for all to authenticated
  using (traveler_user_id = auth.uid())
  with check (traveler_user_id = auth.uid());

revoke all on public.guide_saves from anon, authenticated;
grant select, insert, delete on public.guide_saves to authenticated;

create or replace function public.guide_saves_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.guides set saves_count = saves_count + 1 where id = new.guide_id;
  elsif (TG_OP = 'DELETE') then
    update public.guides set saves_count = greatest(saves_count - 1, 0) where id = old.guide_id;
  end if;
  return null;
end;
$$;

create trigger guide_saves_sync_count_trigger
  after insert or delete on public.guide_saves
  for each row execute procedure public.guide_saves_sync_count();

revoke all on function public.guide_saves_sync_count() from public, anon, authenticated, service_role;

-- ── 2. experience_saves ──────────────────────────────────────────────────────
alter table public.experiences add column saves_count integer not null default 0;

create table public.experience_saves (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (experience_id, traveler_user_id)
);

alter table public.experience_saves enable row level security;

create policy experience_saves_owner_all on public.experience_saves
  for all to authenticated
  using (traveler_user_id = auth.uid())
  with check (traveler_user_id = auth.uid());

revoke all on public.experience_saves from anon, authenticated;
grant select, insert, delete on public.experience_saves to authenticated;

create or replace function public.experience_saves_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.experiences set saves_count = saves_count + 1 where id = new.experience_id;
  elsif (TG_OP = 'DELETE') then
    update public.experiences set saves_count = greatest(saves_count - 1, 0) where id = old.experience_id;
  end if;
  return null;
end;
$$;

create trigger experience_saves_sync_count_trigger
  after insert or delete on public.experience_saves
  for each row execute procedure public.experience_saves_sync_count();

revoke all on function public.experience_saves_sync_count() from public, anon, authenticated, service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run db.r6a-saves-and-reviews`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260706090000_r6a_saves_and_reviews.sql apps/web/tests/db.r6a-saves-and-reviews.test.ts
git commit -m "feat(db): R6A guide_saves + experience_saves tables, RLS, count triggers"
```

---

## Task 2: Migration — `reviews` table + `get_booking_by_checkout_session` extension

**Files:**
- Modify: `supabase/migrations/20260706090000_r6a_saves_and_reviews.sql` (append)
- Modify: `apps/web/tests/db.r6a-saves-and-reviews.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
// apps/web/tests/db.r6a-saves-and-reviews.test.ts -- add below the existing describe block
describe('R6A reviews table + get_booking_by_checkout_session extension', () => {
  it('creates reviews with denormalized experience_id/guide_id and a unique booking_id', () => {
    expect(sql).toContain('create table public.reviews')
    expect(sql).toContain('booking_id uuid not null unique references public.bookings(id) on delete cascade')
    expect(sql).toContain('experience_id uuid not null references public.experiences(id) on delete cascade')
    expect(sql).toContain('guide_id uuid references public.guides(id) on delete cascade')
    expect(sql).toContain("check (rating between 1 and 5)")
    expect(sql).toContain("check (status in ('published', 'hidden'))")
  })

  it('reviews_insert validates the booking is the caller\'s own, completed, and its id columns match exactly', () => {
    expect(sql).toContain('create policy reviews_insert on public.reviews')
    expect(sql).toContain('traveler_user_id = auth.uid()')
    expect(sql).toContain("b.status = 'completed'")
    expect(sql).toContain('b.experience_id = reviews.experience_id')
    expect(sql).toContain('b.guide_id is not distinct from reviews.guide_id')
  })

  it('reviews has both an owner-select and a public-published-only select policy', () => {
    expect(sql).toContain('create policy reviews_owner_select on public.reviews')
    expect(sql).toContain('using (traveler_user_id = auth.uid())')
    expect(sql).toContain('create policy reviews_public_select on public.reviews')
    expect(sql).toContain("using (status = 'published')")
  })

  it('reviews_ops_update is the only UPDATE policy, gated on is_active_ops()', () => {
    expect(sql).toContain('create policy reviews_ops_update on public.reviews')
    expect(sql).toContain('public.is_active_ops()')
  })

  it('extends get_booking_by_checkout_session with traveler_user_id, experience_id, and guide_id', () => {
    expect(sql).toMatch(/create or replace function public\.get_booking_by_checkout_session/)
    expect(sql).toContain('traveler_user_id uuid, experience_id uuid, guide_id uuid')
    expect(sql).toContain('b.traveler_user_id, b.experience_id, b.guide_id')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run db.r6a-saves-and-reviews`
Expected: FAIL — the new `it()` blocks fail (no `reviews` table / RPC extension in the file yet).

- [ ] **Step 3: Append the reviews table + RPC extension to the migration**

```sql
-- ── 3. reviews ────────────────────────────────────────────────────────────────
-- D-R6A-1: only a completed booking (merchant called mark_booking_completed) is
-- reviewable, never merely confirmed. D-R6A-4: only bookings with a real
-- traveler_user_id (not a guest checkout) are reviewable. experience_id/guide_id are
-- denormalized from the booking at insert time: bookings RLS restricts SELECT to a
-- booking's own traveller (or ops), so a public read that joined reviews to bookings
-- to resolve "which experience/guide is this for" would return zero rows for every
-- visitor except the reviewer. Copying the two id columns onto reviews means every
-- public read is scoped entirely by reviews' own RLS and never touches bookings.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  guide_id uuid references public.guides(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

create index reviews_experience_idx on public.reviews(experience_id) where status = 'published';
create index reviews_guide_idx on public.reviews(guide_id) where status = 'published';

alter table public.reviews enable row level security;

-- Unqualified column references inside the correlated subquery below would bind to
-- `bookings b`'s own columns (shadowing), not the candidate reviews row -- the
-- `reviews.` qualifier is required here, not decorative, to compare the NEW row's
-- experience_id/guide_id against the real booking rather than comparing b's columns
-- to themselves.
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (
    traveler_user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.traveler_user_id = auth.uid()
        and b.status = 'completed'
        and b.experience_id = reviews.experience_id
        and b.guide_id is not distinct from reviews.guide_id
    )
  );

create policy reviews_owner_select on public.reviews
  for select to authenticated
  using (traveler_user_id = auth.uid());

create policy reviews_public_select on public.reviews
  for select to anon, authenticated
  using (status = 'published');

create policy reviews_ops_update on public.reviews
  for update to authenticated
  using (public.is_active_ops())
  with check (public.is_active_ops());

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant update on public.reviews to authenticated;

-- Extend get_booking_by_checkout_session (20260704120000) with traveler_user_id,
-- experience_id, and guide_id so the "booked" confirmation page's completed branch can
-- (a) tell whether the signed-in viewer is the real traveler on the booking, never a
-- guest (D-R6A-4), and (b) submit a review whose experience_id/guide_id will actually
-- pass reviews_insert's check above. None of these are PII; safe for this anon-callable RPC.
create or replace function public.get_booking_by_checkout_session(p_session_id text)
returns table (
  booking_id uuid, status text, qty integer, total_amount numeric,
  currency text, experience_title text, experience_slug text,
  traveler_user_id uuid, experience_id uuid, guide_id uuid
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.status, b.qty, b.total_amount, b.currency, e.title, e.slug,
         b.traveler_user_id, b.experience_id, b.guide_id
  from public.bookings b
  join public.experiences e on e.id = b.experience_id
  where b.stripe_checkout_session_id = p_session_id;
$$;

revoke all on function public.get_booking_by_checkout_session(text) from public;
grant execute on function public.get_booking_by_checkout_session(text) to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run db.r6a-saves-and-reviews`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260706090000_r6a_saves_and_reviews.sql apps/web/tests/db.r6a-saves-and-reviews.test.ts
git commit -m "feat(db): R6A reviews table + RLS, extend get_booking_by_checkout_session"
```

---

## Task 3: Apply migration live + regenerate `@kinnso/db` types

> **This step touches the live Supabase project.** Per this program's standing practice,
> do NOT run this from a subagent without the orchestrator first getting a fresh,
> specific user confirmation for the migration-apply step. If a ledger-repair step is
> also needed afterward (per the "Supabase migration ledger drift" memory), that is a
> SEPARATE action requiring its own separate confirmation — never bundle the two.

**Files:** none (live infra + regenerated `packages/db/types.ts`)

- [ ] **Step 1:** Get explicit user confirmation to apply
  `supabase/migrations/20260706090000_r6a_saves_and_reviews.sql` to the live project.
- [ ] **Step 2:** Apply via `supabase db query --linked -f supabase/migrations/20260706090000_r6a_saves_and_reviews.sql`
  (never bare `db push`, per the migration-ledger-drift memory).
- [ ] **Step 3:** Get a separate explicit confirmation, then run
  `supabase migration repair --status applied --linked 20260706090000` if the ledger
  needs it.
- [ ] **Step 4:** Regenerate types: `cd packages/db && supabase gen types typescript --linked > types.ts`
  (run this directly rather than `pnpm --filter @kinnso/db gen`, which has silently
  produced an empty file twice before in this project).
- [ ] **Step 5:** Confirm `packages/db/types.ts` contains `guide_saves`, `experience_saves`,
  and `reviews` table types, and that `experiences.Row` has `saves_count`.
- [ ] **Step 6: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): regenerate types after R6A saves/reviews migration"
```

---

## Task 4: `requireTravelerAction` guard + `lib/saves/guide-actions.ts`

**Files:**
- Modify: `apps/web/lib/admin/guard.ts:45` (append after `requireMerchantAction`)
- Create: `apps/web/lib/saves/guide-actions.ts`
- Test: `apps/web/tests/saves.guide-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/saves.guide-actions.test.ts
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const { getUserMock, upsertMock, deleteEqMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  upsertMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
  deleteEqMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
}))
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table !== 'guide_saves') throw new Error(`unexpected table ${table}`)
      return {
        upsert: upsertMock,
        delete: () => ({ eq: () => ({ eq: deleteEqMock }) }),
      }
    },
  }),
}))

import { saveGuideAction, unsaveGuideAction } from '@/lib/saves/guide-actions'

describe('saveGuideAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await saveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('upserts the save for a signed-in traveller and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await saveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: true, guideId: 'g1' })
    expect(upsertMock).toHaveBeenCalledWith(
      { guide_id: 'g1', traveler_user_id: 'u1' },
      { onConflict: 'guide_id,traveler_user_id' },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })
})

describe('unsaveGuideAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await unsaveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('deletes the save for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await unsaveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: true, guideId: 'g1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run saves.guide-actions`
Expected: FAIL — `Cannot find module '@/lib/saves/guide-actions'`

- [ ] **Step 3: Add the guard, then write the action module**

Append to `apps/web/lib/admin/guard.ts` (after line 45, the closing `}` of `requireMerchantAction`):

```ts

/**
 * Action gate: typed failure for anon; ok+user for any signed-in traveller. No
 * role or profile-table lookup -- any authenticated user may save/review as a
 * traveller (D-R6A-4/D-R6A-6), unlike requireMerchantAction's ownership check.
 */
export async function requireTravelerAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  return { ok: true, user }
}
```

```ts
// apps/web/lib/saves/guide-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

const tripsPath = (locale: Locale) => `/${locale}/trips`

/** Save a guide to the traveller's list (idempotent upsert). */
export async function saveGuideAction(
  locale: Locale,
  guideId: string,
): Promise<ActionResult<{ guideId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('guide_saves')
    .upsert(
      { guide_id: guideId, traveler_user_id: gate.user.id },
      { onConflict: 'guide_id,traveler_user_id' },
    )
  if (error) return formError('Guide could not be saved')

  revalidatePath(tripsPath(locale))
  return { ok: true, guideId }
}

/** Remove a guide from the traveller's saved list. */
export async function unsaveGuideAction(
  locale: Locale,
  guideId: string,
): Promise<ActionResult<{ guideId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('guide_saves')
    .delete()
    .eq('guide_id', guideId)
    .eq('traveler_user_id', gate.user.id)
  if (error) return formError('Guide could not be removed')

  revalidatePath(tripsPath(locale))
  return { ok: true, guideId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run saves.guide-actions`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/guard.ts apps/web/lib/saves/guide-actions.ts apps/web/tests/saves.guide-actions.test.ts
git commit -m "feat(web): requireTravelerAction guard + saveGuideAction/unsaveGuideAction"
```

---

## Task 5: `lib/saves/guide-queries.ts`

**Files:**
- Create: `apps/web/lib/saves/guide-queries.ts`
- Test: `apps/web/tests/saves.guide-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/saves.guide-queries.test.ts
import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@supabase/supabase-js', () => ({}))

import { listSavedGuides, isGuideSaved } from '@/lib/saves/guide-queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('listSavedGuides', () => {
  it('maps the guide_saves -> guides embed to real Guide objects, dropping rows with no joinable guide', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            guide_id: 'g1',
            guides: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', city: 'Kyoto', cover_url: 'https://x/kyoto.jpg', saves_count: 6, creator_handle: 'teafan' },
          },
          { guide_id: 'g2', guides: null },
        ],
        error: null,
      }),
    )

    const rows = await listSavedGuides(supabaseMock as never, 'traveler-1')

    expect(rows).toEqual([
      { guideId: 'g1', guide: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', city: 'Kyoto', cover: 'https://x/kyoto.jpg', saves: 6, creatorHandle: 'teafan' } },
    ])
  })

  it('throws instead of swallowing a Supabase error', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: new Error('boom') }))
    await expect(listSavedGuides(supabaseMock as never, 'traveler-1')).rejects.toThrow('boom')
  })
})

describe('isGuideSaved', () => {
  it('returns true when a row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: { id: 's1' }, error: null }))
    expect(await isGuideSaved(supabaseMock as never, 'g1', 'traveler-1')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: null }))
    expect(await isGuideSaved(supabaseMock as never, 'g1', 'traveler-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run saves.guide-queries`
Expected: FAIL — module not found

- [ ] **Step 3: Write the query module**

```ts
// apps/web/lib/saves/guide-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { mapRowToGuide } from '@/lib/guides/queries'
import type { Guide } from '@/lib/guides/types'

export interface SavedGuideEntry {
  guideId: string
  guide: Guide
}

interface SavedGuideQueryRow {
  guide_id: string
  guides: { slug: string; title: string; city: string; cover_url: string; saves_count: number; creator_handle: string }
    | { slug: string; title: string; city: string; cover_url: string; saves_count: number; creator_handle: string }[]
    | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** The guides a traveller has saved, newest first. RLS scopes guide_saves to the caller. */
export async function listSavedGuides(
  supabase: SupabaseClient<Database>,
  travelerUserId: string,
): Promise<SavedGuideEntry[]> {
  const { data, error } = await supabase
    .from('guide_saves')
    .select('guide_id, guides(slug, title, city, cover_url, saves_count, creator_handle)')
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return ((data ?? []) as unknown as SavedGuideQueryRow[]).flatMap((row) => {
    const g = one(row.guides)
    if (!g) return []
    return [{ guideId: row.guide_id, guide: mapRowToGuide(g) }]
  })
}

/** Whether the given traveller has already saved this guide. */
export async function isGuideSaved(
  supabase: SupabaseClient<Database>,
  guideId: string,
  travelerUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('guide_saves')
    .select('id')
    .eq('guide_id', guideId)
    .eq('traveler_user_id', travelerUserId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run saves.guide-queries`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/saves/guide-queries.ts apps/web/tests/saves.guide-queries.test.ts
git commit -m "feat(web): listSavedGuides/isGuideSaved"
```

---

## Task 6: `lib/saves/experience-actions.ts`

**Files:**
- Create: `apps/web/lib/saves/experience-actions.ts`
- Test: `apps/web/tests/saves.experience-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/saves.experience-actions.test.ts
import { describe, expect, it, vi } from 'vitest'

const { getUserMock, upsertMock, deleteEqMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  upsertMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
  deleteEqMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
}))
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table !== 'experience_saves') throw new Error(`unexpected table ${table}`)
      return {
        upsert: upsertMock,
        delete: () => ({ eq: () => ({ eq: deleteEqMock }) }),
      }
    },
  }),
}))

import { saveExperienceAction, unsaveExperienceAction } from '@/lib/saves/experience-actions'

describe('saveExperienceAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await saveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('upserts the save for a signed-in traveller and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await saveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: true, experienceId: 'e1' })
    expect(upsertMock).toHaveBeenCalledWith(
      { experience_id: 'e1', traveler_user_id: 'u1' },
      { onConflict: 'experience_id,traveler_user_id' },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })
})

describe('unsaveExperienceAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await unsaveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('deletes the save for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await unsaveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: true, experienceId: 'e1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run saves.experience-actions`
Expected: FAIL — module not found

- [ ] **Step 3: Write the action module**

```ts
// apps/web/lib/saves/experience-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

const tripsPath = (locale: Locale) => `/${locale}/trips`

/** Save an experience to the traveller's list (idempotent upsert). */
export async function saveExperienceAction(
  locale: Locale,
  experienceId: string,
): Promise<ActionResult<{ experienceId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('experience_saves')
    .upsert(
      { experience_id: experienceId, traveler_user_id: gate.user.id },
      { onConflict: 'experience_id,traveler_user_id' },
    )
  if (error) return formError('Experience could not be saved')

  revalidatePath(tripsPath(locale))
  return { ok: true, experienceId }
}

/** Remove an experience from the traveller's saved list. */
export async function unsaveExperienceAction(
  locale: Locale,
  experienceId: string,
): Promise<ActionResult<{ experienceId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('experience_saves')
    .delete()
    .eq('experience_id', experienceId)
    .eq('traveler_user_id', gate.user.id)
  if (error) return formError('Experience could not be removed')

  revalidatePath(tripsPath(locale))
  return { ok: true, experienceId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run saves.experience-actions`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/saves/experience-actions.ts apps/web/tests/saves.experience-actions.test.ts
git commit -m "feat(web): saveExperienceAction/unsaveExperienceAction"
```

---

## Task 7: `lib/saves/experience-queries.ts`

**Files:**
- Create: `apps/web/lib/saves/experience-queries.ts`
- Test: `apps/web/tests/saves.experience-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/saves.experience-queries.test.ts
import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@supabase/supabase-js', () => ({}))

import { listSavedExperiences, isExperienceSaved } from '@/lib/saves/experience-queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('listSavedExperiences', () => {
  it('maps the experience_saves -> experiences embed, dropping rows with no joinable experience', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            experience_id: 'e1',
            experiences: { slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', price_amount: 480, currency: 'HKD', cover_url: null, saves_count: 3 },
          },
          { experience_id: 'e2', experiences: null },
        ],
        error: null,
      }),
    )

    const rows = await listSavedExperiences(supabaseMock as never, 'traveler-1')

    expect(rows).toEqual([
      { experienceId: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null, savesCount: 3 },
    ])
  })

  it('throws instead of swallowing a Supabase error', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: new Error('boom') }))
    await expect(listSavedExperiences(supabaseMock as never, 'traveler-1')).rejects.toThrow('boom')
  })
})

describe('isExperienceSaved', () => {
  it('returns true when a row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: { id: 's1' }, error: null }))
    expect(await isExperienceSaved(supabaseMock as never, 'e1', 'traveler-1')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: null }))
    expect(await isExperienceSaved(supabaseMock as never, 'e1', 'traveler-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run saves.experience-queries`
Expected: FAIL — module not found

- [ ] **Step 3: Write the query module**

```ts
// apps/web/lib/saves/experience-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export interface SavedExperienceEntry {
  experienceId: string
  slug: string
  title: string
  city: string
  priceAmount: number
  currency: string
  coverUrl: string | null
  savesCount: number
}

interface SavedExperienceQueryRow {
  experience_id: string
  experiences: {
    slug: string; title: string; city: string; price_amount: number
    currency: string; cover_url: string | null; saves_count: number
  } | Array<{
    slug: string; title: string; city: string; price_amount: number
    currency: string; cover_url: string | null; saves_count: number
  }> | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** The experiences a traveller has saved, newest first. RLS scopes experience_saves to the caller. */
export async function listSavedExperiences(
  supabase: SupabaseClient<Database>,
  travelerUserId: string,
): Promise<SavedExperienceEntry[]> {
  const { data, error } = await supabase
    .from('experience_saves')
    .select('experience_id, experiences(slug, title, city, price_amount, currency, cover_url, saves_count)')
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return ((data ?? []) as unknown as SavedExperienceQueryRow[]).flatMap((row) => {
    const e = one(row.experiences)
    if (!e) return []
    return [{
      experienceId: row.experience_id,
      slug: e.slug,
      title: e.title,
      city: e.city,
      priceAmount: Number(e.price_amount),
      currency: e.currency,
      coverUrl: e.cover_url,
      savesCount: e.saves_count,
    }]
  })
}

/** Whether the given traveller has already saved this experience. */
export async function isExperienceSaved(
  supabase: SupabaseClient<Database>,
  experienceId: string,
  travelerUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('experience_saves')
    .select('id')
    .eq('experience_id', experienceId)
    .eq('traveler_user_id', travelerUserId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run saves.experience-queries`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/saves/experience-queries.ts apps/web/tests/saves.experience-queries.test.ts
git commit -m "feat(web): listSavedExperiences/isExperienceSaved"
```

---

## Task 8: `lib/reviews/types.ts` + `lib/reviews/queries.ts`

**Files:**
- Create: `apps/web/lib/reviews/types.ts`
- Create: `apps/web/lib/reviews/queries.ts`
- Test: `apps/web/tests/reviews.queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/reviews.queries.test.ts
import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@supabase/supabase-js', () => ({}))

import {
  getExperienceRatingAggregate, getGuideRatingAggregate,
  listPublishedReviewsForExperience, listPublishedReviewsForGuide,
  hasReviewForBooking,
} from '@/lib/reviews/queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('getExperienceRatingAggregate', () => {
  it('averages ratings in application code', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: [{ rating: 5 }, { rating: 3 }], error: null }))
    expect(await getExperienceRatingAggregate(supabaseMock as never, 'e1')).toEqual({ average: 4, count: 2 })
  })

  it('returns null (never a fake zero) when there are no published reviews', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: [], error: null }))
    expect(await getExperienceRatingAggregate(supabaseMock as never, 'e1')).toBeNull()
  })
})

describe('getGuideRatingAggregate', () => {
  it('averages ratings attributed to the guide', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: [{ rating: 4 }], error: null }))
    expect(await getGuideRatingAggregate(supabaseMock as never, 'g1')).toEqual({ average: 4, count: 1 })
  })
})

describe('listPublishedReviewsForExperience / listPublishedReviewsForGuide', () => {
  it('maps rows to Review objects', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({ data: [{ id: 'r1', rating: 5, body: 'Great!', created_at: '2026-07-01T00:00:00Z' }], error: null }),
    )
    expect(await listPublishedReviewsForExperience(supabaseMock as never, 'e1')).toEqual([
      { id: 'r1', rating: 5, body: 'Great!', createdAt: '2026-07-01T00:00:00Z' },
    ])
  })

  it('maps a null body through unchanged', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({ data: [{ id: 'r2', rating: 3, body: null, created_at: '2026-07-02T00:00:00Z' }], error: null }),
    )
    expect(await listPublishedReviewsForGuide(supabaseMock as never, 'g1')).toEqual([
      { id: 'r2', rating: 3, body: null, createdAt: '2026-07-02T00:00:00Z' },
    ])
  })
})

describe('hasReviewForBooking', () => {
  it('returns true when a row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: { id: 'r1' }, error: null }))
    expect(await hasReviewForBooking(supabaseMock as never, 'b1')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: null }))
    expect(await hasReviewForBooking(supabaseMock as never, 'b1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run reviews.queries`
Expected: FAIL — module not found

- [ ] **Step 3: Write the modules**

```ts
// apps/web/lib/reviews/types.ts
export interface Review {
  id: string
  rating: number
  body: string | null
  createdAt: string
}

export interface RatingAggregate {
  average: number
  count: number
}
```

```ts
// apps/web/lib/reviews/queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { Review, RatingAggregate } from '@/lib/reviews/types'

function toAggregate(ratings: number[]): RatingAggregate | null {
  if (ratings.length === 0) return null
  const sum = ratings.reduce((total, r) => total + r, 0)
  return { average: sum / ratings.length, count: ratings.length }
}

function toReview(r: { id: string; rating: number; body: string | null; created_at: string }): Review {
  return { id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at }
}

/** Published reviews' ratings for one experience, averaged in app code (D-R6A-7: tiny volume). */
export async function getExperienceRatingAggregate(
  supabase: SupabaseClient<Database>,
  experienceId: string,
): Promise<RatingAggregate | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('experience_id', experienceId)
    .eq('status', 'published')
  if (error) throw error
  return toAggregate((data ?? []).map((r) => r.rating as number))
}

/** Published reviews' ratings attributed to one guide (via bookings.guide_id at insert time). */
export async function getGuideRatingAggregate(
  supabase: SupabaseClient<Database>,
  guideId: string,
): Promise<RatingAggregate | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('guide_id', guideId)
    .eq('status', 'published')
  if (error) throw error
  return toAggregate((data ?? []).map((r) => r.rating as number))
}

/** Published reviews for one experience, newest first. */
export async function listPublishedReviewsForExperience(
  supabase: SupabaseClient<Database>,
  experienceId: string,
): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at')
    .eq('experience_id', experienceId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => toReview(r as { id: string; rating: number; body: string | null; created_at: string }))
}

/** Published reviews attributed to one guide, newest first. */
export async function listPublishedReviewsForGuide(
  supabase: SupabaseClient<Database>,
  guideId: string,
): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at')
    .eq('guide_id', guideId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => toReview(r as { id: string; rating: number; body: string | null; created_at: string }))
}

/**
 * Whether a review already exists for this booking (any status) -- lets the /trips
 * review CTA and the booked-confirmation completed branch avoid a duplicate-submit
 * attempt against the booking_id unique constraint. Relies on reviews_owner_select, so
 * must be called with the traveller's own authenticated client.
 */
export async function hasReviewForBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run reviews.queries`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/reviews/types.ts apps/web/lib/reviews/queries.ts apps/web/tests/reviews.queries.test.ts
git commit -m "feat(web): reviews rating aggregates, published-review lists, hasReviewForBooking"
```

---

## Task 9: `lib/reviews/validation.ts` + `lib/reviews/actions.ts`

**Files:**
- Create: `apps/web/lib/reviews/validation.ts`
- Create: `apps/web/lib/reviews/actions.ts`
- Test: `apps/web/tests/reviews.actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/reviews.actions.test.ts
import { describe, expect, it, vi } from 'vitest'

const { getUserMock, insertMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  insertMock: vi.fn(async (): Promise<{ error: { code: string; message: string } | null }> => ({ error: null })),
}))
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table !== 'reviews') throw new Error(`unexpected table ${table}`)
      return { insert: insertMock }
    },
  }),
}))

import { submitReviewAction } from '@/lib/reviews/actions'

describe('submitReviewAction', () => {
  it('rejects an out-of-range rating before ever calling Supabase', async () => {
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 0, body: '' })
    expect(result).toEqual({ ok: false, errors: { rating: ['Choose a rating from 1 to 5 stars'] } })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 5, body: '' })
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('inserts a trimmed review, treats an empty body as null, and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await submitReviewAction('en', 'b1', 'e1', 'g1', { rating: 5, body: '  Loved it!  ' })
    expect(result).toEqual({ ok: true, bookingId: 'b1' })
    expect(insertMock).toHaveBeenCalledWith({
      booking_id: 'b1', traveler_user_id: 'u1', experience_id: 'e1', guide_id: 'g1',
      rating: 5, body: 'Loved it!',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })

  it('translates a unique-violation into a friendly "already reviewed" message', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    insertMock.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } })
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 4, body: '' })
    expect(result).toEqual({ ok: false, errors: { form: ['You already reviewed this booking'] } })
  })

  it('translates any other DB rejection (e.g. RLS check failing) into an eligibility message', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    insertMock.mockResolvedValueOnce({ error: { code: '42501', message: 'new row violates row-level security policy' } })
    const result = await submitReviewAction('en', 'b1', 'e1', null, { rating: 4, body: '' })
    expect(result).toEqual({ ok: false, errors: { form: ['This booking is not eligible for a review yet'] } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run reviews.actions`
Expected: FAIL — module not found

- [ ] **Step 3: Write the modules**

```ts
// apps/web/lib/reviews/validation.ts
export interface ParsedReview {
  rating: number
  body: string | null
}

export type ReviewValidationResult =
  | { ok: true; parsed: ParsedReview }
  | { ok: false; errors: Record<string, string[]> }

export function validateReviewInput(input: { rating: number; body: string }): ReviewValidationResult {
  const errors: Record<string, string[]> = {}
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    errors.rating = ['Choose a rating from 1 to 5 stars']
  }
  const trimmedBody = input.body.trim()
  if (trimmedBody.length > 2000) {
    errors.body = ['Keep your review under 2000 characters']
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, parsed: { rating: input.rating, body: trimmedBody === '' ? null : trimmedBody } }
}
```

```ts
// apps/web/lib/reviews/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReviewInput } from '@/lib/reviews/validation'
import type { Locale } from '@/lib/i18n/config'

const UNIQUE_VIOLATION = '23505'

/**
 * Submits a review for a completed booking. reviews_insert RLS is the real
 * enforcement boundary -- it re-checks ownership, completed status, and that
 * experience_id/guide_id match the booking -- this action only validates input
 * shape and translates the DB's rejection into a friendly message.
 */
export async function submitReviewAction(
  locale: Locale,
  bookingId: string,
  experienceId: string,
  guideId: string | null,
  input: { rating: number; body: string },
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = validateReviewInput(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')

  const { error } = await supabase.from('reviews').insert({
    booking_id: bookingId,
    traveler_user_id: user.id,
    experience_id: experienceId,
    guide_id: guideId,
    rating: parsed.parsed.rating,
    body: parsed.parsed.body,
  })
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return formError('You already reviewed this booking')
    return formError('This booking is not eligible for a review yet')
  }

  revalidatePath(`/${locale}/trips`)
  return { ok: true, bookingId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run reviews.actions`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/reviews/validation.ts apps/web/lib/reviews/actions.ts apps/web/tests/reviews.actions.test.ts
git commit -m "feat(web): submitReviewAction"
```

---

## Task 10: `lib/bookings/queries.ts` + `types.ts` — add `experienceId`/`guideId`/`reviewId`

**Files:**
- Modify: `apps/web/lib/bookings/types.ts:20-31` (`TravelerBookingRow`)
- Modify: `apps/web/lib/bookings/queries.ts:61-103` (`listMyBookings`)
- Modify: `apps/web/tests/bookings.queries.test.ts:90-154` (`listMyBookings` describe block)

- [ ] **Step 1: Extend the failing test**

Add these two `it()` blocks inside the existing `describe('listMyBookings', ...)` block in
`apps/web/tests/bookings.queries.test.ts` (after the existing 3 tests, before its closing `})`):

```ts
  it('maps experience_id, guide_id, and a joined review id onto the row', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 't3',
            status: 'completed',
            qty: 1,
            total_amount: 480,
            currency: 'HKD',
            created_at: '2026-06-01T00:00:00Z',
            experience_id: 'e1',
            guide_id: 'g1',
            experiences: { title: 'Sunset Tour', slug: 'sunset-tour', merchant_profiles: { company_name: 'Acme Travel' } },
            experience_availability: null,
            reviews: { id: 'r1' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMyBookings(supabaseMock as never, 'traveler-1')

    expect(rows[0].experienceId).toBe('e1')
    expect(rows[0].guideId).toBe('g1')
    expect(rows[0].reviewId).toBe('r1')
  })

  it('maps a missing review embed to reviewId: null', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 't4',
            status: 'confirmed',
            qty: 1,
            total_amount: 300,
            currency: 'HKD',
            created_at: '2026-06-02T00:00:00Z',
            experience_id: 'e2',
            guide_id: null,
            experiences: { title: 'City Walk', slug: 'city-walk', merchant_profiles: { company_name: 'Kowloon Eats Co' } },
            experience_availability: null,
            reviews: null,
          },
        ],
        error: null,
      }),
    )

    const rows = await listMyBookings(supabaseMock as never, 'traveler-1')

    expect(rows[0].guideId).toBeNull()
    expect(rows[0].reviewId).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run bookings.queries`
Expected: FAIL — `rows[0].experienceId`/`guideId`/`reviewId` are `undefined`

- [ ] **Step 3: Apply the diff**

`apps/web/lib/bookings/types.ts` — replace the `TravelerBookingRow` interface:

```ts
export interface TravelerBookingRow {
  id: string
  experienceTitle: string
  experienceSlug: string
  merchantName: string
  status: BookingStatus
  qty: number
  totalAmount: number
  currency: string
  bookingDate: string | null // experience_availability.date, if joinable
  createdAt: string
  experienceId: string
  guideId: string | null
  reviewId: string | null
}
```

`apps/web/lib/bookings/queries.ts` — replace `TravelerBookingQueryRow` and `listMyBookings`:

```ts
interface TravelerBookingQueryRow {
  id: string
  status: string
  qty: number
  total_amount: number
  currency: string
  created_at: string
  experience_id: string
  guide_id: string | null
  experiences: { title: string; slug: string; merchant_profiles: { company_name: string } | { company_name: string }[] | null } | Array<{ title: string; slug: string; merchant_profiles: { company_name: string } | { company_name: string }[] | null }> | null
  experience_availability: { date: string } | { date: string }[] | null
  reviews: { id: string } | { id: string }[] | null
}

export async function listMyBookings(
  supabase: SupabaseClient<Database>,
  travelerUserId: string,
): Promise<TravelerBookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, status, qty, total_amount, currency, created_at, experience_id, guide_id, experiences(title, slug, merchant_profiles(company_name)), experience_availability(date), reviews(id)',
    )
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as TravelerBookingQueryRow[]).map((row) => {
    const experience = one(row.experiences)
    const merchant = experience ? one(experience.merchant_profiles) : null
    const availability = one(row.experience_availability)
    const review = one(row.reviews)
    return {
      id: row.id,
      experienceTitle: experience?.title ?? 'Untitled experience',
      experienceSlug: experience?.slug ?? '',
      merchantName: merchant?.company_name ?? 'Merchant',
      status: row.status as TravelerBookingRow['status'],
      qty: row.qty,
      totalAmount: row.total_amount,
      currency: row.currency,
      bookingDate: availability?.date ?? null,
      createdAt: row.created_at,
      experienceId: row.experience_id,
      guideId: row.guide_id,
      reviewId: review?.id ?? null,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run bookings.queries`
Expected: PASS (all `listMyBookings` tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/bookings/types.ts apps/web/lib/bookings/queries.ts apps/web/tests/bookings.queries.test.ts
git commit -m "feat(web): thread experienceId/guideId/reviewId through listMyBookings"
```

---

## Task 11: `booking-confirmation-queries.ts` — extend `BookingConfirmation`

**Files:**
- Modify: `apps/web/lib/experiences/booking-confirmation-queries.ts`
- Modify: `apps/web/tests/experiences.booking-confirmation-queries.test.ts`

- [ ] **Step 1: Extend the failing test**

Replace the `row` fixture and add an assertion in
`apps/web/tests/experiences.booking-confirmation-queries.test.ts`:

```ts
const row = {
  booking_id: 'b1', status: 'confirmed', qty: 2, total_amount: '2400.00', currency: 'HKD',
  experience_title: 'Tokyo After-Hours Izakaya Crawl', experience_slug: 'tokyo-crawl',
  traveler_user_id: 'u1', experience_id: 'e1', guide_id: 'g1',
}

describe('getBookingByCheckoutSession', () => {
  it('maps a found booking to camelCase, including travelerUserId/experienceId/guideId', async () => {
    rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: row, error: null }) })
    const result = await getBookingByCheckoutSession('cs_123')
    expect(result).toEqual({
      bookingId: 'b1', status: 'confirmed', qty: 2, totalAmount: 2400, currency: 'HKD',
      experienceTitle: 'Tokyo After-Hours Izakaya Crawl', experienceSlug: 'tokyo-crawl',
      travelerUserId: 'u1', experienceId: 'e1', guideId: 'g1',
    })
  })
```

(Leave the file's other two `it()` blocks — "returns null" and "propagates errors" —
unchanged.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.booking-confirmation-queries`
Expected: FAIL — the returned object is missing `travelerUserId`/`experienceId`/`guideId`

- [ ] **Step 3: Apply the diff**

```ts
// apps/web/lib/experiences/booking-confirmation-queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export type BookingConfirmation = {
  bookingId: string
  status: 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'refunded'
  qty: number
  totalAmount: number
  currency: string
  experienceTitle: string
  experienceSlug: string
  travelerUserId: string | null
  experienceId: string
  guideId: string | null
}

/**
 * Reads a single booking back by its (unguessable, Stripe-generated) checkout
 * session id via a SECURITY DEFINER RPC -- the sanctioned anon-read exception
 * for guest confirmations (design spec §D-R3-2), reused uniformly for
 * signed-in travelers too so the confirmation page never has to branch on
 * auth state. travelerUserId/experienceId/guideId (added in R6A) let the
 * completed branch decide whether to show a review CTA (D-R6A-4: never for a
 * guest booking) and submit a review that will pass reviews_insert's RLS check.
 */
export async function getBookingByCheckoutSession(sessionId: string): Promise<BookingConfirmation | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .rpc('get_booking_by_checkout_session', { p_session_id: sessionId })
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    bookingId: data.booking_id as string,
    status: data.status as BookingConfirmation['status'],
    qty: data.qty as number,
    totalAmount: Number(data.total_amount),
    currency: data.currency as string,
    experienceTitle: data.experience_title as string,
    experienceSlug: data.experience_slug as string,
    travelerUserId: (data.traveler_user_id as string | null) ?? null,
    experienceId: data.experience_id as string,
    guideId: (data.guide_id as string | null) ?? null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.booking-confirmation-queries`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/experiences/booking-confirmation-queries.ts apps/web/tests/experiences.booking-confirmation-queries.test.ts
git commit -m "feat(web): thread travelerUserId/experienceId/guideId through getBookingByCheckoutSession"
```

---

## Task 12: i18n — `guideSave` + `experienceSave` groups (7 locales)

**Files:** `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`

- [ ] **Step 1: Write the failing test**

Add a new test file `apps/web/tests/i18n.guide-experience-save.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

describe('guideSave / experienceSave i18n', () => {
  for (const locale of LOCALES) {
    it(`${locale} defines guideSave.{save,saved,signInToSave} and experienceSave.{save,saved,signInToSave}`, async () => {
      const dict = await getDictionary(locale)
      expect(dict.guideSave.save).toBeTruthy()
      expect(dict.guideSave.saved).toBeTruthy()
      expect(dict.guideSave.signInToSave).toBeTruthy()
      expect(dict.experienceSave.save).toBeTruthy()
      expect(dict.experienceSave.saved).toBeTruthy()
      expect(dict.experienceSave.signInToSave).toBeTruthy()
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run i18n.guide-experience-save`
Expected: FAIL — `dict.guideSave` is `undefined`

- [ ] **Step 3: Add the two groups to all 7 locale files**

In `apps/web/lib/i18n/messages/en.ts`, insert into the `Messages` interface (between
line 1139's `}` and line 1140's closing `}`):

```ts
  guideSave: {
    save: string
    saved: string
    signInToSave: string
  }
  experienceSave: {
    save: string
    saved: string
    signInToSave: string
  }
```

And into the values object (between line 2424's `},` and line 2425's closing `}`):

```ts
  guideSave: {
    save: 'Save',
    saved: 'Saved',
    signInToSave: 'Sign in to save',
  },
  experienceSave: {
    save: 'Save',
    saved: 'Saved',
    signInToSave: 'Sign in to save',
  },
```

In each of the 6 other locale files, insert the values-only block (no interface) at the
equivalent position just before the file's final closing `}` (immediately after the last
existing top-level group, mirroring the `en.ts` insertion point exactly):

`zh-hk.ts`:
```ts
  guideSave: {
    save: '儲存',
    saved: '已儲存',
    signInToSave: '登入以儲存',
  },
  experienceSave: {
    save: '儲存',
    saved: '已儲存',
    signInToSave: '登入以儲存',
  },
```

`zh-tw.ts`:
```ts
  guideSave: {
    save: '儲存',
    saved: '已儲存',
    signInToSave: '登入以儲存',
  },
  experienceSave: {
    save: '儲存',
    saved: '已儲存',
    signInToSave: '登入以儲存',
  },
```

`zh-cn.ts`:
```ts
  guideSave: {
    save: '保存',
    saved: '已保存',
    signInToSave: '登录以保存',
  },
  experienceSave: {
    save: '保存',
    saved: '已保存',
    signInToSave: '登录以保存',
  },
```

`ja.ts`:
```ts
  guideSave: {
    save: '保存',
    saved: '保存済み',
    signInToSave: '保存するにはログイン',
  },
  experienceSave: {
    save: '保存',
    saved: '保存済み',
    signInToSave: '保存するにはログイン',
  },
```

`ko.ts`:
```ts
  guideSave: {
    save: '저장',
    saved: '저장됨',
    signInToSave: '저장하려면 로그인하세요',
  },
  experienceSave: {
    save: '저장',
    saved: '저장됨',
    signInToSave: '저장하려면 로그인하세요',
  },
```

`th.ts`:
```ts
  guideSave: {
    save: 'บันทึก',
    saved: 'บันทึกแล้ว',
    signInToSave: 'เข้าสู่ระบบเพื่อบันทึก',
  },
  experienceSave: {
    save: 'บันทึก',
    saved: 'บันทึกแล้ว',
    signInToSave: 'เข้าสู่ระบบเพื่อบันทึก',
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/web && npx vitest run i18n.guide-experience-save
cd apps/web && npx vitest run i18n.locale-parity
```
Expected: both PASS (7 tests each)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts apps/web/tests/i18n.guide-experience-save.test.ts
git commit -m "i18n(web): add guideSave/experienceSave i18n keys, x7 locales"
```

---

## Task 13: i18n — `reviews` group (form + display), 7 locales

**Files:** `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`

- [ ] **Step 1: Write the failing test**

Add a new test file `apps/web/tests/i18n.reviews.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

const KEYS = [
  'formHeading', 'ratingLabel', 'bodyLabel', 'bodyPlaceholder', 'submitCta',
  'submittingCta', 'submitted', 'alreadyReviewed', 'genericError',
  'ratingAverageLabel', 'countLabel', 'emptyState', 'anonymousReviewer',
] as const

describe('reviews i18n', () => {
  for (const locale of LOCALES) {
    it(`${locale} defines every reviews.* key`, async () => {
      const dict = await getDictionary(locale)
      for (const key of KEYS) {
        expect(dict.reviews[key], `${locale}.reviews.${key}`).toBeTruthy()
      }
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run i18n.reviews`
Expected: FAIL — `dict.reviews` is `undefined`

- [ ] **Step 3: Add the `reviews` group to all 7 locale files**

`en.ts` interface addition (same insertion point as Task 12, after `experienceSave`):

```ts
  reviews: {
    formHeading: string
    ratingLabel: string
    bodyLabel: string
    bodyPlaceholder: string
    submitCta: string
    submittingCta: string
    submitted: string
    alreadyReviewed: string
    genericError: string
    ratingAverageLabel: string
    countLabel: string
    emptyState: string
    anonymousReviewer: string
  }
```

`en.ts` values addition:

```ts
  reviews: {
    formHeading: 'Leave a review',
    ratingLabel: 'Rating',
    bodyLabel: 'Your review (optional)',
    bodyPlaceholder: 'Tell other travellers about your experience…',
    submitCta: 'Submit review',
    submittingCta: 'Submitting…',
    submitted: 'Thanks for your review!',
    alreadyReviewed: 'You already reviewed this booking.',
    genericError: 'Something went wrong. Please try again.',
    ratingAverageLabel: '{average} out of 5',
    countLabel: '{count} reviews',
    emptyState: 'No reviews yet.',
    anonymousReviewer: 'A KINNSO traveller',
  },
```

`zh-hk.ts`:
```ts
  reviews: {
    formHeading: '撰寫評價',
    ratingLabel: '評分',
    bodyLabel: '你嘅評價（可選）',
    bodyPlaceholder: '同其他旅客分享你嘅體驗…',
    submitCta: '提交評價',
    submittingCta: '提交緊…',
    submitted: '多謝你嘅評價！',
    alreadyReviewed: '你已經評價過呢個訂單。',
    genericError: '出咗啲問題，請再試一次。',
    ratingAverageLabel: '{average} 分（滿分 5 分）',
    countLabel: '{count} 個評價',
    emptyState: '暫時未有評價。',
    anonymousReviewer: 'KINNSO 旅客',
  },
```

`zh-tw.ts`:
```ts
  reviews: {
    formHeading: '撰寫評價',
    ratingLabel: '評分',
    bodyLabel: '你的評價（選填）',
    bodyPlaceholder: '和其他旅客分享你的體驗…',
    submitCta: '提交評價',
    submittingCta: '提交中…',
    submitted: '謝謝你的評價！',
    alreadyReviewed: '你已經評價過這筆訂單。',
    genericError: '發生錯誤，請再試一次。',
    ratingAverageLabel: '{average} 分（滿分 5 分）',
    countLabel: '{count} 則評價',
    emptyState: '目前尚無評價。',
    anonymousReviewer: 'KINNSO 旅客',
  },
```

`zh-cn.ts`:
```ts
  reviews: {
    formHeading: '撰写评价',
    ratingLabel: '评分',
    bodyLabel: '你的评价（选填）',
    bodyPlaceholder: '和其他旅客分享你的体验…',
    submitCta: '提交评价',
    submittingCta: '提交中…',
    submitted: '谢谢你的评价！',
    alreadyReviewed: '你已经评价过这笔订单。',
    genericError: '出现错误，请重试。',
    ratingAverageLabel: '{average} 分（满分 5 分）',
    countLabel: '{count} 条评价',
    emptyState: '暂无评价。',
    anonymousReviewer: 'KINNSO 旅客',
  },
```

`ja.ts`:
```ts
  reviews: {
    formHeading: 'レビューを書く',
    ratingLabel: '評価',
    bodyLabel: 'レビュー（任意）',
    bodyPlaceholder: '他の旅行者に体験を共有しましょう…',
    submitCta: 'レビューを送信',
    submittingCta: '送信中…',
    submitted: 'レビューありがとうございます！',
    alreadyReviewed: 'このご予約は既にレビュー済みです。',
    genericError: '問題が発生しました。もう一度お試しください。',
    ratingAverageLabel: '5点満点中{average}点',
    countLabel: '{count}件のレビュー',
    emptyState: 'まだレビューはありません。',
    anonymousReviewer: 'KINNSOの旅行者',
  },
```

`ko.ts`:
```ts
  reviews: {
    formHeading: '리뷰 작성',
    ratingLabel: '평점',
    bodyLabel: '리뷰 (선택 사항)',
    bodyPlaceholder: '다른 여행자에게 경험을 알려주세요…',
    submitCta: '리뷰 제출',
    submittingCta: '제출 중…',
    submitted: '리뷰 감사합니다!',
    alreadyReviewed: '이미 이 예약에 대한 리뷰를 작성했습니다.',
    genericError: '문제가 발생했습니다. 다시 시도해 주세요.',
    ratingAverageLabel: '5점 만점에 {average}점',
    countLabel: '리뷰 {count}개',
    emptyState: '아직 리뷰가 없습니다.',
    anonymousReviewer: 'KINNSO 여행자',
  },
```

`th.ts`:
```ts
  reviews: {
    formHeading: 'เขียนรีวิว',
    ratingLabel: 'คะแนน',
    bodyLabel: 'รีวิวของคุณ (ไม่บังคับ)',
    bodyPlaceholder: 'บอกเล่าประสบการณ์ของคุณให้นักเดินทางคนอื่นฟัง…',
    submitCta: 'ส่งรีวิว',
    submittingCta: 'กำลังส่ง…',
    submitted: 'ขอบคุณสำหรับรีวิว!',
    alreadyReviewed: 'คุณรีวิวการจองนี้ไปแล้ว',
    genericError: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    ratingAverageLabel: '{average} จาก 5 คะแนน',
    countLabel: '{count} รีวิว',
    emptyState: 'ยังไม่มีรีวิว',
    anonymousReviewer: 'นักเดินทาง KINNSO',
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/web && npx vitest run i18n.reviews
cd apps/web && npx vitest run i18n.locale-parity
```
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts apps/web/tests/i18n.reviews.test.ts
git commit -m "i18n(web): add reviews form/display i18n keys, x7 locales"
```

---

## Task 14: i18n — extend `TravelerTripsMessages` (Saved sections + review CTA), 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts:189-205` (interface), `:2198-2214` (values)
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (`trips:` block, line 1058 in each)
- Modify: `apps/web/tests/trips.host.test.tsx:8-24` (`messages` fixture)

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/i18n.locale-parity.test.ts`'s coverage automatically (it derives
`GROUPS` from `en`'s own keys, so no test-file edit is needed there); instead add a
targeted assertion as a new test in `apps/web/tests/i18n.reviews.test.ts` (append):

```ts
describe('TravelerTripsMessages Saved-section keys', () => {
  for (const locale of LOCALES) {
    it(`${locale} trips group drops savesTabTitle/savesTabComingSoon and defines the real Saved-section keys`, async () => {
      const dict = await getDictionary(locale)
      const trips = dict.trips as unknown as Record<string, unknown>
      expect(trips.savesTabTitle).toBeUndefined()
      expect(trips.savesTabComingSoon).toBeUndefined()
      expect(trips.savedGuidesTitle).toBeTruthy()
      expect(trips.savedGuidesEmpty).toBeTruthy()
      expect(trips.savedExperiencesTitle).toBeTruthy()
      expect(trips.savedExperiencesEmpty).toBeTruthy()
      expect(trips.reviewCta).toBeTruthy()
      expect(trips.reviewedLabel).toBeTruthy()
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run i18n.reviews`
Expected: FAIL — `trips.savedGuidesTitle` etc. are `undefined`, `savesTabTitle` still defined

- [ ] **Step 3: Apply the diff**

`en.ts` — replace the `TravelerTripsMessages` interface (lines 189-205):

```ts
export interface TravelerTripsMessages {
  title: string
  empty: string
  colExperience: string
  colMerchant: string
  colQty: string
  colStatus: string
  colAmount: string
  statusPendingPayment: string
  statusConfirmed: string
  statusCompleted: string
  statusCancelled: string
  statusRefunded: string
  bookedOnLabel: string
  savedGuidesTitle: string
  savedGuidesEmpty: string
  savedExperiencesTitle: string
  savedExperiencesEmpty: string
  reviewCta: string
  reviewedLabel: string
}
```

`en.ts` — replace the `trips:` values block (lines 2198-2214):

```ts
  trips: {
    title: 'Your trips',
    empty: "No bookings yet — once you book an experience, it'll show up here.",
    colExperience: 'Experience',
    colMerchant: 'Merchant',
    colQty: 'Qty',
    colStatus: 'Status',
    colAmount: 'Amount',
    statusPendingPayment: 'Awaiting payment',
    statusConfirmed: 'Confirmed',
    statusCompleted: 'Completed',
    statusCancelled: 'Cancelled',
    statusRefunded: 'Refunded',
    bookedOnLabel: 'Booked on',
    savedGuidesTitle: 'Saved guides',
    savedGuidesEmpty: "You haven't saved any guides yet.",
    savedExperiencesTitle: 'Saved experiences',
    savedExperiencesEmpty: "You haven't saved any experiences yet.",
    reviewCta: 'Leave a review',
    reviewedLabel: 'Reviewed',
  },
```

Each of the 6 other locale files — replace their `trips: { ... }` block (each at line
1058) the same way, removing `savesTabTitle`/`savesTabComingSoon` and adding the 6 new
keys:

`zh-hk.ts`:
```ts
  trips: {
    title: '我嘅行程',
    empty: '仲未有訂單 — 一有你訂咗嘅體驗,就會顯示喺呢度。',
    colExperience: '體驗',
    colMerchant: '商戶',
    colQty: '數量',
    colStatus: '狀態',
    colAmount: '金額',
    statusPendingPayment: '等待付款',
    statusConfirmed: '已確認',
    statusCompleted: '已完成',
    statusCancelled: '已取消',
    statusRefunded: '已退款',
    bookedOnLabel: '訂購日期：',
    savedGuidesTitle: '已儲存嘅攻略',
    savedGuidesEmpty: '你仲未儲存過任何攻略。',
    savedExperiencesTitle: '已儲存嘅體驗',
    savedExperiencesEmpty: '你仲未儲存過任何體驗。',
    reviewCta: '撰寫評價',
    reviewedLabel: '已評價',
  },
```

`zh-tw.ts`:
```ts
  trips: {
    title: '我的行程',
    empty: '尚無訂單 — 一旦你預訂的體驗成立,就會顯示在這裡。',
    colExperience: '體驗',
    colMerchant: '商家',
    colQty: '數量',
    colStatus: '狀態',
    colAmount: '金額',
    statusPendingPayment: '等待付款',
    statusConfirmed: '已確認',
    statusCompleted: '已完成',
    statusCancelled: '已取消',
    statusRefunded: '已退款',
    bookedOnLabel: '預訂日期：',
    savedGuidesTitle: '已儲存的攻略',
    savedGuidesEmpty: '你尚未儲存任何攻略。',
    savedExperiencesTitle: '已儲存的體驗',
    savedExperiencesEmpty: '你尚未儲存任何體驗。',
    reviewCta: '撰寫評價',
    reviewedLabel: '已評價',
  },
```

`zh-cn.ts`:
```ts
  trips: {
    title: '我的行程',
    empty: '暂无订单 — 一旦你预订的体验成立,就会显示在这里。',
    colExperience: '体验',
    colMerchant: '商家',
    colQty: '数量',
    colStatus: '状态',
    colAmount: '金额',
    statusPendingPayment: '等待付款',
    statusConfirmed: '已确认',
    statusCompleted: '已完成',
    statusCancelled: '已取消',
    statusRefunded: '已退款',
    bookedOnLabel: '预订日期：',
    savedGuidesTitle: '已保存的攻略',
    savedGuidesEmpty: '你还没有保存任何攻略。',
    savedExperiencesTitle: '已保存的体验',
    savedExperiencesEmpty: '你还没有保存任何体验。',
    reviewCta: '撰写评价',
    reviewedLabel: '已评价',
  },
```

`ja.ts`:
```ts
  trips: {
    title: 'あなたの旅程',
    empty: 'まだ予約はありません。体験を予約すると、ここに表示されます。',
    colExperience: '体験',
    colMerchant: '店舗',
    colQty: '数量',
    colStatus: 'ステータス',
    colAmount: '金額',
    statusPendingPayment: '支払い待ち',
    statusConfirmed: '確定済み',
    statusCompleted: '完了',
    statusCancelled: 'キャンセル済み',
    statusRefunded: '返金済み',
    bookedOnLabel: '予約日：',
    savedGuidesTitle: '保存したガイド',
    savedGuidesEmpty: 'まだガイドを保存していません。',
    savedExperiencesTitle: '保存した体験',
    savedExperiencesEmpty: 'まだ体験を保存していません。',
    reviewCta: 'レビューを書く',
    reviewedLabel: 'レビュー済み',
  },
```

`ko.ts`:
```ts
  trips: {
    title: '내 여행',
    empty: '아직 예약이 없습니다 — 체험을 예약하면 여기에 표시됩니다.',
    colExperience: '체험',
    colMerchant: '판매자',
    colQty: '수량',
    colStatus: '상태',
    colAmount: '금액',
    statusPendingPayment: '결제 대기 중',
    statusConfirmed: '확정됨',
    statusCompleted: '완료됨',
    statusCancelled: '취소됨',
    statusRefunded: '환불됨',
    bookedOnLabel: '예약일:',
    savedGuidesTitle: '저장한 가이드',
    savedGuidesEmpty: '아직 저장한 가이드가 없습니다.',
    savedExperiencesTitle: '저장한 체험',
    savedExperiencesEmpty: '아직 저장한 체험이 없습니다.',
    reviewCta: '리뷰 작성',
    reviewedLabel: '리뷰 완료',
  },
```

`th.ts`:
```ts
  trips: {
    title: 'ทริปของคุณ',
    empty: 'ยังไม่มีการจอง — เมื่อคุณจองประสบการณ์ รายการจะแสดงที่นี่',
    colExperience: 'ประสบการณ์',
    colMerchant: 'ร้านค้า',
    colQty: 'จำนวน',
    colStatus: 'สถานะ',
    colAmount: 'ยอดเงิน',
    statusPendingPayment: 'รอการชำระเงิน',
    statusConfirmed: 'ยืนยันแล้ว',
    statusCompleted: 'เสร็จสมบูรณ์',
    statusCancelled: 'ยกเลิกแล้ว',
    statusRefunded: 'คืนเงินแล้ว',
    bookedOnLabel: 'จองเมื่อ:',
    savedGuidesTitle: 'คู่มือที่บันทึกไว้',
    savedGuidesEmpty: 'คุณยังไม่ได้บันทึกคู่มือใด ๆ',
    savedExperiencesTitle: 'ประสบการณ์ที่บันทึกไว้',
    savedExperiencesEmpty: 'คุณยังไม่ได้บันทึกประสบการณ์ใด ๆ',
    reviewCta: 'เขียนรีวิว',
    reviewedLabel: 'รีวิวแล้ว',
  },
```

`apps/web/tests/trips.host.test.tsx` — replace the `messages` fixture (lines 8-24):

```ts
const messages = {
  title: 'Your trips',
  empty: 'No bookings yet — once you book an experience, it’ll show up here.',
  colExperience: 'Experience',
  colMerchant: 'Merchant',
  colQty: 'Qty',
  colStatus: 'Status',
  colAmount: 'Amount',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
  bookedOnLabel: 'Booked on',
  savedGuidesTitle: 'Saved guides',
  savedGuidesEmpty: "You haven't saved any guides yet.",
  savedExperiencesTitle: 'Saved experiences',
  savedExperiencesEmpty: "You haven't saved any experiences yet.",
  reviewCta: 'Leave a review',
  reviewedLabel: 'Reviewed',
}
```

Also delete the now-obsolete test at lines 111-114 (`'shows the saves tab as
empty/coming-soon, not faked (D-R3-5)'`) — Task 21 replaces this placeholder behavior
with real Saved sections and will add its own coverage for the new sections.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/web && npx vitest run i18n.reviews
cd apps/web && npx vitest run i18n.locale-parity
cd apps/web && npx vitest run trips.host
```
Expected: `i18n.reviews` and `i18n.locale-parity` PASS; `trips.host` PASSES for its
remaining tests (the deleted "coming soon" test no longer runs — Task 21 will add
replacement coverage, so this is a temporary, expected reduction in this one file's test
count, not a regression).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts apps/web/tests/i18n.reviews.test.ts apps/web/tests/trips.host.test.tsx
git commit -m "i18n(web): replace trips Saved placeholder copy with real section/review-CTA keys, x7 locales"
```

---

## Task 15: `GuideCard` optional save-toggle props + `GuideSaveButton`

**Files:**
- Modify: `apps/web/components/kinnso/GuideCard.tsx` (full file, 31 lines)
- Create: `apps/web/components/kinnso/GuideSaveButton.tsx`
- Test: `apps/web/tests/kinnso.guide-save-button.test.tsx`
- Test: new assertions in a new `apps/web/tests/kinnso.guide-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/tests/kinnso.guide-card.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GuideCard from '@/components/kinnso/GuideCard'

afterEach(cleanup)

const guide = { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Kyoto', saves: 5, creatorHandle: 'teafan' }

describe('GuideCard', () => {
  it('renders the static bookmark count when isSaved/onSaveToggle are omitted (existing 3 consumers, unchanged)', () => {
    render(<GuideCard g={guide} locale="en" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders an interactive toggle button when isSaved/onSaveToggle are both supplied, and never navigates the card link on click', () => {
    const onSaveToggle = vi.fn()
    render(<GuideCard g={guide} locale="en" isSaved={true} onSaveToggle={onSaveToggle} />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onSaveToggle).toHaveBeenCalledTimes(1)
  })
})
```

```tsx
// apps/web/tests/kinnso.guide-save-button.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }))

const { saveGuideActionMock, unsaveGuideActionMock } = vi.hoisted(() => ({
  saveGuideActionMock: vi.fn(async () => ({ ok: true, guideId: 'g1' })),
  unsaveGuideActionMock: vi.fn(async () => ({ ok: true, guideId: 'g1' })),
}))
vi.mock('@/lib/saves/guide-actions', () => ({
  saveGuideAction: saveGuideActionMock,
  unsaveGuideAction: unsaveGuideActionMock,
}))

import { GuideSaveButton } from '@/components/kinnso/GuideSaveButton'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('GuideSaveButton', () => {
  it('routes an anon click to sign-in without calling any save action', () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/en/sign-in')
    expect(saveGuideActionMock).not.toHaveBeenCalled()
  })

  it('calls saveGuideAction and flips to the saved label for a signed-in traveller', async () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))
    await waitFor(() => expect(saveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await screen.findByRole('button', { name: en.guideSave.saved })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('calls unsaveGuideAction when already saved', async () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={true} signedIn={true} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.guideSave.saved }))
    await waitFor(() => expect(unsaveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await screen.findByRole('button', { name: en.guideSave.save })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/web && npx vitest run kinnso.guide-card
cd apps/web && npx vitest run kinnso.guide-save-button
```
Expected: `kinnso.guide-card` FAILS (no button ever renders yet); `kinnso.guide-save-button`
FAILS (module not found).

- [ ] **Step 3: Write the component**

```tsx
// apps/web/components/kinnso/GuideCard.tsx
import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import { EditorialCard } from "@/components/kinnso/editorial/EditorialCard";
import type { Guide } from '@/lib/guides/types';
import type { Locale } from "@/lib/i18n/config";

const GuideCard = ({ g, locale, savesLabel = 'Saves', isSaved, onSaveToggle }: {
  g: Guide; locale: Locale; savesLabel?: string
  isSaved?: boolean
  onSaveToggle?: () => void
}) => (
  <Link href={`/${locale}/g/${g.slug}`} className="group block">
    <EditorialCard
      media={
        <img src={g.cover} alt={g.title} width={640} height={480} loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
      }
      kicker={<span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="h-3 w-3" /> {g.city}</span>}
      title={g.title}
      footer={
        <div className="flex items-center justify-between border-t border-kinnso-edge pt-3 text-xs text-kinnso-muted">
          <span>@{g.creatorHandle}</span>
          {onSaveToggle ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSaveToggle(); }}
              className="inline-flex items-center gap-1"
            >
              <Bookmark aria-hidden="true" className={isSaved ? 'h-3 w-3 fill-current' : 'h-3 w-3'} />
              <span className="sr-only">{savesLabel} </span>
              {g.saves.toLocaleString()}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Bookmark aria-hidden="true" className="h-3 w-3" />
              <span className="sr-only">{savesLabel} </span>
              {g.saves.toLocaleString()}
            </span>
          )}
        </div>
      }
    />
  </Link>
);

export default GuideCard;
```

```tsx
// apps/web/components/kinnso/GuideSaveButton.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveGuideAction, unsaveGuideAction } from '@/lib/saves/guide-actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function GuideSaveButton({ locale, guideId, initialSaved, signedIn, t }: {
  locale: Locale
  guideId: string
  initialSaved: boolean
  signedIn: boolean
  t: Messages['guideSave']
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialSaved)
  const [pending, setPending] = useState(false)

  async function toggle() {
    if (!signedIn) {
      router.push(`/${locale}/sign-in`)
      return
    }
    setPending(true)
    const result = saved
      ? await unsaveGuideAction(locale, guideId)
      : await saveGuideAction(locale, guideId)
    setPending(false)
    if (result.ok) {
      setSaved(!saved)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1 rounded-[3px] bg-white/90 px-3 py-1 text-sm font-semibold text-kinnso-ink disabled:opacity-50',
        saved && 'bg-kinnso-amber/90',
      )}
    >
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden="true" />
      {saved ? t.saved : t.save}
    </button>
  )
}

export default GuideSaveButton
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/web && npx vitest run kinnso.guide-card
cd apps/web && npx vitest run kinnso.guide-save-button
```
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/GuideCard.tsx apps/web/components/kinnso/GuideSaveButton.tsx apps/web/tests/kinnso.guide-card.test.tsx apps/web/tests/kinnso.guide-save-button.test.tsx
git commit -m "feat(web): GuideCard optional save toggle + GuideSaveButton"
```

---

## Task 16: `ExperienceCard` (new) + `ExperienceSaveButton`

**Files:**
- Create: `apps/web/components/kinnso/ExperienceCard.tsx`
- Create: `apps/web/components/kinnso/ExperienceSaveButton.tsx`
- Test: `apps/web/tests/kinnso.experience-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/kinnso.experience-card.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }))

const { saveExperienceActionMock, unsaveExperienceActionMock } = vi.hoisted(() => ({
  saveExperienceActionMock: vi.fn(async () => ({ ok: true, experienceId: 'e1' })),
  unsaveExperienceActionMock: vi.fn(async () => ({ ok: true, experienceId: 'e1' })),
}))
vi.mock('@/lib/saves/experience-actions', () => ({
  saveExperienceAction: saveExperienceActionMock,
  unsaveExperienceAction: unsaveExperienceActionMock,
}))

import ExperienceCard from '@/components/kinnso/ExperienceCard'
import { ExperienceSaveButton } from '@/components/kinnso/ExperienceSaveButton'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const experience = { slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null }

describe('ExperienceCard', () => {
  it('links to the experience detail page and shows no save button when onSaveToggle is omitted', () => {
    render(<ExperienceCard experience={experience} locale="en" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/en/experiences/sunset-tour')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('never navigates the card link when the save button is clicked', () => {
    const onSaveToggle = vi.fn()
    render(<ExperienceCard experience={experience} locale="en" isSaved={false} onSaveToggle={onSaveToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSaveToggle).toHaveBeenCalledTimes(1)
  })
})

describe('ExperienceSaveButton', () => {
  it('routes an anon click to sign-in without calling any save action', () => {
    render(<ExperienceSaveButton locale="en" experienceId="e1" initialSaved={false} signedIn={false} t={en.experienceSave} />)
    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/en/sign-in')
    expect(saveExperienceActionMock).not.toHaveBeenCalled()
  })

  it('calls saveExperienceAction and flips to the saved label for a signed-in traveller', async () => {
    render(<ExperienceSaveButton locale="en" experienceId="e1" initialSaved={false} signedIn={true} t={en.experienceSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.experienceSave.save }))
    await waitFor(() => expect(saveExperienceActionMock).toHaveBeenCalledWith('en', 'e1'))
    await screen.findByRole('button', { name: en.experienceSave.saved })
    expect(refreshMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run kinnso.experience-card`
Expected: FAIL — modules not found

- [ ] **Step 3: Write the components**

```tsx
// apps/web/components/kinnso/ExperienceCard.tsx
import Link from 'next/link'
import { Bookmark, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/config'

export interface ExperienceCardData {
  slug: string
  title: string
  city: string
  priceAmount: number
  currency: string
  coverUrl: string | null
}

export function ExperienceCard({ experience, locale, isSaved, onSaveToggle }: {
  experience: ExperienceCardData
  locale: Locale
  isSaved?: boolean
  onSaveToggle?: () => void
}) {
  return (
    <Link
      href={`/${locale}/experiences/${experience.slug}`}
      className="group flex items-center gap-3 rounded-lg border border-kinnso-cream2 bg-white p-3 hover:border-kinnso-orangeDark"
    >
      <div
        role="img"
        aria-label={experience.title}
        className="h-16 w-16 shrink-0 rounded-md bg-kinnso-cream2 bg-cover bg-center"
        style={experience.coverUrl ? { backgroundImage: `url(${experience.coverUrl})` } : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-kinnso-ink">{experience.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-kinnso-muted">
          <MapPin className="h-3 w-3" aria-hidden="true" /> {experience.city}
          <span>· {experience.currency} {experience.priceAmount.toLocaleString()}</span>
        </p>
      </div>
      {onSaveToggle ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSaveToggle(); }}
          className="shrink-0 rounded-[3px] p-2 text-kinnso-muted hover:text-kinnso-orangeDark"
        >
          <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current text-kinnso-orangeDark')} aria-hidden="true" />
        </button>
      ) : null}
    </Link>
  )
}

export default ExperienceCard
```

```tsx
// apps/web/components/kinnso/ExperienceSaveButton.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveExperienceAction, unsaveExperienceAction } from '@/lib/saves/experience-actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExperienceSaveButton({ locale, experienceId, initialSaved, signedIn, t }: {
  locale: Locale
  experienceId: string
  initialSaved: boolean
  signedIn: boolean
  t: Messages['experienceSave']
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialSaved)
  const [pending, setPending] = useState(false)

  async function toggle() {
    if (!signedIn) {
      router.push(`/${locale}/sign-in`)
      return
    }
    setPending(true)
    const result = saved
      ? await unsaveExperienceAction(locale, experienceId)
      : await saveExperienceAction(locale, experienceId)
    setPending(false)
    if (result.ok) {
      setSaved(!saved)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1 rounded-[3px] bg-white/90 px-3 py-1 text-sm font-semibold text-kinnso-ink disabled:opacity-50',
        saved && 'bg-kinnso-amber/90',
      )}
    >
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden="true" />
      {saved ? t.saved : t.save}
    </button>
  )
}

export default ExperienceSaveButton
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run kinnso.experience-card`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/ExperienceCard.tsx apps/web/components/kinnso/ExperienceSaveButton.tsx apps/web/tests/kinnso.experience-card.test.tsx
git commit -m "feat(web): new ExperienceCard + ExperienceSaveButton"
```

---

## Task 17: `jsonld.ts` — optional `aggregateRating` on `articleJsonLd` + `experienceOfferJsonLd`

**Files:**
- Modify: `apps/web/lib/seo/jsonld.ts:1-18` (`articleJsonLd`), `:86-100` (`experienceOfferJsonLd`)
- Modify: `apps/web/tests/jsonld.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/tests/jsonld.test.ts`'s `describe('JSON-LD', ...)` block (after the
existing 3 `it()`s, before its closing `})`):

```ts
  it('Article includes aggregateRating when a rating is supplied', () => {
    const ld = articleJsonLd({
      headline: 'x', description: 'y', url: 'u', images: [], publishedAt: null,
      modifiedAt: null, authorName: null, locale: 'en', rating: { average: 4.5, count: 12 },
    })
    expect(ld.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 12 })
  })

  it('Article omits aggregateRating entirely when no rating is supplied (never a fake ratingCount: 0)', () => {
    const ld = articleJsonLd({
      headline: 'x', description: 'y', url: 'u', images: [], publishedAt: null,
      modifiedAt: null, authorName: null, locale: 'en',
    })
    expect(ld.aggregateRating).toBeUndefined()
  })
```

And append to the `describe('experienceOfferJsonLd', ...)` block:

```ts
  it('includes aggregateRating when a rating is supplied', () => {
    const ld = experienceOfferJsonLd({
      name: 'Sunset tour', description: 'Two hours on the harbour.', url: 'https://x/experiences/sunset-tour',
      image: null, priceAmount: 480, currency: 'HKD', rating: { average: 5, count: 1 },
    })
    expect(ld.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 5, reviewCount: 1 })
  })

  it('omits aggregateRating entirely when no rating is supplied', () => {
    const ld = experienceOfferJsonLd({
      name: 'Sunset tour', description: 'Two hours on the harbour.', url: 'https://x/experiences/sunset-tour',
      image: null, priceAmount: 480, currency: 'HKD',
    })
    expect(ld.aggregateRating).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run jsonld`
Expected: FAIL — TS error (`rating` not a known property) and `ld.aggregateRating` undefined

- [ ] **Step 3: Apply the diff**

```ts
// apps/web/lib/seo/jsonld.ts — replace ArticleLdInput + articleJsonLd (lines 1-18)
export interface ArticleLdInput {
  headline: string; description: string; url: string; images: string[]
  publishedAt: string | null; modifiedAt: string | null; authorName: string | null; locale: string
  rating?: { average: number; count: number }
}

export function articleJsonLd(i: ArticleLdInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: i.headline, description: i.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': i.url },
    image: i.images, inLanguage: i.locale,
    datePublished: i.publishedAt ?? undefined,
    dateModified: i.modifiedAt ?? i.publishedAt ?? undefined,   // <-- the fix: never omit dateModified
    publisher: { '@type': 'Organization', name: 'KINNSO' },
  }
  if (i.authorName) ld.author = { '@type': 'Person', name: i.authorName }
  if (i.rating) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: i.rating.average, reviewCount: i.rating.count }
  return ld
}
```

```ts
// apps/web/lib/seo/jsonld.ts — replace experienceOfferJsonLd (lines 86-100)
export function experienceOfferJsonLd(i: {
  name: string; description: string; url: string; image: string | null
  priceAmount: number; currency: string
  rating?: { average: number; count: number }
}): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: i.name, description: i.description,
    offers: {
      '@type': 'Offer', url: i.url, priceCurrency: i.currency, price: i.priceAmount,
      availability: 'https://schema.org/InStock',
    },
  }
  if (i.image) ld.image = i.image
  if (i.rating) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: i.rating.average, reviewCount: i.rating.count }
  return ld
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run jsonld`
Expected: PASS (all tests, 4 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/seo/jsonld.ts apps/web/tests/jsonld.test.ts
git commit -m "feat(web): optional aggregateRating on articleJsonLd + experienceOfferJsonLd"
```

---

## Task 18: Guide detail page — save toggle, rating aggregate, reviews section

**Files:**
- Modify: `apps/web/app/[locale]/g/[slug]/page.tsx` (full file, 134 lines)
- Modify: `apps/web/tests/g.slug.host.test.tsx`

- [ ] **Step 1: Extend the failing test**

Replace `apps/web/tests/g.slug.host.test.tsx` in full:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

vi.mock('@/lib/guides/queries', () => ({
  getGuideBySlug: vi.fn(async () => ({
    id: 'g1',
    slug: 'kyoto-tea',
    title: 'Kyoto Tea Houses',
    cover: 'https://example.com/kyoto.jpg',
    city: 'Kyoto',
    saves: 5,
    creatorHandle: 'teafan',
    creatorName: 'Tea Fan',
    creatorId: 'c1',
    summary: 'Lovely tea houses.',
    publishedAt: '2026-06-02T00:00:00Z',
    source: 'db',
  })),
}))

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

const { isGuideSavedMock } = vi.hoisted(() => ({ isGuideSavedMock: vi.fn(async () => false) }))
vi.mock('@/lib/saves/guide-queries', () => ({ isGuideSaved: isGuideSavedMock }))

const { getGuideRatingAggregateMock, listPublishedReviewsForGuideMock } = vi.hoisted(() => ({
  getGuideRatingAggregateMock: vi.fn(async (): Promise<{ average: number; count: number } | null> => null),
  listPublishedReviewsForGuideMock: vi.fn(async (): Promise<Array<{ id: string; rating: number; body: string | null; createdAt: string }>> => []),
}))
vi.mock('@/lib/reviews/queries', () => ({
  getGuideRatingAggregate: getGuideRatingAggregateMock,
  listPublishedReviewsForGuide: listPublishedReviewsForGuideMock,
}))

// GuideExperienceLinks is an async Server Component -- react-dom's client renderer
// (used by this jsdom+@testing-library/react host test) cannot render a nested async
// function component directly. Stub it to a synchronous no-op (unchanged from before).
vi.mock('@/components/kinnso/GuideExperienceLinks', () => ({
  GuideExperienceLinks: () => null,
}))

describe('/[locale]/g/[slug] host', () => {
  it('renders a known guide and links the author to /c/[handle]', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })

    render(ui)

    expect(screen.getByRole('heading', { level: 1, name: 'Kyoto Tea Houses' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '@teafan' }).getAttribute('href')).toBe('/en/c/teafan')
    expect(document.querySelector('.k2-eyebrow')?.textContent).toBe('Kyoto')
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"datePublished":"2026-06-02T00:00:00Z"')
    expect(ld).toContain('"dateModified":"2026-06-02T00:00:00Z"')
  })

  it('shows the save button (anon: "Sign in to save") and omits aggregateRating JSON-LD when there are no reviews', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })
    render(ui)
    expect(screen.getByRole('button', { name: 'Sign in to save' })).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('aggregateRating')
  })

  it('shows the real save state and rating for a signed-in viewer with published reviews', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    isGuideSavedMock.mockResolvedValueOnce(true)
    getGuideRatingAggregateMock.mockResolvedValueOnce({ average: 4.5, count: 2 })
    listPublishedReviewsForGuideMock.mockResolvedValueOnce([
      { id: 'r1', rating: 5, body: 'Loved it', createdAt: '2026-07-01T00:00:00Z' },
    ])
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })
    render(ui)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
    expect(screen.getByText('Loved it')).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"aggregateRating"')
    expect(ld).toContain('"ratingValue":4.5')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run g.slug.host`
Expected: FAIL — no save button, no reviews section exist yet

- [ ] **Step 3: Apply the diff**

Replace `apps/web/app/[locale]/g/[slug]/page.tsx` in full:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Bookmark, MapPin } from 'lucide-react'
import { isLocale, htmlLang, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getGuideBySlug } from '@/lib/guides/queries'
import { isGuideSaved } from '@/lib/saves/guide-queries'
import { getGuideRatingAggregate, listPublishedReviewsForGuide } from '@/lib/reviews/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { GuideExperienceLinks } from '@/components/kinnso/GuideExperienceLinks'
import { GuideSaveButton } from '@/components/kinnso/GuideSaveButton'
import { buildGuideMetadata, SITE_URL } from '@/lib/seo/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { cssUrl } from '@/lib/utils'

export function generateStaticParams() {
  // Guides are DB-only; resolve on demand (dynamicParams defaults to true).
  return []
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const guide = await getGuideBySlug(slug)
  if (!guide) return { title: 'Guide not found', robots: { index: false, follow: false } }
  const authorName = guide.creatorName ?? `@${guide.creatorHandle}`
  return buildGuideMetadata({
    slug, locale: locale as Locale,
    title: guide.title,
    description: `${guide.city} guide by ${authorName}. ${guide.summary ?? ''}`.trim(),
  })
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const guide = await getGuideBySlug(slug)
  if (!guide) notFound()

  const messages = await getDictionary(locale as Locale)
  const authorName = guide.creatorName ?? guide.creatorHandle

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [isSaved, rating, reviews] = await Promise.all([
    user ? isGuideSaved(supabase, guide.id, user.id) : Promise.resolve(false),
    getGuideRatingAggregate(supabase, guide.id),
    listPublishedReviewsForGuide(supabase, guide.id),
  ])

  const canonical = `${SITE_URL}/${locale}/g/${slug}`
  const ld = [
    articleJsonLd({
      headline: guide.title,
      description: guide.summary ?? `${guide.city} guide by ${authorName}`,
      url: canonical, images: guide.cover ? [guide.cover] : [],
      publishedAt: guide.publishedAt, modifiedAt: null,
      authorName, locale: htmlLang(locale as Locale),
      rating: rating ?? undefined,
    }),
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.explore.title, url: `${SITE_URL}/${locale}/explore` },
      { name: guide.title, url: canonical },
    ]),
  ]

  return (
    <article className="k2-container py-8 md:py-12">
      <JsonLd data={ld} />
      <section className="overflow-hidden rounded-xl bg-white shadow-kinnso">
        <div
          role="img"
          aria-label={guide.title}
          className="relative min-h-[360px] bg-cover bg-center"
          style={{
            backgroundImage: cssUrl(guide.cover),
          }}
        >
          {/* Gradient overlay for legibility */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/70" />

          {/* RouteStamp – city/category signal, positioned top-left */}
          <div className="absolute left-6 top-6 flex flex-wrap gap-2 sm:left-8">
            <Eyebrow className="rounded-[3px] bg-white/90 px-3 py-1">{guide.city}</Eyebrow>
          </div>

          {/* Save toggle, top-right */}
          <div className="absolute right-6 top-6 sm:right-8">
            <GuideSaveButton locale={locale as Locale} guideId={guide.id} initialSaved={isSaved} signedIn={!!user} t={messages.guideSave} />
          </div>

          {/* TicketCard overlay – title, author, city, saves */}
          <div className="k2-card absolute inset-x-4 bottom-4 p-5 sm:inset-x-6 sm:bottom-6 sm:p-7 md:inset-x-8 md:bottom-8">
            <h1 className="k2-display max-w-3xl text-2xl font-semibold leading-tight text-kinnso-ink md:text-4xl">{guide.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-kinnso-muted">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {guide.city}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                {guide.saves.toLocaleString()}
              </span>
            </div>
            <div className="mt-3">
              <div className="text-sm font-black text-kinnso-ink">{authorName}</div>
              <div className="mt-0.5 text-sm text-kinnso-muted">@{guide.creatorHandle}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-white p-6">
          <h2 className="text-base font-bold text-kinnso-ink">{messages.creatorProfile.destinationsCovered}</h2>
          <p className="mt-2 text-sm text-kinnso-muted">{guide.summary ?? guide.city}</p>
          <Link href={`/${locale}/feed`} className="k2-btn-ghost mt-5 inline-flex text-sm">
            {messages.creatorProfile.viewAllGuides}
          </Link>
          <GuideExperienceLinks locale={locale as Locale} city={guide.city} guideSlug={guide.slug} t={messages.article} />
        </div>

        <aside className="k2-card bg-kinnso-cream2 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{messages.article.by}</p>
          <div className="mt-3">
            <div className="text-lg font-black text-kinnso-ink">{authorName}</div>
            <Link
              href={`/${locale}/c/${guide.creatorHandle}`}
              className="mt-1 inline-flex text-sm text-kinnso-orangeDark hover:text-kinnso-ink"
            >
              @{guide.creatorHandle}
            </Link>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-lg bg-white p-6">
        <h2 className="text-base font-bold text-kinnso-ink">
          {rating
            ? `${messages.reviews.ratingAverageLabel.replace('{average}', rating.average.toFixed(1))} · ${messages.reviews.countLabel.replace('{count}', String(rating.count))}`
            : messages.reviews.emptyState}
        </h2>
        {reviews.length === 0 ? null : (
          <ul className="mt-4 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-kinnso-cream2 pt-4 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold text-kinnso-ink">{messages.reviews.anonymousReviewer} · {r.rating}/5</p>
                {r.body ? <p className="mt-1 text-sm text-kinnso-muted">{r.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run g.slug.host`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\[locale\]/g/\[slug\]/page.tsx apps/web/tests/g.slug.host.test.tsx
git commit -m "feat(web): guide detail page save toggle, rating aggregate, reviews section"
```

---

## Task 19: Experience detail page — save toggle, rating aggregate, reviews section

**Files:**
- Modify: `apps/web/components/kinnso/pages/ExperiencePublicView.tsx` (full file, 66 lines)
- Modify: `apps/web/app/[locale]/experiences/[slug]/page.tsx` (full file, 87 lines)
- Modify: `apps/web/tests/experiences.public-detail.host.test.tsx`

- [ ] **Step 1: Extend the failing test**

Add near the top of `apps/web/tests/experiences.public-detail.host.test.tsx` (alongside
the other `vi.hoisted`/`vi.mock` calls):

```ts
const { isExperienceSavedMock } = vi.hoisted(() => ({ isExperienceSavedMock: vi.fn(async () => false) }))
vi.mock('@/lib/saves/experience-queries', () => ({ isExperienceSaved: isExperienceSavedMock }))

const { getExperienceRatingAggregateMock, listPublishedReviewsForExperienceMock } = vi.hoisted(() => ({
  getExperienceRatingAggregateMock: vi.fn(async (): Promise<{ average: number; count: number } | null> => null),
  listPublishedReviewsForExperienceMock: vi.fn(async (): Promise<Array<{ id: string; rating: number; body: string | null; createdAt: string }>> => []),
}))
vi.mock('@/lib/reviews/queries', () => ({
  getExperienceRatingAggregate: getExperienceRatingAggregateMock,
  listPublishedReviewsForExperience: listPublishedReviewsForExperienceMock,
}))
```

And append two new `it()`s inside the existing `describe('ExperiencePublicPage', ...)`
block:

```ts
  it('shows the save button (anon: "Sign in to save") and omits aggregateRating when there are no reviews', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.getByRole('button', { name: 'Sign in to save' })).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('aggregateRating')
  })

  it('shows the real save state and rating for a signed-in viewer with published reviews', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    getUserMock.mockResolvedValueOnce({ data: { user: { email: 'traveler@example.com', id: 'u1' } } })
    isExperienceSavedMock.mockResolvedValueOnce(true)
    getExperienceRatingAggregateMock.mockResolvedValueOnce({ average: 5, count: 1 })
    listPublishedReviewsForExperienceMock.mockResolvedValueOnce([
      { id: 'r1', rating: 5, body: 'Amazing sunset', createdAt: '2026-07-01T00:00:00Z' },
    ])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
    expect(screen.getByText('Amazing sunset')).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"aggregateRating"')
  })
```

`getUserMock` in the existing file resolves `{ id: string }`-less user objects (only
`email`); the new tests above pass `id: 'u1'` alongside `email` — this requires widening
`getUserMock`'s hoisted type annotation from
`vi.fn(async () => ({ data: { user: null as { email: string } | null } }))` to
`vi.fn(async () => ({ data: { user: null as { email: string; id?: string } | null } }))`
so the added `id` field type-checks (the Vitest mock-narrowing gotcha this project has
hit before — annotate explicitly rather than letting the initializer infer too narrow a
type).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.public-detail`
Expected: FAIL — no save button, no reviews section exist yet

- [ ] **Step 3: Apply the diff**

Replace `apps/web/components/kinnso/pages/ExperiencePublicView.tsx` in full:

```tsx
// apps/web/components/kinnso/pages/ExperiencePublicView.tsx
import Link from 'next/link'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { BookingWidget } from '@/components/kinnso/pages/BookingWidget'
import { ExperienceSaveButton } from '@/components/kinnso/ExperienceSaveButton'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { PublicAvailability } from '@/lib/experiences/public-availability-queries'
import type { RatingAggregate, Review } from '@/lib/reviews/types'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExperiencePublicView({
  locale, t, bookingT, reviewsT, experienceSaveT, experience, availability, viewerEmail, viewerId, isSaved, rating, reviews, sourceSurface, guideSlug,
}: {
  locale: Locale
  t: Messages['experiencePublic']
  bookingT: Messages['booking']
  reviewsT: Messages['reviews']
  experienceSaveT: Messages['experienceSave']
  experience: PublicExperience
  availability: PublicAvailability[]
  viewerEmail: string | null
  viewerId: string | null
  isSaved: boolean
  rating: RatingAggregate | null
  reviews: Review[]
  sourceSurface?: string
  guideSlug?: string
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <article className="k2-container py-8 md:py-12">
      <section className="overflow-hidden rounded-xl bg-white shadow-kinnso">
        <div
          role="img"
          aria-label={experience.title}
          className="relative aspect-[16/9] w-full bg-kinnso-ink bg-cover bg-center"
          style={experience.coverUrl ? { backgroundImage: `url(${experience.coverUrl})` } : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
          <Eyebrow className="absolute left-4 top-4 rounded-[3px] bg-white/90 px-3 py-1">{experience.city}</Eyebrow>
          <div className="absolute right-4 top-4">
            <ExperienceSaveButton locale={locale} experienceId={experience.id} initialSaved={isSaved} signedIn={!!viewerId} t={experienceSaveT} />
          </div>
        </div>
        <div className="p-6 md:p-8">
          <h1 className="k2-display max-w-3xl text-2xl font-semibold leading-tight text-kinnso-ink md:text-4xl">{experience.title}</h1>
          <p className="mt-2 text-sm text-kinnso-muted">
            {t.hostedBy}{' '}
            <Link href={p(`/m/${experience.merchant.slug}`)} className="font-semibold text-kinnso-orangeDark hover:underline">
              {experience.merchant.companyName}
            </Link>
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-white p-6">
          {experience.summary ? <p className="text-kinnso-ink/80">{experience.summary}</p> : null}
          {experience.description ? <p className="mt-4 leading-relaxed text-kinnso-ink/70">{experience.description}</p> : null}
        </div>
        <div className="k2-card bg-kinnso-cream2 p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-kinnso-muted">{t.priceLabel}</p>
          <p className="k2-display mt-1 text-2xl font-semibold text-kinnso-ink">{experience.currency} {experience.priceAmount.toLocaleString()}</p>
          {experience.durationMinutes ? (
            <p className="mt-3 text-sm text-kinnso-ink/70">{t.durationLabel}: {experience.durationMinutes} {t.minutesSuffix}</p>
          ) : null}
          <BookingWidget locale={locale} t={bookingT} experience={experience} availability={availability} viewerEmail={viewerEmail} sourceSurface={sourceSurface} guideSlug={guideSlug} />
          <Link href={p(`/m/${experience.merchant.slug}`)} className="mt-4 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">
            {t.backToMerchant} {experience.merchant.companyName}
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-lg bg-white p-6">
        <h2 className="text-base font-bold text-kinnso-ink">
          {rating
            ? `${reviewsT.ratingAverageLabel.replace('{average}', rating.average.toFixed(1))} · ${reviewsT.countLabel.replace('{count}', String(rating.count))}`
            : reviewsT.emptyState}
        </h2>
        {reviews.length === 0 ? null : (
          <ul className="mt-4 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-kinnso-cream2 pt-4 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold text-kinnso-ink">{reviewsT.anonymousReviewer} · {r.rating}/5</p>
                {r.body ? <p className="mt-1 text-sm text-kinnso-muted">{r.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}

export default ExperiencePublicView
```

Replace `apps/web/app/[locale]/experiences/[slug]/page.tsx` in full:

```tsx
// apps/web/app/[locale]/experiences/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'
import { isExperienceSaved } from '@/lib/saves/experience-queries'
import { getExperienceRatingAggregate, listPublishedReviewsForExperience } from '@/lib/reviews/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildExperienceMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, experienceOfferJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { ExperiencePublicView } from '@/components/kinnso/pages/ExperiencePublicView'

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const experience = await getExperienceBySlug(slug)
  if (!experience) return { title: 'Experience not found', robots: { index: false, follow: false } }
  const description = experience.summary ?? `${experience.city} experience hosted by ${experience.merchant.companyName}.`
  return buildExperienceMetadata({ slug, locale: locale as Locale, title: experience.title, description })
}

export default async function ExperiencePublicPage({ params, searchParams }: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale, slug } = await params
  const sp = await searchParams
  const firstOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sourceSurface = firstOf(sp.src)
  const guideSlug = firstOf(sp.guideSlug)
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const experience = await getExperienceBySlug(slug)
  if (!experience) notFound()

  const supabase = await createSupabaseServerClient()
  const [availability, { data: { user } }] = await Promise.all([
    listPublicAvailability(experience.id),
    supabase.auth.getUser(),
  ])
  const [isSaved, rating, reviews] = await Promise.all([
    user ? isExperienceSaved(supabase, experience.id, user.id) : Promise.resolve(false),
    getExperienceRatingAggregate(supabase, experience.id),
    listPublishedReviewsForExperience(supabase, experience.id),
  ])

  const canonical = `${SITE_URL}/${locale}/experiences/${slug}`
  const hasOpenAvailability = availability.some((a) => a.remaining > 0)
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: experience.title, url: canonical },
    ]),
    ...(hasOpenAvailability
      ? [experienceOfferJsonLd({
          name: experience.title,
          description: experience.summary ?? experience.description ?? `${experience.city} experience`,
          url: canonical,
          image: experience.coverUrl,
          priceAmount: experience.priceAmount,
          currency: experience.currency,
          rating: rating ?? undefined,
        })]
      : []),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <ExperiencePublicView
        locale={locale as Locale}
        t={messages.experiencePublic}
        bookingT={messages.booking}
        reviewsT={messages.reviews}
        experienceSaveT={messages.experienceSave}
        experience={experience}
        availability={availability}
        viewerEmail={user?.email ?? null}
        viewerId={user?.id ?? null}
        isSaved={isSaved}
        rating={rating}
        reviews={reviews}
        sourceSurface={sourceSurface}
        guideSlug={guideSlug}
      />
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.public-detail`
Expected: PASS (all tests, 2 new)

- [ ] **Step 5: Commit**

```bash
git add "apps/web/components/kinnso/pages/ExperiencePublicView.tsx" "apps/web/app/[locale]/experiences/[slug]/page.tsx" apps/web/tests/experiences.public-detail.host.test.tsx
git commit -m "feat(web): experience detail page save toggle, rating aggregate, reviews section"
```

---

## Task 20: `ReviewForm` + wire into the `booked` confirmation page's `completed` branch

**Files:**
- Create: `apps/web/components/kinnso/ReviewForm.tsx`
- Test: `apps/web/tests/kinnso.review-form.test.tsx`
- Modify: `apps/web/app/[locale]/experiences/[slug]/booked/page.tsx` (full file, 99 lines)
- Modify: `apps/web/tests/experiences.booking-confirmation.host.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/tests/kinnso.review-form.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { submitReviewActionMock } = vi.hoisted(() => ({
  submitReviewActionMock: vi.fn(async () => ({ ok: true, bookingId: 'b1' })),
}))
vi.mock('@/lib/reviews/actions', () => ({ submitReviewAction: submitReviewActionMock }))

import { ReviewForm } from '@/components/kinnso/ReviewForm'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('ReviewForm', () => {
  it('disables submit until a star is picked, then submits the chosen rating and trimmed body', async () => {
    render(<ReviewForm locale="en" bookingId="b1" experienceId="e1" guideId={null} t={en.reviews} />)
    expect(screen.getByRole('button', { name: en.reviews.submitCta })).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: '4' }))
    fireEvent.change(screen.getByLabelText(en.reviews.bodyLabel), { target: { value: '  Great trip!  ' } })
    fireEvent.click(screen.getByRole('button', { name: en.reviews.submitCta }))

    await waitFor(() => expect(submitReviewActionMock).toHaveBeenCalledWith(
      'en', 'b1', 'e1', null, { rating: 4, body: '  Great trip!  ' },
    ))
    await screen.findByText(en.reviews.submitted)
  })

  it('shows the server error message and lets the traveller retry', async () => {
    submitReviewActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['You already reviewed this booking'] } })
    render(<ReviewForm locale="en" bookingId="b1" experienceId="e1" guideId="g1" t={en.reviews} />)
    fireEvent.click(screen.getByRole('radio', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: en.reviews.submitCta }))
    await screen.findByText('You already reviewed this booking')
    expect(screen.queryByText(en.reviews.submitted)).toBeNull()
  })
})
```

Add near the top of `apps/web/tests/experiences.booking-confirmation.host.test.tsx`:

```ts
const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

const { hasReviewForBookingMock } = vi.hoisted(() => ({ hasReviewForBookingMock: vi.fn(async () => false) }))
vi.mock('@/lib/reviews/queries', () => ({ hasReviewForBooking: hasReviewForBookingMock }))
```

And append inside `describe('BookingConfirmationPage', ...)`, right after the existing
"renders the completed state..." test:

```ts
  it('shows the review form on the completed branch for the real signed-in traveler on the booking', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'completed', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: 'u1', experienceId: 'e1', guideId: null,
    })
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByRole('button', { name: en.reviews.submitCta })).toBeTruthy()
  })

  it('hides the review form for a guest booking (no travelerUserId) even if someone is signed in', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'completed', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: null, experienceId: 'e1', guideId: null,
    })
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.queryByRole('button', { name: en.reviews.submitCta })).toBeNull()
  })

  it('shows "already reviewed" instead of the form when hasReviewForBooking is true', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'completed', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: 'u1', experienceId: 'e1', guideId: null,
    })
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    hasReviewForBookingMock.mockResolvedValueOnce(true)
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByText(en.reviews.alreadyReviewed)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.reviews.submitCta })).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/web && npx vitest run kinnso.review-form
cd apps/web && npx vitest run experiences.booking-confirmation.host
```
Expected: `kinnso.review-form` FAILS (module not found); the 3 new
`experiences.booking-confirmation.host` tests FAIL (no review form/already-reviewed copy
renders yet).

- [ ] **Step 3: Write the component, then wire it into the page**

```tsx
// apps/web/components/kinnso/ReviewForm.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { submitReviewAction } from '@/lib/reviews/actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ReviewForm({ locale, bookingId, experienceId, guideId, t, onSubmitted }: {
  locale: Locale
  bookingId: string
  experienceId: string
  guideId: string | null
  t: Messages['reviews']
  onSubmitted?: () => void
}) {
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const result = await submitReviewAction(locale, bookingId, experienceId, guideId, { rating, body })
    setPending(false)
    if (result.ok) {
      setSubmitted(true)
      onSubmitted?.()
    } else {
      setError(result.errors.form?.[0] ?? result.errors.rating?.[0] ?? t.genericError)
    }
  }

  if (submitted) {
    return <p className="text-sm font-semibold text-kinnso-ink">{t.submitted}</p>
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-kinnso-cream2 bg-white p-4 text-left">
      <h3 className="text-sm font-bold text-kinnso-ink">{t.formHeading}</h3>
      <div role="radiogroup" aria-label={t.ratingLabel} className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}`}
            onClick={() => setRating(n)}
            className={rating >= n ? 'text-kinnso-orangeDark' : 'text-kinnso-cream2'}
          >
            ★
          </button>
        ))}
      </div>
      <label className="mt-3 block text-xs font-semibold text-kinnso-muted" htmlFor="review-body">
        {t.bodyLabel}
      </label>
      <textarea
        id="review-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t.bodyPlaceholder}
        className="mt-1 w-full rounded-[3px] border border-kinnso-cream2 p-2 text-sm"
        rows={3}
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || rating === 0}
        className="mt-3 rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? t.submittingCta : t.submitCta}
      </button>
    </form>
  )
}

export default ReviewForm
```

Replace `apps/web/app/[locale]/experiences/[slug]/booked/page.tsx` in full:

```tsx
// apps/web/app/[locale]/experiences/[slug]/booked/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getBookingByCheckoutSession } from '@/lib/experiences/booking-confirmation-queries'
import { hasReviewForBooking } from '@/lib/reviews/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ReviewForm } from '@/components/kinnso/ReviewForm'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { locale, slug } = await params
  const { session_id: sessionId } = await searchParams
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const t = messages.booking
  const refreshHref = `/${locale}/experiences/${slug}/booked${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`

  const booking = sessionId ? await getBookingByCheckoutSession(sessionId) : null

  if (!booking) {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.notFoundTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.notFoundBody}</p>
      </div>
    )
  }

  if (booking.status === 'pending_payment') {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.pendingTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.pendingBody}</p>
        <a
          href={refreshHref}
          className="mt-4 inline-block rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white"
        >
          {t.refreshCta}
        </a>
      </div>
    )
  }

  if (booking.status === 'confirmed') {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.confirmedTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.confirmedBody}</p>
        <div className="k2-card mx-auto mt-6 max-w-sm bg-kinnso-cream2 p-6 text-left">
          <p className="text-sm font-semibold text-kinnso-ink">{booking.experienceTitle}</p>
          <p className="mt-2 text-sm text-kinnso-ink/70">{t.summaryQtyLabel}: {booking.qty}</p>
          <p className="mt-1 text-sm text-kinnso-ink/70">{t.summaryTotalLabel}: {booking.currency} {booking.totalAmount.toLocaleString()}</p>
        </div>
      </div>
    )
  }

  if (booking.status === 'completed') {
    // D-R6A-4: only the real, signed-in traveler on the booking may review it --
    // never a guest checkout, even if someone else happens to be signed in while
    // viewing this anon-readable confirmation page.
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const canReview = !!user && booking.travelerUserId === user.id
    const alreadyReviewed = canReview ? await hasReviewForBooking(supabase, booking.bookingId) : false
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.completedTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.completedBody}</p>
        <div className="k2-card mx-auto mt-6 max-w-sm bg-kinnso-cream2 p-6 text-left">
          <p className="text-sm font-semibold text-kinnso-ink">{booking.experienceTitle}</p>
          <p className="mt-2 text-sm text-kinnso-ink/70">{t.summaryQtyLabel}: {booking.qty}</p>
          <p className="mt-1 text-sm text-kinnso-ink/70">{t.summaryTotalLabel}: {booking.currency} {booking.totalAmount.toLocaleString()}</p>
        </div>
        {canReview && !alreadyReviewed ? (
          <div className="mx-auto mt-6 max-w-sm">
            <ReviewForm locale={locale as Locale} bookingId={booking.bookingId} experienceId={booking.experienceId} guideId={booking.guideId} t={messages.reviews} />
          </div>
        ) : null}
        {canReview && alreadyReviewed ? (
          <p className="mt-4 text-sm text-kinnso-muted">{messages.reviews.alreadyReviewed}</p>
        ) : null}
      </div>
    )
  }

  if (booking.status === 'refunded') {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.refundedTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.refundedBody}</p>
      </div>
    )
  }

  // booking.status === 'cancelled' — the check constraint still permits this
  // value even though no code path in this phase produces it (only
  // 'refunded' is produced by admin_cancel_and_refund_booking); handled
  // defensively as the final, explicit branch.
  return (
    <div className="k2-container py-16 text-center">
      <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.cancelledTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.cancelledBody}</p>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/web && npx vitest run kinnso.review-form
cd apps/web && npx vitest run experiences.booking-confirmation.host
```
Expected: both PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/ReviewForm.tsx apps/web/tests/kinnso.review-form.test.tsx "apps/web/app/[locale]/experiences/[slug]/booked/page.tsx" apps/web/tests/experiences.booking-confirmation.host.test.tsx
git commit -m "feat(web): ReviewForm + review CTA on the booked-confirmation completed branch"
```

---

## Task 21: `/trips` — real Saved sections + inline review CTA per completed booking

**Files:**
- Modify: `apps/web/components/kinnso/pages/TravelerTripsView.tsx` (full file, 92 lines)
- Modify: `apps/web/app/[locale]/trips/page.tsx` (full file, 38 lines)
- Modify: `apps/web/tests/trips.host.test.tsx` (full-file replacement)

- [ ] **Step 1: Write the failing test**

Replace `apps/web/tests/trips.host.test.tsx` in full:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TravelerTripsView } from '@/components/kinnso/pages/TravelerTripsView'

afterEach(cleanup)

const { unsaveGuideActionMock } = vi.hoisted(() => ({
  unsaveGuideActionMock: vi.fn(async () => ({ ok: true, guideId: 'g1' })),
}))
vi.mock('@/lib/saves/guide-actions', () => ({ unsaveGuideAction: unsaveGuideActionMock }))

const { unsaveExperienceActionMock } = vi.hoisted(() => ({
  unsaveExperienceActionMock: vi.fn(async () => ({ ok: true, experienceId: 'e1' })),
}))
vi.mock('@/lib/saves/experience-actions', () => ({ unsaveExperienceAction: unsaveExperienceActionMock }))

const { submitReviewActionMock } = vi.hoisted(() => ({
  submitReviewActionMock: vi.fn(async () => ({ ok: true, bookingId: 'b1' })),
}))
vi.mock('@/lib/reviews/actions', () => ({ submitReviewAction: submitReviewActionMock }))

const t = {
  title: 'Your trips',
  empty: 'No bookings yet — once you book an experience, it’ll show up here.',
  colExperience: 'Experience',
  colMerchant: 'Merchant',
  colQty: 'Qty',
  colStatus: 'Status',
  colAmount: 'Amount',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
  bookedOnLabel: 'Booked on',
  savedGuidesTitle: 'Saved guides',
  savedGuidesEmpty: "You haven't saved any guides yet.",
  savedExperiencesTitle: 'Saved experiences',
  savedExperiencesEmpty: "You haven't saved any experiences yet.",
  reviewCta: 'Leave a review',
  reviewedLabel: 'Reviewed',
}

const reviewsT = {
  formHeading: 'Leave a review', ratingLabel: 'Rating', bodyLabel: 'Your review (optional)',
  bodyPlaceholder: 'Tell other travellers about your experience…', submitCta: 'Submit review',
  submittingCta: 'Submitting…', submitted: 'Thanks for your review!',
  alreadyReviewed: 'You already reviewed this booking.', genericError: 'Something went wrong. Please try again.',
  ratingAverageLabel: '{average} out of 5', countLabel: '{count} reviews', emptyState: 'No reviews yet.',
  anonymousReviewer: 'A KINNSO traveller',
}

const baseBooking = {
  id: 'b1',
  experienceTitle: 'Hidden Waterfall Hike',
  experienceSlug: 'hidden-waterfall-hike',
  merchantName: 'Sunrise Stays HK',
  status: 'confirmed' as const,
  qty: 2,
  totalAmount: 900,
  currency: 'HKD',
  bookingDate: '2026-08-01',
  createdAt: '2026-07-04T00:00:00Z',
  experienceId: 'e1',
  guideId: null,
  reviewId: null,
}

describe('TravelerTripsView', () => {
  it('renders the empty state', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText(/No bookings yet/)).toBeInTheDocument()
  })

  it('renders a booking row', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[baseBooking]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Sunrise Stays HK')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Hidden Waterfall Hike' })
    expect(link.getAttribute('href')).toBe('/en/experiences/hidden-waterfall-hike')
  })

  it('renders a booking row with a null bookingDate: falls back to "Booked on <createdAt>"', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[{ ...baseBooking, id: 'b2', status: 'pending_payment', bookingDate: null }]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.getByText(/Booked on/)).toBeInTheDocument()
  })

  it('renders plain text (not a link) when experienceSlug is empty', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[{ ...baseBooking, id: 'b3', experienceSlug: '', experienceTitle: 'Now-Unlisted Tour' }]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Now-Unlisted Tour')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Now-Unlisted Tour' })).toBeNull()
  })

  it('shows a "Leave a review" CTA for a completed booking with no review, and opens the form on click', async () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[{ ...baseBooking, id: 'b4', status: 'completed', reviewId: null }]} savedGuides={[]} savedExperiences={[]} />)
    const cta = screen.getByRole('button', { name: 'Leave a review' })
    fireEvent.click(cta)
    expect(screen.getByRole('button', { name: reviewsT.submitCta })).toBeInTheDocument()
  })

  it('shows "Reviewed" (no CTA) for a completed booking that already has a reviewId', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[{ ...baseBooking, id: 'b5', status: 'completed', reviewId: 'r1' }]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave a review' })).toBeNull()
  })

  it('shows neither a CTA nor "Reviewed" for a non-completed booking', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[baseBooking]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.queryByRole('button', { name: 'Leave a review' })).toBeNull()
    expect(screen.queryByText('Reviewed')).toBeNull()
  })

  it('shows the empty state for both Saved sections when nothing is saved', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} bookings={[]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText("You haven't saved any guides yet.")).toBeInTheDocument()
    expect(screen.getByText("You haven't saved any experiences yet.")).toBeInTheDocument()
  })

  it('renders a saved guide as a real GuideCard and removes it from the list on unsave', async () => {
    render(
      <TravelerTripsView
        locale="en" t={t} reviewsT={reviewsT} bookings={[]}
        savedGuides={[{ guideId: 'g1', guide: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Kyoto', saves: 5, creatorHandle: 'teafan' } }]}
        savedExperiences={[]}
      />,
    )
    expect(screen.getByText('Kyoto Tea Houses')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(unsaveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await waitFor(() => expect(screen.queryByText('Kyoto Tea Houses')).toBeNull())
  })

  it('renders a saved experience as a real ExperienceCard and removes it from the list on unsave', async () => {
    render(
      <TravelerTripsView
        locale="en" t={t} reviewsT={reviewsT} bookings={[]} savedGuides={[]}
        savedExperiences={[{ experienceId: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null, savesCount: 3 }]}
      />,
    )
    expect(screen.getByText('Sunset junk boat tour')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(unsaveExperienceActionMock).toHaveBeenCalledWith('en', 'e1'))
    await waitFor(() => expect(screen.queryByText('Sunset junk boat tour')).toBeNull())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run trips.host`
Expected: FAIL — `TravelerTripsView` doesn't accept `reviewsT`/`savedGuides`/`savedExperiences` yet,
no review CTA or Saved sections render.

- [ ] **Step 3: Apply the diff**

Replace `apps/web/components/kinnso/pages/TravelerTripsView.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import GuideCard from '@/components/kinnso/GuideCard'
import ExperienceCard from '@/components/kinnso/ExperienceCard'
import { ReviewForm } from '@/components/kinnso/ReviewForm'
import { unsaveGuideAction } from '@/lib/saves/guide-actions'
import { unsaveExperienceAction } from '@/lib/saves/experience-actions'
import type { Locale } from '@/lib/i18n/config'
import type { Messages, TravelerTripsMessages } from '@/lib/i18n/messages/en'
import type { TravelerBookingRow } from '@/lib/bookings/types'
import type { SavedGuideEntry } from '@/lib/saves/guide-queries'
import type { SavedExperienceEntry } from '@/lib/saves/experience-queries'

const STATUS_KEY: Record<TravelerBookingRow['status'], keyof TravelerTripsMessages> = {
  pending_payment: 'statusPendingPayment',
  confirmed: 'statusConfirmed',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
}

type TravelerTripsViewProps = {
  locale: Locale
  t: TravelerTripsMessages
  reviewsT: Messages['reviews']
  bookings: TravelerBookingRow[]
  savedGuides: SavedGuideEntry[]
  savedExperiences: SavedExperienceEntry[]
}

export function TravelerTripsView({
  locale, t, reviewsT, bookings,
  savedGuides: initialSavedGuides, savedExperiences: initialSavedExperiences,
}: TravelerTripsViewProps) {
  const [savedGuides, setSavedGuides] = useState(initialSavedGuides)
  const [savedExperiences, setSavedExperiences] = useState(initialSavedExperiences)
  const [openReviewFor, setOpenReviewFor] = useState<string | null>(null)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())

  async function handleUnsaveGuide(guideId: string) {
    const result = await unsaveGuideAction(locale, guideId)
    if (result.ok) setSavedGuides((prev) => prev.filter((g) => g.guideId !== guideId))
  }

  async function handleUnsaveExperience(experienceId: string) {
    const result = await unsaveExperienceAction(locale, experienceId)
    if (result.ok) setSavedExperiences((prev) => prev.filter((e) => e.experienceId !== experienceId))
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.title}</h1>

      <div className="mt-6 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
        <div className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-3 text-xs font-bold uppercase text-kinnso-muted sm:grid-cols-[1fr_160px_80px_140px_140px]">
          <span>{t.colExperience}</span>
          <span>{t.colMerchant}</span>
          <span>{t.colQty}</span>
          <span>{t.colStatus}</span>
          <span>{t.colAmount}</span>
        </div>
        {bookings.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-kinnso-muted">{t.empty}</p>
          </div>
        ) : (
          bookings.map((b) => {
            const hasReview = b.reviewId !== null || reviewedIds.has(b.id)
            const canReview = b.status === 'completed' && !hasReview
            return (
              <div key={b.id} className="border-b border-kinnso-cream2 px-4 py-4 last:border-b-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_80px_140px_140px] sm:items-center">
                  <div>
                    {b.experienceSlug === '' ? (
                      // experiences(...) is a nullable embed (no `!inner`) — the merchant may
                      // have since unpublished this experience, which experiences_public_read
                      // RLS hides from this same query. Render plain text instead of a link
                      // that would resolve to a 404.
                      <span className="font-bold text-kinnso-ink">{b.experienceTitle}</span>
                    ) : (
                      <Link
                        href={`/${locale}/experiences/${b.experienceSlug}`}
                        className="font-bold text-kinnso-ink hover:text-kinnso-orangeDark"
                      >
                        {b.experienceTitle}
                      </Link>
                    )}
                    {/* bookingDate comes from experience_availability, whose RLS only exposes
                        rows where date >= current_date — so any past/completed trip will
                        always have a null bookingDate here regardless of whether the date
                        data exists historically. Fall back to createdAt so completed trips
                        still show *something* instead of a blank. */}
                    <p className="mt-0.5 text-xs text-kinnso-muted">
                      {b.bookingDate
                        ? new Date(b.bookingDate).toLocaleDateString(locale)
                        : `${t.bookedOnLabel} ${new Date(b.createdAt).toLocaleDateString(locale)}`}
                    </p>
                  </div>
                  <span className="text-sm text-kinnso-muted">{b.merchantName}</span>
                  <span className="text-sm text-kinnso-muted">{b.qty}</span>
                  <span className="text-sm text-kinnso-muted">{t[STATUS_KEY[b.status]]}</span>
                  <span className="text-sm text-kinnso-muted">
                    {b.currency} {b.totalAmount.toFixed(2)}
                  </span>
                </div>
                {canReview ? (
                  openReviewFor === b.id ? (
                    <ReviewForm
                      locale={locale}
                      bookingId={b.id}
                      experienceId={b.experienceId}
                      guideId={b.guideId}
                      t={reviewsT}
                      onSubmitted={() => setReviewedIds((prev) => new Set(prev).add(b.id))}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenReviewFor(b.id)}
                      className="mt-2 text-sm font-semibold text-kinnso-orangeDark hover:underline"
                    >
                      {t.reviewCta}
                    </button>
                  )
                ) : hasReview ? (
                  <p className="mt-2 text-xs font-semibold text-kinnso-muted">{t.reviewedLabel}</p>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div className="mt-10 border-t border-kinnso-cream2 pt-6">
        <h2 className="k-section-title text-lg">{t.savedGuidesTitle}</h2>
        {savedGuides.length === 0 ? (
          <p className="mt-2 text-sm text-kinnso-muted">{t.savedGuidesEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {savedGuides.map((entry) => (
              <GuideCard
                key={entry.guideId}
                g={entry.guide}
                locale={locale}
                isSaved={true}
                onSaveToggle={() => handleUnsaveGuide(entry.guideId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-kinnso-cream2 pt-6">
        <h2 className="k-section-title text-lg">{t.savedExperiencesTitle}</h2>
        {savedExperiences.length === 0 ? (
          <p className="mt-2 text-sm text-kinnso-muted">{t.savedExperiencesEmpty}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {savedExperiences.map((entry) => (
              <ExperienceCard
                key={entry.experienceId}
                experience={entry}
                locale={locale}
                isSaved={true}
                onSaveToggle={() => handleUnsaveExperience(entry.experienceId)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

export default TravelerTripsView
```

Replace `apps/web/app/[locale]/trips/page.tsx` in full:

```tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { TravelerTripsView } from '@/components/kinnso/pages/TravelerTripsView'
import { listMyBookings } from '@/lib/bookings/queries'
import { listSavedGuides } from '@/lib/saves/guide-queries'
import { listSavedExperiences } from '@/lib/saves/experience-queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export const metadata: Metadata = noindexMetadata()

type Params = Promise<{ locale: string }>

export default async function TripsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  // Per D-R3-5: no role check beyond "is signed in" — /trips is the default
  // landing for any authenticated user without a more specific role (traveler
  // is resolveViewerRole's fallback). A merchant/creator/ops user who also
  // personally booked something as a traveller can still see their own
  // bookings here — this is intentional, not a gap.
  const [bookings, savedGuides, savedExperiences] = await Promise.all([
    listMyBookings(supabase, user.id),
    listSavedGuides(supabase, user.id),
    listSavedExperiences(supabase, user.id),
  ])

  return (
    <TravelerTripsView
      locale={loc}
      t={messages.trips}
      reviewsT={messages.reviews}
      bookings={bookings}
      savedGuides={savedGuides}
      savedExperiences={savedExperiences}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run trips.host`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add "apps/web/components/kinnso/pages/TravelerTripsView.tsx" "apps/web/app/[locale]/trips/page.tsx" apps/web/tests/trips.host.test.tsx
git commit -m "feat(web): real Saved guides/experiences sections + inline review CTA on /trips"
```

---

## Task 22: Final full-repo sweep

**Files:** none created; fixes wherever the sweep finds regressions.

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck` (from repo root, not scoped — this program's past phases (R4, R5)
both found real regressions via a full sweep that scoped per-task runs missed, most
often Vitest mock-narrowing errors: an initial `vi.fn(async () => ...)` inferring a type
too narrow for a later `mockResolvedValueOnce` override elsewhere in the same file).
Fix any errors found, most likely by adding an explicit `Promise<T>` return-type
annotation to the offending `vi.fn()` declaration.

- [ ] **Step 2: Full lint**

Run: `pnpm lint` (from repo root). Fix any findings.

- [ ] **Step 3: Full test suite for the web app**

Run: `cd apps/web && npx vitest run` (per the Vitest-scoping-gotcha memory, do NOT run
`pnpm --filter web test` for this — it can time out; running vitest directly inside
`apps/web` is the correct scoping). Confirm every new/modified test file passes,
including the parity/reviews/guide-experience-save i18n suites and the
`db.r6a-saves-and-reviews` migration-SQL test.

- [ ] **Step 4: Re-read the design spec once more against the shipped code**

Specifically verify: (a) `guides.saves_count`/`experiences.saves_count` are only ever
written by the two triggers, never by any action directly; (b) `reviews_insert`'s RLS
really does gate on `bookings.status = 'completed'`, not `'confirmed'` (D-R6A-1); (c) no
guest booking (`traveler_user_id is null`) can ever produce a review (D-R6A-4); (d) every
`aggregateRating` emission site omits the field entirely at zero reviews, never emitting
`ratingCount: 0`; (e) all 7 locale files were touched for every new i18n group/key
(`i18n.locale-parity` passing already confirms this mechanically, but re-read a couple of
non-English translations for content fidelity per the i18n-translation-fidelity-gotcha
memory — none of this phase's new copy makes an email/notification promise, but confirm
that holds).

- [ ] **Step 5: Commit any fixes found**

```bash
git add -A
git commit -m "fix(web): R6A final sweep fixes"
```
(Only if Steps 1-4 found something to fix; skip this step if the sweep was clean.)

---

## Follow-up items (explicitly out of scope for this plan, not silently dropped)

- Wiring the real save toggle into `GuideCard`'s 3 pre-existing consumers
  (`ArticleGuideLinks.tsx`, `ExploreView.tsx`, `CreatorProfileView.tsx`) — see the plan
  header's scope note. No new backend work needed; each site just needs to fetch the
  current user + call `isGuideSaved`/`listSavedGuides` and pass the two new optional props.
- R6B (destinations browse) and R6C (cross-links + editorial overrides + testimonial
  rotation) — separate, not-yet-brainstormed sub-phases of the master spec's Phase R6.
- Ops moderation UI for hiding a published review (the `reviews_ops_update` RLS policy
  exists; no admin-console screen consumes it yet — same shape as how `bookings_ops_select`
  existed before `/admin/bookings` was built in an earlier phase).

