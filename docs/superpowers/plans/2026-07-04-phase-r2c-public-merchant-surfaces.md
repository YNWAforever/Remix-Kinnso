# Phase R2C — Public Merchant Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/merchants` from the R2B dashboard hub into a real public merchant
directory, and ship `/m/[slug]` (merchant public profile) and `/experiences/[slug]`
(experience detail with an honest "booking opens soon" state) — closing the R2 program's
public-surface gap (design spec §D-R2-6) with full SEO (metadata, JSON-LD, OG cards,
sitemap) and no fake booking affordance.

**Architecture:** Pure app-layer phase — **no new migration**. `merchant_public_profiles`
(PII-safe view) and `experiences` (public-read RLS on published rows of active merchants)
already exist and are live from R2B. Two new public query modules
(`lib/merchants/public-queries.ts`, `lib/experiences/public-queries.ts`) mirror the
existing `lib/creators/queries.ts`/`lib/guides/queries.ts` exactly: anon
`createSupabasePublicClient()`, a shared "listable" predicate feeding both the page and
the sitemap so indexed pages never 404. Two new page pairs (`/m/[slug]`,
`/experiences/[slug]`) mirror `/c/[handle]` and `/g/[slug]` respectively — same
`generateStaticParams`/`generateMetadata`/JSON-LD/OG-image shape, same design-system
primitives. `/experiences/[slug]` gets breadcrumb JSON-LD only — no Product/Offer schema,
per the locked D-R2-6 decision (never claim bookability before it's real).

**Tech Stack:** Next.js 16 App Router (Server Components, `next/og` `ImageResponse`),
Supabase Postgres (existing RLS/view — read-only from here), TypeScript, Vitest,
Tailwind v4 (`kinnso-*`/`k2-*` public tokens).

---

## Ground truth this plan relies on (verified 2026-07-04, post-R2A+R2B)

- Repo clone: `/private/tmp/claude-947366395/-Users-willylai-Documents-Claude-Projects-Remix-Kinnso2/2650fdcf-67be-48d5-b3c7-b8f8887011af/scratchpad/Remix-Kinnso`, branch `feat/revision-r2c` (cut from `feat/revision-r2b` tip `438c233` — PR #67 merged, PR #68 open/green but not yet merged; rebase onto `origin/main` once both land).
- Design spec: `docs/superpowers/specs/2026-07-03-phase-r2-merchant-supply-design.md` §D-R2-6 (public surfaces), §D-R2-7 (R2C scope: "public `/merchants` directory rewrite, `/m/[slug]`, `/experiences/[slug]`, metadata/JSON-LD/OG builders, sitemap sections, nav/footer IA, `merchantsLanding`-era dead-key cleanup, **th.ts `seo.merchants` translation fix folded in**").
- **Live DB (unchanged by this phase, read-only):** `merchant_public_profiles` view — columns `id, slug, company_name, tagline, city, logo_url, website_url, created_at`; `RLS`: `grant select ... to anon, authenticated` (no base-table anon policy — PII stays unreachable). `experiences` table — `experiences_public_read` policy allows anon `select` where `status='published' and` the owning merchant is `status='active'`. **Currently 0 experiences exist live** (verified in R2B) — the directory/profile/detail pages must render honest empty states, not placeholder content.
- **`MerchantsLandingView.tsx` is used by exactly one route** (`app/[locale]/merchants/page.tsx`) — confirmed via grep, safe to fully replace. Its `merchantsLanding` i18n group (13 keys: `heroPill, hubTitle, hubSub, cardsHeading, cardPostTitle/Body, cardCreatorsTitle/Body, cardMissionsTitle/Body, cardOpen, newHereNote, newHereCta`) is entirely dashboard-hub-toned ("Your missions...", "Your merchant tools") and does not fit a public directory — retire the whole group.
- **Nav gap confirmed:** `Navbar.tsx`'s `baseAnchors` has 6 items (Explore, Destinations, Articles, Sessions, Agent, Creators) — **"Merchants" is missing**, though the master IA (spec §4) requires it. Adding it will make `kinnso.Navbar.test.tsx`'s hardcoded `expected` array (lines ~22-31) fail until updated — that test is scoped, not auto-discovering.
- `kinnso.route-parity.test.tsx` only walks `Navbar`/`Footer`/`HomeView` (not other components) — will auto-verify a new `/merchants` nav link once the route exists; no code change needed there.
- `Footer.tsx`'s Merchants column currently has exactly 2 links: `[t.lPostMission, "/merchants/dashboard/post"]`, `[t.lPricing, "/for-merchants"]` (keys `lPostMission`, `lPricing` inside `footer: { colMerchants: string; lPostMission: string; lPricing: string; ... }`).
- **Template pages (verified verbatim this session):** `/c/[handle]/page.tsx` (generateStaticParams → `LOCALES.map`, generateMetadata → `buildCreatorMetadata`, JSON-LD → `creatorProfileJsonLd` + `breadcrumbJsonLd`, delegates render to `<CreatorProfileView>`) and `/g/[slug]/page.tsx` (generateStaticParams → `[]`, generateMetadata → `buildGuideMetadata`, JSON-LD → `articleJsonLd` + `breadcrumbJsonLd`, breadcrumb middle crumb reuses `messages.seo.explore.title` — **not** a dedicated breadcrumb key). Both import `{ JsonLd }` from `@/components/JsonLd` and render `<JsonLd data={ld} />`.
- **OG infra (verified verbatim):** `lib/seo/og/card.tsx` exports `OG` palette, `OG_SIZE = {width:1200,height:630}`, `DefaultCard`, `GuideCard`, `CreatorCard`, private `Frame`. `lib/seo/og/data.ts` exports `truncate(s,max)`, `pickNiches(niches,max=3)`, `safeImageUrl` (SSRF-hardened), `loadRemoteImage` (fetch+base64, 3s timeout, 5MB cap). `lib/seo/og/fonts.ts` exports `loadOgFonts(): Promise<OgFont[]>` (returns `[]` if not found — callers must omit the `fonts` option, not crash).
- **SEO builders (verified verbatim):** `lib/seo/metadata.ts` exports `buildCreatorMetadata(i:{handle,locale,name,bio})`, `buildGuideMetadata(i:{slug,locale,title,description})`, `noindexMetadata`, `SITE_URL`, `OG_LOCALE`. `lib/seo/jsonld.ts` exports `creatorProfileJsonLd`, `articleJsonLd`, `breadcrumbJsonLd(items)`.
- **Sitemap (verified verbatim):** `app/sitemap.ts` — `SITEMAP_CHUNK=40000`; the guides/creators loops both: fetch `{slug|handle, lastmod}[]` from a sitemap query, loop `LOCALES`, push `{url, lastModified, changeFrequency:'weekly', priority}` (guides `0.7`, creators `0.6`). `generateSitemaps()`/`sitemap({id})` shard the combined list.
- `lib/creators/queries.ts`'s `fetchListableCreators` is the shared-predicate pattern (`status='active' AND handle NOT NULL AND public_profile NOT NULL`, ordered `created_at desc, handle`) that both the directory query and the sitemap query call — **prevents sitemap-then-404 drift**. Mirror this shape for merchants/experiences.
- `getPublishedTestimonials(locale, role?)` (`lib/home/queries.ts`) — role-filtered, `limit(3)`, already used by `ForMerchantsView`/`ForCreatorsView` with `role:'merchant'`/`'creator'`. **Not reused here** — the directory page is about merchants, not testimonials about them; no change needed.
- `ForMerchantsView.tsx` is the style template for editorial merchant-facing copy (`SectionShell`/`Eyebrow`/`EditorialCard`, `k2-display`, `k2-btn-primary`/`k2-btn-ghost`, `kinnso-cream`/`kinnso-ink`/`kinnso-orange` tokens).
- **th.ts carry-forward confirmed live**: `seo.merchants.title`/`description` and `seo.terms.title`/`description` are literal untranslated English strings in `th.ts` — fix as part of this phase's i18n task (R2C explicitly promised this fold-in).
- Vitest: `cd apps/web && npx vitest run <files>` only, never the full suite. `i18n.locale-parity.test.ts` auto-derives groups from `Object.keys(en)`. Existing `tests/jsonld.test.ts` is the precedent for unit-testing new JSON-LD builder functions.

## File map

| Path | Change |
|---|---|
| `apps/web/lib/merchants/public-queries.ts` | Create |
| `apps/web/lib/experiences/public-queries.ts` | Create |
| `apps/web/lib/seo/metadata.ts` | Modify (add `buildMerchantMetadata`, `buildExperienceMetadata`) |
| `apps/web/lib/seo/jsonld.ts` | Modify (add `merchantProfileJsonLd`) |
| `apps/web/lib/seo/og/card.tsx` | Modify (add `MerchantCard`, `ExperienceCard`) |
| `apps/web/app/sitemap.ts` | Modify (merchants + experiences sections) |
| `apps/web/components/kinnso/pages/MerchantsLandingView.tsx` | Delete |
| `apps/web/components/kinnso/pages/MerchantsDirectoryView.tsx` | Create |
| `apps/web/app/[locale]/merchants/page.tsx` | Modify (new view + query + metadata) |
| `apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx` | Create |
| `apps/web/app/[locale]/m/[slug]/page.tsx` | Create |
| `apps/web/app/[locale]/m/[slug]/opengraph-image.tsx` | Create |
| `apps/web/components/kinnso/pages/ExperiencePublicView.tsx` | Create |
| `apps/web/app/[locale]/experiences/[slug]/page.tsx` | Create |
| `apps/web/app/[locale]/experiences/[slug]/opengraph-image.tsx` | Create |
| `apps/web/components/kinnso/Navbar.tsx` | Modify (add Merchants base nav item) |
| `apps/web/components/kinnso/Footer.tsx` | Modify (add directory link) |
| `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Modify (retire `merchantsLanding`, add `merchantsDirectory`/`merchantProfile`/`experiencePublic`, `nav.linkMerchants`, `footer.lDirectory`; retitle+translate `seo.merchants`; fix `th.ts seo.terms`) |
| `apps/web/tests/kinnso.MerchantsLandingView.test.tsx` | Delete |
| `apps/web/tests/merchants.directory.host.test.tsx` | Create |
| `apps/web/tests/merchants.public-queries.test.ts` | Create |
| `apps/web/tests/experiences.public-queries.test.ts` | Create |
| `apps/web/tests/merchants.public-profile.host.test.tsx` | Create |
| `apps/web/tests/experiences.public-detail.host.test.tsx` | Create |
| `apps/web/tests/jsonld.test.ts` | Modify (add `merchantProfileJsonLd` cases) |
| `apps/web/tests/sitemap.test.ts` | Modify (merchants + experiences sections) |
| `apps/web/tests/kinnso.Navbar.test.tsx` | Modify (expected base-anchor array) |

---

### Task 1: Public query modules — merchants and experiences

**Files:**
- Create: `apps/web/lib/merchants/public-queries.ts`
- Create: `apps/web/lib/experiences/public-queries.ts`
- Test: `apps/web/tests/merchants.public-queries.test.ts`
- Test: `apps/web/tests/experiences.public-queries.test.ts`

- [ ] **Step 1: Write the failing test for merchant public queries**

```typescript
// apps/web/tests/merchants.public-queries.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const orderMock = vi.fn()
const eqMock = vi.fn(() => ({ order: orderMock, maybeSingle: vi.fn() }))
const selectMock = vi.fn(() => ({ eq: eqMock, order: orderMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: fromMock }),
}))

