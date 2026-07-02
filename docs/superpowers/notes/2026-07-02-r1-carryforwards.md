# R1 Carry-forwards — input to R1C planning (and two R3 notes)

Consolidated from the R1A and R1B final holistic reviews (2026-07-02). R1A shipped on
`feat/redesign-r1a`; R1B on `feat/redesign-r1b` (stacked). R1 lands as one squash PR
after R1C.

## R1C scope items (from reviews, beyond the master-spec R1C scope)

1. **Token sweep coupling (critical ordering):** the global `a:focus-visible` rule in
   `app/globals.css` references `--color-kinnso-orange`. Deleting legacy tokens without
   replacing that rule in the SAME commit kills focus rings site-wide.
2. Re-skin `LocaleSwitcher` to the k2 system (still legacy-skinned inside the new header).
3. Delete orphaned legacy i18n keys: `nav.linkMerchants/linkGuides/linkTravelers`,
   `footer.lCaseStudies/lPress`.
4. Retarget merchant-acquisition links to `/for-merchants` (×3: Navbar right-side link,
   Footer `lPricing`, `components/kinnso/home/MerchantValue.tsx:28` CTA — all commented in code).
5. Traveller/Travelers spelling harmonization → **British** ("traveller"): the R1B DB CHECK
   (`testimonials.author_role in ('creator','traveller','merchant')`) bakes British into the
   schema; harmonize legacy copy (`linkTravelers`, feed/merchantsLanding strings) to match.
6. Harden the parity test: `keyPaths(undefined)` returns `['']`, so a typo'd GROUPS entry
   passes silently (confirmed 4×). Add `expect(dict[g]).toBeDefined()`.
7. creator-mock slim-down: `tickerSeed`/`TickerItem` fully orphaned; `merchantWorkingWith`,
   `merchantProfile`, `extendedCreators`, `computeMatch` (+types) have zero production
   consumers; `guides`/`feedItems`/`merchantLogos`/`creators` arrays are test-only. Keep the
   studio-scan mock surface. Relocate the `Guide` TYPE (type-only imports in HomeView.tsx:13,
   home/Hero.tsx:5, Explore/Feed/queries).
8. Remove legacy fonts (Bricolage/DM Sans/JetBrains Mono) with the token sweep.
9. Optional: ja/ko `:lang()` typography overrides (TC-first stack captures kanji/hanja on
   Apple platforms — documented in globals.css).
10. Legacy `text-ink/60` occurrences outside kinnso2 (LiveProgress.tsx:287,
    HandlesStep.tsx:173, sign-up/page.tsx:83) — sweep with the re-skin.
11. New migration: `testimonials.updated_at` + touch trigger. Keep the locale CHECK list in
    sync with `lib/i18n/config` if locales ever change.
12. `sort_order` int4 bounds as a field-level validation error (currently generic form error
    at ±2^31; `Number('')` coerces to 0 silently in the form).
13. DB-error logging in admin actions (`testimonials-actions.ts` swallows Supabase error
    details; older admin actions share the pattern — fix tree-wide).
14. `busyId`/`saving` try/finally in admin views (AdminTestimonialsView + AdminPerksView
    pattern; thrown server action strands disabled state).
15. i18n polish: ko `testimonialsAdmin` register (해요체 → formal 하세요/-습니다);
    社會認證 → 社會證明 (zh-hk/zh-tw), 社会认证 → 社会证明 (zh-cn).
16. `getPublishedGuides(limit)` variant — homepage fetches all published guides to render 6
    (also removes the double `.slice(0,6)` in page.tsx/HomeView).
17. Give the homepage testimonials strip an accessible section name (unnamed SectionShell
    landmark) or demote it to a div.
18. Wire `getPublishedTestimonials` into the `/for-creators` and `/for-merchants` landings
    (master spec §5: testimonials surface on homepage AND both landing pages).
19. Optional: guard the homepage articles section against an all-invalid-category render.
20. Merchant sub-row nav landmark is labelled with `t.linkMissions` ("Missions") but holds
    three links — add a dedicated key with the next nav i18n touch.
21. Rights bar `text-kinnso2-paper/50` sits 0.27 above the AA floor — bump to /60 during polish.
22. Include `tests/kinnso.route-parity.test.tsx` in every phase verification list (it renders
    chrome + HomeView and is the silent guard on hrefs).

## Controller handoff (before/at R1 PR)

- Apply migration `20260702120000_r1b_platform_stats_testimonials.sql` to the live Supabase
  project (MCP `apply_migration`, name `r1b_platform_stats_testimonials`), then
  `pnpm --filter @kinnso/db gen` and reconcile any diff vs the hand-written types
  (`packages/db/types.ts` — expect key-order normalization).
- Seed 1–3 published testimonials via `/admin/testimonials` so the homepage strip renders.
- Production build could not be verified in the sandbox (no outbound network for Google
  Fonts; identical failure on baseline) — verify on Vercel preview.

## R3 notes (booking phase — record now, not R1C)

- `platform_stats()` deliberately OMITS a bookings stat (not zero) and runs SECURITY
  INVOKER (deviation from spec §5's DEFINER — safer, rationale in the migration). R3 must
  `CREATE OR REPLACE` with a new return shape (+ StatsBar entry, threshold constant, and an
  i18n key in all 7 locales).
- Contrast floors established: muted text = ink/70 on paper, paper/70 on ink, paper/80 on
  moss; kinnso2-sun never as text on paper or under white text.
