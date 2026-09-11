# ROUTE-CONTINUITY — every route, its actor, its gate, its inbound link

**Phase 0 deliverable (plan §5).** Supports the plan §6 exit-gate item *"all retained
navigation has an explicit destination"*, which `STATUS.md` §"Phase 1 exit gate" currently
records as **"Improved, not audited."** This document is that audit.

**Derived from source, not from the plan's route list.** Every row below was produced by
enumerating `app/` and then opening the file. Where a gate or a link is named, it was read;
nothing here is inferred from a route's name.

| | |
|---|---|
| **App** | `apps/web` (Next.js 16.2.9, React 19.2.4) |
| **Working branch** | `claude/phase01-canonical-frontend` |
| **Enumeration** | `find app -name 'page.tsx' -o -name 'route.ts'` → **93 `page.tsx` + 11 `route.ts` = 104 files** |
| **Route patterns** | **92 locale-scoped page patterns** + 1 unlocalized root page + 2 locale-scoped route handlers + 9 unlocalized API route handlers |
| **Locales** | 7 — `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, `zh-cn` (`lib/i18n/config.ts:1`) |

> **Locales are a path prefix, not a route.** `[locale]` multiplies every pattern below by 7
> at request time. This document counts **patterns**. The 92 locale-scoped page patterns
> correspond to 644 concrete URLs; that number is not useful for continuity and is not used
> again.

---

## 1. How gating actually works

There are three independent layers. A route may be covered by one, two, or all three.

### 1.1 Proxy (edge) — `apps/web/proxy.ts` + `apps/web/lib/auth/gate.ts`

`gateDecision(pathname, hasSession, search)` is a **session check only — it knows nothing
about roles.** It matches the path *after* the locale segment against a literal prefix list
(`lib/auth/gate.ts:41-50`):

```
creator, creator/, merchants/dashboard, studio/missions, ops/settlements, admin, trips, trips/
```

An anon request to a matching path gets a **307** to
`signInHref(locale, pathname + search)` — i.e. `/{locale}/sign-in?next=<encoded>`. A path
with no recognised locale prefix is always allowed; the locale guard
(`lib/redirects/resolve.ts`) adds the prefix first and the request comes back through.

The matcher skips `api`, `_next/*`, metadata files, and anything with a file extension
(`proxy.ts:75`), so **no `/api/*` route is proxy-gated**.

**Consequences worth naming:** the list gates `studio/missions` but **not** `studio` or any
other `studio/*` child; it gates `ops/settlements` but **not** `ops` (so
`/ops/accept-invite` is not proxy-gated); and it gates `merchants/dashboard` but **not** the
legacy `/merchants/missions`-style aliases that redirect into it.

### 1.2 Page guards — `apps/web/lib/admin/guard.ts`

| Guard | Anon | Wrong role |
|---|---|---|
| `requireOpsPage(supabase, loc)` | `redirect('/{loc}/sign-in')` | `notFound()` |
| `requireMerchantPage(supabase, loc)` | `redirect('/{loc}/sign-in')` | `notFound()`; returns server-derived `merchantId` |
| `requireCreatorPage(supabase, loc, denied)` | `redirect('/{loc}/sign-in')` | `denied='not-found'` (default) → `notFound()`; `'studio'` → `/{loc}/studio`; `'creator'` → `/{loc}/creator` |

`requireTravelerAction` is an *action* gate, but `/{locale}/offers/[claimId]` uses it as a
page gate and converts the failure to `notFound()`.

### 1.3 Inline checks

Several pages do their own `supabase.auth.getUser()` plus `redirect()` / role fan-out rather
than calling a guard. Each is named in the tables.

### 1.4 What every page does regardless

**86** of the 92 locale-scoped pages open with the exact line
`if (!isLocale(locale)) notFound()`. Two more — `/articles/[category]` and
`/articles/[category]/[url]` — fold the same check into
`if (!isLocale(locale) || !toDbCategory(category)) notFound()`. The remaining **four** coerce
an unrecognised locale to `'en'` rather than 404-ing: `/studio/insights`, `/studio/tier`,
`/ops/accept-invite`, `/creators/apply`. (Verified by `grep -rL` over
`app/[locale]/**/page.tsx`.)

That is a locale-validation difference, not an auth difference, and is recorded here only so
a future reader does not mistake it for a gap in the gate — all four still carry their real
gate (`requireCreatorPage` ×2, an inline `getUser()`, and a public redirect).

---

## 2. Legend

**Actor** — the minimum viewer the route serves: `anon` · `traveler` (any signed-in user) ·
`creator` · `merchant` · `ops`.

**Gate** — `proxy` (matched prefix from §1.1) · a `require*Page` guard · `inline` (own
`getUser()`/role logic) · `none` (public).

**Disposition**
- **keep** — a real destination, linked from navigation.
- **alias** — `permanentRedirect` (308) to the canonical path; legacy bookmark support.
- **redirect stub** — `redirect` (307) to another route; no UI of its own.
- **intentionally unlinked** — reached by an external hand-off (Stripe, a Supabase email, a
  copied invite URL, a programmatic `router.push`), never by a nav link. Correct as-is.
- **UNLINKED — gap** — nothing in the product reaches it. This is the exit-gate failure mode.

---

## 3. Public marketing and content

All gate `none`; all are anon-reachable; all are in `MARKETING_PATHS` or are public detail
pages. `SiteChrome` renders `Navbar` + `Footer` on every one of them.

| Path pattern | Actor | Gate | Reachable from | Disposition |
|---|---|---|---|---|
| `/[locale]` | anon | none | `Navbar.tsx` wordmark (`p("")`) | keep |
| `/[locale]/explore` | anon | none | `Navbar.tsx:37`, `Footer.tsx:20` | keep |
| `/[locale]/destinations` | anon | none | `Navbar.tsx:38`, `Footer.tsx:21` | keep |
| `/[locale]/destinations/[slug]` | anon | none | `DestinationsIndexView.tsx:34` | keep |
| `/[locale]/articles` | anon | none | `Navbar.tsx:39`, `Footer.tsx:22` | keep |
| `/[locale]/articles/[category]` | anon | none | article cards / category chips | keep |
| `/[locale]/articles/[category]/[url]` | anon | none | article cards | keep |
| `/[locale]/sessions` | anon | none | `Navbar.tsx:40` (only when `sessionsLive`), `Footer.tsx:23` (unconditional) | keep — see **F7** |
| `/[locale]/sessions/[slug]` | anon | none (reads session for RSVP state) | `SessionCard.tsx:9`, `HomeView.tsx:172` | keep |
| `/[locale]/agent` | anon | none (503→waitlist view when `agentLive` false) | `Navbar.tsx:41`, `Footer.tsx:55` | keep |
| `/[locale]/creators` | anon | none | `Navbar.tsx:42` | keep |
| `/[locale]/c/[handle]` | anon | none | `CreatorCard.tsx:7`, `CreatorsLandingView.tsx:60`, `MissionDetailView.tsx:73,104` | keep |
| `/[locale]/g/[slug]` | anon | none (reads session for save state) | `GuideCard.tsx:14`, `HomeView.tsx:95` | keep |
| `/[locale]/merchants` | anon | none | `Navbar.tsx:43`, `Footer.tsx:46` | keep |
| `/[locale]/m/[slug]` | anon | none | `MerchantsDirectoryView.tsx:27`, `ExperiencePublicView.tsx:64,95` | keep |
| `/[locale]/experiences/[slug]` | anon | none (reads session for save state) | `ExperienceCard.tsx:27`, `ExperienceLinkCard.tsx:17`, `PublicMerchantProfileView.tsx:43`, `TravelerTripsView.tsx:85` | keep |
| `/[locale]/for-creators` | anon | none | `Navbar.tsx:68` (hidden for creators), `Footer.tsx:36` | keep |
| `/[locale]/for-merchants` | anon | none | `Navbar.tsx:70` (hidden for merchants), `Footer.tsx:48` | keep |
| `/[locale]/about` | anon | none | `Footer.tsx:54` | keep |
| `/[locale]/contact` | anon | none | `Footer.tsx:56` | keep |
| `/[locale]/legal/creator-terms` | anon | none | `Footer.tsx:57` | keep |

---

## 4. Auth and account

| Path pattern | Actor | Gate | Reachable from | Disposition |
|---|---|---|---|---|
| `/` (unlocalized) | anon | none | direct hit / external link | keep — `redirect('/en')` (`app/page.tsx:5`) |
| `/[locale]/sign-in` | anon | inline — signed-in user redirected to `next` or `/{locale}/studio` (`sign-in/page.tsx:41`) | `Navbar.tsx:113,174`; every proxy gate redirect; `requireXPage` anon branch | keep — renders bare (no chrome) |
| `/[locale]/sign-up` | anon | inline — signed-in user redirected to `/{locale}/studio` (`sign-up/page.tsx:35`) | `Navbar.tsx:60` CTA (anon), `Footer.tsx:37`, and the `/creators/apply` redirect stub | keep — renders bare |
| `/[locale]/forgot-password` | anon | none | `sign-in/page.tsx:64`, `auth/reset-password/page.tsx:37` | keep |
| `/[locale]/auth/reset-password` | anon | none (Supabase recovery token is the authority) | Supabase recovery email — `redirectTo` set in `forgot-password/ForgotPasswordForm.tsx:33` | intentionally unlinked |
| `/[locale]/auth/callback` (route) | anon | none (PKCE `code` exchange is the authority) | Supabase confirmation email — `emailRedirectTo` in `sign-up/SignUpForm.tsx:59` | intentionally unlinked — on success redirects to `/{locale}/creator` |
| `/[locale]/auth/sign-out` (route) | traveler | none; CSRF guard rejects `Sec-Fetch-Site: cross-site` (`sign-out/route.ts:26`) | **only** `components/onboarding/WizardClient.tsx:187` — the final step of the `/creator` wizard | keep — but see **F2**, no global sign-out exists |

---

## 5. Traveler

| Path pattern | Actor | Gate | Reachable from | Disposition |
|---|---|---|---|---|
| `/[locale]/trips` | traveler | `proxy:trips` + inline `getUser()` → `redirect('/{loc}/sign-in')` (`trips/page.tsx:30`) | `Navbar.tsx:59` CTA (role `traveler`), `Footer.tsx:29` (only when `bookingLive`) | keep — see **F7** |
| `/[locale]/trips#saved` | traveler | as above | `Footer.tsx:30` | keep — anchor exists at `TravelerTripsView.tsx:137` |
| `/[locale]/offers/[claimId]` | traveler | **no proxy prefix**; page calls `requireTravelerAction` → `notFound()` on failure, then requires the `offer-token-<claimId>` cookie and an owner-scoped `get_my_offer_claim` RPC (`offers/[claimId]/page.tsx:16-27`) | `OfferClaimCard.tsx:56` — `router.push` after a successful claim | intentionally unlinked (programmatic hand-off) |
| `/[locale]/experiences/[slug]/booked` | anon | none — anon-readable confirmation; the review form is gated by `booking.travelerUserId === user.id` (`booked/page.tsx:74-76`) | Stripe Checkout `success_url` (`lib/experiences/booking-actions.ts:125`) | intentionally unlinked (external hand-off) |
| `/[locale]/feed` | anon | none | `app/[locale]/g/[slug]/page.tsx:142` — "view all guides" | redirect stub → `/{locale}/explore`; see **F3** |

