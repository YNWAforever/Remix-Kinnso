# ADR 0001 — Phase 2 data model: trips, versions and credit

**Status:** accepted for slice 0 (personal trips, authored-only). Later slices depend on
owner decisions listed in §5.
**Date:** 11 September 2026.
**Migration:** `supabase/migrations/20260911090000_p2_0_personal_trips.sql`

---

## 1. Context, verified rather than assumed

Checked against the live local schema (146 migrations applied), not against the plan's
description of it:

- `public.guides` is **flat** — no days, no stops, no version rows. Publishing is an in-place
  `UPDATE`. `guides.slug` is **globally unique**, so it can remain the stable public identity.
- Guide-adjacent tables are only `article_guide_overrides`, `guide_saves`, `guides`.
  Traveller-owned are `traveler_profiles`, `guide_saves`, `experience_saves`, `bookings`.
  There is **no** Place, journal, version, trip, trip-stop or media-asset table.
- `guides.creator_id → creators.id` is **`ON DELETE CASCADE`**.
- Reusable helpers already exist and are used rather than duplicated: `set_updated_at()`,
  `is_active_ops()`, the `app_private` helper pattern, `ops_audit_log_append`, the
  `creator_payout_decisions` idempotency idiom.

## 2. Decision

Build Phase 2 as new tables beside `guides`, reusing `guides` as the eventual publication
container and `guide_saves` **entirely unchanged** as the bookmark.

**Slice 0 is personal trips, authored-only**, and touches **zero existing objects**: no column
added to `guides`, no check widened, no grant revoked, and the publish path untouched.

### Why authored-only first

Every guide in the database today is summary-only, so **structured adoption has nothing to
adopt**. Plan §7.2.5 says exactly this: a summary-only guide stays readable, savable and
linkable, and only "create a blank trip with this guide attached" is available until real stop
data exists. Shipping adoption machinery now would be shipping a feature with no possible
input.

The credit columns on `trip_stops` are nonetheless **present and constrained from the start**,
so adoption later arrives as *data* rather than as a migration rewriting a table travellers
already depend on. In slice 0 every one is `NULL` and `origin` is always `'authored'`.

## 3. Decisions that carry an invariant

| Decision | What it buys | Verified |
|---|---|---|
| **No FK from `trips` to `guides` anywhere** | "Saving is not cloning" becomes structural, not conventional. A trip cannot be a view over a guide. | grep of the migration |
| **Credit is a snapshot, not a join** | `guides.creator_id` is `ON DELETE CASCADE`, so a departing creator takes their guides with them. A live FK would orphan or delete a traveller's stop. The snapshot is the plan's "non-sensitive provenance tombstone", and it is why traveller notes survive withdrawal. | schema inspection |
| **`trip_stops_origin_credit_consistent` CHECK** | An authored stop cannot carry credit; an adopted stop must name its source. | **Tested:** inserting `origin='authored'` with a `source_guide_id` fails. |
| **Credit columns and `origin` excluded from the UPDATE grant** | A traveller edits their own note, time and order; they cannot rewrite who a stop came from, nor promote an authored stop into a credited one. | **Mutation-verified:** granting `update (origin, source_creator_name)` makes the test fail; revoking it makes it pass. |
| **`head_revision_no` excluded from the UPDATE grant** | A client cannot fake a revision and defeat optimistic concurrency. | **Mutation-verified:** granting `update (head_revision_no)` makes the test fail. |
| **Day offsets + `start_minute_of_day`, never stored dates** | Changing the destination timezone rewrites **zero** stop rows and preserves wall-clock intent. | **Tested:** `updated_at` identical before/after a zone change while `starts_at` moved. |
| **`start_date` nullable, not a sentinel** | Undated trips are first-class; "Day 1" renders with `starts_at = NULL`. | **Tested.** |
| **`dst_anomaly` in `trip_stops_resolved`** | A spring-forward 01:30 surfaces as an anomaly instead of being silently shifted an hour. | **Tested:** 01:30 Europe/London on 2030-03-31 → `dst_anomaly = true`. |
| **Timezone validated by BEFORE trigger** | A `CHECK` cannot call `pg_timezone_names` (not IMMUTABLE). Fails at write time, not at read time when it would break a page. | **Tested:** `Mars/Olympus` → `invalid_time_zone`. |
| **`trip_revisions` is metadata-only, append-only** | A jsonb content snapshot would duplicate live rows and become a second place where withdrawn creator text hides from redaction. | **Tested**, and **narrowed in slice 1** — the original guard also blocked referential actions and made trips and accounts undeletable. See §4b. |
| **No anon grant *and* no anon policy on any `trip_*` table** | The privilege layer refuses before RLS is consulted. | **Tested:** all five relations answer anon with an *error*, not an empty set. |
| **`trip_stops_resolved` uses `security_invoker`** | The view is filtered by the caller's own RLS, not the view owner's privileges. | **Tested:** traveller B reads nothing through the view. |

## 4. Known trade-off, discovered by testing

`trip_days_trip_offset_uniq` and `trip_stops_trip_day_position_uniq` are **DEFERRABLE**, which
lets a reorder swap two offsets inside one statement without a temporary sentinel value.

The cost, found by running it: **a deferrable unique constraint cannot be an `ON CONFLICT`
arbiter** (`ON CONFLICT does not support deferrable unique constraints as arbiters`). Any
future upsert keyed on `(trip_id, day_offset)` or `(trip_day_id, position)` must therefore be
written as an explicit `UPDATE … else INSERT`, or the constraint must be split into a
deferrable one plus a non-deferrable partial index. Recorded here because it will otherwise be
rediscovered as a confusing runtime error.

