# Phase R7.6 Navigation, Header CTAs, and Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KINNSO's global chrome traveller-first, converge public merchant mission CTAs on an auth-aware route, and replace the pre-pivot footer with localized marketplace positioning and a `BOOKING_LIVE`-gated Travellers column.

**Architecture:** Keep viewer-role decisions at the existing boundaries: `useViewerRole()` drives client header presentation, while the request-bound `/merchants/post` page uses `auth.getUser()` and `resolveViewerRole()` for its redirect. Reuse the R7.2 server product state by passing `bookingLive` through `LocaleLayout` and `SiteChrome` into `Footer`; no new state source, route family, dependency, or database object is introduced.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase SSR auth, Vitest + Testing Library, Playwright, pnpm workspace, Vercel.

## Global Constraints

- The authoritative requirements are `kinnso-phase-r7-ux-hardening-spec.md` R7.6, `docs/r7-ground-truth.md`, `docs/superpowers/specs/2026-07-23-phase-r7-6-navigation-footer-design.md`, and program §7.
- Every visible string added here must exist in all seven locale files: `en`, `zh-hk`, `zh-tw`, `zh-cn`, `ja`, `ko`, and `th`.
- Anonymous header actions are exactly neutral `Sign in` and `Sign up` semantics; creator application remains on creator acquisition pages.
- Public merchant acquisition links use `/{locale}/merchants/post`; authenticated merchant header and dashboard-internal shortcuts remain direct to `/{locale}/merchants/dashboard/post`.
- `/merchants/post` trusts `auth.getUser()` and the existing `resolveViewerRole()`; it must not use `getSession()`.
- The Travellers footer column is absent unless `bookingLive === true`.
- Do not add a standalone Saved route; Saved points to the real `/{locale}/trips#saved` section.
- Do not change `AGENT_LIVE`, `BOOKING_LIVE`, or `SESSIONS_LIVE` defaults.
- Do not add or apply a Supabase migration and do not modify production data.
- Preserve current active-link, keyboard-focus, mobile-menu, skip-link, and role-specific dashboard behavior.
- Use Conventional Commits with scope and one squash-merged PR titled `Phase R7.6 — Navigation, header CTAs, footer`.

---

## File Structure

### Runtime files

- Modify `apps/web/components/kinnso/Navbar.tsx`
  - Owns audience-link visibility and anonymous header CTA labels.
- Modify `apps/web/app/[locale]/merchants/post/page.tsx`
  - Owns the request-dependent public merchant-entry redirect.
- Modify `apps/web/components/kinnso/pages/ForMerchantsView.tsx`
  - Sends both public landing CTAs through `/merchants/post`.
- Modify `apps/web/app/[locale]/layout.tsx`
  - Passes the existing `productState.bookingLive` value into `SiteChrome`.
- Modify `apps/web/components/kinnso/SiteChrome.tsx`
  - Carries `bookingLive` to `Footer` without resolving state again.
- Modify `apps/web/components/kinnso/Footer.tsx`
  - Owns the localized marketplace tagline, public merchant route, conditional Travellers column, and responsive grid.
- Modify `apps/web/components/kinnso/pages/TravelerTripsView.tsx`
  - Adds the real `saved` fragment target to the existing saved-content section.
- Modify `apps/web/lib/i18n/messages/en.ts`
  - Updates `Messages` types and English navigation/footer copy.
- Modify `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
  - Adds the same keys with native-language copy.

### Test files

- Modify `apps/web/tests/kinnso.Navbar.test.tsx`
- Modify `apps/web/tests/merchants.dashboard-redirects.test.tsx`
- Modify `apps/web/tests/for-merchants.host.test.tsx`
- Modify `apps/web/tests/kinnso.Footer.test.tsx`
- Modify `apps/web/tests/kinnso.SiteChrome.test.tsx`
- Modify `apps/web/tests/layout.siteChrome.test.tsx`
- Modify `apps/web/tests/trips.host.test.tsx`
- Create `apps/web/tests/r7-6-navigation-footer.test.ts`
- Modify `apps/e2e/specs/funnel-smoke.spec.ts`

### Documentation

- Existing approved design: `docs/superpowers/specs/2026-07-23-phase-r7-6-navigation-footer-design.md`
- This implementation plan: `docs/superpowers/plans/2026-07-23-phase-r7-6-navigation-footer.md`

---

### Task 1: Make the header traveller-first and role-symmetric

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/components/kinnso/Navbar.tsx`
- Modify: `apps/web/tests/kinnso.Navbar.test.tsx`
- Modify: `apps/web/tests/kinnso.SiteChrome.test.tsx`
- Modify: `apps/web/tests/layout.siteChrome.test.tsx`

**Interfaces:**
- Consumes: `ViewerRole = 'anon' | 'traveler' | 'creator' | 'creator-pending' | 'merchant'`, `sessionsLive: boolean`, `Messages['nav']`.
- Produces: `Messages['nav'].linkForCreators: string`, `Messages['nav'].signUp: string`, and the approved audience-link visibility matrix.

- [ ] **Step 1: Write failing anonymous and role-matrix tests**

Replace the old anonymous Apply assertion and expand the audience-link coverage in `apps/web/tests/kinnso.Navbar.test.tsx`:

```tsx
it('shows traveller-first audience and account links for anonymous viewers on desktop and mobile', () => {
  render(<Navbar locale="en" role="anon" sessionsLive t={en.nav} />)

  expect(screen.getByRole('link', { name: en.nav.linkForCreators }).getAttribute('href'))
    .toBe('/en/for-creators')
  expect(screen.getByRole('link', { name: en.nav.linkForMerchants }).getAttribute('href'))
    .toBe('/en/for-merchants')
  expect(screen.getByRole('link', { name: en.nav.signIn }).getAttribute('href'))
    .toBe('/en/sign-in')
  expect(screen.getByRole('link', { name: en.nav.signUp }).getAttribute('href'))
    .toBe('/en/sign-up')

  fireEvent.click(screen.getByRole('button', { name: en.nav.menuToggle }))
  expect(screen.getAllByRole('link', { name: en.nav.linkForCreators })).toHaveLength(2)
  expect(screen.getAllByRole('link', { name: en.nav.linkForMerchants })).toHaveLength(2)
  expect(screen.getAllByRole('link', { name: en.nav.signIn })).toHaveLength(2)
  expect(screen.getAllByRole('link', { name: en.nav.signUp })).toHaveLength(2)
})

it.each([
  ['creator', false, true],
  ['creator-pending', false, true],
  ['merchant', true, false],
  ['traveler', true, true],
] as const)(
  '%s audience links: For Creators=%s, For Merchants=%s',
  (role, creatorsVisible, merchantsVisible) => {
    render(<Navbar locale="en" role={role} sessionsLive t={en.nav} />)
    expect(Boolean(screen.queryByRole('link', { name: en.nav.linkForCreators })))
      .toBe(creatorsVisible)
    expect(Boolean(screen.queryByRole('link', { name: en.nav.linkForMerchants })))
      .toBe(merchantsVisible)
  },
)
```

Update chrome assertions from `en.nav.ctaApply` to `en.nav.signUp` in:

```tsx
// apps/web/tests/kinnso.SiteChrome.test.tsx
expect(screen.getByRole('link', { name: en.nav.signUp })).toBeTruthy()

// apps/web/tests/layout.siteChrome.test.tsx
expect(screen.getByRole('link', { name: en.nav.signUp })).toBeTruthy()
```

- [ ] **Step 2: Run the focused tests and verify the intended RED state**

Run:

```powershell
cd apps/web
pnpm exec vitest run tests/kinnso.Navbar.test.tsx tests/kinnso.SiteChrome.test.tsx tests/layout.siteChrome.test.tsx
```

Expected: TypeScript/runtime assertions fail because `linkForCreators` and `signUp` do not exist and the anonymous CTA still uses creator-application copy.

- [ ] **Step 3: Update the navigation message contract and all seven dictionaries**

Change the `Messages['nav']` declaration in `apps/web/lib/i18n/messages/en.ts` to:

```ts
nav: {
  linkCreators: string; linkAgent: string; linkMerchants: string
  linkArticles: string; linkFindCreators: string; linkMissions: string
  linkInsights: string
  linkExplore: string; linkDestinations: string; linkSessions: string
  linkForCreators: string; linkForMerchants: string
  signUp: string; ctaOpenStudio: string; ctaPending: string
  ctaPostMission: string; ctaMyTrips: string
  signIn: string; language: string; menuToggle: string; skipToContent: string
  merchantMenuLabel: string
}
```

Remove the unused `ctaApply` key and add these exact values to each locale's `nav` object:

```ts
// en
linkForCreators: 'For Creators',
signUp: 'Sign up',

// zh-hk
linkForCreators: '創作者專區',
signUp: '註冊',

// zh-tw
linkForCreators: '創作者專區',
signUp: '註冊',

// zh-cn
linkForCreators: '创作者专区',
signUp: '注册',

// ja
linkForCreators: 'クリエイターの方へ',
signUp: '新規登録',

// ko
linkForCreators: '크리에이터 안내',
signUp: '회원가입',

// th
linkForCreators: 'สำหรับครีเอเตอร์',
signUp: 'สมัครสมาชิก',
```

- [ ] **Step 4: Implement the shared audience-link list and neutral CTA**

In `apps/web/components/kinnso/Navbar.tsx`, replace the anonymous CTA and one-off For Merchants logic with:

```tsx
const cta = (() => {
  if (role === 'creator') {
    return { label: t.ctaOpenStudio, to: '/studio', className: 'k2-btn-primary' }
  }
  if (role === 'creator-pending') {
    return {
      label: t.ctaPending,
      to: '/creators/apply',
      className: 'inline-flex min-h-[44px] items-center rounded-[3px] bg-kinnso-cream2 px-4 py-2 text-sm font-semibold text-kinnso-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange',
    }
  }
  if (role === 'merchant') {
    return { label: t.ctaPostMission, to: '/merchants/dashboard/post', className: 'k2-btn-primary' }
  }
  if (role === 'traveler') {
    return { label: t.ctaMyTrips, to: '/trips', className: 'k2-btn-primary' }
  }
  return { label: t.signUp, to: '/sign-up', className: 'k2-btn-primary' }
})()

const audienceAnchors = [
  ...(
    role === 'creator' || role === 'creator-pending'
      ? []
      : [{ to: '/for-creators', label: t.linkForCreators }]
  ),
  ...(role === 'merchant' ? [] : [{ to: '/for-merchants', label: t.linkForMerchants }]),
]
```