---

## 6. Creator — onboarding and Studio

`/[locale]/creator` is the onboarding wizard; `/[locale]/studio/*` is the working surface.
`SiteChrome` renders `/creator` **bare** (no navbar/footer) — `SiteChrome.tsx:11`.

| Path pattern | Actor | Gate | Reachable from | Disposition |
|---|---|---|---|---|
| `/[locale]/creator` | traveler (pre-creator) | `proxy:creator` + inline `getUser()` → sign-in (`creator/page.tsx:38`) | `StudioOnboardingPrompt.tsx:20`; plus redirects from `/studio` (×2), `/studio/copilot`, `auth/callback`, `SignUpForm.tsx:95`, and `requireCreatorPage(..., 'creator')` | keep |
| `/[locale]/studio` | creator | **no proxy prefix**; inline `getUser()` → sign-in, then role fan-out: merchant → `/merchants/dashboard/post`, ops → `/admin/creators/payouts`, non-active creator or invalid DNA → `/creator` (`studio/page.tsx:32-56`) | `Navbar.tsx:55` CTA (role `creator`), `Footer.tsx:38` | keep — the role hub |
| `/[locale]/studio/scan` | anon | **none** — anon gets a mock demo view (`studio/scan/page.tsx:47-58`) | `StudioQuickLinks.tsx:11`, `DnaSnapshotCard.tsx:67`, `StudioReadinessChecklist.tsx:111`, `lib/studio/next-action.ts:62,71` | keep — public by design |
| `/[locale]/studio/copilot` | creator | `requireCreatorPage` (default) + DNA validity → `/creator` (`copilot/page.tsx:27`) | `StudioQuickLinks.tsx:12` | keep |
| `/[locale]/studio/missions` | creator | `proxy:studio/missions` + `requireCreatorPage` (default) | `StudioQuickLinks.tsx:13`, `Footer.tsx:39`, `StudioDashboardView.tsx:108`, `StudioScanView.tsx:70`, `CreatorMissionDetailView.tsx:215` | keep |
| `/[locale]/studio/missions/[id]` | creator | `proxy:studio/missions` + `requireCreatorPage` (default) | `CreatorMissionsView.tsx:55`, `StudioDashboardView.tsx:116`, `StudioInboxView.tsx:16` | keep |
| `/[locale]/studio/tier` | creator | `requireCreatorPage(..., 'studio')` | `StudioQuickLinks.tsx:14`, `TierProgressCard.tsx:26`, `CreatorCopilotView.tsx:94`, `StudioPerksView.tsx:83` | keep |
| `/[locale]/studio/earnings` | creator | `requireCreatorPage` (default) | `StudioQuickLinks.tsx:15`, `Footer.tsx:40` | keep |
| `/[locale]/studio/offers` | creator | `requireCreatorPage` (default) | `StudioQuickLinks.tsx:16`, `StudioDashboardView.tsx:116`, `lib/studio/next-action.ts:65` | keep |
| `/[locale]/studio/perks` | creator | `requireCreatorPage` (default) | `StudioQuickLinks.tsx:17` | keep |
| `/[locale]/studio/inbox` | creator | `requireCreatorPage` (default) | `StudioQuickLinks.tsx:18` (carries the unread badge) | keep |
| `/[locale]/studio/insights` | creator | `requireCreatorPage(..., 'studio')` | `StudioQuickLinks.tsx:20` | keep |
| `/[locale]/studio/guides` | creator | `requireCreatorPage(..., 'creator')` | `StudioQuickLinks.tsx:19` | keep |
| `/[locale]/studio/guides/new` | creator | `requireCreatorPage(..., 'creator')` | `MyGuidesView.tsx:28`, `StudioReadinessChecklist.tsx:51`, `lib/studio/next-action.ts:67` | keep |
| `/[locale]/studio/guides/[id]/edit` | creator | `requireCreatorPage(..., 'creator')` + row ownership → `notFound()` | `MyGuidesView.tsx:59` | keep |
| `/[locale]/studio/sessions` | creator | `requireCreatorPage(..., 'creator')` | `StudioQuickLinks.tsx:21` | keep |
| `/[locale]/studio/sessions/new` | creator | `requireCreatorPage(..., 'creator')` | `MySessionsView.tsx:24` | keep |
| `/[locale]/studio/sessions/[id]/edit` | creator | `requireCreatorPage(..., 'creator')` + row ownership → `notFound()` | `MySessionsView.tsx:43` | keep |
| `/[locale]/creators/apply` | anon | none | `Navbar.tsx:56` CTA (role `creator-pending`) | redirect stub → `/{locale}/sign-up` |

