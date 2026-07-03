# Phase R2B — Dashboard Consolidation + Experiences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the merchant app under `/merchants/dashboard/*` (with permanent
redirects from every old URL), give merchants a public identity (slug/tagline/city/logo
+ a PII-safe public view), and let an approved merchant create, edit, publish, and pause
`experiences` entirely from the dashboard — the supply side that R2C's public pages and
R3's booking flow will consume.

**Architecture:** One migration adds the public profile columns (slug backfilled +
trigger-generated so R2A's approve RPC needs no change), the owner-executed
`merchant_public_profiles` view (PII-safe anon reads — the base table keeps no anon
policy), and the `experiences` table (merchant-owner CRUD via RLS, anon read of
published rows belonging to active merchants). App-side: the five merchant routes move
(file moves, internals unchanged) under `/merchants/dashboard/`, old paths become
`permanentRedirect()` stubs (in-repo, deterministic — chosen over `seo_redirects` DB
rows), and two new dashboard surfaces land: a profile editor (owner-RLS update,
column grants enforce which fields) and experiences CRUD mirroring the studio-guides
pattern (`lib/guides/{actions,validation,slug}.ts` is the template; `makeSlug`/`slugify`
are reused directly).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions +
`permanentRedirect`), Supabase Postgres (RLS, column grants, definer-style view,
trigger), TypeScript, Vitest, Tailwind v4 (`kinnso-*`/`k2-*` public tokens).

---

## Ground truth this plan relies on (verified 2026-07-04)

- Repo clone: `/private/tmp/claude-947366395/-Users-willylai-Documents-Claude-Projects-Remix-Kinnso2/2650fdcf-67be-48d5-b3c7-b8f8887011af/scratchpad/Remix-Kinnso`, branch `feat/revision-r2b` (fresh from `origin/main` @ `b6f63bb` = post-R2A squash).
- Design spec: `docs/superpowers/specs/2026-07-03-phase-r2-merchant-supply-design.md` (§D-R2-3, D-R2-4, D-R2-5, D-R2-7 R2B, §4).
- Live Supabase project `scryfkefedzuetfdtrvl`. Post-R2A state: `merchant_profiles` has NO owner-insert policy; owner UPDATE is column-granted to exactly (company_name, contact_name, contact_email, website_url). `public.set_updated_at()` trigger fn exists.
- **Every non-test reference to the four moving routes** (grep-verified):
  - `app/[locale]/studio/page.tsx:33` — merchant role redirect → `/merchants/post`
  - `components/kinnso/Navbar.tsx:46-48` — merchant sub-row (missions/creators/insights); `:55` — merchant CTA → `/merchants/post`
  - `components/kinnso/BrandContactCard.tsx:21,43` — brief links → `/merchants/post`
  - `components/kinnso/Footer.tsx:11` — `lPostMission` → `/merchants/post`
  - `components/kinnso/pages/MerchantsLandingView.tsx:15-17` — hub cards (post/creators/missions)
  - `components/kinnso/pages/MissionDetailView.tsx:56` — back link → `/merchants/missions`
  - `components/kinnso/pages/MissionPostWizard.tsx:129,133` — success links → `/merchants/missions[/:id]`
  - `components/kinnso/pages/MerchantMissionsView.tsx:34,42` — post CTA + row links
  - `lib/missions/actions.ts:93` — `const merchantMissionsPath = '/merchants/missions'` (revalidate)
  - `lib/merchants/saved-actions.ts:7` + `lib/merchants/invite-actions.ts:7` — `merchantCreatorsPath` (revalidate)
  - `lib/auth/gate.ts:33-35` — gated prefixes
  - `lib/seo/routes.ts:19` — `ROBOTS_DISALLOW` entries
  - Plus R2A's `components/kinnso/pages/MerchantApplyView.tsx:157` — already-merchant CTA → `/merchants` (retarget to `/merchants/dashboard`).
- Owner-CRUD template: `lib/guides/actions.ts` (create/update with local ActionResult, publish/published_at transition, `makeSlug(title, randomUUID().slice(0,6))`), `lib/guides/validation.ts` (code-string errors, `isHttpUrl`), `lib/guides/slug.ts` (**reused, not copied**), `app/[locale]/studio/guides/new/page.tsx` (page defines `'use server'` wrapper that redirects on ok).
- `permanentRedirect()` from `next/navigation` issues **308**. e2e `apps/e2e/specs/redirects.spec.ts` asserts `request.get(url, { maxRedirects: 0 })` status + resolved Location.
- `tests/kinnso.route-parity.test.tsx` walks Navbar/Footer/HomeView hrefs against the filesystem — the new dashboard hrefs fail it until the routes exist (built-in safety net).
- Vitest: `cd apps/web && npx vitest run <files>` only. `packages/db/types.ts` is hand-patched. i18n parity auto-derives groups from `Object.keys(en)`.
- Migration naming: latest is `20260703100000_r2a_merchant_applications.sql`; this plan's is `20260704090000_r2b_merchant_public_fields_and_experiences.sql`.

## File map

