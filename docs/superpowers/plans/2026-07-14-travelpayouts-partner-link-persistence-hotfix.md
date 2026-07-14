# Travelpayouts Partner-Link Persistence Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a migration-backed, audited Travelpayouts partner-link persistence RPC whose schema, application behavior, and generated types agree.

**Architecture:** A new migration restores the existing RPC signature and reopens the partner-link trigger bypass only after authenticated ownership, mission/program state, deterministic SubID, and Travelpayouts URL checks pass. The web adapter canonicalizes provider URLs with the deterministic SubID before the server action calls the RPC. All database work and type generation run against the local Supabase stack; an authorized operator owns production migration activation.

**Tech Stack:** Next.js 16 server actions, TypeScript, Vitest, Supabase Postgres/RLS, PL/pgSQL, `@supabase/supabase-js`, pnpm 11.

## Global Constraints

- Read `docs/superpowers/specs/2026-07-14-travelpayouts-partner-link-persistence-hotfix-design.md` before implementation.
- Section 7 of `docs/superpowers/specs/2026-07-02-product-revision-program-design.md` is binding: user-facing money/state writes use audited `SECURITY DEFINER` RPCs; do not introduce a service-role write in `createPartnerLinkAction`.
- Production Supabase is read-only for Codex. Never run `db push`, `--linked`, `migration up --linked`, or any command with a production project ID or database URL.
- Create the new migration with the Supabase CLI. Do not hand-create a timestamp and do not edit any shipped migration.
- Do not hand-edit `packages/db/types.ts`; regenerate it mechanically from the migrated local database.
- Do not touch creator copilot, settlement logic, public content URLs, or unrelated mission flows.
- No user-facing copy is added, so locale files must remain unchanged.
- Preserve the existing RPC signature exactly: `create_travelpayouts_partner_link(uuid, uuid, uuid, text, text, text)` returning `table(id uuid, partner_url text)`.
- Use conventional commits and keep each task independently reviewable.
- The known local baseline is 28/28 focused mission-action tests passing and web typecheck passing. The full local suite has two pre-existing failures in `apps/web/tests/creator-rls.test.ts`; no new failures are permitted.
- Supabase CLI 2.106.0 on Windows may misroute `gen types --local` to platform authentication. Record that failure, then use the pinned `supabase-go.exe` sidecar only against the local stack.

---

### Task 1: Restore and audit the partner-link RPC in migration history

**Files:**
- Create via CLI: the exact `supabase/migrations/*_restore_travelpayouts_partner_link_rpc.sql` path printed by the command below
- Create: `apps/web/tests/db.travelpayouts-partner-link-rpc.test.ts`
- Modify: `apps/web/tests/mission.rls.test.ts`
- Regenerate locally: `packages/db/types.ts`

**Interfaces:**
- Consumes: existing tables `mission_participants`, `missions`, `affiliate_network_programs`, and `affiliate_partner_links`; existing trigger function `app_private.prepare_affiliate_partner_link_insert()`.
- Produces: `public.create_travelpayouts_partner_link(p_affiliate_network_program_id uuid, p_mission_id uuid, p_mission_participant_id uuid, p_original_url text, p_partner_url text, p_sub_id text) returns table(id uuid, partner_url text)` executable only by `authenticated`.

- [ ] **Step 1: Generate the migration path with the local CLI**

Run from the repository root:

```powershell
pnpm exec supabase migration new restore_travelpayouts_partner_link_rpc
```

Expected: the CLI prints one new empty file ending in `_restore_travelpayouts_partner_link_rpc.sql`. Record that exact path in `.superpowers/sdd/task-1-report.md` and use it for the migration implementation. Do not rename it.

- [ ] **Step 2: Write the failing SQL contract test**