Render `audienceAnchors` in the existing desktop action area:

```tsx
{audienceAnchors.map((anchor) => {
  const href = p(anchor.to)
  return (
    <Link
      key={anchor.to}
      href={href}
      aria-current={isActive(href) ? 'page' : undefined}
      className={`whitespace-nowrap px-2 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange ${
        isActive(href)
          ? 'text-kinnso-orangeDark underline underline-offset-8 decoration-2 decoration-kinnso-orangeDark'
          : 'text-kinnso-ink/75 hover:text-kinnso-ink'
      }`}
    >
      {anchor.label}
    </Link>
  )
})}
```

Render the same list in the mobile navigation:

```tsx
{audienceAnchors.map((anchor) => (
  <Link
    key={anchor.to}
    href={p(anchor.to)}
    onClick={() => setOpen(false)}
    className="whitespace-nowrap px-3 py-2 text-sm font-medium text-kinnso-ink/75 transition hover:text-kinnso-orangeDark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
  >
    {anchor.label}
  </Link>
))}
```

Remove `forMerchantsHref` and both one-off `role !== "merchant"` blocks. Update the component comment so it describes both audience links and neutral anonymous sign-up.

- [ ] **Step 5: Run the header and chrome tests**

Run:

```powershell
cd apps/web
pnpm exec vitest run tests/kinnso.Navbar.test.tsx tests/kinnso.SiteChrome.test.tsx tests/layout.siteChrome.test.tsx
```

Expected: all selected tests pass; Sessions gating and existing role CTAs remain green.

- [ ] **Step 6: Commit the header unit**

```powershell
git add apps/web/components/kinnso/Navbar.tsx `
  apps/web/lib/i18n/messages/en.ts `
  apps/web/lib/i18n/messages/zh-hk.ts `
  apps/web/lib/i18n/messages/zh-tw.ts `
  apps/web/lib/i18n/messages/zh-cn.ts `
  apps/web/lib/i18n/messages/ja.ts `
  apps/web/lib/i18n/messages/ko.ts `
  apps/web/lib/i18n/messages/th.ts `
  apps/web/tests/kinnso.Navbar.test.tsx `
  apps/web/tests/kinnso.SiteChrome.test.tsx `
  apps/web/tests/layout.siteChrome.test.tsx
git commit -m "feat(web): make global header traveller-first"
```

---

### Task 2: Make `/merchants/post` the auth-aware public mission entry

**Files:**
- Modify: `apps/web/app/[locale]/merchants/post/page.tsx`
- Modify: `apps/web/components/kinnso/pages/ForMerchantsView.tsx`
- Modify: `apps/web/tests/merchants.dashboard-redirects.test.tsx`
- Modify: `apps/web/tests/for-merchants.host.test.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient(): Promise<SupabaseServerClient>`, `resolveViewerRole(supabase): Promise<ViewerRole>`, and localized `params`.
- Produces: request-dependent redirects from `/{locale}/merchants/post`.

- [ ] **Step 1: Replace the post-route regression with auth-state tests**

In `apps/web/tests/merchants.dashboard-redirects.test.tsx`, hoist auth and role mocks:

```tsx
const { authMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolveViewerRoleMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
  permanentRedirect: (url: string) => { throw new Error(`permanentRedirect:${url}`) },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: authMock } }),
}))

vi.mock('@/lib/auth/viewer-role', () => ({
  resolveViewerRole: resolveViewerRoleMock,
}))
```

Replace the old unconditional `post` test with:

```tsx
describe('public merchant post entry', () => {
  it('sends anonymous visitors to merchant application without resolving a role', async () => {
    authMock.mockResolvedValue({ data: { user: null } })

    await expect(PostStub({ params: params() })).rejects.toThrow(
      'redirect:/en/merchants/apply',
    )
    expect(resolveViewerRoleMock).not.toHaveBeenCalled()
  })

  it('sends merchants directly to the dashboard composer', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('merchant')

    await expect(PostStub({ params: params() })).rejects.toThrow(
      'redirect:/en/merchants/dashboard/post',
    )
  })

  it.each(['traveler', 'creator', 'creator-pending'] as const)(
    'sends authenticated %s viewers to merchant application',
    async (role) => {
      authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
      resolveViewerRoleMock.mockResolvedValue(role)

      await expect(PostStub({ params: params() })).rejects.toThrow(
        'redirect:/en/merchants/apply',
      )
    },
  )

  it('invalid locale is notFound before auth lookup', async () => {
    await expect(
      PostStub({ params: Promise.resolve({ locale: 'xx' }) }),
    ).rejects.toThrow('notFound')
    expect(authMock).not.toHaveBeenCalled()
  })
})
```