| Path | Change |
|---|---|
| `supabase/migrations/20260704090000_r2b_merchant_public_fields_and_experiences.sql` | Create |
| `packages/db/types.ts` | Modify (merchant_profiles cols, experiences table, merchant_public_profiles view) |
| `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Modify (`merchantDashboard` group) |
| `apps/web/app/[locale]/merchants/dashboard/{page,profile/page,experiences/page,experiences/new/page,experiences/[experienceId]/edit/page}.tsx` | Create |
| `apps/web/app/[locale]/merchants/dashboard/{post,missions,missions/[missionId],creators,insights}/page.tsx` | Moved from `merchants/*` |
| `apps/web/app/[locale]/merchants/{post,missions,missions/[missionId],creators,insights}/page.tsx` | Replaced with 308 stubs |
| `apps/web/lib/auth/gate.ts`, `apps/web/lib/seo/routes.ts` | Modify |
| 10 link-referencing files listed above | Modify (path swap only) |
| `apps/web/lib/merchants/profile-{queries,actions,validation}.ts` | Create |
| `apps/web/lib/experiences/{types,validation,queries,actions}.ts` | Create |
| `apps/web/components/kinnso/pages/{MerchantDashboardHomeView,MerchantProfileView,MerchantExperiencesView,ExperienceForm}.tsx` | Create |
| `apps/web/tests/merchants.dashboard-redirects.test.tsx` | Create |
| `apps/web/tests/merchants.profile-actions.test.ts` | Create |
| `apps/web/tests/experiences.validation.test.ts` | Create |
| `apps/web/tests/experiences.actions.test.ts` | Create |
| `apps/web/tests/merchants.dashboard.host.test.tsx` | Create |
| `apps/web/tests/mission.rls.test.ts` | Modify (add `experiences` + view checks) |
| `apps/e2e/specs/redirects.spec.ts` | Modify (dashboard 308 block) |

---

### Task 1: Migration — public profile fields, slug trigger + backfill, public view, experiences

**Files:**
- Create: `supabase/migrations/20260704090000_r2b_merchant_public_fields_and_experiences.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase R2B — (1) merchant public identity: slug/tagline/city/logo_url on
-- merchant_profiles; slug is trigger-generated on INSERT (so R2A's approve RPC needs no
-- change) and backfilled for existing rows; slug is NOT in the owner UPDATE column grant
-- (immutable in R2 — no rename/redirect management yet).
-- (2) merchant_public_profiles VIEW: the PII-safe anon read surface. The base table keeps
-- NO anon policy (RLS filters rows, not columns — an anon row policy would expose
-- contact_email to hand-crafted PostgREST queries). The view runs owner-executed
-- (security_invoker OFF — Postgres default), bypassing base RLS by design, and projects
-- only public columns of active, slugged merchants. The Supabase advisor flags
-- definer-style views — DELIBERATE, documented in the R2 design spec §D-R2-3.
-- (3) experiences: merchant-owned listings. Owner CRUD via RLS subquery; public read of
-- published rows belonging to active merchants (no PII columns, so a plain row policy is
-- safe here, unlike merchant_profiles).

-- ── 1. Public profile columns ────────────────────────────────────────────────
alter table public.merchant_profiles
  add column if not exists slug text unique,
  add column if not exists tagline text,
  add column if not exists city text,
  add column if not exists logo_url text;

create or replace function public.merchant_slugify(p_text text)
returns text language sql immutable as $$
  select coalesce(
    nullif(btrim(regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g'), '-'), ''),
    'merchant')
$$;

create or replace function public.merchant_profiles_set_slug()
returns trigger language plpgsql as $$
declare v_base text;
begin
  if new.slug is not null then return new; end if;
  v_base := public.merchant_slugify(new.company_name);
  if exists (select 1 from public.merchant_profiles where slug = v_base) then
    v_base := v_base || '-' || left(new.id::text, 6);
  end if;
  new.slug := v_base;
  return new;
end $$;

drop trigger if exists merchant_profiles_set_slug on public.merchant_profiles;
create trigger merchant_profiles_set_slug
  before insert on public.merchant_profiles
  for each row execute procedure public.merchant_profiles_set_slug();

-- Backfill existing rows (oldest first so the earliest merchant wins the bare slug).
do $$
declare r record; v_base text;
begin
  for r in select id, company_name from public.merchant_profiles
           where slug is null order by created_at, id loop
    v_base := public.merchant_slugify(r.company_name);
    if exists (select 1 from public.merchant_profiles where slug = v_base) then
      v_base := v_base || '-' || left(r.id::text, 6);
    end if;
    update public.merchant_profiles set slug = v_base where id = r.id;
  end loop;
end $$;

-- Owner may now edit the new public fields — but never slug/status/tier.
grant update (tagline, city, logo_url) on public.merchant_profiles to authenticated;

-- ── 2. PII-safe public view ──────────────────────────────────────────────────
create or replace view public.merchant_public_profiles as
  select id, slug, company_name, tagline, city, logo_url, website_url, created_at
  from public.merchant_profiles
  where status = 'active' and slug is not null;

revoke all on public.merchant_public_profiles from anon, authenticated;
grant select on public.merchant_public_profiles to anon, authenticated;

-- ── 3. experiences ───────────────────────────────────────────────────────────
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid not null references public.merchant_profiles(id) on delete cascade,
  slug text not null unique,
  title text not null,
  summary text,
  description text,
  city text not null,
  price_amount numeric(10,2) not null check (price_amount >= 0),
  currency text not null default 'HKD'
    check (currency in ('HKD','USD','SGD','JPY','KRW','THB','TWD','CNY')),
  duration_minutes integer check (duration_minutes > 0),
  cover_url text,
  status text not null default 'draft' check (status in ('draft','published','paused')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index experiences_merchant_idx on public.experiences(merchant_profile_id);
create index experiences_public_idx on public.experiences(status, published_at desc);

alter table public.experiences enable row level security;

create policy experiences_owner_all on public.experiences
  for all to authenticated
  using (merchant_profile_id in
    (select id from public.merchant_profiles where user_id = (select auth.uid())))
  with check (merchant_profile_id in
    (select id from public.merchant_profiles where user_id = (select auth.uid())));

create policy experiences_public_read on public.experiences
  for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.merchant_profiles m
    where m.id = merchant_profile_id and m.status = 'active'));

create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute procedure public.set_updated_at();

revoke all on table public.experiences from anon, authenticated;
grant select on table public.experiences to anon;
grant select, insert, update, delete on table public.experiences to authenticated;
```

- [ ] **Step 2: Apply to live** — Supabase MCP `apply_migration`, project `scryfkefedzuetfdtrvl`, name `r2b_merchant_public_fields_and_experiences`. (Production DB write — confirm with the user first if this session hasn't already been explicitly authorized for R2B's migration.)

- [ ] **Step 3: Verify live** — MCP `execute_sql`:

```sql
select
  (select count(*) from public.merchant_profiles where slug is null) as null_slugs,
  (select count(distinct slug) from public.merchant_profiles) as distinct_slugs,
  (select count(*) from public.merchant_profiles) as merchant_count,
  (select count(*) from information_schema.views
    where table_schema='public' and table_name='merchant_public_profiles') as view_exists,
  (select count(*) from pg_policy where polrelid = 'public.experiences'::regclass) as exp_policies;
```

Expected: `null_slugs=0`, `distinct_slugs = merchant_count` (5 — the 4 seeded + 1 R2A-approved, if any; equality is the invariant), `view_exists=1`, `exp_policies=2`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260704090000_r2b_merchant_public_fields_and_experiences.sql
git commit -m "feat(db): merchant public identity (slug/view) + experiences table

Slug is trigger-generated + backfilled (R2A approve RPC unchanged); public
reads go through the owner-executed merchant_public_profiles view so
contact PII stays unreachable to anon; experiences: owner CRUD via RLS,
public read of published rows of active merchants."
```

---

### Task 2: Hand-patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1:** In the `merchant_profiles` entry, add to `Row`: `city: string | null`, `logo_url: string | null`, `slug: string | null`, `tagline: string | null` (alphabetical among existing keys); to `Insert`/`Update`: same four as optional (`city?: string | null`, etc.).

- [ ] **Step 2:** Add a new `experiences` table entry alphabetically (between `dna`-ish entries and `guides` — wherever `experiences` sorts; check neighbors with `grep -n "^      guides: {" packages/db/types.ts`):

```typescript
      experiences: {
        Row: {
          city: string
          cover_url: string | null
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number | null
          id: string
          merchant_profile_id: string
          price_amount: number
          published_at: string | null
          slug: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          city: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          merchant_profile_id: string
          price_amount: number
          published_at?: string | null
          slug: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          city?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          merchant_profile_id?: string
          price_amount?: number
          published_at?: string | null
          slug?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3:** Replace the empty `Views` block (`Views: { [_ in never]: never }`) with:

```typescript
    Views: {
      merchant_public_profiles: {
        Row: {
          city: string | null
          company_name: string
          created_at: string
          id: string
          logo_url: string | null
          slug: string
          tagline: string | null
          website_url: string | null
        }
        Relationships: []
      }
    }
```

- [ ] **Step 4:** `cd apps/web && npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-patch types for merchant public fields, experiences, view"
```

---

### Task 3: i18n — `merchantDashboard` group × 7 locales

**Files:** all 7 `apps/web/lib/i18n/messages/*.ts`

- [ ] **Step 1:** In `en.ts`, add above `export interface Messages {`:

```typescript
export interface MerchantDashboardMessages {
  title: string
  subtitle: string
  open: string
  cardPostTitle: string
  cardPostBody: string
  cardMissionsTitle: string
  cardMissionsBody: string
  cardCreatorsTitle: string
  cardCreatorsBody: string
  cardInsightsTitle: string
  cardInsightsBody: string
  cardExperiencesTitle: string
  cardExperiencesBody: string
  cardProfileTitle: string
  cardProfileBody: string
  profileTitle: string
  profileSubtitle: string
  slugLabel: string
  slugNote: string
  fieldCompanyName: string
  fieldContactName: string
  fieldContactEmail: string
  fieldWebsite: string
  fieldTagline: string
  fieldCity: string
  fieldLogoUrl: string
  saveCta: string
  savedNote: string
  expTitle: string
  expSubtitle: string
  expNew: string
  expEmpty: string
  colTitle: string
  colCity: string
  colPrice: string
  colStatus: string
  statusDraft: string
  statusPublished: string
  statusPaused: string
  actEdit: string
  actPublish: string
  actPause: string
  formTitleNew: string
  formTitleEdit: string
  fieldTitle: string
  fieldSummary: string
  fieldDescription: string
  fieldExpCity: string
  fieldPrice: string
  fieldCurrency: string
  fieldDuration: string
  fieldCoverUrl: string
  saveDraftCta: string
  publishCta: string
  backToList: string
  errorGeneric: string
  errRequired: string
  errTooLong: string
  errInvalidUrl: string
  errInvalidNumber: string
}
```

register `merchantDashboard: MerchantDashboardMessages` in `Messages` (near `merchantApply`), and add the English values near the `merchantApply` object literal:

```typescript
  merchantDashboard: {
    title: 'Merchant dashboard',
    subtitle: 'Run your missions, listings, and public profile from one place.',
    open: 'Open',
    cardPostTitle: 'Post a mission',
    cardPostBody: 'Brief vetted creators and pay on published results.',
    cardMissionsTitle: 'Your missions',
    cardMissionsBody: 'Review applicants, submissions, and settlement status.',
    cardCreatorsTitle: 'Find creators',
    cardCreatorsBody: 'Search vetted creators and invite them to your briefs.',
    cardInsightsTitle: 'Insights',
    cardInsightsBody: 'See how your missions and creators are performing.',
    cardExperiencesTitle: 'Experiences',
    cardExperiencesBody: 'List the tours and activities travellers will soon book.',
    cardProfileTitle: 'Public profile',
    cardProfileBody: 'Control how your business appears across KINNSO.',
    profileTitle: 'Public profile',
    profileSubtitle: 'These details appear on your public merchant page.',
    slugLabel: 'Profile URL',
    slugNote: 'Your profile address is fixed for now — contact us to change it.',
    fieldCompanyName: 'Company name',
    fieldContactName: 'Contact name',
    fieldContactEmail: 'Contact email',
    fieldWebsite: 'Website',
    fieldTagline: 'Tagline',
    fieldCity: 'City',
    fieldLogoUrl: 'Logo URL',
    saveCta: 'Save profile',
    savedNote: 'Profile saved.',
    expTitle: 'Experiences',
    expSubtitle: 'Bookable listings — booking opens in a later release.',
    expNew: 'New experience',
    expEmpty: 'No experiences yet. Create your first listing.',
    colTitle: 'Title',
    colCity: 'City',
    colPrice: 'Price',
    colStatus: 'Status',
    statusDraft: 'Draft',
    statusPublished: 'Published',
    statusPaused: 'Paused',
    actEdit: 'Edit',
    actPublish: 'Publish',
    actPause: 'Pause',
    formTitleNew: 'New experience',
    formTitleEdit: 'Edit experience',
    fieldTitle: 'Title',
    fieldSummary: 'Summary',
    fieldDescription: 'Description',
    fieldExpCity: 'City',
    fieldPrice: 'Price',
    fieldCurrency: 'Currency',
    fieldDuration: 'Duration (minutes)',
    fieldCoverUrl: 'Cover image URL',
    saveDraftCta: 'Save draft',
    publishCta: 'Save & publish',
    backToList: 'Back to experiences',
    errorGeneric: 'Could not save. Please try again.',
    errRequired: 'This field is required',
    errTooLong: 'Too long',
    errInvalidUrl: 'Enter a valid http(s) URL',
    errInvalidNumber: 'Enter a valid number',
  },
```

- [ ] **Step 2:** Mirror the object (translated, same keys) in the other 6 locale files, near each file's `merchantApply` group. Register: zh-hk (HK business register), zh-tw, zh-cn, ja, ko (formal), th — translate faithfully; the translator executing this step writes each block in full, matching the R2A `merchantApply` group's tone per locale. No key may be omitted (parity test enforces).

- [ ] **Step 3:** `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts` — PASS; `npx tsc --noEmit` — clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "i18n(web): merchantDashboard group × 7 locales"
```

---

### Task 4: Route moves, 308 stubs, gate/robots, link sweep

**Files:**
- Move: the five pages `apps/web/app/[locale]/merchants/{post,missions,missions/[missionId],creators,insights}/page.tsx` → same paths under `merchants/dashboard/`
- Create: five stub pages at the old paths
- Modify: `lib/auth/gate.ts`, `lib/seo/routes.ts`, and the 11 link-referencing files from Ground truth
- Test: `apps/web/tests/merchants.dashboard-redirects.test.tsx`

- [ ] **Step 1: Write the failing redirect-stub test**

```typescript
// apps/web/tests/merchants.dashboard-redirects.test.tsx
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  permanentRedirect: (url: string) => { throw new Error(`permanentRedirect:${url}`) },
}))

import PostStub from '@/app/[locale]/merchants/post/page'
import MissionsStub from '@/app/[locale]/merchants/missions/page'
import MissionDetailStub from '@/app/[locale]/merchants/missions/[missionId]/page'
import CreatorsStub from '@/app/[locale]/merchants/creators/page'
import InsightsStub from '@/app/[locale]/merchants/insights/page'

const params = (extra: Record<string, string> = {}) =>
  Promise.resolve({ locale: 'en', ...extra })

describe('legacy merchant routes 308 to /merchants/dashboard/*', () => {
  it('post', async () => {
    await expect(PostStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/post')
  })
  it('missions', async () => {
    await expect(MissionsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/missions')
  })
  it('missions/[missionId] preserves the id', async () => {
    await expect(MissionDetailStub({ params: params({ missionId: 'm-123' }) })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/missions/m-123')
  })
  it('creators', async () => {
    await expect(CreatorsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/creators')
  })
  it('insights', async () => {
    await expect(InsightsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/insights')
  })
  it('invalid locale is notFound, not redirected', async () => {
    await expect(PostStub({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })
})
```

Run: `cd apps/web && npx vitest run tests/merchants.dashboard-redirects.test.tsx` — FAIL (stubs don't exist; the current files are the real pages).

- [ ] **Step 2: Move the five pages**

```bash
cd apps/web/app/[locale]/merchants
mkdir -p dashboard/missions dashboard/post dashboard/creators dashboard/insights
git mv post/page.tsx dashboard/post/page.tsx
git mv missions/page.tsx dashboard/missions/page.tsx
git mv "missions/[missionId]" "dashboard/missions/[missionId]"
git mv creators/page.tsx dashboard/creators/page.tsx
git mv insights/page.tsx dashboard/insights/page.tsx
```

Page internals stay untouched in this step (their imports are `@/`-absolute).

- [ ] **Step 3: Create the five stubs.** Four share this shape (substitute the segment):

```tsx
// apps/web/app/[locale]/merchants/post/page.tsx  (repeat for missions, creators, insights)
import { notFound, permanentRedirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/config'

// R2B: the merchant app moved under /merchants/dashboard/* (design spec D-R2-5).
// In-repo 308 stub — deterministic, testable, no seo_redirects DB dependency.
export default async function LegacyMerchantPostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  permanentRedirect(`/${locale}/merchants/dashboard/post`)
}
```

and the param-preserving one:

```tsx
// apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx
import { notFound, permanentRedirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/config'

export default async function LegacyMerchantMissionDetailPage({ params }: {
  params: Promise<{ locale: string; missionId: string }>
}) {
  const { locale, missionId } = await params
  if (!isLocale(locale)) notFound()
  permanentRedirect(`/${locale}/merchants/dashboard/missions/${missionId}`)
}
```

Run the Step 1 test — PASS (6 tests).

- [ ] **Step 4: gate.ts + routes.ts.** In `lib/auth/gate.ts` replace the three merchant entries with one:

```typescript
    'merchants/dashboard',
```

(the prefix logic `rest === prefix || rest.startsWith(prefix + '/')` covers every dashboard page — including creators/insights which previously relied only on page-level gates). In `lib/seo/routes.ts` replace line 19 with:

```typescript
  '/*/merchants/dashboard', '/*/merchants/apply',
```

- [ ] **Step 5: Link sweep.** Pure path swaps, `/merchants/X` → `/merchants/dashboard/X`, in exactly these places (Ground truth list): `studio/page.tsx:33`, `Navbar.tsx:46-48,55`, `BrandContactCard.tsx:21,43`, `Footer.tsx:11`, `MerchantsLandingView.tsx:15-17`, `MissionDetailView.tsx:56`, `MissionPostWizard.tsx:129,133`, `MerchantMissionsView.tsx:34,42`, `lib/missions/actions.ts:93` (`'/merchants/dashboard/missions'`), `lib/merchants/saved-actions.ts:7` + `invite-actions.ts:7` (`/merchants/dashboard/creators`). Also `MerchantApplyView.tsx:157`: `p('/merchants')` → `p('/merchants/dashboard')`.
Then: `grep -rn "merchants/post\|merchants/missions\|merchants/creators\|merchants/insights" apps/web/app apps/web/components apps/web/lib --include="*.ts*" | grep -v dashboard | grep -v "\.test\."` — every remaining hit must be a comment or a deliberate stub file.

- [ ] **Step 6:** Check existing tests for old-path assertions: `grep -rln "merchants/post\|merchants/missions\|merchants/creators\|merchants/insights" apps/web/tests | grep -v dashboard-redirects` — update any hits to the dashboard paths (they are asserting the very links just swapped; the assertion targets change, nothing else).

- [ ] **Step 7:** Run: `cd apps/web && npx vitest run tests/merchants.dashboard-redirects.test.tsx tests/kinnso.route-parity.test.tsx` — route-parity FAILS if any swapped href lacks a backing route (dashboard home doesn't exist yet — if that's the failure, note it; Task 5 creates it; re-run after Task 5). All other listed tests PASS. Also `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): merchant app moves to /merchants/dashboard/* with 308 stubs

File moves (internals unchanged) + permanentRedirect stubs at the old
URLs + gate.ts/ROBOTS_DISALLOW updates + full internal link sweep."
```

---

### Task 5: Dashboard home

**Files:**
- Create: `apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx`
- Create: `apps/web/app/[locale]/merchants/dashboard/page.tsx`
- Test: extend `apps/web/tests/merchants.dashboard.host.test.tsx` (created here)

- [ ] **Step 1: Failing host test**

```typescript
// apps/web/tests/merchants.dashboard.host.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { authMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolveViewerRoleMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: authMock } }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))

import MerchantDashboardHomePage from '@/app/[locale]/merchants/dashboard/page'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MerchantDashboardHomePage', () => {
  it('redirects anon to sign-in', async () => {
    authMock.mockResolvedValue({ data: { user: null } })
    await expect(MerchantDashboardHomePage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('redirect:/en/sign-in')
  })

  it('notFound for non-merchant viewers', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('creator')
    await expect(MerchantDashboardHomePage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('notFound')
  })

  it('renders all six cards with dashboard-prefixed links for merchants', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('merchant')
    const el = await MerchantDashboardHomePage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    for (const [label, href] of [
      [en.merchantDashboard.cardPostTitle, '/en/merchants/dashboard/post'],
      [en.merchantDashboard.cardMissionsTitle, '/en/merchants/dashboard/missions'],
      [en.merchantDashboard.cardCreatorsTitle, '/en/merchants/dashboard/creators'],
      [en.merchantDashboard.cardInsightsTitle, '/en/merchants/dashboard/insights'],
      [en.merchantDashboard.cardExperiencesTitle, '/en/merchants/dashboard/experiences'],
      [en.merchantDashboard.cardProfileTitle, '/en/merchants/dashboard/profile'],
    ] as const) {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
      expect(link.getAttribute('href')).toBe(href)
    }
  })
})
```

Run — FAIL (module not found).

- [ ] **Step 2: View + page**

```tsx
// apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx
import Link from 'next/link'
import { FileText, LineChart, MapPin, Store, Users, Briefcase } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function MerchantDashboardHomeView({ locale, t }: { locale: Locale; t: Messages['merchantDashboard'] }) {
  const p = (path: string) => `/${locale}${path}`
  const cards = [
    { title: t.cardPostTitle, body: t.cardPostBody, href: p('/merchants/dashboard/post'), icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardMissionsTitle, body: t.cardMissionsBody, href: p('/merchants/dashboard/missions'), icon: <Briefcase aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardCreatorsTitle, body: t.cardCreatorsBody, href: p('/merchants/dashboard/creators'), icon: <Users aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardInsightsTitle, body: t.cardInsightsBody, href: p('/merchants/dashboard/insights'), icon: <LineChart aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardExperiencesTitle, body: t.cardExperiencesBody, href: p('/merchants/dashboard/experiences'), icon: <MapPin aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardProfileTitle, body: t.cardProfileBody, href: p('/merchants/dashboard/profile'), icon: <Store aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-5xl">{t.title}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
      </SectionShell>
      <SectionShell className="k2-hairline">
        <div className="grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
              <EditorialCard title={c.title}>
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{c.icon}</span>
                {c.body}
                <span className="mt-3 block text-sm font-semibold text-kinnso-orangeDark">{t.open} →</span>
              </EditorialCard>
            </Link>
          ))}
        </div>
      </SectionShell>
    </main>
  )
}

export default MerchantDashboardHomeView
```

```tsx
// apps/web/app/[locale]/merchants/dashboard/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantDashboardHomeView } from '@/components/kinnso/pages/MerchantDashboardHomeView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantDashboardHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const messages = await getDictionary(loc)
  return <MerchantDashboardHomeView locale={loc} t={messages.merchantDashboard} />
}
```

- [ ] **Step 3:** Run the host test — PASS (3). Re-run `tests/kinnso.route-parity.test.tsx` — now PASS (Navbar/Footer dashboard hrefs have backing routes).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx "apps/web/app/[locale]/merchants/dashboard/page.tsx" apps/web/tests/merchants.dashboard.host.test.tsx
git commit -m "feat(web): merchant dashboard home — six-card hub at /merchants/dashboard"
```

---

### Task 6: Profile editor (lib + page)

**Files:**
- Create: `apps/web/lib/merchants/profile-validation.ts`, `profile-queries.ts`, `profile-actions.ts`
- Create: `apps/web/components/kinnso/pages/MerchantProfileView.tsx`
- Create: `apps/web/app/[locale]/merchants/dashboard/profile/page.tsx`
- Test: `apps/web/tests/merchants.profile-actions.test.ts`

- [ ] **Step 1: Failing actions test**

```typescript
// apps/web/tests/merchants.profile-actions.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { requireMerchantActionMock, updateMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ update: updateMock }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateMerchantProfileAction } from '@/lib/merchants/profile-actions'

const validInput = {
  companyName: 'Acme Travel',
  contactName: 'Jane',
  contactEmail: 'jane@acme.example',
  websiteUrl: 'https://acme.example',
  tagline: 'Boutique tours in Hong Kong',
  city: 'Hong Kong',
  logoUrl: '',
}

beforeEach(() => {
  requireMerchantActionMock.mockReset()
  updateMock.mockReset()
})

describe('updateMerchantProfileAction', () => {
  it('rejects non-merchant callers before writing', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await updateMerchantProfileAction('en', validInput)
    expect(res.ok).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns field errors for invalid input without writing', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const res = await updateMerchantProfileAction('en', { ...validInput, companyName: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.companyName).toBeTruthy()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('updates only the granted columns, scoped to the caller profile id', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const eqSpy = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'm1' }, error: null }) }) }))
    updateMock.mockReturnValue({ eq: eqSpy })
    const res = await updateMerchantProfileAction('en', validInput)
    expect(res.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith({
      company_name: 'Acme Travel',
      contact_name: 'Jane',
      contact_email: 'jane@acme.example',
      website_url: 'https://acme.example',
      tagline: 'Boutique tours in Hong Kong',
      city: 'Hong Kong',
      logo_url: null,
    })
    expect(eqSpy).toHaveBeenCalledWith('id', 'm1')
  })
})
```

Run — FAIL (module not found).

- [ ] **Step 2: validation + queries + actions**

```typescript
// apps/web/lib/merchants/profile-validation.ts
export type ValidationErrors = Record<string, string[]>

export type MerchantProfileInput = {
  companyName: string
  contactName: string
  contactEmail: string
  websiteUrl: string
  tagline: string
  city: string
  logoUrl: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Field-level validation for the merchant public-profile editor. `{}` = valid. */
