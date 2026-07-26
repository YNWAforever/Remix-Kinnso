# Phase R7.8 — SEO & Metadata Hygiene Design

**Date:** 2026-07-26
**Status:** Approved
**Phase:** R7.8 — SEO & metadata hygiene (P1)
**Repository:** `YNWAforever/Remix-Kinnso`

## 1. Goal

Make every indexable KINNSO public page describe the product and entity honestly,
publish only supported structured data, expose correct locale relationships, and
appear in the sitemap only when it is a real, non-error, indexable URL.

R7.8 must:

- reposition `/articles` metadata from the pre-pivot creator-platform language to
  KINNSO's current marketplace;
- audit every discovered public `generateMetadata` implementation;
- harden experience, session, article, guide, and rating JSON-LD;
- remove thin, fallback-only, drafted, noindexed, and empty-category URLs from the
  sitemap;
- preserve correct locale alternates across all seven supported locales; and
- provide automated and deployed evidence for the R7.8 acceptance criteria.

The binding program conventions in
`docs/superpowers/specs/2026-07-02-product-revision-program-design.md` §7 remain
in force.

## 2. Ground truth

The repository already centralizes most SEO construction in:

- `apps/web/lib/seo/metadata.ts`
- `apps/web/lib/seo/jsonld.ts`
- `apps/web/app/sitemap.ts`

Public metadata builders already exist for marketing pages, articles, guides,
creators, merchants, experiences, sessions, and destinations. The common
`hreflangFor` helper builds canonical and language alternates.

Entity Open Graph image routes already exist for:

- `apps/web/app/[locale]/c/[handle]/opengraph-image.tsx`
- `apps/web/app/[locale]/m/[slug]/opengraph-image.tsx`
- `apps/web/app/[locale]/g/[slug]/opengraph-image.tsx`
- `apps/web/app/[locale]/experiences/[slug]/opengraph-image.tsx`

R7.8 therefore verifies and wires those existing routes; it does not build a
second OG-image system.

The current gaps are:

- `/articles` uses only a breadcrumb label as metadata and the locale SEO copy
  still contains pre-pivot creator-platform positioning.
- Article indexability has no explicit database or editorial field.
- Article fallback pages can render a different locale's translation, but
  metadata does not explicitly distinguish a genuine translation from a
  fallback-rendered page.
- `apps/web/app/sitemap.ts` adds every article category for every locale even
  when the category is empty.
- `getPublishedForSitemap` does not have enough translation content to apply a
  content-quality rule.
- `experienceOfferJsonLd` hardcodes `InStock`; the page currently omits the
  product schema entirely when booking is unavailable.
- `FAQPage` is based only on row count rather than non-empty visible content.
- Existing structured-data and hreflang tests cover important samples but do
  not provide the full R7.8 parity matrix.

The seeded article fixtures make the quality problem concrete:

- `ramen-guide` contains substantial content and is a valid rich fixture.
- `sushi-guide`, `cafe-guide`, and `mall-coupon` contain only one-line blocks
  and must remain readable for tests while being excluded from indexing.

## 3. Decisions

### D-R7.8-1 — Extend the centralized SEO policy layer

R7.8 will extend the existing helpers under `apps/web/lib/seo` and the existing
article query layer. It will not introduce a full declarative route manifest.

Route files remain thin adapters:

1. load the public entity and current configured product state;
2. pass raw facts to pure SEO policy/building functions; and
3. render the returned metadata or JSON-LD.

Sitemap generation consumes the same article indexability decision as metadata.
This prevents a URL from being both `noindex` and present in the sitemap.

### D-R7.8-2 — Content quality determines article indexability

No database migration or slug denylist will be added.

A pure article-quality helper will:

1. parse the existing article block array using the known block shape;
2. collect user-visible textual fields from supported blocks;
3. remove HTML tags;
4. decode or normalize whitespace sufficiently for stable visible-text
   measurement;
5. count Unicode characters after whitespace normalization; and
6. fail closed when content cannot be parsed.

A genuine article translation is indexable only when all are true:

- title is non-empty after trimming;
- summary or meta description is non-empty after trimming; and
- normalized visible content contains at least **300 characters**.

Character count is deliberate: word counts are unreliable across English,
Chinese, Japanese, Korean, and Thai. The threshold is a hard SEO eligibility
rule, not a display restriction. Thin pages remain readable.

The constant and helper will live in a small, named module under the discovered
`apps/web/lib/seo` directory so metadata, query mapping, sitemap generation, and
tests import one implementation.

### D-R7.8-3 — Advertise only genuine article translations