**Gate asymmetry.** Only `studio/missions` is in the proxy prefix list. Every other
`/studio/*` route is protected **solely** by its page guard. Counted: **17 pages under
`app/[locale]/studio/`, 15 of which call `requireCreatorPage`.** The two that do not are
`/studio` (its own `getUser()` + role fan-out) and `/studio/scan` (anon demo by design). No
`/studio/*` route is unprotected by accident.

---

## 7. Merchant

`/[locale]/merchants/dashboard/*` is the whole merchant app: **15 page patterns, and all 15
call `requireMerchantPage`.** The proxy additionally gates the entire subtree for anon.

| Path pattern | Actor | Gate | Reachable from | Disposition |
|---|---|---|---|---|
| `/[locale]/merchants/apply` | anon | inline — anon gets `MerchantApplySignedOutView`, existing merchant gets `MerchantApplyAlreadyMerchantView` (`merchants/apply/page.tsx:25-32`); the submit server action is the real gate | **no nav link** — reached only by redirect from `/merchants/post` (`merchants/post/page.tsx:17,24`) | intentionally unlinked (funnel step) |
| `/[locale]/merchants/post` | anon | inline `getUser()` + `resolveViewerRole` fan-out, no UI of its own | `Footer.tsx:47`, `ForMerchantsView.tsx:30,84` | redirect stub — merchant → `/merchants/dashboard/post`, everyone else → `/merchants/apply` |
| `/[locale]/merchants/dashboard` | merchant | `proxy:merchants/dashboard` + `requireMerchantPage` | `MerchantDashboardHomeView` is itself the hub; reached from `/merchants/post` fan-out and from deep-link breadcrumbs | keep — the hub |
| `/[locale]/merchants/dashboard/post` | merchant | proxy + `requireMerchantPage` | `Navbar.tsx:57` CTA (role `merchant`), `MerchantDashboardHomeView.tsx:12` | keep |
| `/[locale]/merchants/dashboard/missions` | merchant | proxy + `requireMerchantPage` | `Navbar.tsx:48` (merchant second row), `MerchantDashboardHomeView.tsx:13` | keep |
| `/[locale]/merchants/dashboard/missions/[missionId]` | merchant | proxy + `requireMerchantPage` + row scoped to `merchantId` → `notFound()` | `MerchantMissionsView.tsx:42`, `MissionPostWizard.tsx:156` | keep |
| `/[locale]/merchants/dashboard/creators` | merchant | proxy + `requireMerchantPage` | `Navbar.tsx:49`, `MerchantDashboardHomeView.tsx:14` | keep |
| `/[locale]/merchants/dashboard/insights` | merchant | proxy + `requireMerchantPage` | `Navbar.tsx:50`, `MerchantDashboardHomeView.tsx:15` | keep |
| `/[locale]/merchants/dashboard/experiences` | merchant | proxy + `requireMerchantPage` | `MerchantDashboardHomeView.tsx:16` | keep |
| `/[locale]/merchants/dashboard/experiences/new` | merchant | proxy + `requireMerchantPage` | `MerchantExperiencesView.tsx:46` | keep |
| `/[locale]/merchants/dashboard/experiences/[experienceId]/edit` | merchant | proxy + `requireMerchantPage` + ownership → `notFound()` | `MerchantExperiencesView.tsx:63` | keep |
| `/[locale]/merchants/dashboard/experiences/[experienceId]/availability` | merchant | proxy + `requireMerchantPage` + ownership → `notFound()` | `MerchantExperiencesView.tsx:65` | keep |
| `/[locale]/merchants/dashboard/bookings` | merchant | proxy + `requireMerchantPage` | `MerchantDashboardHomeView.tsx:17` | keep |
| `/[locale]/merchants/dashboard/offers` | merchant | proxy + `requireMerchantPage` | `MerchantDashboardHomeView.tsx:21` | keep — **linked in slice S4; was dark** |
| `/[locale]/merchants/dashboard/redeem` | merchant | proxy + `requireMerchantPage` | `MerchantDashboardHomeView.tsx:22` | keep — **linked in slice S4; was dark** |
| `/[locale]/merchants/dashboard/profile` | merchant | proxy + `requireMerchantPage` + profile row → `notFound()` | `MerchantDashboardHomeView.tsx:23` | keep |
| `/[locale]/merchants/dashboard/budget` | merchant | proxy + `requireMerchantPage` | `MerchantDashboardHomeView.tsx:24` | keep |
| `/[locale]/merchants/missions` | — | none (see **F4**) | nothing | **alias** → `/{locale}/merchants/dashboard/missions` |
| `/[locale]/merchants/missions/[missionId]` | — | none | nothing | **alias** → `/{locale}/merchants/dashboard/missions/{missionId}` |
| `/[locale]/merchants/insights` | — | none | nothing | **alias** → `/{locale}/merchants/dashboard/insights` |
| `/[locale]/merchants/creators` | — | none | nothing | **alias** → `/{locale}/merchants/dashboard/creators` |