Add `beforeEach` to the Vitest import and reset mocks before each case:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.clearAllMocks()
})
```

Keep Missions, Mission Detail, Creators, and Insights legacy `permanentRedirect` tests unchanged.

Update the merchant landing assertion:

```tsx
it('routes both public mission CTAs through the auth-aware merchant entry', () => {
  render(
    <ForMerchantsView
      locale="en"
      t={en.forMerchants}
      testimonials={[]}
      bookingLive={false}
    />,
  )
  const missionLinks = screen.getAllByRole('link', {
    name: en.forMerchants.heroCtaPrimary,
  })
  expect(missionLinks).toHaveLength(2)
  expect(
    missionLinks.every((link) => link.getAttribute('href') === '/en/merchants/post'),
  ).toBe(true)
})
```

- [ ] **Step 2: Run focused route and landing tests to verify RED**

Run:

```powershell
cd apps/web
pnpm exec vitest run tests/merchants.dashboard-redirects.test.tsx tests/for-merchants.host.test.tsx
```

Expected: failures show the route still calls `permanentRedirect('/en/merchants/dashboard/post')` and both landing CTAs still target `/en/merchants/apply`.

- [ ] **Step 3: Implement the request-dependent server redirect**

Replace `apps/web/app/[locale]/merchants/post/page.tsx` with:

```tsx
import { notFound, redirect } from 'next/navigation'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function MerchantPostEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/merchants/apply`)

  const role = await resolveViewerRole(supabase)
  if (role === 'merchant') {
    redirect(`/${locale}/merchants/dashboard/post`)
  }

  redirect(`/${locale}/merchants/apply`)
}
```

Do not catch auth or role-query errors and do not use `permanentRedirect()`.

- [ ] **Step 4: Converge both landing CTAs**

In `apps/web/components/kinnso/pages/ForMerchantsView.tsx`, change both primary CTA destinations:

```tsx
<Link href={p('/merchants/post')} className="k2-btn-primary">
  {t.heroCtaPrimary}
</Link>
```

and:

```tsx
<Link
  href={p('/merchants/post')}
  className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-ink px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
>
  {t.ctaButton}
</Link>
```

- [ ] **Step 5: Run route and landing tests**

Run:

```powershell
cd apps/web
pnpm exec vitest run tests/merchants.dashboard-redirects.test.tsx tests/for-merchants.host.test.tsx
```

Expected: all cases pass, including the unchanged legacy-route cases.

- [ ] **Step 6: Commit the public merchant-entry unit**

```powershell
git add "apps/web/app/[locale]/merchants/post/page.tsx" `
  apps/web/components/kinnso/pages/ForMerchantsView.tsx `
  apps/web/tests/merchants.dashboard-redirects.test.tsx `
  apps/web/tests/for-merchants.host.test.tsx
git commit -m "feat(web): unify public merchant mission entry"
```

---

### Task 3: Add marketplace footer positioning and the booking-gated Travellers column

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/app/[locale]/layout.tsx`
- Modify: `apps/web/components/kinnso/SiteChrome.tsx`
- Modify: `apps/web/components/kinnso/Footer.tsx`
- Modify: `apps/web/components/kinnso/pages/TravelerTripsView.tsx`
- Modify: `apps/web/tests/kinnso.Footer.test.tsx`
- Modify: `apps/web/tests/kinnso.SiteChrome.test.tsx`
- Modify: `apps/web/tests/layout.siteChrome.test.tsx`
- Modify: `apps/web/tests/trips.host.test.tsx`

**Interfaces:**
- Consumes: `productState.bookingLive: boolean` from R7.2.
- Produces: `SiteChrome.bookingLive: boolean`, `Footer.bookingLive: boolean`, localized `colTravellers`, `lTrips`, and `lSaved`, plus the real `#saved` fragment target.

- [ ] **Step 1: Write failing footer-gate and saved-anchor tests**

Update every existing direct `Footer` render to pass `bookingLive={false}` and import the Japanese dictionary:

```tsx
import ja from '@/lib/i18n/messages/ja'
```

Then add:

```tsx
it('routes public Post a mission through the auth-aware entry', () => {
  render(<Footer locale="en" bookingLive={false} t={en.footer} />)
  expect(
    screen.getByRole('link', { name: en.footer.lPostMission }).getAttribute('href'),
  ).toBe('/en/merchants/post')
})

it('omits traveller links while booking is not live', () => {
  render(<Footer locale="en" bookingLive={false} t={en.footer} />)
  expect(screen.queryByText(en.footer.colTravellers)).toBeNull()
  expect(screen.queryByRole('link', { name: en.footer.lTrips })).toBeNull()
  expect(screen.queryByRole('link', { name: en.footer.lSaved })).toBeNull()
})

it('renders localized Trips and Saved links only while booking is live', () => {
  render(<Footer locale="ja" bookingLive t={ja.footer} />)
  expect(screen.getByText(ja.footer.colTravellers)).toBeTruthy()
  expect(screen.getByRole('link', { name: ja.footer.lTrips }).getAttribute('href'))
    .toBe('/ja/trips')
  expect(screen.getByRole('link', { name: ja.footer.lSaved }).getAttribute('href'))
    .toBe('/ja/trips#saved')
})
```

Change the `renderAt` helper in `apps/web/tests/kinnso.SiteChrome.test.tsx`:

```tsx
function renderAt(path: string, sessionsLive = true, bookingLive = false) {
  pathname.value = path
  return render(
    <SiteChrome
      locale="en"
      sessionsLive={sessionsLive}
      bookingLive={bookingLive}
      nav={en.nav}
      footer={en.footer}
    >
      <div>PAGE_BODY</div>
    </SiteChrome>,
  )
}
```

Also pass `bookingLive={false}` to the direct localized `SiteChrome` render:

```tsx
<SiteChrome
  locale="zh-hk"
  sessionsLive
  bookingLive={false}
  nav={zhHk.nav}
  footer={zhHk.footer}
>
  <div>PAGE_BODY</div>
</SiteChrome>
```

Add:

```tsx
it('passes the Booking gate through to the footer', () => {
  renderAt('/en/articles', true, true)
  expect(screen.getByRole('link', { name: en.footer.lTrips })).toBeTruthy()
  expect(screen.getByRole('link', { name: en.footer.lSaved })).toBeTruthy()
})
```

In `apps/web/tests/layout.siteChrome.test.tsx`, change the product-state mock to a hoisted mutable object:

```tsx
const { productState } = vi.hoisted(() => ({
  productState: {
    agentLive: true,
    bookingLive: false,
    sessionsLive: false,
  },
}))

vi.mock('@/lib/product-state', () => ({
  getProductState: async () => productState,
}))
```

Replace the existing cleanup-only hook with a hook that also resets the mutable gate:

```tsx
afterEach(() => {
  cleanup()
  productState.bookingLive = false
})
```

Add:

```tsx
it('passes bookingLive from product state to the footer', async () => {
  productState.bookingLive = true
  const ui = await LocaleLayout({
    children: <div>BODY</div>,
    params: Promise.resolve({ locale: 'en' }),
  })
  render(<>{ui.props.children.props.children}</>)
  expect(screen.getByRole('link', { name: en.footer.lTrips })).toBeTruthy()
  expect(screen.getByRole('link', { name: en.footer.lSaved })).toBeTruthy()
})
```

In `apps/web/tests/trips.host.test.tsx`, add:

```tsx
it('exposes a stable fragment target for saved traveller content', () => {
  render(
    <TravelerTripsView
      locale="en"
      t={t}
      reviewsT={reviewsT}
      savesLabel="saves"
      bookings={[]}
      savedGuides={[]}
      savedExperiences={[]}
    />,
  )
  expect(document.getElementById('saved')).toBeTruthy()
})
```

- [ ] **Step 2: Run footer, layout, and trips tests to verify RED**

Run:

```powershell
cd apps/web
pnpm exec vitest run tests/kinnso.Footer.test.tsx tests/kinnso.SiteChrome.test.tsx tests/layout.siteChrome.test.tsx tests/trips.host.test.tsx
```

Expected: failures identify missing `bookingLive` props, missing footer keys, old mission destination, and absent `saved` fragment.

- [ ] **Step 3: Extend the footer message contract and update all seven taglines**

Change `Messages['footer']` in `apps/web/lib/i18n/messages/en.ts` to:

```ts
footer: {
  tagline: string
  colCreators: string; colMerchants: string; colCompany: string
  colExplore: string; colTravellers: string
  lGuides: string; lDestinations: string; lArticles: string; lSessions: string
  lTrips: string; lSaved: string
  lApply: string; lStudio: string; lMissions: string; lEarnings: string
  lPostMission: string; lPricing: string; lContact: string; lDirectory: string
  lAbout: string; lAgent: string; lLegal: string; rights: string
  lForCreators: string
}
```

Use these exact locale values:

```ts
// en
tagline: 'The AI travel creator marketplace · Hong Kong · Taipei · Tokyo',
colTravellers: 'Travellers',
lTrips: 'Trips',
lSaved: 'Saved',

// zh-hk
tagline: 'AI 旅遊創作者市集 · 香港 · 台北 · 東京',
colTravellers: '旅客',
lTrips: '行程',
lSaved: '已收藏',

// zh-tw
tagline: 'AI 旅遊創作者市集 · 香港 · 台北 · 東京',
colTravellers: '旅客',
lTrips: '行程',
lSaved: '已收藏',

// zh-cn
tagline: 'AI 旅行创作者平台 · 香港 · 台北 · 东京',
colTravellers: '旅客',
lTrips: '行程',
lSaved: '已收藏',

// ja
tagline: 'AI旅行クリエイターマーケットプレイス · 香港 · 台北 · 東京',
colTravellers: '旅行者',
lTrips: '旅行',
lSaved: '保存済み',

// ko
tagline: 'AI 여행 크리에이터 마켓플레이스 · 홍콩 · 타이베이 · 도쿄',
colTravellers: '여행자',
lTrips: '여행',
lSaved: '저장됨',

// th
tagline: 'มาร์เก็ตเพลสครีเอเตอร์ท่องเที่ยว AI · ฮ่องกง · ไทเป · โตเกียว',
colTravellers: 'นักท่องเที่ยว',
lTrips: 'ทริป',
lSaved: 'บันทึกไว้',
```

- [ ] **Step 4: Pass `bookingLive` through layout and chrome**

In `apps/web/app/[locale]/layout.tsx`:

```tsx
<SiteChrome
  locale={loc}
  sessionsLive={productState.sessionsLive}
  bookingLive={productState.bookingLive}
  nav={messages.nav}
  footer={messages.footer}
>
  {children}
</SiteChrome>
```

Update `SiteChrome`'s interface and footer call:

```tsx
export function SiteChrome({
  locale, sessionsLive, bookingLive, nav, footer, children,
}: {
  locale: Locale
  sessionsLive: boolean
  bookingLive: boolean
  nav: Messages['nav']
  footer: Messages['footer']
  children: React.ReactNode
}) {
  const pathname = usePathname() || `/${locale}`
  const role = useViewerRole()
  const bare = BARE_SUFFIXES.some(
    (suffix) => pathname === `/${locale}${suffix}`
      || pathname.startsWith(`/${locale}${suffix}/`),
  )

  if (bare) return <>{children}</>

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-kinnso-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-kinnso-cream focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-kinnso-orange"
      >
        {nav.skipToContent}
      </a>
      <Navbar
        locale={locale}
        role={role}
        sessionsLive={sessionsLive}
        t={nav}
      />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <Footer locale={locale} bookingLive={bookingLive} t={footer} />
    </>
  )
}
```

Preserve the existing bare-route early return and do not call `getProductState()` from the client component.

- [ ] **Step 5: Implement the conditional footer column and responsive grid**

Update `apps/web/components/kinnso/Footer.tsx`:

```tsx
const Footer = ({
  locale,
  bookingLive,
  t,
}: {
  locale: Locale
  bookingLive: boolean
  t: Messages['footer']
}) => {
  const p = (path: string) => `/${locale}${path}`
  const cols = [
    {
      title: t.colExplore,
      links: [
        [t.lGuides, '/explore'],
        [t.lDestinations, '/destinations'],
        [t.lArticles, '/articles'],
        [t.lSessions, '/sessions'],
      ] as const,
    },
    ...(bookingLive ? [{
      title: t.colTravellers,
      links: [
        [t.lTrips, '/trips'],
        [t.lSaved, '/trips#saved'],
      ] as const,
    }] : []),
    {
      title: t.colCreators,
      links: [
        [t.lForCreators, '/for-creators'],
        [t.lApply, '/sign-up'],
        [t.lStudio, '/studio'],
        [t.lMissions, '/studio/missions'],
        [t.lEarnings, '/studio/earnings'],
      ] as const,
    },
    {
      title: t.colMerchants,
      links: [
        [t.lDirectory, '/merchants'],
        [t.lPostMission, '/merchants/post'],
        [t.lPricing, '/for-merchants'],
      ] as const,
    },
    {
      title: t.colCompany,
      links: [
        [t.lAbout, '/about'],
        [t.lAgent, '/agent'],
        [t.lContact, '/contact'],
        [t.lLegal, '/legal/creator-terms'],
      ] as const,
    },
  ]

  return (
    <footer className="bg-kinnso-ink font-sans text-kinnso-cream">
      <div
        className={`k2-container grid gap-10 py-14 md:grid-cols-3 ${
          bookingLive ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
        }`}
      >
        <div>
          <span className="k2-display text-2xl font-semibold tracking-tight text-kinnso-cream">
            KINNSO
          </span>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-kinnso-cream/60">
            {t.tagline}
          </p>
        </div>
        {cols.map((column) => (
          <div key={column.title}>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-amber">
              {column.title}
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map(([label, href]) => (
                <li key={`${label}-${href}`}>
                  <Link
                    href={p(href)}
                    className="text-kinnso-cream/80 transition hover:text-kinnso-cream"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-kinnso-cream/15">
        <div className="k2-container flex items-center justify-center py-4 text-xs text-kinnso-cream/60 sm:justify-start">
          <span>{t.rights}</span>
        </div>
      </div>
    </footer>
  )
}
```

Retain the existing semantic headings, lists, links, tagline, and rights band.

- [ ] **Step 6: Add the real Saved fragment target**

In `apps/web/components/kinnso/pages/TravelerTripsView.tsx`, change the opening tag of the first saved-content wrapper from:

```tsx
<div className="mt-10 border-t border-kinnso-cream2 pt-6">
```

to:

```tsx
<div id="saved" className="mt-10 scroll-mt-24 border-t border-kinnso-cream2 pt-6">
```

The second saved-experiences section remains immediately after it and does not need another fragment.

- [ ] **Step 7: Run footer, layout, and trips tests**

Run:

```powershell
cd apps/web
pnpm exec vitest run tests/kinnso.Footer.test.tsx tests/kinnso.SiteChrome.test.tsx tests/layout.siteChrome.test.tsx tests/trips.host.test.tsx
```

Expected: all selected tests pass for both booking states.

- [ ] **Step 8: Commit the footer unit**

```powershell
git add "apps/web/app/[locale]/layout.tsx" `
  apps/web/components/kinnso/SiteChrome.tsx `
  apps/web/components/kinnso/Footer.tsx `
  apps/web/components/kinnso/pages/TravelerTripsView.tsx `
  apps/web/lib/i18n/messages/en.ts `
  apps/web/lib/i18n/messages/zh-hk.ts `
  apps/web/lib/i18n/messages/zh-tw.ts `
  apps/web/lib/i18n/messages/zh-cn.ts `
  apps/web/lib/i18n/messages/ja.ts `
  apps/web/lib/i18n/messages/ko.ts `
  apps/web/lib/i18n/messages/th.ts `
  apps/web/tests/kinnso.Footer.test.tsx `
  apps/web/tests/kinnso.SiteChrome.test.tsx `
  apps/web/tests/layout.siteChrome.test.tsx `
  apps/web/tests/trips.host.test.tsx
git commit -m "feat(web): align footer with marketplace state"
```

