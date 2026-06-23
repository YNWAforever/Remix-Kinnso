# Product Reorganization & Roadmap — design

**Date:** 2026-06-24
**Status:** Approved (design); pending spec review → implementation plans
**Repo:** `kinnso-v3` (web app `apps/web`, DB package `@kinnso/db`, scan worker `apps/scan`)
**Builds on:** Merchant Brief Flow v1, Front-of-House Slices 3d/3e/3f, Creator Missions Journey, Creator Studio dashboard, the DNA-scan worker. This spec does **not** redesign those features — it reorganizes the *whole surface* they live in into one coherent product and sets the build order.

---

## Purpose

KINNSO v3 has grown to **35 routes** across public, auth, creator, merchant, and ops surfaces. A focused audit (see *Evidence base*) found a genuinely working Studio + Missions + Merchant core wrapped in a half-mock marketing/discovery shell and several empty "Coming Soon" stubs that are wired into the navigation as if they were real. The result reads as a demo in places and a product in others, with dead clicks in the primary nav and fabricated data presented as live on surfaces a creator owns.

This spec **reorganizes the surface into a coherent, honest product** and **sequences the work** to get there, optimized for a **creator-supply soft launch**. It is the parent design; each roadmap phase becomes its own implementation plan.

## Objective & governing principles

**Objective (chosen):** *Creator-supply soft launch.* The spine that must shine is **public acquisition → onboarding → Creator Studio**. The merchant side stays *real-but-minimal* (keep the real pipeline reachable so creators have real missions to join; do not invest in merchant marketing polish). Articles and guides matter as SEO/acquisition fuel.

**Principles:**

1. **No dead clicks.** Every link in the navbar or footer reaches real content, or it is removed.
2. **No fabricated data on owned surfaces.** A creator never sees fake numbers attributed to themselves or presented as live platform activity.
3. **Decide mock pages per-page.** Each mock/hybrid/stub surface gets an explicit disposition — *keep / wire-to-real / de-mock / build / cut* — weighted by what real data actually exists today.
4. **Don't rebuild what's already merged.** Reconcile the local checkout with `origin/main` before building (see critical finding below).
5. **Honest over impressive, but aspirational where truthful.** Marketing pages may sell the vision; they may not invent live data.

## Evidence base

Produced by a parallel audit (6 reader agents + a synthesis pass) over every route, the nav/footer link graph, the design specs, and the `lib/creator-mock` → real-Supabase-table feasibility gap. Key outputs:

### Critical finding — the local checkout is one commit stale

