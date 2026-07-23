# Phase R7.6 — Navigation, Header CTAs, and Footer Design

**Date:** 2026-07-23
**Sub-phase:** R7.6 — Navigation, header CTAs, footer
**Source of truth:** `kinnso-phase-r7-ux-hardening-spec.md` R7.6, `docs/r7-ground-truth.md`, and the program-wide §7 conventions
**Depends on:** R7.2 product-state flags and the R7.3 production-honesty conventions

## 1. Goal

Make the global chrome reflect KINNSO's traveller-first marketplace positioning, give anonymous visitors neutral account entry points, make public merchant-acquisition CTAs converge on one auth-aware route, and remove the pre-pivot footer message from all seven locales.

R7.0 confirmed that `/{locale}/sign-up` exists and creates a traveller-default account when no creator identity is established. R7.6 therefore replaces the anonymous header's creator-specific application CTA with neutral `Sign up` copy while leaving creator applications on `/for-creators` and `/creators`.

## 2. Scope

R7.6 changes:

1. Anonymous desktop and mobile header navigation.
2. Role-aware audience links in the header.
3. Public merchant landing and footer "Post a mission" destinations.
4. The existing `/{locale}/merchants/post` redirect route.
5. Footer positioning copy and its `BOOKING_LIVE`-gated Travellers column.
6. The saved-content anchor on the existing traveller trips page.
7. All seven locale dictionaries and focused unit, host, parity, and browser tests.

R7.6 does not:

- change creator, merchant, traveller, or pending-creator dashboard authorization;
- reroute authenticated dashboard-internal mission links;
- add a standalone Saved route;
- change `BOOKING_LIVE`, `SESSIONS_LIVE`, or `AGENT_LIVE` defaults;
- add or apply a database migration;
- modify production data;
- redesign the header or footer beyond the approved information-architecture changes.

## 3. Approaches considered

### 3.1 Auth-aware server redirect at `/merchants/post` — selected

The localized page validates the locale, constructs the existing request-bound Supabase server client, calls `auth.getUser()`, and uses `resolveViewerRole()` for authenticated users. Merchants are redirected to the mission composer; every other state is redirected to merchant application.

This is selected because it produces no client-side flicker, reuses the established role resolver, and makes the public acquisition route the single decision point.

### 3.2 Middleware redirect — rejected

Middleware could make the routing decision before the page executes, but it would expand middleware's authentication and database responsibilities for one route. It would also duplicate role-resolution behavior already available to server pages.

### 3.3 Client redirect through `useViewerRole()` — rejected

This would reuse the header's client role state, but visitors would render an intermediate screen while the role resolves. The behavior would be less deterministic for crawlers and harder to verify than a server redirect.

## 4. Header design

`apps/web/components/kinnso/Navbar.tsx` remains the sole rendered navigation component and continues receiving the `ViewerRole` from `useViewerRole()` through `SiteChrome`.

### 4.1 Audience links

The current single `For Merchants` audience link becomes a symmetric audience-link group:

| Viewer role | For Creators | For Merchants |
| --- | --- | --- |
| `anon` | visible | visible |
| `traveler` | visible | visible |
| `creator` | hidden | visible |
| `creator-pending` | hidden | visible |
| `merchant` | visible | hidden |

`For Creators` links to `/{locale}/for-creators`. `For Merchants` continues to link to `/{locale}/for-merchants`. Desktop and mobile menus use the same visibility decisions.

The existing Explore, Destinations, Articles, Sessions, Agent, Creators, and Merchants directory anchors remain unchanged. Sessions remains gated by `sessionsLive`.

### 4.2 Account and role CTAs

| Viewer role | Secondary account action | Primary CTA |
| --- | --- | --- |
| `anon` | `Sign in` → `/{locale}/sign-in` | `Sign up` → `/{locale}/sign-up` |
| `traveler` | none | existing `My Trips` → `/{locale}/trips` |
| `creator` | none | existing `Open Studio` → `/{locale}/studio` |
| `creator-pending` | none | existing pending CTA → `/{locale}/creators/apply` |
| `merchant` | none | existing `Post a Mission` → `/{locale}/merchants/dashboard/post` |