export function validateMerchantProfileInput(input: MerchantProfileInput): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!input.companyName.trim()) errors.companyName = ['required']
  else if (input.companyName.trim().length > 120) errors.companyName = ['too_long']
  const email = input.contactEmail.trim()
  if (!email) errors.contactEmail = ['required']
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.contactEmail = ['invalid']
  if (input.websiteUrl.trim() && !isHttpUrl(input.websiteUrl)) errors.websiteUrl = ['invalid_url']
  if (input.logoUrl.trim() && !isHttpUrl(input.logoUrl)) errors.logoUrl = ['invalid_url']
  if (input.tagline.trim().length > 160) errors.tagline = ['too_long']
  if (input.city.trim().length > 80) errors.city = ['too_long']
  return errors
}
```

```typescript
// apps/web/lib/merchants/profile-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type MyMerchantProfile = {
  id: string
  slug: string | null
  companyName: string
  contactName: string | null
  contactEmail: string
  websiteUrl: string | null
  tagline: string | null
  city: string | null
  logoUrl: string | null
}

/** Owner-RLS read of the caller's own profile. Errors propagate. */
export async function getMyMerchantProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MyMerchantProfile | null> {
  const { data, error } = await supabase
    .from('merchant_profiles')
    .select('id, slug, company_name, contact_name, contact_email, website_url, tagline, city, logo_url')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string | null,
    companyName: data.company_name as string,
    contactName: data.contact_name as string | null,
    contactEmail: data.contact_email as string,
    websiteUrl: data.website_url as string | null,
    tagline: data.tagline as string | null,
    city: data.city as string | null,
    logoUrl: data.logo_url as string | null,
  }
}
```

```typescript
// apps/web/lib/merchants/profile-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { validateMerchantProfileInput, type MerchantProfileInput, type ValidationErrors } from '@/lib/merchants/profile-validation'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })

