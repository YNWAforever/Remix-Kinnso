# PHASE-BACKLOG — ranked, evidence-backed

Every item below was observed in source or in the live local database at `e086fbfc`.
Nothing here is speculative. **UNBLOCKED** items need no external authorization;
**BLOCKED** items name the missing authorization.

---

## P0 — correctness defects with a user- or operator-visible failure

### B1. An ops member who created a Travelpayouts mission cannot be deleted — **UNBLOCKED**

`missions_check` requires `created_by_ops_member_id IS NOT NULL` **and**
`affiliate_network_program_id IS NOT NULL` for `mission_source='travelpayouts'`, while both
FKs are `ON DELETE SET NULL`. Deleting either parent therefore aborts with
`new row for relation "missions" violates check constraint "missions_check"`.

Two distinct latent failures (ops-member delete; affiliate-program delete). Reproduced by
`tests/mission.rls.test.ts` against the live local stack. Evidence:
`BASELINE-VERIFICATION.md` §3.3.

*Fix requires a product decision* — `ON DELETE RESTRICT` with a handled application error,
or relaxing the check, or soft-deleting ops members. Additive migration + RLS test.
**Do not apply to production without authorization for that specific scope.**

### B2. Silent false empty on the highest-traffic surface — ✅ **FIXED** (slice S2)

Fixed in `fix(web): stop /explore reporting a failed catalogue read as "no guides"`.
`getPublishedGuides` now surfaces the error; the homepage opts into degrading through
`optionalQuery` so the choice is explicit and logged; `/explore` gained the localized
`DetailRouteError` boundary. See `STATUS.md`.

**Residual, not fixed:** `getGuidesForSitemap` (`lib/guides/queries.ts:67`) still discards
its error, so a failed read silently emits a sitemap with zero guides. Same class of bug,
different blast radius (SEO rather than UI) — deliberately left out of that slice to keep
it coherent. Original description follows.

---

### B2 (original). Silent false empty on the highest-traffic surface

`lib/guides/queries.ts:26-36` destructures `const { data } = await query`, discarding the
PostgREST error. `/explore` is statically generated with `revalidate = 300` across 7
locales, so **one failed regeneration caches a cheerful empty catalogue for five minutes
per locale** with no error state. `lib/destinations/queries.ts:60` already has the correct
rethrow-except-`PGRST205` contract to converge on.

Directly contradicts plan stories **#2** (absent destination → true empty, distinguish an
API failure) and **#18** (a failed live search stays an error, never a false empty).

### B3. `merchants/dashboard/post` has no page gate — ✅ **FIXED** (slice S3)

Fixed in `refactor(web): converge role-scoped pages on the central page guards`, together
with the nine other role-scoped routes that re-implemented their own check. Original
description follows.

---

### B3 (original). `merchants/dashboard/post` has no page gate

`app/[locale]/merchants/dashboard/post/page.tsx:12-23` checks only `isLocale`. There is no
`requireMerchantPage` call.

**Scope this accurately — it is not privilege escalation.** Two controls still hold:
`gateDecision` gates the `merchants/dashboard` prefix, so an *anonymous* visitor is
redirected to sign-in; and `createMissionAction` (`lib/missions/actions.ts:225-239`)
independently re-derives authority, returning `formError('Merchant profile is required')`
or `formError('Active ops member access is required')`. A non-merchant therefore **cannot
create a mission**.

The real defect is role consistency: any signed-in traveller, creator or ops user is
served a merchant-only wizard and only discovers they cannot use it at submit time. Five
further role routes (`studio/guides`, `studio/sessions`, `studio/scan`,
`merchants/dashboard/missions`, `merchants/dashboard/bookings`) use ad-hoc
`supabase.auth.getUser()` rather than the central guards, so role is not uniformly
trustworthy for a task-first UI. This is **slice S2**, the next task in `STATUS.md`.

---

## P1 — honesty and recoverability

### B4. Save failures are silently swallowed — ✅ **FIXED** (slice S5)

Fixed in `fix(web): tell the traveller when a save fails, and re-auth an expired
session`. `lib/saves/result.ts` adds a `reason: 'auth' | 'failed'` discriminator so an
expired session re-authenticates through `signInHref` and returns to the guide or
experience (plan §6.4), while a rejected write shows localized copy and lets the viewer
retry. A failed save never flips the button to "Saved". Original description follows.

---

### B4 (original). Save failures are silently swallowed

`GuideSaveButton` / `ExperienceSaveButton` only mutate state when `result.ok`; a failed
save renders nothing at all. The action's message is also untranslated English
(`formError('Guide could not be saved')`), so even once surfaced it would not be localized.

### B5. A claim's QR is unrecoverable after 5 minutes — **STILL OPEN**

Not addressed by slice S4, which fixed the *claim* failure path, not the
*post-claim* recovery path. The cookie is still `path: '/'` with a 300s life and
the raw token is still unrecoverable afterwards.

The raw claim token lives only in a 300-second cookie (`lib/offers/actions.ts:45-52`,
`path: '/'`), while the claim stays valid until the offer's `valid_to` — possibly weeks.
Only the sha256 hash is stored, so the page hard-404s afterwards with no recovery.

Immediately shippable: render the token as selectable text so manual entry works, and
scope the cookie to the claim path rather than `/`. The underlying recovery/reissue policy
needs a schema decision (plan §10.1.2) and is **BLOCKED on a product decision**, not access.

