# STATUS — Kinnso phased implementation

> **Continuation entry point.** To resume: read the master plan, then this file, then
> `CURRENT-STATE.md`. Reconcile the current `HEAD` before doing anything else — the
> handover branch for this session was 36 commits stale, and that is the single most
> expensive mistake available here.

| | |
|---|---|
| **Phase** | 0 complete (source portion) · 1 in progress |
| **Source revision** | `e086fbfc4e2bc4447dc9bbbe71af1290c866adaf` (== `origin/main`) |
| **Working branch** | `claude/phase01-canonical-frontend` |
| **Preserved branch** | `claude/kinnso-phased-implementation-42478b` @ `87f62693` (superseded; nothing unique) |
| **Real preview location** | **none** — no deployment was made or attempted |
| **Last updated** | 11 September 2026 |

---

## Completed

### Phase 0 — reconcile, preserve, establish the baseline

- **Branch reconciliation.** Proved file-by-file that all 7 handover-branch commits are
  superseded by `origin/main`, which carries 36 commits of missing product work
  (R7.6 → R13.0). Re-based onto `origin/main` without discarding anything.
  → `CURRENT-STATE.md` §1
- **Environment.** Node/pnpm/Docker verified; local Supabase stack started with all
  **146/146 migrations applied**. → `CURRENT-STATE.md` §2, §4.1
- **Baseline gates.** `install`, `typecheck`, `lint`, `honesty:lint` all **PASS**.
  `pnpm test` characterised in full, including why it cannot pass on a clean checkout.
  → `BASELINE-VERIFICATION.md`
- **Subsystem inventory.** Eleven read-only inventories (identity/auth, discovery,
  saves, i18n, missions, offers/visits, earnings, schema/RLS, frontend shell, AI/jobs,
  tests/CI) reconciled into a corrections list. → `CURRENT-STATE.md` §5

### Phase 1 — slice S1: return-to-task sign-in continuation

Plan acceptance stories **#3** (bookmark vs adopt) and **#20** (same-origin sign-in
returns to safe intent).

**The defect.** The consumer half of the `?next=` contract was fully built and hardened —
`safeNext` (`lib/auth/safe-next.ts:17`) rejects absolute, scheme-relative, backslash,
control-character and cross-locale values, and `app/[locale]/sign-in/page.tsx:34` reads
and honours it. **No producer existed.** Every entry point emitted a bare sign-in URL:

- `proxy.ts:44` explicitly wiped the query (`url.search = ''`) and `gate.ts:46` returned a
  bare `/${locale}/sign-in`, so every gated deep link lost its destination.
- `GuideSaveButton.tsx:24` and `ExperienceSaveButton.tsx:24` pushed `/${locale}/sign-in`
  with no destination memory, so an anonymous viewer who clicked "Sign in to save" was
  returned to a hub and the save was silently abandoned.

**The change.**

| File | Change |
|---|---|
| `lib/auth/return-path.ts` | **new** — `signInHref(locale, returnTo)` and `currentReturnPath()` |
| `lib/auth/gate.ts` | `gateDecision` takes an optional `search` and emits a validated `?next=` |
| `proxy.ts` | passes `req.nextUrl.search`; resolves the location as a relative URL instead of wiping the query |
| `components/kinnso/GuideSaveButton.tsx` | anon click carries the current guide as `next` |
| `components/kinnso/ExperienceSaveButton.tsx` | same for experiences |

**Design decisions worth keeping.**

1. *The producer validates with the consumer's own function.* `signInHref` runs every
   candidate through `safeNext` itself, so the two halves can never disagree — a producer
   that emitted something the consumer rejects would create a dead end that looks like a
   bug and reads like a security control.
2. *Rejected destinations degrade to the bare sign-in page,* never to a sanitised guess.
3. *`currentReturnPath()` reads `window.location` in the click handler rather than calling
   `useSearchParams()`.* Per the bundled Next.js 16 docs, `useSearchParams` in a
   prerendered route forces the tree up to the nearest `<Suspense>` boundary to be
   client-side rendered; the guide and experience routes are prerendered, so a hook would
   have cost real prerendering to obtain data a click handler already has.
4. *Destinations that are not decode-stable are dropped.* `safeNext` decodes once and
   Next decodes `searchParams` once, so a literal `%` would arrive corrupted
   (`?q=100%25` → `?q=100%`). Reflecting a subtly wrong URL is worse than not reflecting
   one. This is asserted by a test rather than left as a comment.

**Proof.** `tests/auth.return-path.test.ts` (new) asserts the producer→consumer round trip
across all 7 locales and that hostile inputs degrade. `tests/auth.gate.test.ts` extended
for query preservation and round-trip. `tests/kinnso.guide-save-button.test.tsx` extended.
Focused run: **7 files, 70 tests, all pass.** `typecheck`/`lint`/`honesty:lint` **PASS**.

### Phase 1 — slice S2: honest failure state for discovery

Plan acceptance stories **#2** (absent destination → true empty, distinguish an API
failure) and **#18** (an injected read failure stays an error with retry, never demo and
never a false empty). Both are **Phase 1 exit-gate items**.

**The defect.** `lib/guides/queries.ts:34` destructured only `data`, discarding the
PostgREST error. `/explore` is statically regenerated every 300s across 7 locales, so one
failed regeneration served a cheerful "no guides yet" catalogue for five minutes per
locale — unlogged, unretryable, and indistinguishable from an empty database. The same
`Promise.all` already awaited `getPublishedDestinations`, which *throws*: two opposite
failure contracts on one route.