Create `apps/web/tests/db.travelpayouts-partner-link-rpc.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_restore_travelpayouts_partner_link_rpc.sql'))

expect(matches).toHaveLength(1)

const sql = readFileSync(join(migrationsDir, matches[0]), 'utf8')
const compact = sql.toLowerCase().replaceAll(/\s+/g, ' ')

describe('Travelpayouts partner-link persistence migration', () => {
  it('restores the trigger guard without weakening ordinary authenticated inserts', () => {
    expect(compact).toContain(
      'create or replace function app_private.prepare_affiliate_partner_link_insert()',
    )
    expect(compact).toContain(
      "current_setting('app.bypass_partner_link_prepare', true) = 'on'",
    )
    expect(compact).toContain("new.external_status := 'pending'")
    expect(compact).toContain("new.sub_id := 'pending:' || gen_random_uuid()::text")
  })

  it('creates the exact audited RPC signature', () => {
    expect(compact).toContain(
      'create or replace function public.create_travelpayouts_partner_link( p_affiliate_network_program_id uuid, p_mission_id uuid, p_mission_participant_id uuid, p_original_url text, p_partner_url text, p_sub_id text )',
    )
    expect(compact).toContain('returns table(id uuid, partner_url text)')
    expect(compact).toContain('security definer')
    expect(compact).toContain('set search_path = public')
  })

  it('derives and verifies the authenticated creator SubID', () => {
    expect(compact).toContain('v_actor_id uuid := auth.uid()')
    expect(compact).toContain("'kinnso_m_' || replace(p_mission_id::text, '-', '')")
    expect(compact).toContain("'_p_' || replace(p_mission_participant_id::text, '-', '')")
    expect(compact).toContain("'_c_' || replace(v_actor_id::text, '-', '')")
    expect(compact).toContain('if btrim(p_sub_id) <> v_expected_sub_id then')
  })

  it('accepts only HTTPS Travelpayouts links carrying the exact SubID', () => {
    expect(compact).toContain("v_original_url !~* '^https://[^[:space:]]+$'")
    expect(compact).toContain(
      "v_partner_url !~* '^https://([a-z0-9-]+\\.)?tp\\.st/[^[:space:]]*$'",
    )
    expect(compact).toContain(
      "v_partner_url !~ ('[?&]sub_id=' || v_expected_sub_id || '(&|#|$)')",
    )
  })

  it('revalidates ownership and active Travelpayouts mission state', () => {
    expect(compact).toContain('participant.creator_id = v_actor_id')
    expect(compact).toContain("participant.status = 'active'")
    expect(compact).toContain("mission.status = 'published'")
    expect(compact).toContain("mission.mission_source = 'travelpayouts'")
    expect(compact).toContain("program.network = 'travelpayouts'")
    expect(compact).toContain("program.status = 'active'")
  })

  it('opens the bypass only after validation and persists idempotently', () => {
    const validationIndex = compact.indexOf("raise exception 'partner link is not allowed'")
    const bypassIndex = compact.indexOf(
      "set_config('app.bypass_partner_link_prepare', 'on', true)",
    )
    expect(validationIndex).toBeGreaterThan(-1)
    expect(bypassIndex).toBeGreaterThan(validationIndex)
    expect(compact).toContain('on conflict (network, sub_id, original_url) do nothing')
    expect(compact).toContain("link.external_status = 'success'")
  })

  it('revokes public and anon execution and grants only authenticated execution', () => {
    expect(compact).toContain(
      'revoke all on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) from public, anon, authenticated',
    )
    expect(compact).toContain(
      'grant execute on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) to authenticated',
    )
    expect(compact).not.toContain(
      'grant execute on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) to anon',
    )
  })
})
```

- [ ] **Step 3: Extend the local RLS integration test before implementing SQL**

In `apps/web/tests/mission.rls.test.ts`, inside the existing test named `creator can create tracked links only for the joined Travelpayouts mission program`, insert the following block immediately after the assertions for the ordinary authenticated insert's pending placeholder and before the merchant-mission insert:

```ts
    const expectedSubId = `kinnso_m_${travelpayoutsMissionId.replaceAll('-', '')}_p_${travelpayoutsParticipant.data!.id.replaceAll('-', '')}_c_${partnerCreatorId.replaceAll('-', '')}`
    const originalUrl = 'https://example.com/travel-rpc'
    const validPartnerUrl = `https://brand.tp.st/link?sub_id=${expectedSubId}`
    const rpcArgs = {
      p_affiliate_network_program_id: affiliateProgramId,
      p_mission_id: travelpayoutsMissionId,
      p_mission_participant_id: travelpayoutsParticipant.data!.id,
      p_original_url: originalUrl,
      p_partner_url: validPartnerUrl,
      p_sub_id: expectedSubId,
    }

    const anonAttempt = await anon.rpc('create_travelpayouts_partner_link', rpcArgs)
    expect(anonAttempt.error).not.toBeNull()

    const wrongOwner = await authed(otherCreatorEmail)
    const wrongOwnerAttempt = await wrongOwner.rpc('create_travelpayouts_partner_link', rpcArgs)
    expect(wrongOwnerAttempt.error).not.toBeNull()

    const mismatchedMission = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_mission_id: missionId,
    })
    expect(mismatchedMission.error).not.toBeNull()

    const wrongSubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: 'https://brand.tp.st/link?sub_id=wrong',
      p_sub_id: 'wrong',
    })
    expect(wrongSubId.error).not.toBeNull()

    const offDomain = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: `https://example.net/link?sub_id=${expectedSubId}`,
    })
    expect(offDomain.error).not.toBeNull()

    const missingQuerySubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: 'https://brand.tp.st/link',
    })
    expect(missingQuerySubId.error).not.toBeNull()

    const validRpc = await creator.rpc('create_travelpayouts_partner_link', rpcArgs)
    expect(validRpc.error).toBeNull()
    expect(validRpc.data).toHaveLength(1)
    expect(validRpc.data![0].partner_url).toBe(validPartnerUrl)

    const duplicateRpc = await creator.rpc('create_travelpayouts_partner_link', rpcArgs)
    expect(duplicateRpc.error).toBeNull()
    expect(duplicateRpc.data).toEqual(validRpc.data)

    const storedRpcLink = await creator
      .from('affiliate_partner_links')
      .select('id, external_status, partner_url, sub_id')
      .eq('id', validRpc.data![0].id)
      .single()
    expect(storedRpcLink.error).toBeNull()
    expect(storedRpcLink.data).toMatchObject({
      external_status: 'success',
      partner_url: validPartnerUrl,
      sub_id: expectedSubId,
    })
```

- [ ] **Step 4: Run RED against the empty migration and absent local RPC**

Run from `apps/web`:

```powershell
node_modules\.bin\vitest.cmd run tests\db.travelpayouts-partner-link-rpc.test.ts tests\mission.rls.test.ts --pool=threads --maxWorkers=1 --reporter=verbose
```

Expected: the SQL contract test fails because the generated migration is empty, and the integration case fails because the RPC is absent from the reset local schema. Record both failure reasons.

- [ ] **Step 5: Implement the audited migration**

Write the following SQL into the exact CLI-generated migration file from Step 1:

```sql
create or replace function app_private.prepare_affiliate_partner_link_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  participant_creator_id uuid;
begin
  if current_setting('app.bypass_partner_link_prepare', true) = 'on'
    or current_setting('request.jwt.claim.role', true) = 'service_role'
    or current_user = 'service_role' then
    return new;
  end if;

  select participant.creator_id
  into participant_creator_id
  from public.mission_participants participant
  where participant.id = new.mission_participant_id;

  if actor_id is not null and actor_id = participant_creator_id then
    new.sub_id := 'pending:' || gen_random_uuid()::text;
    new.partner_url := new.original_url;
    new.external_status := 'pending';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prepare_affiliate_partner_link_insert() from public;