---

## 8. Ops / admin

Every `/[locale]/admin/*` page is gated **twice**: `app/[locale]/admin/layout.tsx:14` calls
`requireOpsPage`, and each of the 21 pages calls it again. The proxy also gates the whole
`admin` prefix for anon. `AdminShell` (`components/kinnso/admin/AdminShell.tsx:10-23`)
supplies the 12-item sidebar; anything not in the sidebar must be linked from a hub page.

| Path pattern | Actor | Gate | Reachable from | Disposition |
|---|---|---|---|---|
| `/[locale]/admin` | ops | proxy + layout + `requireOpsPage` | `AdminShell.tsx:11`; `Navbar.tsx:58` CTA (role `ops`) | keep |
| `/[locale]/admin/creators` | ops | proxy + layout + page | `AdminShell.tsx:12` | keep |
| `/[locale]/admin/creators/directory` | ops | proxy + layout + page | `CreatorsTabs.tsx:11`, `CreatorDetailView.tsx:90` (back link) | keep |
| `/[locale]/admin/creators/payouts` | ops | proxy + layout + page | `CreatorsTabs.tsx:12`; also the ops landing from `/studio` (`studio/page.tsx:37`) and from `/ops/settlements` | keep |
| `/[locale]/admin/creators/[creatorId]` | ops | proxy + layout + page + `notFound()` on missing detail | `CreatorsDirectoryView.tsx:186`, `CreatorPayoutsView.tsx:163`, `CreatorPayoutBatchesView.tsx:130` | keep |
| `/[locale]/admin/merchants` | ops | proxy + layout + page | `AdminShell.tsx:13` | keep |
| `/[locale]/admin/merchants/directory` | ops | proxy + layout + page | `MerchantsTabs.tsx:11`, `MerchantDetailView.tsx:100` (back link) | keep |
| `/[locale]/admin/merchants/applications` | ops | proxy + layout + page | `MerchantsTabs.tsx:12` | keep |
| `/[locale]/admin/merchants/[merchantId]` | ops | proxy + layout + page + `notFound()` on missing detail | `MerchantsDirectoryView.tsx:168`, `AdminUsersView.tsx:109,116` | keep |
| `/[locale]/admin/missions` | ops | proxy + layout + page | `AdminShell.tsx:14`, `MissionsTabs.tsx:9` | keep |
| `/[locale]/admin/missions/review` | ops | proxy + layout + page | `MissionsOverviewView.tsx:44` | keep |
| `/[locale]/admin/missions/[missionId]` | ops | proxy + layout + page + `notFound()` on missing detail | **nothing** | **was UNLINKED (F1) — ✅ fixed**, now linked from `MissionsOverviewView.tsx:82` |
| `/[locale]/admin/bookings` | ops | proxy + layout + page | `AdminShell.tsx:15` | keep |
| `/[locale]/admin/perks` | ops | proxy + layout + page | `AdminShell.tsx:16` | keep |
| `/[locale]/admin/testimonials` | ops | proxy + layout + page | `AdminShell.tsx:17` | keep |
| `/[locale]/admin/enquiries` | ops | proxy + layout + page | `AdminShell.tsx:18` | keep |
| `/[locale]/admin/analytics` | ops | proxy + layout + page | `AdminShell.tsx:19` | keep |
| `/[locale]/admin/sessions` | ops | proxy + layout + page | `AdminShell.tsx:20` | keep |
| `/[locale]/admin/users` | ops | proxy + layout + page | `AdminShell.tsx:21` | keep |
| `/[locale]/admin/team` | ops | proxy + layout + page | `AdminShell.tsx:22` | keep |
| `/[locale]/admin/team/directory` | ops | proxy + layout + page | `TeamOverviewView.tsx:80` | keep |
| `/[locale]/ops/accept-invite` | traveler → ops | **no proxy prefix** (`ops/settlements` is the only `ops` entry); inline `getUser()` → `/{loc}/sign-in?next=…`; the `admin_accept_ops_invite` RPC is the real authority | invite URL built and copied to clipboard at `TeamOverviewView.tsx:30` | intentionally unlinked (out-of-band invite) |
| `/[locale]/ops/settlements` | ops | `proxy:ops/settlements`; no page guard of its own — the destination's `requireOpsPage` covers it | **nothing** | redirect stub → `/{locale}/admin/creators/payouts` (legacy R10.2 bookmark) |