Local `main` is at `a36c339`; `origin/main` is at `db3d8a2` (PR #36), **exactly one commit ahead**. PR #36 contains the entire **Creator Missions Journey Stage B (mission detail) + Stage C (submit → auto-verify → review) + YouTube proof verification**. On the local checkout `/studio/missions/[id]` renders `ComingSoonPage`, so the missions loop *appears* broken — but it is **already built and merged on `origin/main`**. The whole `JOIN → SUBMIT → VERIFY → REVIEW` loop exists; we must not rebuild it. There may also be three hardening commits stranded on `feat/missions-bc-i18n-youtube` (realtime publication for `mission_verification_jobs`, int4 clamp on YouTube engagement, clearing prior snapshots on re-verify) worth confirming landed.

### Route inventory (current → decision)

| Route | Persona | Current | Real data source / gap | Decision |
|---|---|---|---|---|
| `/` (home) | public | mock | `HomeView` renders `creator-mock` + hardcoded ticker/logos; never calls the real `getPublishedGuides()` | de-mock + wire guides rail |
| `/explore` | public | hybrid | `getPublishedGuides()` real, but `mergeWithSeed()` always appends mock guides | keep (canonical guides) + drop seed |
| `/feed` | public | hybrid | identical data + UI to `/explore` | consolidate → redirect to `/explore` |
| `/g/[slug]` | public | hybrid | real DB guide if present, else mock fallback; author link asymmetric | de-mock + fix author link |
| `/articles`, `/articles/[category]`, `/articles/[category]/[url]` | public | real | `searchArticles()`/`getArticleDetail()` RPC over Supabase | keep + polish (cross-locale fallback, link affordance) |
| `/creators` | public | mock | `creator-mock` cards; no real creators read | honest marketing now → real directory (Phase 3) |
| `/c/[handle]` | public | mock | 100% `creator-mock`; `creators` table has only `id, display_name, status`; no posts/locations/metrics tables | build real (Phase 3) |
| `/creators/apply` | creator | real (redirect) | redirect-only alias for `/creator` | collapse into unified apply funnel |
| `/about` | public | coming-soon | stub; footer points 4 labels here | build minimal (About + Contact) |
| `/agent` | public | coming-soon | stub; in top nav | **build** — Creator Copilot (marketing now, tool later) |
| `/offers` (public) | public | coming-soon | stub; collides with real `/studio/offers`; orphan | cut |
| `/legal/creator-terms` | public | coming-soon | stub; footer "Legal" | build minimal (real terms) |
| `/sign-in`, `/sign-up` | auth | real | Supabase auth | keep + fix (creator framing, role-aware redirect, terms link) |
| `/creator` (onboarding) | creator | real | Supabase owner reads; `WizardClient` | keep |
| `/studio` (dashboard) | creator | real | Supabase + missions/offers/settlements domain | keep + fix opportunity deep-links, inbox tile |
| `/studio/scan` | creator | hybrid | real DNA core, but **all numeric metrics overlay mock `maywanders`**; anon demo fully fabricated | de-mock (real DNA only) |
| `/studio/guides`, `/new`, `/[id]/edit` | creator | real | Supabase `guides`, owner-scoped | keep + fix quick-link label |
| `/studio/offers` | creator | real | `listAffiliateOffers()` (Travelpayouts missions) | keep (needs prod seed/env) |
| `/studio/earnings` | creator | real | `listCreatorSettlements()` + `summarizeCreatorEarnings()` | keep (empty until settlements authored) |
| `/studio/missions` (list) | creator | real | `listCreatorMerchantMissions()` (Stage A) | keep + wire list→detail links |
| `/studio/missions/[id]` | creator | coming-soon *(local)* | real on `origin/main` (#36) | land from origin (Phase 0) |
| `/studio/inbox` | creator | coming-soon | stub | disable tile (backlog) |
| `/merchants` | merchant | mock | mock sample missions; cards mis-link to `/merchants/creators` | honest marketing + link to real pipeline |
| `/merchants/creators` | merchant | mock | no tier/quota/match data in schema | cut from nav (backlog) |
| `/merchants/missions` (+ `[missionId]`) | merchant | real, orphan | `listMerchantMissions()` + review actions; no nav link, no card→detail link | wire nav + detail links + back-nav (Phase 1) |
| `/merchants/post` | merchant | real | `createMissionAction` | keep + fix dead-end success |
| `/ops/settlements` | ops | real, orphan | `listOpsSettlements()` + `updateSettlementAction`; ops-only | keep + minimal back-nav |

### Orphans (reachable only by direct URL)

- `/offers` (public) — stub, no inbound links → **cut**.
- `/merchants/missions` and `/merchants/missions/[missionId]` — real but linked only as `revalidatePath` targets → **wire into nav** (Phase 1).
- `/ops/settlements` — intentional internal island; reached only via the `/studio` role redirect → **add back-nav**.
- `/studio/missions/[id]`, `/studio/inbox` — stubs on local main → resolved by Phase 0 (missions) / disabled (inbox).

### Dead / mock links to fix

Top-nav `AI Agent` → stub (now becomes a real page); footer `About`/`Case Studies`/`Press`/`Contact` all → one `/about` stub; footer `Legal` → stub; nav `Creators`/`Merchants` → mock landings; `Find Creators` → mock; home `EarningsTicker` → fabricated payouts; home partner-logo wall → fake brands; `/studio/scan` badged "Live" but shows mock metrics; `Apply` → generic `/sign-up`; "New Guide" tile → the list, not `/new`; footer social links are non-clickable `<span>`s; `/merchants/creators` "Send brief" → `/merchants/post?creator=` which is ignored.

### Mock → real feasibility (decides what can be wired vs must be built)

- **Available today (wiring only):** home featured-guides rail (`getPublishedGuides()` already live).
- **Real but conditional on prod state:** `/studio/offers` (Travelpayouts seed + env), `/studio/earnings` + `/ops/settlements` (empty until settlements authored). Not fake — real empty-states.
- **Not backable now (needs schema + pipeline):** creator public profiles & directory (`creators` lacks handle/slug/avatar/public fields + public-read RLS; **no tables** for posts/locations/place-tags/engagement-history; **no source** for score/tier/ER/reach/GMV); merchant tier/quota/match (no columns, no signals); `/studio/scan` numeric metrics (only qualitative DNA is stored).

### Designed-but-not-built / deferred (from specs + git)

Stage B/C missions + YouTube verification (merged on `origin/main`, land via Phase 0); Travelpayouts event-import / `affiliate_network_events` sync (no job exists; settlement stays manual); Stripe/escrow/auto-payout (explicit v1 non-goal).

## Target architecture — three honest zones

The 35-route sprawl collapses into three zones governed by the principles above.

- **Public · acquisition** — `home → guides (explore) → guide detail → articles → apply`, plus the new `/agent` Creator Copilot marketing page and (Phase 3) a real creator directory, plus minimal `about/contact` and `legal/terms`. Job: convert creators to sign up and rank in search.
- **Creator · the spine** — `sign-up (apply) → /creator onboarding → Studio`, where Studio = `dashboard, scan, guides, offers, missions (+detail), earnings`, and later `/studio/copilot`. Must be flawless and honest.
- **Merchant + ops · minimal** — `merchants landing, post a mission, my missions (+review)`, and `ops settlements`. Real pipeline kept reachable; mock merchant tooling cut from nav.

(See the inline IA surface map shared during design for the colored keep/wire/de-mock/build/cut view.)

## New pillar — Creator Copilot + tier/contribution backbone

The `/agent` route is not a stub to cut; it is a product pillar that strengthens the creator-supply thesis ("join KINNSO → get an AI copilot → climb a rewards ladder").

### Creator Copilot

A library of **saved AI agents** that help creators **grow their audience, find content inspiration, and produce better content** — so they earn more. Delivery is split:

- **Now (Phase 2):** a real, honest **marketing/value-prop page** at `/agent` — explains the copilot, sets expectations, an acquisition hook (no fabricated agent output presented as live).
- **Later (Phase 5):** the actual AI agents living **inside Studio** (`/studio/copilot`), gated by tier.

### Tier / contribution backbone (cross-cutting)

Because the "exclusive perk for qualified higher-tier creators" spans **all four** of: premium copilot capability, better affiliate commissions / member-only deals, exclusive paid-mission access, and a partner perks catalog — the leveling system is a **foundational backbone**, not a feature corner. Conceptually: `contribution_points → level → tier`, where contribution accrues from real activity (guides published, missions completed/verified, performance), and tier gates capability across surfaces:

- **Copilot:** higher tiers unlock more/better agents + higher usage limits.
- **Offers/earnings:** higher tiers get better commission splits or member-only Travelpayouts/merchant deals.
- **Missions:** higher tiers get first/exclusive access to premium paid missions.
- **Perks catalog:** a new surface of third-party discounts redeemable by level.

This backbone is the heaviest new build and anchors the final phase. It touches `creators`/new tier tables, `missions` eligibility, `mission_settlements`/offers commission logic, and the copilot. It is **deliberately specified at the concept level here** — its detailed schema, scoring rules, and RLS are a dedicated design + plan when Phase 5 begins.

## Roadmap

Each phase is independently shippable and becomes its own implementation plan.

- **Phase 0 — Reconcile (prerequisite, hours).** `git pull` to fast-forward local `main` to `origin/main` (`db3d8a2`), landing Stage B/C missions + YouTube verification. Confirm the three possibly-stranded hardening commits on `feat/missions-bc-i18n-youtube` are present in a merged commit; cherry-pick if not. Smoke-test role-based redirects + the hydration CTA in a running app (the audit was static-only).
- **Phase 1 — Honest navigation & reachability.** Keep `/agent` in nav; cut public `/offers` and `/merchants/creators` from nav; consolidate `/explore`+`/feed` (redirect `/feed` → `/explore`); fix footer dead-ends (collapse the 4 → `/about` labels), give social links real `href`s or remove them, fix label/route mismatches (`Apply`, "New Guide", "Pricing"), disable the inbox tile; **wire the orphaned-but-real pages into nav** — merchant missions queue + card→detail + back-nav, ops back-link. *Outcome: zero dead clicks; every real surface reachable.*
- **Phase 2 — De-mock the creator spine + Copilot marketing.** `/studio/scan` shows the creator's real DNA only (remove the `maywanders` metric overlay; flag/relabel or remove the anon demo); drop `mergeWithSeed` so public guides are real-only; wire home's real featured-guides rail and remove the fake ticker + partner-logo wall; make `/creators` honest marketing (no fabricated creators); fix the apply funnel (creator framing on `/sign-up`, role-aware post-login redirect, terms-checkbox link, unify `/creators/apply`); ship the real `/agent` Creator Copilot marketing page.
- **Phase 3 — Real creator directory.** Enrich `creators` (handle/slug, avatar, public bio/fields) + public-read RLS; rebuild `/c/[handle]` and a browsable directory index from real data; the profile renders only what real data supports (qualitative DNA + handles + published guides) — fabricated numeric metrics are dropped unless/until a real metrics pipeline exists. The "get discovered" payoff.
- **Phase 4 — Merchant loop polish + trust/content.** Merchant UX (empty-states with a "post a mission" CTA, real creator display names via a `creators` join, post-success → mission/queue link, decide the `?creator=` prefill); real About + Contact; real creator terms/legal; articles polish (cross-locale fallback, link affordance); ensure the Travelpayouts seed + env exist in prod so `/studio/offers` (and downstream earnings) populate.
- **Phase 5 — Creator tier/contribution backbone + Copilot tool v1.** Dedicated design first. The leveling/contribution scoring + tier gating as a cross-cutting system; the first working AI agents in `/studio/copilot`; wire tier perks into copilot capability, commission/member deals, mission eligibility; the partner perks catalog.

**Backlog (explicitly deferred):** `/studio/inbox` (creator↔merchant messaging); Travelpayouts event-import auto-settlement signals; Stripe/escrow/auto-payout (v1 non-goal); merchant tier/quota/billing + real creator-match search (`/merchants/creators` real version).

## Decomposition into implementation plans

This parent spec yields a sequence of plans: **Phase 0** is an ops/git checklist (no plan needed); **Phase 1** and **Phase 2** are the first two implementation plans (web-only, no migration except possibly small additive copy/i18n); **Phase 3** carries a `creators` migration + RLS and gets its own plan; **Phase 4** is mixed (web + ops/env); **Phase 5** gets its own design spec before any plan because the tier backbone is a new subsystem. We write and execute one plan at a time, reviewing between.

## Verification & open items (resolve in Phase 0)

- Confirm `origin/main` fast-forward lands Stage B/C + YouTube verification, then re-confirm `/studio/missions/[id]`, `/studio/missions`, and `/merchants/missions/[missionId]` against the real code.
- Confirm the three hardening commits on `feat/missions-bc-i18n-youtube` are in a merged commit before that branch is deleted.
- Verify the live deploy's Travelpayouts **seed + env** state to know whether `/studio/offers` is populated in production.
- Smoke-test the `proxy.ts` gating, role redirects, and the client `useViewerRole` CTA swap at runtime (the audit relied on static reading; `apps/web/AGENTS.md` warns the Next.js setup differs from training data).
- Confirm whether the residual guide-seed merge in `getPublishedGuides()` is intended for production or leftover demo scaffolding (Phase 2 removes it for public listings).

## Non-goals

- Redesigning Studio, Missions, Merchant Brief Flow, or the Market Passport visual system — those stay as built.
- Payments: Stripe checkout, escrow, automated payouts (settlement remains manual/ops-authored).
- The detailed tier-backbone schema/scoring and the AI agent implementations — concept only here; dedicated design at Phase 5.
- The Laravel monolith, FOSO admin, and chatbot surfaces — out of scope; this covers only the `kinnso-v3` Next.js web app.

## Success criteria

- Every navbar and footer link reaches real content; no "Coming Soon" stub is reachable from primary navigation.
- No surface a creator owns shows fabricated numbers or fake live activity.
- A creator can complete the full spine on real data: sign up → onboard → scan (real DNA) → Studio → join a real mission/offer → submit → verified → earnings status; and be discoverable via a real profile (Phase 3).
- A merchant can reach and operate their real pipeline entirely through the UI.
- `/agent` is a real Creator Copilot page, and the tier/copilot build is scoped and sequenced as the final phase.
