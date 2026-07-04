# R3A-1 Carry-forwards (2026-07-04)

Consolidated from the final holistic review of `feat/revision-r3a1` (8 commits,
`a90f048..6ac8731`). Nothing here blocks this phase's own exit criteria — these are
scoped-out-by-design items and small gaps for whoever picks up R3A-2/R3B next.

## Deliberately deferred (by design, not oversight)

1. **No booking status-transition RPCs yet.** `bookings` and `booking_events` have no
   UPDATE/INSERT-beyond-anon-guest grant for any role — every transition
   (`pending_payment → confirmed/cancelled/completed/refunded`) ships as an audited
   SECURITY DEFINER RPC in R3A-2 (Stripe webhook confirmation) or R3B (ops/merchant
   pipeline actions). This is intentional per the R3 design spec §D-R3-4.
2. **`experience_availability.booked_count` is never incremented anywhere in this
   phase.** No code path in R3A-1 decrements available capacity — that's R3A-2's job,
   whenever a booking is actually created against an availability row (the Checkout
   Session flow). Flagging explicitly so R3A-2's author knows this is still fully open,
   not something already handled.
3. **No public booking UI.** `/experiences/[slug]` still shows the R2 "Booking opens
   soon" state — R3A-2 replaces it with the real booking widget.

## Small gaps worth closing in a follow-up

4. **Availability management isn't gated to `published`-only experiences.** A merchant
   can add/close availability dates for a `draft` or `paused` experience too — RLS
   correctly keeps such rows invisible to the public regardless, so this isn't a
   security issue, just looser than the phase's own "manage availability for their
   *published* experiences" framing. Tighten if that distinction ever matters
   (e.g. pre-loading dates before publish may actually be desirable — worth a product
   call, not just a code fix).
5. **Dead i18n keys**: `colDate`, `colCapacity`, and `errDuplicateDate` are declared and
   translated across all 7 locales but never rendered by any component today.
   `errDuplicateDate` specifically was added assuming the duplicate-date action error
   would route through it, but `availability-actions.ts`'s `formError('A date already
   exists for this experience')` returns hardcoded English directly (matching this
   codebase's existing, repo-wide convention — action-level errors are hardcoded
   English everywhere, not code-mapped). Either wire `errDuplicateDate` into the
   actions layer in a follow-up, or drop the three unused keys.
6. **`packages/db/types.ts`'s hand-patch for the 4 new tables has not been verified
   against a real `pnpm --filter @kinnso/db gen` pass** against a migrated dev/branch
   DB — the `Relationships` arrays were hand-written to match the migration's actual
   FK constraint names (confirmed against the live DB), but should be trued up with a
   real generation pass before anyone relies on embedded-join type inference on these
   tables.
7. **No integration test spans the 11 creator-gated call sites as a set.** Coverage for
   the traveler-role change is at the `resolveViewerRole`/`useViewerRole` unit level
   (verified correct for all 11 sites by direct code reading during the final review),
   but there's no single test that would catch a future regression across all of them
   at once if someone touches the resolver again.