**The change.**

| File | Change |
|---|---|
| `lib/guides/queries.ts` | `getPublishedGuides` surfaces the query error |
| `app/[locale]/page.tsx` | homepage opts into degrading via the repo's own `optionalQuery`, which **records** the failure |
| `app/[locale]/explore/error.tsx` | **new** — the same one-line localized boundary already used by `g/[slug]` and `experiences/[slug]` |

The homepage keeps the opposite contract deliberately: one band of ten degrading to hidden
is reasonable where an empty catalogue *page* is not. The difference is now explicit and
logged rather than invisible, matching the `.catch()` already on the articles band.

Reusing `DetailRouteError` meant **no new i18n keys** — the localized `detailError` copy
("We couldn't load this page" / "Try again") already exists in all 7 locales, and it
supplies a real `reset()`. The locale-level fallback boundary's copy is hardcoded English,
so this is also a small localization improvement.

**Proof.** 58 tests across `guides.queries`, `explore.host`, `home.host`, `home.queries`.
New cases assert `/explore` propagates **both** read failures, that a genuinely empty
catalogue still renders as empty, and that the homepage still degrades *and logs*.

### Phase 1 — slice S3: converge role gates on the central guards

**The defect.** 43 role-scoped pages already used
`requireOpsPage` / `requireMerchantPage` / `requireCreatorPage`. **Ten
re-implemented the check** with a bare `auth.getUser()`, so what a route meant by
"creator" or "merchant" varied per file — and a task-first UI cannot be built on a role it
cannot trust.

| Route | Was | Now |
|---|---|---|
| `merchants/dashboard/post` | **no gate at all** beyond `isLocale`, and **no test** | `requireMerchantPage` + 6 host tests |
| `merchants/dashboard/missions` | non-merchant saw the merchant UI with an empty list | 404, like every sibling |
| `merchants/dashboard/bookings`, `missions/[missionId]` | extra `getMerchantProfile` round trip | id taken from the authorization context |
| `studio/guides/{,new,[id]/edit}`, `studio/sessions/{,new,[id]/edit}` | any signed-in user | active creator, else → `/creator` |

**Scope the `post` finding accurately: it was never privilege escalation.** The proxy
gates the `/merchants/dashboard` prefix for anonymous visitors, and
`createMissionAction` (`lib/missions/actions.ts:225-239`) independently re-derives
authority. The real defect was role consistency — a traveller or creator was served the
merchant brief wizard and only discovered it was not for them at submit time.

`requireCreatorPage` gained a third denial mode, `'creator'` → redirect to `/creator`.
That **preserves** `studio/guides/new`'s existing behaviour rather than flattening it to a
404: every sign-up gets a blank `creators` row, so a session alone is not a creator, and
404ing someone mid-application strands them behind a page they are entitled to reach. The
guard's own docblock says it exists to preserve per-page behaviour rather than unify it.

**Deliberately not changed** — these are intentional, not holes:
`studio/scan` (documented anon→demo path behind a `demoBanner`, pinned by a test);
`studio/page.tsx` (a role-routing hub); `creator/page.tsx` and `ops/accept-invite`
(reached by people legitimately not yet that role).

Three host tests mocked the raw Supabase client, which fed the guard's role lookups from a
single `maybeSingle` stub and made each page's gate depend on its content fixture. They now
mock `@/lib/admin/guard`, matching the `studio.perks` precedent.

**Proof.** 152 files / 870 tests pass across studio, merchant, admin, auth and a11y.

---

## Not done / explicitly out of scope this session

- **No deployment, no production access, no migration applied anywhere but a local
  ephemeral container.** No provider call (Travelpayouts / Stripe / AI gateway).
- **No browser or E2E evidence.** `apps/e2e` NOT RUN. Plan story #21 (viewports, native
  200% zoom, keyboard, screen reader) is **NOT RUN**. The S1 slice therefore has unit and
  component proof but **no browser-level proof**.
- **`pnpm build` NOT RUN.**
- **No AdventureLog code was ported.** The canonical app contains none and has no
  `LICENSE`; porting the Site's `imagePins.ts` would introduce a GPL obligation. That is
  an owner decision — see `CURRENT-STATE.md` §5.1.
- **`BOOKING_LIVE` remains `false`.** Untouched.

---

## Next task (concrete)

**Slice S4 — surface the two dark visit-loop routes and stop swallowing failures.**
`/merchants/dashboard/redeem` and `/merchants/dashboard/offers` are **not linked from any
navigation surface**, so merchant staff cannot reach the redemption scanner from the
product at all. In the same area, `OfferClaimCard` renders nothing when a claim fails
(cap reached / already claimed / not live all look identical), and
`lib/offers/redeem-actions.ts:37` revalidates the unlocalized
`/merchants/dashboard/offers`, which is not a real route — so merchants see stale offers
after a redemption.

All three are local, bounded and testable, and the live offer suites
(`offers.rls.test.ts`, `offers-attribution.rls.test.ts`) already exist to verify against —
though see `BASELINE-VERIFICATION.md` §3.2 before trusting a live-DB run on this machine.

Then **B4** (save failures are silently swallowed and untranslated), which pairs naturally
with the S1 work already landed.

See `PHASE-BACKLOG.md` for the ranked remainder. The highest-severity finding overall
remains the **ops-member deletion bug** (`BASELINE-VERIFICATION.md` §3.3) — it needs a
migration and a product decision about mission ownership, and is *not* a frontend concern.