---

### Task 4: Lock R7.6 acceptance with source guards and browser coverage

**Files:**
- Create: `apps/web/tests/r7-6-navigation-footer.test.ts`
- Modify: `apps/e2e/specs/funnel-smoke.spec.ts`

**Interfaces:**
- Consumes: the seven exported locale dictionaries and rendered public navigation.
- Produces: a durable no-regression guard for the pre-pivot phrase and browser proof of the public acquisition redirect.

- [ ] **Step 1: Add the source and locale acceptance test**

Create `apps/web/tests/r7-6-navigation-footer.test.ts`:

```ts
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import ja from '@/lib/i18n/messages/ja'
import ko from '@/lib/i18n/messages/ko'
import th from '@/lib/i18n/messages/th'
import zhCn from '@/lib/i18n/messages/zh-cn'
import zhHk from '@/lib/i18n/messages/zh-hk'
import zhTw from '@/lib/i18n/messages/zh-tw'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('R7.6 navigation and footer acceptance', () => {
  it('removes the pre-pivot English product line from app source', () => {
    const forbidden = ['AI Travel', 'Content Studio'].join(' ')
    const webRoot = resolve(process.cwd())
    const source = ['app', 'components', 'lib']
      .flatMap((directory) => sourceFiles(join(webRoot, directory)))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    expect(source).not.toContain(forbidden)
  })

  it.each([
    ['en', en, 'The AI travel creator marketplace · Hong Kong · Taipei · Tokyo'],
    ['zh-hk', zhHk, 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-tw', zhTw, 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-cn', zhCn, 'AI 旅行创作者平台 · 香港 · 台北 · 东京'],
    ['ja', ja, 'AI旅行クリエイターマーケットプレイス · 香港 · 台北 · 東京'],
    ['ko', ko, 'AI 여행 크리에이터 마켓플레이스 · 홍콩 · 타이베이 · 도쿄'],
    ['th', th, 'มาร์เก็ตเพลสครีเอเตอร์ท่องเที่ยว AI · ฮ่องกง · ไทเป · โตเกียว'],
  ])('%s exposes complete R7.6 navigation/footer copy', (_locale, dictionary, tagline) => {
    expect(dictionary.nav.linkForCreators.length).toBeGreaterThan(0)
    expect(dictionary.nav.signUp.length).toBeGreaterThan(0)
    expect(dictionary.footer.tagline).toBe(tagline)
    expect(dictionary.footer.colTravellers.length).toBeGreaterThan(0)
    expect(dictionary.footer.lTrips.length).toBeGreaterThan(0)
    expect(dictionary.footer.lSaved.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the acceptance test**

Run:

```powershell
cd apps/web
pnpm exec vitest run tests/r7-6-navigation-footer.test.ts
```

Expected: pass after Tasks 1 and 3; if it fails, correct the exact locale or stale source before adding browser coverage.

- [ ] **Step 3: Extend the existing CI-covered funnel smoke spec**

Append to `apps/e2e/specs/funnel-smoke.spec.ts`:

```ts
test('anonymous navigation and merchant acquisition use traveller-first entry points', async ({ page }) => {
  const homeResponse = await page.goto('/en')
  expect(homeResponse?.status(), 'home should return HTTP 200').toBe(200)

  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/en/sign-in',
  )
  await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
    'href',
    '/en/sign-up',
  )
  await expect(page.getByRole('link', { name: 'For Creators' })).toHaveAttribute(
    'href',
    '/en/for-creators',
  )
  await expect(page.getByRole('link', { name: 'For Merchants' })).toHaveAttribute(
    'href',
    '/en/for-merchants',
  )

  const landingResponse = await page.goto('/en/for-merchants')
  expect(landingResponse?.status(), 'merchant landing should return HTTP 200').toBe(200)

  const missionLinks = page.getByRole('link', { name: 'Post a mission' })
  expect(await missionLinks.count()).toBeGreaterThanOrEqual(3)
  for (const link of await missionLinks.all()) {
    await expect(link).toHaveAttribute('href', '/en/merchants/post')
  }

  await missionLinks.first().click()
  await page.waitForURL('**/en/merchants/apply')
})
```

The count includes the two merchant-landing CTAs and the global footer CTA. Do not change the merchant dashboard's direct composer links.

- [ ] **Step 4: Run e2e typecheck and the focused browser spec**

Run:

```powershell
pnpm --filter @kinnso/e2e typecheck
pnpm --filter @kinnso/e2e e2e funnel-smoke
```

Expected: e2e TypeScript passes; both funnel-smoke tests pass in Chromium.

- [ ] **Step 5: Commit the acceptance unit**

```powershell
git add apps/web/tests/r7-6-navigation-footer.test.ts `
  apps/e2e/specs/funnel-smoke.spec.ts
git commit -m "test(web): lock R7.6 navigation acceptance"
```

---

### Task 5: Run full verification, review, publish, and squash-merge

**Files:**
- Review all R7.6 changes against `docs/superpowers/specs/2026-07-23-phase-r7-6-navigation-footer-design.md`.
- Do not add generated output, `.env.test`, Playwright artifacts, or unrelated user files.

**Interfaces:**
- Consumes: all committed R7.6 units.
- Produces: a green Vercel preview and one squash-merged PR on `main`.