import { getPublicMerchants, getMerchantBySlug, getMerchantsForSitemap } from '@/lib/merchants/public-queries'

describe('getPublicMerchants', () => {
  it('reads from merchant_public_profiles ordered newest-first, slug tiebreak', async () => {
    const order2 = vi.fn(() => Promise.resolve({
      data: [{ id: 'm1', slug: 'acme-travel', company_name: 'Acme Travel', tagline: 'Boutique tours', city: 'Hong Kong', logo_url: null, website_url: null, created_at: '2026-07-01T00:00:00Z' }],
      error: null,
    }))
    const order1 = vi.fn(() => ({ order: order2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ order: order1 })) })

    const rows = await getPublicMerchants()
    expect(fromMock).toHaveBeenCalledWith('merchant_public_profiles')
    expect(rows).toEqual([{
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: null, websiteUrl: null,
    }])
  })

  it('returns [] when there are no merchants yet (honest empty state)', async () => {
    const order2 = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const order1 = vi.fn(() => ({ order: order2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ order: order1 })) })
    expect(await getPublicMerchants()).toEqual([])
  })
})

describe('getMerchantBySlug', () => {
  it('returns null for an unknown slug', async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })
    expect(await getMerchantBySlug('nope')).toBeNull()
  })

  it('maps a found row to camelCase', async () => {
    const row = { id: 'm1', slug: 'acme-travel', company_name: 'Acme Travel', tagline: 'Boutique tours', city: 'Hong Kong', logo_url: 'https://x/y.png', website_url: 'https://acme.example', created_at: '2026-07-01T00:00:00Z' }
    const maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })
    const result = await getMerchantBySlug('acme-travel')
    expect(result).toEqual({
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: 'https://x/y.png', websiteUrl: 'https://acme.example',
    })
  })
})

describe('getMerchantsForSitemap', () => {
  it('returns slug + lastmod pairs', async () => {
    const order2 = vi.fn(() => Promise.resolve({
      data: [{ slug: 'acme-travel', created_at: '2026-07-01T00:00:00Z' }], error: null,
    }))
    const order1 = vi.fn(() => ({ order: order2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ order: order1 })) })
    expect(await getMerchantsForSitemap()).toEqual([{ slug: 'acme-travel', lastmod: '2026-07-01T00:00:00Z' }])
  })
})
```

Run: `cd apps/web && npx vitest run tests/merchants.public-queries.test.ts` — expect FAIL (module not found).

- [ ] **Step 2: Write the merchant public queries module**

```typescript
// apps/web/lib/merchants/public-queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export type PublicMerchant = {
  id: string
  slug: string
  companyName: string
  tagline: string | null
  city: string | null
  logoUrl: string | null
  websiteUrl: string | null
}

type Row = {
  id: string; slug: string; company_name: string; tagline: string | null
  city: string | null; logo_url: string | null; website_url: string | null; created_at: string
}

function toDomain(r: Row): PublicMerchant {
  return {
    id: r.id, slug: r.slug, companyName: r.company_name, tagline: r.tagline,
    city: r.city, logoUrl: r.logo_url, websiteUrl: r.website_url,
  }
}

const COLUMNS = 'id, slug, company_name, tagline, city, logo_url, website_url, created_at'

/**
 * The whole public directory. merchant_public_profiles already filters to
 * status='active' AND slug IS NOT NULL (view definition) — every row here is
 * listable, no extra predicate needed. Ordered newest-first, slug as a stable
 * tie-break (mirrors getPublicCreators).
 */
export async function getPublicMerchants(): Promise<PublicMerchant[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('merchant_public_profiles')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('slug', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => toDomain(r as unknown as Row))
}

export async function getMerchantBySlug(slug: string): Promise<PublicMerchant | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('merchant_public_profiles')
    .select(COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return toDomain(data as unknown as Row)
}

/** Sitemap feed — reuses the same view, so sitemap ⊆ live pages by construction. */
export async function getMerchantsForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('merchant_public_profiles')
    .select('slug, created_at')
    .order('created_at', { ascending: false })
    .order('slug', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({ slug: r.slug as string, lastmod: (r.created_at as string | null) ?? null }))
}
```

Run — expect PASS (4 tests).

- [ ] **Step 3: Write the failing test for experience public queries**

```typescript
// apps/web/tests/experiences.public-queries.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: fromMock }),
}))

import { getExperienceBySlug, getExperiencesForSitemap } from '@/lib/experiences/public-queries'

beforeEach(() => { fromMock.mockReset() })