create or replace function public.create_travelpayouts_partner_link(
  p_affiliate_network_program_id uuid,
  p_mission_id uuid,
  p_mission_participant_id uuid,
  p_original_url text,
  p_partner_url text,
  p_sub_id text
)
returns table(id uuid, partner_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_expected_sub_id text;
  v_original_url text := btrim(p_original_url);
  v_partner_url text := btrim(p_partner_url);
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '28000';
  end if;

  if nullif(v_original_url, '') is null
    or nullif(v_partner_url, '') is null
    or nullif(btrim(p_sub_id), '') is null then
    raise exception 'Partner link values are required' using errcode = '22023';
  end if;

  v_expected_sub_id :=
    'kinnso_m_' || replace(p_mission_id::text, '-', '')
    || '_p_' || replace(p_mission_participant_id::text, '-', '')
    || '_c_' || replace(v_actor_id::text, '-', '');

  if btrim(p_sub_id) <> v_expected_sub_id then
    raise exception 'Partner link SubID is invalid' using errcode = '22023';
  end if;

  if v_original_url !~* '^https://[^[:space:]]+$' then
    raise exception 'Original URL is invalid' using errcode = '22023';
  end if;

  if v_partner_url !~* '^https://([a-z0-9-]+\.)?tp\.st/[^[:space:]]*$'
    or v_partner_url !~ ('[?&]sub_id=' || v_expected_sub_id || '(&|#|$)') then
    raise exception 'Partner URL is invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.mission_participants participant
    join public.missions mission
      on mission.id = participant.mission_id
    join public.affiliate_network_programs program
      on program.id = mission.affiliate_network_program_id
    where participant.id = p_mission_participant_id
      and participant.creator_id = v_actor_id
      and participant.status = 'active'
      and mission.id = p_mission_id
      and mission.status = 'published'
      and mission.mission_source = 'travelpayouts'
      and mission.affiliate_network_program_id = p_affiliate_network_program_id
      and program.id = p_affiliate_network_program_id
      and program.network = 'travelpayouts'
      and program.status = 'active'
  ) then
    raise exception 'Partner link is not allowed' using errcode = '42501';
  end if;

  return query
  select link.id, link.partner_url
  from public.affiliate_partner_links link
  where link.network = 'travelpayouts'
    and link.mission_participant_id = p_mission_participant_id
    and link.creator_id = v_actor_id
    and link.original_url = v_original_url
    and link.sub_id = v_expected_sub_id
    and link.external_status = 'success'
  order by link.generated_at desc
  limit 1;
  if found then
    return;
  end if;

  perform set_config('app.bypass_partner_link_prepare', 'on', true);

  return query
  insert into public.affiliate_partner_links (
    affiliate_network_program_id,
    mission_id,
    mission_participant_id,
    creator_id,
    network,
    original_url,
    partner_url,
    sub_id,
    external_status
  )
  values (
    p_affiliate_network_program_id,
    p_mission_id,
    p_mission_participant_id,
    v_actor_id,
    'travelpayouts',
    v_original_url,
    v_partner_url,
    v_expected_sub_id,
    'success'
  )
  on conflict (network, sub_id, original_url) do nothing
  returning affiliate_partner_links.id, affiliate_partner_links.partner_url;
  if found then
    return;
  end if;

  return query
  select link.id, link.partner_url
  from public.affiliate_partner_links link
  where link.network = 'travelpayouts'
    and link.sub_id = v_expected_sub_id
    and link.original_url = v_original_url
    and link.creator_id = v_actor_id
    and link.external_status = 'success'
  limit 1;
  if not found then
    raise exception 'Partner link could not be persisted';
  end if;
end;
$$;