---

## 9. Findings

### F1 — `/[locale]/admin/missions/[missionId]` was reachable by no link — ✅ **FIXED**

> **Resolved after this audit was written.** The at-risk mission title in
> `MissionsOverviewView.tsx:82` now links to `/{locale}/admin/missions/{id}`, pinned by two
> assertions in `kinnso.MissionsOverviewView.test.tsx` including the locale prefix. The
> original finding is kept below because it is what the audit was for, and because the same
> failure mode (B7) had already occurred twice elsewhere.

#### The original finding

The only references to this path anywhere in `apps/web` are:

- `app/[locale]/admin/missions/[missionId]/page.tsx` — the page itself
- `lib/admin/mission-review-actions.ts:9` — a `revalidatePath` target

Verified by grepping every `href=` in `components/kinnso/admin/**`: `MissionsOverviewView`
links only to `/admin/missions/review`; `MissionsTabs` contains a single tab
(`/admin/missions`); `MissionReviewQueueView` and `SubmissionQueueRow` contain no `href` at
all. `AdminShell`'s sidebar stops at `/admin/missions`.

So an ops reviewer can open the review queue and act on submissions, but **cannot navigate to
a mission's own detail page** — the page that `mission-review-actions` revalidates after
every decision. It is reachable only by typing the URL.

