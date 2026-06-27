# Phase 9 — SEO & Public Discovery + Branded OG Images — design

**Date:** 2026-06-27
**Status:** Approved (design); pending spec review → implementation plan
**Repo:** `kinnso-v3` (web app `apps/web`)
**Builds on:** the product-reorg roadmap (Phases 1–8). Phase 3 made the creator directory + profiles real; Phase 4 polished articles; Phases 6–8 added admin/merchant-depth/analytics. This phase makes the **public acquisition surface discoverable in search and shareable on social**, which is the explicit lever of the creator-supply soft-launch objective ("convert creators to sign up and **rank in search**").

---

## Purpose

KINNSO v3's public surface has a genuinely good technical-SEO foundation **for articles** and almost nothing for the surfaces a soft-launch actually sells: creator guides, creator profiles, and the marketing pages. A focused audit (6/27) found:

- **Articles** — full hreflang/canonical/OpenGraph (`lib/seo/metadata.ts`), Article + FAQ + BreadcrumbList JSON-LD (`lib/seo/jsonld.ts`), a dynamic sitemap (`app/sitemap.ts`), and a robots policy. Solid; left as-is.
- **Guides** (`/[locale]/g/[slug]`) — bare `title`/`description` only. **No** canonical, **no** hreflang, **no** OG image (despite a `cover_url`), **no** JSON-LD, **not** in the sitemap.
- **Creators** (`/[locale]/c/[handle]`, `/[locale]/creators`) — same: bare title/description, no OG, no `Person`/`ProfilePage` schema, not in the sitemap.
- **Marketing pages** (home `/`, `/explore`, `/creators`, `/agent`, `/about`, `/contact`, `/merchants`, `/legal/*`) — **no `generateMetadata` at all**; relying on framework defaults (no title/description/canonical/hreflang/OG).
- **No site-wide defaults** — no `metadataBase`, no title template, no `Organization`/`WebSite` JSON-LD (the schema that powers the brand knowledge panel and the sitelinks search box).
- **No `noindex`** on private surfaces (studio/admin/merchant/ops/auth); `robots.txt` is allow-all.

This phase closes every one of those gaps by **extending the existing `lib/seo/*` patterns to the whole public surface**, and adds **dynamic branded OpenGraph cards** (`next/og`) for guides, creator profiles, and the home/default — because a creator sharing their own KINNSO profile or guide is the core acquisition flywheel, and a premium social card materially lifts share click-through.

It is **web-only — no database migration.** Every data source needed (published guides, active public creators, articles) is already queryable.

## Governing principles