- [ ] **Step 1: Run the focused R7.6 suite**

```powershell
cd apps/web
pnpm exec vitest run `
  tests/kinnso.Navbar.test.tsx `
  tests/kinnso.Footer.test.tsx `
  tests/kinnso.SiteChrome.test.tsx `
  tests/layout.siteChrome.test.tsx `
  tests/for-merchants.host.test.tsx `
  tests/merchants.dashboard-redirects.test.tsx `
  tests/trips.host.test.tsx `
  tests/r7-6-navigation-footer.test.ts
```

Expected: every selected file and test passes with zero failures.

- [ ] **Step 2: Run the repository quality gates**

From the repository root:

```powershell
pnpm honesty:lint
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter @kinnso/e2e typecheck
```

Expected:

- honesty lint exits 0;
- TypeScript exits 0;
- ESLint exits 0, with any existing warnings recorded separately;
- the full web Vitest suite exits 0;
- e2e TypeScript exits 0.

- [ ] **Step 3: Run the exact CI browser selection**

```powershell
pnpm --filter @kinnso/e2e e2e creator-onboarding funnel-smoke honesty notfound
```

Expected: every selected Chromium test passes. Preserve traces only for failures; do not commit `test-results`.

- [ ] **Step 4: Run explicit R7.6 acceptance checks**

```powershell
$forbidden = 'AI Travel' + ' Content Studio'
$hits = rg -n --fixed-strings $forbidden apps/web
if ($LASTEXITCODE -eq 0) {
  $hits
  throw 'Pre-pivot product line remains under apps/web'
}
if ($LASTEXITCODE -ne 1) {
  throw "rg failed with exit code $LASTEXITCODE"
}
Write-Output 'R7.6 pre-pivot phrase guard: PASS'

git diff --check origin/main...HEAD
git status --short
```

Expected:

- phrase guard prints `PASS`;
- diff check prints nothing;
- status contains no uncommitted source changes and no test/build artifacts.

- [ ] **Step 5: Perform a requirement-by-requirement review**

Confirm from the committed diff:

1. Anonymous desktop and mobile header show For Creators, For Merchants, Sign in, and Sign up.
2. Creator/pending, merchant, and traveller audience-link visibility matches the approved table.
3. Existing role-specific CTAs still target their original authenticated destinations.
4. Both merchant landing CTAs and the footer mission CTA target `/merchants/post`.
5. `/merchants/post` uses `getUser()`, `resolveViewerRole()`, and request-dependent `redirect()`.
6. The old permanent redirect no longer controls `/merchants/post`; other legacy redirect stubs remain unchanged.
7. The English and six translated footer taglines match the approved copy.
8. The Travellers column is absent while booking is off and contains Trips/Saved while booking is on.
9. `/trips#saved` points to an existing element.
10. No migration, production-data change, unrelated refactor, or new dependency is in the branch.

If review finds a defect, add a failing regression test, implement the minimal correction, rerun the affected suite, and commit with a scoped `fix(web): ...` message.

- [ ] **Step 6: Push and open the R7.6 PR**

```powershell
git push -u origin codex/r7-6-navigation-footer
$body = @"
## Summary
- make anonymous and role-aware navigation traveller-first
- route public merchant acquisition through the auth-aware `/merchants/post` entry
- localize the marketplace footer and gate Travellers links with `BOOKING_LIVE`

## Safety
- no database migration
- no production-data change
- authenticated dashboard shortcuts retain their existing destinations

## Verification
- focused R7.6 Vitest suite: PASS
- web typecheck, lint, and full tests: PASS
- e2e typecheck and exact CI browser selection: PASS
- pre-pivot phrase guard and `git diff --check`: PASS
"@
gh pr create `
  --base main `
  --head codex/r7-6-navigation-footer `
  --title "Phase R7.6 — Navigation, header CTAs, footer" `
  --body $body
```

The PR body must list:

- anonymous header role behavior;
- `/merchants/post` redirect matrix;
- footer tagline and `BOOKING_LIVE` gate;
- no database or production-data changes;
- exact test, typecheck, lint, e2e, and phrase-guard results.

Expected: GitHub returns the new PR URL and Vercel starts a preview deployment.

- [ ] **Step 7: Monitor preview and CI to terminal results**

```powershell
gh pr checks --watch --interval 20
```

Expected:

- Vercel preview passes its Next.js production build;
- `quality` passes;
- `e2e` passes;
- no required check is pending, cancelled, or failed.

If a check fails, inspect its exact logs, reproduce the root cause locally where possible, add a regression test, commit the fix, push, and restart the terminal-status watch.

- [ ] **Step 8: Squash-merge and verify the merged deployment**

```powershell
gh pr merge --squash
gh pr view --json state,mergedAt,mergeCommit,url
git push origin --delete codex/r7-6-navigation-footer
```

Expected: the PR reports `MERGED` with a merge commit on `main`.

Check the merge commit's status until Vercel is terminal:

```powershell
$mergeSha = gh pr view --json mergeCommit --jq '.mergeCommit.oid'
gh api "repos/YNWAforever/Remix-Kinnso/commits/$mergeSha/status"
```

Expected: the Vercel status for the merge SHA is `success`. Report the PR URL, merge SHA, preview/production results, and confirm again that no Supabase migration was applied.
