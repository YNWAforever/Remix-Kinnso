# Phase R7.3 Production Data Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure KINNSO renders only approved entity media or branded placeholders, exposes only backed social proof and eligible creators, publishes only substantive attributed articles with safe links, and permanently rejects known demo artifacts.

**Architecture:** A small workspace policy package owns the HTTPS/reserved-domain rule shared by web and sync. Supabase migrations own the honest save recompute, creator listing override and guard, explicit editorial identity, and narrow production cleanup; web query/UI boundaries own discovery and media rendering; the sync transform owns article publication eligibility. Source lint and Playwright smoke tests enforce the same public-output policy in CI.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript 5, Supabase/Postgres 17, pnpm 11.6, Vitest 4.1, Playwright 1.50, GitHub Actions.

## Global Constraints

- `kinnso-phase-r7-ux-hardening-spec.md` is authoritative; §7 of `docs/superpowers/specs/2026-07-02-product-revision-program-design.md` is binding.
- Preserve all frozen article, guide, creator, merchant, and experience URLs and redirects.
- Never edit a shipped migration. Create both R7.3 migrations with `pnpm exec supabase migration new <name>` so the CLI assigns their timestamps.
- Production Supabase project `scryfkefedzuetfdtrvl` remains read-only during implementation.
- Do not merge or deploy until an authorized operator applies both migrations and the writable Preview smoke gate passes.
- Do not modify creator copilot code.
- Keep guide and experience save/unsave actions; hide only unbacked public guide totals.
- `creators.is_listed = true` is an inclusion override for zero-guide creators, not an exclusion flag for creators with published guides.
- Direct `/c/[handle]` pages remain available under their existing active-profile rule; only directory and sitemap eligibility tighten.
- Every published article translation requires at least 3 non-empty blocks and at least 150 locale-aware words.
- Word counting uses `Intl.Segmenter(locale, { granularity: 'word' })` and `segment.isWordLike`.
- Public outbound URLs must be absolute HTTPS and must not contain a hostname label equal to `example`.
- The permanent forbidden-token set is case-insensitive: `picsum.photos`, `example.com`, `maps.example`, `Jane Doe`, `lorem ipsum`.
- `MediaPlaceholder` is decorative to assistive technology; real images use meaningful entity-title alt text and explicit `sizes`.

## Planning Audit Addendum — 2026-07-17

The fresh read-only production audit expanded the cleanup set without changing the approved architecture:

- 10 guide covers use `picsum.photos`; their current fabricated save total is 1,891 while `guide_saves` has 0 rows.
- Six article rows have `published_at`: `pub-article`, `ramen-guide`, `sushi-guide`, `cafe-guide`, `mall-coupon`, and `expired-article`. All fail the author/depth rules; `expired-article` is already end-dated but still marked published.
- The only article author is active `jane-doe` / Jane Doe.
- Four merchant websites use reserved example-domain hosts: `bloom-tea-house`, `nomad-escapes`, `sunrise-stays-hk`, and `wanderpack-gear`.

The production cleanup migration unpublishes all six noncompliant rows, clears all 10 demo covers, removes the placeholder author/link, and nulls those four merchant URLs. The local-only seed retains one fully compliant `ramen-guide` test article so integration and browser verification still exercise an article detail without republishing the production fixture.

## File Structure

### Shared policy

- Create `packages/honesty/package.json`: workspace package and test/typecheck scripts.
- Create `packages/honesty/tsconfig.json`: strict ES2022 configuration.
- Create `packages/honesty/src/external-url.ts`: HTTPS and reserved-domain policy.
- Create `packages/honesty/src/index.ts`: public exports.
- Create `packages/honesty/tests/external-url.test.ts`: policy contract.
- Modify `apps/web/package.json`, `packages/sync/package.json`, and `pnpm-lock.yaml`: consume `@kinnso/honesty`.

### Database and creator listing

- Create via CLI `supabase/migrations/*_r7_3_production_honesty.sql`: structural migration, save recompute, listing guard/RPC, detail payload, editorial identity.
- Create via CLI `supabase/migrations/*_r7_3_honesty_cleanup.sql`: idempotent data cleanup.
- Modify `packages/db/types.ts`: locally regenerated database types.
- Create `apps/web/tests/db.r7-3-production-honesty.test.ts`: migration SQL contract.
- Create `apps/web/tests/r7-3-creator-listing.rls.test.ts`: live owner/ops security behavior.
- Modify `apps/web/lib/creators/queries.ts` and `apps/web/tests/creators.queries.test.ts`: shared directory/sitemap eligibility.
- Modify creator admin query/action/page/view tests and all seven locale dictionaries for the audited override.

### Media and public proof

- Create `apps/web/lib/media/entity-media.ts`: approved media-host predicate and deterministic hue.
- Create `apps/web/components/kinnso/media/MediaPlaceholder.tsx`: branded decorative fallback.
- Create `apps/web/components/kinnso/media/EntityMedia.tsx`: `next/image`/placeholder boundary.
- Create `apps/web/tests/kinnso.EntityMedia.test.tsx`: media policy and deterministic fallback tests.
- Modify `apps/web/next.config.ts`: `cdn.kinnso.ai` remote pattern.
- Modify the public guide/article/creator/merchant/experience components listed in Task 5.

### Article publication and permanent controls

- Create `packages/sync/src/transform/publication.ts` and `packages/sync/tests/transform.publication.test.ts`: depth, author, and recursive-link validation.
- Modify `packages/sync/src/types.ts`, `transform/index.ts`, `upserter.ts`, and their tests: structured downgrade behavior and publication-state-aware idempotency.
- Create `scripts/honesty-lint.ts`: permanent source/seed scan.
- Modify `package.json` and `.github/workflows/ci.yml`: root lint command and quality gate.
- Create `apps/e2e/specs/honesty.spec.ts`: rendered HTML smoke.
- Modify `supabase/seed.sql`, locale messages, and fixture consumers so source lint passes and local published content meets the same policy.

