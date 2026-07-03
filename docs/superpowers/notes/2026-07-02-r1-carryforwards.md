# R1 Carry-forwards — RECONCILED at end of R1C (2026-07-03)

Consolidated from the R1A and R1B final holistic reviews (2026-07-02). R1A shipped on
`feat/redesign-r1a`; R1B on `feat/redesign-r1b` (stacked, later squash-merged to `main`
as PR #65 @ `0fc1f69`). R1C shipped on `feat/redesign-r1c` (17 tasks, this reconciliation).

**Mid-phase user decision (2026-07-02):** the original `kinnso-*` brand palette
(cream/ink/orange) was reinstated as canonical, reverting the newer `kinnso2-*`
editorial-clay palette R1A/R1B had introduced — new layouts, k2-* component classes,
and Fraunces/Inter typography were kept, just recolored. See the R1C plan's
`D-R1C-1`/`D-R1C-2` sections for the full token map and contrast-floor rules.

## R1C scope items (from reviews, beyond the master-spec R1C scope) — STATUS

1. **Token sweep coupling (critical ordering):** ~~the global `a:focus-visible` rule…~~
   **DISSOLVED by the palette revert.** `kinnso-orange` is permanently canonical now —
   it is never deleted, so this ordering hazard no longer exists.
2. **Re-skin `LocaleSwitcher`** to the k2 system. **DONE** (Task 3): `rounded-pill` →
   `rounded-[3px]`; the rest of its classes were already canonical `kinnso-*`.
3. **Delete orphaned legacy i18n keys**: `nav.linkMerchants/linkGuides/linkTravelers`,
   `footer.lCaseStudies/lPress`. **DONE** (Task 15): removed from the interface + all 7
   locales; 2 stale `kinnso.Footer.test.tsx` assertions rewritten to literal strings.
4. **Retarget merchant-acquisition links to `/for-merchants`**. **DONE** (Task 9), plus
   `CreatorCta` → `/for-creators` (master spec §4.1 §9, not in the original item but the
   same class of fix): Navbar's `forMerchantsHref`, Footer's `lPricing` link + new
   `lForCreators` entry, `MerchantValue.tsx`'s CTA, `CreatorCta.tsx`'s CTA.
5. **Traveller/Travelers spelling harmonization → British.** **DONE** (Task 15):
   `explore.subtitle`, `feed.heading` (NOT `explore.heading` — the plan named the wrong
   key, corrected in-plan during Task 15) fixed in en.ts; `home.roleTraveller` was
   already British; `merchantsLanding.heroTitle` no longer exists (deleted in Task 8's
   hub rewrite, removing that instance for free).
6. **Harden the parity test** (`keyPaths(undefined)` returns `['']` bug). **DONE**
   (Task 15): `GROUPS` is now `Object.keys(en).sort()` (was a 34-entry hand list vs.
   en's actual 49 top-level groups — `agent`, `breadcrumb`, `categories`, `auth`,
   `onboarding`, `dna`, `team`, `brand`, and others were live but unchecked); added a
   `toBeDefined()` guard against a wholly-missing locale group. Independently verified
   (twice, by two different reviewers) that hardening surfaced **zero real gaps** — all
   7 locales were already fully complete despite the weak old guard.
7. **creator-mock slim-down** (`tickerSeed`/`TickerItem`, `merchantWorkingWith`,
   `merchantProfile`, `extendedCreators`, `computeMatch` + types) + **`Guide` type
   relocation**. **DONE with a correction** (Task 14): the plan's original orphan list
   was WRONG for two exports — `missions` and `extendedCreators`/`ExtendedCreator` are
   still live dependencies of the out-of-scope studio-scan surface (`StudioScanView.tsx`,
   `BrandContactCard.tsx`, `ShareDnaDialog.tsx`, `app/[locale]/studio/scan/page.tsx`) and
   were KEPT, with in-code breadcrumb comments added above each explaining why (so a
   future dev doesn't re-derive the same dependency chain). Genuinely deleted:
   `tickerSeed`/`TickerItem`, `merchantWorkingWith`/`MerchantWorkingWith`,
   `merchantProfile`/`MerchantProfile`, `computeMatch` + its helper types. `Guide`
   relocated to `lib/guides/types.ts` (it was never mock data); all importers swept.
   `FeedView.tsx` (confirmed dead — `/feed` redirects to `/explore`) deleted too.
8. **Remove legacy fonts** (Bricolage/DM Sans/JetBrains Mono) with the token sweep.
   **PARTIAL — by design.** Bricolage + DM Sans fully removed from `next/font/google`
   (Task 2). JetBrains Mono **deliberately KEPT** — `k-mono` is studio-internal and is
   retired only when studio/admin gets its own visual redesign pass (out of scope this
   whole phase). **New exception found during Task 2:** `lib/seo/og/{fonts.ts,card.tsx}`
   bundle actual `Bricolage-{Bold,Regular}.ttf` binaries for `next/og` social-card
   generation — a separate system from `next/font/google` that this phase never
   touches; no Fraunces/Inter `.ttf` assets were available to source in this sandbox
   (no outbound network). **Carry-forward:** source real Fraunces/Inter static `.ttf`
   files and migrate the OG-card generator to match the canonical typography.
9. **Optional ja/ko `:lang()` typography overrides.** Still optional-open — never was
   mandatory, not addressed this phase.
10. **Legacy `text-ink/60` occurrences outside kinnso2** (originally 3 named sites).
    **DONE, scope expanded** (Task 13): swept ALL stray unnamespaced `ink`/`cream`
    Tailwind classes repo-wide — grew from the 3 originally-named files to **17 total**
    once the implementer's own verification grep surfaced ~10 more holdouts (`layout.tsx`,
    `ArticleToc.tsx`, `ArticleCard.tsx`, `blocks/{TextBlock,DetailBox,OfferBox,InfoBox}.tsx`,
    `auth/AuthForm.tsx`, `onboarding/{WelcomeStep,ReadBack,WizardClient,DnaReviewForm}.tsx`,
    `articles/[category]/[url]/page.tsx`). All confirmed hex-identical, zero-visual-change
    renames. One legitimate exception remains: a `CreatorCta.tsx` code COMMENT (prose,
    not a class) mentions "ink" in an accessibility-rationale note.
11. **New migration**: `testimonials.updated_at` + touch trigger. **DONE** (Task 4):
    migration file `20260703090000_r1c_agent_waitlist_and_testimonials_updated_at.sql`
    created (bundled with the new `agent_waitlist` table). **NOT yet applied to live** —
    pending controller handoff (see below).
12. **`sort_order` int4 bounds** as a field-level validation error. **DONE** (Task 16).
13. **DB-error logging in admin actions** (tree-wide). **DONE** (Task 16): 23 sites
    across 6 admin action files (testimonials, perks, creators, merchants, team, users).
14. **`busyId`/`saving` try/finally** in admin views. **DONE** (Task 16):
    `AdminTestimonialsView` (`mutate()` + form submit), `AdminPerksView` (`toggle()`),
    and `AdminPerkForm` (submit — found to have the identical bug mid-task, fixed too).
15. **i18n polish**: ko `testimonialsAdmin` register; zh "social proof" term. **DONE**
    (Task 15): ko converted from casual 해요체 to formal register throughout that block;
    社會認證/社会认证 ("verification/certification") → 社會證明/社会证明 ("social
    proof," the correct marketing term) across zh-hk/zh-tw/zh-cn.
16. **`getPublishedGuides(limit)` variant** + double `.slice(0,6)` removal. **DONE**
    (Task 5): both slice sites removed (query now bounds via `.limit()`; `page.tsx` and
    `HomeView.tsx` both stopped re-slicing).
17. **Homepage testimonials strip accessible section name.** **DONE** (Task 5):
    `aria-labelledby` + visually-hidden `<h2>`; `SectionShell` extended to forward
    arbitrary HTML attributes for this.
18. **Wire `getPublishedTestimonials` into `/for-creators` and `/for-merchants`.**
    **DONE** (Tasks 7 & 8): role-filtered (`'creator'`/`'merchant'`), data-gated
    (hidden when empty).
19. **Guard homepage articles section against an all-invalid-category render.** **DONE**
    (Task 5): `linkableArticles` filter applied BEFORE the slice, not after.
20. **Merchant sub-row nav landmark** mislabelled with `t.linkMissions`. **DONE**
    (Task 9): new dedicated `nav.merchantMenuLabel` key. **Found during review:** the
    5 non-en/th translations of this key initially used internal-admin-console
    vocabulary instead of the consumer-nav vocabulary already established by
    `linkForMerchants` in the same files — corrected in the same task.
21. **Rights bar `text-kinnso2-paper/50`** bump to `/60`. **DONE** (Task 3, folded into
    the palette rename): now `text-kinnso-cream/60`.
22. **Include `tests/kinnso.route-parity.test.tsx` in every phase verification list.**
    **DONE** — included in every task's own verification run and in Task 17's final sweep.

## Controller handoff (before/at R1C PR)

- Migration `r1b_platform_stats_testimonials` (R1B) — **already applied on live**
  (confirmed via Supabase MCP `list_migrations`, version `20260702152125`).
- Migration `r1c_agent_waitlist_and_testimonials_updated_at` (R1C, Task 4) — **created,
  NOT yet applied**. Apply via Supabase MCP `apply_migration`, project
  `scryfkefedzuetfdtrvl`, then `pnpm --filter @kinnso/db gen` and reconcile
  `packages/db/types.ts` (expect key-order noise only — already hand-added ahead of
  regen in Task 4).
- **3 testimonials are seeded but still in `draft` status** (confirmed via live
  `execute_sql` query this session) — publish via `/admin/testimonials` so the
  homepage + both new landing-page testimonial strips actually render content.
- Production build could not be verified in this sandbox (no outbound network for
  Google Fonts; same pre-existing constraint noted in R1B) — verify on Vercel preview.
- **R1C branch (`feat/redesign-r1c`) has NOT been pushed past its first commit
  (`c52b8e8`, the plan doc only)** — all subsequent work (Tasks 2–17, ~30 commits) is
  local-only in the sandbox clone as of this reconciliation. Push + PR are pending
  explicit user go-ahead (see Task 17 Step 6/7 — these are hard-to-reverse,
  shared-state actions, held for confirmation rather than auto-executed).

## R3 notes (booking phase — record now, not R1C)

- `platform_stats()` deliberately OMITS a bookings stat (not zero) and runs SECURITY
  INVOKER (deviation from spec §5's DEFINER — safer, rationale in the migration). R3
  must `CREATE OR REPLACE` with a new return shape (+ StatsBar entry, threshold
  constant, and an i18n key in all 7 locales).
- **Contrast floors — REPLACED by the R1C revert.** New floors (see plan `D-R1C-2`):
  accent small text = `kinnso-orangeDark` only, hover darkens toward ink (never
  brightens to orange, in any state); orange never as text; amber never on light
  backgrounds (text OR outlines); ink-on-orange small text needs ≥`/90` opacity
  (`/80` fails AA at 4.14:1). **Three accepted brand AA deviations**, all documented in
  the plan and `globals.css` comments: ① white-on-orange button labels (3.06:1 at
  text-sm/bold, a true AA fail at that size), ② orangeDark-on-cream small text (4.26:1,
  fails AA-normal by 0.24), ③ orange focus rings on cream (2.73:1 vs. the 3:1 non-text
  floor — this is the original global focus rule the user explicitly asked back).

## New carry-forwards from R1C (for a future phase)

A. **The 3 accepted brand AA deviations** above — flagged for a future dedicated
   brand-accessibility pass, should the business ever want to close them (e.g. a
   slightly darker "orange" for focus rings/buttons at the same visual weight).
B. **OG-card font migration** (item 8 above) — source real Fraunces/Inter `.ttf`
   binaries, migrate `lib/seo/og/fonts.ts` + `card.tsx` off Bricolage.
C. **`agent_waitlist` has no per-IP rate limiting** — an explicit, documented §7
   deviation (anon direct table insert, not a SECURITY DEFINER RPC) accepted because
   the table is append-only/no-money/RLS-blocks-reads; a honeypot field guards the
   form. Recorded for R4's traveller-agent hardening pass.
D. **`k-mono`/JetBrains Mono studio debt** (item 8) — retire when studio/admin gets its
   own visual redesign (explicitly out of scope this whole phase).
E. **`th.ts` has pre-existing untranslated English strings** in `seo.merchants`/
   `seo.terms` (found incidentally during Tasks 7 and 8 — NOT introduced by this
   phase, NOT fixed, since it's out of scope for those tasks). Worth a dedicated
   full-audit-and-translate pass for `th.ts`.
F. **Task 16's two new hardcoded (non-i18n'd) English catch-block strings**
   (`'Testimonial could not be saved'`, `'Perk could not be saved'`) — these match this
   specific admin-actions subsystem's PRE-EXISTING (already non-compliant) pattern of
   hardcoded `FRIENDLY`-map error strings, so they're not a fresh regression, but they
   also mean `tests/i18n.locale-parity.test.ts` structurally cannot catch a literal
   that bypasses the `t.*` dictionary object entirely. Either formally accept
   hardcoded-English as the convention for admin `formError`/catch-block messages, or
   route them through `t.*` and extend the parity test's reach.
G. **Footer `colCreators`/`colMerchants` link-ordering asymmetry** (noted during Task
   9 review): `colCreators` now leads with its acquisition-landing link
   (`lForCreators` first), while `colMerchants` keeps its equivalent (`lPricing`)
   second, after "Post a mission." No strong IA rationale distinguishes the two — a
   future polish pass could pick one convention and apply it to both columns.
H. **`/for-creators` and `/for-merchants` "host" tests test the VIEW component
   directly, not the actual `page.tsx`** (noted during Tasks 7 & 8 review — the plan's
   own given test code does this, so it's not an implementer shortcut). Neither
   `generateMetadata`, the `isLocale` guard, nor the `getPublishedTestimonials` wiring
   inside the real page export gets exercised. A genuine host test (mirroring
   `agent.host.test.tsx`'s pattern: mock `next/navigation`, render the actual page
   export, assert on output) would close this coverage gap for both landings.
I. **`MissionCard.tsx` retained** — confirmed still in production use by
   `StudioScanView.tsx`; correctly NOT deleted during the Task 8/14 cleanup passes. No
   action needed, noted here only so a future dev doesn't re-investigate.
