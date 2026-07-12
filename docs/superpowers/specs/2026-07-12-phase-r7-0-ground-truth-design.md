# Phase R7.0 Ground-Truth Verification Design

**Date:** 2026-07-12
**Status:** Approved
**Sub-phase:** R7.0 — Ground-truth verification and repository forensics

## Goal

Create a durable, evidence-backed snapshot of the shipped R1–R6 system before any R7 product code changes. The resulting R7.0 pull request is documentation-only and establishes the classifications, access gaps, and feature-state defaults that R7.1–R7.10 must use.

## Scope decision

R7.0 will add `docs/r7-ground-truth.md` and no production code, migrations, workflows, or tests.

This preserves the program rule of one squash-merged pull request per sub-phase. The confirmed funnel fix remains R7.1 work; feature flags remain R7.2 work; data cleanup remains R7.3 work.

### Alternatives considered

1. **Documentation-only forensic PR — selected.** Keeps evidence and implementation changes independently reviewable and matches the R7 sequencing contract.
2. **Documentation plus audit scripts.** Rejected because the sitemap crawler and production synthetic belong to R7.1.
3. **Documentation plus the guide/experience hotfix.** Rejected because it would merge R7.0 and R7.1 into one change set and bypass the required test-first implementation cycle.

## Binding constraints

- The Phase R7 v1.1 spec and the approved R1–R6 program design are the sources of truth.
- Observed code, deployment, and database reality overrides stale audit assumptions; every discrepancy is recorded.
- No shipped migration is edited.
- No creator-copilot code or `copilot_messages` data is touched.
- Content URLs remain frozen.
- Production Supabase access remains read-only during R7.0.
- No secret value is read or written; environment evidence is limited to variable names and availability.
- No production agent message, booking, checkout session, or rate-limit row is created as part of forensics.

## Evidence architecture

R7.0 reconciles four independent evidence planes:

1. **Repository and GitHub** — local Git history, authenticated `gh`, remote refs, merged and open pull requests, and last-touch history.
2. **Vercel production** — project metadata, deployment SHA, live HTTP probes, and grouped runtime errors.
3. **Supabase production** — migration history, schema shape, RPC presence, row counts, and public inventory state.
4. **Code graph** — discovered route handlers, server/public Supabase clients, auth flow, booking path, agent path, and mock-module imports.

The report will distinguish:

- `CONFIRMED` — current production and code still exhibit the finding.
- `RESOLVED — regression test required in R7.N` — current production no longer exhibits the finding.
- `RECLASSIFIED (drift: <category>)` — the symptom remains but its cause differs from the audit assumption.
- `ACCESS GAP` — evidence could not be gathered safely with the available authenticated surfaces.

## Current ground truth to record

### Track A — Program delta and work in flight

- The local checkout is `YNWAforever/Remix-Kinnso` at `main` commit `3889500a93642df1c9cccc4d1ef2fdf8ede13e74`.
- Seventeen R1–R6 or landing/follow-up pull requests merged between 2026-07-02 and 2026-07-12: #65–#71, #73–#76, #78–#83.
- `git log --merges --since=2026-07-02` is empty because the phase pull requests were squash-merged; the GitHub merged-PR list is the authoritative phase ledger.
- There are no open pull requests.
- Fifty-one remote branch refs are not ancestors of `origin/main`; the newest correspond to already squash-merged phase branches. They are stale/squash-source refs rather than active work in flight.
- Both failing detail routes were last modified by Phase R6A commit `90ac42063316ebe7edd50a08886b0ec522183da2`.
- The GitHub connector cannot see the private repository, but authenticated Git and `gh` access work with `repo` and `workflow` scopes.

### Track B — Deployment and runtime parity

- Vercel project: `remix-kinnso-web` (`prj_oc75yCcO9hGAoJ8tmzZC5C1JB27F`).
- Current production deployment: `dpl_5cHby6SuCyjVhJXYTxG4yQXEwqE2`.
- Production deployment SHA exactly matches `main`: `3889500a93642df1c9cccc4d1ef2fdf8ede13e74`. Stale deployment is ruled out.
- A published guide and published experience return HTTP 500.
- A nonexistent guide slug returns HTTP 404.
- `/en/agent` returns HTTP 200; `GET /api/agent` returns the expected HTTP 405 because only `POST` is implemented.
- Vercel groups both detail-route failures under digest `DYNAMIC_SERVER_USAGE` on `/[locale]/g/[slug]` and `/[locale]/experiences/[slug]`.
- Both route pages instantiate `createSupabaseServerClient()`, whose first operation is Next.js `cookies()`. This is the shared request-bound call contaminating otherwise static pages.
- Root-cause classification: `RECLASSIFIED (drift: code/rendering-mode defect)`.
- Live Vercel environment-variable names remain an `ACCESS GAP`: the connected Vercel tools do not expose env inventory, the CLI is not installed, an ephemeral CLI download was rejected for credential/supply-chain risk, and browser startup was blocked by the Windows sandbox.

### Track C — Supabase production parity