## 4a. Verification, and a trap found inside it

The invariants above are no longer asserted by hand-run SQL. They live in
`apps/web/tests/trips.rls.test.ts`, which signs in **two real accounts** and reaches
PostgREST directly — an application-layer guard proves nothing about what a determined
caller can reach. It is gated on the same fail-closed local-live opt-in as the other RLS
suites (15 skipped without it, 15 passed with it), so the secret-free CI gate is unaffected.

**The trap, worth recording because it nearly shipped:** a defence-in-depth schema can make
a test pass for the wrong reason. The first version of the "cannot promote an authored stop
into a credited one" test updated `origin='adopted'` while leaving `source_guide_id` NULL.
That payload violates `trip_stops_origin_credit_consistent`, so the **CHECK** refused the
write and the **grant was never exercised**. Proof: granting
`update (origin, source_creator_name)` to `authenticated` left the suite fully green.

The fix is to attack with a payload the CHECK *accepts* — either a credit column the CHECK
says nothing about (`source_creator_name` alone), or a fully self-consistent adopted payload
— so only the column grant can refuse it. Both now fail the test when the grant is widened
and pass when it is revoked.

Generalisation for the remaining slices: **when two layers both refuse a write, a green test
does not tell you which one is holding.** Any assertion whose value depends on a *specific*
layer must be mutation-verified by removing that layer. Where both layers genuinely should
hold (ownership reassignment is refused by the missing grant *and* by the RLS `with check`),
the test asserts the property rather than claiming a mechanism.

## 4b. Slice 1, and the defect it exposed

Slice 1 (`20260911120000_p2_1_trip_write_path.sql`) adds `create_trip`, `update_trip` and
`delete_trip`. They exist because `head_revision_no` is ungrantable: only a definer function
can mint a revision, which makes these the one place optimistic concurrency can live.
`update_trip`/`delete_trip` compare-and-set on an expected revision behind
`select … for update`, so the losing editor gets `trip_revision_conflict` rather than a
silent last-write-wins. Ownership is taken from `auth.uid()` inside the function, never from
an argument, and "not yours" and "does not exist" return the same error so responses cannot
be used to probe which ids exist.

**Writing `delete_trip`'s test showed that no trip could be deleted at all.** The slice 0
append-only trigger raised on *every* UPDATE and DELETE — including the ones Postgres issues
itself to maintain referential integrity:

1. `trip_revisions.trip_id` is `ON DELETE CASCADE`, so deleting a trip cascaded into the log
   and was refused. Since `create_trip` mints revision 1, that is every trip.
2. `trip_revisions.author_user_id` is `ON DELETE SET NULL`, so deleting an **account** made
   Postgres issue `UPDATE trip_revisions SET author_user_id = NULL` — refused as well.
   **An account could not be deleted once its owner had created a trip.** That is a
   data-deletion problem, not merely a broken feature.

Two things are worth carrying forward from this:

- **A guard written as "never" will also forbid the database's own bookkeeping.** Cascades
  and `SET NULL` are ordinary DML and hit ordinary triggers. Any future append-only or
  immutability guard — public versions especially — must state which referential actions it
  permits, not just what users may not do.
- **The account-deletion half was invisible because the tests did not check their own
  cleanup.** Both suites called `deleteUser` without inspecting the error; eight stranded
  users were the only symptom, and nothing was asserting on them. Teardown now asserts.

The fix narrows rather than removes: the only permitted mutations are the two the database
performs itself, each matched by exact shape — an authorship nulling in which every other
column is unchanged, and a delete whose parent trip is already gone. Mutation-verified by
replacing the trigger with a permissive one and watching the history test fail.

## 5. Deferred — these need an owner decision, not an invented rule

Slice 0 was chosen partly because it depends on **none** of these. Later slices do.

1. **Withdrawal semantics** — revoke public *access*, or *erase* content? Erasure additionally
   requires nulling copied text on already-adopted trip stops.
2. **Adoption credit as contribution points** — is an adoption worth points at all? Nothing in
   the plan authorizes a value, and `contribution_on_guide` wraps its body in
   `exception when others then raise warning`, so awards are **best-effort and silently
   swallow failures** — which may not be acceptable for a money-adjacent signal.
3. **Trip history depth** — restore-to-prior-state, or change log only? Determines whether
   revisions must carry content snapshots, and therefore whether withdrawal redaction must
   reach into superseded revisions.
4. **Guide hard-delete vs withdrawal-only** — drives `ON DELETE RESTRICT` vs `SET NULL`, and
   interacts with account deletion cascading `auth.users → creators → guides`.
5. **Legacy adoptability** — a summary-only guide is browsable, savable and linkable but not
   adoptable. Confirm that is acceptable product behaviour.
6. **Trip sharing** — slice 0 ships private-only. Link-sharing needs a specified read path.
7. **Ceilings** — `day_offset ≤ 364` and `duration_minutes ≤ 1440` were picked by judgement.
   Widening a CHECK later is a migration.
8. **Cross-midnight** — `start_minute_of_day` is `0..1439`. If "2am belongs to the previous
   night" is required behaviour, it becomes `0..2879`.
9. **Storage** — zero buckets exist. Private originals vs public derivatives needs a bucket
   policy derived from a media-assets table, not maintained in parallel.

## 6. Rollback

Every object is new, so rollback is `drop` in reverse dependency order; no existing behaviour
can regress. **Not applied to any hosted environment** — local ephemeral container only.