This is the same class of defect as `PHASE-BACKLOG.md` **B7** (`/merchants/dashboard/offers`
and `/merchants/dashboard/redeem`, fixed in slice S4) and it was not caught by that fix,
which only touched the merchant dashboard grid.

**Minimum fix:** link the mission title from the missions overview and/or from each review
queue row to `/{locale}/admin/missions/{missionId}`.

### F2 — there is no sign-out control in the global chrome

`/{locale}/auth/sign-out` is a working GET route with a CSRF guard. Its **only** inbound link
in the entire app is `components/onboarding/WizardClient.tsx:187`, on the final "read-back"
step of the creator onboarding wizard.

`Navbar.tsx` renders a sign-in link when `role === "anon"` and a role CTA otherwise; it never
renders sign-out. `Footer.tsx` has no account column. So a signed-in traveler, merchant, or
ops user has **no in-product way to sign out**, and a creator has one only while standing on
the last step of onboarding.

This is a navigation-continuity gap in the opposite direction from F1: the destination exists
and is correct, but no persistent surface offers an entry point to it.

### F3 — the one link to `/feed` points at a redirect stub

`app/[locale]/g/[slug]/page.tsx:142` renders the "view all guides" control as a `<Link>`
whose `href` is the template `/${locale}/feed`. `/feed` exists only to `redirect()` to
`/explore` (`feed/page.tsx:12`), so every use of that link costs an extra server round-trip
and a 307.

