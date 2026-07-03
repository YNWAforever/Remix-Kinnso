# Phase R2 — Merchant Supply: Design

**Date:** 2026-07-03
**Status:** Proposed (derived from the approved master design; pending user review)
**Parent:** `docs/superpowers/specs/2026-07-02-product-revision-program-design.md` (§6 R2)
**Scope:** apps/web, supabase/migrations. Charter (master §6): merchant self-serve
application → ops review queue (<48 h target); `experiences` entity + merchant CRUD;
public `/merchants` directory, `/m/[slug]`, `/experiences/[slug]` with a
"booking opens soon" state; merchant app consolidation under `/merchants/dashboard/*`
with permanent redirects. **Kick off Stripe HK account/KYC at R2 start** (user/business
action, not code).

---

## 1. Ground truth (surveyed 2026-07-03, post-R1C tree + live DB)

- `merchant_profiles` (live): id, user_id (NOT NULL, UNIQUE, FK auth.users), company_name,
  contact_name, contact_email, website_url, status CHECK (active/paused/archived/suspended),
  tier CHECK (free/growth), created_at, updated_at. **No slug, no public fields, no anon
  read policy.** 4 rows exist (2 active, 1 paused, 1 suspended).
- **No self-serve path exists.** Rows are created only by manual seeding. There is no
  application UI, no auto-trigger (unlike creators' `handle_new_user()`).
- **Pre-existing API-level hole:** `merchant_profiles_owner_insert` (any authenticated
  user may insert their own row — including `status='active'`, `tier='growth'`) and
  `merchant_profiles_owner_update` (may update ANY column, incl. `tier`) are live RLS
  policies with no column restrictions and no UI. R2 must close this (see §4.3).
- `resolveViewerRole` / `useViewerRole`: any `merchant_profiles` row — **any status** —
  makes the user role `'merchant'` (precedence: ops > merchant > creator). Every sign-up
  also auto-gets a `creators` row via trigger; merchant resolution wins over it.
- Merchant app today: `/merchants/{post,missions,missions/[missionId],creators,insights}`,
  gated per-page (`resolveViewerRole() === 'merchant'` else `notFound()`; anon →
  sign-in) plus `gate.ts` prefixes in `proxy.ts`. No shared layout. `/merchants` itself
  is a navigational hub (R1C Task 8) with an in-code note that R2 turns it into the
  public directory.
- Public-page template: `/creators` + `/c/[handle]` (anon `createSupabasePublicClient`
  reads, `buildPageMetadata`/`buildCreatorMetadata`, `creatorProfileJsonLd` +
  `breadcrumbJsonLd`, OG image routes, shared listable-predicate feeding sitemap).
  `/g/[slug]` is the detail-page template for `/experiences/[slug]`.
- Ops console: Merchants domain has Overview/Directory tabs + Merchant 360; all writes
  via audited SECURITY DEFINER RPCs (`is_active_ops_role()` gates: read=analyst,
  merchant lifecycle=moderator, money=admin); `ops_audit_log_append(p_entity_type,
  p_entity_id uuid, p_action, p_reason, p_metadata)` derives actor from `auth.uid()`.
  Queue-style reads may be direct table selects under ops RLS (testimonials precedent).
- Redirect infra: `proxy.ts` (session refresh → `gateDecision` → `seo_redirects` table
  301s + locale guard). No `next.config` redirects. `/feed` uses a page-level
  `redirect()`. No `permanentRedirect()` usage yet.
- i18n: 49 auto-derived groups, 7 locales, parity + route-parity tests enforce.

## 2. Phase decisions

### D-R2-1 · Application mechanism: new `merchant_applications` table

**Chosen: a separate `merchant_applications` table** whose approval RPC creates the
`merchant_profiles` row. Rejected alternative: a `pending_review` status on
`merchant_profiles` reusing the owner-insert policy. Rationale:

- **Role purity.** Any `merchant_profiles` row flips the viewer to `'merchant'` in BOTH
  role resolvers, unlocking the merchant nav sub-row, CTA, and (post-R2B) the dashboard
  gate — an unvetted applicant must not get that. Option B would require re-teaching
  both resolvers, `gate.ts`, Phase-11 KPI maps, `MERCHANT_STATUSES`, and the
  `admin_set_merchant_status` transition matrix about a new status. Option A is purely
  additive; Phase 11 surfaces stay untouched.
- **Clean lifecycle.** pending → approved/rejected is decision history (who, when, why —
  audited); profiles hold only vetted merchants. Rejection leaves no profile; re-apply
  is a new row.

Shape (final DDL in the R2A plan):

```
merchant_applications
  id uuid pk default gen_random_uuid()
  user_id uuid not null references auth.users(id) on delete cascade
  company_name text not null
  contact_name text
  contact_email text not null
  website_url text
  pitch text                          -- "tell us about your business"
  status text not null default 'pending' check (pending/approved/rejected)
  decided_by_ops_member_id uuid references kinnso_ops_members(id)
  decided_at timestamptz
  decision_reason text
  created_at / updated_at (touch trigger, testimonials pattern)
  -- one live application per user:
  unique index ... on (user_id) where status = 'pending'
```

RLS: owner INSERT (`with check user_id = auth.uid() and status = 'pending'`), owner
SELECT own rows; ops SELECT via `is_active_ops()`. **No owner update/delete** — an
application is immutable once submitted. Decisions only via audited RPCs:

- `admin_approve_merchant_application(p_id, p_reason)` — moderator+; locks the row,
  requires `status='pending'`, **errors if the user already has a merchant_profiles
  row**, inserts `merchant_profiles` (company/contact/website copied; status `active`,
  tier `free`), stamps the application, audits `entity_type='merchant_application'`,
  `action='application.approved'` with `{merchant_profile_id}` metadata.
- `admin_reject_merchant_application(p_id, p_reason)` — moderator+; same guards, audits
  `application.rejected`.

Queue reads are direct ops-RLS table selects (testimonials precedent) — applications
are low-volume; no keyset RPC needed in R2.

### D-R2-2 · Application UX: account-first, `/merchants/apply`

`merchant_profiles.user_id` is NOT NULL, so applications require an account (schema
forces it; also mirrors the creator flow). Flow:

1. `/for-merchants` CTA (`newHereCta`) → `/merchants/apply`.
2. Anon → sign-in redirect with return URL (add prefix to `gate.ts`).
3. Signed-in, no application: form (company_name, contact_name, contact_email —
   prefilled from auth email —, website_url, pitch). Direct owner-RLS insert via a
   server action (no money, no privilege — RPC not required; honeypot + server-side
   validation like `agent_waitlist`).
4. Signed-in with a pending application: status panel ("under review, <48 h").
   Rejected: show decision + re-apply form. Approved / already merchant: link to the
   dashboard.
5. **No email notification in R2** (no email infra; consistent with the ops-invite
   copy-link precedent). The status panel is the honest notification surface. Recorded
   as an R3+ carry-forward.

Ops side: a third **Applications** tab in the existing Merchants console
(`/admin/merchants/applications`) — pending queue with approve/reject dialogs
(reason-required, same UX as Directory lifecycle actions) + a decided-applications list.

### D-R2-3 · Public merchant identity: profile fields + PII-safe exposure

New columns on `merchant_profiles` (R2B migration): `slug text unique` (backfilled for
all existing rows; BEFORE INSERT trigger generates from company_name with dedup suffix
so the R2A approve RPC needs no change; **immutable in R2** — no rename UI),
`tagline text`, `city text`, `logo_url text`. PII (`contact_name`, `contact_email`)
stays ops-only.

**Exposure: a `merchant_public_profiles` view** (id, slug, company_name, tagline, city,
logo_url, website_url, created_at — rows `status='active' and slug is not null`),
owner-executed (bypasses base RLS), `grant select to anon, authenticated`. The base
table gets **no** anon policy. Rejected alternatives: anon row-policy on the base table
(RLS filters rows, not columns — would expose contact_email to hand-crafted PostgREST
queries, undermining Phase 11's deliberate PII gating); column-level grants (breaks
`select *`/codegen ergonomics, brittle). The Supabase advisor will flag the definer-
style view — documented deliberate exception, like the R3 webhook service-role rule.
Public queries go through `createSupabasePublicClient().from('merchant_public_profiles')`,
keeping the creators-queries code shape.

### D-R2-4 · `experiences` entity

```
experiences
  id uuid pk default gen_random_uuid()
  merchant_profile_id uuid not null references merchant_profiles(id) on delete cascade
  slug text not null unique              -- generated from title, dedup suffix, immutable in R2
  title text not null
  summary text                           -- card/deck copy
  description text                       -- long-form body
  city text not null                     -- reuses the guides city vocabulary (cross-links)
  price_amount numeric not null check (price_amount >= 0)
  currency text not null default 'HKD'   -- per-currency house rule: never summed across
  duration_minutes integer check (duration_minutes > 0)
  cover_url text                         -- https-validated app-side (safeImageUrl rules)
  status text not null default 'draft' check (draft/published/paused)
  published_at timestamptz               -- set on first publish
  created_at / updated_at (touch trigger)
```

RLS: merchant-owner CRUD (`merchant_profile_id in (select id from merchant_profiles
where user_id = auth.uid())`); anon SELECT only `status='published'` AND the owning
merchant is `active`. No PII columns, so a plain row policy is safe here (unlike
D-R2-3). Media is **URL-based in R2** (validated like OG image URLs); storage upload
is a carry-forward unless the plan phase finds an existing reusable uploader in studio.

Merchant CRUD lives in the dashboard (D-R2-5): list + create/edit form + publish/pause.
Server actions with owner RLS (no RPC — no money, single-owner writes; the missions
CRUD precedent). Ops console gets **no experiences surface in R2** (bounded phase;
Merchant-360 experiences tab recorded as a carry-forward — ops can act via status of
the merchant itself).

### D-R2-5 · Merchant app consolidation: `/merchants/dashboard/*`

Move the five app routes to `/merchants/dashboard/{missions,missions/[missionId],post,
creators,insights}` (file moves; page internals unchanged). New
`/merchants/dashboard/page.tsx` = merchant home: the old hub's card grid re-pointed +
new cards (Experiences, Profile). New dashboard routes in R2:

- `/merchants/dashboard/experiences` (+ `/new`, `/[experienceId]` edit) — D-R2-4 CRUD.
- `/merchants/dashboard/profile` — edit public fields (tagline, city, logo_url,
  website_url, company_name display) + read-only slug. Contact fields editable too
  (they're the merchant's own).

All dashboard pages get the standard per-page gate (anon → sign-in, non-merchant →
notFound). Old URLs become **stub pages calling `permanentRedirect()`** (308) to the
new paths — chosen over `seo_redirects` DB rows because stubs are in-repo, deterministic
(no DB dependency/1 h cache/2.5 s timeout), and testable in vitest + the existing
`redirects.spec.ts` e2e. (The master spec says "301"; App Router's permanent redirect
is 308 — semantically equivalent for SEO. Noted deviation.) Mechanical sweep:
`gate.ts` prefixes, `ROBOTS_DISALLOW` (`/*/merchants/dashboard`, `/*/merchants/apply`),
Navbar merchant sub-row + role CTA (`/merchants/dashboard/post`), Footer merchants
column, studio hub role redirect, `MissionPostWizard` internal redirects/links.

### D-R2-6 · Public surfaces

- **`/merchants`** (already in `MARKETING_PATHS`) becomes the public directory: cards
  (logo, company_name, tagline, city, published-experience count) → `/m/[slug]`.
  Honest states: with only ~2 active merchants at launch, render an editorial
  "founding merchants" framing + `/for-merchants` acquisition CTA — no fake volume,
  no zero-count boasting (R1 social-proof rules). The R1C hub content moves to
  `/merchants/dashboard` (D-R2-5); its acquisition note stays on `/for-merchants`.
- **`/m/[slug]`** — merchant public profile: identity header, about, city,
  website link (http(s)-guarded, 11C precedent), published experiences grid, and a
  "work with creators" cross-CTA. `generateMetadata` via a new `buildMerchantMetadata`;
  `ProfilePage`+`Organization` JSON-LD (new `merchantProfileJsonLd`); breadcrumbs;
  OG card route (new `MerchantCard`, mirrors `CreatorCard`).
- **`/experiences/[slug]`** — mirrors `/g/[slug]`: cover, title, merchant attribution
  linking `/m/[slug]`, city badge, price (formatted per currency), duration,
  description, and a **"Booking opens soon" CTA state** (static, honest copy; no fake
  date, no waitlist form — R3 replaces it with real checkout). JSON-LD: breadcrumbs
  only in R2 — deliberately **no Product/Offer schema until booking is real** (avoids
  rich results promising bookability; master-spec honesty rule). OG card route
  (`ExperienceCard`, mirrors `GuideCard` incl. `loadRemoteImage` SSRF guards).
- Sitemap: `getMerchantsForSitemap()` / `getExperiencesForSitemap()` sharing the same
  listable predicates as the page queries (creators pattern: sitemap ⊆ live pages);
  priorities 0.6 / 0.7. Base nav gains **Merchants** (master IA §4); footer Merchants
  column gains the directory link.

### D-R2-7 · Slice decomposition (three PRs, same operating model as R1)

- **R2A — Self-serve application + review queue.** Migration 1 (`r2a_merchant_applications`):
  the table + RLS + touch trigger + approve/reject RPCs **+ drop
  `merchant_profiles_owner_insert` + column-restrict owner UPDATE (§4.3)**.
  App: `/merchants/apply` (form/status/re-apply), gate prefix, Applications tab in the
  ops Merchants console, i18n ×7, tests. Exit: a fresh account applies; ops approves in
  the console; the user's next page load shows role `merchant` — zero SQL.
- **R2B — Dashboard consolidation + experiences CRUD.** Migration 2
  (`r2b_merchant_public_fields_and_experiences`): profile public columns + slug
  backfill/trigger + `merchant_public_profiles` view + `experiences` + RLS. App: route
  moves + redirect stubs + gate/robots/nav sweeps, dashboard home, profile editor,
  experiences CRUD, i18n ×7, tests (incl. redirect stubs + e2e redirects.spec).
  Exit: approved merchant publishes an experience entirely in the dashboard; every old
  merchant URL 308s to its successor.
- **R2C — Public directory, profiles, experience pages, SEO.** No migration expected.
  App: `/merchants` directory rewrite, `/m/[slug]`, `/experiences/[slug]`, metadata/
  JSON-LD/OG builders, sitemap sections, nav/footer IA, `merchantsLanding`-era dead-key
  cleanup, **th.ts `seo.merchants` translation fix folded in** (R1 carry-forward E).
  Exit: all three surfaces live + indexable with honest empty/low-volume states;
  route-parity, i18n-parity, seo e2e green.

Sequencing rationale: R2A is independently shippable and starts the <48 h review loop
early; R2B establishes final URLs + data before public surfaces consume them; R2C has
no schema risk. Branches cut per-slice from `main` after the prior slice's squash-merge
(current tree stacks on `feat/redesign-r1c` until PR #66 merges, then
`git rebase --onto origin/main feat/redesign-r1c <slice-branch>`).

## 3. i18n

New groups (registered automatically by the parity test's `Object.keys(en)`):
`merchantApply` (R2A, public form/status), `merchantApplicationsOps` (R2A, ops queue),
`merchantDashboard` (R2B, home + profile + experiences manage), `merchantsDirectory`
(R2C, public directory + `/m/[slug]`), `experiences` (R2C, public page incl.
"booking opens soon" copy), plus `seo.*` additions. Existing `merchants` group keeps
serving the moved mission surfaces; hub-only keys retired in R2C. All strings ×7
locales per house rules; en-first with Cantonese-friendly HK copy allowances.

## 4. Security invariants

1. **PII never public:** `contact_name`/`contact_email` (profiles AND applications)
   are readable only by the owner and ops. Enforced structurally (D-R2-3 view; no anon
   policy on base tables). A vitest asserts the anon client cannot read them.
2. **No self-granted privilege:** the funnel is application → audited RPC → profile.
3. **Close the pre-existing hole (§1):** in R2A, drop `merchant_profiles_owner_insert`
   and revoke owner UPDATE on `status`, `tier`, `user_id`, `id`, `created_at` via
   column-level grants (owner keeps: company_name, contact_name, contact_email,
   website_url). The R2B migration adds the new public columns to the grant
   (tagline, city, logo_url) while keeping `slug` non-updatable.
4. Approve/reject RPCs: SECURITY DEFINER, `is_active_ops_role('moderator')`,
   reason-required, row-locked, no-op guarded, audited — byte-consistent with the
   Phase 11/12 conventions.
5. All public reads via `createSupabasePublicClient()`; no service-role in request
   paths (unchanged house rule).
6. URL fields (website_url, logo_url, cover_url) validated https-only app-side
   (11C ProfileTab + `safeImageUrl` precedents).

## 5. Testing

Per-slice, following existing conventions: queries tests (RPC/mapping),
host tests for new pages (real page export where feasible — carry-forward H
noted: prefer the `agent.host.test.tsx` pattern over view-only tests),
redirect-stub tests, anon-PII negative test, i18n + route parity, scoped
runs via `cd apps/web && npx vitest run <pattern>` (never the mis-scoped
`pnpm --filter web test -- <pattern>`), full typecheck/lint per slice; e2e
`redirects.spec.ts` extension in R2B and `seo.spec.ts` coverage of the new public
routes in R2C.

## 6. Out of scope (R2)

Booking/checkout/availability (R3) · traveller accounts (R3) · Stripe code (R3;
only the business KYC kickoff happens now) · experiences media upload (URL-only) ·
merchant email notifications · slug rename/redirect management · ops experiences
console tab · merchant analytics changes (existing insights untouched) ·
`platform_stats` changes (locked until R3 per R1 notes).

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Supply cold start on public directory | Honest "founding merchants" framing (D-R2-6); R2 exit requires seeded real merchants across hero destinations before R3 ships publicly (user/ops content task). |
| PII leak via new public reads | Structural exposure design (D-R2-3) + negative test (§5). |
| Redirect regressions breaking merchant workflows | In-repo stubs, unit + e2e coverage, gate.ts sweep in the same PR as the moves (R2B atomic). |
| Role-flip surprises (approved merchant also has a creators row) | Existing precedence (merchant > creator) already resolves it; documented; host test covers post-approval role resolution. |
| Definer-view advisor warning misread as a defect | Documented deliberate exception here and in the migration comment. |

## 8. User action items (outside the codebase)

1. **Merge PR #66** (R1C) — R2 slices rebase onto `main` after the squash.
2. **Kick off Stripe HK account + KYC now** (long lead; blocks R3 checkout, not R2 code).
3. At R2C: supply real merchant/experience content across the 5 hero destinations
   (seed-&-scaffold, spec §10.3) — the exit criterion ops cannot fabricate.
4. Publish real testimonials via `/admin/testimonials` when quotes exist (running
   R1 leftover).
