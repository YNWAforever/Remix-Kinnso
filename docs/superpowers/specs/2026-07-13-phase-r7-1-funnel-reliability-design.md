# Phase R7.1 — Funnel Reliability Design

**Status:** Approved direction
**Date:** 2026-07-13
**Source of truth:** `kinnso-phase-r7-ux-hardening-spec.md` R7.1 and the program-wide §7 conventions
**Depends on:** Phase R7.0 ground truth (`docs/r7-ground-truth.md`)

## Goal

Restore every published guide and experience detail page, make unknown slugs and secondary-data failures degrade predictably, and add continuous funnel and sitemap verification so the same failure class cannot silently return.

## Confirmed root cause

The production guide and experience leaf routes still return HTTP 500, while an unknown guide slug returns HTTP 404. Vercel records `DYNAMIC_SERVER_USAGE` for both failing route trees.

Both pages export `generateStaticParams()` returning `[]`. Under the installed Next.js 16.2.9 behavior, that makes dynamic slugs statically generated on first visit. Phase R6A then added `createSupabaseServerClient()` to both pages; that helper calls `cookies()`, a request-bound Dynamic API. Commit `90ac420` introduced the shared request-bound path, and the production deployment ran that exact code. Migration, environment, and stale-deploy drift were ruled out in R7.0.

R7.1 classifies the incident as **code / rendering-mode drift**.

## Chosen rendering strategy

The two leaf routes become explicitly request-rendered:

- remove their empty `generateStaticParams()` exports;
- declare `export const dynamic = 'force-dynamic'` at each route;
- retain cookie-less anonymous Supabase clients for primary public entity reads;
- retain the authenticated server client only for viewer-specific auth and save state.

This is the narrowest P0 repair. It preserves signed-in save and booking behavior without introducing a new browser-side auth architecture. Static/client-island refactoring and Cache Components/PPR are outside R7.1.

## Page data contract and error containment

Primary entity reads remain mandatory:

- `getGuideBySlug(slug)` and `getExperienceBySlug(slug)` continue to use anon + RLS;
- a null result calls `notFound()`;
- a primary-query exception is unexpected and reaches the nearest route error boundary.

Every secondary module is optional and receives an explicit fallback:

| Secondary module | Guide fallback | Experience fallback |
|---|---|---|
| viewer/auth | anonymous viewer | anonymous viewer and guest booking form |
| save state | not saved | not saved |
| availability | n/a | empty availability; booking CTA becomes the existing no-dates state |
| rating aggregate | no aggregate | no aggregate |
| published reviews | empty list | empty list |
| guide-to-experience cross-links | omit module | n/a |
| JSON-LD enhancement | omit the failing enhancement; keep page content | omit the failing enhancement; keep page content |

A small server-only helper records a named module failure and returns its typed fallback. Independent promises are contained independently, so one failed review query cannot erase availability or auth state. No exception text or secret value reaches rendered UI.

Public ratings and reviews use a cookie-less public Supabase client. Viewer auth/save state uses the cookie-bound server client inside its own contained loader. `GuideExperienceLinks` contains its own public-query failure because it is a nested async Server Component whose exception would otherwise escape after the page function returns.

## Route error boundaries

Add segment-local boundaries at:

- `apps/web/app/[locale]/g/[slug]/error.tsx`
- `apps/web/app/[locale]/experiences/[slug]/error.tsx`

Both use one shared branded client component. It logs the digest through the existing console/error-observability convention, offers a retry action, and links to `/{locale}/explore`.

