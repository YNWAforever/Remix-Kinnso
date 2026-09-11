# STATUS — Kinnso phased implementation

> **Continuation entry point.** To resume: read the master plan, then this file, then
> `CURRENT-STATE.md`. Reconcile the current `HEAD` before doing anything else — the
> handover branch for this session was 36 commits stale, and that is the single most
> expensive mistake available here.

| | |
|---|---|
| **Phase** | 0 complete (source portion) · 1 in progress · 2 slice 0 landed and tested |
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

### Phase 1 — slice S4: make the visit loop reachable and honest

Three defects in the R12.0 visit loop.

1. **`/merchants/dashboard/offers` and `/merchants/dashboard/redeem` were linked from no
   navigation surface at all.** The dashboard home renders a fixed eight-card grid and
   neither route was in it, so merchant staff could not reach the in-store redemption
   scanner from the product — the visit loop was completable only by typing the URL.
2. **`OfferClaimCard` silently swallowed every failed claim.** The handler had no `else`
   branch: cap reached, already claimed and no-longer-live all rendered nothing, so the
   button appeared to stop responding. It now states the outcome in a `role="alert"`.
   The *reason* stays server-side — it would leak another visitor's claim state and the
   merchant's remaining capacity — and a failed claim still records no `offer_claimed`
   event, which is asserted.
3. **`revalidatePath` was unlocalized in three places**, not one (`redeem-actions.ts`
   plus two in `merchants/offers-actions.ts`). Every real route is
   `/[locale]/merchants/dashboard/offers`, so it matched no cache entry and merchants saw
   a stale offer list after a redemption or an offer edit.

**i18n cost, as predicted by B14.** Five keys × 7 locales. They are inserted after a
stable anchor because `i18n.locale-parity.test.ts` compares key-path **arrays** with
`toEqual` — position matters, not just presence.

**Proof.** 58 tests across `OfferClaimCard`, the new `MerchantDashboardHomeView` suite
(the view had none), locale parity, offers actions and the merchant post host.

### Phase 1 — slice S5: honest save failures, and re-auth on an expired session

`GuideSaveButton` / `ExperienceSaveButton` only mutated state when `result.ok`, so every
failed save rendered **nothing at all** — the button appeared to stop responding. The
action's message was untranslated English, so surfacing it as-is would have shown English
to all 7 locales.

**Why this needed more than an if-else.** The two failures call for opposite responses.
A rejected write should leave the viewer in place with a retry. But `signedIn` is computed
at **server render**, so a session that lapses before the click produces a failure that is
really a sign-in — and plan §6.4 requires that case to *"clearly ask for
re-authentication"*, not report a broken save.

Telling them apart by matching the English message text would break the moment that copy
is reworded, so `lib/saves/result.ts` adds `SaveOutcome` with an explicit
`reason: 'auth' | 'failed'`. `errors` is carried through unchanged so the shape stays
readable to existing `ActionFailure` consumers; `reason` is purely additive. Named
`SaveOutcome`, not `SaveResult`, because four admin components already alias `SaveResult`
locally to a plain `ActionResult<{id}>`.

An expired session routes through `signInHref` / `currentReturnPath` — **the producer
added in slice S1** — so the viewer re-authenticates and lands back on the guide or
experience they were saving. Stories **#3**, **#20** and §6.4 meet here.

**Proof.** 29 files / 236 tests. The eight updated assertions in the save-action suites
are deliberate contract churn — they pinned the failure shape with `toEqual` and the shape
is what this extends. The case most worth having: a failed save never flips the button to
"Saved" and never calls `router.refresh()`, because only server evidence marks a save as
saved.

### Phase 1 — slice S6: pin line endings (B8)

Not a feature, but the thing that made every other verification claim harder than it
needed to be: **the suite was silently not reproducible off Linux.** 14 tests across 11
files failed on any Windows checkout because they `readFileSync` a tracked file and assert
LF fragments, while the working tree was CRLF.

The repository had **no `.gitattributes`**, so working-tree encoding was decided by
whatever `core.autocrlf` a contributor happened to have. CI runs on Linux and never saw
it — the worst shape for this kind of defect, because anyone hitting it would reasonably
assume they had broken something.

**The risk worth ruling out was whether this changed committed content. It did not:**

- All 1566 index entries were already `i/lf` (`git ls-files --eol`).
- `git add --renormalize .` staged zero blobs.
- worktree↔index, index↔HEAD and worktree↔HEAD diffs are **all empty**.
- The only staged file is `.gitattributes` itself.

**Result: 97 tests across the 11 files now pass — 14 failures eliminated.**

Two notes for anyone repeating it. `core.autocrlf=true` here comes from **system** config
(the Git-for-Windows default), not user or repo config — which is exactly why a
repository-level `.gitattributes` is the right fix rather than a machine-wide change. And
converting an *existing* working tree in place leaves the index stat cache stale, so
`git status` reports every file modified while `git diff` shows nothing; `git add .` clears
it and stages nothing. A fresh clone never sees this.

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

## Phase 1 exit gate - where it actually stands

> **Updated after the completion pass.** Four of the five items were already met; the fifth
> (a real signed-out journey) now has browser evidence, and the navigation item has an audit
> behind it instead of an impression. See `VERIFICATION.md` and `ROUTE-CONTINUITY.md`.