revoke all on function public.create_travelpayouts_partner_link(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_travelpayouts_partner_link(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated;
```

- [ ] **Step 6: Apply only the local migration history and run GREEN**

Run from the repository root:

```powershell
pnpm exec supabase start
pnpm exec supabase db reset --local
```

Then run from `apps/web`:

```powershell
node_modules\.bin\vitest.cmd run tests\db.travelpayouts-partner-link-rpc.test.ts tests\mission.rls.test.ts --pool=threads --maxWorkers=1 --reporter=verbose
```

Expected: both files pass. Confirm the integration test proves anon denial, wrong-owner denial, invalid URL/SubID denial, successful persistence, and idempotency.

- [ ] **Step 7: Regenerate types from the local database**

First record the known Windows dispatcher failure without writing over the tracked type file:

```powershell
pnpm exec supabase gen types typescript --local > C:\tmp\travelpayouts-hotfix-types-standard.ts
```

If it exits with `LegacyPlatformAuthRequiredError`, run the pinned local sidecar:

```powershell
$sidecar = Resolve-Path 'node_modules\.pnpm\@supabase+cli-windows-x64@2.106.0\node_modules\@supabase\cli-windows-x64\bin\supabase-go.exe'
& $sidecar gen types typescript --local --schema public | Set-Content -LiteralPath 'packages/db/types.ts' -Encoding UTF8
```

Verify the generated signature:

```powershell
Select-String -LiteralPath packages\db\types.ts -Pattern 'create_travelpayouts_partner_link'
```

Expected: one function entry with the six existing arguments and `{ id: string; partner_url: string }[]` return type. A zero-byte or manually altered type file is a blocker.

- [ ] **Step 8: Verify and commit the database task**

Run:

```powershell
pnpm --filter web typecheck
git diff --check
git status --short
```

Expected: typecheck and diff check pass. Only the CLI-generated migration, the two intended tests, and mechanically regenerated types may be staged.

```powershell
git add supabase/migrations apps/web/tests/db.travelpayouts-partner-link-rpc.test.ts apps/web/tests/mission.rls.test.ts packages/db/types.ts
git commit -m "fix(db): restore audited Travelpayouts partner links"
```

---

### Task 2: Canonicalize provider URLs before persistence

**Files:**
- Modify: `apps/web/lib/missions/travelpayouts.ts`
- Modify: `apps/web/lib/missions/actions.ts`
- Modify: `apps/web/tests/mission.travelpayouts.test.ts`
- Modify: `apps/web/tests/mission.actions.test.ts`

**Interfaces:**
- Consumes: Task 1's restored `create_travelpayouts_partner_link` RPC and existing `buildSubId(...)` output.
- Produces: `canonicalizeTravelpayoutsPartnerUrl(partnerUrl: string, subId: string): string`, returning an HTTPS `tp.st` URL containing exactly one deterministic `sub_id` query parameter.

- [ ] **Step 1: Write failing adapter tests**

Add `canonicalizeTravelpayoutsPartnerUrl` to the import from `@/lib/missions/travelpayouts` in `apps/web/tests/mission.travelpayouts.test.ts`, then add these tests inside `describe('Travelpayouts adapter', ...)`:

```ts
  it('canonicalizes a Travelpayouts short link with the deterministic SubID', () => {
    expect(
      canonicalizeTravelpayoutsPartnerUrl(
        'https://brand.tp.st/path?sub_id=wrong&erid=campaign',
        'creator_sub',
      ),
    ).toBe('https://brand.tp.st/path?sub_id=creator_sub&erid=campaign')

    expect(
      canonicalizeTravelpayoutsPartnerUrl('https://tp.st/path', 'creator_sub'),
    ).toBe('https://tp.st/path?sub_id=creator_sub')
  })

  it.each([
    'http://brand.tp.st/path',
    'https://brand.tp.st.evil.example/path',
    'https://example.com/path',
    'not-a-url',
  ])('rejects an untrusted partner URL: %s', (partnerUrl) => {
    expect(() => canonicalizeTravelpayoutsPartnerUrl(partnerUrl, 'creator_sub'))
      .toThrow('Travelpayouts returned an invalid partner URL')
  })

  it('rejects a SubID outside the Travelpayouts-safe character set', () => {
    expect(() => canonicalizeTravelpayoutsPartnerUrl('https://tp.st/path', 'bad-sub'))
      .toThrow('Travelpayouts SubID is invalid')
  })
```

- [ ] **Step 2: Update action mocks and write failing action expectations**

In the hoisted mocks in `apps/web/tests/mission.actions.test.ts`, add `canonicalizeTravelpayoutsPartnerUrlMock: vi.fn()`, reset it in `beforeEach`, and expose it from the Travelpayouts module mock:

```ts
const {
  buildSubIdMock,
  canonicalizeTravelpayoutsPartnerUrlMock,
  createServiceClientMock,
  createSupabaseServerClientMock,
  createTravelpayoutsPartnerLinksMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  buildSubIdMock: vi.fn(),
  canonicalizeTravelpayoutsPartnerUrlMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  createTravelpayoutsPartnerLinksMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/missions/travelpayouts', () => ({
  buildSubId: buildSubIdMock,
  canonicalizeTravelpayoutsPartnerUrl: canonicalizeTravelpayoutsPartnerUrlMock,
  createTravelpayoutsPartnerLinks: createTravelpayoutsPartnerLinksMock,
}))
```

Add the reset:

```ts
  canonicalizeTravelpayoutsPartnerUrlMock.mockReset()
