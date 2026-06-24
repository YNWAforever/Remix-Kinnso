# Phase 3 — Real Creator Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 100%-mock creator directory and public profiles with real, honest surfaces driven by a public-readable projection of real creator data.

**Architecture:** A DB migration enriches `creators` with `handle`/`bio`/`public_profile` and a `SECURITY DEFINER` trigger denormalizes a curated public projection from `creator_dna.final` on publish (no follower counts). A new `lib/creators/queries.ts` reads it via the anon client. `CreatorProfileView` is rebuilt real-only, `/creators` becomes directory-first, and `/g/[slug]` is de-mocked.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind, 7-locale i18n.

**Branch:** `feat/phase3-creator-directory` (off `main` `1a3ae74`). Spec: `docs/superpowers/specs/2026-06-24-phase3-real-creator-directory-design.md`.

**Decisions locked:** public profile = qualitative DNA + platform/verified badges (no raw counts); `/creators` = directory-first with compact apply CTA; branch off merged main.

**Commands (run from `apps/web`):** `pnpm exec vitest run tests/<file> --no-file-parallelism` (single/few files; run `pkill -f vitest` first if the box is loaded), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`. Migration applied live via the Supabase MCP (`apply_migration` / `execute_sql`) to project `scryfkefedzuetfdtrvl`.

---

## File map

- **Create** `supabase/migrations/20260624000001_creator_public_profile.sql` — columns, `slugify`, projection helper, sync trigger, public-read RLS, anon grant, backfill.
- **Modify** `packages/db/types.ts` — add `handle`/`bio`/`public_profile` to `creators` Row/Insert/Update.
- **Create** `apps/web/lib/creators/queries.ts` — `getPublicCreators`, `getCreatorByHandle`, `PublicCreator`/`CreatorSummary`/`PublicProfile` types.
- **Create** `apps/web/tests/creators.queries.test.ts`.
- **Modify** `apps/web/lib/i18n/messages/en.ts` + the 6 other locale files — add directory + profile keys (interface in en.ts + values ×7).
- **Rewrite** `apps/web/components/kinnso/pages/CreatorProfileView.tsx` — real-only server component.
- **Rewrite** `apps/web/tests/kinnso.CreatorProfileView.test.tsx`.
- **Modify** `apps/web/app/[locale]/c/[handle]/page.tsx` — wire real query.
- **Rewrite** `apps/web/tests/c.handle.host.test.tsx`.
- **Rewrite** `apps/web/components/kinnso/pages/CreatorsLandingView.tsx` — directory-first.
- **Modify** `apps/web/app/[locale]/creators/page.tsx` — fetch + pass `creators`.
- **Rewrite** `apps/web/tests/kinnso.CreatorsLandingView.test.tsx`; **Create** `apps/web/tests/creators.index.host.test.tsx`.
- **Modify** `apps/web/tests/kinnso.route-parity.test.tsx` — new props for the two rebuilt views.
- **Modify** `apps/web/lib/guides/actions.ts` — read `creators.handle` (fallback `slugify`).
- **Modify** `apps/web/app/[locale]/g/[slug]/page.tsx` — drop mock branches; author always links to `/c/[handle]`.
- **Modify** `apps/web/tests/g.slug.host.test.tsx` — assert author link to `/c/[handle]`.

---

## Task 1: Migration — public projection, trigger, RLS, backfill

**Files:** Create `supabase/migrations/20260624000001_creator_public_profile.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 3: real creator directory.
-- Enrich `creators` with a PUBLIC, denormalized projection so anon can read a
-- curated profile (handle/bio/qualitative DNA + platform presence) WITHOUT ever
-- exposing the private creator_dna blob (follower counts, avg engagement).
-- A SECURITY DEFINER trigger on creator_dna keeps the projection in sync on
-- publish; handles are minted once and stable. Mirrors guides public-read +
-- grant conventions (20260619000001).

-- 1. Columns
alter table public.creators add column if not exists handle text unique;
alter table public.creators add column if not exists bio text;
alter table public.creators add column if not exists public_profile jsonb;

-- 2. slugify helper: lowercase, non-alphanumeric -> '-', collapse/trim dashes.
create or replace function public.slugify(input text)
returns text language sql immutable as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'creator'
  );
$$;

-- 3. Curated public projection from a DNA `final` blob (DRY: trigger + backfill).
create or replace function public.creator_public_profile_json(p_final jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'niches',           coalesce(p_final->'niches', '[]'::jsonb),
    'content_pillars',  coalesce(p_final->'content_pillars', '[]'::jsonb),
    'tone',             coalesce(p_final->'tone', '[]'::jsonb),
    'audience_geos',    coalesce(p_final->'audience'->'top_geos', '[]'::jsonb),
    'audience_locales', coalesce(p_final->'audience'->'top_locales', '[]'::jsonb),
    'languages',        coalesce(p_final->'languages', '[]'::jsonb),
    'platforms',        coalesce(
      (select jsonb_agg(jsonb_build_object(
                'platform', p->>'platform',
                'verified', coalesce((p->>'verified')::boolean, false)))
       from jsonb_array_elements(coalesce(p_final->'platforms', '[]'::jsonb)) as p),
      '[]'::jsonb)
  );
$$;

-- 4. Sync handle + projection on DNA publish.
create or replace function public.sync_creator_public_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_base text;
  v_handle text;
  v_existing text;
  v_n int := 1;
