# Phase 4 — Merchant Loop Polish + Trust/Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merchant pipeline operable end-to-end and every footer/nav link reach real content — real creator names + post-success navigation + an empty-state CTA on the merchant loop; real About / Contact / creator-terms pages; article cross-locale fallback; and the Travelpayouts offer catalog live in production.

**Architecture:** Next.js 16 App Router (`apps/web`), server components host presentational views (`{ locale, t, ...data }`). New creator-name lookups reuse Phase 3's public-readable `creators` columns via the cookie-less anon client. New trust pages follow the existing host pattern (`creators/page.tsx`) instead of the Coming-Soon stub. i18n is 7 locale files + a `Messages` interface in `en.ts` (default export), guarded by `tests/i18n.locale-parity.test.ts`. Strand C is live ops via Supabase MCP + a live-deploy smoke (no code).

**Tech Stack:** TypeScript, React 19, Next.js 16, `@supabase/ssr` / `@supabase/supabase-js`, Vitest 4 (+ jsdom for render tests), Tailwind, hosted Supabase `scryfkefedzuetfdtrvl`.

**Branch:** `feat/phase4-merchant-trust` (already cut off `origin/main` @ `161e49a`).

**Conventions every task follows:**
- All paths below are relative to `kinnso-v3/apps/web` unless they start with `kinnso-v3/`.
- Run tests from `kinnso-v3/apps/web`. If the box is loaded, `pkill -f vitest` first (known env-timeout flake).
- Render tests: first line `// @vitest-environment jsdom`, `afterEach(cleanup)`, import en messages as **default** (`import en from '@/lib/i18n/messages/en'`).
- Decorative arrows must be `aria-hidden` (they pollute a link's accessible name and break `getByRole({ name })`).
- Commit messages end with a trailing `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` line.
- Per-task gate before commit: `pnpm exec vitest run <files> --no-file-parallelism` green, plus `pnpm exec tsc --noEmit` green. The full lint/build/parity gate runs in Task 12.

---

## Task 1: i18n — new groups + keys (7 locales + interface + parity GROUPS)

Foundational: Tasks 3,4,5,7,8,9,10 reference these keys.

**Files:**
- Modify: `lib/i18n/messages/en.ts` (interface + values)
- Modify: `lib/i18n/messages/ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts` (values)
- Modify: `tests/i18n.locale-parity.test.ts` (GROUPS array)

- [ ] **Step 1: Add the new groups + keys to `en.ts` — interface.** In `export interface Messages { ... }` add three new groups and extend two existing ones. New interface members:

```ts
  about: {
    eyebrow: string; title: string; intro: string
    missionHeading: string; missionBody: string
    creatorsHeading: string; creatorsBody: string
    merchantsHeading: string; merchantsBody: string
    ctaHeading: string; ctaBody: string; ctaButton: string
  }
  contact: {
    eyebrow: string; title: string; intro: string
    emailLabel: string; emailCta: string; responseNote: string
  }
  creatorTerms: {
    eyebrow: string; title: string; draftNotice: string; englishNotice: string; back: string
  }
```

In the existing `missions: { ... }` interface block, add:

```ts
    postSuccessTitle: string
    postSuccessBody: string
    viewMission: string
    missionsEmptyTitle: string
    missionsEmptyBody: string
    postMissionCta: string
    creatorFallback: string
```

In the existing `article: { ... }` interface line, add `fallbackNotice: string` (so it reads `article: { youMayLike: string; faqTitle: string; tableOfContents: string; by: string; fallbackNotice: string }`).

- [ ] **Step 2: Add the English values to `en.ts` — `const messages`.** Add the three new value groups (place `about`/`contact` near `home`, `creatorTerms` near `comingSoon`):

```ts
  about: {
    eyebrow: 'About KINNSO',
    title: 'A creator-first travel & lifestyle community.',
    intro: 'KINNSO helps travel and lifestyle creators turn real expertise into published guides, brand missions, and affiliate earnings — with the tools and the audience to grow.',
    missionHeading: 'What we do',
    missionBody: 'We connect creators with merchants and travellers across Hong Kong, Taipei, Tokyo and beyond. Creators publish guides, join brand missions, and earn through affiliate offers; merchants reach trusted local voices.',
    creatorsHeading: 'For creators',
    creatorsBody: 'Build a public profile, publish guides, and join real missions and affiliate offers — paid honestly, with no fabricated metrics.',
    merchantsHeading: 'For merchants',
    merchantsBody: 'Post a mission, work with vetted creators, and track participation through a transparent pipeline.',
    ctaHeading: 'Want to create with KINNSO?',
    ctaBody: 'Apply as a creator and start building your profile today.',
    ctaButton: 'Apply as a creator',
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Get in touch.',
    intro: 'Questions, partnerships, or press? Email us and we’ll get back to you.',
    emailLabel: 'Email',
    emailCta: 'Email us',
    responseNote: 'We typically reply within a few business days.',
  },
  creatorTerms: {
    eyebrow: 'Creator terms',
    title: 'Creator Terms (MVP draft)',
    draftNotice: 'This is an early draft of our creator terms for KINNSO’s soft launch. It is written in plain language, is not a final legal contract, and may change. We’ll notify creators of material updates.',
    englishNotice: 'These terms are currently provided in English only.',
    back: 'Back to home',
  },
```

In the existing `missions:` values block add:

```ts
    postSuccessTitle: 'Mission posted',
    postSuccessBody: 'Your mission is live. Manage applications and submissions from the mission page.',
    viewMission: 'View mission',
    missionsEmptyTitle: 'No missions yet',
    missionsEmptyBody: 'Post your first mission to start working with creators.',
    postMissionCta: 'Post a mission',
    creatorFallback: 'Creator',
```

In the existing `article:` values line add `fallbackNotice: 'This article isn’t available in your language yet — showing the original version.'`

- [ ] **Step 3: Add `'about', 'contact', 'creatorTerms', 'article'` to the parity test GROUPS.** In `tests/i18n.locale-parity.test.ts`, extend the `GROUPS` array so it reads:

```ts
const GROUPS = [
  'studio', 'creatorProfile', 'merchants', 'missions', 'missionDetail', 'ops', 'nav', 'footer', 'home', 'comingSoon',
  'studioHome', 'explore', 'feed', 'creatorsLanding', 'merchantsLanding', 'studioGuides',
  'studioOffers', 'studioEarnings', 'about', 'contact', 'creatorTerms', 'article',
] as const
```

- [ ] **Step 4: Run parity — expect FAIL for the 6 non-en locales.**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism`
Expected: FAIL — `ja/ko/th/zh-cn/zh-hk/zh-tw` missing `about`, `contact`, `creatorTerms`, and `article.fallbackNotice`, plus `missions.*` new keys. (`en defines the three new groups` passes.)

- [ ] **Step 5: Translate the new keys into all 6 non-en locales.** For each of `ja.ts, ko.ts, th.ts, zh-cn.ts, zh-hk.ts, zh-tw.ts`, add the same `about`, `contact`, `creatorTerms` groups, the seven new `missions.*` keys, and `article.fallbackNotice` — with values **translated** to that locale, matching the tone of the existing translations already in that file (compare how `home`/`missions` are translated there). Keep `creatorTerms.englishNotice` honest in each locale (e.g. ja: 「本規約は現在、英語版のみ提供しています。」). The key STRUCTURE must be byte-for-byte identical to `en` — only values differ. Email/brand tokens (`business@kinnso.ai`, `KINNSO`) stay literal.

- [ ] **Step 6: Run parity + typecheck — expect PASS.**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism`
Expected: PASS (all 7 locales identical key paths for every group).
Run: `pnpm exec tsc --noEmit`
Expected: PASS (each locale's `const messages: Messages` satisfies the extended interface).

- [ ] **Step 7: Commit.**

```bash
git add lib/i18n/messages tests/i18n.locale-parity.test.ts
git commit -m "feat(phase4): add about/contact/creatorTerms i18n groups + missions/article keys

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `getCreatorPublicNames(ids)` read helper

Maps participant `creator_id`s to real public names (reuses Phase 3's public-readable `creators` rows; RLS returns only active+published creators).

**Files:**
- Modify: `lib/creators/queries.ts`
- Test: `tests/creators.queries.test.ts` (extend)

- [ ] **Step 1: Add the failing test.** Append to `tests/creators.queries.test.ts`. First, add an `in` method to the mock builder so `.in('id', ids)` chains — edit the `make(...)` builder object to include `in: () => builder,` alongside `select`/`eq`/`not`. Then add:

```ts
import { getCreatorPublicNames } from '@/lib/creators/queries'

describe('getCreatorPublicNames', () => {
  it('maps ids to display_name (falling back to handle)', async () => {
    state.creators = [
      { id: 'c1', handle: 'maya', display_name: 'Maya Wanders' },
      { id: 'c2', handle: 'leo', display_name: null },
    ]
    const map = await getCreatorPublicNames(['c1', 'c2'])
    expect(map.get('c1')).toEqual({ name: 'Maya Wanders', handle: 'maya' })
    expect(map.get('c2')).toEqual({ name: 'leo', handle: 'leo' })
  })

  it('omits ids with no public row and dedupes/ignores empties', async () => {
    state.creators = [{ id: 'c1', handle: 'maya', display_name: 'Maya Wanders' }]
    const map = await getCreatorPublicNames(['c1', 'c1', '', 'unknown'])
    expect(map.size).toBe(1)
    expect(map.get('unknown')).toBeUndefined()
  })

  it('returns an empty map for no ids', async () => {
    expect((await getCreatorPublicNames([])).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test — expect FAIL.**

Run: `pnpm exec vitest run tests/creators.queries.test.ts --no-file-parallelism`
Expected: FAIL — `getCreatorPublicNames` is not exported.

- [ ] **Step 3: Implement the helper.** Append to `lib/creators/queries.ts`:

```ts
export interface CreatorPublicName {
  name: string
  handle: string | null
}

export async function getCreatorPublicNames(
  ids: string[],
): Promise<Map<string, CreatorPublicName>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, CreatorPublicName>()
  if (unique.length === 0) return map

  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('creators')
    .select('id, handle, display_name')
    .in('id', unique)

  for (const c of data ?? []) {
    const handle = (c.handle as string | null) ?? null
    const name = (c.display_name ?? handle) as string
    if (name) map.set(c.id as string, { name, handle })
  }
  return map
}
```

- [ ] **Step 4: Run the test — expect PASS.**

Run: `pnpm exec vitest run tests/creators.queries.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/creators/queries.ts tests/creators.queries.test.ts
git commit -m "feat(phase4): add getCreatorPublicNames creator-name lookup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Merchant mission detail — real creator names + `/c/[handle]` links

Replace the fake `Creator a1b2c3d4` placeholder with real names; link to the public profile when a handle exists. `MissionDetailView` is merchant-only and already receives `locale` + imports `Link`.

**Files:**
- Modify: `components/kinnso/pages/MissionDetailView.tsx` (widen `MissionDetail`, render links)
- Modify: `app/[locale]/merchants/missions/[missionId]/page.tsx` (drop `creatorName()`, use the name map)
- Test: `tests/kinnso.MissionDetailView.test.tsx` (view link), `tests/merchant.mission-detail.host.test.tsx` (host real names)

- [ ] **Step 1: Write the failing view test.** Add to `tests/kinnso.MissionDetailView.test.tsx` (mirror its existing render style — `render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={vi.fn()} onReviewSubmission={vi.fn()} />)`):

```ts
  it('links a participant name to the public profile when a handle exists', () => {
    const mission = {
      id: 'm1',
      title: 'Hybrid mission',
      participants: [
        { id: 'p1', creatorName: 'Maya Wanders', creatorHandle: 'maya', status: 'active' },
        { id: 'p2', creatorName: 'Creator', creatorHandle: null, status: 'applied' },
      ],
      submissions: [],
    }
    render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={vi.fn()} onReviewSubmission={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Maya Wanders' }).getAttribute('href')).toBe('/en/c/maya')
    expect(screen.queryByRole('link', { name: 'Creator' })).toBeNull()
    expect(screen.getByText('Creator')).toBeTruthy()
  })
```

- [ ] **Step 2: Run the view test — expect FAIL.**

Run: `pnpm exec vitest run tests/kinnso.MissionDetailView.test.tsx --no-file-parallelism`
Expected: FAIL — type/render: `creatorHandle` not on the shape; name not a link.

- [ ] **Step 3: Widen the shape + render links in `MissionDetailView.tsx`.** Change the `MissionDetail` type:

```ts
export type MissionDetail = {
  id: string
  title: string
  participants: Array<{ id: string; creatorName: string; creatorHandle?: string | null; status: string }>
  submissions: Array<{ id: string; creatorName?: string; creatorHandle?: string | null; status: string; snapshotStatus?: SocialSignalStatus }>
}
```

Replace the participant name render (was `<h3 className="font-bold text-kinnso-ink">{participant.creatorName}</h3>`):

```tsx
{participant.creatorHandle ? (
  <Link href={`/${locale}/c/${participant.creatorHandle}`} className="font-bold text-kinnso-ink hover:text-kinnso-orange hover:underline">
    {participant.creatorName}
  </Link>
) : (
  <h3 className="font-bold text-kinnso-ink">{participant.creatorName}</h3>
)}
```

Replace the submission name render (was `<h3 className="font-bold text-kinnso-ink">{submission.creatorName ?? submission.id}</h3>`):

```tsx
{submission.creatorHandle && submission.creatorName ? (
  <Link href={`/${locale}/c/${submission.creatorHandle}`} className="font-bold text-kinnso-ink hover:text-kinnso-orange hover:underline">
    {submission.creatorName}
  </Link>
) : (
  <h3 className="font-bold text-kinnso-ink">{submission.creatorName ?? submission.id}</h3>
)}
```

- [ ] **Step 4: Run the view test — expect PASS.**

Run: `pnpm exec vitest run tests/kinnso.MissionDetailView.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Update the host test for real names.** In `tests/merchant.mission-detail.host.test.tsx`: add a mock for the creators query, and change the fake-name assertion. Add this `vi.mock` next to the others:

```ts
vi.mock('@/lib/creators/queries', () => ({
  getCreatorPublicNames: vi.fn(async () =>
    new Map([['creator-12345678', { name: 'Maya Wanders', handle: 'maya' }]]),
  ),
}))
```

Replace `expect(screen.getAllByText('Creator creator-')).toHaveLength(2)` with:

```ts
    expect(screen.getAllByRole('link', { name: 'Maya Wanders' })[0].getAttribute('href')).toBe('/en/c/maya')
```

- [ ] **Step 6: Run the host test — expect FAIL.**

Run: `pnpm exec vitest run tests/merchant.mission-detail.host.test.tsx --no-file-parallelism`
Expected: FAIL — host still emits `Creator creator-` (no real names wired).

- [ ] **Step 7: Wire the name map into the host page.** In `app/[locale]/merchants/missions/[missionId]/page.tsx`:
  - Add import: `import { getCreatorPublicNames, type CreatorPublicName } from '@/lib/creators/queries'`.
  - Delete the `creatorName()` helper (lines 29–31).
  - Change `mapMissionDetail` to accept the name map + fallback and use them:

```ts
function mapMissionDetail(
  row: MerchantMissionDetailData,
  names: Map<string, CreatorPublicName>,
  fallback: string,
): MissionDetail {
  const participants = row.mission_participants ?? []
  const resolve = (id: string | null) => {
    const found = id ? names.get(id) : undefined
    return { name: found?.name ?? fallback, handle: found?.handle ?? null }
  }

  return {
    id: row.id,
    title: row.title ?? '',
    participants: participants.map((participant) => {
      const c = resolve(participant.creator_id)
      return { id: participant.id, creatorName: c.name, creatorHandle: c.handle, status: participant.status ?? 'applied' }
    }),
    submissions: participants.flatMap((participant) => {
      const c = resolve(participant.creator_id)
      return (participant.mission_milestone_submissions ?? []).map((submission) => ({
        id: submission.id,
        creatorName: c.name,
        creatorHandle: c.handle,
        status: submission.status ?? 'pending',
        snapshotStatus: socialSignalStatus(submission.mission_social_snapshots),
      }))
    }),
  }
}
```

  - At the call site (where `row` is found), build ids + map before mapping:

```ts
  const ids = (row.mission_participants ?? [])
    .map((p) => p.creator_id)
    .filter((id): id is string => Boolean(id))
  const names = await getCreatorPublicNames(ids)

  return (
    <MissionDetailView
      locale={loc}
      t={messages.missions}
      mission={mapMissionDetail(row, names, messages.missions.creatorFallback)}
      onReviewParticipant={reviewParticipant}
      onReviewSubmission={reviewSubmission}
    />
  )
```

(Keep the existing `onReviewParticipant`/`onReviewSubmission` server-action props exactly as they are — only the `mission={...}` arg changes.)

- [ ] **Step 8: Run the host test — expect PASS.**

Run: `pnpm exec vitest run tests/merchant.mission-detail.host.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 9: Typecheck + commit.**

Run: `pnpm exec tsc --noEmit` → PASS

```bash
git add components/kinnso/pages/MissionDetailView.tsx "app/[locale]/merchants/missions/[missionId]/page.tsx" tests/kinnso.MissionDetailView.test.tsx tests/merchant.mission-detail.host.test.tsx
git commit -m "feat(phase4): real creator names + profile links in merchant mission detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Merchant missions empty-state CTA

**Files:**
- Modify: `components/kinnso/pages/MerchantMissionsView.tsx`
- Test: `tests/kinnso.MerchantMissionsView.test.tsx` (extend)

- [ ] **Step 1: Write the failing test.** Add to `tests/kinnso.MerchantMissionsView.test.tsx` (render with `missions={[]}`):

```ts
  it('shows a post-a-mission CTA when there are no missions', () => {
    render(<MerchantMissionsView locale="en" t={en.missions} missions={[]} />)
    expect(screen.getByText(en.missions.missionsEmptyTitle)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.missions.postMissionCta }).getAttribute('href')).toBe('/en/merchants/post')
  })
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/kinnso.MerchantMissionsView.test.tsx --no-file-parallelism`
Expected: FAIL — no empty-state text/CTA.

- [ ] **Step 3: Implement the empty state.** In `MerchantMissionsView.tsx`, replace the `{missions.map(...)}` block with a guarded render:

```tsx
        {missions.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <h2 className="text-lg font-black text-kinnso-ink">{t.missionsEmptyTitle}</h2>
            <p className="mt-1 text-sm text-kinnso-muted">{t.missionsEmptyBody}</p>
            <Link href={`/${locale}/merchants/post`} className="k-btn-primary mt-5 inline-flex">
              {t.postMissionCta}
            </Link>
          </div>
        ) : (
          missions.map((mission) => (
            <Link
              key={mission.id}
              href={`/${locale}/merchants/missions/${mission.id}`}
              className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 transition last:border-b-0 hover:bg-kinnso-cream2 sm:grid-cols-[1fr_120px] sm:items-center"
            >
              <div>
                <h2 className="font-bold text-kinnso-ink">{mission.title}</h2>
                <p className="mt-1 text-sm text-kinnso-muted">
                  {t.participants}: {mission.participantCount} / {t.pendingApplications}: {mission.pendingCount} / {t.settlement}: {mission.settlementStatus ?? '-'}
                </p>
              </div>
              <MissionStatusBadge status={mission.status} />
            </Link>
          ))
        )}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `pnpm exec vitest run tests/kinnso.MerchantMissionsView.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add components/kinnso/pages/MerchantMissionsView.tsx tests/kinnso.MerchantMissionsView.test.tsx
git commit -m "feat(phase4): empty-state post-a-mission CTA on merchant missions list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Mission post — success panel with links

On a successful post, replace the form with a success panel linking to the new mission + the queue. Capture `missionId` (the host action already returns it).

**Files:**
- Modify: `components/kinnso/pages/MissionPostWizard.tsx`
- Test: `tests/kinnso.MissionPostWizard.test.tsx` (update one test, add one)

- [ ] **Step 1: Write/adjust tests.** In `tests/kinnso.MissionPostWizard.test.tsx`:

(a) **Replace** the existing `it('keeps submit actions disabled after a successful create', ...)` test with a success-panel version:

```ts
  it('shows a success panel after a successful create', async () => {
    const onSubmit = vi.fn(async () => ({ ok: true }))
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })

    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))

    expect(await screen.findByText(en.missions.postSuccessTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missions.saveDraft })).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
```

(b) **Add** a test that the panel links to the new mission:

```ts
  it('links the success panel to the new mission and the queue', async () => {
    const onSubmit = vi.fn(async () => ({ ok: true, missionId: 'm1' }))
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })

    fireEvent.click(screen.getByRole('button', { name: en.missions.publish }))

    expect((await screen.findByRole('link', { name: en.missions.viewMission })).getAttribute('href')).toBe('/en/merchants/missions/m1')
    expect(screen.getByRole('link', { name: en.missions.backToQueue }).getAttribute('href')).toBe('/en/merchants/missions')
  })
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/kinnso.MissionPostWizard.test.tsx --no-file-parallelism`
Expected: FAIL — no success panel / `missionId` not captured.

- [ ] **Step 3: Implement.** In `MissionPostWizard.tsx`:
  - Add import: `import Link from 'next/link'`.
  - Widen the `SubmitResult` type to carry `missionId`:

```ts
type SubmitResult =
  | void
  | { ok: true; missionId?: string }
  | {
      ok: false
      errors?: Record<string, string[]>
    }
```

  - Add state next to the existing hooks: `const [missionId, setMissionId] = useState<string | null>(null)`.
  - In `submit()`, after the failure check, capture the id before setting submitted:

```ts
    if (isFailureResult(result)) {
      setError(firstActionError(result.errors) ?? t.validationError)
      return
    }
    if (result && typeof result === 'object' && 'missionId' in result && result.missionId) {
      setMissionId(result.missionId)
    }
    setSubmitted(true)
```

  - Render the success panel by returning early (before the form `return`), right after the hooks/handlers:

```tsx
  if (submitted) {
    return (
      <div className="k-container py-10" lang={locale}>
        <div className="rounded-2xl border border-kinnso-cream2 bg-white p-8 shadow-kinnso">
          <h1 className="text-2xl font-black text-kinnso-ink">{t.postSuccessTitle}</h1>
          <p className="mt-2 text-kinnso-muted">{t.postSuccessBody}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {missionId && (
              <Link href={`/${locale}/merchants/missions/${missionId}`} className="k-btn-primary">
                {t.viewMission}
              </Link>
            )}
            <Link href={`/${locale}/merchants/missions`} className="k-btn-ghost">
              {t.backToQueue}
            </Link>
          </div>
        </div>
      </div>
    )
  }
```

- [ ] **Step 4: Run — expect PASS.** (Also confirm the unchanged tests — validation error, double-submit guard, draft payload — still pass; the early return only triggers once `submitted` is true.)

Run: `pnpm exec vitest run tests/kinnso.MissionPostWizard.test.tsx --no-file-parallelism`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Typecheck + commit.**

Run: `pnpm exec tsc --noEmit` → PASS

```bash
git add components/kinnso/pages/MissionPostWizard.tsx tests/kinnso.MissionPostWizard.test.tsx
git commit -m "feat(phase4): success panel with mission/queue links after posting a mission

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Remove the dangling `?creator=` param

**Files:**
- Modify: `components/kinnso/CreatorMatchCard.tsx`
- Test: `tests/kinnso.CreatorMatchCard.test.tsx` (update assertion)

- [ ] **Step 1: Update the test to expect a param-free href.** In `tests/kinnso.CreatorMatchCard.test.tsx`, change the `'keeps the send brief link locale scoped'` assertion to:

```tsx
    expect(screen.getByRole('link', { name: 'Send brief →' }).getAttribute('href')).toBe('/en/merchants/post')
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/kinnso.CreatorMatchCard.test.tsx --no-file-parallelism`
Expected: FAIL — href still has `?creator=...`.

- [ ] **Step 3: Implement.** In `CreatorMatchCard.tsx`, change line 29 to:

```ts
  const briefHref = `/${locale}/merchants/post`;
```

(Leave `creator`, `locs`, `history` etc. as-is; only the query string is removed.)

- [ ] **Step 4: Run — expect PASS.**

Run: `pnpm exec vitest run tests/kinnso.CreatorMatchCard.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add components/kinnso/CreatorMatchCard.tsx tests/kinnso.CreatorMatchCard.test.tsx
git commit -m "fix(phase4): drop dead ?creator= param from CreatorMatchCard brief link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: About page (real)

**Files:**
- Create: `components/kinnso/pages/AboutView.tsx`
- Modify (replace whole file): `app/[locale]/about/page.tsx`
- Test: `tests/about.host.test.tsx`

- [ ] **Step 1: Write the failing host test.** Create `tests/about.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import AboutPage from '@/app/[locale]/about/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/about host', () => {
  it('renders the real About page (not a Coming Soon stub)', async () => {
    const ui = await AboutPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.about.title })).toBeTruthy()
    expect(screen.getByText(en.about.missionHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.about.ctaButton }).getAttribute('href')).toBe('/en/sign-up')
    expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/about.host.test.tsx --no-file-parallelism`
Expected: FAIL — page still renders ComingSoon.

- [ ] **Step 3: Create `AboutView.tsx`.**

```tsx
import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AboutView({ locale, t }: { locale: Locale; t: Messages['about'] }) {
  const p = (path: string) => `/${locale}${path}`
  const sections = [
    { heading: t.missionHeading, body: t.missionBody },
    { heading: t.creatorsHeading, body: t.creatorsBody },
    { heading: t.merchantsHeading, body: t.merchantsBody },
  ]
  return (
    <main>
      <section className="k-page-band py-16">
        <div className="k-container max-w-3xl">
          <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.eyebrow}</span>
          <h1 className="k-display mt-5 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.title}</h1>
          <p className="mt-4 text-lg text-kinnso-muted">{t.intro}</p>
        </div>
      </section>
      <section className="k-container max-w-3xl py-12">
        <div className="grid gap-10">
          {sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-2xl font-black text-kinnso-ink">{s.heading}</h2>
              <p className="mt-2 text-kinnso-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="k-container max-w-3xl pb-20">
        <div className="rounded-2xl border border-kinnso-cream2 bg-white p-8 text-center shadow-kinnso">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaHeading}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaBody}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-6 inline-flex">{t.ctaButton}</Link>
        </div>
      </section>
    </main>
  )
}

export default AboutView
```

- [ ] **Step 4: Replace `app/[locale]/about/page.tsx`.**

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { AboutView } from '@/components/kinnso/pages/AboutView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <AboutView locale={locale as Locale} t={messages.about} />
}
```

- [ ] **Step 5: Run — expect PASS.**

Run: `pnpm exec vitest run tests/about.host.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit.**

Run: `pnpm exec tsc --noEmit` → PASS

```bash
git add components/kinnso/pages/AboutView.tsx "app/[locale]/about/page.tsx" tests/about.host.test.tsx
git commit -m "feat(phase4): real About page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Contact page (real, mailto) + footer link

Note: `footer.lContact` already exists in all 7 locales (value `Contact`). Phase 1 deliberately removed a dead Contact link; Phase 4 adds a real one to a real route, so the Phase-1 "no Contact" assertion in the Footer test must be updated.

**Files:**
- Create: `components/kinnso/pages/ContactView.tsx`
- Create: `app/[locale]/contact/page.tsx`
- Modify: `components/kinnso/Footer.tsx` (add Contact link to the Company column)
- Modify: `tests/kinnso.Footer.test.tsx` (flip the Contact assertion)
- Test: `tests/contact.host.test.tsx`

- [ ] **Step 1: Write the failing host test.** Create `tests/contact.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import ContactPage from '@/app/[locale]/contact/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/contact host', () => {
  it('renders the contact page with a mailto link', async () => {
    const ui = await ContactPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.contact.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.contact.emailCta }).getAttribute('href')).toBe('mailto:business@kinnso.ai')
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/contact.host.test.tsx --no-file-parallelism`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Create `ContactView.tsx`.**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'

const SUPPORT_EMAIL = 'business@kinnso.ai'

export function ContactView({ t }: { t: Messages['contact'] }) {
  return (
    <main>
      <section className="k-page-band py-16">
        <div className="k-container max-w-3xl">
          <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.eyebrow}</span>
          <h1 className="k-display mt-5 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.title}</h1>
          <p className="mt-4 text-lg text-kinnso-muted">{t.intro}</p>
        </div>
      </section>
      <section className="k-container max-w-3xl py-12">
        <div className="rounded-2xl border border-kinnso-cream2 bg-white p-8 shadow-kinnso">
          <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.emailLabel}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block text-xl font-black text-kinnso-ink hover:text-kinnso-orange">
            {SUPPORT_EMAIL}
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="k-btn-primary mt-6 inline-flex">{t.emailCta}</a>
          <p className="mt-4 text-sm text-kinnso-muted">{t.responseNote}</p>
        </div>
      </section>
    </main>
  )
}

export default ContactView
```

- [ ] **Step 4: Create `app/[locale]/contact/page.tsx`.**

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { ContactView } from '@/components/kinnso/pages/ContactView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <ContactView t={messages.contact} />
}
```

- [ ] **Step 5: Run host test — expect PASS.**

Run: `pnpm exec vitest run tests/contact.host.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Update the Footer test (flip Contact).** In `tests/kinnso.Footer.test.tsx`:
  - In `'does not render duplicate dead links to /about'`, **delete** the line `expect(screen.queryByText(en.footer.lContact)).toBeNull()` (keep the `lCaseStudies` and `lPress` null assertions).
  - Add a new test:

```ts
  it('links Contact to the real contact route', () => {
    render(<Footer locale="en" t={en.footer} />)
    expect(screen.getByRole('link', { name: en.footer.lContact }).getAttribute('href')).toBe('/en/contact')
  })
```

- [ ] **Step 7: Run Footer test — expect FAIL.**

Run: `pnpm exec vitest run tests/kinnso.Footer.test.tsx --no-file-parallelism`
Expected: FAIL — no Contact link rendered yet.

- [ ] **Step 8: Add the Contact link to the Footer.** In `components/kinnso/Footer.tsx`, change the Company column to include Contact:

```tsx
    { title: t.colCompany, links: [[t.lAbout, "/about"], [t.lAgent, "/agent"], [t.lContact, "/contact"], [t.lLegal, "/legal/creator-terms"]] as const },
```

- [ ] **Step 9: Run Footer test — expect PASS.**

Run: `pnpm exec vitest run tests/kinnso.Footer.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 10: Typecheck + commit.**

Run: `pnpm exec tsc --noEmit` → PASS

```bash
git add components/kinnso/pages/ContactView.tsx "app/[locale]/contact/page.tsx" components/kinnso/Footer.tsx tests/contact.host.test.tsx tests/kinnso.Footer.test.tsx
git commit -m "feat(phase4): real Contact page + footer link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Creator terms page (plain-language MVP, English body)

Chrome localized; legal body is a single English constant (lang="en").

**Files:**
- Create: `components/kinnso/pages/CreatorTermsView.tsx`
- Modify (replace whole file): `app/[locale]/legal/creator-terms/page.tsx`
- Test: `tests/creator-terms.host.test.tsx`

- [ ] **Step 1: Write the failing host test.** Create `tests/creator-terms.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import CreatorTermsPage from '@/app/[locale]/legal/creator-terms/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/legal/creator-terms host', () => {
  it('renders real terms with the MVP-draft + English notices', async () => {
    const ui = await CreatorTermsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.creatorTerms.title })).toBeTruthy()
    expect(screen.getByText(en.creatorTerms.draftNotice)).toBeTruthy()
    expect(screen.getByText(en.creatorTerms.englishNotice)).toBeTruthy()
    expect(screen.getByText('Commissions & earnings')).toBeTruthy()
    expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/creator-terms.host.test.tsx --no-file-parallelism`
Expected: FAIL — page still renders ComingSoon.

- [ ] **Step 3: Create `CreatorTermsView.tsx`** (with the full English body constant):

```tsx
import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

const TERMS_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: 'Who these terms cover',
    body: 'These terms apply to creators who join KINNSO to publish guides, take part in brand missions, and use affiliate offers. By using your creator account, you agree to them.',
  },
  {
    heading: 'Honest content & disclosure',
    body: 'You publish content you have the right to share, and you keep it honest and original. When a guide or post contains an affiliate link or paid promotion, you disclose it clearly, in line with local advertising rules and platform policies.',
  },
  {
    heading: 'Commissions & earnings',
    body: 'Affiliate and mission earnings follow the rates shown on each offer or mission. Settlement is handled manually by KINNSO based on confirmed activity from our partners. Earnings are estimates until confirmed and paid, and KINNSO does not guarantee any level of income.',
  },
  {
    heading: 'Your account & data',
    body: 'You are responsible for your account and for the accuracy of the profile information you publish. We process your data to operate KINNSO; we do not sell your personal data. Public profile fields you choose to publish are visible to others.',
  },
  {
    heading: 'Account changes & termination',
    body: 'You can stop using KINNSO at any time. We may suspend or close an account that breaks these terms, infringes others’ rights, or harms the community. Where reasonable, we will give notice.',
  },
  {
    heading: 'Questions',
    body: 'Questions about these terms? Email business@kinnso.ai.',
  },
]

export function CreatorTermsView({ locale, t }: { locale: Locale; t: Messages['creatorTerms'] }) {
  return (
    <main>
      <section className="k-page-band py-16">
        <div className="k-container max-w-3xl">
          <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.eyebrow}</span>
          <h1 className="k-display mt-5 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.title}</h1>
          <p className="mt-4 rounded-xl bg-kinnso-cream2 p-4 text-sm text-kinnso-ink">{t.draftNotice}</p>
          <p className="mt-2 text-sm text-kinnso-muted">{t.englishNotice}</p>
        </div>
      </section>
      <section className="k-container max-w-3xl py-12">
        <div className="grid gap-8" lang="en">
          {TERMS_SECTIONS.map((s) => (
            <div key={s.heading}>
              <h2 className="text-xl font-black text-kinnso-ink">{s.heading}</h2>
              <p className="mt-2 text-kinnso-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <Link href={`/${locale}`} className="k-btn-ghost mt-10 inline-flex">{t.back}</Link>
      </section>
    </main>
  )
}

export default CreatorTermsView
```

- [ ] **Step 4: Replace `app/[locale]/legal/creator-terms/page.tsx`.**

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorTermsView } from '@/components/kinnso/pages/CreatorTermsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function CreatorTermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <CreatorTermsView locale={locale as Locale} t={messages.creatorTerms} />
}
```

- [ ] **Step 5: Run — expect PASS.**

Run: `pnpm exec vitest run tests/creator-terms.host.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit.**

Run: `pnpm exec tsc --noEmit` → PASS

```bash
git add components/kinnso/pages/CreatorTermsView.tsx "app/[locale]/legal/creator-terms/page.tsx" tests/creator-terms.host.test.tsx
git commit -m "feat(phase4): real plain-language creator terms (MVP draft)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Article cross-locale fallback + link affordance

Show a fallback translation (exact locale → `en` → first available) instead of 404 when the requested locale is missing, with a notice; add a visible read-arrow cue to `ArticleCard`.

**Files:**
- Modify: `lib/articles/queries.ts` (translation selection in `getArticleDetail` and `getArticleByUrl`)
- Modify: `app/[locale]/articles/[category]/[url]/page.tsx` (notice when fallback used)
- Modify: `components/ArticleCard.tsx` (read-arrow affordance)
- Test: `tests/articles.fallback.test.ts` (query selection), `tests/ArticleCard.test.tsx` (affordance)

- [ ] **Step 1: Write the failing query test.** Create `tests/articles.fallback.test.ts`. It mocks the anon client used by `lib/articles/queries.ts` (the `db()` helper builds a `@supabase/supabase-js` client) and asserts the fallback order. Mock at the `@supabase/supabase-js` boundary:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ article: null as unknown }))

vi.mock('@supabase/supabase-js', () => {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: state.article, error: null }),
    then: (onF: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: state.article, error: null }).then(onF),
  }
  return { createClient: () => ({ from: () => builder }) }
})

import { getArticleByUrl } from '@/lib/articles/queries'

const baseArticle = {
  id: 'a1', url: 'kyoto-tea', category: 'destinations',
  article_translations: [
    { locale: 'en', title: 'Kyoto Tea (EN)', content: [], summary: null, meta_title: null, meta_description: null, og_image: null, faq_title: null },
    { locale: 'ja', title: 'Kyoto Tea (JA)', content: [], summary: null, meta_title: null, meta_description: null, og_image: null, faq_title: null },
  ],
}

beforeEach(() => { state.article = JSON.parse(JSON.stringify(baseArticle)) })

describe('article translation fallback', () => {
  it('returns the exact locale when present', async () => {
    const a = await getArticleByUrl('kyoto-tea', 'ja')
    expect(a?.translation?.locale).toBe('ja')
  })

  it('falls back to en when the requested locale is missing', async () => {
    const a = await getArticleByUrl('kyoto-tea', 'ko')
    expect(a?.translation?.locale).toBe('en')
  })

  it('falls back to the first available when neither requested nor en exists', async () => {
    state.article = { ...baseArticle, article_translations: [baseArticle.article_translations[1]] }
    const a = await getArticleByUrl('kyoto-tea', 'ko')
    expect(a?.translation?.locale).toBe('ja')
  })
})
```

> Note for the implementer: confirm the exact mock shape `getArticleByUrl` expects by reading `lib/articles/queries.ts` (it `.select('*, article_translations(*)').eq('url', url).maybeSingle()`). Adjust the mock builder so the chain it actually calls resolves to `state.article`. If `getArticleByUrl` returns a flattened `translation`, assert `a?.translation?.locale`; the selection logic is what matters.

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/articles.fallback.test.ts --no-file-parallelism`
Expected: FAIL — current code returns `null` translation for a missing locale (no fallback).

- [ ] **Step 3: Implement the fallback selection.** In `lib/articles/queries.ts`, replace **both** occurrences of:

```ts
const translation =
  (data.article_translations ?? []).find((t) => t.locale === locale) ?? null
```

with a shared fallback (define a small helper near the top of the file and use it in both `getArticleDetail` and `getArticleByUrl`):

```ts
function pickTranslation<T extends { locale: string }>(translations: T[], locale: string): T | null {
  if (translations.length === 0) return null
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === 'en') ??
    translations[0]
  )
}
```

and call `const translation = pickTranslation(data.article_translations ?? [], locale)`.

- [ ] **Step 4: Run query test — expect PASS.**

Run: `pnpm exec vitest run tests/articles.fallback.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Show the fallback notice on the detail page.** In `app/[locale]/articles/[category]/[url]/page.tsx`, after `const dict = await getDictionary(loc)` and before the article body, render a notice when the served translation isn't the requested locale. Add inside the article header area (e.g. just above `<ArticleBlockRenderer .../>` or under the `<h1>`):

```tsx
{a.translation.locale !== loc && (
  <p className="mt-2 rounded-lg bg-kinnso-cream2 px-3 py-2 text-sm text-kinnso-ink">
    {dict.article.fallbackNotice}
  </p>
)}
```

(The `notFound()` guard stays `if (!a || !a.translation) notFound()` — now only fires when an article has *zero* translations.)

- [ ] **Step 6: Add the read affordance test.** Create `tests/ArticleCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ArticleCard } from '@/components/ArticleCard'

afterEach(cleanup)

describe('ArticleCard', () => {
  it('wraps the whole card in a single link with a decorative read arrow', () => {
    render(<ArticleCard href="/en/articles/destinations/kyoto-tea" title="Kyoto Tea" summary="Lovely tea houses." />)
    const link = screen.getByRole('link', { name: 'Kyoto Tea' })
    expect(link.getAttribute('href')).toBe('/en/articles/destinations/kyoto-tea')
    expect(link.querySelector('[aria-hidden="true"]')?.textContent).toContain('→')
  })
})
```

(The arrow is `aria-hidden`, so the link's accessible name stays `Kyoto Tea`.)

- [ ] **Step 7: Run — expect FAIL.**

Run: `pnpm exec vitest run tests/ArticleCard.test.tsx --no-file-parallelism`
Expected: FAIL — no arrow element.

- [ ] **Step 8: Add the read arrow to `ArticleCard.tsx`.** Inside the card's `<div className="p-4">`, after the summary, add:

```tsx
        <span aria-hidden="true" className="mt-2 inline-block text-sm font-bold text-kinnso-orange">→</span>
```

- [ ] **Step 9: Run — expect PASS.**

Run: `pnpm exec vitest run tests/ArticleCard.test.tsx --no-file-parallelism`
Expected: PASS.

- [ ] **Step 10: Typecheck + commit.**

Run: `pnpm exec tsc --noEmit` → PASS

```bash
git add lib/articles/queries.ts "app/[locale]/articles/[category]/[url]/page.tsx" components/ArticleCard.tsx tests/articles.fallback.test.ts tests/ArticleCard.test.tsx
git commit -m "feat(phase4): article cross-locale fallback + read affordance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Strand C — Travelpayouts go-live (live ops, controller-run)

Executed by the controller (me) via Supabase MCP against `scryfkefedzuetfdtrvl` — **not** a subagent, **not** TDD. Audit first; do only what's missing. Env vars are already in Vercel.

- [ ] **Step 1: Audit live state.** Via Supabase MCP `list_migrations` (is `20260622153645_seed_travelpayouts_offers` applied?) and `execute_sql`:

```sql
select (select count(*) from auth.users where email = 'ops-system@kinnso.internal') as ops_user,
       (select count(*) from public.kinnso_ops_members where status = 'active') as active_ops_members,
       (select count(*) from public.missions where mission_source = 'travelpayouts' and status = 'published') as tp_offers,
       (select count(*) from public.affiliate_network_programs where network = 'travelpayouts') as tp_programs;
```

- [ ] **Step 2: Create the ops auth user if missing.** Only if `ops_user = 0`. Run via `execute_sql` (uses pgcrypto, already available on Supabase):

```sql
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  'ops-system@kinnso.internal', crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false
where not exists (select 1 from auth.users where email = 'ops-system@kinnso.internal');
```

(Service account; never logs in — it only supplies `created_by_ops_member_id`.)

- [ ] **Step 3: Apply / re-run the seed migration.** If `list_migrations` shows it unapplied, `apply_migration` with the contents of `kinnso-v3/supabase/migrations/20260622153645_seed_travelpayouts_offers.sql`. If already applied but offers were 0 (ops user only just created), re-run the seed body via `execute_sql` (it's idempotent — `on conflict` upserts) so the `where exists (active ops member)` guard now inserts the 8 offers.

- [ ] **Step 4: Verify the data.** Re-run the Step-1 audit query. Expected: `ops_user=1`, `active_ops_members>=1`, `tp_offers=8`, `tp_programs=8`.

- [ ] **Step 5: Smoke the live Vercel deploy.** Determine the production URL (`vercel` project / the kinnso deploy). Confirm `/<locale>/studio/offers` is creator-gated (anon → redirect to sign-in is expected; that proves routing, not the catalog). Document that the **catalog + "Generate link" (no Setup-pending)** must be confirmed while signed in as a creator — note exactly which check needs the owner's logged-in session, and report the DB-verified offer count as proof the catalog is live. Do **not** paste any Travelpayouts secret.

- [ ] **Step 6: No commit** (live-ops only; the seed file already exists in the repo). Record results in the Task 12 report.

---

## Task 12: Final gate, live smoke, finish (controller-run)

- [ ] **Step 1: Full gate** from `kinnso-v3/apps/web` (after `pkill -f vitest` if loaded):

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm exec vitest run \
  tests/i18n.locale-parity.test.ts \
  tests/creators.queries.test.ts \
  tests/kinnso.MissionDetailView.test.tsx \
  tests/merchant.mission-detail.host.test.tsx \
  tests/kinnso.MerchantMissionsView.test.tsx \
  tests/kinnso.MissionPostWizard.test.tsx \
  tests/kinnso.CreatorMatchCard.test.tsx \
  tests/about.host.test.tsx \
  tests/contact.host.test.tsx \
  tests/kinnso.Footer.test.tsx \
  tests/creator-terms.host.test.tsx \
  tests/articles.fallback.test.ts \
  tests/ArticleCard.test.tsx \
  --no-file-parallelism
pnpm build
```

Expected: tsc clean, lint 0 errors, all listed tests pass, build exit 0.

- [ ] **Step 2: Push the branch + open the PR** (base `main`). PR body summarizes strands A/B/C, the deliberate decisions (Footer Contact re-added vs Phase 1; creator-terms English body; Strand C verification caveat), and the live DB-verified offer count. End the PR body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: Update memory** `kinnso-v3-reorg-roadmap.md`: Phase 4 → IMPLEMENTED (+ PR link, live-ops results, gotchas); Phase 5 → NEXT.

---

## Self-review (controller checklist before execution)

**Spec coverage:** A1 real names → Task 3 (+ helper Task 2); A2 post-success → Task 5; A3 empty-state → Task 4; A4 `?creator=` → Task 6. B1 About → Task 7; B2 Contact → Task 8; B3 terms → Task 9; B4 article fallback + affordance → Task 10. C Travelpayouts → Task 11. i18n surface → Task 1. Gates/finish → Task 12. ✅ All spec sections mapped.

**Cross-task type consistency:** `getCreatorPublicNames` / `CreatorPublicName` (Task 2) consumed in Task 3. `MissionDetail.creatorHandle` added in Task 3 view + host together. `SubmitResult.missionId` (Task 5) matches the host's `createMissionAction` return (`{ ok: true; missionId }`). New i18n keys (Task 1) referenced by Tasks 3,4,5,7,8,9,10 are all defined in Task 1. ✅

**Existing-test interactions captured:** Footer test Contact assertion flip (Task 8 Step 6); MissionPostWizard "disabled after success" test rewrite (Task 5 Step 1a); merchant detail host fake-name assertion + new creators mock (Task 3 Step 5); CreatorMatchCard href (Task 6 Step 1). ✅

**Ordering:** Task 1 (i18n) first; Task 2 before Task 3; Tasks 4–10 independent after Task 1; Tasks 11–12 controller-run last. ✅