```

In the existing successful partner-link action test, configure the mock and change the RPC/return expectations:

```ts
    canonicalizeTravelpayoutsPartnerUrlMock.mockReturnValue(
      'https://tp.st/abc?sub_id=creator-sub',
    )
```

```ts
    expect(canonicalizeTravelpayoutsPartnerUrlMock).toHaveBeenCalledWith(
      'https://tp.st/abc',
      'creator-sub',
    )
    expect(rpcMock).toHaveBeenCalledWith('create_travelpayouts_partner_link', {
      p_affiliate_network_program_id: 'program-1',
      p_mission_id: 'mission-1',
      p_mission_participant_id: 'participant-1',
      p_original_url: 'https://example.com/hotel',
      p_partner_url: 'https://tp.st/abc?sub_id=creator-sub',
      p_sub_id: 'creator-sub',
    })
```

Change the mocked RPC row and successful result's `partner_url` to `https://tp.st/abc?sub_id=creator-sub`.

In the existing RPC-rejection test, configure the same canonicalizer return value and expect the canonical URL in `p_partner_url`.

Add this action-level rejection test so an invalid provider response is proven not to reach persistence:

```ts
  it('rejects an untrusted provider URL before calling the persistence RPC', async () => {
    buildSubIdMock.mockReturnValue('creator-sub')
    createTravelpayoutsPartnerLinksMock.mockResolvedValue([
      {
        originalUrl: 'https://example.com/hotel',
        partnerUrl: 'https://example.net/not-travelpayouts',
        status: 'success',
      },
    ])
    canonicalizeTravelpayoutsPartnerUrlMock.mockImplementation(() => {
      throw new Error('Travelpayouts returned an invalid partner URL')
    })

    const rpcMock = vi.fn(async () => ({ data: null, error: null }))
    const supabase = createSupabaseMock(
      {
        mission_participants: createBuilder({
          maybeSingle: vi.fn(async () => ({
            data: {
              id: 'participant-1',
              mission_id: 'mission-1',
              creator_id: 'user-1',
              status: 'active',
            },
            error: null,
          })),
        }),
        missions: createBuilder({
          maybeSingle: vi.fn(async () => ({
            data: {
              id: 'mission-1',
              affiliate_network_program_id: 'program-1',
              mission_source: 'travelpayouts',
              status: 'published',
            },
            error: null,
          })),
        }),
        affiliate_network_programs: createBuilder({
          maybeSingle: vi.fn(async () => ({
            data: { id: 'program-1', network: 'travelpayouts', status: 'active' },
            error: null,
          })),
        }),
        affiliate_partner_links: createBuilder({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        }),
      },
      { rpc: rpcMock },
    )
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createPartnerLinkAction({
      missionParticipantId: 'participant-1',
      originalUrl: 'https://example.com/hotel',
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: {
        form: [
          'Travelpayouts partner link could not be generated: Travelpayouts returned an invalid partner URL',
        ],
      },
    })
    expect(canonicalizeTravelpayoutsPartnerUrlMock).toHaveBeenCalledWith(
      'https://example.net/not-travelpayouts',
      'creator-sub',
    )
    expect(rpcMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
```