begin
  if new.status <> 'published' or new.final is null then
    return new;
  end if;

  select display_name, handle into v_name, v_existing
  from public.creators where id = new.creator_id;

  if v_existing is null then
    v_base := public.slugify(v_name);
    v_handle := v_base;
    while exists (select 1 from public.creators where handle = v_handle and id <> new.creator_id) loop
      v_n := v_n + 1;
      v_handle := v_base || '-' || v_n;
    end loop;
  else
    v_handle := v_existing;
  end if;

  update public.creators
  set handle = v_handle,
      bio = new.final->>'bio',
      public_profile = public.creator_public_profile_json(new.final)
  where id = new.creator_id;

  return new;
end;
$$;

create trigger creator_dna_sync_public_profile
  after insert or update on public.creator_dna
  for each row execute procedure public.sync_creator_public_profile();

-- 5. Public read of discoverable creators (anon + all roles).
create policy "creators_public_read" on public.creators
  for select using (
    status = 'active' and handle is not null and public_profile is not null
  );

-- 6. Grant anon SELECT (RLS gates rows; every column here is public-safe —
--    no follower data lives on this table). Mirrors guides grant style.
grant select on public.creators to anon;

-- 7. Backfill existing active creators that already published DNA. Loop so
--    handle de-dup is correct even with duplicate display names.
do $$
declare
  r record;
  v_base text;
  v_handle text;
  v_n int;
begin
  for r in
    select c.id, c.display_name, d.final
    from public.creators c
    join public.creator_dna d on d.creator_id = c.id
    where c.status = 'active' and d.status = 'published'
      and d.final is not null and c.handle is null
  loop
    v_base := public.slugify(r.display_name);
    v_handle := v_base; v_n := 1;
    while exists (select 1 from public.creators where handle = v_handle) loop
      v_n := v_n + 1; v_handle := v_base || '-' || v_n;
    end loop;
    update public.creators
    set handle = v_handle,
        bio = r.final->>'bio',
        public_profile = public.creator_public_profile_json(r.final)
    where id = r.id;
  end loop;
end $$;
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/20260624000001_creator_public_profile.sql
git commit -m "feat(db): creators public projection + handle trigger + public-read RLS"
```

- [ ] **Step 3: Apply live + verify via the Supabase MCP** (project `scryfkefedzuetfdtrvl`)

1. `apply_migration` with name `creator_public_profile` and the SQL above.
2. `execute_sql`: `select column_name from information_schema.columns where table_name='creators' order by 1;` → expect `bio, created_at, display_name, handle, id, public_profile, status, updated_at`.
3. `execute_sql`: `select polname, polcmd from pg_policy where polrelid='public.creators'::regclass;` → expect `creators_public_read`, `creators_owner_select`, `creators_owner_update`.
4. `execute_sql` (seed a verification creator, capturing the generated handle):
```sql
with u as (insert into auth.users (id, email) values (gen_random_uuid(), 'p3seed@example.com') returning id),
ins_c as (insert into public.creators (id, display_name, status) select id, 'Phase Three Seed', 'onboarding' from u returning id),
ins_d as (insert into public.creator_dna (creator_id, ai_draft, final, source, status)
  select id, '{}'::jsonb,
  '{"bio":"Seed bio","niches":["Coffee","City Walk"],"content_pillars":["Cafes"],"tone":["calm"],"audience":{"top_geos":["HK","TW"],"top_locales":["zh-HK"]},"platforms":[{"platform":"instagram","followers":1234,"verified":false}],"languages":["en","zh-HK"]}'::jsonb,
  '{}'::jsonb, 'published' from ins_c returning creator_id)
update public.creators set status='active' where id in (select creator_id from ins_d)
returning id, handle, bio, public_profile;
```
Expect: `handle='phase-three-seed'`, `bio='Seed bio'`, `public_profile` containing `niches`/`platforms:[{platform:'instagram',verified:false}]` and **no `followers`/`avg_engagement`**.
5. Record the seed creator id — it is removed after the live smoke test in Task 10.

Expected: all assertions hold. If the trigger didn't fire (handle null), check that the seed updates `creator_dna` last — but here the seed inserts DNA as `published` directly (AFTER INSERT fires the trigger), so handle is minted on insert.

---

## Task 2: Extend the generated DB types

**Files:** Modify `packages/db/types.ts` (the `creators` table block — Row/Insert/Update)

- [ ] **Step 1: Add the three columns to `creators` Row**

Find the `creators:` block and update Row to include (alphabetical, matching generator style):

```ts
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          public_profile: Json | null
          status: string
          updated_at: string
        }
```

- [ ] **Step 2: Add to Insert and Update**

```ts
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id: string
          public_profile?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          public_profile?: Json | null
          status?: string
          updated_at?: string
        }
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` (from `apps/web`) — Expected: PASS (no new errors).
```bash
git add packages/db/types.ts
git commit -m "feat(db): type creators public projection columns"
```

---

## Task 3: Read layer — `lib/creators/queries.ts`

**Files:** Create `apps/web/lib/creators/queries.ts`; Test `apps/web/tests/creators.queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  creators: [] as unknown[],
  guides: [] as unknown[],
  single: null as unknown,
}))

