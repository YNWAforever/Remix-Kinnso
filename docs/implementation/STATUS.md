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

**Slice S2 — close the page-gate holes**, so any task-first UI can trust the role it is
handed. Verified during inventory:

- `app/[locale]/merchants/dashboard/post/page.tsx` has **no page-level gate at all** and
  is reachable by any signed-in user.
- Five further role-scoped routes use ad-hoc `supabase.auth.getUser()` instead of the
  central guards: `studio/guides`, `studio/sessions`, `studio/scan`,
  `merchants/dashboard/missions`, `merchants/dashboard/bookings`.

Bind them to `requireMerchantPage` / `requireCreatorPage` in `lib/admin/guard.ts`, using
`tests/admin.guard.test.ts` as the established mocking pattern. Small, fully local,
directly testable.

See `PHASE-BACKLOG.md` for the ranked remainder, including the **ops-member deletion
bug** (`BASELINE-VERIFICATION.md` §3.3), which is the highest-severity finding of Phase 0
and is *not* a frontend concern.