The destination is explicit, so this does not fail the exit gate — but the canonical path is
`/explore` and the link should point there. `/feed` itself should stay as a bookmark alias.

### F4 — `permanentRedirect` alias inventory (all correct, all deliberately unlinked)

Four 308 aliases survive from the R2B move of the merchant app under
`/merchants/dashboard/*` (design spec D-R2-5). None is referenced by any link, which is the
intended state for a legacy alias.

| Alias | → Canonical |
|---|---|
| `/[locale]/merchants/missions` | `/[locale]/merchants/dashboard/missions` |
| `/[locale]/merchants/missions/[missionId]` | `/[locale]/merchants/dashboard/missions/[missionId]` |
| `/[locale]/merchants/insights` | `/[locale]/merchants/dashboard/insights` |
| `/[locale]/merchants/creators` | `/[locale]/merchants/dashboard/creators` |

**Anon reaching an alias is still gated, but only on the second hop.** The proxy prefix list
contains `merchants/dashboard`, not `merchants/missions`, so an anon request to
`/en/merchants/missions` gets a 308 to `/en/merchants/dashboard/missions` and *that* request
is redirected to sign-in. Two hops, correct outcome, no leak: the alias page renders nothing
and reads nothing before redirecting.

Three further redirect stubs use 307 rather than 308 and are **not** legacy aliases:
`/creators/apply` → `/sign-up`, `/feed` → `/explore`, `/ops/settlements` →
`/admin/creators/payouts`. `/merchants/post` is a fourth, role-dependent one.

### F5 — routes with no page-level gate, and what covers them