The new title, explanation, retry label, and Explore label live in a `detailError` dictionary group across all seven locale files: `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, and `zh-cn`. The client boundary resolves the locale with `useParams()` and loads the existing locale dictionary; English is the safe initial fallback. Locale parity covers the new group.

## Environment validation

Create `apps/web/lib/env.ts` as a pure, testable validator plus narrow accessors. Failures name the missing variable and feature and explain where to configure it.

Build validation is called from `apps/web/next.config.ts`; runtime accessors repeat the guard defensively so a direct invocation cannot degrade into an SDK initialization error.

Validation rules:

- core web always requires one Supabase URL (`NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`) and one anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`);
- when `BOOKING_LIVE=true`, require `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL`;
- when `AGENT_LIVE=true`, require either `AI_GATEWAY_API_KEY` or the Vercel runtime identity (`VERCEL=1`);
- disabled features do not require their provider secrets;
- secret values are never included in error messages or logs.

R7.2 remains responsible for making the three feature flags the UI-wide single source of truth. R7.1 only establishes validation semantics for the flags when supplied.

## Smoke funnel

Add an `apps/e2e/specs/funnel-smoke.spec.ts` journey that runs on every pull request:

1. open the homepage;
2. follow a visible featured guide link;
3. assert HTTP/render success, guide title, and creator identity;
4. follow its guide-attributed experience link;
5. assert HTTP/render success and visible currency/price;
6. only when `BOOKING_LIVE=true`, submit a valid test fixture and assert a Stripe test-mode Checkout URL/session is created.

The local Supabase seed gains one deterministic published guide and one published experience in the same city, with the minimum active creator/merchant relationships needed by current RLS and query filters. Stripe state is not created in ordinary PR CI because `BOOKING_LIVE` defaults off there.

The existing 404 fixture list gains unknown guide and experience slugs. Host tests cover both `notFound()` branches.

## Sitemap crawler and nightly synthetic

Add `scripts/crawl-sitemap.ts`, executable with the repository's Node 22 floor. It:

- fetches `/sitemap.xml` from `BASE_URL` or the production default;
- follows sitemap-index shard URLs recursively;
- de-duplicates page URLs;
- fetches every listed URL with bounded concurrency and redirect following;
- reports the URL and status for every failure;
- exits non-zero for network errors or final status `>= 400`.

It never invents application routes. Auth, sign-up, merchant-application, and other robots-disallowed URLs remain outside scope because they are not sitemap-listed.

Add `.github/workflows/nightly-funnel.yml` with `schedule` and `workflow_dispatch`. The workflow installs pinned dependencies and Playwright Chromium, runs the smoke funnel against production, then runs the sitemap crawler. A red workflow run is the alert; no production write is attempted while `BOOKING_LIVE=false`.

## Testing strategy

Implementation follows red-green-refactor:

- route host tests first reproduce the secondary-query failure cases and prove the primary page still renders;
- rendering-mode tests pin removal of static generation and explicit dynamic rendering;
- cross-link tests prove query rejection returns no module;
- environment tests cover core requirements, feature-gated provider requirements, Vercel AI identity, and secret-free messages;
- error-boundary tests cover retry, localized Explore link, and route locale;
- crawler tests cover a flat sitemap, sitemap index, redirects, network failure, and `>= 400` failure;
- Playwright covers known and unknown leaf routes plus the guide-to-experience smoke journey;
- typecheck, lint, targeted Vitest, locale parity, full unit suite, production-safe E2E, and the production sitemap crawl are required before merge.

## Scope exclusions

- No production Supabase writes or seed application.
- No Stripe Checkout creation while `BOOKING_LIVE=false`.
- No R7.2 feature-state UI changes.
- No R7.3 content/fixture cleanup beyond deterministic local CI fixtures.
- No Cache Components, PPR, or broad auth-provider refactor.

## Acceptance mapping

- Published guide/experience 200s: explicit dynamic rendering removes the static/cookie conflict.
- Unknown slug 404: existing behavior is pinned for both route trees.
- Secondary failure containment: every optional loader has a tested fallback.
- Branded recovery: nearest segment boundary provides retry and Explore navigation.
- Actionable configuration: build validation names the missing feature variable.
- Continuous detection: PR smoke plus nightly production smoke/sitemap crawl.