describe('getExperienceBySlug', () => {
  it('returns null when the experience is missing or not published (RLS)', async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })
    expect(await getExperienceBySlug('nope')).toBeNull()
  })

  it('joins the owning merchant via the public view (two-query, not an embed)', async () => {
    const expRow = {
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', price_amount: 480, currency: 'HKD',
      duration_minutes: 120, cover_url: 'https://x/y.jpg', merchant_profile_id: 'm1',
      published_at: '2026-07-01T00:00:00Z',
    }
    const merchantRow = { id: 'm1', slug: 'acme-travel', company_name: 'Acme Travel' }
    const expMaybeSingle = vi.fn(() => Promise.resolve({ data: expRow, error: null }))
    const merchantMaybeSingle = vi.fn(() => Promise.resolve({ data: merchantRow, error: null }))
    fromMock
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: expMaybeSingle })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: merchantMaybeSingle })) })) })

    const result = await getExperienceBySlug('sunset-tour')
    expect(fromMock).toHaveBeenNthCalledWith(1, 'experiences')
    expect(fromMock).toHaveBeenNthCalledWith(2, 'merchant_public_profiles')
    expect(result).toEqual({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: 'https://x/y.jpg', publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
  })

  it('returns null if the owning merchant is missing from the public view (defensive)', async () => {
    const expRow = { id: 'e1', slug: 's', title: 'T', summary: null, description: null, city: 'HK', price_amount: 1, currency: 'HKD', duration_minutes: null, cover_url: null, merchant_profile_id: 'm1', published_at: null }
    const expMaybeSingle = vi.fn(() => Promise.resolve({ data: expRow, error: null }))
    const merchantMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: expMaybeSingle })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: merchantMaybeSingle })) })) })
    expect(await getExperienceBySlug('s')).toBeNull()
  })
})

describe('getExperiencesForSitemap', () => {
  it('returns slug + lastmod pairs for published experiences', async () => {
    const order = vi.fn(() => Promise.resolve({ data: [{ slug: 'sunset-tour', published_at: '2026-07-01T00:00:00Z' }], error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })
    expect(await getExperiencesForSitemap()).toEqual([{ slug: 'sunset-tour', lastmod: '2026-07-01T00:00:00Z' }])
  })
})
```

Run: `cd apps/web && npx vitest run tests/experiences.public-queries.test.ts` — expect FAIL (module not found).

- [ ] **Step 4: Write the experience public queries module**

```typescript
// apps/web/lib/experiences/public-queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export type PublicExperience = {
  id: string
  slug: string
  title: string
  summary: string | null
  description: string | null
  city: string
  priceAmount: number
  currency: string
  durationMinutes: number | null
  coverUrl: string | null
  publishedAt: string | null
  merchant: { slug: string; companyName: string }
}

/**
 * Anon has NO read grant on merchant_profiles (PII table) — attribution must go
 * through the PII-safe merchant_public_profiles view, in a SEPARATE query. Do not
 * attempt a PostgREST embed (`experiences.select('*, merchant_profiles(...)')`) here;
 * it would either fail under RLS or, if it somehow succeeded, leak contact fields.
 */
export async function getExperienceBySlug(slug: string): Promise<PublicExperience | null> {
  const supabase = createSupabasePublicClient()
  const { data: exp, error: expError } = await supabase
    .from('experiences')
    .select('id, slug, title, summary, description, city, price_amount, currency, duration_minutes, cover_url, merchant_profile_id, published_at')
    .eq('slug', slug)
    .maybeSingle()
  if (expError) throw expError
  if (!exp) return null

  const { data: merchant, error: merchantError } = await supabase
    .from('merchant_public_profiles')
    .select('slug, company_name')
    .eq('id', exp.merchant_profile_id as string)
    .maybeSingle()
  if (merchantError) throw merchantError
  if (!merchant) return null

  return {
    id: exp.id as string,
    slug: exp.slug as string,
    title: exp.title as string,
    summary: exp.summary as string | null,
    description: exp.description as string | null,
    city: exp.city as string,
    priceAmount: Number(exp.price_amount),
    currency: exp.currency as string,
    durationMinutes: exp.duration_minutes as number | null,
    coverUrl: exp.cover_url as string | null,
    publishedAt: exp.published_at as string | null,
    merchant: { slug: merchant.slug as string, companyName: merchant.company_name as string },
  }
}

/** RLS already restricts to status='published' rows of active merchants — same filter here for clarity/index use. */
export async function getExperiencesForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('experiences')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ slug: r.slug as string, lastmod: (r.published_at as string | null) ?? null }))
}
```

Run — expect PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/merchants/public-queries.ts apps/web/lib/experiences/public-queries.ts apps/web/tests/merchants.public-queries.test.ts apps/web/tests/experiences.public-queries.test.ts
git commit -m "feat(web): public read queries for merchants and experiences

Mirrors lib/creators+guides/queries.ts exactly: anon public client,
shared listable predicate feeding both page and sitemap. Experience
attribution goes through the merchant_public_profiles view in a
separate query — anon has no read grant on merchant_profiles."
```

---

### Task 2: SEO builders — metadata, JSON-LD, OG cards

**Files:**
- Modify: `apps/web/lib/seo/metadata.ts`
- Modify: `apps/web/lib/seo/jsonld.ts`
- Modify: `apps/web/lib/seo/og/card.tsx`
- Modify: `apps/web/tests/jsonld.test.ts`

- [ ] **Step 1: Read `apps/web/tests/jsonld.test.ts` first** to see the exact existing test style for `creatorProfileJsonLd`/`articleJsonLd`, then add cases for the new `merchantProfileJsonLd` in the same style (one "full fields" case, one "optional fields omitted" case). Run it, confirm FAIL (function not exported yet).

- [ ] **Step 2: Add `merchantProfileJsonLd` to `apps/web/lib/seo/jsonld.ts`**

Add near `creatorProfileJsonLd`:

```typescript
export function merchantProfileJsonLd(i: {
  name: string
  url: string
  tagline: string | null
  city: string | null
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Organization',
      name: i.name,
      url: i.url,
      ...(i.tagline ? { description: i.tagline } : {}),
      ...(i.city ? { address: { '@type': 'PostalAddress', addressLocality: i.city } } : {}),
    },
  }
}
```

Run the jsonld test — expect PASS.

- [ ] **Step 3: Add `buildMerchantMetadata` and `buildExperienceMetadata` to `apps/web/lib/seo/metadata.ts`**

Add near `buildCreatorMetadata`/`buildGuideMetadata`:

```typescript
export function buildMerchantMetadata(i: {
  slug: string
  locale: Locale
  name: string
  tagline: string | null
}): Metadata {
  const canonical = `/m/${i.slug}`
  return {
    title: i.name,
    description: i.tagline ?? `${i.name} on KINNSO.`,
    ...hreflangFor((l) => `/${l}/m/${i.slug}`, i.locale, LOCALES),
    openGraph: {
      type: 'website',
      url: `${SITE_URL}${canonical}`,
      title: i.name,
      description: i.tagline ?? `${i.name} on KINNSO.`,
      siteName: 'KINNSO',
      locale: OG_LOCALE[i.locale],
      images: [defaultOgImagePath(i.locale)],
    },
    robots: { index: true, follow: true },
  }
}

export function buildExperienceMetadata(i: {
  slug: string
  locale: Locale
  title: string
  description: string
}): Metadata {
  const canonical = `/experiences/${i.slug}`
  return {
    title: i.title,
    description: i.description,
    ...hreflangFor((l) => `/${l}/experiences/${i.slug}`, i.locale, LOCALES),
    openGraph: {
      type: 'website',
      url: `${SITE_URL}${canonical}`,
      title: i.title,
      description: i.description,
      siteName: 'KINNSO',
      locale: OG_LOCALE[i.locale],
      images: [defaultOgImagePath(i.locale)],
    },
    twitter: { card: 'summary_large_image' },
    robots: { index: true, follow: true },
  }
}
```

If `hreflangFor`, `LOCALES`, `defaultOgImagePath`, or `OG_LOCALE` are not already in scope at the point you're editing (check the top of `metadata.ts` and `buildCreatorMetadata`'s own body for the exact helper it calls), match whatever `buildCreatorMetadata` actually uses — do not invent a different hreflang mechanism. Run `cd apps/web && npx tsc --noEmit` after this step; a signature mismatch here will surface immediately as a type error.

- [ ] **Step 4: Add `MerchantCard` and `ExperienceCard` to `apps/web/lib/seo/og/card.tsx`**

Add near `CreatorCard`/`GuideCard`:

```tsx
export function MerchantCard({ name, tagline, city }: { name: string; tagline: string | null; city: string | null }) {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{name}</div>
        {tagline ? <div style={{ fontSize: 34, color: OG.muted }}>{tagline}</div> : null}
        {city ? <div style={{ fontSize: 28, color: OG.muted }}>{city}</div> : null}
      </div>
    </Frame>
  )
}

export function ExperienceCard({ title, city, merchantName, cover }: { title: string; city: string; merchantName: string; cover?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: 'Bricolage', background: OG.ink, color: OG.cream }}>
      {cover ? <img src={cover} width={1200} height={360} style={{ objectFit: 'cover' }} /> : <div style={{ width: 1200, height: 360, background: OG.orange }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 56, flex: 1, justifyContent: 'center' }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 30, color: '#D9D2C7' }}>{`${city} · ${merchantName}`}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: OG.orange }}>KINNSO</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/seo/metadata.ts apps/web/lib/seo/jsonld.ts apps/web/lib/seo/og/card.tsx apps/web/tests/jsonld.test.ts
git commit -m "feat(web): SEO builders for merchant profile + experience pages

merchantProfileJsonLd (ProfilePage/Organization), buildMerchantMetadata,
buildExperienceMetadata (openGraph.type 'website' — a listing, not
editorial content), MerchantCard/ExperienceCard OG components."
```

---

### Task 3: i18n — retire `merchantsLanding`, add directory/profile/experience groups, nav + footer keys, th.ts fix

**Files:** all 7 `apps/web/lib/i18n/messages/*.ts`

- [ ] **Step 1: In `en.ts`, delete the `merchantsLanding` interface block and its object literal** (13 keys: `heroPill, hubTitle, hubSub, cardsHeading, cardPostTitle, cardPostBody, cardCreatorsTitle, cardCreatorsBody, cardMissionsTitle, cardMissionsBody, cardOpen, newHereNote, newHereCta`). Remove the `merchantsLanding: {...}` line from the `Messages` interface too.

- [ ] **Step 2: Add three new interfaces above `export interface Messages {`**

```typescript
export interface MerchantsDirectoryMessages {
  heading: string
  subtitle: string
  empty: string
  viewProfile: string
  newHereNote: string
  newHereCta: string
}

export interface MerchantProfileMessages {
  websiteLabel: string
  experiencesHeading: string
  experiencesEmpty: string
  workWithCreatorsNote: string
  workWithCreatorsCta: string
}

export interface ExperiencePublicMessages {
  hostedBy: string
  bookingSoonBadge: string
  bookingSoonNote: string
  priceLabel: string
  durationLabel: string
  minutesSuffix: string
  backToMerchant: string
}
```

Register all three in `Messages` (replacing the deleted `merchantsLanding` line):

```typescript
  merchantsDirectory: MerchantsDirectoryMessages
  merchantProfile: MerchantProfileMessages
  experiencePublic: ExperiencePublicMessages
```

Add `linkMerchants: string` to the existing `nav` interface block (find it via `grep -n "linkCreators: string" apps/web/lib/i18n/messages/en.ts` inside the `nav` group). Add `lDirectory: string` to the existing `footer` interface's `colMerchants`/`lPostMission`/`lPricing` line area (same line group as `lPostMission: string; lPricing: string`).