vi.mock('@/lib/supabase/public', () => {
  const make = (resolveData: () => unknown, single?: () => unknown) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      order: () => Promise.resolve({ data: resolveData() }),
      maybeSingle: async () => ({ data: single ? single() : null }),
      then: (onF: (v: { data: unknown }) => unknown) =>
        Promise.resolve({ data: resolveData() }).then(onF),
    }
    return builder
  }
  return {
    createSupabasePublicClient: () => ({
      from: (table: string) =>
        table === 'creators'
          ? make(() => state.creators, () => state.single)
          : make(() => state.guides),
    }),
  }
})

import { getPublicCreators, getCreatorByHandle } from '@/lib/creators/queries'

const creatorRow = {
  id: 'c1',
  handle: 'maya',
  display_name: 'Maya Wanders',
  bio: 'Slow travel in Asia.',
  public_profile: {
    niches: ['Coffee', 'City Walk'],
    content_pillars: ['Cafes'],
    tone: ['calm'],
    audience_geos: ['HK', 'TW'],
    audience_locales: ['zh-HK'],
    languages: ['en', 'zh-HK'],
    platforms: [{ platform: 'instagram', verified: false }],
  },
}

beforeEach(() => {
  state.creators = []
  state.guides = []
  state.single = null
})

describe('getPublicCreators', () => {
  it('maps creators and tallies published guides by creator_id', async () => {
    state.creators = [creatorRow]
    state.guides = [{ creator_id: 'c1' }, { creator_id: 'c1' }, { creator_id: 'cX' }]
    const result = await getPublicCreators()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      handle: 'maya',
      name: 'Maya Wanders',
      bio: 'Slow travel in Asia.',
      niches: ['Coffee', 'City Walk'],
      guideCount: 2,
    })
  })

  it('returns an empty array when no creators are published', async () => {
    state.creators = []
    expect(await getPublicCreators()).toEqual([])
  })
})

