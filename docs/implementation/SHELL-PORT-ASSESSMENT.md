# SHELL-PORT-ASSESSMENT — plan §6.1 (three shells / compact home / mobile nav)

**Purpose.** Let the owner decide whether to port the approved Site's traveller, creator and
merchant shells into the canonical app, on evidence rather than on the plan's prose.

**What this is not.** No Site code has been copied into this repository. Nothing was built,
run or tested for this assessment — it is a source read of two trees, plus the Site's own
verification documents.

---

## 0. Evidence basis

| Side | Location | What was read |
|---|---|---|
| Approved Site | extracted `kinnso-journeys` snapshot (SHA-256 matched the plan's published value) | `docs/FRONTEND-ROUTE-MAP.md`, `docs/FRONTEND-CAPABILITY-MATRIX.md`, `docs/BACKEND-CONTRACT-INVENTORY.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/ADVENTURELOG-REUSE-MANIFEST.md`, all 22 files under `app/` |
| Canonical | `apps/web` on `claude/phase01-canonical-frontend` | `components/kinnso/{Navbar,Footer,SiteChrome}.tsx`, `components/kinnso/pages/{HomeView,StudioDashboardView,MerchantDashboardHomeView}.tsx`, `components/kinnso/admin/AdminShell.tsx`, `app/[locale]/admin/layout.tsx`, `lib/auth/gate.ts`, `lib/admin/guard.ts`, the 93 `page.tsx` route files |

The Site's entire frontend is **22 files, ~621 KB**, written in a deliberately dense
single-line style (`connected.tsx` is 55 KB in 45 physical lines). Line counts are
meaningless here; byte counts and component boundaries are not.

The Site is **two locales (`en`, `zh-HK`)**. The canonical app is **seven, lowercase**
(`en, zh-hk, zh-tw, ja, ko, th, zh-cn` — `lib/i18n/config.ts:1`). No Site copy string can
be pasted across: it covers 2 of 7 locales and uses the wrong casing for one of them.

---

## 1. What the Site's three shells actually ARE

### 1.1 Traveller shell — `app/travel/Workbench.tsx`

There is no separate traveller shell component. `Workbench.tsx` **is** the shell, the
router, the app-wide React context and the error-message dictionary, all in one 13 KB
file. It renders, in order:

1. `.k-skip` skip-link
2. `.k-header` — serif `kinnso✳` logo · main nav (**Explore · My trips · Record**) ·
   `.k-header-end` (For creators → `/studio`, For business → `/merchants/dashboard`,
   language toggle preserving path+query, avatar → `/me` or a Sign-in button)
3. `.k-mode` — a persistent **"Demo — sample data, saved on this device"** band
4. a storage-failure `role="alert"` strip
5. `<main id="k-main">` with the routed content
6. `.k-footer` — © · Help · Privacy · For business · Credits & source
7. `.k-bottom-nav` — the mobile tab bar (§1.4)
8. a toast region and a `<dialog>` modal host

It also supplies the app context (`locale, t(en,zh), href, store, ready, open, close,
notify, refresh, run, auth`) that **every** Site page component consumes, and it registers
a `document.modelContext` ChatGPT tool (`search_adventures`). Those two facts matter: the
shell is not separable from the Site's demo store without a rewrite.

Primary action per surface: the header nav is task-first and only three items wide.

### 1.2 Creator shell — `CreatorShell` in `app/travel/connected.tsx`

A left `<aside class="cj-sidebar">` applied by `Workbench.tsx` to every path starting
`studio` except `/studio/copilot` and `*/edit`:

- eyebrow `YOUR STUDIO / 你的工作室`
- primary nav (icon + label): **Today** (`studio`) · **My adventures**
  (`studio/adventures`) · **Opportunities** (`studio/opportunities`) · **Earnings**
  (`studio/earnings`)
- a collapsed `<details>` "Profile & tools": Record · Receipts · Planning assistant ·
  Profile & connected accounts · Support
- a `.cj-leave` link: **"← Explore as a traveller"**

`/studio` itself (`CreatorToday`) is the creator Today surface: page heading + a
**"YOUR NEXT USEFUL STEP"** panel with one CTA, three earnings metrics (pending /
eligible / paid, explicitly labelled illustrative), a two-column "your work" + "an
opportunity that fits" grid, and an outcomes panel whose live counters render `—`
("Live reporting unavailable"), never `0`.

Primary action: `Record a journey`.

### 1.3 Merchant shell — `MerchantWorkspace` in `app/travel/connected.tsx`

Same `.cj-workspace` two-column skeleton, different nav:

- eyebrow `HARBOUR STUDIO` (a fixture business name, hard-coded)
- primary nav: **Today** · **Campaigns** (`missions`) · **Creators** · **Offers & visits**
  (`offers`, also active for `redeem`) · **Results** (`insights`)
- `<details>` "Business tools": Profile · Experiences · Bookings · Budget · Support
- the same `.cj-leave` "← Explore as a traveller"
- content wrapped in `<WorkspaceGate role="merchant">`

Primary action: a persistent `New campaign` button in `MerchantHeading`, targeting the
four-step `CampaignBuilder`.

### 1.4 Mobile nav

Two distinct mechanisms, both CSS-driven, **no hamburger anywhere**:

- **≤650 px**: `.k-header nav{display:none}` and `.k-bottom-nav{display:flex}` — a fixed
  4-tab bar (**Explore · Trips · Record · Me**) with `env(safe-area-inset-bottom)` padding,
  48 px targets, and the third tab (`Record`) given an orange filled-square icon as the
  primary action.
- **≤900 px** (workspace): `.cj-workspace` collapses to a single column and the sidebar
  becomes a **horizontally scrolling chip rail** (`overflow-x:auto`, icons hidden, labels
  `white-space:nowrap`). The "leave" link and eyebrow are hidden.

### 1.5 Compact home — `HomePage` in `app/travel/explore.tsx`

Six blocks, in order: eyebrow + two-line headline; **"PICK UP WHERE YOU LEFT OFF"** resume
card for the most recently saved personal trip (title, date-or-"Dates to decide", day
count, stop count); an inline `SearchForm` (query + duration); four quick-destination
chips; four publication cards; a "Record a moment" banner. Roughly one viewport of
marketing before the first task control.

---

## 2. What the canonical app already covers

| Site element | Canonical component that covers it | Verdict |
|---|---|---|
| `.k-skip` skip-link | `SiteChrome.tsx` (`nav.skipToContent`, `#main-content`) | **covered, equal** |
| `.k-header` | `components/kinnso/Navbar.tsx` (186 lines) | **covered, richer** — 7 anchors, role-aware CTA over 6 roles, merchant second row, `LocaleSwitcher`, `aria-current`, non-colour-only active state |
| `.k-footer` | `components/kinnso/Footer.tsx` | **covered, richer** — 5–6 data-gated columns vs 4 flat links |
| shell composition + role resolution | `SiteChrome.tsx` + `lib/auth/useViewerRole.ts` (client-side, so public pages stay statically generable) + `BARE_SUFFIXES` | **covered, better architecture** |
| app-wide context (`t`, `href`, `run`, toast, modal) | server `getDictionary` + per-page props; `components/ui/dialog`; no global toast host | **different by design** — canonical passes typed `Messages` slices as props |
| Creator sidebar | **nothing.** `/studio` renders `StudioDashboardView` (greeting, DNA snapshot, tier, next-action panel, readiness checklist, opportunities, earnings) and a `StudioQuickLinks` grid of **11 launcher tiles**. The other 16 studio pages carry no studio-scoped nav at all. | **GAP** |
| Merchant sidebar | **nothing.** `/merchants/dashboard` renders `MerchantDashboardHomeView` — a **10-card launcher grid** (50 lines). The other 14 dashboard pages carry no dashboard-scoped nav; only the `xl:` merchant second row in `Navbar` (Missions · Find creators · Insights) persists. | **GAP** |
| A sidebar-shell precedent | `components/kinnso/admin/AdminShell.tsx` + `app/[locale]/admin/layout.tsx` — a 12-item `<aside>` wrapped by a route-group layout that also runs `requireOpsPage`. **This is exactly the pattern a studio/merchant shell would follow.** | **pattern exists, unused outside `/admin`** |
| Mobile nav | `Navbar`'s hamburger `Dialog` tray, gated at `xl:` (≥1280 px) so tablets get the tray too | **covered, different pattern** — no bottom tab bar |
| Creator "next useful step" | `StudioDashboardView` **already has it** — `nextAction` with six typed kinds and a single CTA | **covered** |
| "Live reporting unavailable" instead of a false zero | canonical's house rule already (`HomeView` data-gating, `StatsBar` thresholds, `getUpcomingSessions` → `[]` renders nothing) | **covered** |
| Compact home | `components/kinnso/pages/HomeView.tsx` — the 10-section editorial homepage; `Hero` CTA → `/explore`, **no inline search**, no resume card | **GAP (product decision)** |

---

## 3. The genuine delta

### 3.1 Where the Site's nav actually points, and whether that route exists here

**Merchant sidebar — 11 of 11 slots land on live canonical routes.**

| Site slot | Canonical route | Exists |
|---|---|---|
| Today | `/merchants/dashboard` | ✅ |
| Campaigns | `/merchants/dashboard/missions` | ✅ |
| Creators | `/merchants/dashboard/creators` | ✅ |
| Offers & visits | `/merchants/dashboard/offers` (+ `/redeem`) | ✅ |
| Results | `/merchants/dashboard/insights` | ✅ |
| Profile / Experiences / Bookings / Budget | `/merchants/dashboard/{profile,experiences,bookings,budget}` | ✅ |
| `New campaign` CTA | `/merchants/dashboard/post` | ✅ |
| Support | — | ❌ (no `/help`) |

**Creator sidebar — 4 of 4 primary slots map, under different slugs.**

| Site slot | Canonical equivalent | Exists |
|---|---|---|
| Today | `/studio` | ✅ |
| My adventures | `/studio/guides` (guides are the publishable object here) | ✅ |
| Opportunities | `/studio/missions` | ✅ |
| Earnings | `/studio/earnings` | ✅ |
| Planning assistant | `/studio/copilot` | ✅ |
| Record · Receipts · Profile & connected accounts · Support | — | ❌ (4 of 5 secondary items) |

**Traveller bottom tab bar — 2 of 4 tabs have no destination.**

| Tab | Canonical route | Exists |
|---|---|---|
| Explore | `/explore` | ✅ |
| Trips | `/trips` | ✅ |
| Record | — | ❌ |
| Me | — | ❌ (`/me`, `/settings`, `/saved`, `/bookings` do not exist) |

Also absent for the footer: `/help`, `/legal/privacy` (only `/legal/creator-terms`
exists), `/credits`.

### 3.2 Honest sizing

| Item | Real work | Size |
|---|---|---|
| **Merchant shell** | 1 new client component modelled line-for-line on `AdminShell.tsx` (~50 lines) + `app/[locale]/merchants/dashboard/layout.tsx` modelled on `app/[locale]/admin/layout.tsx` (~18 lines) + ~10 nav keys × 7 locales. Most labels can be re-cut from the existing `merchantDashboard.card*Title` strings. | **Small.** Highest value per unit of work in all of §6.1. |
| **Creator shell** | Same two files for `/studio` + ~6 nav keys × 7 locales. | **Small**, with one design decision (below). |
| **Traveller bottom tab bar** | 1 component (~70 lines) + `SiteChrome` wiring + `pb-` offset on `main` + ~4 keys × 7 locales — **if** the tabs are restricted to routes that exist. | **Small** if scoped to `Explore / Trips / Agent / Sign-in-or-Studio`. **Blocked** if it must be the Site's `Record / Me`. |
| **Compact home** | Re-cutting `HomeView` is a *copy and product* decision, not an engineering one: 10 sections, each with 7-locale copy. The inline search box that routes to `/explore?q=` is genuinely small. | **Small (search) + product decision (compaction).** |
| **"Resume your trip" card** | Requires a trip/itinerary domain. `CURRENT-STATE.md` §5.2: no `trips`, `trip_stops`, `journal` or media tables exist; `/trips` is a read-only list of bookings + saved guides + saved experiences. | **Not a shell task — Phase 2, greenfield.** An honest near-term substitute is "resume" = most recent booking or most recently saved guide. |

### 3.3 Three real hazards, not size

1. **Porting the Site's IA verbatim would hide live surfaces.** The Site creator sidebar
   has 9 slots. The canonical studio has **17 routes** — `scan`, `tier`, `offers`,
   `perks`, `inbox`, `insights`, `sessions`, `guides/new`, `sessions/new` and more have no
   slot in the Site's IA. `StudioQuickLinks` currently reaches 11 of them. A sidebar that
   replaces that grid with four items is a **navigation regression** unless the grid is
   kept below the fold or the sidebar is widened. Decide this before building.
2. **Nested `<main>` landmarks already exist and a shell would multiply them.**
   `SiteChrome` renders `<main id="main-content">`, and **57 view components render their
   own `<main>` inside it** (66 occurrences), including `StudioDashboardView` and
   `MerchantDashboardHomeView`. Introducing `<aside>` + content wrappers is the moment to
   fix this, not to add to it.
3. **Layout-level gating has churned here.** `49c0854a` ("centralize creator perks page
   gate") was reverted by `87f62693` a commit later. `/studio` is *not* in
   `gateDecision`'s `gatedPrefixes` (only `studio/missions` is), so studio pages rely on
   per-page `requireCreatorPage`. Putting a gate in a new `studio/layout.tsx` changes that
   contract for 17 pages at once. Ship the **shell** and the **gate centralization** as
   separate slices.

---

## 4. What must NOT be copied (plan §3.1) — mapped to Site files

| Forbidden item | Exact Site paths | Why it must stay out |
|---|---|---|
| **Vinext runtime** | `vite.config.ts`, `build/sites-vite-plugin.ts`, `next.config.ts`, `scripts/*`, and the `vinext@0.0.50` / `vite@8` / `@vitejs/plugin-rsc` / `@cloudflare/vite-plugin` devDependencies in `package.json` | The canonical app is Next 16.2.9 on Vercel with Turbopack. The Site is `next@16.2.6` **shimmed by Vinext on Cloudflare**. Incompatible runtime. |
| **npm lockfile** | `package-lock.json` (380 KB) | Canonical is a pnpm/turbo monorepo. Two lockfiles is an immediate supply-chain hazard. |
| **Worker hosting file** | `worker/index.ts`, `worker-env.d.ts`, `.openai/hosting.json` (`{"d1":null,"project_id":"appgprj_…","r2":null}`) | Cloudflare Worker + ChatGPT Sites hosting identity. Meaningless and misleading in this repo. |
| **D1 examples** | `examples/d1/**` (`app/api/notes/route.ts`, `db/schema.ts`), `db/index.ts`, `db/schema.ts`, `drizzle/`, `drizzle.config.ts` | Drizzle/D1 scaffolding. Canonical persistence is Supabase + 146 SQL migrations. |
| **Persona switch** | `AccountPage` in `app/travel/commerce.tsx` — the `<select aria-label="Demo persona">` with `owner / editor / viewer / other / merchant / ops`, plus the adjacent "Next operation" fault injector (`network, conflict, quota, expired, contract, upload`) | `BACKEND-CONTRACT-INVENTORY.md` is explicit: *"Do not replace active-creator/merchant/ops gates with a visual role toggle."* Canonical role comes from `getAuthorizationContext` / `resolveViewerRoleFromFacts`. |
| **Workbench local store** | `app/travel/model.ts` (28.9 KB) and `app/travel/connected-model.ts` (20.8 KB) — the whole demo domain model, `AppError` codes, revisions, idempotency keys, `earningsView`, `reconcileEligibility` | These are a *client-side simulation* of a backend. Canonical equivalents are server actions + RLS. |
| **Demo localStorage** | keys `kinnso-journeys:demo:v2` and `kinnso-journeys:commerce-demo:v3`; events `kinnso-change` / `kinnso-commerce-change`; the `storage` + custom-event `refresh()` loop in `Workbench.tsx` | Same reason. Note `vitest.config.ts` already passes `--no-experimental-webstorage` for an unrelated Node 22 `localStorage` bug — adding browser-storage state here has a known sharp edge. |

**Two additional items not named in §3.1 that should be treated the same way:**

- **`app/KinnsoExperience.tsx` (178 KB) + `app/travel/LegacyPage.tsx`** — the original
  single-file English legacy app served at `/en/legacy/*`. It contains **4 live
  `images.unsplash.com` hotlinks**. Canonical policy is the opposite:
  `lib/media/entity-media.ts::isApprovedEntityMediaUrl` allows **only**
  `https://cdn.kinnso.ai`, and `Hero.tsx` documents "no Unsplash hotlinks anywhere on the
  rebuilt homepage".
- **The `.k-mode` demo banner** in `Workbench.tsx` ("Demo — sample data, saved on this
  device"). The canonical app is not a demo. Porting the chrome while dropping this string
  is required, not optional.

The **shell chrome itself** — the `.cj-workspace` / `.cj-sidebar` structure, the
collapsed-secondary `<details>`, the "leave the workspace" link, the ≤900 px scrolling nav
rail and the ≤650 px tab bar — is **not** on the forbidden list. Those are layout ideas,
and they are the only part of §6.1 worth taking.

---

## 5. LICENSING — AdventureLog

**Yes. The Site source contains GPL-3.0 code, and it is load-bearing, not vendored-unused.**

Files that carry the obligation:

| File | Status |
|---|---|
| `app/travel/upstream/imagePins.ts` (1,802 bytes) | **The GPL file.** Header: *"AdventureLog imagePins.ts, commit `5673ef5bb5aaa96081bc250ef1d16da8b45977e3`. Copyright (C) 2023–2026 Sean Morley. GPL-3.0. Modified 2026-09-10."* Exports `imageMapPinToFeature` / `imageMapPinsToGeoJson`. |
| `app/travel/TripMap.tsx` | **Derived.** Line 4 is `import {imageMapPinsToGeoJson} from './upstream/imagePins'`, and its `stopsToGeoJson` adapter calls it on every render. |
| `LICENSE` (32,949 bytes, repo root) | Full GNU GPL v3, opening with the AdventureLog copyright notice. |
| `public/licenses/GPL-3.0.txt` (32,949 bytes — byte-identical to the root `LICENSE`) | The public license notice the Credits page links. |
| `public/source/kinnso-journeys-source.zip` | Claimed by the manifest as the corresponding-source download. **Not present in this extracted snapshot** — consistent with the manifest's own statement that the ZIP is regenerated by `scripts/package-corresponding-source.py` and "does not recursively include itself". Not independently verified here. |

What `docs/ADVENTURELOG-REUSE-MANIFEST.md` claims, verbatim in substance:

- Upstream `frontend/src/lib/map/imagePins.ts` at pinned commit `5673ef5b…`, original Git
  blob `c8034fa9…`, license blob `685b6810…`.
- *"`imageMapPinToFeature` and `imageMapPinsToGeoJson` **retain the upstream function
  bodies**"* — v3 re-verification states both are **byte-for-byte identical** to upstream
  after trimming outer whitespace, and that the root and public license files **match
  upstream bytes**.
- *"The converter therefore participates in active runtime behavior; **this is not merely
  visual inspiration or unused vendored code**."*
- *"The covered modified application is distributed under GPL v3 without warranty."* The
  Credits page must expose `/licenses/GPL-3.0.txt` and a corresponding-source ZIP
  containing source, types, dependency manifests **and lockfile**, build scripts, config
  and docs.
- No AdventureLog account, API, Django database, Svelte app, authorization scheme or
  server was copied.

**Consequence for this repository.** `apps/web` today contains **no AdventureLog code and
no `LICENSE` file** — confirmed independently for this assessment: a scan for
`AdventureLog|imagePins|GPL-3|GNU General Public` across the tracked tree matches **only
three markdown files**, all of them prose in `docs/implementation/`
(`CURRENT-STATE.md` §5.1, `STATUS.md`, `PHASE-BACKLOG.md`), and `git ls-files` returns **no
`LICENSE` or `COPYING` file at all**. Neither `package.json` declares a `license` field.

Therefore porting `imagePins.ts` (or `TripMap.tsx`, which calls it) would **introduce a
GPL-3.0 obligation into an application that currently has none** — copyleft over the
covered work plus a corresponding-source offer including the lockfile. That is an owner
licensing decision, not an implementation detail, and it is already recorded as such in
`PHASE-BACKLOG.md` ("Port AdventureLog map converters — an owner licensing decision").

**Relevance to §6.1: none.** The GPL code is a GeoJSON converter behind a map. It is not in
the traveller, creator or merchant shell, not in the mobile nav, and not in the compact
home. **The three shells can be ported with zero licensing exposure**, provided
`app/travel/upstream/`, `app/travel/TripMap.tsx` and `LICENSE` are left where they are.

---

## 6. Recommendation

| Slice | Verdict |
|---|---|
| **Merchant dashboard shell** | **Do it.** 11/11 nav targets already live; `AdminShell` + `admin/layout.tsx` are a working in-repo template; it fixes a real defect — 14 of 15 dashboard pages currently have no dashboard-scoped navigation. |
| **Studio shell** | **Do it, after deciding the IA question in §3.3.1.** 4/4 primary targets map under canonical slugs. Keep `StudioQuickLinks` reachable, or the port hides 7+ live studio surfaces. |
| **Traveller mobile tab bar** | **Only if scoped to routes that exist.** Two of the Site's four tabs (`Record`, `Me`) have no canonical destination. A `Explore / Trips / Agent / Studio-or-Sign-in` bar is a small, honest win; the Site's bar as drawn ships dead links. |
| **Compact home** | **Split.** Home search box → `/explore?q=` is small and safe. Section compaction is a copy decision across 7 locales. The resume-trip card is Phase 2 work, not §6.1. |
| **Anything in §4** | **Do not port.** |
| **AdventureLog converters** | **Owner decision, unrelated to §6.1. Default: do not port.** |

**Net:** plan §6.1 conflates cheap chrome with expensive destinations. The chrome is
roughly **3 components + 2 route-group layouts + ~20 message keys × 7 locales**. What makes
it look large is that the Site's shells were drawn against a demo route map that includes
`/record`, `/me`, `/saved`, `/help`, `/credits` and a trip/itinerary domain — none of which
exist here. Port the structure; re-target the links against the real 93-route map.