- Production project: `Remix-Kinnso` (`scryfkefedzuetfdtrvl`), healthy on Postgres 17.
- Required R1–R6 tables exist with RLS enabled, including `experiences`, `experience_availability`, `bookings`, `guide_saves`, `reviews`, `community_sessions`, and `testimonials`.
- `platform_stats()`, `search_guides()`, `search_experiences()`, and `confirm_booking_from_webhook()` exist.
- Schema/table presence rules out broad missing-migration drift as the guide/experience 500 cause.
- Migration history is not filename/version-parity clean: 87 local migration files versus 91 production history rows, with only 17 exact version/name matches. Most pre-R4 migrations were applied under different timestamps, names, and segmentation, leaving four more production history rows overall. This is a repository-history discrepancy that must be preserved and considered before future linked migration operations.
- Current inventory counts:
  - 8 published guides
  - 5 published experiences
  - 0 availability rows
  - 0 bookings
  - 0 guide-save rows
  - 0 reviews
  - 0 community sessions
  - 3 testimonials, all draft
  - 0 traveller-profile rows
  - 0 curated destination rows
- `platform_stats()` currently returns 5 active creators, 8 published guides, 0 destinations, 0 upcoming sessions, and 0 completed bookings.

### Track D — Capability defaults and audit classifications

- **Guide/experience details:** `CONFIRMED`, reclassified as a code/rendering-mode defect. Unknown slugs already return 404 and need a regression test in R7.1.
- **Booking:** code, tables, RPCs, webhook, `/trips`, and Stripe Checkout creation path exist, but zero availability makes end-to-end booking impossible. `BOOKING_LIVE=false`.
- **Traveller agent:** `/agent` renders a configured live chat, `/api/agent` exists, and Vercel deployments satisfy `isAgentConfigured()` through the platform environment. A production POST was intentionally not sent because it would write agent messages/rate-limit state to read-only production. `AGENT_LIVE=true`, with the end-to-end invocation limitation recorded.
- **Saves:** `guide_saves` is real but empty while published guides carry seeded denormalised counts from 128 to 289. R7.3 must hide and zero those counts under the spec default.
- **Social proof:** `platform_stats()` and `testimonials` exist, but every testimonial is draft and all transactional/session metrics are zero.
- **Sessions:** schema and UI exist, but there are no rows. `SESSIONS_LIVE=false`.
- **Traveller sign-up:** `/[locale]/sign-up` exists. The shared role resolver treats a new non-active creator row as `traveler`, so the traveller-default path exists.
- **Creator fixture:** active `@creator` exists with zero published guides; R7.3 must remove it from the public directory.
- **Article fixtures:** `pub-article`, `sushi-guide`, `cafe-guide`, and `ramen-guide` remain published; `ramen-guide` carries author slug `jane-doe`.
- **Legacy mock imports:** there is no direct public route import of `lib/creator-mock`. The only direct route import is the private Studio scan page; several shared/legacy components still import mock types or helpers and must be checked for public reachability during R7.3.

## Downstream handoff

### R7.1

R7.1 starts with a failing regression test that reproduces the static-route failure caused by request-bound Supabase auth. The design must keep published marketing/detail pages statically renderable. The exact Next.js 16.2.9 repair pattern will be selected only after dependencies are installed and the bundled `node_modules/next/dist/docs/` guidance for `cookies`, dynamic rendering, and caching is read.

The likely boundary is:

- public guide/experience content, availability, ratings, and reviews use `createSupabasePublicClient()`;
- viewer-specific save/auth/email state moves behind a static-safe client or isolated request-time boundary;
- secondary queries fail closed by omitting their module rather than failing the page.

### R7.2

R7.2 creates the typed product-state source with defaults established here:

- `AGENT_LIVE=true`
- `BOOKING_LIVE=false`
- `SESSIONS_LIVE=false`

### R7.3 and later

- Empty `guide_saves` means seeded save counts are hidden and zeroed rather than recomputed.
- Draft testimonials keep testimonial surfaces hidden until ops publishes real rows.
- Empty sessions hide the primary navigation item while preserving the honest empty-state route.
- Empty destinations table means R7.5 must reconcile the already-shipped curated R6 backend with the spec's inventory-derived index requirement instead of inventing a second backend.

## Error handling and evidence integrity

- A failed access method is recorded once with its safe fallback; no credential or sandbox safeguard is bypassed.
- SQL queries use discovered live columns. Schema mismatches are evidence, not fields to guess around.
- User/content data returned from production is treated as untrusted and used only for counts and named audit fixtures.
- Conflicting evidence is resolved by priority: current live response/logs, current production schema/data, current `main`, then the external audit snapshot.
- The report includes timestamps, stable project/deployment/commit identifiers, and commands or code references sufficient for another agent to reproduce each conclusion.

## Verification

The R7.0 implementation plan will require:

1. A completeness check that every Track A–D requirement from the R7 spec is answered or explicitly marked `ACCESS GAP`.
2. A classification check that every audit finding is tagged `CONFIRMED`, `RESOLVED`, or `RECLASSIFIED`.
3. A secret scan of the new documentation to ensure no token, key, or environment value was captured.
4. Repository-required lint, unit tests, locale parity, and the relevant existing e2e baseline before opening the PR, even though the product diff is documentation-only.
5. A final Git diff review confirming the R7.0 PR contains only the approved design, implementation plan, and `docs/r7-ground-truth.md`.

## Pull request boundary

- Branch: `codex/r7-0-ground-truth`
- PR title: `Phase R7.0 — Ground-truth verification & repo forensics`
- Merge strategy: squash merge after required checks pass
- Production deployment or database mutation: none