Add a source guard to the existing module-boundary test:

```ts
    expect(source).not.toContain('createSupabaseServiceClient')
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
```

- [ ] **Step 3: Run RED for the missing canonicalizer**

Run from `apps/web`:

```powershell
node_modules\.bin\vitest.cmd run tests\mission.travelpayouts.test.ts tests\mission.actions.test.ts --pool=threads --maxWorkers=1 --reporter=verbose
```

Expected: adapter tests fail because `canonicalizeTravelpayoutsPartnerUrl` is not exported, and action expectations fail because the canonicalizer is not called.

- [ ] **Step 4: Implement the focused canonicalizer**

Add this exported helper immediately after `buildSubId` in `apps/web/lib/missions/travelpayouts.ts`:

```ts
export function canonicalizeTravelpayoutsPartnerUrl(partnerUrl: string, subId: string) {
  if (!/^[0-9A-Za-z_]+$/.test(subId)) {
    throw new Error('Travelpayouts SubID is invalid')
  }

  let url: URL
  try {
    url = new URL(partnerUrl)
  } catch {
    throw new Error('Travelpayouts returned an invalid partner URL')
  }

  const trustedHost = url.hostname === 'tp.st' || url.hostname.endsWith('.tp.st')
  if (
    url.protocol !== 'https:'
    || !trustedHost
    || url.username !== ''
    || url.password !== ''
  ) {
    throw new Error('Travelpayouts returned an invalid partner URL')
  }

  url.searchParams.set('sub_id', subId)
  return url.toString()
}
```

- [ ] **Step 5: Canonicalize inside the existing provider-call error boundary**

In `createPartnerLinkAction` in `apps/web/lib/missions/actions.ts`, extend the dynamic import:

```ts
  const {
    buildSubId,
    canonicalizeTravelpayoutsPartnerUrl,
    createTravelpayoutsPartnerLinks,
  } = await import('@/lib/missions/travelpayouts')
```

Replace the successful provider-result branch inside the existing `try` block with:

```ts
    if (link?.status === 'success' && link.partnerUrl) {
      partnerUrl = canonicalizeTravelpayoutsPartnerUrl(link.partnerUrl, subId)
    } else if (link?.message) {
      failureReason = link.message
    }
```

Do not add a service-role import or client. The existing outer `catch` converts canonicalizer errors into the current provider-failure path.

- [ ] **Step 6: Run GREEN and typecheck**

Run from `apps/web`:

```powershell
node_modules\.bin\vitest.cmd run tests\mission.travelpayouts.test.ts tests\mission.actions.test.ts --pool=threads --maxWorkers=1 --reporter=verbose
```

Then run from the repository root:

```powershell
pnpm --filter web typecheck
git diff --check
```

Expected: both focused files, typecheck, and diff check pass. Confirm the action still uses the authenticated Supabase client for the RPC.

- [ ] **Step 7: Commit the application task**

```powershell
git add apps/web/lib/missions/travelpayouts.ts apps/web/lib/missions/actions.ts apps/web/tests/mission.travelpayouts.test.ts apps/web/tests/mission.actions.test.ts
git commit -m "fix(web): validate Travelpayouts partner links"
```

---

### Task 3: Verify, review, and publish the prerequisite hotfix

**Files:**
- Verify only: all files changed since `02f489f`
- Evidence only: `.superpowers/sdd/progress.md` and task reports remain untracked

**Interfaces:**
- Consumes: Tasks 1–2 and their clean independent reviews.
- Produces: one squash-merge-ready hotfix PR plus an explicit production migration handoff; no production Supabase mutation.

- [ ] **Step 1: Rebuild the local database and generated-type proof**

Run from the repository root:

```powershell
pnpm exec supabase db reset --local
$sidecar = Resolve-Path 'node_modules\.pnpm\@supabase+cli-windows-x64@2.106.0\node_modules\@supabase\cli-windows-x64\bin\supabase-go.exe'
& $sidecar gen types typescript --local --schema public > C:\tmp\travelpayouts-hotfix-types-final.ts
git diff --no-index --ignore-space-at-eol -- packages\db\types.ts C:\tmp\travelpayouts-hotfix-types-final.ts
```

Expected: the reset applies the new migration and the generated-type comparison has no semantic difference. Exit code `1` from `git diff --no-index` is a blocker unless inspection proves the only difference is PowerShell encoding; replace the tracked generated file mechanically and repeat if needed.

- [ ] **Step 2: Run focused and repository-level verification**

Run from `apps/web`:

```powershell
node_modules\.bin\vitest.cmd run tests\db.travelpayouts-partner-link-rpc.test.ts tests\mission.rls.test.ts tests\mission.travelpayouts.test.ts tests\mission.actions.test.ts --pool=threads --maxWorkers=1 --reporter=verbose
node_modules\.bin\vitest.cmd run --pool=threads --maxWorkers=1
```

Run from the repository root:

```powershell
pnpm --filter web typecheck
git diff --check
git status --short --branch
```

Expected: all focused tests and typecheck pass. The full suite may reproduce only the two documented pre-existing `creator-rls.test.ts` failures; any new failure blocks publication.

- [ ] **Step 3: Perform the security and scope audit**

Run:

```powershell
git diff 02f489f..HEAD --name-only
git diff 02f489f..HEAD -- apps/web/lib/missions/actions.ts apps/web/lib/missions/travelpayouts.ts supabase/migrations packages/db/types.ts
rg -n "createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY" apps/web/lib/missions/actions.ts
rg -n "create_travelpayouts_partner_link|app.bypass_partner_link_prepare|grant execute|revoke all" supabase/migrations/*_restore_travelpayouts_partner_link_rpc.sql
```

Expected: the action has no service-role dependency; only one new migration is present; shipped migrations, locale files, creator copilot, settlements, and public URLs are unchanged; RPC privilege statements match the design.

- [ ] **Step 4: Request final independent review**

Generate a review package from `02f489f..HEAD`. The reviewer must check:

- the bypass cannot be opened before validation;
- authenticated callers cannot cross creator, mission, or program boundaries;
- URL and SubID checks match application canonicalization;
- privilege revokes/grants are explicit;
- idempotency cannot return another creator's row;
- no service-role exception was added;
- generated types came from the migrated local schema;
- focused and typecheck evidence is current.

Fix every Critical or Important finding, rerun verification, and re-review until clean.

- [ ] **Step 5: Push and create the hotfix PR**

Push `codex/travelpayouts-persistence-hotfix` and create a ready PR whose body includes:

```markdown
## Summary
- restore the audited Travelpayouts partner-link RPC in migration history
- validate deterministic SubIDs and Travelpayouts-hosted HTTPS links
- canonicalize provider URLs before authenticated RPC persistence
- regenerate and verify database types from local Supabase

## Verification
- focused database/RLS/adapter/action tests
- web typecheck
- full-suite comparison against the documented creator-RLS baseline
- independent security review clean

## Production migration gate
Codex did not mutate production Supabase. An authorized operator must apply the new migration before partner-link persistence is restored in production.
```

Wait for required checks. Squash-merge only when checks and review are green. Record the PR number, squash commit, and migration filename.

- [ ] **Step 6: Resume Phase R7.2 from the merged hotfix**

After merge:

1. Update local `main` to the verified squash commit.
2. Rebase or recreate `codex/r7-2-feature-state` on that commit without losing the paused R7.2 migration/test work.
3. Reset the local Supabase stack so both the hotfix and R7.2 migrations apply.
4. Regenerate `packages/db/types.ts` locally; verify both `create_travelpayouts_partner_link` and `join_feature_interest` exist.
5. Rerun the R7.2 Task 2 SQL contract and web typecheck.
6. Resume the approved R7.2 subagent plan at Task 2 review.