/**
 * Owner-RLS update. The DB's column grants (R2A + R2B migrations) are the real
 * enforcement — this payload simply never mentions status/tier/slug, and a
 * hand-crafted call that did would be rejected by Postgres, not by this code.
 */
export async function updateMerchantProfileAction(
  locale: Locale,
  input: MerchantProfileInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const errors = validateMerchantProfileInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data, error } = await supabase
    .from('merchant_profiles')
    .update({
      company_name: input.companyName.trim(),
      contact_name: input.contactName.trim() || null,
      contact_email: input.contactEmail.trim(),
      website_url: input.websiteUrl.trim() || null,
      tagline: input.tagline.trim() || null,
      city: input.city.trim() || null,
      logo_url: input.logoUrl.trim() || null,
    })
    .eq('id', gate.merchantId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[merchants:profile] update failed', error)
    return formError('Profile could not be saved. Please try again.')
  }

  revalidatePath(`/${locale}/merchants/dashboard/profile`)
  return { ok: true, id: data.id as string }
}
```

Run the actions test — PASS (3).

- [ ] **Step 3: View + page**

```tsx
// apps/web/components/kinnso/pages/MerchantProfileView.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { updateMerchantProfileAction } from '@/lib/merchants/profile-actions'
import type { MyMerchantProfile } from '@/lib/merchants/profile-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