The anonymous primary key is renamed from creator-specific `ctaApply` semantics to neutral `signUp` semantics in every locale dictionary. Creator-application copy remains available on creator acquisition pages.

## 5. Public mission routing

### 5.1 Entry points

The following public acquisition links use `/{locale}/merchants/post`:

- the primary hero CTA in `ForMerchantsView`;
- the closing CTA in `ForMerchantsView`;
- the footer's `Post a mission` link.

Authenticated merchant header and dashboard-internal links continue to use `/{locale}/merchants/dashboard/post` directly. This preserves efficient navigation for users whose merchant role is already known and keeps the R7.6 change limited to public acquisition entry points.

### 5.2 Redirect algorithm

`apps/web/app/[locale]/merchants/post/page.tsx` changes from an unconditional permanent redirect to a request-dependent server redirect:

1. Await `params`.
2. Validate the locale with `isLocale`; invalid locales call `notFound()`.
3. Create the existing Supabase server client.
4. Call `supabase.auth.getUser()`.
5. If no verified user exists, call `redirect('/{locale}/merchants/apply')`.
6. Resolve the authenticated role with `resolveViewerRole(supabase)`.
7. If the role is `merchant`, call `redirect('/{locale}/merchants/dashboard/post')`.
8. For `traveler`, `creator`, `creator-pending`, or `anon`, call `redirect('/{locale}/merchants/apply')`.

`redirect()` is required instead of `permanentRedirect()` because the destination varies by request authentication state. Authentication or role-query errors are not converted into a merchant redirect; existing server errors remain visible to monitoring instead of granting an optimistic role.

## 6. Footer design

### 6.1 Marketplace tagline

The English footer tagline is exactly:

> The AI travel creator marketplace · Hong Kong · Taipei · Tokyo

Equivalent native-language marketplace wording replaces the pre-pivot studio/payments line in `en`, `zh-hk`, `zh-tw`, `zh-cn`, `ja`, `ko`, and `th`. The literal English string `AI Travel Content Studio` must not remain anywhere under `apps/web`, and the seven localized pre-pivot variants are removed from their footer dictionaries.

### 6.2 Product-state propagation

`LocaleLayout` already retrieves the complete product state. It passes both `sessionsLive` and `bookingLive` to `SiteChrome`. `SiteChrome` continues passing `sessionsLive` to `Navbar` and newly passes `bookingLive` to `Footer`.

No client-side environment variable is introduced. The footer receives a serializable boolean derived from the existing server-side product-state source.

### 6.3 Travellers column

When `bookingLive` is false, the Travellers column is absent. When it is true, the footer includes:

- `Trips` → `/{locale}/trips`
- `Saved` → `/{locale}/trips#saved`

There is no standalone Saved route in the repository. `TravelerTripsView` already renders saved guides and saved experiences, so its first saved-content section receives `id="saved"`. This makes the Saved link meaningful without inventing a new route.

The footer grid adapts between the brand plus four columns and the brand plus five columns. Mobile remains a single column; wider layouts use a responsive three-column intermediate layout and a five- or six-column desktop layout so the new column does not compress existing content.

All footer labels are added to the existing `footer` message group in all seven locales; no new dictionary group is required.

## 7. Component and file boundaries

- `apps/web/components/kinnso/Navbar.tsx`
  - owns audience-link visibility and anonymous CTA presentation;
  - continues consuming `ViewerRole`, `sessionsLive`, and localized navigation messages.
- `apps/web/app/[locale]/merchants/post/page.tsx`
  - owns the public mission-entry routing decision;
  - consumes `createSupabaseServerClient`, `resolveViewerRole`, `isLocale`, `notFound`, and `redirect`.
- `apps/web/components/kinnso/pages/ForMerchantsView.tsx`
  - points both public conversion CTAs to `/merchants/post`.
- `apps/web/app/[locale]/layout.tsx`
  - passes `productState.bookingLive` into the site chrome.
- `apps/web/components/kinnso/SiteChrome.tsx`
  - passes `bookingLive` to the footer without resolving product state or viewer role again.
- `apps/web/components/kinnso/Footer.tsx`
  - owns the gated Travellers column and responsive footer grid;
  - points the public mission CTA to `/merchants/post`.