1. **Extend, don't replace.** Reuse `lib/seo/metadata.ts`, `lib/seo/jsonld.ts`, `<JsonLd>`, `app/sitemap.ts`, `app/robots.ts`. No new SEO dependency (`next-seo` etc.); the app already uses Next's `Metadata` API idiomatically.
2. **Honest metadata.** Titles/descriptions describe what the page really is. No fabricated counts or invented data in meta tags (consistent with the reorg's "no fabricated data" principle).
3. **Every public URL: canonical + hreflang + sitemap. Every private URL: noindex.** No public product page ships without a self-canonical and locale alternates; no authed surface is left indexable.
4. **Single-language content, multi-market URLs.** Guides and creator profiles are single-language DB content served under each `[locale]` prefix with localized chrome. They get **self-canonical + hreflang alternates across all 7 locales + `x-default→en`** so each market's URL can rank while signaling equivalence.
5. **Respect the framework.** `apps/web/AGENTS.md`: "This is NOT the Next.js you know." The plan must read `node_modules/next/dist/docs/` for the current `Metadata`, `MetadataRoute`, and `ImageResponse`/`opengraph-image` contracts before writing the OG-image and metadata code.

## Confirmed current-state facts (audit, 6/27)

- **Locales** (`lib/i18n/config.ts`): `LOCALES = ['en','zh-hk','zh-tw','ja','ko','th','zh-cn']`, `DEFAULT_LOCALE = 'en'`. Custom i18n (not `next-intl`); `[locale]`-prefixed routes; `htmlLang()` maps to BCP-47 (`zh-hk → zh-Hant-HK`). Root `/` redirects to `/en`. Locale routing lives in `proxy.ts` (there is **no** `middleware.ts`).
- **`lib/seo/metadata.ts`** exports `SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.kinnso.ai'`, `buildArticleMetadata`, `buildListingMetadata`, an `OG_LOCALE` map, and a private `detailPath` helper. Both builders duplicate the hreflang-map construction.
- **`lib/seo/jsonld.ts`** + **`components/JsonLd.tsx`** (escapes `<` → `<`). Article/FAQ/Breadcrumb only, on article detail.
- **`app/sitemap.ts`** (`revalidate = 21600`) reads `getPublishedForSitemap()` and emits per-locale rows for the articles hub, category pages, and detail (detail only for locales that have a translation).
- **`app/robots.ts`** → `{ rules: [{ userAgent: '*', allow: '/' }], sitemap: '${SITE_URL}/sitemap.xml' }`.
- **`app/layout.tsx`** loads fonts (`Bricolage_Grotesque`, `DM_Sans`, `JetBrains_Mono` via `next/font/google`) and exports `fontVariables`; it renders `children` only (the `<html>` lives in `app/[locale]/layout.tsx`). Neither layout exports `metadata` today.
- **Public content queries** already exist:
  - Guides — `getPublishedGuides()` and `getGuideBySlug(slug)` in `lib/guides/queries.ts`. Fields available: `slug, title, cover_url, city, saves_count, creator_handle, creator_name, summary`, plus `published_at`/`updated_at` on the row.
  - Creators — `getPublicCreators()` and `getCreatorByHandle(handle)` in `lib/creators/queries.ts`. Fields: `handle, display_name, bio, public_profile` (`niches, content_pillars, tone, audience_geos, audience_locales, languages, platforms`), `guideCount`, plus `created_at`/`updated_at`.
  - Articles — `getPublishedForSitemap()` in `lib/articles/queries.ts`.
- **`favicon.ico`** exists; there are **no** `opengraph-image`, `twitter-image`, `apple-icon`, or static OG assets.

## Route classification (indexability)

**Index (full SEO: metadata + canonical + hreflang + sitemap; JSON-LD where applicable):**
home `/[locale]`, `/explore`, `/g/[slug]`, `/c/[handle]`, `/creators`, `/articles` (+ category + detail — already done), `/about`, `/agent`, `/contact`, `/merchants` (landing only), `/legal/creator-terms`.

**Noindex (robots disallow + `noindexMetadata()`):**
`/sign-in`, `/sign-up`, `/creator` (onboarding), all `/studio/*`, all `/admin/*`, `/ops/*`, and the private merchant subtree `/merchants/{post,missions,missions/[id],creators,insights}`. Redirect-only aliases (`/feed`, `/creators/apply`) are left to redirect (no metadata needed).

---

## Component 1 — SEO metadata module (`lib/seo/metadata.ts`, extend)

Factor the duplicated hreflang logic into one helper and add builders for the un-covered surfaces. All builders keep returning a Next `Metadata` object so pages stay `export async function generateMetadata`.

```ts
// shared — used by every builder. `path(l)` returns the absolute URL for locale l;
// `current` is the locale being rendered (its URL becomes the canonical).
function hreflangFor(path: (l: Locale) => string, current: Locale, locales: readonly Locale[]) {
  const languages: Record<string, string> = {}
  for (const l of locales) languages[l] = path(l)
  languages['x-default'] = path(DEFAULT_LOCALE)
  return { canonical: path(current), languages }   // → Metadata.alternates
}
```

New exports:

- **`buildPageMetadata({ path, locale, title, description, ogImage?, type? })`** — for the static marketing pages, which exist in **all 7 locales**. Produces self-canonical (`${SITE_URL}/${locale}${path}`), hreflang across all 7 + `x-default`, `openGraph` (`type: 'website'` default, `url`, `title`, `description`, `images`, `locale: OG_LOCALE[locale]`), `twitter: { card: 'summary_large_image' }`, `robots: { index: true, follow: true, 'max-image-preview': 'large' }`.
- **`buildGuideMetadata({ slug, locale, title, description, ogImage })`** — `path = (l) => ${SITE_URL}/${l}/g/${slug}`; OG `type: 'article'`; hreflang all 7 + `x-default`; `ogImage` is the dynamic guide card URL.
- **`buildCreatorMetadata({ handle, locale, name, bio, ogImage })`** — `path = (l) => ${SITE_URL}/${l}/c/${handle}`; OG `type: 'profile'`; hreflang all 7 + `x-default`.
- **`noindexMetadata()`** → `{ robots: { index: false, follow: false } }`.

`buildArticleMetadata`/`buildListingMetadata` are refactored to call `hreflangFor` (behavior unchanged except the title-template change in Component 2). The `presentLocales` argument is retained for articles (their alternates are translation-gated); guides/creators always span all 7.

## Component 2 — Site-wide defaults (`app/[locale]/layout.tsx`, add `generateMetadata`)

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const { locale } = await params
  const dict = await getDictionary(locale)
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: dict.seo.brandTitle, template: '%s · KINNSO' },
    description: dict.seo.brandDescription,
    openGraph: { type: 'website', siteName: 'KINNSO', locale: OG_LOCALE[locale] },
    twitter: { card: 'summary_large_image' },
    // default OG image comes from the root `opengraph-image` file convention (Component 5),
    // which Next auto-injects into this segment's metadata — so it is NOT set explicitly here.
    // (The plan confirms file-convention vs explicit `openGraph.images` against the installed Next version.)
    alternates: { canonical: `${SITE_URL}/${locale}`, languages: { /* all 7 + x-default → home */ } },
  }
}
```

**Title-template unification (decision):** the codebase mixes `… - Kinnso` (article builders), `… | KINNSO` (guide/creator pages), and the brand casing varies. This phase standardizes on the template `%s · KINNSO`. The article/listing builders are changed to return the **bare heading** (the template adds the brand); `tests/metadata.test.ts` is updated to assert the new shape. Pages that need a fully-formed title use `title.absolute`.

The locale layout also renders site-wide JSON-LD (Component 3) so it appears on every page.

## Component 3 — Structured data (`lib/seo/jsonld.ts`, extend + render in layout/pages)

Site-wide (rendered once in `app/[locale]/layout.tsx`):
- **`Organization`** — `name: 'KINNSO'`, `url: SITE_URL`, `logo`, optional `sameAs` (only real, live socials; omit otherwise — no fabricated profiles).
- **`WebSite`** — `url`, `name`, `inLanguage`, and a `potentialAction` `SearchAction` whose target is `${SITE_URL}/${locale}/articles?q={search_term_string}` (the article category pages already accept `?q=`), enabling the sitelinks search box.

Per-surface (rendered in the page):
- **Guide** (`/g/[slug]`): `Article` — `headline`, `description`, `image` (cover), `inLanguage`, `author: { '@type': 'Person', name, url: /c/handle }`, `publisher: Organization` — plus `BreadcrumbList` (Home → Explore → guide).
- **Creator** (`/c/[handle]`): `ProfilePage` wrapping `Person` — `name`, `alternateName: @handle`, `url`, `description: bio`, `knowsAbout: niches` — plus `BreadcrumbList` (Home → Creators → handle).

Keep listing/marketing JSON-LD minimal (no `CollectionPage` noise) to avoid spammy markup; breadcrumbs only where there's a genuine hierarchy.

## Component 4 — Crawl coverage (`app/sitemap.ts` + `app/robots.ts`, extend)

**Sitemap.** Add two lean query functions next to `getPublishedForSitemap`:
- `getGuidesForSitemap()` → `{ slug, lastmod }[]` (published guides).
- `getCreatorsForSitemap()` → `{ handle, lastmod }[]` (active creators with a `handle` and `public_profile`).

`app/sitemap.ts` then also emits, **per locale (all 7)**, one row per guide (`/${l}/g/${slug}`) and one per creator (`/${l}/c/${handle}`), with `lastModified` and sensible `changeFrequency`/`priority` (guides `weekly`/0.7, creators `weekly`/0.6). This matches the existing per-locale-row style; the page-head hreflang (Components 1) carries the alternate-equivalence signal. Add the home + key marketing routes to the sitemap too (all 7 locales).

**Robots.** Keep `allow: '/'` for the public surface, add `disallow` for the private trees (Googlebot honors `*` wildcards):
```
/*/studio        /*/admin        /*/ops
/*/sign-in       /*/sign-up      /*/creator
/*/merchants/post   /*/merchants/missions   /*/merchants/creators   /*/merchants/insights
```
`/merchants` (the public landing) stays crawlable. Belt-and-suspenders: `noindexMetadata()` on the anonymous-reachable auth pages (`/sign-in`, `/sign-up`) — they render for logged-out crawlers, so the page-level `noindex` is the authoritative signal there; the rest redirect anon and are covered by the robots disallow.

## Component 5 — Branded OG images (`next/og`)

Dynamic OpenGraph cards (1200×630) as Next `opengraph-image` route handlers:
- **`app/[locale]/g/[slug]/opengraph-image.tsx`** — guide title (Bricolage display), city + `@creator`, `cover_url` as a dimmed backdrop, KINNSO wordmark.
- **`app/[locale]/c/[handle]/opengraph-image.tsx`** — creator name, `@handle`, up to 3 niche chips, guide count, KINNSO wordmark.
- **Default / home** — `app/[locale]/opengraph-image.tsx` — brand + tagline. Placed at the `[locale]` segment, Next auto-applies it to all marketing pages there, while the nested `g/[slug]` and `c/[handle]` `opengraph-image` files override it — so any page lacking a specific card still shares a branded image, with no explicit `openGraph.images` wiring.

Shared in **`lib/seo/og/`**: a small set of card layout primitives, the brand palette, and font loading. `ImageResponse` needs fonts as `ArrayBuffer` (it can't read `next/font` CSS vars), so Bricolage + DM Sans `.ttf` weights are bundled (e.g. `apps/web/public/fonts` or fetched at build) and passed via the `fonts` option. Twitter cards reuse the same image (`summary_large_image`).

**Articles keep their existing `og_image` pipeline** — dynamic OG is added for guides, creators, and the site-wide default only. (If an article has no `og_image`/thumbnail, the root default card is the ultimate fallback.)

⚠️ **Highest-risk component.** Per `AGENTS.md`, the plan must verify the current `ImageResponse`/`opengraph-image` API against `node_modules/next/dist/docs/` before coding, confirm the runtime (edge vs node) and font-loading approach, and include a **build-smoke + manual visual check** of each card (image routes can't be meaningfully unit-tested; only the card-prop derivation helpers are unit-tested).

## Component 6 — i18n

New **`seo`** dictionary group ×7 locales with localized meta copy for the marketing pages and the brand default:
```
seo: { brandTitle, brandDescription,
       home: {title, description}, explore: {…}, creators: {…}, agent: {…},
       about: {…}, contact: {…}, merchants: {…}, terms: {…} }