const err = (t: T, code?: string) =>
  code === 'required' ? t.errRequired
  : code === 'too_long' ? t.errTooLong
  : code === 'invalid_url' ? t.errInvalidUrl
  : code ? t.errorGeneric : ''

export function MerchantProfileView({ locale, t, profile }: { locale: Locale; t: T; profile: MyMerchantProfile }) {
  const [form, setForm] = useState({
    companyName: profile.companyName,
    contactName: profile.contactName ?? '',
    contactEmail: profile.contactEmail,
    websiteUrl: profile.websiteUrl ?? '',
    tagline: profile.tagline ?? '',
    city: profile.city ?? '',
    logoUrl: profile.logoUrl ?? '',
  })
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const field = (key: keyof typeof form, label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-kinnso-ink">{label}</span>
      <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
      {errors[key] ? <span className="text-sm text-red-600">{err(t, errors[key][0])}</span> : null}
    </label>
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setSaved(false)
    setErrors({})
    try {
      const res = await updateMerchantProfileAction(locale, form)
      if (res.ok) setSaved(true)
      else setErrors(res.errors)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.profileTitle}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.profileSubtitle}</p>
        {profile.slug ? (
          <p className="mt-4 text-sm text-kinnso-muted">
            {t.slugLabel}: <span className="font-mono text-kinnso-ink">/m/{profile.slug}</span> — {t.slugNote}
          </p>
        ) : null}
        <form onSubmit={onSubmit} className="mt-8 flex max-w-lg flex-col gap-4">
          {field('companyName', t.fieldCompanyName)}
          {field('tagline', t.fieldTagline)}
          {field('city', t.fieldCity)}
          {field('logoUrl', t.fieldLogoUrl)}
          {field('websiteUrl', t.fieldWebsite)}
          {field('contactName', t.fieldContactName)}
          {field('contactEmail', t.fieldContactEmail)}
          {errors.form ? <p role="alert" className="text-sm text-red-600">{t.errorGeneric}</p> : null}
          <div className="flex items-center gap-4">
            <button type="submit" disabled={pending} className="k2-btn-primary disabled:opacity-60">{t.saveCta}</button>
            <p aria-live="polite" className="text-sm text-kinnso-green">{saved ? t.savedNote : ''}</p>
          </div>
        </form>
        <Link href={`/${locale}/merchants/dashboard`} className="mt-8 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">← {t.title}</Link>
      </SectionShell>
    </main>
  )
}

export default MerchantProfileView
```

```tsx
// apps/web/app/[locale]/merchants/dashboard/profile/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMyMerchantProfile } from '@/lib/merchants/profile-queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantProfileView } from '@/components/kinnso/pages/MerchantProfileView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const profile = await getMyMerchantProfile(supabase, user.id)
  if (!profile) notFound()
  const messages = await getDictionary(loc)
  return <MerchantProfileView locale={loc} t={messages.merchantDashboard} profile={profile} />
}
```

- [ ] **Step 4:** `cd apps/web && npx vitest run tests/merchants.profile-actions.test.ts` — PASS; `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/merchants/profile-validation.ts apps/web/lib/merchants/profile-queries.ts apps/web/lib/merchants/profile-actions.ts apps/web/components/kinnso/pages/MerchantProfileView.tsx "apps/web/app/[locale]/merchants/dashboard/profile/page.tsx" apps/web/tests/merchants.profile-actions.test.ts
git commit -m "feat(web): merchant public-profile editor at /merchants/dashboard/profile"
```

---

### Task 7: Experiences lib (types, validation, queries, actions)

**Files:**
- Create: `apps/web/lib/experiences/types.ts`, `validation.ts`, `queries.ts`, `actions.ts`
- Test: `apps/web/tests/experiences.validation.test.ts`, `apps/web/tests/experiences.actions.test.ts`

- [ ] **Step 1: types + failing validation test**

```typescript
// apps/web/lib/experiences/types.ts
export const EXPERIENCE_CURRENCIES = ['HKD', 'USD', 'SGD', 'JPY', 'KRW', 'THB', 'TWD', 'CNY'] as const
export type ExperienceCurrency = (typeof EXPERIENCE_CURRENCIES)[number]

export type ExperienceInput = {
  title: string
  summary: string
  description: string
  city: string
  priceAmount: string // form-string; validated/parsed to number in validation
  currency: string
  durationMinutes: string // form-string; '' = not set
  coverUrl: string
}
```

```typescript
// apps/web/tests/experiences.validation.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateExperienceInput } from '@/lib/experiences/validation'

const valid = {
  title: 'Sunset junk boat tour',
  summary: 'Two hours on Victoria Harbour.',
  description: 'Full description here.',
  city: 'Hong Kong',
  priceAmount: '480',
  currency: 'HKD',
  durationMinutes: '120',
  coverUrl: 'https://example.com/cover.jpg',
}

describe('validateExperienceInput', () => {
  it('accepts a valid input and returns parsed numbers', () => {
    const res = validateExperienceInput(valid)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.parsed.priceAmount).toBe(480)
      expect(res.parsed.durationMinutes).toBe(120)
    }
  })

  it('requires title, city, and price', () => {
    const res = validateExperienceInput({ ...valid, title: ' ', city: '', priceAmount: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors.title).toBeTruthy()
      expect(res.errors.city).toBeTruthy()
      expect(res.errors.priceAmount).toBeTruthy()
    }
  })

  it('rejects negative prices, unknown currencies, and non-integer durations', () => {
    const res = validateExperienceInput({ ...valid, priceAmount: '-5', currency: 'EUR', durationMinutes: '1.5' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors.priceAmount).toBeTruthy()
      expect(res.errors.currency).toBeTruthy()
      expect(res.errors.durationMinutes).toBeTruthy()
    }
  })

  it('allows empty duration and cover, but rejects a non-http cover', () => {
    const ok = validateExperienceInput({ ...valid, durationMinutes: '', coverUrl: '' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.parsed.durationMinutes).toBeNull()
    const bad = validateExperienceInput({ ...valid, coverUrl: 'javascript:alert(1)' })
    expect(bad.ok).toBe(false)
  })
})
```

Run — FAIL (module not found).

- [ ] **Step 2: validation**

```typescript
// apps/web/lib/experiences/validation.ts
import { EXPERIENCE_CURRENCIES, type ExperienceInput } from '@/lib/experiences/types'