Article locale policy distinguishes the requested locale from the resolved
translation locale.

For a genuine, quality-passing translation:

- `robots.index` is `true`;
- canonical is the current locale URL;
- `hreflang` includes only other genuine, quality-passing translations; and
- the URL appears in the sitemap.

For a genuine but thin translation:

- `robots.index` is `false`;
- the URL is omitted from `hreflang` and sitemap; and
- the page remains readable.

For a fallback-rendered locale:

- `robots.index` is `false`;
- canonical points to the English genuine/indexable translation when one
  exists, otherwise the first genuine/indexable locale in `LOCALES` order;
- alternates contain genuine/indexable translations only; and
- the fallback URL is absent from the sitemap.

If no genuine/indexable translation exists, metadata fails closed with
`noindex` and does not fabricate a canonical.

This is an intentional article-specific exception to seven-locale entity
parity. Marketing pages and public entity pages that genuinely render under all
seven locale prefixes continue to advertise all seven alternates plus
`x-default`.

### D-R7.8-4 — Empty article categories are non-indexable

An article category page is indexable for a locale only when that
locale/category pair has at least one genuine, quality-passing translation.

Empty category pages:

- remain renderable with the existing empty state;
- return `noindex`;
- are omitted from the sitemap; and
- do not appear as alternates for non-empty locale/category pairs.

The `/articles` hub remains indexable as the marketplace editorial entry point.

### D-R7.8-5 — Marketplace metadata replaces pre-pivot copy

`/articles` receives a dedicated localized SEO title and description in all
seven locale dictionaries.

English source intent:

- title: **Travel guides, experiences and local recommendations**
- booking-live description: **Discover creator-led travel guides, bookable
  local experiences, live sessions and trusted recommendations across Asia.**
- booking-unavailable description: **Discover creator-led travel guides, local
  experiences, live sessions and trusted recommendations across Asia.**

The metadata generator selects the matching description from
`resolveConfiguredProductState().bookingLive`. The other six locales use
idiomatic translations preserving both variants' meaning. The visible page
heading does not change merely because the SEO string changes.

The public metadata audit classifies each discovered route as marketing,
listing, entity, translated article, or private/noindex and verifies:

- title and non-empty description;
- canonical URL;
- robots state;
- Open Graph and Twitter data;
- product-state accuracy; and
- locale alternates.

`/agent` continues to use the R7.2 live/waitlist metadata policy.
Experience metadata describes the entity without promising that booking is
available when `BOOKING_LIVE` is off.

### D-R7.8-6 — Experience schema is always honest about availability

A published experience page emits `Product` with a nested priced `Offer`.

The offer includes:

- URL;
- the public `experiences.price_amount` value as the major-unit price already
  displayed by the experience UI;
- currency; and
- schema.org availability.

Stripe's separate `toStripeAmount` conversion must not be applied to JSON-LD.
The existing direct `price_amount` output is preserved so a JPY 12,000
experience is advertised to search engines as JPY 12,000.

Availability is:

- `https://schema.org/InStock` only when `BOOKING_LIVE` is enabled and at least
  one public availability row has remaining capacity;
- `https://schema.org/OutOfStock` otherwise, including availability-query
  failure.

The page must never emit `InStock` based on the feature flag alone.

`aggregateRating` is added only when a published-review aggregate exists and
its count is greater than zero. A review query failure omits the rating and
does not fail the page.

### D-R7.8-7 — Session, FAQ, guide, and rating schema remain evidence-based

Session detail pages emit `Event` using the existing honest mapping:

- cancelled → `EventCancelled`;
- scheduled, live, or ended → `EventScheduled`, because schema.org has no
  separate live or completed value that matches the current session model.

Online attendance mode and virtual location remain based on the real session
URL/embed URL. Optional performer data is emitted only when a real host name is
available.

`FAQPage` is emitted only for an indexable article with at least one FAQ whose
trimmed visible question and answer are both non-empty.

Guide `Article` JSON-LD and experience `Product` JSON-LD include
`aggregateRating` only from the existing published-review aggregate queries
with positive counts. Article rows' legacy numeric `rating` field is not
promoted into structured data without real review evidence.

## 4. Data flow

### 4.1 Article metadata and sitemap

```text
public article query
  -> genuine translation rows with content
  -> shared quality policy per translation
  -> locale indexability decisions
       -> article generateMetadata
       -> category generateMetadata
       -> getPublishedForSitemap mapping
       -> sitemap article/category inclusion
```

The sitemap query returns only the raw fields needed to make this decision:
article URL/category/timestamps plus translation locale, title, summary,
meta-description, and content. It does not add a new table or RPC.