---

### Task 1: Shared External URL Policy and Merchant Write Boundaries

**Files:**

- Create: `packages/honesty/package.json`
- Create: `packages/honesty/tsconfig.json`
- Create: `packages/honesty/src/external-url.ts`
- Create: `packages/honesty/src/index.ts`
- Create: `packages/honesty/tests/external-url.test.ts`
- Create: `apps/web/tests/merchants.profile-validation.test.ts`
- Create: `apps/web/tests/merchants.application-validation.test.ts`
- Modify: `apps/web/lib/merchants/profile-validation.ts`
- Modify: `apps/web/lib/merchants/application-validation.ts`
- Modify: `apps/web/package.json`
- Modify: `packages/sync/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `validatePublicExternalUrl(raw: string): PublicExternalUrlIssue | null`
- Produces: `isPublicExternalUrl(raw: string): boolean`
- `PublicExternalUrlIssue` is `'invalid_url' | 'https_required' | 'reserved_example_domain'`.
- Consumers: merchant application/profile validators in this task and sync publication validation in Task 6.

- [ ] **Step 1: Write the failing shared-policy tests**

```ts
import { describe, expect, it } from 'vitest'
import { isPublicExternalUrl, validatePublicExternalUrl } from '../src/external-url'

describe('public external URL policy', () => {
  it('accepts an absolute HTTPS URL', () => {
    expect(validatePublicExternalUrl('https://merchant.test/offers')).toBeNull()
    expect(isPublicExternalUrl('https://merchant.test/offers')).toBe(true)
  })

  it.each([
    ['not a url', 'invalid_url'],
    ['/relative', 'invalid_url'],
    ['http://merchant.test', 'https_required'],
    ['https://example.com/path', 'reserved_example_domain'],
    ['https://bloom-tea.example.com/path', 'reserved_example_domain'],
    ['https://example.co.uk/path', 'reserved_example_domain'],
  ] as const)('rejects %s', (value, issue) => {
    expect(validatePublicExternalUrl(value)).toBe(issue)
    expect(isPublicExternalUrl(value)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `pnpm --filter @kinnso/honesty test`

Expected: FAIL because `packages/honesty` does not exist.

- [ ] **Step 3: Create the focused workspace package and minimal policy**

```json
{
  "name": "@kinnso/honesty",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5",
    "vitest": "^4.1.8"
  }
}
```

```ts
export type PublicExternalUrlIssue =
  | 'invalid_url'
  | 'https_required'
  | 'reserved_example_domain'

export function validatePublicExternalUrl(raw: string): PublicExternalUrlIssue | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return 'invalid_url'
  }
  if (url.protocol !== 'https:') return 'https_required'
  if (url.hostname.toLowerCase().split('.').includes('example')) return 'reserved_example_domain'
  return null
}

export const isPublicExternalUrl = (raw: string): boolean => validatePublicExternalUrl(raw) === null
```

Export both functions and the issue type from `packages/honesty/src/index.ts`. Add `@kinnso/honesty: workspace:*` to web and sync dependencies, then run `pnpm install --frozen-lockfile=false` once to update the lockfile.

- [ ] **Step 4: Add failing merchant validation tests**

Test both `validateMerchantProfileInput` and `validateMerchantApplicationInput` with:

```ts
expect(validate(valid({ websiteUrl: 'http://merchant.test' })).websiteUrl).toBeTruthy()
expect(validate(valid({ websiteUrl: 'https://wanderpack.example.com' })).websiteUrl).toBeTruthy()
expect(validate(valid({ websiteUrl: 'https://merchant.test' })).websiteUrl).toBeUndefined()
```

Expected behavior is identical at the application and profile write boundaries. Keep `logoUrl` on its existing HTTP(S) rule because R7.3's external-link requirement concerns public outbound websites; `EntityMedia` fails closed on unapproved logos in Task 4.

- [ ] **Step 5: Replace both website validators with the shared rule**

```ts
import { validatePublicExternalUrl } from '@kinnso/honesty'

const website = input.websiteUrl.trim()
if (website && validatePublicExternalUrl(website)) {
  errors.websiteUrl = ['invalid_url']
}
```

For `application-validation.ts`, retain its user-facing message array but use the same predicate:

```ts
if (website && validatePublicExternalUrl(website)) {
  errors.websiteUrl = ['Enter a secure https:// website that is not an example domain']
}
```

- [ ] **Step 6: Run focused tests and typechecks**

Run:

```powershell
pnpm --filter @kinnso/honesty test
pnpm --filter @kinnso/honesty typecheck
pnpm --filter web test -- merchants.profile-validation merchants.application-validation merchants.profile-actions merchants.application-actions
pnpm --filter web typecheck
pnpm --filter @kinnso/sync typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit the shared policy**

```powershell
git add packages/honesty apps/web/package.json packages/sync/package.json pnpm-lock.yaml apps/web/lib/merchants apps/web/tests/merchants.profile-validation.test.ts apps/web/tests/merchants.application-validation.test.ts
git commit -m "feat(policy): validate honest external links"
```

### Task 2: Structural Migration, Save Recompute, Creator Override Security, and Editorial Identity

**Files:**

- Create via CLI: `supabase/migrations/*_r7_3_production_honesty.sql`
- Create: `apps/web/tests/db.r7-3-production-honesty.test.ts`
- Create: `apps/web/tests/r7-3-creator-listing.rls.test.ts`
- Modify: `packages/db/types.ts`

**Interfaces:**

- Produces column: `public.creators.is_listed boolean NOT NULL DEFAULT false`.
- Produces RPC: `admin_set_creator_listed(p_id uuid, p_is_listed boolean, p_reason text) RETURNS void`.
- Produces trigger guard: direct non-ops updates cannot change `is_listed`.
- Produces explicit author identity: `kinnso-editorial` / `KINNSO Editorial` for all seven supported locales.
- Preserves existing `guide_saves_sync_count_trigger` behavior after the one-time recompute.

- [ ] **Step 1: Generate the migration filename and capture it by suffix**

Run: `pnpm exec supabase migration new r7_3_production_honesty`

Expected: one new file ending `_r7_3_production_honesty.sql`. Do not rename it or hand-edit its timestamp.

- [ ] **Step 2: Write the failing SQL contract test**

Use `readdirSync` so the test locates the CLI-generated timestamp safely:

```ts
const file = readdirSync(migrationsDir).find((name) => name.endsWith('_r7_3_production_honesty.sql'))
expect(file).toBeTruthy()
const sql = readFileSync(join(migrationsDir, file!), 'utf8')

expect(sql).toContain('alter table public.guides alter column cover_url drop not null')
expect(sql).toContain('select count(*)::int from public.guide_saves')
expect(sql).toContain('add column if not exists is_listed boolean not null default false')
expect(sql).toContain('create or replace function public.admin_set_creator_listed')
expect(sql).toContain("perform public.ops_audit_log_append('creator'")
expect(sql).toMatch(/revoke all on function public\.admin_set_creator_listed\(uuid, boolean, text\) from public, anon/)
expect(sql).toMatch(/grant execute on function public\.admin_set_creator_listed\(uuid, boolean, text\) to authenticated/)
expect(sql).toContain('create trigger creators_protect_is_listed')
expect(sql).toContain("'kinnso-editorial'")
```

Run: `pnpm --filter web test -- db.r7-3-production-honesty`

Expected: FAIL because the generated migration is empty.

- [ ] **Step 3: Implement the structural migration**

Use these exact core statements:

```sql
alter table public.guides alter column cover_url drop not null;

update public.guides g
set saves_count = (
  select count(*)::int from public.guide_saves gs where gs.guide_id = g.id
)
where g.saves_count is distinct from (
  select count(*)::int from public.guide_saves gs where gs.guide_id = g.id
);

alter table public.creators
  add column if not exists is_listed boolean not null default false;

create or replace function public.protect_creator_is_listed()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_listed is distinct from old.is_listed and not public.is_active_ops() then
    raise exception 'forbidden_listing_override' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger creators_protect_is_listed
  before update on public.creators
  for each row execute procedure public.protect_creator_is_listed();

revoke all on function public.protect_creator_is_listed() from public, anon, authenticated, service_role;

create or replace function public.admin_set_creator_listed(
  p_id uuid, p_is_listed boolean, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare v_from boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(p_reason) > 500 then raise exception 'reason_too_long'; end if;
  select is_listed into v_from from public.creators where id = p_id;
  if v_from is null then raise exception 'not_found'; end if;
  update public.creators set is_listed = p_is_listed, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append(
    'creator', p_id, 'listing.set', p_reason,
    jsonb_build_object('from', v_from, 'to', p_is_listed)
  );
end $$;

revoke all on function public.admin_set_creator_listed(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_creator_listed(uuid, boolean, text) to authenticated;
```

Re-create `admin_creator_detail(uuid)` from its current shipped definition and add `'is_listed', c.is_listed` inside the `creator` JSON object. Do not change its signature or any other payload field.

Insert the editorial identity idempotently for `en`, `zh-hk`, `zh-tw`, `zh-cn`, `ja`, `ko`, and `th`:

```sql
insert into public.article_authors (slug, locale, name, title, bio, avatar, labels, is_active)
select 'kinnso-editorial', locale, 'KINNSO Editorial', null, null, null, '{}', true
from unnest(array['en','zh-hk','zh-tw','zh-cn','ja','ko','th']) as locale
on conflict (slug, locale) do update
set name = excluded.name, is_active = true;
```

- [ ] **Step 4: Apply the complete migration locally and regenerate types**

Run:

```powershell
pnpm exec supabase db reset
pnpm exec supabase gen types typescript --local > packages/db/types.ts
rg -n "is_listed|admin_set_creator_listed" packages/db/types.ts
```

Expected: reset succeeds; generated types contain the column and RPC.

- [ ] **Step 5: Write the live security tests**

Follow `creator-rls.test.ts`'s service-role setup. Create one owner and one active ops user, then assert:

```ts
const denied = await owner.from('creators').update({ is_listed: true }).eq('id', ownerId)
expect(denied.error).not.toBeNull()

const normalUpdate = await owner.from('creators').update({ display_name: 'Owner Edit' }).eq('id', ownerId)
expect(normalUpdate.error).toBeNull()

const allowed = await ops.rpc('admin_set_creator_listed', {
  p_id: ownerId,
  p_is_listed: true,
  p_reason: 'Approved for launch cohort',
})
expect(allowed.error).toBeNull()

const creator = await svc.from('creators').select('is_listed').eq('id', ownerId).single()
expect(creator.data?.is_listed).toBe(true)

const audit = await svc.from('ops_audit_log').select('action, reason, metadata').eq('entity_id', ownerId)
expect(audit.data).toContainEqual(expect.objectContaining({ action: 'listing.set' }))
```

Also insert a guide with a deliberately wrong `saves_count`, insert/delete a real `guide_saves` row, and assert the existing trigger still increments/decrements from the recomputed baseline.

- [ ] **Step 6: Run database and type verification**

Run:

```powershell
pnpm --filter web test -- db.r7-3-production-honesty r7-3-creator-listing.rls
pnpm --filter web typecheck
pnpm --filter @kinnso/sync typecheck
git diff --check
```

Expected: all PASS; no shipped migration changed.

- [ ] **Step 7: Commit the structural database boundary**

```powershell
git add supabase/migrations packages/db/types.ts apps/web/tests/db.r7-3-production-honesty.test.ts apps/web/tests/r7-3-creator-listing.rls.test.ts
git commit -m "feat(db): add honest creator listing policy"
```

### Task 3: Shared Creator Eligibility and Audited Ops Toggle

**Files:**

- Modify: `apps/web/lib/creators/queries.ts`
- Modify: `apps/web/tests/creators.queries.test.ts`
- Modify: `apps/web/lib/admin/creators-queries.ts`
- Modify: `apps/web/tests/admin.creators-detail-queries.test.ts`
- Modify: `apps/web/lib/admin/creators-actions.ts`
- Modify: `apps/web/tests/admin.creators-actions.test.ts`
- Modify: `apps/web/components/kinnso/admin/creators/CreatorDetailView.tsx`
- Modify: `apps/web/tests/kinnso.CreatorDetailView.test.tsx`
- Modify: `apps/web/app/[locale]/admin/creators/[creatorId]/page.tsx`
- Modify: `apps/web/tests/admin.creators-detail.host.test.tsx`
- Modify: all seven files in `apps/web/lib/i18n/messages/`

**Interfaces:**

- Produces helper: `fetchEligibleCreators(): Promise<EligibleCreatorRow[]>` used only by directory and sitemap exports.
- Produces action: `setCreatorListed(locale, id, isListed, reason): Promise<ActionResult<{ id: string; isListed: boolean }>>`.
- Extends `CreatorDetailProfile` with `isListed: boolean`.
- Direct `getCreatorByHandle` remains unchanged except nullable guide media from Task 4.

- [ ] **Step 1: Write failing eligibility tests**

Add three creator cases and published guide rows:

```ts
state.creators = [
  { ...creatorRow, id: 'with-guide', handle: 'with-guide', is_listed: false },
  { ...creatorRow, id: 'override', handle: 'override', is_listed: true },
  { ...creatorRow, id: 'hidden', handle: 'hidden', is_listed: false },
]
state.guides = [{ creator_id: 'with-guide' }]

expect((await getPublicCreators()).map((c) => c.handle)).toEqual(['with-guide', 'override'])
expect((await getCreatorsForSitemap()).map((c) => c.handle)).toEqual(['with-guide', 'override'])
```

Retain the direct-profile test and explicitly prove `getCreatorByHandle('hidden')` still renders when the active row is returned by its direct lookup.

Run: `pnpm --filter web test -- creators.queries`

Expected: FAIL because zero-guide creators are still mapped unconditionally.

- [ ] **Step 2: Implement one typed eligibility fetch**

Replace the arbitrary-column helper with one fixed row shape that always selects `id`, `is_listed`, directory fields, and `created_at`. Fetch published guide `creator_id` rows once, count them, and return only:

```ts
const guideCount = counts.get(c.id) ?? 0
return c.is_listed || guideCount > 0
```

Map that same returned set in both `getPublicCreators` and `getCreatorsForSitemap`; do not add the filter to `getCreatorByHandle`.

- [ ] **Step 3: Write failing admin query/action tests**

Extend the mocked detail payload with `is_listed: false` and expect `detail.creator.isListed === false`. Add:

```ts
const res = await setCreatorListed('en', 'c1', true, 'Launch cohort')
expect(rpcMock).toHaveBeenCalledWith('admin_set_creator_listed', {
  p_id: 'c1', p_is_listed: true, p_reason: 'Launch cohort',
})
expect(res).toEqual({ ok: true, id: 'c1', isListed: true })
expect(revalidateMock).toHaveBeenCalledWith('/en/creators')
expect(revalidateMock).toHaveBeenCalledWith('/sitemap.xml')
```

Also assert blank reasons never call the RPC and `forbidden` maps to active-ops copy.

- [ ] **Step 4: Implement the action and cache revalidation**

Use `requireOpsAction`, `validateReason`, the generated RPC type, and existing error mapping. Revalidate:

```ts
revalidatePath(`/${locale}/admin/creators/directory`)
revalidatePath(`/${locale}/admin/creators/${id}`)
revalidatePath(`/${locale}/creators`)
revalidatePath('/sitemap.xml')
```

- [ ] **Step 5: Add the moderation control with reason confirmation**

Extend `CreatorDetailActions` and `Pending` with:

```ts
setCreatorListed: (locale: Locale, id: string, isListed: boolean, reason: string) =>
  Promise<ActionResult<{ id: string; isListed: boolean }>>

| { kind: 'listing'; isListed: boolean }
```

On the moderation tab, render the current override state and a button that calls `start({ kind: 'listing', isListed: !creator.isListed })`. Reuse the existing reason input, Apply/Cancel buttons, busy state, error handling, and `router.refresh()` path. Add exact locale keys for “List in creator directory”, “Remove directory override”, “Explicit directory override on”, and “Guide-based listing only” in all seven dictionaries.

- [ ] **Step 6: Run creator-focused verification**

Run:

```powershell
pnpm --filter web test -- creators.queries admin.creators-actions admin.creators-detail-queries admin.creators-detail.host kinnso.CreatorDetailView i18n.locale-parity
pnpm --filter web typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit creator eligibility and ops UI**

```powershell
git add apps/web/lib/creators apps/web/lib/admin/creators-actions.ts apps/web/lib/admin/creators-queries.ts apps/web/components/kinnso/admin/creators apps/web/app/[locale]/admin/creators apps/web/lib/i18n/messages apps/web/tests
git commit -m "feat(web): gate creator discovery honestly"
```

### Task 4: Entity Media Foundation and Nullable Guide Covers

**Files:**

- Create: `apps/web/lib/media/entity-media.ts`
- Create: `apps/web/components/kinnso/media/MediaPlaceholder.tsx`
- Create: `apps/web/components/kinnso/media/EntityMedia.tsx`
- Create: `apps/web/tests/kinnso.EntityMedia.test.tsx`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/lib/guides/types.ts`
- Modify: `apps/web/lib/guides/queries.ts`
- Modify: `apps/web/tests/guides.queries.test.ts`

**Interfaces:**

- Produces `isApprovedEntityMediaUrl(value: string | null | undefined): boolean`.
- Produces `entityMediaHue(seed: string): number`.
- Produces `EntityMediaProps`: `src`, `title`, `location`, `alt`, `sizes`, `priority`, `className`, and `imageClassName`.
- Changes `Guide.cover` and raw `cover_url` mapping to `string | null`.

- [ ] **Step 1: Write failing media-policy/component tests**

```tsx
expect(isApprovedEntityMediaUrl('https://cdn.kinnso.ai/guides/a.jpg')).toBe(true)
expect(isApprovedEntityMediaUrl('https://picsum.photos/seed/a/800/600')).toBe(false)
expect(isApprovedEntityMediaUrl('http://cdn.kinnso.ai/a.jpg')).toBe(false)
expect(entityMediaHue('Tokyo|Ramen')).toBe(entityMediaHue('Tokyo|Ramen'))

const { container } = render(
  <EntityMedia src={null} title="Tokyo ramen" location="Tokyo" alt="Tokyo ramen" sizes="100vw" />,
)
expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
expect(container.querySelector('img')).toBeNull()
expect(container.querySelector('[data-media-placeholder="true"]')?.getAttribute('aria-hidden')).toBe('true')
```

Render a CDN URL and assert the image alt text exists and no placeholder renders.

- [ ] **Step 2: Implement deterministic media helpers**

```ts
export function entityMediaHue(seed: string): number {
  let hash = 0
  for (const char of seed.normalize('NFKC').trim().toLowerCase()) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  }
  return hash % 360
}

export function isApprovedEntityMediaUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cdn.kinnso.ai'
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Implement `MediaPlaceholder` and `EntityMedia`**

`MediaPlaceholder` derives two HSL colors from `${location ?? ''}|${title}`, fills its parent, overlays `title` and optional `location`, sets `aria-hidden="true"`, and exposes `data-media-placeholder="true"` for tests.

`EntityMedia` uses this exact fail-closed branch:

```tsx
return (
  <div className={cn('relative overflow-hidden', className)}>
    {isApprovedEntityMediaUrl(src) ? (
      <Image
        src={src!}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn('object-cover', imageClassName)}
      />
    ) : (
      <MediaPlaceholder title={title} location={location} />
    )}
  </div>
)
```

- [ ] **Step 4: Configure only the verified CDN**

```ts
images: {
  remotePatterns: [{ protocol: 'https', hostname: 'cdn.kinnso.ai', pathname: '/**' }],
},
```

- [ ] **Step 5: Make public guide mapping nullable**

Change `Guide.cover`, `GuideListItem.cover`, and `GuideRowLite.cover_url` to `string | null`; normalize `mapRowToGuide` with `cover: r.cover_url ?? null`. Keep `GuideInput.coverUrl` as a string because the existing editor still accepts a URL field.

- [ ] **Step 6: Run media foundation tests**

Run:

```powershell
pnpm --filter web test -- kinnso.EntityMedia guides.queries
pnpm --filter web typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit the media boundary**

```powershell
git add apps/web/lib/media apps/web/components/kinnso/media apps/web/tests/kinnso.EntityMedia.test.tsx apps/web/next.config.ts apps/web/lib/guides apps/web/tests/guides.queries.test.ts
git commit -m "feat(web): add honest entity media fallback"
```

### Task 5: Migrate Public Media Surfaces and Remove Guide Save Totals

**Files:**

- Modify: `apps/web/components/kinnso/GuideCard.tsx`
- Modify: `apps/web/components/ArticleCard.tsx`
- Modify: `apps/web/components/kinnso/ExperienceCard.tsx`
- Modify: `apps/web/components/kinnso/home/Hero.tsx`
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx`
- Modify: `apps/web/components/kinnso/pages/ExperiencePublicView.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorsLandingView.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorProfileView.tsx`
- Modify: `apps/web/components/kinnso/pages/MerchantsDirectoryView.tsx`
- Modify: `apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx`
- Modify: `apps/web/app/[locale]/g/[slug]/page.tsx`
- Modify: `apps/web/app/[locale]/g/[slug]/opengraph-image.tsx`
- Modify: `apps/web/app/[locale]/experiences/[slug]/opengraph-image.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify: media-adjacent tests for every component above.

**Interfaces:**

- Consumes: `EntityMedia` and `isApprovedEntityMediaUrl` from Task 4.
- Preserves: `GuideSaveButton`, `ExperienceSaveButton`, and interactive card callbacks.
- Removes: all rendered `guide.saves`/`g.saves` numeric text and static bookmark-only guide proof.
- Keeps: experience save totals, which are backed by `experience_saves` and its trigger.

- [ ] **Step 1: Change component tests to the honest behavior**

Update `kinnso.guide-card.test.tsx` to assert the number `5` never renders, both without and with a callback, while the callback button still fires. Add missing-media assertions to guide, article, experience, home, creator, and merchant tests:

```tsx
expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
expect(container.innerHTML).not.toContain('picsum.photos')
```

Use `https://cdn.kinnso.ai/test/entity.jpg` for the approved-image branch.

- [ ] **Step 2: Run focused tests and confirm current failures**

Run:

```powershell
pnpm --filter web test -- kinnso.guide-card ArticleCard kinnso.experience-card kinnso.HomeView kinnso.CreatorProfileView merchants.directory merchants.public-profile
```

Expected: FAIL on raw images, absent placeholders, and visible guide counts.

- [ ] **Step 3: Replace card/grid media with `EntityMedia`**

Use explicit responsive sizes:

- Three-column cards: `sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"`.
- Compact 64px experience cards: `sizes="64px"`.
- Creator/merchant avatars: `sizes="80px"` or `sizes="48px"` matching the rendered box.
- Detail heroes: `sizes="(min-width: 1024px) 1152px, 100vw"`.

Every missing, invalid, insecure, or non-CDN URL must stay out of the rendered `src` and JSON-LD/metadata arrays.

- [ ] **Step 4: Remove guide totals but retain save controls**

In `GuideCard`, delete both `g.saves.toLocaleString()` branches. When `onSaveToggle` exists, keep the bookmark button and its screen-reader label; when it does not exist, render no bookmark proof. In guide detail, remove the bookmark/count span but keep `GuideSaveButton` top-right.

Do not remove `saves` from query/domain types because internal ordering and operator reporting still use the honest counter.

- [ ] **Step 5: Fail closed in metadata, JSON-LD, and OG loaders**

Use:

```ts
const approvedCover = isApprovedEntityMediaUrl(guide.cover) ? guide.cover : null
```

Feed only `approvedCover` to guide JSON-LD and OG `loadRemoteImage`. Apply the same predicate to experience covers and article thumbnails/OG images. Invalid media must yield the existing typographic OG card or no image metadata, never a remote fetch.

- [ ] **Step 6: Run public-surface verification**

Run:

```powershell
pnpm --filter web test -- kinnso.guide-card ArticleCard kinnso.experience-card kinnso.HomeView home.host g.slug.host experiences.public-detail merchants.directory merchants.public-profile creators.index c.handle
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: all PASS and no changed public entity surface renders a raw remote `<img>` or CSS `backgroundImage`.

- [ ] **Step 7: Run the React best-practices review required after this multi-TSX edit**

Invoke `vercel:react-best-practices`, apply only findings within the touched R7.3 surfaces, and repeat the focused tests/typecheck.

- [ ] **Step 8: Commit public media and proof changes**

```powershell
git add apps/web/components apps/web/app/[locale] apps/web/tests
git commit -m "feat(web): render honest media and save proof"
```

### Task 6: Sync Publication Validator and Draft Downgrade

**Files:**

- Create: `packages/sync/src/transform/publication.ts`
- Create: `packages/sync/tests/transform.publication.test.ts`
- Modify: `packages/sync/src/types.ts`
- Modify: `packages/sync/src/transform/index.ts`
- Modify: `packages/sync/src/upserter.ts`
- Modify: `packages/sync/tests/transform.index.test.ts`
- Modify: `packages/sync/tests/upserter.unit.test.ts`
- Modify: `packages/sync/tests/fixtures/legacyPost.ts`

**Interfaces:**

- Produces `countLocaleWords(text: string, locale: string): number`.
- Produces `validatePublication(input: PublicationInput): PublicationWarning[]`.
- Extends `TransformWarning` with `kind`, `code`, `detail`, `articleSlug`, optional `locale`, and optional `path`.
- A requested published article with any publication warning is persisted with `published_at = null`.
- Upserter skip requires both identical `source_hash` and identical desired `published_at`.

- [ ] **Step 1: Write failing validator tests**

Build a compliant fixture with three text blocks and 160 generated words per locale. Test these exact failures independently:

```ts
expect(validatePublication(valid).map((w) => w.code)).toEqual([])
expect(validatePublication(withTwoBlocks).map((w) => w.code)).toContain('translation_too_shallow')
expect(validatePublication(with149Words).map((w) => w.code)).toContain('translation_too_short')
expect(validatePublication(withHttpLink).map((w) => w.code)).toContain('invalid_external_link')
expect(validatePublication(withExampleLink).map((w) => w.code)).toContain('invalid_external_link')
expect(validatePublication(withJaneDoe).map((w) => w.code)).toContain('invalid_author')
expect(validatePublication(withMissingAuthor).map((w) => w.code)).toContain('invalid_author')
expect(validatePublication(withEditorialSlug).map((w) => w.code)).toEqual([])
```

Include an HTML `<a href="https://wanderpack.example.com">` inside a block `content` string and a nested `address.link` offender to prove both paths are discovered.

- [ ] **Step 2: Run the validator test and verify the missing-module failure**

Run: `pnpm --filter @kinnso/sync test -- transform.publication`

Expected: FAIL because `publication.ts` does not exist.

- [ ] **Step 3: Implement locale word/block extraction**

```ts
export function countLocaleWords(text: string, locale: string): number {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' })
  return [...segmenter.segment(text)].filter((segment) => segment.isWordLike).length
}
```

For block text, recursively collect user-visible string fields while excluding keys `id`, `type`, `image`, `thumbnail`, `original`, `link`, `href`, `url`, `website`, `phone`, `time`, `price`, and `attraction`. Strip HTML tags and collapse whitespace. A non-empty block is one whose collected visible text is nonempty.

- [ ] **Step 4: Implement recursive link and author validation**

Walk objects/arrays with a stable path such as `translations.en.content[2].address.link`. Validate string values under `link`, `href`, `url`, and `website`, and extract `href` attributes from every HTML-looking string. Pass each candidate to `validatePublicExternalUrl` from `@kinnso/honesty`.

For each translation locale, accept an author only when one requested slug resolves to an active transformed author row for that locale with nonempty name and is not `jane-doe`/Jane Doe. The explicit `kinnso-editorial` slug is valid because Task 2 guarantees its seven locale rows. Never accept an empty/unknown slug as editorial.

- [ ] **Step 5: Integrate downgrade after all transform outputs exist**

In `transformPost`, create `authors` before returning. If `article.published_at` is non-null:

```ts
const publicationWarnings = validatePublication({
  articleSlug: article.slug,
  authorSlugs: article.authors,
  translations,
  authors,
})
if (publicationWarnings.length > 0) {
  article.published_at = null
  warnings.push(...publicationWarnings)
}
```

Draft input skips publication validation. One bad locale downgrades the whole article but does not throw or prevent child rows from syncing.

- [ ] **Step 6: Fix idempotent skipping for policy-driven publication changes**

Select `published_at` with the existing article row and change the early return to:

```ts
if (
  existing &&
  existing.source_hash === article.source_hash &&
  existing.published_at === article.published_at &&
  !existing.deleted_at
) {
  return { skipped: true }
}
```

Add unit cases proving same hash + published-to-draft does not skip, while same hash + same draft state still skips.

- [ ] **Step 7: Assert structured warning and mixed-batch behavior**

Update transform and sync tests to assert warning objects include article slug, locale/path where relevant, and exact `code`. Add one backfill/sync test where an invalid article returns `{ ok: true, skipped: false, warnings }` and the next valid article still processes.

- [ ] **Step 8: Run sync verification**

Run:

```powershell
pnpm --filter @kinnso/sync test
pnpm --filter @kinnso/sync typecheck
```

Expected: all sync tests PASS; only the existing environment-gated integration test may remain skipped.

- [ ] **Step 9: Commit article publication honesty**

```powershell
git add packages/sync
git commit -m "feat(sync): downgrade dishonest articles to draft"
```

### Task 7: Production Cleanup, Honest Local Seed, and Permanent Source Lint

**Files:**

- Create via CLI: `supabase/migrations/*_r7_3_honesty_cleanup.sql`
- Create: `scripts/honesty-lint.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `supabase/seed.sql`
- Delete: `apps/web/lib/missions/fixtures.ts`
- Create: `apps/web/tests/fixtures/missionDraft.ts`
- Modify: `apps/web/tests/mission.actions.test.ts`
- Modify: all seven `apps/web/lib/i18n/messages/*.ts` files.
- Modify: article integration tests and `apps/e2e/fixtures.ts` that assumed thin fixtures were public.

**Interfaces:**

- Produces root command: `pnpm honesty:lint`.
- Cleanup targets exact audited UUID/slug pairs and remains harmless when rows are absent or already cleaned.
- Local seed publishes only a threshold-compliant `ramen-guide` with explicit `kinnso-editorial` attribution.

- [ ] **Step 1: Generate the cleanup migration filename**

Run: `pnpm exec supabase migration new r7_3_honesty_cleanup`

Expected: one new file ending `_r7_3_honesty_cleanup.sql`, ordered after Task 2's migration.

- [ ] **Step 2: Write the honesty scanner first**

Scan UTF-8 text files under `apps/web/app`, `apps/web/components`, and `apps/web/lib`, plus `supabase/seed.sql` and non-test source files whose basename contains `fixture`. Exclude `apps/web/tests`, `node_modules`, `.next`, generated types, and the lint script itself.

```ts
const FORBIDDEN = [
  'picsum.photos',
  'example.com',
  'maps.example',
  'Jane Doe',
  'lorem ipsum',
] as const
```

Print `relative/path:line: token` for each match and exit 1 when any match exists. Add to root `package.json`:

```json
"honesty:lint": "tsx scripts/honesty-lint.ts"
```

Add root `tsx` at the already locked workspace version and insert `pnpm honesty:lint` in CI after `pnpm lint` and before Supabase startup.

- [ ] **Step 3: Run lint and verify it catches current offenders**

Run: `pnpm honesty:lint`

Expected: FAIL and report at least `supabase/seed.sql`, `apps/web/lib/missions/fixtures.ts`, and the seven locale message files.

- [ ] **Step 4: Implement narrow production cleanup SQL**

Clear demo guide covers by host and null the four exact merchant rows only while still invalid. Unpublish these exact article UUID/slug pairs:

```sql
values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'pub-article'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ramen-guide'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'sushi-guide'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'cafe-guide'),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'mall-coupon'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'expired-article')
```

Use an `UPDATE ... FROM (VALUES ...) target(id, slug)` with both id and slug predicates, `published_at is not null`, and set `published_at = null`. Remove `jane-doe` from article author arrays, delete the exact Jane Doe author row after it has no references, and remove the audited `maps.example` address link from the ramen translation JSON. Do not attach editorial ownership to production rows whose `source` is null.

Merchant cleanup uses these exact IDs plus the shared-policy-equivalent invalid check:

```sql
where id = any(array[
  'c1219eec-8da0-d78d-7335-f2785d31187e'::uuid,
  '02425dc3-b5c6-4b10-c9cb-fab2118ad58b'::uuid,
  '04534d55-16f8-95ba-b50e-976fd12a630c'::uuid,
  '14e65377-ea50-7c58-fd26-bae99d221caa'::uuid
])
and website_url is not null
and (website_url !~* '^https://' or website_url ~* '^https://[^/]*(^|\.)example\.[^/]+');
```

- [ ] **Step 5: Make the local seed honest without changing frozen identifiers**

Keep all existing article IDs, slugs, URLs, redirect rows, and categories. Set `published_at = null` for `pub-article`, `sushi-guide`, `cafe-guide`, `mall-coupon`, and `expired-article`. Keep only local `ramen-guide` published and replace both translations with at least three non-empty JSON blocks and at least 160 `Intl.Segmenter` words each. Use deterministic SQL `repeat(...)` content, remove the reserved map link, and set `authors = '{kinnso-editorial}'`.

Replace the seed author insert with the same explicit editorial identity; never recreate `jane-doe`. Leave the production cleanup behavior separate because migrations run before `seed.sql` on local reset.

- [ ] **Step 6: Remove shipped fixture/token offenders**

Move `missionDraftFixture` into `apps/web/tests/fixtures/missionDraft.ts`, update its test import, and use `https://merchant.test/staycation` in the test-only fixture. Replace all seven `guestEmailPlaceholder` values with `traveller@email.test`. Remove `maps.example`, Jane Doe, and any broad `example.com` literal from `supabase/seed.sql`.

Update integration assertions that assumed every thin fixture was public:

- Article queries, RLS, RPC, search, sitemap, and detail tests use the compliant local `ramen-guide` where a public article is required.
- Tests for `pub-article`, sushi, cafe, coupon, and expired article assert absence/404 unless they are pure URL-format unit tests with no database dependency.
- `apps/e2e/fixtures.ts` keeps frozen path strings for redirect/negative tests but removes public coupon and “you may like sushi” expectations.

- [ ] **Step 7: Reset locally and run lint/database regressions**

Run:

```powershell
pnpm exec supabase db reset
pnpm honesty:lint
pnpm --filter web test -- articles queries.detail search.rpc rls rpc sitemap redirects mission.actions db.r7-3-production-honesty
pnpm --filter web typecheck
```

Expected: all PASS; honesty lint prints no findings.

- [ ] **Step 8: Commit cleanup and permanent lint**

```powershell
git add supabase/migrations supabase/seed.sql scripts package.json pnpm-lock.yaml .github/workflows/ci.yml apps/web/lib apps/web/tests apps/e2e/fixtures.ts
git commit -m "fix(data): remove dishonest production fixtures"
```

### Task 8: Rendered Honesty Smoke

**Files:**

- Create: `apps/e2e/specs/honesty.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes seeded routes: `/en`, `/en/explore`, `/en/articles`, `/en/c/r7-smoke-creator`, `/en/m/r7-smoke-tokyo-host`.
- Asserts HTTP 200 and absence of the five forbidden tokens from rendered HTML.

- [ ] **Step 1: Write the smoke test**

```ts
import { expect, test } from '@playwright/test'

const forbidden = ['picsum.photos', 'example.com', 'maps.example', 'jane doe', 'lorem ipsum']
const routes = [
  '/en',
  '/en/explore',
  '/en/articles',
  '/en/c/r7-smoke-creator',
  '/en/m/r7-smoke-tokyo-host',
]

for (const route of routes) {
  test(`honest rendered HTML: ${route}`, async ({ page }) => {
    const response = await page.goto(route)
    expect(response?.status()).toBe(200)
    const html = (await page.content()).toLowerCase()
    for (const token of forbidden) expect(html).not.toContain(token)
  })
}
```

Add one assertion that a known missing-media entity renders `[data-media-placeholder="true"]`, and one that the seeded CDN-backed guide renders an optimized image.

- [ ] **Step 2: Add the smoke to CI**

Change the PR smoke command to:

```yaml
run: pnpm --filter @kinnso/e2e e2e creator-onboarding funnel-smoke honesty notfound
```

- [ ] **Step 3: Run the smoke locally**

With Supabase, scan worker, and web app running as CI does:

```powershell
$env:E2E_BASE_URL='http://localhost:3000'
$env:BOOKING_LIVE='false'
pnpm --filter @kinnso/e2e e2e honesty
```

Expected: 5 route tests PASS; no forbidden token appears in page HTML.

- [ ] **Step 4: Commit rendered regression coverage**

```powershell
git add apps/e2e/specs/honesty.spec.ts .github/workflows/ci.yml
git commit -m "test(e2e): enforce honest public HTML"
```

### Task 9: Full Verification, Production Preflight Evidence, and Draft PR

**Files:**

- Modify: `docs/superpowers/plans/2026-07-17-phase-r7-3-production-data-honesty.md` only to check completed boxes during execution.
- No production database writes.

**Interfaces:**

- Produces a draft PR that lists six unpublished article slugs, 10 cleared covers, four cleared merchant links, and the migration/deployment blocker.
- Does not merge, apply production migrations, or deploy.

- [ ] **Step 1: Verify migration immutability and scope**

Run:

```powershell
git diff --name-only origin/main...HEAD -- supabase/migrations
git diff --check
git status --short
```

Expected: exactly the two new R7.3 migration files are listed; no shipped migration is modified; working tree contains no `.env*` files.

- [ ] **Step 2: Run the complete local quality gate**

Run:

```powershell
pnpm exec supabase db reset
pnpm honesty:lint
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all commands PASS. Record unrelated baseline failures separately and do not weaken R7.3 checks to accommodate them.

- [ ] **Step 3: Run the complete local browser gate**

Start the local scan worker and web app using the same environment flow as `.github/workflows/ci.yml`, then run:

```powershell
$env:E2E_BASE_URL='http://localhost:3000'
$env:BOOKING_LIVE='false'
pnpm --filter @kinnso/e2e e2e creator-onboarding funnel-smoke honesty notfound
```

Expected: all selected journeys PASS.

- [ ] **Step 4: Re-run the production preflight read-only query**

Use Supabase read-only `SELECT` statements to record current counts immediately before PR handoff:

```sql
select count(*) from public.guides where cover_url ilike '%picsum.photos%';
select count(*), coalesce(sum(saves_count), 0) from public.guides;
select count(*) from public.guide_saves;
select slug, published_at from public.articles
where id = any(array[
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  '00000000-0000-0000-0000-0000000000a3'::uuid,
  '00000000-0000-0000-0000-0000000000a4'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid
]);
select id, slug, website_url from public.merchant_profiles where website_url is not null;
```

Expected at the audited snapshot: 10 demo covers, 0 save rows, six targeted published article rows, and four invalid merchant URLs. Any drift must be reflected in PR evidence and reviewed before migration application; do not broaden cleanup predicates silently.

- [ ] **Step 5: Review the complete diff against the spec**

Invoke `superpowers:requesting-code-review`, address findings with `superpowers:receiving-code-review`, and repeat affected verification. Confirm:

- Directory and sitemap share eligibility; direct creator pages remain broader.
- Owner direct `is_listed` writes fail; audited ops RPC succeeds.
- Guide save actions remain while numeric guide proof is absent.
- Invalid article publication becomes draft without aborting sync.
- No public entity media leaks an unapproved URL.
- Honesty lint and rendered smoke use the authoritative five-token set.

- [ ] **Step 6: Push and open a draft PR**

Push `codex/r7-3-production-honesty` and open one draft PR for R7.3. The PR body must include:

- Production preflight counts and the six article slugs.
- Both generated migration filenames in order.
- Exact verification commands/results.
- A bold blocker: “Do not merge/deploy until an authorized operator applies both migrations and writable Preview smoke passes.”
- No production secrets, keys, or raw user data.

- [ ] **Step 7: Stop at the migration gate**

Do not apply either migration, make the PR ready, squash-merge, or deploy. Resume only after the user explicitly authorizes the production migration operation; then verify post-migration counts and writable Preview save/unsave, listing RPC/audit, article downgrade, media fallback, and merchant-link behavior before completing the branch.