export type ValidationErrors = Record<string, string[]>
export type ParsedExperience = {
  title: string
  summary: string | null
  description: string | null
  city: string
  priceAmount: number
  currency: string
  durationMinutes: number | null
  coverUrl: string | null
}
export type ExperienceValidation =
  | { ok: true; parsed: ParsedExperience }
  | { ok: false; errors: ValidationErrors }

const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateExperienceInput(input: ExperienceInput): ExperienceValidation {
  const errors: ValidationErrors = {}

  const title = input.title.trim()
  if (!title) errors.title = ['required']
  else if (title.length > 120) errors.title = ['too_long']

  const summary = input.summary.trim()
  if (summary.length > 400) errors.summary = ['too_long']

  const city = input.city.trim()
  if (!city) errors.city = ['required']
  else if (city.length > 80) errors.city = ['too_long']

  const priceRaw = input.priceAmount.trim()
  const price = Number(priceRaw)
  if (!priceRaw || !Number.isFinite(price)) errors.priceAmount = ['invalid_number']
  else if (price < 0) errors.priceAmount = ['invalid_number']

  if (!(EXPERIENCE_CURRENCIES as readonly string[]).includes(input.currency)) errors.currency = ['invalid']

  const durationRaw = input.durationMinutes.trim()
  let duration: number | null = null
  if (durationRaw) {
    const d = Number(durationRaw)
    if (!Number.isInteger(d) || d <= 0) errors.durationMinutes = ['invalid_number']
    else duration = d
  }

  const cover = input.coverUrl.trim()
  if (cover && !isHttpUrl(cover)) errors.coverUrl = ['invalid_url']

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    parsed: {
      title,
      summary: summary || null,
      description: input.description.trim() || null,
      city,
      priceAmount: Math.round(price * 100) / 100,
      currency: input.currency,
      durationMinutes: duration,
      coverUrl: cover || null,
    },
  }
}
```

Run the validation test — PASS (4).

- [ ] **Step 3: failing actions test**

```typescript
// apps/web/tests/experiences.actions.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { requireMerchantActionMock, insertMock, updateMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ insert: insertMock, update: updateMock }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createExperienceAction, setExperienceStatusAction } from '@/lib/experiences/actions'

const validInput = {
  title: 'Sunset junk boat tour',
  summary: 'Two hours on Victoria Harbour.',
  description: 'Full description.',
  city: 'Hong Kong',
  priceAmount: '480',
  currency: 'HKD',
  durationMinutes: '120',
  coverUrl: 'https://example.com/cover.jpg',
}

beforeEach(() => {
  requireMerchantActionMock.mockReset()
  insertMock.mockReset()
  updateMock.mockReset()
})

describe('createExperienceAction', () => {
  it('rejects non-merchants before writing', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await createExperienceAction(validInput, { publish: false, locale: 'en' })
    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts a draft scoped to the caller merchant with a slugged title', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'e1', slug: 'sunset-junk-boat-tour-abc123' }, error: null }) }),
    })
    const res = await createExperienceAction(validInput, { publish: false, locale: 'en' })
    expect(res.ok).toBe(true)
    const payload = insertMock.mock.calls[0][0]
    expect(payload.merchant_profile_id).toBe('m1')
    expect(payload.status).toBe('draft')
    expect(payload.published_at).toBeNull()
    expect(payload.price_amount).toBe(480)
    expect(payload.slug).toMatch(/^sunset-junk-boat-tour-/)
  })

  it('publish=true sets status and published_at', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'e1', slug: 's' }, error: null }) }),
    })
    await createExperienceAction(validInput, { publish: true, locale: 'en' })
    const payload = insertMock.mock.calls[0][0]
    expect(payload.status).toBe('published')
    expect(typeof payload.published_at).toBe('string')
  })
})

describe('setExperienceStatusAction', () => {
  it('publishes with a published_at stamp, scoped by id AND merchant id', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const eq2 = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'e1' }, error: null }) }) }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    updateMock.mockReturnValue({ eq: eq1 })
    const res = await setExperienceStatusAction('e1', 'published', { locale: 'en' })
    expect(res.ok).toBe(true)
    expect(updateMock.mock.calls[0][0].status).toBe('published')
    expect(eq1).toHaveBeenCalledWith('id', 'e1')
    expect(eq2).toHaveBeenCalledWith('merchant_profile_id', 'm1')
  })

  it('rejects an invalid target status', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const res = await setExperienceStatusAction('e1', 'archived' as never, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
```

Run — FAIL (module not found).

- [ ] **Step 4: queries + actions**

```typescript
// apps/web/lib/experiences/queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type MyExperience = {
  id: string
  slug: string
  title: string
  city: string
  priceAmount: number
  currency: string
  status: 'draft' | 'published' | 'paused'
  updatedAt: string
}

/** Owner-RLS list of the caller merchant's experiences, newest first. Errors propagate. */
export async function listMyExperiences(
  supabase: SupabaseClient<Database>,
  merchantId: string,
): Promise<MyExperience[]> {
  const { data, error } = await supabase
    .from('experiences')
    .select('id, slug, title, city, price_amount, currency, status, updated_at')
    .eq('merchant_profile_id', merchantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    city: r.city as string,
    priceAmount: Number(r.price_amount),
    currency: r.currency as string,
    status: r.status as MyExperience['status'],
    updatedAt: r.updated_at as string,
  }))
}

export type MyExperienceDetail = MyExperience & {
  summary: string | null
  description: string | null
  durationMinutes: number | null
  coverUrl: string | null
}

/** One owned experience for the edit form. Null when missing/not owned (RLS). */
export async function getMyExperience(
  supabase: SupabaseClient<Database>,
  merchantId: string,
  id: string,
): Promise<MyExperienceDetail | null> {
  const { data, error } = await supabase
    .from('experiences')
    .select('id, slug, title, summary, description, city, price_amount, currency, duration_minutes, cover_url, status, updated_at')
    .eq('merchant_profile_id', merchantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string,
    title: data.title as string,
    summary: data.summary as string | null,
    description: data.description as string | null,
    city: data.city as string,
    priceAmount: Number(data.price_amount),
    currency: data.currency as string,
    durationMinutes: data.duration_minutes as number | null,
    coverUrl: data.cover_url as string | null,
    status: data.status as MyExperience['status'],
    updatedAt: data.updated_at as string,
  }
}
```

```typescript
// apps/web/lib/experiences/actions.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { makeSlug } from '@/lib/guides/slug'
import { validateExperienceInput, type ValidationErrors } from '@/lib/experiences/validation'
import type { ExperienceInput } from '@/lib/experiences/types'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
const listPath = (locale: Locale) => `/${locale}/merchants/dashboard/experiences`

