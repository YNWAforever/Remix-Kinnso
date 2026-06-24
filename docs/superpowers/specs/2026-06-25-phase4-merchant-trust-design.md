# Phase 4 — Merchant Loop Polish + Trust/Content

**Date:** 2026-06-25
**Status:** Approved (design)
**Branch:** `feat/phase4-merchant-trust` (cut fresh off `origin/main` @ `161e49a`)
**Parent roadmap:** `docs/superpowers/specs/2026-06-24-product-reorg-roadmap-design.md` (Phase 4)

## Goal

Close the remaining honesty/usability gaps so a merchant can operate their pipeline end-to-end and every footer/nav link reaches real content. Three strands:

- **A. Merchant loop polish** — real creator names, post-success navigation, empty-state CTA, drop a dead query param.
- **B. Trust/content** — real About, real Contact, real (plain-language MVP) creator terms, article cross-locale fallback.
- **C. Travelpayouts go-live** — make `/studio/offers` populate in production (live ops, not code).

One branch, one PR. Strands A and B are TDD code; strand C is a live deploy/data task done via Supabase MCP + a live-deploy smoke test.

## Non-goals

- Creator-invite mechanics (an actual "invite @handle to this brief" flow). Removing the dead `?creator=` param, not building the feature behind it.
- New RLS policies. Strand A reuses Phase 3's already-public `creators` columns.
- Lawyer-reviewed legal text. The creator terms are an explicitly-marked MVP draft.
- Machine-translating legal prose into 7 locales (see B3).
- A Contact form / backend. Contact is a `mailto:` only.
- Redesigning Studio, Missions, or the Merchant Brief Flow visual system.

---

## Strand A — Merchant loop polish

### A1. Real creator names in merchant views

**Current:** `app/[locale]/merchants/missions/[missionId]/page.tsx` renders `Creator ${creatorId.slice(0, 8)}` for every participant — a fake placeholder.

**Design:** Phase 3 already granted `select on public.creators to anon` and added the row policy `creators_public_read` (rows where `status='active' and handle is not null and public_profile is not null`). Column access flows through the grant; the policy gates *rows*. So `display_name` / `handle` are **already readable for active + published creators by any client** — no new RLS, no migration.

Add a server helper `getCreatorPublicNames(ids: string[]): Promise<Map<string, { name: string; handle: string | null }>>` in `lib/creators/queries.ts`:
- Selects `id, handle, display_name` from `creators` where `id in (ids)` (anon/authed client; RLS returns only published rows).
- Returns a map keyed by id; `name` = `display_name ?? handle ?? null`.

The merchant detail page builds the id list from participants, calls the helper once, and renders:
- Real `name` linked to `/${locale}/c/${handle}` when a handle exists.
- A neutral `"Creator"` label (i18n) for ids absent from the map (onboarded-but-never-published creators) — **never** a fabricated id slice.

### A2. Post-success → mission link

**Current:** `createMissionAction` returns `{ ok: true, missionId }`; `MissionPostWizard` sets `submitted = true` and stops — the merchant is stranded with no way to the mission they just made.

**Design:** On success, the wizard renders a success panel:
- Title `missions.postSuccessTitle`, body `missions.postSuccessBody`.
- Primary link `missions.viewMission` → `/${locale}/merchants/missions/${missionId}`.
- Secondary link `missions.backToQueue` (existing key, Phase 1) → `/${locale}/merchants/missions`.

### A3. Empty-state CTA on the missions list

**Current:** `MerchantMissionsView` renders an empty `<div>` when `missions.length === 0`.

**Design:** Render an empty state — `missions.missionsEmptyTitle`, `missions.missionsEmptyBody`, and a primary CTA `missions.postMissionCta` → `/${locale}/merchants/post`.

### A4. Remove the dangling `?creator=` param

**Current:** `components/kinnso/CreatorMatchCard.tsx` builds `briefHref = /${locale}/merchants/post?creator=${encodeURIComponent(creator.handle)}` — nothing consumes it.

**Design:** Change `briefHref` to `/${locale}/merchants/post` (no param). Update the card's test to assert the param-free href.

---

## Strand B — Trust/content

### B1. About page (real)

Replace `renderComingSoonPage` in `app/[locale]/about/page.tsx` with a real `AboutView` server component using the existing design system. Honest copy: what KINNSO is (a creator-first travel/lifestyle community with a real creator-monetization spine), who it serves (creators + merchants), and a candid soft-launch framing. New i18n group `about` (×7 + `Messages` interface), properly translated — the copy is short.