```
Guide/creator titles/descriptions derive from the entity data (title/city/creator, name/bio), not the dictionary. Add the `seo` group to the `Messages` interface in `en.ts` and to the parity `GROUPS` array. **i18n-parity gotcha:** every new key must exist in all 7 locale files + the interface, or `tests/i18n.locale-parity.test.ts` fails.

---

## Data flow

```
Request /{locale}/g/{slug}
  → generateMetadata: getGuideBySlug(slug) → buildGuideMetadata({…, ogImage: /{locale}/g/{slug}/opengraph-image})
        → <head>: title, description, canonical, 7× hreflang + x-default, og(type=article,image), twitter
  → opengraph-image.tsx: getGuideBySlug(slug) → ImageResponse(branded card)
  → page body: <JsonLd> Article + BreadcrumbList

Crawl
  → /robots.txt   (allow public, disallow private trees, sitemap pointer)
  → /sitemap.xml  (articles [existing] + guides + creators + marketing, per locale)
  → every page <head> Organization + WebSite JSON-LD (from layout)
```

## Error handling & edge cases

- **Missing entity** — `getGuideBySlug`/`getCreatorByHandle` returning null already yields `notFound()`; `generateMetadata` returns a minimal noindex `{ title: 'Not found · KINNSO' }` and the OG route returns the default card (never throw).
- **Missing cover/avatar** — OG card falls back to a brand-only background; no broken `og:image`.
- **Drafts / inactive** — sitemap queries filter `status='published'` (guides) and `status='active'` + non-null `handle`/`public_profile` (creators); unit-tested to exclude non-public rows.
- **Single-language content under 7 prefixes** — resolved by self-canonical + hreflang (principle 4); never canonical-collapse to `en` (that would suppress non-en market ranking).
- **OG runtime limits** — keep card payload small; bundle only the font weights actually used; guard against oversized cover images (let the backdrop fail gracefully to brand color).

## Testing

- **`tests/metadata.test.ts`** (extend) — `buildPageMetadata`/`buildGuideMetadata`/`buildCreatorMetadata`: canonical = self, `languages` has all 7 + `x-default→en`, OG type, twitter card; `noindexMetadata` → `index:false`; updated article-title-template assertions.
- **`tests/sitemap.test.ts`** (extend) — guides + creators + marketing present across locales; drafts/inactive excluded; lastmod mapping.
- **robots test** (new or extend) — private trees disallowed, `/merchants` allowed, sitemap pointer.
- **JSON-LD tests** — `Organization`/`WebSite`/`Article`(guide)/`ProfilePage`+`Person`(creator)/`BreadcrumbList` shapes; `<JsonLd>` escaping intact.
- **OG** — unit-test the card-prop derivation helpers (title truncation, niche-chip selection, fallback when cover/avatar null). The rendered PNG is verified by **build-smoke** (routes compile) + a **manual visual check** of one guide, one creator, and the default card.
- **i18n** — `tests/i18n.locale-parity.test.ts` covers the new `seo` group.
- **Finish gate** — full `vitest run` (host-test-gap lesson: run the **whole** suite, not just the touched files), `tsc --noEmit`, lint (0 errors), `next build`, and confirm new routes (`/sitemap.xml`, `opengraph-image` handlers) in the build manifest.

## Decisions (defaulted; approved at design)

1. **hreflang for guides/creators** — self-canonical + 7 alternates + `x-default→en` (not canonical-collapse to en).
2. **Title unification** — one `%s · KINNSO` template; refactor article/listing builders + their tests.
3. **OG scope** — dynamic cards for guides + creators + home/default; articles keep `og_image`; default card is the site-wide fallback.
4. **noindex** — robots.txt disallow (primary) + per-page `noindex` on anon-reachable auth pages.
5. **No `sameAs` fabrication** — Organization `sameAs` only lists real, live socials, else omitted.

## Non-goals

- **No DB migration** — web-only.
- **No content/discovery features** — breadcrumb UI, related-content internal linking, city/niche programmatic landing pages, RSS — deferred to a possible Phase 10.
- **No change to the article SEO pipeline** beyond the shared-helper refactor and the title template.
- **No `next-seo` or other SEO dependency** — extend the native `Metadata` API.
- **No analytics/Search-Console wiring** — verification/GSC submission is an ops task, out of code scope (the sitemap + robots make the site submittable).

## Success criteria

- Every public route emits a self-canonical, hreflang alternates for all 7 locales + `x-default`, a localized title/description, and an OG image (specific or branded default).
- Guides and creator profiles appear in `/sitemap.xml` across all locales; private surfaces are disallowed in `/robots.txt` and/or `noindex`.
- `Organization` + `WebSite` JSON-LD on every page; `Article`/`BreadcrumbList` on guides; `ProfilePage`/`Person`/`BreadcrumbList` on creators — all validate against schema.org.
- Sharing a guide or creator URL renders a branded KINNSO OG card.
- Finish gate green: full vitest, tsc, lint, `next build`, new routes in the manifest.
- No private/authed URL is indexable; no public page is missing a canonical.