describe('getCreatorByHandle', () => {
  it('returns a PublicCreator with projection + published guides', async () => {
    state.single = creatorRow
    state.guides = [
      { slug: 'osaka', title: 'Osaka', cover_url: 'x', city: 'Osaka', saves_count: 3, creator_handle: 'maya' },
    ]
    const creator = await getCreatorByHandle('maya')
    expect(creator?.handle).toBe('maya')
    expect(creator?.profile.platforms[0]).toEqual({ platform: 'instagram', verified: false })
    expect(creator?.guides).toHaveLength(1)
    expect(creator?.guides[0].slug).toBe('osaka')
  })

  it('returns null for an unknown handle', async () => {
    state.single = null
    expect(await getCreatorByHandle('nobody')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/creators.queries.test.ts --no-file-parallelism`
Expected: FAIL — cannot import `@/lib/creators/queries` (module not found).

- [ ] **Step 3: Write the implementation**

```ts
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { mapRowToGuide } from '@/lib/guides/queries'
import type { Guide } from '@/lib/creator-mock'

export interface PublicProfile {
  niches: string[]
  content_pillars: string[]
  tone: string[]
  audience_geos: string[]
  audience_locales: string[]
  languages: string[]
  platforms: { platform: string; verified: boolean }[]
}

export interface CreatorSummary {
  handle: string
  name: string
  bio: string
  niches: string[]
  guideCount: number
}

export interface PublicCreator {
  handle: string
  name: string
  bio: string
  profile: PublicProfile
  guides: Guide[]
}

function toProfile(json: unknown): PublicProfile {
  const j = (json ?? {}) as Partial<PublicProfile>
  return {
    niches: j.niches ?? [],
    content_pillars: j.content_pillars ?? [],
    tone: j.tone ?? [],
    audience_geos: j.audience_geos ?? [],
    audience_locales: j.audience_locales ?? [],
    languages: j.languages ?? [],
    platforms: j.platforms ?? [],
  }
}

export async function getPublicCreators(): Promise<CreatorSummary[]> {
  const supabase = createSupabasePublicClient()
  const { data: rows } = await supabase
    .from('creators')
    .select('id, handle, display_name, bio, public_profile')
    .eq('status', 'active')
    .not('handle', 'is', null)
    .not('public_profile', 'is', null)
    .order('created_at', { ascending: false })
  const creators = rows ?? []
  if (creators.length === 0) return []

  const { data: guideRows } = await supabase
    .from('guides')
    .select('creator_id')
    .eq('status', 'published')
  const counts = new Map<string, number>()
  for (const g of guideRows ?? []) {
    counts.set(g.creator_id, (counts.get(g.creator_id) ?? 0) + 1)
  }

  return creators.map((c) => ({
    handle: c.handle as string,
    name: c.display_name ?? (c.handle as string),
    bio: c.bio ?? '',
    niches: toProfile(c.public_profile).niches,
    guideCount: counts.get(c.id) ?? 0,
  }))
}

export async function getCreatorByHandle(handle: string): Promise<PublicCreator | null> {
  const supabase = createSupabasePublicClient()
  const { data: c } = await supabase
    .from('creators')
    .select('id, handle, display_name, bio, public_profile')
    .eq('handle', handle)
    .eq('status', 'active')
    .maybeSingle()
  if (!c) return null

  const { data: guideRows } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('creator_id', c.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  return {
    handle: c.handle as string,
    name: c.display_name ?? (c.handle as string),
    bio: c.bio ?? '',
    profile: toProfile(c.public_profile),
    guides: (guideRows ?? []).map(mapRowToGuide),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/creators.queries.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/creators/queries.ts apps/web/tests/creators.queries.test.ts
git commit -m "feat(web): real creator read layer (getPublicCreators, getCreatorByHandle)"
```

---

## Task 4: i18n — add directory + profile keys (interface + 7 locales)

**Files:** Modify `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts`

Only **add** keys (no removals — old keys stay harmless; removal risks other consumers). The parity test enforces all 7 + interface match.

- [ ] **Step 1: Add to the `Messages` interface (en.ts only)**

In `en.ts`, inside `creatorsLanding: { ... }` (interface, ~line 475) add:
```ts
    directoryHeading: string; directorySub: string; directoryEmpty: string
    viewProfile: string; guideCount: string
```
Inside `creatorProfile: { ... }` (interface, ~line 184) add:
```ts
    nichesHeading: string
    pillarsHeading: string
    toneHeading: string
    audienceRegionsLabel: string
    audienceLocalesLabel: string
    languagesHeading: string
    platformsHeading: string
    verifiedLabel: string
    guidesHeading: string
    guidesEmpty: string
```

- [ ] **Step 2: Add the values to every locale**

For EACH file, add to the `creatorsLanding` **values** object:

| key | en | ja | ko | th | zh-cn | zh-hk | zh-tw |
|---|---|---|---|---|---|---|---|
| directoryHeading | Browse creators | クリエイターを探す | 크리에이터 둘러보기 | ค้นหาครีเอเตอร์ | 浏览创作者 | 瀏覽創作者 | 瀏覽創作者 |
| directorySub | Real KINNSO creators and the city guides they've published. | KINNSOの実在クリエイターと、彼らが公開した街ガイド。 | KINNSO의 실제 크리에이터와 그들이 발행한 도시 가이드. | ครีเอเตอร์ตัวจริงของ KINNSO และไกด์เมืองที่พวกเขาเผยแพร่ | 真实的 KINNSO 创作者及其发布的城市指南。 | 真實的 KINNSO 創作者及其發佈的城市指南。 | 真實的 KINNSO 創作者及其發佈的城市指南。 |
| directoryEmpty | No creators have published a profile yet. Check back soon. | まだプロフィールを公開したクリエイターはいません。またご確認ください。 | 아직 프로필을 공개한 크리에이터가 없습니다. 곧 다시 확인해 주세요. | ยังไม่มีครีเอเตอร์เผยแพร่โปรไฟล์ โปรดกลับมาตรวจสอบอีกครั้ง | 还没有创作者发布个人主页，请稍后再来。 | 暫時未有創作者發佈個人檔案，請稍後再查看。 | 尚未有創作者發佈個人檔案，請稍後再查看。 |
| viewProfile | View profile | プロフィールを見る | 프로필 보기 | ดูโปรไฟล์ | 查看主页 | 查看檔案 | 查看檔案 |
| guideCount | {count} Guides | {count}件のガイド | 가이드 {count}개 | {count} ไกด์ | {count} 篇指南 | {count} 篇指南 | {count} 篇指南 |

For EACH file, add to the `creatorProfile` **values** object:

| key | en | ja | ko | th | zh-cn | zh-hk | zh-tw |
|---|---|---|---|---|---|---|---|
| nichesHeading | Niches | ニッチ | 분야 | หมวดถนัด | 细分领域 | 專長領域 | 專長領域 |
| pillarsHeading | Content pillars | コンテンツの柱 | 콘텐츠 기둥 | เสาหลักคอนเทนต์ | 内容支柱 | 內容支柱 | 內容支柱 |
| toneHeading | Tone | トーン | 톤 | โทน | 风格基调 | 語調風格 | 語調風格 |
| audienceRegionsLabel | Top regions | 主な地域 | 주요 지역 | ภูมิภาคหลัก | 主要地区 | 主要地區 | 主要地區 |
| audienceLocalesLabel | Audience locales | オーディエンスの言語圏 | 오디언스 로케일 | ภาษาผู้ชม | 受众语言区 | 受眾語言區 | 受眾語言區 |
| languagesHeading | Languages | 言語 | 언어 | ภาษา | 语言 | 語言 | 語言 |
| platformsHeading | Platforms | プラットフォーム | 플랫폼 | แพลตฟอร์ม | 平台 | 平台 | 平台 |
| verifiedLabel | Verified | 認証済み | 인증됨 | ยืนยันแล้ว | 已认证 | 已認證 | 已認證 |
| guidesHeading | Published guides | 公開済みガイド | 발행한 가이드 | ไกด์ที่เผยแพร่ | 已发布指南 | 已發佈指南 | 已發佈指南 |
| guidesEmpty | No published guides yet. | まだ公開されたガイドはありません。 | 아직 발행한 가이드가 없습니다. | ยังไม่มีไกด์ที่เผยแพร่ | 还没有已发布的指南。 | 暫未有已發佈的指南。 | 尚未有已發佈的指南。 |

- [ ] **Step 3: Run the parity test to verify it passes**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism`
Expected: PASS (all 7 locales + interface have identical key paths).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "feat(i18n): add creator directory + real-profile keys (7 locales)"
```

---

## Task 5: Rebuild `CreatorProfileView` + wire `/c/[handle]`

**Files:** Rewrite `apps/web/components/kinnso/pages/CreatorProfileView.tsx`; Test `apps/web/tests/kinnso.CreatorProfileView.test.tsx`; Modify `apps/web/app/[locale]/c/[handle]/page.tsx`; Rewrite `apps/web/tests/c.handle.host.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import { en } from '@/lib/i18n/messages/en'
import type { PublicCreator } from '@/lib/creators/queries'

const creator: PublicCreator = {
  handle: 'maya',
  name: 'Maya Wanders',
  bio: 'Slow travel in Asia.',
  profile: {
    niches: ['Coffee', 'City Walk'],
    content_pillars: ['Cafes'],
    tone: ['calm'],
    audience_geos: ['HK', 'TW'],
    audience_locales: ['zh-HK'],
    languages: ['en', 'zh-HK'],
    platforms: [{ platform: 'instagram', verified: false }],
  },
  guides: [
    { slug: 'osaka', title: 'Osaka in a day', cover: 'x', city: 'Osaka', saves: 12, creatorHandle: 'maya' },
  ],
}

const render0 = () =>
  render(<CreatorProfileView creator={creator} locale="en" t={en.creatorProfile} />)

describe('CreatorProfileView', () => {
  it('renders identity + qualitative DNA, no fabricated metrics', () => {
    render0()
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Wanders' })).toBeInTheDocument()
    expect(screen.getByText('@maya')).toBeInTheDocument()
    expect(screen.getByText('Slow travel in Asia.')).toBeInTheDocument()
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('instagram')).toBeInTheDocument()
    // No fabricated metric labels anywhere.
    expect(screen.queryByText('/100')).not.toBeInTheDocument()
    expect(screen.queryByText(en.creatorProfile.guidesHeading)).toBeInTheDocument()
  })

  it('links published guides under the active locale', () => {
    render0()
    const link = screen.getByRole('link', { name: /Osaka in a day/i })
    expect(link.getAttribute('href')).toBe('/en/g/osaka')
  })

  it('shows the empty note when the creator has no guides', () => {
    render(<CreatorProfileView creator={{ ...creator, guides: [] }} locale="en" t={en.creatorProfile} />)
    expect(screen.getByText(en.creatorProfile.guidesEmpty)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/kinnso.CreatorProfileView.test.tsx --no-file-parallelism`
Expected: FAIL (old component has different props/imports; new symbols missing).

- [ ] **Step 3: Rewrite the component**

```tsx
import GuideCard from '@/components/kinnso/GuideCard'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { initialsFrom } from '@/lib/studio/identity'
import type { PublicCreator } from '@/lib/creators/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

interface Props {
  creator: PublicCreator
  locale: Locale
  embedded?: boolean
  t: Messages['creatorProfile']
}

function hueFromHandle(handle: string): number {
  let h = 0
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 360
  return h
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((x) => (
        <span key={x} className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-xs text-kinnso-ink">{x}</span>
      ))}
    </div>
  )
}

export function CreatorProfileView({ creator, locale, embedded, t }: Props) {
  const wrap = embedded ? '' : 'k-container py-8 md:py-12'
  const p = (path: string) => `/${locale}${path}`
  const hue = hueFromHandle(creator.handle)
  const pr = creator.profile
  return (
    <article className={wrap}>
      <header className="overflow-hidden rounded-xl">
        <div
          aria-hidden="true"
          className="h-40 w-full sm:h-56"
          style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
        />
        <TicketCard className="rounded-t-none p-6 sm:p-8">
          <span className="-mt-16 grid h-20 w-20 place-items-center rounded-full bg-kinnso-ink text-2xl font-black text-white ring-4 ring-kinnso-cream">
            {initialsFrom(creator.name)}
          </span>
          <h1 className="mt-3 text-3xl font-black text-kinnso-ink md:text-4xl">{creator.name}</h1>
          <p className="k-mono mt-1 text-sm text-kinnso-muted">@{creator.handle}</p>
          {creator.bio && <p className="mt-3 max-w-xl text-sm text-kinnso-ink/80">{creator.bio}</p>}
        </TicketCard>
      </header>

      {pr.niches.length > 0 && (
        <section className="mt-6"><h2 className="text-sm font-bold text-kinnso-ink">{t.nichesHeading}</h2><div className="mt-2"><Chips items={pr.niches} /></div></section>
      )}
      {pr.content_pillars.length > 0 && (
        <section className="mt-5"><h2 className="text-sm font-bold text-kinnso-ink">{t.pillarsHeading}</h2><div className="mt-2"><Chips items={pr.content_pillars} /></div></section>
      )}
      {pr.tone.length > 0 && (
        <section className="mt-5"><h2 className="text-sm font-bold text-kinnso-ink">{t.toneHeading}</h2><div className="mt-2"><Chips items={pr.tone} /></div></section>
      )}

      {(pr.audience_geos.length > 0 || pr.audience_locales.length > 0 || pr.languages.length > 0) && (
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {pr.audience_geos.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.audienceRegionsLabel}</h2><div className="mt-2"><Chips items={pr.audience_geos} /></div></div>)}
          {pr.audience_locales.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.audienceLocalesLabel}</h2><div className="mt-2"><Chips items={pr.audience_locales} /></div></div>)}
          {pr.languages.length > 0 && (<div><h2 className="text-sm font-bold text-kinnso-ink">{t.languagesHeading}</h2><div className="mt-2"><Chips items={pr.languages} /></div></div>)}
        </section>
      )}

      {pr.platforms.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-kinnso-ink">{t.platformsHeading}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {pr.platforms.map((pl) => (
              <span key={pl.platform} className="inline-flex items-center gap-1 rounded-md bg-kinnso-cream2 px-2 py-0.5 text-xs capitalize text-kinnso-ink">
                {pl.platform}
                {pl.verified && <span className="text-kinnso-orange">✓ {t.verifiedLabel}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold text-kinnso-ink">{t.guidesHeading}</h2>
        {creator.guides.length > 0 ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {creator.guides.slice(0, 9).map((g) => <GuideCard key={g.slug} g={g} locale={locale} />)}
          </div>
        ) : (
          <p className="mt-3 text-sm text-kinnso-muted">{t.guidesEmpty}</p>
        )}
      </section>
    </article>
  )
}

export { CreatorProfileView as default }
```

- [ ] **Step 4: Run the component test (PASS)**

Run: `pnpm exec vitest run tests/kinnso.CreatorProfileView.test.tsx --no-file-parallelism` — Expected: PASS (3 tests).

- [ ] **Step 5: Rewrite the `/c/[handle]` page**

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import { getCreatorByHandle } from '@/lib/creators/queries'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const creator = await getCreatorByHandle(handle)
  if (!creator) return { title: 'Creator not found · KINNSO' }
  return {
    title: `${creator.name} (@${creator.handle}) · KINNSO`,
    description: creator.bio || `Travel creator @${creator.handle} on KINNSO.`,
  }
}

/**
 * /[locale]/c/[handle] — real public creator profile (no gate).
 * Reads the public projection on `creators` via the anon client (public-read
 * RLS scopes to active + published). Renders qualitative DNA + platform
 * presence + published guides only — no private DNA, no fabricated metrics.
 */
export default async function CreatorPublicPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}) {
  const { locale, handle } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const creator = await getCreatorByHandle(handle)
  if (!creator) notFound()
  return <CreatorProfileView creator={creator} locale={locale as Locale} t={messages.creatorProfile} />
}
```

- [ ] **Step 6: Rewrite the host test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicCreator } from '@/lib/creators/queries'

const creator: PublicCreator = {
  handle: 'maya',
  name: 'Maya Wanders',
  bio: 'Slow travel.',
  profile: { niches: ['Coffee'], content_pillars: [], tone: [], audience_geos: [], audience_locales: [], languages: [], platforms: [] },
  guides: [],
}

vi.mock('@/lib/creators/queries', () => ({
  getCreatorByHandle: vi.fn(async (h: string) => (h === 'maya' ? creator : null)),
}))

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({ notFound: () => { throw notFoundError } }))

import CreatorPublicPage from '@/app/[locale]/c/[handle]/page'

describe('/[locale]/c/[handle] host', () => {
  it('renders the real profile for a known handle', async () => {
    const ui = await CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'maya' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Wanders' })).toBeInTheDocument()
    expect(screen.getByText('@maya')).toBeInTheDocument()
  })

  it('calls notFound for an unknown handle', async () => {
    await expect(
      CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'ghost' }) }),
    ).rejects.toBe(notFoundError)
  })
})
```

- [ ] **Step 7: Run both host + component tests (PASS)**

Run: `pnpm exec vitest run tests/kinnso.CreatorProfileView.test.tsx tests/c.handle.host.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorProfileView.tsx apps/web/app/[locale]/c/[handle]/page.tsx apps/web/tests/kinnso.CreatorProfileView.test.tsx apps/web/tests/c.handle.host.test.tsx
git commit -m "feat(web): real-only creator profile + wire /c/[handle] to real data"
```

---

## Task 6: Directory-first `/creators`

**Files:** Rewrite `apps/web/components/kinnso/pages/CreatorsLandingView.tsx`; Modify `apps/web/app/[locale]/creators/page.tsx`; Rewrite `apps/web/tests/kinnso.CreatorsLandingView.test.tsx`; Create `apps/web/tests/creators.index.host.test.tsx`

- [ ] **Step 1: Write the failing view test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreatorsLandingView } from '@/components/kinnso/pages/CreatorsLandingView'
import { en } from '@/lib/i18n/messages/en'
import type { CreatorSummary } from '@/lib/creators/queries'

const creators: CreatorSummary[] = [
  { handle: 'maya', name: 'Maya Wanders', bio: 'Slow travel.', niches: ['Coffee'], guideCount: 3 },
]

describe('CreatorsLandingView (directory-first)', () => {
  it('renders a card per real creator linking to the profile', () => {
    render(<CreatorsLandingView locale="en" t={en.creatorsLanding} creators={creators} />)
    expect(screen.getByText('Maya Wanders')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: new RegExp(en.creatorsLanding.viewProfile, 'i') })
    expect(link.getAttribute('href')).toBe('/en/c/maya')
    expect(screen.getByText('3 Guides')).toBeInTheDocument()
  })

  it('shows the honest empty state when there are no creators', () => {
    render(<CreatorsLandingView locale="en" t={en.creatorsLanding} creators={[]} />)
    expect(screen.getByText(en.creatorsLanding.directoryEmpty)).toBeInTheDocument()
  })

  it('keeps an apply CTA to sign-up', () => {
    render(<CreatorsLandingView locale="en" t={en.creatorsLanding} creators={creators} />)
    const applyLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/en/sign-up')
    expect(applyLinks.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/kinnso.CreatorsLandingView.test.tsx --no-file-parallelism` — Expected: FAIL (no `creators` prop / new keys).

- [ ] **Step 3: Rewrite the view**

```tsx
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { RouteStamp, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import { initialsFrom } from '@/lib/studio/identity'
import type { CreatorSummary } from '@/lib/creators/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function CreatorsLandingView({
  locale,
  t,
  creators,
}: {
  locale: Locale
  t: Messages['creatorsLanding']
  creators: CreatorSummary[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main>
      {/* Compact hero + apply CTA */}
      <section className="k-page-band py-12 md:py-16">
        <div className="k-container flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <RouteStamp>{t.heroPill}</RouteStamp>
            <h1 className="k-display mt-3 max-w-2xl">{t.directoryHeading}</h1>
            <p className="mt-3 max-w-xl text-kinnso-muted">{t.directorySub}</p>
          </div>
          <Link href={p('/sign-up')} className="k-btn-primary inline-flex shrink-0">
            {t.applyCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Directory grid */}
      <section className="k-container py-12">
        {creators.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => (
              <li key={c.handle}>
                <TicketCard className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-kinnso-ink text-sm font-black text-white">
                      {initialsFrom(c.name)}
                    </span>
                    <div>
                      <div className="font-bold text-kinnso-ink">{c.name}</div>
                      <div className="k-mono text-xs text-kinnso-muted">@{c.handle}</div>
                    </div>
                  </div>
                  {c.bio && <p className="mt-3 line-clamp-2 text-sm text-kinnso-muted">{c.bio}</p>}
                  {c.niches.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.niches.slice(0, 3).map((n) => (
                        <span key={n} className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-[11px] text-kinnso-ink">{n}</span>
                      ))}
                    </div>
                  )}
                  <TicketDivider className="my-3" />
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-xs text-kinnso-muted">{t.guideCount.replace('{count}', String(c.guideCount))}</span>
                    <Link href={p(`/c/${c.handle}`)} className="k-btn-ghost inline-flex text-sm">
                      {t.viewProfile} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                </TicketCard>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-kinnso-cream2 px-5 py-8 text-center text-kinnso-muted">{t.directoryEmpty}</p>
        )}
      </section>

      {/* Bottom apply CTA */}
      <section className="k-container pb-20">
        <TicketCard className="p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-5 inline-flex">
            {t.ctaButton} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </TicketCard>
      </section>
    </main>
  )
}

export default CreatorsLandingView
```

- [ ] **Step 4: Wire the page**

In `apps/web/app/[locale]/creators/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorsLandingView } from '@/components/kinnso/pages/CreatorsLandingView'
import { getPublicCreators } from '@/lib/creators/queries'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function CreatorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const creators = await getPublicCreators()
  return <CreatorsLandingView locale={locale as Locale} t={messages.creatorsLanding} creators={creators} />
}
```

- [ ] **Step 5: Write the index host test**

`apps/web/tests/creators.index.host.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CreatorSummary } from '@/lib/creators/queries'

const creators: CreatorSummary[] = [
  { handle: 'maya', name: 'Maya Wanders', bio: 'Slow travel.', niches: ['Coffee'], guideCount: 2 },
]

vi.mock('@/lib/creators/queries', () => ({ getPublicCreators: vi.fn(async () => creators) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import CreatorsPage from '@/app/[locale]/creators/page'

describe('/[locale]/creators host', () => {
  it('renders the directory from real creators', async () => {
    const ui = await CreatorsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Maya Wanders')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view profile/i }).getAttribute('href')).toBe('/en/c/maya')
  })
})
```

- [ ] **Step 6: Run the directory tests (PASS)**

Run: `pnpm exec vitest run tests/kinnso.CreatorsLandingView.test.tsx tests/creators.index.host.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorsLandingView.tsx apps/web/app/[locale]/creators/page.tsx apps/web/tests/kinnso.CreatorsLandingView.test.tsx apps/web/tests/creators.index.host.test.tsx
git commit -m "feat(web): directory-first /creators from real data"
```

---

## Task 7: Fix route-parity test props

**Files:** Modify `apps/web/tests/kinnso.route-parity.test.tsx`

- [ ] **Step 1: Update the two rebuilt views' renders**

Find where the test renders `CreatorsLandingView` and `CreatorProfileView`. Update to the new props:
- `CreatorsLandingView`: add `creators={[]}`.
- `CreatorProfileView`: replace the old mock creator with a minimal `PublicCreator` and drop the `role` prop:
```tsx
import type { PublicCreator } from '@/lib/creators/queries'
const sampleCreator: PublicCreator = {
  handle: 'maya', name: 'Maya', bio: '',
  profile: { niches: [], content_pillars: [], tone: [], audience_geos: [], audience_locales: [], languages: [], platforms: [] },
  guides: [],
}
// <CreatorProfileView locale="en" t={en.creatorProfile} creator={sampleCreator} />
```
Remove any now-unused `creator-mock` import in this test if it was only used for these two views.

- [ ] **Step 2: Run + commit**

Run: `pnpm exec vitest run tests/kinnso.route-parity.test.tsx --no-file-parallelism` — Expected: PASS.
```bash
git add apps/web/tests/kinnso.route-parity.test.tsx
git commit -m "test(web): route-parity props for rebuilt creator views"
```

---

## Task 8: Guide handle consistency

**Files:** Modify `apps/web/lib/guides/actions.ts`

- [ ] **Step 1: Read the creator's stored handle**

In `getAuthedCreator` (`:41-46`), select and return `handle`:
```ts
  const { data: creator } = await supabase
    .from('creators')
    .select('display_name, handle')
    .eq('id', user.id)
    .single()
  return { id: user.id, displayName: creator?.display_name ?? null, handle: creator?.handle ?? null }
```

- [ ] **Step 2: Prefer the stored handle in `createGuideAction`**

Replace `:77-78`:
```ts
  const name = creator.displayName?.trim() || 'Creator'
  const handle = creator.handle ?? slugify(name)
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` — Expected: PASS.
```bash
git add apps/web/lib/guides/actions.ts
git commit -m "feat(web): guides use the canonical stored creator handle"
```

---

## Task 9: De-mock `/g/[slug]`

**Files:** Modify `apps/web/app/[locale]/g/[slug]/page.tsx`; Modify `apps/web/tests/g.slug.host.test.tsx`

- [ ] **Step 1: Update the host test (author always links to /c/[handle])**

In `g.slug.host.test.tsx`, find the existing "renders a known guide" test and assert the author link:
```tsx
    const authorLink = screen.getByRole('link', { name: '@teafan' })
    expect(authorLink.getAttribute('href')).toBe('/en/c/teafan')
```
(Adjust the handle string to whatever the test's mocked guide uses.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/g.slug.host.test.tsx --no-file-parallelism`
Expected: FAIL (today the real-guide branch renders a `<span>`, not a link).

- [ ] **Step 3: De-mock the page**

In `apps/web/app/[locale]/g/[slug]/page.tsx`:
1. Replace the import line `import { getCreator, guides } from '@/lib/creator-mock'` — remove it entirely (neither symbol is used after this task).
2. Replace `generateStaticParams` (`:11-15`):
```tsx
export function generateStaticParams() {
  // Guides are DB-only; resolve on demand (dynamicParams defaults to true).
  return []
}
```
3. In `generateMetadata`, replace `:25`:
```tsx
  const authorName = guide.creatorName ?? `@${guide.creatorHandle}`
```
4. In the page body, remove `:44` (`const mockCreator = ...`) and replace `:45`:
```tsx
  const authorName = guide.creatorName ?? guide.creatorHandle
```
5. Replace the author block `:100-111` with an always-link:
```tsx
            <Link
              href={`/${locale}/c/${guide.creatorHandle}`}
              className="k-mono mt-1 inline-flex text-sm text-kinnso-orange hover:text-kinnso-orangeDark"
            >
              @{guide.creatorHandle}
            </Link>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/g.slug.host.test.tsx --no-file-parallelism` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/g/[slug]/page.tsx apps/web/tests/g.slug.host.test.tsx
git commit -m "refactor(web): de-mock /g/[slug]; author links to real /c/[handle]"
```

---

## Task 10: Gate, live smoke test, finish

- [ ] **Step 1: Typecheck + lint + build**

From `apps/web`:
```bash
pnpm exec tsc --noEmit      # Expected: clean (0 errors)
pnpm lint                   # Expected: 0 errors (pre-existing warnings OK)
pnpm build                  # Expected: exit 0
```

- [ ] **Step 2: Run all Phase 3-touched tests sequentially**

```bash
pkill -f vitest 2>/dev/null; sleep 1
pnpm exec vitest run \
  tests/creators.queries.test.ts \
  tests/kinnso.CreatorProfileView.test.tsx \
  tests/c.handle.host.test.tsx \
  tests/kinnso.CreatorsLandingView.test.tsx \
  tests/creators.index.host.test.tsx \
  tests/kinnso.route-parity.test.tsx \
  tests/g.slug.host.test.tsx \
  tests/i18n.locale-parity.test.ts \
  --no-file-parallelism
```
Expected: all PASS.

- [ ] **Step 3: Live anon smoke test** (dev server `kinnso-web`, port 3000)

Start the preview server. Using the seeded creator from Task 1 (`/c/phase-three-seed`):
- `GET /en/creators` → 200; HTML contains `Phase Three Seed` (or the directory empty state if the seed was already removed); apply CTA present.
- `GET /en/c/phase-three-seed` → 200; contains `@phase-three-seed`, niche `Coffee`, platform `instagram`; **does NOT** contain `1234` (the seeded follower count) or any `/100` score.
- `GET /en/g/<a real published guide slug>` (if any) → author renders as a link to `/c/...`.
No console errors. Capture a `/en/creators` screenshot for the report.

- [ ] **Step 4: Remove the verification seed** (keep prod honest)

Via Supabase MCP `execute_sql`:
```sql
delete from auth.users where email = 'p3seed@example.com';  -- cascades to creators + creator_dna
```
Re-check `GET /en/creators` → honest empty state (unless real creators exist). Stop the dev server.

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill: push `feat/phase3-creator-directory`, open a PR (base `main`) summarizing the migration + de-mock, link the spec, note the live verification. Commit message/PR footers per repo convention.

---

## Self-review notes

- **Spec coverage:** A=Task 1–2; B=Task 3; C profile=Task 5, C directory=Task 6; D consistency=Task 8, D cleanup=Task 9, D i18n=Task 4; verification=Task 10. ✔
- **Deviation:** Spec D says "remove obsolete `creatorProfile` metric keys." Removal is deferred (kept as harmless unused keys) to avoid tracing/breaking other consumers (`BrandContactCard`, merchants creator-search) and a 7-file churn for zero functional gain. Parity stays valid. Flag to the user.
- **Type consistency:** `PublicProfile`/`CreatorSummary`/`PublicCreator` defined in Task 3 and reused verbatim in Tasks 5–7. `Guide` reused from `@/lib/creator-mock` via `mapRowToGuide` (same as `guides/queries`).
- **Verified badge:** `DnaSchema` forces `verified: false`, so the verified tick never renders today — platform presence is the real signal (honest, forward-compatible). Documented in spec.