### 4.2 Experience structured data

```text
published experience
  + resolveConfiguredProductState().bookingLive
  + public availability rows
  + published review aggregate
  -> experienceOfferJsonLd
  -> Product + Offer + optional aggregateRating
```

### 4.3 Metadata audit

Each public route uses its existing entity/listing query and an existing or
extended metadata builder. Private completion routes continue to use
`noindexMetadata`. Missing public entities continue to return the existing 404
path and are never synthesized into sitemap URLs.

The `/articles` listing also reads
`resolveConfiguredProductState().bookingLive` to choose its honest localized
description variant.

## 5. Failure handling

SEO claims fail closed without turning optional enrichment into page outages:

- malformed article content → non-indexable translation;
- missing title/description → non-indexable translation;
- review aggregation failure → omit `aggregateRating`;
- availability failure → `OutOfStock`;
- missing fallback target → noindex with no fabricated canonical;
- invalid optional JSON-LD value → omit that property;
- unavailable optional sitemap entity source → omit that family rather than
  inventing URLs.

The destination sitemap fallback introduced before R7.8 must remain intact:
absence of `destination_index` cannot break `next build` or sitemap collection.

Errors that undermine the authoritative public entity query itself continue to
surface through existing error boundaries/logging rather than being silently
converted into fake content.

## 6. Verification design

### 6.1 Pure policy and builder tests

Extend `apps/web/tests/metadata.test.ts`,
`apps/web/tests/jsonld.test.ts`, and
`apps/web/tests/seo.jsonld.test.ts`, plus a focused test for the new article
quality module.

Cover:

- 299 versus 300 visible characters;
- HTML and whitespace normalization;
- English, Chinese, Japanese, Korean, and Thai text;
- malformed/unknown block data;
- genuine, thin, and fallback locale decisions;
- canonical and `x-default` selection;
- seven-locale entity alternates;
- `InStock` and every `OutOfStock` path;
- rating present only with positive count;
- FAQ filtering; and
- valid Article, Product/Offer, Event, and BreadcrumbList shapes.

### 6.2 Route and sitemap tests

Extend:

- `apps/web/tests/sitemap.test.ts`
- `apps/web/tests/sitemap.guides-creators.test.ts`
- `apps/web/tests/crawl-sitemap.test.ts`

Prove:

- thin translations are absent;
- fallback locale URLs are absent;
- empty locale/category pairs are absent and noindexed;
- drafted/non-public entities remain absent;
- public entity routes retain seven locale variants;
- sitemap sharding is deterministic; and
- sitemap URLs never resolve to redirects, error statuses, or noindex pages.

`scripts/crawl-sitemap.ts` remains the single crawler implementation.

### 6.3 Locale and browser parity

Extend:

- `apps/web/tests/i18n.locale-parity.test.ts`
- `packages/parity/src/checks/structured-data.ts`
- `packages/parity/tests/structured-data.test.ts`
- `apps/e2e/specs/seo.spec.ts`

The parity contract is:

- all seven locales plus `x-default` for public marketing and entity routes;
- genuine/indexable translations plus `x-default` for articles;
- reciprocal canonical/alternate relationships; and
- no alternate pointing to an error or noindex URL.

Browser coverage verifies rendered head tags, existing guide/experience OG
images, and JSON-LD for one article, guide, experience, and session fixture.

### 6.4 Completion evidence

Before R7.8 is called complete:

1. run focused SEO tests;
2. run locale/parity tests;
3. run web typecheck;
4. run the production build;
5. run the R7.1 sitemap crawl locally;
6. run the same crawl against the deployed preview or production origin;
7. submit one public guide, experience, and article URL to Google Rich Results;
8. submit a public session URL when a live session exists; and
9. record tested URLs and results in the PR.

An unavailable live session is documented as conditional acceptance. R7.8 does
not create production content or activate a feature solely to satisfy the
check.

## 7. Scope boundaries

R7.8 does not:

- add or apply a database migration;
- mutate production content;
- change public content URLs;
- build a CMS or editorial indexing workflow;
- add a second OG-image framework;
- activate `BOOKING_LIVE`, Agent, or any other product feature;
- change Stripe mode or payment behavior;
- alter creator Copilot behavior; or
- redesign page UI beyond metadata-visible copy.

## 8. Delivery

R7.8 ships as one squash-merged PR from `codex/r7-8-seo-metadata`.
Implementation follows a separate approved execution plan. Conventional commits
and the R1–R6 §7 quality gates remain binding.