### B6. Broken cache invalidation after redemption — ✅ **FIXED** (slice S4)

Fixed in `fix(web): make the visit loop reachable and stop swallowing claim failures`.
It was wrong in **three** places, not one: `redeem-actions.ts` plus two in
`merchants/offers-actions.ts`. All now loop `LOCALES` and revalidate the real
locale-prefixed routes. Original description follows.

---

### B6 (original). Broken cache invalidation after redemption

`lib/offers/redeem-actions.ts:37` calls `revalidatePath('/merchants/dashboard/offers')`,
but every real route is `/[locale]/merchants/dashboard/offers`. The revalidated path does
not exist, so merchants see stale offers.

### B7. `/merchants/dashboard/redeem` and `/offers` are unreachable — ✅ **FIXED** (slice S4)

Both are now cards on the merchant dashboard home, pinned by a new
`kinnso.MerchantDashboardHomeView.test.tsx` (the view had no test at all).
Original description follows.

---

### B7 (original). `/merchants/dashboard/redeem` and `/offers` are unreachable

Neither route is linked from any navigation surface. Merchant staff cannot reach the
redemption scanner from the product.

---

## P2 — reproducibility and design-system integrity

### B8. The test suite is not reproducible on Windows — ✅ **FIXED** (slice S6)

Fixed by adding `.gitattributes` with `* text=auto eol=lf` plus explicit `binary` for the
3 binary assets. **Zero committed content changed** — all 1566 index entries were already
`i/lf`; only the *working tree* was CRLF. Verified by all three git comparisons
(worktree↔index, index↔HEAD, worktree↔HEAD) being empty, and the single staged file being
`.gitattributes` itself.

**Result: the 11 affected files now pass — 97 tests, 14 failures eliminated.**

Two things worth knowing for anyone repeating this:

- `core.autocrlf=true` here comes from **system** config (the Git-for-Windows installer
  default), not the user's global or repo config. The `.gitattributes` overrides it for
  this repository without touching a machine-wide setting, which is why that was the right
  fix rather than changing config.
- Converting an *existing* working tree in place leaves the index stat cache stale, so
  `git status` reports every file modified while `git diff` shows nothing. `git add .`
  clears it and stages nothing, because there is no content difference. A fresh clone
  never sees this — checkout applies the attribute directly.

Original description follows.

---

### B8 (original). The test suite is not reproducible on Windows

No `.gitattributes`; with `core.autocrlf=true` the working tree is CRLF while the tests
assert LF, failing 14 tests across 11 files. Fix: pin `*.sql`, `*.yml`, `*.ts`, `*.tsx` to
`eol=lf`. **Must be its own PR** — it rewrites line endings repo-wide and would otherwise
bury a feature diff. Evidence: `BASELINE-VERIFICATION.md` §3.1.

### B9. `--color-kinnso-line` is undefined — **UNBLOCKED**

`border-kinnso-line` is used in ~20 places; the token does not exist, so under Tailwind v4
those borders render as nothing. Either define it or sweep the usages.

### B10. 13 of 18 `components/ui` primitives are dead source — **UNBLOCKED**

Unreferenced, and every CVA variant references shadcn CSS variables defined nowhere in the
repo. Either wire them to real tokens or delete them; leaving them invites a future slice
to adopt a primitive that silently renders unstyled.

### B11. hreflang over-advertises — **UNBLOCKED**

All `build*Metadata` helpers pass the full 7-locale tuple, so a single-language guide
advertises six translations that do not exist. Only articles compute this correctly.

---

## P3 — structural risks to call out before building on them

### B12. Earnings cannot express the plan's state machine — **UNBLOCKED to model, BLOCKED to activate**

`mission_settlements.creator_payout_status` is constrained to exactly `('pending','paid')`
— 2 of the plan's 8 states (§10.3). There is **no reservation of any kind**:
`creator_payout_batches` has no settlement linkage, so marking a batch paid flips no
settlement. `/studio/earnings` can therefore show a batch "Paid" beside settlements still
"pending". Any earnings UI built before this is modelled will misrepresent money.

### B13. No durable job queue — **UNBLOCKED to build, needs a design decision**

All background work is unawaited in-process promises in a single Hono worker; a redeploy
strands the row until a 15-minute sweeper marks it failed. Plan §8 (phase 3) depends on this.

### B14. Every new user-facing string is a 7-file edit — **UNBLOCKED, but plan for it**

`tests/i18n.locale-parity.test.ts` enforces recursive dotted-key-path equality across all
7 locales and hard-fails on a single English-only key. Budget for it in every slice that
adds copy.

---

## Blocked on external authorization

| Item | Missing authorization |
|---|---|
| Verify applied production schema / grants / RLS | Read access to the hosted Supabase project |
| Confirm what is actually deployed | Authorized read-only deployment inventory |
| Travelpayouts programme IDs | Real approved programme configuration; catalogue `tp-<slug>` values are placeholders |
| Any migration in production | Explicit authorization for that specific migration |
| Real invitations, campaign activation, payouts | Explicit per-scope authorization |
| Native booking (`BOOKING_LIVE`) | The separate plan §12 readiness gate — **remains off** |
| Open a pull request | The GitHub connector is not authenticated in this session |
| Port AdventureLog map converters | An owner licensing decision — the canonical app has no GPL code and no `LICENSE` today |