export async function createExperienceAction(
  rawInput: ExperienceInput,
  options: { publish: boolean; locale: Locale },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const validation = validateExperienceInput(rawInput)
  if (!validation.ok) return validation
  const p = validation.parsed

  const { data, error } = await supabase
    .from('experiences')
    .insert({
      merchant_profile_id: gate.merchantId,
      slug: makeSlug(p.title, randomUUID().slice(0, 6)),
      title: p.title,
      summary: p.summary,
      description: p.description,
      city: p.city,
      price_amount: p.priceAmount,
      currency: p.currency,
      duration_minutes: p.durationMinutes,
      cover_url: p.coverUrl,
      status: options.publish ? 'published' : 'draft',
      published_at: options.publish ? new Date().toISOString() : null,
    })
    .select('id, slug')
    .single()
  if (error || !data) {
    if (error) console.error('[experiences] create failed', error)
    return formError('Experience could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

export async function updateExperienceAction(
  id: string,
  rawInput: ExperienceInput,
  options: { publish: boolean; locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const validation = validateExperienceInput(rawInput)
  if (!validation.ok) return validation
  const p = validation.parsed

  // Read current status (RLS + merchant scope) to decide the published_at transition.
  const { data: current } = await supabase
    .from('experiences')
    .select('status, published_at')
    .eq('id', id)
    .eq('merchant_profile_id', gate.merchantId)
    .maybeSingle()
  if (!current) return formError('Experience not found')

  const willPublish = options.publish || current.status === 'published'
  const { data, error } = await supabase
    .from('experiences')
    .update({
      title: p.title,
      summary: p.summary,
      description: p.description,
      city: p.city,
      price_amount: p.priceAmount,
      currency: p.currency,
      duration_minutes: p.durationMinutes,
      cover_url: p.coverUrl,
      status: willPublish ? 'published' : current.status,
      published_at: willPublish ? (current.published_at ?? new Date().toISOString()) : current.published_at,
    })
    .eq('id', id)
    .eq('merchant_profile_id', gate.merchantId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[experiences] update failed', error)
    return formError('Experience could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string }
}

export async function setExperienceStatusAction(
  id: string,
  status: 'published' | 'paused',
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; status: 'published' | 'paused' }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate
  if (status !== 'published' && status !== 'paused') return formError('Invalid status')

  const patch = status === 'published'
    ? { status, published_at: new Date().toISOString() }
    : { status }

  const { data, error } = await supabase
    .from('experiences')
    .update(patch)
    .eq('id', id)
    .eq('merchant_profile_id', gate.merchantId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[experiences] setStatus failed', error)
    return formError('Status could not be changed')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id, status }
}
```

Run the actions test — PASS (5). `npx tsc --noEmit` — clean.

Note: `setExperienceStatusAction`'s publish path re-stamps `published_at` (a re-publish after pause counts as a fresh publish date — acceptable for R2; R2C/R3 can revisit if "originally published" matters).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/experiences apps/web/tests/experiences.validation.test.ts apps/web/tests/experiences.actions.test.ts
git commit -m "feat(web): experiences domain lib — validation, owner queries, CRUD actions"
```

---

### Task 8: Experiences UI (list + form + routes)

**Files:**
- Create: `apps/web/components/kinnso/pages/MerchantExperiencesView.tsx`, `apps/web/components/kinnso/pages/ExperienceForm.tsx`
- Create: `apps/web/app/[locale]/merchants/dashboard/experiences/page.tsx`, `experiences/new/page.tsx`, `experiences/[experienceId]/edit/page.tsx`
- Test: extend `apps/web/tests/merchants.dashboard.host.test.tsx`

- [ ] **Step 1: Add failing host tests** (append to `tests/merchants.dashboard.host.test.tsx`; the existing `vi.mock` for supabase/server must be extended so `from()` works — replace the file's supabase mock with:

```typescript
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: authMock },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'm1' }, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}))
```

and add a mock for the experiences queries + this describe block):

```typescript
vi.mock('@/lib/experiences/queries', () => ({
  listMyExperiences: vi.fn(async () => ([{
    id: 'e1', slug: 'sunset-tour-abc123', title: 'Sunset tour', city: 'Hong Kong',
    priceAmount: 480, currency: 'HKD', status: 'draft', updatedAt: '2026-07-04T00:00:00Z',
  }])),
  getMyExperience: vi.fn(),
}))

import MerchantExperiencesPage from '@/app/[locale]/merchants/dashboard/experiences/page'

describe('MerchantExperiencesPage', () => {
  it('lists the merchant experiences with an edit link and publish action', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('merchant')
    const el = await MerchantExperiencesPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText('Sunset tour')).toBeTruthy()
    const edit = screen.getByRole('link', { name: /edit/i })
    expect(edit.getAttribute('href')).toBe('/en/merchants/dashboard/experiences/e1/edit')
    expect(screen.getByRole('button', { name: /publish/i })).toBeTruthy()
  })
})
```

Run — FAIL (page module not found).

- [ ] **Step 2: List view + page**

```tsx
// apps/web/components/kinnso/pages/MerchantExperiencesView.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { setExperienceStatusAction } from '@/lib/experiences/actions'
import type { MyExperience } from '@/lib/experiences/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

export function MerchantExperiencesView({ locale, t, experiences }: {
  locale: Locale; t: T; experiences: MyExperience[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const p = (path: string) => `/${locale}${path}`

  const statusLabel = (s: MyExperience['status']) =>
    s === 'draft' ? t.statusDraft : s === 'published' ? t.statusPublished : t.statusPaused

  async function setStatus(id: string, status: 'published' | 'paused') {
    setBusyId(id)
    setRowError((m) => ({ ...m, [id]: '' }))
    try {
      const res = await setExperienceStatusAction(id, status, { locale })
      if (res.ok) router.refresh()
      else setRowError((m) => ({ ...m, [id]: res.errors.form?.[0] ?? t.errorGeneric }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.expTitle}</h1>
            <p className="mt-3 max-w-xl leading-relaxed text-kinnso-ink/70">{t.expSubtitle}</p>
          </div>
          <Link href={p('/merchants/dashboard/experiences/new')} className="k2-btn-primary">{t.expNew}</Link>
        </div>
      </SectionShell>
      <SectionShell className="k2-hairline">
        {experiences.length === 0 ? (
          <p className="text-kinnso-muted">{t.expEmpty}</p>
        ) : (
          <div className="grid gap-3">
            {experiences.map((exp) => (
              <div key={exp.id} className="k2-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-kinnso-ink">{exp.title}</p>
                  <p className="mt-1 text-sm text-kinnso-muted">
                    {exp.city} · {exp.currency} {exp.priceAmount.toLocaleString()} · {statusLabel(exp.status)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link href={p(`/merchants/dashboard/experiences/${exp.id}/edit`)}
                    className="text-sm font-semibold text-kinnso-orangeDark hover:underline">{t.actEdit}</Link>
                  {exp.status !== 'published' ? (
                    <button onClick={() => setStatus(exp.id, 'published')} disabled={busyId === exp.id}
                      className="k2-btn-ghost text-sm disabled:opacity-50">{t.actPublish}</button>
                  ) : (
                    <button onClick={() => setStatus(exp.id, 'paused')} disabled={busyId === exp.id}
                      className="k2-btn-ghost text-sm disabled:opacity-50">{t.actPause}</button>
                  )}
                </div>
                {rowError[exp.id] ? <p className="w-full text-sm text-red-600">{rowError[exp.id]}</p> : null}
              </div>
            ))}
          </div>
        )}
      </SectionShell>
    </main>
  )
}

export default MerchantExperiencesView
```

```tsx
// apps/web/app/[locale]/merchants/dashboard/experiences/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { listMyExperiences } from '@/lib/experiences/queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantExperiencesView } from '@/components/kinnso/pages/MerchantExperiencesView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantExperiencesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const { data: profile } = await supabase
    .from('merchant_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!profile) notFound()
  const experiences = await listMyExperiences(supabase, profile.id as string)
  const messages = await getDictionary(loc)
  return <MerchantExperiencesView locale={loc} t={messages.merchantDashboard} experiences={experiences} />
}
```

- [ ] **Step 3: Form + new/edit pages**

```tsx
// apps/web/components/kinnso/pages/ExperienceForm.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { createExperienceAction, updateExperienceAction } from '@/lib/experiences/actions'
import { EXPERIENCE_CURRENCIES, type ExperienceInput } from '@/lib/experiences/types'
import type { MyExperienceDetail } from '@/lib/experiences/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

const err = (t: T, code?: string) =>
  code === 'required' ? t.errRequired
  : code === 'too_long' ? t.errTooLong
  : code === 'invalid_url' ? t.errInvalidUrl
  : code === 'invalid_number' || code === 'invalid' ? t.errInvalidNumber
  : code ? t.errorGeneric : ''

export function ExperienceForm({ locale, t, existing }: {
  locale: Locale; t: T; existing: MyExperienceDetail | null
}) {
  const router = useRouter()
  const [form, setForm] = useState<ExperienceInput>({
    title: existing?.title ?? '',
    summary: existing?.summary ?? '',
    description: existing?.description ?? '',
    city: existing?.city ?? '',
    priceAmount: existing ? String(existing.priceAmount) : '',
    currency: existing?.currency ?? 'HKD',
    durationMinutes: existing?.durationMinutes ? String(existing.durationMinutes) : '',
    coverUrl: existing?.coverUrl ?? '',
  })
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const listHref = `/${locale}/merchants/dashboard/experiences`

  const set = (key: keyof ExperienceInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(publish: boolean) {
    setPending(true)
    setErrors({})
    try {
      const res = existing
        ? await updateExperienceAction(existing.id, form, { publish, locale })
        : await createExperienceAction(form, { publish, locale })
      if (res.ok) router.push(listHref)
      else setErrors(res.errors)
    } finally {
      setPending(false)
    }
  }

  const fieldClass = 'min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm'
  const fieldError = (key: string) =>
    errors[key] ? <span className="text-sm text-red-600">{err(t, errors[key][0])}</span> : null

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.expTitle}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">
          {existing ? t.formTitleEdit : t.formTitleNew}
        </h1>
        <form onSubmit={(e) => { e.preventDefault(); void submit(false) }} className="mt-8 flex max-w-lg flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldTitle}</span>
            <input required value={form.title} onChange={set('title')} className={fieldClass} />
            {fieldError('title')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldSummary}</span>
            <input value={form.summary} onChange={set('summary')} className={fieldClass} />
            {fieldError('summary')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldDescription}</span>
            <textarea value={form.description} onChange={set('description')} rows={5}
              className="rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldExpCity}</span>
            <input required value={form.city} onChange={set('city')} className={fieldClass} />
            {fieldError('city')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-kinnso-ink">{t.fieldPrice}</span>
              <input required inputMode="decimal" value={form.priceAmount} onChange={set('priceAmount')} className={fieldClass} />
              {fieldError('priceAmount')}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-kinnso-ink">{t.fieldCurrency}</span>
              <select value={form.currency} onChange={set('currency')} className={fieldClass}>
                {EXPERIENCE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {fieldError('currency')}
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldDuration}</span>
            <input inputMode="numeric" value={form.durationMinutes} onChange={set('durationMinutes')} className={fieldClass} />
            {fieldError('durationMinutes')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldCoverUrl}</span>
            <input value={form.coverUrl} onChange={set('coverUrl')} className={fieldClass} />
            {fieldError('coverUrl')}
          </label>
          {errors.form ? <p role="alert" className="text-sm text-red-600">{t.errorGeneric}</p> : null}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={pending} className="k2-btn-ghost disabled:opacity-50">{t.saveDraftCta}</button>
            <button type="button" disabled={pending} onClick={() => void submit(true)} className="k2-btn-primary disabled:opacity-60">{t.publishCta}</button>
          </div>
        </form>
        <Link href={listHref} className="mt-8 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">← {t.backToList}</Link>
      </SectionShell>
    </main>
  )
}

export default ExperienceForm
```

```tsx
// apps/web/app/[locale]/merchants/dashboard/experiences/new/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { noindexMetadata } from '@/lib/seo/metadata'
import { ExperienceForm } from '@/components/kinnso/pages/ExperienceForm'

export const metadata: Metadata = noindexMetadata()

export default async function NewExperiencePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()
  const messages = await getDictionary(loc)
  return <ExperienceForm locale={loc} t={messages.merchantDashboard} existing={null} />
}
```

```tsx
// apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/edit/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMyExperience } from '@/lib/experiences/queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { ExperienceForm } from '@/components/kinnso/pages/ExperienceForm'

export const metadata: Metadata = noindexMetadata()

export default async function EditExperiencePage({ params }: {
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
  const existing = await getMyExperience(supabase, profile.id as string, experienceId)
  if (!existing) notFound()
  const messages = await getDictionary(loc)
  return <ExperienceForm locale={loc} t={messages.merchantDashboard} existing={existing} />
}
```

- [ ] **Step 4:** Run `cd apps/web && npx vitest run tests/merchants.dashboard.host.test.tsx tests/kinnso.route-parity.test.tsx` — PASS. `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/MerchantExperiencesView.tsx apps/web/components/kinnso/pages/ExperienceForm.tsx "apps/web/app/[locale]/merchants/dashboard/experiences" apps/web/tests/merchants.dashboard.host.test.tsx
git commit -m "feat(web): experiences CRUD — list, create/edit form, publish/pause"
```

---

### Task 9: RLS-test list + e2e redirects

**Files:**
- Modify: `apps/web/tests/mission.rls.test.ts` (table list only)
- Modify: `apps/e2e/specs/redirects.spec.ts`

- [ ] **Step 1:** In `tests/mission.rls.test.ts`, the anon-read-denial loop asserts anon sees zero rows or permission-denied. `experiences` legitimately allows anon reads of published rows — do NOT add it to `missionTableNames`. Nothing to change there; instead note (comment in the e2e file, next step) that experiences anon-read behavior gets its live coverage when R2C's public pages ship. No file change in this step after analysis — the table list stays as-is.

- [ ] **Step 2:** Append to `apps/e2e/specs/redirects.spec.ts`:

```typescript
// R2B: the merchant app moved under /merchants/dashboard/* — old URLs are in-repo
// permanentRedirect (308) stubs, not seo_redirects rows.
const MERCHANT_MOVES = [
  ['/en/merchants/post', '/en/merchants/dashboard/post'],
  ['/en/merchants/missions', '/en/merchants/dashboard/missions'],
  ['/en/merchants/creators', '/en/merchants/dashboard/creators'],
  ['/en/merchants/insights', '/en/merchants/dashboard/insights'],
  ['/zh-hk/merchants/post', '/zh-hk/merchants/dashboard/post'],
] as const

for (const [from, to] of MERCHANT_MOVES) {
  test(`legacy merchant route ${from} 308s to ${to}`, async ({ request, baseURL }) => {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(new URL(res.headers()['location'], baseURL).pathname).toBe(to)
  })
}
```

(Note: the proxy's auth gate matches `merchants/dashboard` — the 308 fires from the stub
page BEFORE any dashboard gating, because the stub route itself is no longer in
`gatedPrefixes`. An anon request therefore gets the 308 first and the sign-in redirect
only after following it — which is what these assertions rely on.)

- [ ] **Step 3: Commit**

```bash
git add apps/e2e/specs/redirects.spec.ts
git commit -m "test(e2e): assert 308s for the moved merchant routes"
```

---

### Task 10: Full-phase verification

- [ ] **Step 1:** Scoped sweep:

```bash
cd apps/web && npx vitest run \
  tests/merchants.dashboard-redirects.test.tsx \
  tests/merchants.dashboard.host.test.tsx \
  tests/merchants.profile-actions.test.ts \
  tests/experiences.validation.test.ts \
  tests/experiences.actions.test.ts \
  tests/merchants.apply.host.test.tsx \
  tests/for-merchants.host.test.tsx \
  tests/i18n.locale-parity.test.ts \
  tests/kinnso.route-parity.test.tsx
```

All PASS. Then `npx tsc --noEmit` and `npx eslint <all files this phase touched>` — clean (pre-existing accepted warnings excepted).

- [ ] **Step 2:** Live spot check (MCP `execute_sql`): the Task 1 Step 3 query again, plus `select count(*) from public.experiences;` (expect 0) and `select slug, company_name from public.merchant_public_profiles order by created_at;` (expect only active merchants, no contact columns available).

- [ ] **Step 3:** Grep safety net: `grep -rn "merchants/post\|merchants/missions\|merchants/creators\|merchants/insights" apps/web/app apps/web/components apps/web/lib --include="*.ts*" | grep -v dashboard | grep -v "\.test\."` — only stub files and comments remain.

- [ ] **Step 4:** Update the product-revision-program memory (outside the repo): branch tip, migration applied, deviations, next step = push + PR, then R2C.

- [ ] **Step 5:** If verification required fixes, commit them (`fix(web): R2B verification pass`); otherwise no commit.

---

## Deferred out of R2B (recorded, not forgotten)

- **No experience delete** — spec scope is list/create/edit/publish/pause; drafts can idle. Revisit with real merchant feedback.
- **Slug rename/redirects** (profiles AND experiences) — slugs immutable this phase.
- **Media uploads** — cover/logo are validated URLs only (spec D-R2-4).
- **Hub page `/merchants`** still renders the old hub (cards now dashboard-pointing) — it becomes the public directory in R2C, which also cleans up the `merchantsLanding` i18n group.
- **`published_at` re-stamps on re-publish** after pause (noted in Task 7) — revisit if R3 needs "first published".
- Everything in R2C's scope: public `/merchants` directory, `/m/[slug]`, `/experiences/[slug]`, SEO/OG/sitemap, th.ts `seo.merchants` fix.