- [ ] **Step 3: Add the English object literals** (near where `merchantsLanding`'s old object literal was):

```typescript
  merchantsDirectory: {
    heading: 'Merchant directory',
    subtitle: 'The founding merchants building on KINNSO — more join every week.',
    empty: 'No merchants yet — check back soon.',
    viewProfile: 'View profile',
    newHereNote: 'Run a travel or lifestyle business? Reach travellers through creators they trust.',
    newHereCta: 'Why KINNSO for merchants',
  },
  merchantProfile: {
    websiteLabel: 'Website',
    experiencesHeading: 'Experiences',
    experiencesEmpty: 'No experiences published yet.',
    workWithCreatorsNote: 'Are you a creator? See how you can work with merchants like this one.',
    workWithCreatorsCta: 'For creators',
  },
  experiencePublic: {
    hostedBy: 'Hosted by',
    bookingSoonBadge: 'Booking opens soon',
    bookingSoonNote: "We're finishing direct booking for this experience. Check back soon.",
    priceLabel: 'From',
    durationLabel: 'Duration',
    minutesSuffix: 'min',
    backToMerchant: 'Back to',
  },
```

Update `nav`'s English object literal to add `linkMerchants: 'Merchants',` (next to `linkCreators`). Update `footer`'s English object literal to add `lDirectory: 'Directory',` (next to `lPostMission`/`lPricing`).

**Retitle `seo.merchants`** (find the `seo: { merchants: { title, description } }` object literal — this key already exists, driving the `/merchants` page's `<title>` via `buildPageMetadata`) from the old hub copy to directory copy:

```typescript
    merchants: { title: 'Merchant Directory', description: 'Discover the merchants and experiences building on KINNSO.' },
```

- [ ] **Step 4: Run the parity test to see it fail for the other 6 locales**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts` — expect FAIL (6 locales missing the new groups / still have the deleted one).

- [ ] **Step 5: Mirror the same structural changes in the other 6 locale files** — delete each file's `merchantsLanding` object literal, add `merchantsDirectory`/`merchantProfile`/`experiencePublic` (translated, same keys), add `linkMerchants` to `nav`, add `lDirectory` to `footer`, retitle `seo.merchants`. Below is the full translated content for each file (grep each file for its existing `merchantsLanding: {` block to find and delete it, and grep for `merchants: { title:` inside the `seo` group to retitle it — do not touch any other `seo.*` entry).

`zh-hk.ts`:
```typescript
  merchantsDirectory: {
    heading: '商戶目錄',
    subtitle: '喺 KINNSO 開店嘅初創商戶 — 每星期都有新商戶加入。',
    empty: '暫時未有商戶,請遲啲再嚟睇吓。',
    viewProfile: '睇檔案',
    newHereNote: '你做緊旅遊或者生活方式生意?透過值得信賴嘅創作者接觸旅客。',
    newHereCta: '點解揀 KINNSO 做商戶',
  },
  merchantProfile: {
    websiteLabel: '網站',
    experiencesHeading: '體驗',
    experiencesEmpty: '仲未有已發布嘅體驗。',
    workWithCreatorsNote: '你係創作者?睇吓點樣同呢類商戶合作。',
    workWithCreatorsCta: '創作者專區',
  },
  experiencePublic: {
    hostedBy: '主辦：',
    bookingSoonBadge: '預訂即將開放',
    bookingSoonNote: '我哋準備緊呢個體驗嘅直接預訂功能,請遲啲再嚟睇吓。',
    priceLabel: '起',
    durationLabel: '時長',
    minutesSuffix: '分鐘',
    backToMerchant: '返回',
  },
```
Add `linkMerchants: '商戶',` to `nav`, `lDirectory: '目錄',` to `footer`. Retitle `seo.merchants`:
```typescript
    merchants: { title: '商戶目錄', description: '喺 KINNSO 發掘商戶同體驗。' },
```

`zh-tw.ts`:
```typescript
  merchantsDirectory: {
    heading: '商家目錄',
    subtitle: '在 KINNSO 上經營的創始商家 — 每週都有新商家加入。',
    empty: '目前尚無商家,請稍後再來看看。',
    viewProfile: '查看檔案',
    newHereNote: '你經營旅遊或生活風格事業嗎?透過值得信賴的創作者接觸旅客。',
    newHereCta: '為什麼選擇 KINNSO',
  },
  merchantProfile: {
    websiteLabel: '網站',
    experiencesHeading: '體驗',
    experiencesEmpty: '尚無已發布的體驗。',
    workWithCreatorsNote: '你是創作者嗎?了解如何與這類商家合作。',
    workWithCreatorsCta: '創作者專區',
  },
  experiencePublic: {
    hostedBy: '主辦方：',
    bookingSoonBadge: '預訂即將開放',
    bookingSoonNote: '我們正在完成此體驗的直接預訂功能,請稍後再來看看。',
    priceLabel: '起',
    durationLabel: '時長',
    minutesSuffix: '分鐘',
    backToMerchant: '返回',
  },
```
Add `linkMerchants: '商家',` to `nav`, `lDirectory: '目錄',` to `footer`. Retitle `seo.merchants`:
```typescript
    merchants: { title: '商家目錄', description: '在 KINNSO 探索商家與體驗。' },
```

`zh-cn.ts`:
```typescript
  merchantsDirectory: {
    heading: '商家目录',
    subtitle: '在 KINNSO 上经营的创始商家 — 每周都有新商家加入。',
    empty: '目前尚无商家,请稍后再来看看。',
    viewProfile: '查看档案',
    newHereNote: '你经营旅游或生活方式业务吗?通过值得信赖的创作者接触旅客。',
    newHereCta: '为什么选择 KINNSO',
  },
  merchantProfile: {
    websiteLabel: '网站',
    experiencesHeading: '体验',
    experiencesEmpty: '尚无已发布的体验。',
    workWithCreatorsNote: '你是创作者吗?了解如何与这类商家合作。',
    workWithCreatorsCta: '创作者专区',
  },
  experiencePublic: {
    hostedBy: '主办方：',
    bookingSoonBadge: '预订即将开放',
    bookingSoonNote: '我们正在完成此体验的直接预订功能,请稍后再来看看。',
    priceLabel: '起',
    durationLabel: '时长',
    minutesSuffix: '分钟',
    backToMerchant: '返回',
  },
```
Add `linkMerchants: '商家',` to `nav`, `lDirectory: '目录',` to `footer`. Retitle `seo.merchants`:
```typescript
    merchants: { title: '商家目录', description: '在 KINNSO 探索商家与体验。' },
```

`ja.ts`:
```typescript
  merchantsDirectory: {
    heading: '加盟店ディレクトリ',
    subtitle: 'KINNSO で活動する創業期の加盟店 — 毎週新しい加盟店が加わっています。',
    empty: 'まだ加盟店がありません。またのちほどご確認ください。',
    viewProfile: 'プロフィールを見る',
    newHereNote: '旅行やライフスタイル関連のビジネスをしていますか?信頼されるクリエイターを通じて旅行者にアプローチできます。',
    newHereCta: 'KINNSO を選ぶ理由',
  },
  merchantProfile: {
    websiteLabel: 'ウェブサイト',
    experiencesHeading: '体験',
    experiencesEmpty: 'まだ公開された体験はありません。',
    workWithCreatorsNote: 'クリエイターの方へ:このような加盟店との連携方法をご覧ください。',
    workWithCreatorsCta: 'クリエイター向け情報',
  },
  experiencePublic: {
    hostedBy: '主催：',
    bookingSoonBadge: '予約は近日開始',
    bookingSoonNote: 'この体験の直接予約機能を準備中です。またのちほどご確認ください。',
    priceLabel: '〜',
    durationLabel: '所要時間',
    minutesSuffix: '分',
    backToMerchant: '戻る',
  },
```
Add `linkMerchants: '加盟店',` to `nav`, `lDirectory: 'ディレクトリ',` to `footer`. Retitle `seo.merchants`:
```typescript
    merchants: { title: '加盟店ディレクトリ', description: 'KINNSO の加盟店と体験を見つけましょう。' },
```

`ko.ts`:
```typescript
  merchantsDirectory: {
    heading: '가맹점 디렉토리',
    subtitle: 'KINNSO에서 활동하는 초기 가맹점입니다. 매주 새로운 가맹점이 합류하고 있습니다.',
    empty: '아직 가맹점이 없습니다. 나중에 다시 확인해 주세요.',
    viewProfile: '프로필 보기',
    newHereNote: '여행이나 라이프스타일 비즈니스를 운영하시나요? 신뢰받는 크리에이터를 통해 여행객에게 다가가세요.',
    newHereCta: 'KINNSO를 선택하는 이유',
  },
  merchantProfile: {
    websiteLabel: '웹사이트',
    experiencesHeading: '체험',
    experiencesEmpty: '아직 게시된 체험이 없습니다.',
    workWithCreatorsNote: '크리에이터이신가요? 이런 가맹점과 협업하는 방법을 확인해 보세요.',
    workWithCreatorsCta: '크리에이터 안내',
  },
  experiencePublic: {
    hostedBy: '주최:',
    bookingSoonBadge: '예약 곧 오픈',
    bookingSoonNote: '이 체험의 직접 예약 기능을 준비 중입니다. 나중에 다시 확인해 주세요.',
    priceLabel: '~부터',
    durationLabel: '소요 시간',
    minutesSuffix: '분',
    backToMerchant: '돌아가기',
  },
```
Add `linkMerchants: '가맹점',` to `nav`, `lDirectory: '디렉토리',` to `footer`. Retitle `seo.merchants`:
```typescript
    merchants: { title: '가맹점 디렉토리', description: 'KINNSO에서 가맹점과 체험을 둘러보세요.' },
```

`th.ts`:
```typescript
  merchantsDirectory: {
    heading: 'ไดเรกทอรีร้านค้า',
    subtitle: 'ร้านค้าผู้ก่อตั้งที่ดำเนินธุรกิจบน KINNSO — มีร้านค้าใหม่เข้าร่วมทุกสัปดาห์',
    empty: 'ยังไม่มีร้านค้า กรุณากลับมาดูใหม่ภายหลัง',
    viewProfile: 'ดูโปรไฟล์',
    newHereNote: 'คุณทำธุรกิจท่องเที่ยวหรือไลฟ์สไตล์อยู่หรือเปล่า? เข้าถึงนักท่องเที่ยวผ่านครีเอเตอร์ที่พวกเขาไว้วางใจ',
    newHereCta: 'ทำไมต้องเลือก KINNSO',
  },
  merchantProfile: {
    websiteLabel: 'เว็บไซต์',
    experiencesHeading: 'ประสบการณ์',
    experiencesEmpty: 'ยังไม่มีประสบการณ์ที่เผยแพร่',
    workWithCreatorsNote: 'คุณเป็นครีเอเตอร์หรือเปล่า? ดูวิธีการทำงานร่วมกับร้านค้าแบบนี้',
    workWithCreatorsCta: 'สำหรับครีเอเตอร์',
  },
  experiencePublic: {
    hostedBy: 'จัดโดย',
    bookingSoonBadge: 'ระบบจองเปิดเร็วๆ นี้',
    bookingSoonNote: 'เรากำลังเตรียมระบบจองโดยตรงสำหรับประสบการณ์นี้ กรุณากลับมาดูใหม่ภายหลัง',
    priceLabel: 'เริ่มต้น',
    durationLabel: 'ระยะเวลา',
    minutesSuffix: 'นาที',
    backToMerchant: 'กลับไปที่',
  },
```
Add `linkMerchants: 'ร้านค้า',` to `nav`, `lDirectory: 'ไดเรกทอรี',` to `footer`. Retitle `seo.merchants` (fixing the untranslated-English carry-forward at the same time):
```typescript
    merchants: { title: 'ไดเรกทอรีร้านค้า', description: 'ค้นพบร้านค้าและประสบการณ์บน KINNSO' },
```
**Also fix `th.ts`'s `seo.terms`** (same carry-forward category — currently literal English `{ title: 'Creator Terms', description: 'The terms that govern creators using KINNSO.' }`):
```typescript
    terms: { title: 'ข้อกำหนดสำหรับครีเอเตอร์', description: 'ข้อกำหนดที่ใช้ควบคุมครีเอเตอร์ที่ใช้งาน KINNSO' },
```

- [ ] **Step 6: Run parity + typecheck**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts` — expect PASS. Run: `cd apps/web && npx tsc --noEmit` — expect clean (the deleted `merchantsLanding` type will surface any leftover consumer as a compile error — if `MerchantsLandingView.tsx`/its page still exist at this point in task order, this WILL fail; that's expected and resolved by Task 5's deletion. If executing tasks in order, this typecheck is allowed to fail here — re-verify after Task 5 instead, or reorder to do Task 5 before finishing this step's commit if your workflow requires a clean state per task).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "i18n(web): retire merchantsLanding, add directory/profile/experience groups × 7 locales

Also retitles seo.merchants for the new directory purpose and fixes
the th.ts seo.merchants/seo.terms untranslated-English carry-forward."
```

---

### Task 4: `/merchants` — public directory

**Files:**
- Delete: `apps/web/components/kinnso/pages/MerchantsLandingView.tsx`
- Create: `apps/web/components/kinnso/pages/MerchantsDirectoryView.tsx`
- Modify: `apps/web/app/[locale]/merchants/page.tsx`
- Delete: `apps/web/tests/kinnso.MerchantsLandingView.test.tsx`
- Create: `apps/web/tests/merchants.directory.host.test.tsx`

- [ ] **Step 1: Delete the old view and its test**

```bash
git rm apps/web/components/kinnso/pages/MerchantsLandingView.tsx apps/web/tests/kinnso.MerchantsLandingView.test.tsx
```

- [ ] **Step 2: Write the failing host test**

```typescript
// apps/web/tests/merchants.directory.host.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
const getPublicMerchantsMock = vi.fn()
vi.mock('@/lib/merchants/public-queries', () => ({ getPublicMerchants: getPublicMerchantsMock }))

import MerchantsDirectoryPage from '@/app/[locale]/merchants/page'

afterEach(cleanup)

describe('MerchantsDirectoryPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })

  it('shows the honest empty state when there are no merchants', async () => {
    getPublicMerchantsMock.mockResolvedValue([])
    const el = await MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText(/No merchants yet/i)).toBeTruthy()
  })

  it('renders a merchant card linking to /m/[slug]', async () => {
    getPublicMerchantsMock.mockResolvedValue([{
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: null, websiteUrl: null,
    }])
    const el = await MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText('Acme Travel')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Acme Travel/i })
    expect(link.getAttribute('href')).toBe('/en/m/acme-travel')
  })
})
```

Run: `cd apps/web && npx vitest run tests/merchants.directory.host.test.tsx` — expect FAIL (imports point at the deleted view / page not yet updated).

- [ ] **Step 3: Write the directory view**

```tsx
// apps/web/components/kinnso/pages/MerchantsDirectoryView.tsx
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import type { PublicMerchant } from '@/lib/merchants/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function MerchantsDirectoryView({ locale, t, merchants }: {
  locale: Locale; t: Messages['merchantsDirectory']; merchants: PublicMerchant[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.heading}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-5xl">{t.heading}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
      </SectionShell>

      <SectionShell className="k2-hairline">
        {merchants.length === 0 ? (
          <p className="text-kinnso-muted">{t.empty}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {merchants.map((m) => (
              <Link key={m.id} href={p(`/m/${m.slug}`)} className="k2-card block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
                <h2 className="k2-display text-xl font-semibold text-kinnso-ink">{m.companyName}</h2>
                {m.tagline ? <p className="mt-2 text-sm text-kinnso-ink/70">{m.tagline}</p> : null}
                {m.city ? <p className="mt-1 text-xs text-kinnso-muted">{m.city}</p> : null}
                <span className="mt-4 block text-sm font-semibold text-kinnso-orangeDark">{t.viewProfile} →</span>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <p className="text-kinnso-ink/70">{t.newHereNote}</p>
        <Link href={p('/for-merchants')} className="mt-4 inline-block font-semibold text-kinnso-orangeDark hover:underline">{t.newHereCta}</Link>
      </SectionShell>
    </main>
  )
}

export default MerchantsDirectoryView
```

- [ ] **Step 4: Rewrite the route**

```tsx
// apps/web/app/[locale]/merchants/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { MerchantsDirectoryView } from '@/components/kinnso/pages/MerchantsDirectoryView'
import { getPublicMerchants } from '@/lib/merchants/public-queries'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/merchants', locale: locale as Locale, title: dict.seo.merchants.title, description: dict.seo.merchants.description })
}

export default async function MerchantsDirectoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const merchants = await getPublicMerchants()
  return <MerchantsDirectoryView locale={loc} t={messages.merchantsDirectory} merchants={merchants} />
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/merchants.directory.host.test.tsx tests/kinnso.route-parity.test.tsx` — expect PASS (route-parity confirms `/merchants` still resolves — it always did, this just swaps the view). `cd apps/web && npx tsc --noEmit` — expect clean (this is also where the Task 3 `merchantsLanding` type deletion gets fully resolved, since the only consumer is now gone).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): /merchants becomes the public merchant directory

Replaces the R2B dashboard-hub view (MerchantsLandingView, only ever
used by this one route) with a real directory backed by
merchant_public_profiles. Honest empty state, no fake merchant count."
```

---

### Task 5: `/m/[slug]` — public merchant profile

**Files:**
- Create: `apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx`
- Create: `apps/web/app/[locale]/m/[slug]/page.tsx`
- Create: `apps/web/app/[locale]/m/[slug]/opengraph-image.tsx`
- Test: `apps/web/tests/merchants.public-profile.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

```typescript
// apps/web/tests/merchants.public-profile.host.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
const getMerchantBySlugMock = vi.fn()
const listPublishedForMerchantMock = vi.fn()
vi.mock('@/lib/merchants/public-queries', () => ({ getMerchantBySlug: getMerchantBySlugMock }))
vi.mock('@/lib/experiences/public-queries', () => ({ listPublishedExperiencesForMerchant: listPublishedForMerchantMock }))

import MerchantPublicProfilePage from '@/app/[locale]/m/[slug]/page'

afterEach(cleanup)

describe('MerchantPublicProfilePage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'xx', slug: 'acme-travel' }) })).rejects.toThrow('notFound')
  })

  it('notFound for an unknown slug', async () => {
    getMerchantBySlugMock.mockResolvedValue(null)
    await expect(MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }) })).rejects.toThrow('notFound')
  })

  it('renders the merchant identity and an honest empty state with no experiences', async () => {
    getMerchantBySlugMock.mockResolvedValue({
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: null, websiteUrl: 'https://acme.example',
    })
    listPublishedForMerchantMock.mockResolvedValue([])
    const el = await MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'en', slug: 'acme-travel' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Travel' })).toBeTruthy()
    expect(screen.getByText(/No experiences published yet/i)).toBeTruthy()
    const website = screen.getByRole('link', { name: /Website/i })
    expect(website.getAttribute('href')).toBe('https://acme.example')
  })
})
```

Run — expect FAIL (page module not found).

- [ ] **Step 2: Extend `lib/experiences/public-queries.ts` with a merchant-scoped list function**

Add to the file created in Task 1:

```typescript
/** Published experiences for one merchant, for the /m/[slug] grid. RLS already scopes to published+active. */
export async function listPublishedExperiencesForMerchant(merchantId: string): Promise<PublicExperience[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('experiences')
    .select('id, slug, title, summary, description, city, price_amount, currency, duration_minutes, cover_url, merchant_profile_id, published_at')
    .eq('merchant_profile_id', merchantId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error
  // merchant is already known by the caller (it's who we're scoping to) — reuse the same
  // shape as getExperienceBySlug but skip the second query since we don't need it here;
  // callers that only need id/slug/title/city/price for a grid can ignore the placeholder merchant field.
  return (data ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: r.summary as string | null,
    description: r.description as string | null,
    city: r.city as string,
    priceAmount: Number(r.price_amount),
    currency: r.currency as string,
    durationMinutes: r.duration_minutes as number | null,
    coverUrl: r.cover_url as string | null,
    publishedAt: r.published_at as string | null,
    merchant: { slug: '', companyName: '' }, // caller already has the merchant; not re-fetched here
  }))
}
```

- [ ] **Step 3: Write the view**

```tsx
// apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import type { PublicMerchant } from '@/lib/merchants/public-queries'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function PublicMerchantProfileView({ locale, t, merchant, experiences }: {
  locale: Locale; t: Messages['merchantProfile']; merchant: PublicMerchant; experiences: PublicExperience[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        {merchant.city ? <Eyebrow>{merchant.city}</Eyebrow> : null}
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-5xl">{merchant.companyName}</h1>
        {merchant.tagline ? <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/70">{merchant.tagline}</p> : null}
        {merchant.websiteUrl ? (
          <Link href={merchant.websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block font-semibold text-kinnso-orangeDark hover:underline">
            {t.websiteLabel} →
          </Link>
        ) : null}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.experiencesHeading}</h2>
        {experiences.length === 0 ? (
          <p className="mt-4 text-kinnso-muted">{t.experiencesEmpty}</p>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {experiences.map((exp) => (
              <Link key={exp.id} href={p(`/experiences/${exp.slug}`)} className="k2-card block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
                <h3 className="k2-display text-lg font-semibold text-kinnso-ink">{exp.title}</h3>
                <p className="mt-2 text-sm text-kinnso-ink/70">{exp.city} · {exp.currency} {exp.priceAmount.toLocaleString()}</p>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <p className="text-kinnso-ink/70">{t.workWithCreatorsNote}</p>
        <Link href={p('/for-creators')} className="mt-4 inline-block font-semibold text-kinnso-orangeDark hover:underline">{t.workWithCreatorsCta}</Link>
      </SectionShell>
    </main>
  )
}

export default PublicMerchantProfileView
```

- [ ] **Step 4: Write the route**

```tsx
// apps/web/app/[locale]/m/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getMerchantBySlug } from '@/lib/merchants/public-queries'
import { listPublishedExperiencesForMerchant } from '@/lib/experiences/public-queries'
import { buildMerchantMetadata, SITE_URL } from '@/lib/seo/metadata'
import { merchantProfileJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { PublicMerchantProfileView } from '@/components/kinnso/pages/PublicMerchantProfileView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const merchant = await getMerchantBySlug(slug)
  if (!merchant) return { title: 'Merchant not found', robots: { index: false, follow: false } }
  return buildMerchantMetadata({ slug, locale: locale as Locale, name: merchant.companyName, tagline: merchant.tagline })
}

export default async function MerchantPublicProfilePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const merchant = await getMerchantBySlug(slug)
  if (!merchant) notFound()
  const experiences = await listPublishedExperiencesForMerchant(merchant.id)
  const canonical = `${SITE_URL}/${locale}/m/${slug}`
  const ld = [
    merchantProfileJsonLd({ name: merchant.companyName, url: canonical, tagline: merchant.tagline, city: merchant.city }),
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: merchant.companyName, url: canonical },
    ]),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <PublicMerchantProfileView locale={locale as Locale} t={messages.merchantProfile} merchant={merchant} experiences={experiences} />
    </>
  )
}
```

- [ ] **Step 5: Write the OG image route**

```tsx
// apps/web/app/[locale]/m/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'
import { getMerchantBySlug } from '@/lib/merchants/public-queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { MerchantCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'

export const alt = 'KINNSO merchant'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const fonts = await loadOgFonts()
  const fontOpt = fonts.length ? { fonts } : {}
  try {
    const merchant = await getMerchantBySlug(slug)
    const card = merchant
      ? <MerchantCard name={merchant.companyName} tagline={merchant.tagline} city={merchant.city} />
      : <DefaultCard title="Merchant" subtitle="KINNSO" />
    return new ImageResponse(card, { ...OG_SIZE, ...fontOpt })
  } catch {
    return new ImageResponse(<DefaultCard title="Merchant" subtitle="KINNSO" />, { ...OG_SIZE, ...fontOpt })
  }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/merchants.public-profile.host.test.tsx` — expect PASS (3 tests). `cd apps/web && npx tsc --noEmit` — expect clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx "apps/web/app/[locale]/m/[slug]" apps/web/lib/experiences/public-queries.ts apps/web/tests/merchants.public-profile.host.test.tsx
git commit -m "feat(web): /m/[slug] — public merchant profile with experiences grid + OG"
```

---

### Task 6: `/experiences/[slug]` — experience detail with honest booking state

**Files:**
- Create: `apps/web/components/kinnso/pages/ExperiencePublicView.tsx`
- Create: `apps/web/app/[locale]/experiences/[slug]/page.tsx`
- Create: `apps/web/app/[locale]/experiences/[slug]/opengraph-image.tsx`
- Test: `apps/web/tests/experiences.public-detail.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

```typescript
// apps/web/tests/experiences.public-detail.host.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
const getExperienceBySlugMock = vi.fn()
vi.mock('@/lib/experiences/public-queries', () => ({
  getExperienceBySlug: getExperienceBySlugMock,
  listPublishedExperiencesForMerchant: vi.fn(),
}))

import ExperiencePublicPage from '@/app/[locale]/experiences/[slug]/page'

afterEach(cleanup)

describe('ExperiencePublicPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(ExperiencePublicPage({ params: Promise.resolve({ locale: 'xx', slug: 'sunset-tour' }) })).rejects.toThrow('notFound')
  })

  it('notFound for an unknown slug', async () => {
    getExperienceBySlugMock.mockResolvedValue(null)
    await expect(ExperiencePublicPage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }) })).rejects.toThrow('notFound')
  })

  it('renders the experience with merchant attribution, price, and a booking-soon state — no booking form', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    const el = await ExperiencePublicPage({ params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Sunset junk boat tour' })).toBeTruthy()
    const merchantLink = screen.getByRole('link', { name: /Acme Travel/i })
    expect(merchantLink.getAttribute('href')).toBe('/en/m/acme-travel')
    expect(screen.getByText(/Booking opens soon/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /book/i })).toBeNull()
    expect(screen.queryByRole('form')).toBeNull()
  })
})
```

Run — expect FAIL (page module not found).

- [ ] **Step 2: Write the view**

```tsx
// apps/web/components/kinnso/pages/ExperiencePublicView.tsx
import Link from 'next/link'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExperiencePublicView({ locale, t, experience }: {
  locale: Locale; t: Messages['experiencePublic']; experience: PublicExperience
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
          <div className="mt-6 rounded-[3px] border border-kinnso-edge bg-white px-4 py-3">
            <p className="text-sm font-semibold text-kinnso-ink">{t.bookingSoonBadge}</p>
            <p className="mt-1 text-xs text-kinnso-muted">{t.bookingSoonNote}</p>
          </div>
          <Link href={p(`/m/${experience.merchant.slug}`)} className="mt-4 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">
            {t.backToMerchant} {experience.merchant.companyName}
          </Link>
        </div>
      </section>
    </article>
  )
}