- `apps/web/components/kinnso/pages/TravelerTripsView.tsx`
  - exposes the existing saved-content region through `id="saved"`.
- `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
  - provide neutral sign-up, For Creators, marketplace tagline, and Travellers-column copy.

No new runtime module or dependency is needed.

## 8. Error handling and accessibility

- Invalid locale parameters continue to resolve through `notFound()`.
- The public mission route trusts only `auth.getUser()`, never `getSession()`.
- Role-resolution failures throw rather than defaulting a user into a merchant-only destination.
- Desktop and mobile audience links have equivalent labels and destinations.
- Existing active-link `aria-current`, focus-visible styles, mobile menu semantics, and skip link remain intact.
- The `#saved` fragment targets a real element in the trips page.
- Footer column headings retain semantic heading and list markup.

## 9. Testing strategy

Implementation follows test-driven development.

### 9.1 Header tests

Extend `apps/web/tests/kinnso.Navbar.test.tsx` to verify:

- anonymous desktop and mobile menus contain `For Creators`, `For Merchants`, `Sign in`, and `Sign up`;
- anonymous `Sign up` points to `/{locale}/sign-up`;
- creator and pending-creator roles hide `For Creators` but retain `For Merchants`;
- merchant hides `For Merchants`, shows `For Creators`, and retains the direct dashboard mission CTA;
- traveller shows both audience links and retains My Trips;
- session visibility remains governed only by `sessionsLive`.

### 9.2 Mission-entry tests

Add or extend host tests for `apps/web/app/[locale]/merchants/post/page.tsx`:

- invalid locale calls `notFound()`;
- anonymous user redirects to `/{locale}/merchants/apply`;
- merchant redirects to `/{locale}/merchants/dashboard/post`;
- traveller, creator, and pending creator redirect to `/{locale}/merchants/apply`;
- `resolveViewerRole` is not called for an anonymous user.

Extend `apps/web/tests/for-merchants.host.test.tsx` and `apps/web/tests/kinnso.Footer.test.tsx` so all three public Post a mission links point to `/{locale}/merchants/post`.

### 9.3 Footer and layout tests

Extend footer, SiteChrome, and layout tests to verify:

- `bookingLive=false` omits the Travellers column;
- `bookingLive=true` renders Trips and Saved with the exact localized paths;
- the Saved target exists in `TravelerTripsView`;
- `LocaleLayout` passes `productState.bookingLive` through `SiteChrome`;
- the new English tagline renders.

### 9.4 Locale and honesty guards

- Run the existing locale parity test after updating all seven dictionaries.
- Add a source guard proving `AI Travel Content Studio` is absent from `apps/web`.
- Verify every locale footer contains its replacement marketplace tagline and new labels.

### 9.5 End-to-end and build checks

Browser coverage verifies:

- an anonymous visitor sees the neutral header CTA;
- an anonymous merchant-landing CTA reaches `/merchants/apply` through `/merchants/post`;
- direct merchant/dashboard mission paths remain protected by existing authorization.

Before merge, run focused tests, full web typecheck, lint, relevant e2e, and the Vercel preview build. Existing baseline warnings are reported separately from new errors.

## 10. Acceptance mapping

| R7.6 acceptance requirement | Design coverage |
| --- | --- |
| `AI Travel Content Studio` appears nowhere in app or locale files | Seven tagline replacements plus source guard |
| Both public Post a mission entry points resolve to the same behavior | Landing hero, landing closing CTA, and footer all use `/merchants/post`; auth-aware route owns behavior |
| Header reflects traveller-first positioning | Anonymous Sign in + neutral Sign up, confirmed traveller-default route, symmetric audience links |
| Travellers footer column gated on `BOOKING_LIVE` | Server product-state boolean passed through layout/chrome; entire column conditionally rendered |
| Logged-in roles keep the `useViewerRole` pattern | Existing role source and role-specific CTAs remain intact |

## 11. Delivery

- Branch: `codex/r7-6-navigation-footer`
- Conventional commits with scoped messages.
- One squash-merged pull request titled `Phase R7.6 — Navigation, header CTAs, footer`.
- No Supabase migration or production-data approval is required.