### B2. Contact page (real)

New route `app/[locale]/contact/page.tsx` (+ `ContactView`): intro, a `mailto:business@kinnso.ai` CTA, and a brief response-time note. Wire the footer `lContact` link (currently dangling) to `/${locale}/contact`. New i18n group `contact` (×7 + interface), translated.

### B3. Creator terms (real, plain-language MVP)

Replace the Coming Soon stub in `app/[locale]/legal/creator-terms/page.tsx` with a real terms page, clearly marked **"MVP draft, subject to change."** Sections:
- Honest content & affiliate-link disclosure.
- How commissions / earnings work — manual settlement, no income guarantees.
- Data & privacy basics.
- Account & termination.
- Contact (`business@kinnso.ai`) for questions.

**Localization decision:** the legal **body is a single English source** (a constant in the view). Machine-translating legal prose into 7 locales is low-quality and risky. Only the page **chrome** is localized ×7: title, the "MVP draft" notice, and a "this document is provided in English" notice. New i18n group `creatorTerms` (chrome keys only, ×7 + interface).

### B4. Article cross-locale fallback + affordance

**Current:** `app/[locale]/articles/[category]/[url]/page.tsx` via `lib/articles/queries.ts` picks the exact-locale translation and `notFound()`s if it's missing.

**Design:** translation selection order — exact `locale` → `en` → first available — and only `notFound()` when **no** translation exists. When the rendered translation isn't the requested locale, show a small notice (new key in the existing `article` group, ×7) naming the language shown. Hub cards are already full-block links; add a visible "Read →" cue only if one is missing (verify during implementation).

---

## Strand C — Travelpayouts go-live (live ops)

Not code. A deploy/data task:

1. `list_migrations` on `scryfkefedzuetfdtrvl`; apply `supabase/migrations/20260622153645_seed_travelpayouts_offers.sql` if absent (idempotent `ON CONFLICT` upserts).
2. Ensure the `ops-system@kinnso.internal` auth user exists and its `kinnso_ops_members` row is `status='active'` — the seed's `where exists (select 1 from kinnso_ops_members where status='active')` guard decides whether the 8 offers insert at all.
3. Env vars (`TRAVELPAYOUTS_API_TOKEN` / `_PROJECT_ID` / `_MARKER`) — already set in Vercel (confirmed by owner).
4. Smoke the **live Vercel deploy**: `/studio/offers` shows the real 8-offer catalog and no "Setup pending" banner (env detected). Authenticated per-user partner-link *generation* is only partially verifiable without a creator session on the deploy; confirm what's checkable and flag anything that needs the owner to click through while logged in.

---

## i18n surface (parity test must stay green)

7 locale files (`en/ja/ko/th/zh-cn/zh-hk/zh-tw`) + the `Messages` interface in `en.ts` (default export). `tests/i18n.locale-parity.test.ts` enforces identical key paths across all 7 + the interface.

- **New groups:** `about`, `contact`, `creatorTerms` (chrome only).
- **Additions:** `missions` (`postSuccessTitle`, `postSuccessBody`, `viewMission`, `missionsEmptyTitle`, `missionsEmptyBody`, `postMissionCta`, and a neutral `creatorFallback` label for A1); `article` (locale-fallback notice).
- Decorative back-arrows stay `aria-hidden` (prior gotcha — they pollute the link's accessible name and break `getByRole` name matches).

## Verification gates (every code task)

`pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm build` · touched tests via `pnpm exec vitest run <files> --no-file-parallelism` (run `pkill -f vitest` first if the box is loaded) · the i18n locale-parity test.

Rendering tests need `// @vitest-environment jsdom` as the first line + `afterEach(cleanup)` (global env is `node`); import en messages as a **default** (`import en from '@/lib/i18n/messages/en'`).

## Success criteria

- Merchant detail shows real creator names (or an honest neutral label), never a fake id slice; names link to `/c/[handle]` when available.
- Posting a mission lands the merchant on a success panel that links to the new mission and the queue.
- The empty missions list invites posting a mission.
- No `?creator=` param that does nothing.
- About, Contact, and creator terms are real pages; no Coming Soon stub is reachable from the footer; the Contact link resolves.
- An article in a locale without a translation renders a fallback (with a notice) instead of 404.
- `/studio/offers` shows the real Travelpayouts catalog on the live deploy.