| Exit-gate item | State after the completion pass |
|---|---|
| Hong Kong / absent searches remain truthful | **Met** - and now browser-confirmed: the catalogue rendered a true empty state before seeding, real cards after. |
| merchant/creator/ops routes reject unauthorized actors | **Met** - ten gates converged; `privacy.merchant-scoping.test.ts` now also pins that queries scope by the guard's server-derived id, never a browser value. |
| saves persist across sessions | **Met**; failures are visible and an expired session re-authenticates back to the saved item. |
| all retained navigation has an explicit destination | **Met for the audited set.** `ROUTE-CONTINUITY.md` covers every route pattern with actor, gate, link source and disposition. It found one real gap (F1, `/admin/missions/[missionId]` reachable by nothing) which is now fixed and pinned. |
| signed-out and signed-in journeys work against the authorized test backend | **Signed-out: met** (browser). **Signed-in: still host/component tests only** - no authenticated browser session was established. |

### Story 21

Three viewports (390x844, 768x1024, 1440x900) **PASS** at 100% zoom, anonymous, on
`/explore`. Native 200% zoom, keyboard-only, screen reader, reduced motion, mobile safe
areas and real iOS/Android remain **NOT RUN** - CSS emulation does not establish them.

---

## Original assessment (kept for the record)



Plan section 6's exit gate, item by item, with evidence rather than a verdict.

| Exit-gate item | State |
|---|---|
| Hong Kong / absent searches remain truthful | **Met** - S2. A failed read is an error with retry, a true empty renders empty, and the two are distinguishable. |
| merchant/creator/ops routes reject unauthorized actors | **Met** - S3. Ten ad-hoc gates converged on the central guards; the ungated route is gated. |
| saves persist across sessions | **Met** (pre-existing); S5 made failures visible instead of silent. |
| all retained navigation has an explicit destination | **Improved, not audited.** S4 surfaced the two dark visit-loop routes. A route-by-route audit has **not** been done. |
| signed-out and signed-in journeys work against the authorized test backend | **Partially.** Verified at unit and component level against a local stack. **No browser run exists**, so this is not evidence of a working journey. |

### Genuinely still open in Phase 1

1. **Section 6.1 - port the three shells, compact home and mobile Explore/Trips/Record/Me
   nav.** The largest remaining item and a design-led change, not a refactor. It depends on
   the approved Site source, which was **never downloaded** this session
   (`CURRENT-STATE.md` section 7). Nothing here should be improvised from memory.
2. **Section 6.5 - typed live/demo/unavailable capability adapters.** Deliberately not
   built. The app already has `product-state-config`, `optionalQuery` and honest error
   states; an adapter framework on top risks exactly the duplication the Phase 0 synthesis
   ranked as the number-one Phase 1 risk. Worth an explicit decision first.
3. **Section 6.6 / story 16 - prove private server rendering leaks nothing.** No test
   asserts that a merchant cannot reach another merchant's data through serialized props,
   JSON or a shared cache. That verification is missing.
4. **Story 21 - viewports, native 200% zoom, keyboard, screen reader.** NOT RUN.

**So Phase 1 is not complete.** Four of five exit-gate items are met; the fifth needs a
browser, and three implementation items remain, two of which want an owner decision before
any code is written.

---

## Phase 2 — slice 0 (personal trips, authored-only)

**Landed.** Migration `20260911090000_p2_0_personal_trips.sql` adds `places`, `trips`,
`trip_days`, `trip_stops`, `trip_revisions`, the `trip_stops_resolved` view and
`upsert_place()`. It touches **zero existing objects**, so rollback is a drop in reverse
dependency order and no existing behaviour can regress. **Applied to the local ephemeral
container only — no hosted environment.** Reasoning and deferred owner decisions:
`ADRs/0001-phase-2-trips-and-versions.md`.

**Exit-gate item met:** isolation is now demonstrated with *separate accounts and direct API
attempts* — `apps/web/tests/trips.rls.test.ts`, 15 tests, two signed-in travellers going
straight at PostgREST. Two grant assertions are **mutation-verified** (widening the column
grant makes them fail). One of them originally passed for the wrong reason — the CHECK
constraint refused the payload so the grant was never exercised; see ADR §4a, which
generalises the trap for the remaining slices.

**Not yet built:** journals, immutable public versions, the adoption RPC, and any trip UI.
Adoption is deliberately data-only for now because every guide in the database is
summary-only, so structured adoption has nothing to adopt (ADR §2).

---

## Next task (concrete)

**Phase 2 slice 1 — the trip write path.** Slice 0 is schema and proof; nothing in the app
can create a trip yet. The next reviewable vertical slice is the definer RPCs that mint
revisions (`head_revision_no` is ungrantable precisely so they must exist), plus a minimal
authenticated trip page. That is the smallest change that turns a proven schema into
something a traveller can use.

Before it, one blocking prerequisite: **`packages/db` types do not know the `trip_*`
tables**, which is why the new suite uses untyped clients. Regeneration must use `--local`,
not the `--linked` script — this session has no production access.

The highest-severity finding overall remains the **ops-member deletion bug**
(`BASELINE-VERIFICATION.md` §3.3) — a `DELETE` on `kinnso_ops_members` aborts with a check
violation because `ON DELETE SET NULL` contradicts `missions_check`. It needs a migration
and a product decision about mission ownership, and is *not* a frontend concern.

See `PHASE-BACKLOG.md` for the ranked remainder.

### Before extending the branch further

**Thirty-two commits are unpushed.** The GitHub connector is not authenticated in this
session, so opening a PR needs either explicit authorization to push or the owner doing it.
The branch now spans identity, discovery, role gates, the visit loop, saves, the build and a
new Phase 2 schema — review before it grows further is the cheaper order, and the Phase 2
migration in particular should be reviewed before anyone considers applying it anywhere
hosted.