export default ExperiencePublicView
```

- [ ] **Step 3: Write the route**

```tsx
// apps/web/app/[locale]/experiences/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { buildExperienceMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { ExperiencePublicView } from '@/components/kinnso/pages/ExperiencePublicView'

export function generateStaticParams() {
  // Experiences are DB-only; resolve on demand (dynamicParams defaults to true) —
  // same choice as /g/[slug].
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

export default async function ExperiencePublicPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const experience = await getExperienceBySlug(slug)
  if (!experience) notFound()
  const canonical = `${SITE_URL}/${locale}/experiences/${slug}`
  // Breadcrumbs only — deliberately NO Product/Offer JSON-LD until booking is real
  // (design spec §D-R2-6: never claim bookability before it exists).
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: experience.title, url: canonical },
    ]),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <ExperiencePublicView locale={locale as Locale} t={messages.experiencePublic} experience={experience} />
    </>
  )
}
```

- [ ] **Step 4: Write the OG image route**

```tsx
// apps/web/app/[locale]/experiences/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { ExperienceCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'
import { truncate, loadRemoteImage } from '@/lib/seo/og/data'

export const alt = 'KINNSO experience'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const fonts = await loadOgFonts()
  const fontOpt = fonts.length ? { fonts } : {}
  try {
    const experience = await getExperienceBySlug(slug)
    const cover = experience ? await loadRemoteImage(experience.coverUrl) : undefined
    const card = experience
      ? <ExperienceCard title={truncate(experience.title, 70)} city={experience.city} merchantName={experience.merchant.companyName} cover={cover} />
      : <DefaultCard title="Experience" subtitle="KINNSO" />
    return new ImageResponse(card, { ...OG_SIZE, ...fontOpt })
  } catch {
    return new ImageResponse(<DefaultCard title="Experience" subtitle="KINNSO" />, { ...OG_SIZE, ...fontOpt })
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/experiences.public-detail.host.test.tsx` — expect PASS (3 tests). `cd apps/web && npx tsc --noEmit` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/ExperiencePublicView.tsx "apps/web/app/[locale]/experiences/[slug]" apps/web/tests/experiences.public-detail.host.test.tsx
git commit -m "feat(web): /experiences/[slug] — detail page, honest booking-soon state, no Product/Offer schema"
```

---

### Task 7: Sitemap sections

**Files:**
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/tests/sitemap.test.ts`

- [ ] **Step 1: Read `apps/web/tests/sitemap.test.ts` and `apps/web/app/sitemap.ts` in full first** to confirm the exact current `buildAllSitemapEntries` (or equivalent) structure before editing — the survey captured the guides/creators loop shape, but re-read the live file since this task edits it directly.

- [ ] **Step 2: Add a failing/updated test case** to `sitemap.test.ts` asserting that a merchant slug and a published experience slug (mock `getMerchantsForSitemap`/`getExperiencesForSitemap` to return one row each) produce `/[locale]/m/[slug]` and `/[locale]/experiences/[slug]` entries for every locale, with priorities `0.6` (merchants, matching creators) and `0.7` (experiences, matching guides). Mirror the existing guides/creators test cases in that file exactly — same mocking style.

Run: `cd apps/web && npx vitest run tests/sitemap.test.ts` — expect FAIL.

- [ ] **Step 3: Add the merchants and experiences loops to `apps/web/app/sitemap.ts`**

Import `getMerchantsForSitemap` from `@/lib/merchants/public-queries` and `getExperiencesForSitemap` from `@/lib/experiences/public-queries`. In the function that builds `buildAllSitemapEntries` (wherever the guides/creators loops live), fetch both lists alongside the existing ones and add two loops matching the exact pattern already used for guides/creators:

```typescript
const merchants = await getMerchantsForSitemap()
for (const m of merchants) {
  const lastModified = m.lastmod ? new Date(m.lastmod) : undefined
  for (const l of LOCALES) {
    out.push({ url: `${SITE_URL}/${l}/m/${m.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
  }
}

const experiences = await getExperiencesForSitemap()
for (const e of experiences) {
  const lastModified = e.lastmod ? new Date(e.lastmod) : undefined
  for (const l of LOCALES) {
    out.push({ url: `${SITE_URL}/${l}/experiences/${e.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.7 })
  }
}
```

Match the exact variable names and structure already in the file (the survey's transcription is a close but not verbatim-verified copy for this exact insertion point — read the live file first per Step 1 and adapt precisely, keeping the fetch calls alongside the existing `getGuidesForSitemap()`/`getCreatorsForSitemap()` calls, likely inside a `Promise.all` or sequential awaits matching the current style).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/sitemap.test.ts` — expect PASS. `cd apps/web && npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/sitemap.ts apps/web/tests/sitemap.test.ts
git commit -m "feat(web): sitemap sections for merchants (0.6) and experiences (0.7)

Both sections reuse the same public-queries listable predicates the
pages themselves use, so the sitemap can never point at a 404."
```

---

### Task 8: Nav + Footer — add the Merchants directory link

**Files:**
- Modify: `apps/web/components/kinnso/Navbar.tsx`
- Modify: `apps/web/components/kinnso/Footer.tsx`
- Modify: `apps/web/tests/kinnso.Navbar.test.tsx`

- [ ] **Step 1: Update the failing test first**

In `kinnso.Navbar.test.tsx`, find the `expected` array for the base-anchor test (currently 6 entries: Explore, Destinations, Articles, Sessions, Agent, Creators) and add a 7th entry for Merchants, positioned to match wherever you place it in `baseAnchors` (Step 2 below — place it immediately after Creators, matching the master IA's listed order "Explore, Destinations, Articles, Sessions, AI Agent, Creators, Merchants"):

```typescript
    [en.nav.linkMerchants, '/en/merchants'],
```

Run: `cd apps/web && npx vitest run tests/kinnso.Navbar.test.tsx` — expect FAIL (Navbar doesn't render this link yet).

- [ ] **Step 2: Add `/merchants` to `baseAnchors` in `Navbar.tsx`**

Find the `baseAnchors` array (6 entries) and add a 7th after Creators:

```typescript
const baseAnchors = [
  { to: "/explore",      label: t.linkExplore },
  { to: "/destinations", label: t.linkDestinations },
  { to: "/articles",     label: t.linkArticles },
  { to: "/sessions",     label: t.linkSessions },
  { to: "/agent",        label: t.linkAgent },
  { to: "/creators",     label: t.linkCreators },
  { to: "/merchants",    label: t.linkMerchants },
];
```

- [ ] **Step 3: Add a Footer directory link**

In `Footer.tsx`'s Merchants column, add the directory link before the existing two (so browsing comes before the merchant-facing CTAs, matching the Creators column's own lead-with-acquisition pattern):

```typescript
{ title: t.colMerchants, links: [[t.lDirectory, "/merchants"], [t.lPostMission, "/merchants/dashboard/post"], [t.lPricing, "/for-merchants"]] as const },
```

- [ ] **Step 4: Run to verify everything passes**

Run: `cd apps/web && npx vitest run tests/kinnso.Navbar.test.tsx tests/kinnso.Footer.test.tsx tests/kinnso.route-parity.test.tsx` — expect PASS (route-parity now also validates the new `/merchants` Navbar link resolves — it already does, from Task 4). `cd apps/web && npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/Navbar.tsx apps/web/components/kinnso/Footer.tsx apps/web/tests/kinnso.Navbar.test.tsx
git commit -m "feat(web): add Merchants to the base nav + Footer directory link

Closes the base-IA gap the R2 master spec called for (Explore,
Destinations, Articles, Sessions, Agent, Creators, Merchants)."
```

---

### Task 9: Full-phase verification

- [ ] **Step 1:** Scoped sweep:

```bash
cd apps/web && npx vitest run \
  tests/merchants.public-queries.test.ts \
  tests/experiences.public-queries.test.ts \
  tests/jsonld.test.ts \
  tests/merchants.directory.host.test.tsx \
  tests/merchants.public-profile.host.test.tsx \
  tests/experiences.public-detail.host.test.tsx \
  tests/sitemap.test.ts \
  tests/kinnso.Navbar.test.tsx \
  tests/kinnso.Footer.test.tsx \
  tests/kinnso.route-parity.test.tsx \
  tests/i18n.locale-parity.test.ts
```

All PASS. Then `npx tsc --noEmit` and `npx eslint <every file this phase touched>` — clean (pre-existing accepted warnings excepted).

- [ ] **Step 2:** Grep safety net for the deleted `merchantsLanding` group and old view name:

```bash
grep -rn "merchantsLanding\|MerchantsLandingView" apps/web --include="*.ts*" | grep -v node_modules
```

Expect zero hits.

- [ ] **Step 3:** Live spot check (no writes — this phase touches no migration; confirm the app-layer reads line up with what's actually live): via Supabase MCP `execute_sql` against `scryfkefedzuetfdtrvl`:

```sql
select count(*) from public.merchant_public_profiles;
select count(*) from public.experiences where status = 'published';
```

Expected: the view returns the same count of active merchants confirmed in R2B (currently 4); published-experience count is likely 0 (none seeded yet) — confirms the empty states in Tasks 4–6 are exercising real, not hypothetical, behavior.

- [ ] **Step 4:** Update the product-revision-program memory: branch tip, PR status, note that R2 (all three slices: application funnel, dashboard/experiences, public surfaces) is now feature-complete pending merges, and that real merchant/experience seed content across hero destinations (spec §10.3 seed-&-scaffold, an R2 exit criterion) is a content task for the user/ops, not code.

- [ ] **Step 5:** If verification required fixes, commit them (`fix(web): R2C verification pass`); otherwise no commit.

---

## Deferred out of R2C (recorded, not forgotten)

- **No e2e coverage added** for the new SEO surfaces — `apps/e2e/specs/seo.spec.ts` is fixture-driven off real seeded articles; extending it for merchants/experiences needs real seeded content first (an R2 exit criterion, not a coding task). Vitest host tests cover the logic; live JSON-LD/OG shape should be spot-checked on the Vercel preview.
- **No experience count on directory cards** — with 0 experiences live today, a count would either be omitted or read "0 experiences" on every card; deferred until real content exists to avoid a design decision made on fake data.
- **`/m/[slug]` has no pagination** for the experiences grid — irrelevant at current volume; revisit if a merchant ever publishes enough experiences to need it.
- Everything already deferred out of R2A/R2B (booking/checkout, traveller accounts, Stripe, media uploads, slug rename, merchant email notifications) remains out of scope — this phase is public-surface-only.
- **Real merchant/experience content across hero destinations** (design spec §10.3) is the actual gate before this is production-meaningful — a content/ops task, not a follow-up phase.