| Route | Page-level gate | Actually covered by |
|---|---|---|
| `/[locale]/studio/scan` | none | nothing — **anon-reachable by design**; anon renders a mock demo (`mode="demo"`), signed-in renders RLS-owner-scoped reads |
| `/[locale]/ops/settlements` | none | proxy (`ops/settlements`) for anon, then `requireOpsPage` on the destination |
| `/[locale]/merchants/{missions,missions/[id],insights,creators}` | none | the canonical target's proxy prefix + `requireMerchantPage`, on the second hop |
| `/[locale]/feed`, `/[locale]/creators/apply` | none | nothing needed — both targets are public |
| `/[locale]/experiences/[slug]/booked` | none | nothing for viewing (intentionally anon-readable); the review **server action** `requireTravelerAction` + `booking.travelerUserId === user.id` covers the only write |
| `/[locale]/merchants/apply` | none (renders a signed-out view instead) | the application **server action**; `resolveViewerRole` only chooses which view to render |
| `/[locale]/ops/accept-invite` | none (inline `getUser()` → sign-in with `next`) | the `admin_accept_ops_invite` RPC — the token, not the page, is the authority |
| `/[locale]/offers/[claimId]` | `requireTravelerAction` used as a page gate | that guard + the `offer-token-<claimId>` cookie + the owner-scoped `get_my_offer_claim` RPC |
| `/[locale]/studio` | none (inline fan-out) | its own `getUser()` → sign-in, then role fan-out and an active-creator + valid-DNA check |
| `/[locale]/merchants/post` | none (inline fan-out) | its own `getUser()` + `resolveViewerRole`; it renders no data |

No route in this table is unprotected by accident.

### F6 — API route handlers are outside the proxy entirely

`proxy.ts:75` excludes `api` from the matcher, so each handler carries its own gate.

| Route | Gate |
|---|---|
| `POST /api/analytics` | none by design — anon events are the common case; rate-limited, and a missing session is tolerated (`route.ts:88`) |
| `POST /api/agent` | none — anon allowed with an `anonSessionId` uuid; 503 when `agentLive` is false or the provider is unconfigured |
| `POST /api/copilot` | `getUser()` → 401, `resolveViewerRole !== 'creator'` → 403 |
| `GET /api/admin/analytics` | `getUser()` → 401, `resolveViewerRole !== 'ops'` → 403 |
| `GET /api/cron/travelpayouts-sync` | `Authorization: Bearer $CRON_SECRET`, constant-time compare → 401 |
| `GET /api/cron/traveller-analytics-retention` | `Authorization: Bearer $CRON_SECRET`, constant-time compare → 401 |
| `POST /api/revalidate` | `x-revalidate-secret`, constant-time compare → 401 |
| `POST /api/stripe/webhook` | Stripe signature verification → 401/400 |
| `GET /api/health` | none (liveness) |

### F7 — two capability flags move a link without moving the route

Neither is a continuity failure, but both leave the nav and the route tree disagreeing:

- **`sessionsLive === false`** — `Navbar.tsx:44` filters `/sessions` out of the top row, but
  `Footer.tsx:23` still lists it unconditionally and `/sessions` + `/sessions/[slug]` still
  render. The footer link is the reason the route keeps an explicit destination.
- **`bookingLive === false`** — `Footer.tsx:26` drops the whole Travellers column
  (`/trips`, `/trips#saved`), but `Navbar.tsx:59` still shows the "My trips" CTA for
  `role === "traveler"` and `/trips` still renders.

### F8 — one orphaned helper (not a route)

`app/[locale]/_routeHost.tsx` exports `renderComingSoonPage`, which nothing imports; only
`generateStaticParams` and the `RouteHostProps` type are still consumed (by
`/creators/apply`). Recorded here because it is the last trace of the coming-soon route
hosts; it is not a route and is out of scope for this document.

---

## 10. Exit-gate statement

Plan §6: *"all retained navigation has an explicit destination."*

**Read strictly — no nav link points at a missing route.** Every `href` traced in §3–§8
resolves to a real page or a redirect whose target is a real page. The one link that resolves
indirectly (`/feed`, F3) still lands on a real page.

**Read as the plan intends it — every retained route is reachable — one gap remains:**

| | Route | Status |
|---|---|---|
| 1 | `/[locale]/merchants/dashboard/offers` | fixed, slice S4 |
| 2 | `/[locale]/merchants/dashboard/redeem` | fixed, slice S4 |
| 3 | `/[locale]/admin/missions/[missionId]` | **open — F1** |

Plus **F2**: `/[locale]/auth/sign-out` is reachable only from the last step of the creator
onboarding wizard — so traveler, merchant and ops have no in-product sign-out at all, and a
creator has one only while standing on that step.

Everything else that is unlinked is unlinked on purpose and is named as such: four 308
aliases (F4), and six external or programmatic hand-offs — `auth/callback`,
`auth/reset-password`, `experiences/[slug]/booked`, `offers/[claimId]`, `ops/accept-invite`,
`merchants/apply`.

`STATUS.md` should move this exit-gate row from *"Improved, not audited"* to **"Audited; two
of three known dark routes fixed, F1 and F2 open."**
