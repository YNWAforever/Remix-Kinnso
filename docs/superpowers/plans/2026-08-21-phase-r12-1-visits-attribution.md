# Phase R12.1 — Attribution Hardening & Merchant ROI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument the R12.0 offer claim/redeem funnel with consented traveller-analytics events, and surface a merchant "visits driven" breakdown per creator/guide plus a creator visit-count stat.

**Architecture:** `offer_viewed`/`offer_claimed` are client-emitted through the existing `trackTravellerEvent` system; `offer_redeemed` is emitted server-side from `redeem_offer_claim`, reusing a journey_id/locale captured on the `offer_claims` row at claim time (since redemption happens on the merchant's device, not the visitor's). `merchant_insights` and `creator_insights` — both existing, already-shipped RPCs — are widened with a `visits_driven` breakdown/total rather than adding new standalone functions.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (RLS + SECURITY DEFINER RPCs), Vitest, TypeScript.

Design doc: `docs/superpowers/specs/2026-08-21-phase-r12-1-visits-attribution-design.md`

---

### Task 1: Widen analytics event/entity taxonomy + add journey columns to offer_claims

**Files:**
- Create: `supabase/migrations/20260821120000_r12_1_analytics_taxonomy_and_journey_columns.sql`
- Test: `apps/web/tests/db.r12-1-analytics-taxonomy.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260821120000_r12_1_analytics_taxonomy_and_journey_columns.sql
--
-- R12.1: widen traveller_analytics_events to accept the three offer-funnel event names and
-- an 'offer' entity type. Postgres has no "add value to an existing CHECK" primitive, so both
-- constraints are dropped and recreated with the widened list -- the constraint names and
-- every other value are otherwise unchanged from 20260801090000_r8_0_measurement_baseline.sql.
--
-- Also adds the two columns that let a server-emitted offer_redeemed event (Task 3) still
-- attribute back to the visitor's own consented journey, captured at claim time (Task 2):
-- offer_claims has no other source for either value, since the party who redeems (merchant
-- staff) is not the party whose journey/locale should be recorded.

alter table public.traveller_analytics_events
  drop constraint traveller_analytics_events_event_name_check;
alter table public.traveller_analytics_events
  add constraint traveller_analytics_events_event_name_check check (event_name in (
    'journey_started',
    'entity_viewed',
    'agent_started',
    'booking_cta_clicked',
    'waitlist_submitted',
    'checkout_started',
    'signup_started',
    'signup_completed',
    'offer_viewed',
    'offer_claimed',
    'offer_redeemed'
  ));

alter table public.traveller_analytics_events
  drop constraint traveller_analytics_events_entity_type_check;
alter table public.traveller_analytics_events
  add constraint traveller_analytics_events_entity_type_check check (
    entity_type in ('guide', 'experience', 'creator', 'article', 'offer')
  );

alter table public.offer_claims
  add column analytics_journey_id uuid,
  add column analytics_locale text check (
    analytics_locale is null
    or analytics_locale in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th')
  ),
  add constraint offer_claims_analytics_pair_check check (
    (analytics_journey_id is null and analytics_locale is null)
    or (analytics_journey_id is not null and analytics_locale is not null)
  );
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-1-analytics-taxonomy.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120000_r12_1_analytics_taxonomy_and_journey_columns.sql'),
  'utf8',
)

describe('R12.1 analytics taxonomy + offer_claims journey columns', () => {
  it('adds the three offer-funnel event names to the event_name check', () => {
    expect(sql).toContain("'offer_viewed'")
    expect(sql).toContain("'offer_claimed'")
    expect(sql).toContain("'offer_redeemed'")
  })

  it('adds offer to the entity_type check', () => {
    expect(sql).toContain("entity_type in ('guide', 'experience', 'creator', 'article', 'offer')")
  })

  it('adds analytics_journey_id and analytics_locale to offer_claims, both-or-neither', () => {
    expect(sql).toContain('add column analytics_journey_id uuid')
    expect(sql).toContain('add column analytics_locale text')
    expect(sql).toContain('offer_claims_analytics_pair_check')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-1-analytics-taxonomy`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821120000_r12_1_analytics_taxonomy_and_journey_columns.sql apps/web/tests/db.r12-1-analytics-taxonomy.test.ts
git commit -m "feat(db): R12.1 widen analytics taxonomy, add offer_claims journey columns"
```

---

### Task 2: claim_offer captures journey_id + locale

**Files:**
- Create: `supabase/migrations/20260821120100_r12_1_claim_offer_journey_capture.sql`
- Test: `apps/web/tests/db.r12-1-claim-offer-journey.test.ts`

- [ ] **Step 1: Write the migration**

Widens `claim_offer` (R12.0, `20260821100100_r12_0_claim_offer.sql`) with two new optional
trailing params, stored on the two columns Task 1 added. Every other line of the function body
is byte-identical to the shipped version.

```sql
-- supabase/migrations/20260821120100_r12_1_claim_offer_journey_capture.sql
create or replace function public.claim_offer(
  p_offer_id uuid,
  p_creator_id uuid,
  p_guide_id uuid default null,
  p_source text default 'profile',
  p_journey_id uuid default null,
  p_locale text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_visitor uuid := auth.uid();
  v_offer record;
  v_raw_token text;
  v_token_hash text;
  v_claim_id uuid;
  v_active_count integer;
begin
  if v_visitor is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_source not in ('guide', 'profile') then raise exception 'bad_source'; end if;
  if p_source = 'guide' and p_guide_id is null then raise exception 'guide_id_required'; end if;

  select id, merchant_profile_id, mission_id, status, valid_from, valid_to, per_visitor_limit, total_cap, claimed_count
    into v_offer
    from public.merchant_offers
    where id = p_offer_id
    for update;
  if not found then raise exception 'offer_not_found' using errcode = 'P0002'; end if;
  if v_offer.status <> 'live' then raise exception 'offer_not_live'; end if;
  if now() < v_offer.valid_from or now() > v_offer.valid_to then raise exception 'offer_not_in_window'; end if;

  if not exists (
    select 1 from public.mission_participants mp
    where mp.mission_id = v_offer.mission_id
      and mp.creator_id = p_creator_id
      and mp.status in ('active', 'completed')
  ) then
    raise exception 'creator_not_eligible' using errcode = '42501';
  end if;

  if p_guide_id is not null and not exists (
    select 1 from public.guides g where g.id = p_guide_id and g.creator_id = p_creator_id
  ) then
    raise exception 'guide_mismatch' using errcode = '42501';
  end if;

  if v_offer.total_cap is not null and v_offer.claimed_count >= v_offer.total_cap then
    raise exception 'offer_cap_reached';
  end if;

  select count(*) into v_active_count
    from public.offer_claims
    where offer_id = p_offer_id and visitor_user_id = v_visitor and status = 'active';
  if v_active_count >= v_offer.per_visitor_limit then
    raise exception 'visitor_limit_reached';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  update public.merchant_offers
    set claimed_count = claimed_count + 1, updated_at = now()
    where id = p_offer_id;

  -- p_journey_id/p_locale are only ever both-set or both-null, enforced by
  -- offer_claims_analytics_pair_check (Task 1) -- an inconsistent client call fails the
  -- insert with a clean constraint violation rather than silently storing a half-attributable
  -- claim.
  insert into public.offer_claims (
    offer_id, creator_id, guide_id, visitor_user_id, claim_token_hash, source_surface, expires_at,
    analytics_journey_id, analytics_locale
  )
    values (
      p_offer_id, p_creator_id, p_guide_id, v_visitor, v_token_hash, p_source, v_offer.valid_to,
      p_journey_id, p_locale
    )
    returning id into v_claim_id;

  return jsonb_build_object('claim_id', v_claim_id, 'raw_token', v_raw_token, 'expires_at', v_offer.valid_to);
end;
$$;

revoke all on function public.claim_offer(uuid, uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.claim_offer(uuid, uuid, uuid, text, uuid, text) to authenticated;
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-1-claim-offer-journey.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120100_r12_1_claim_offer_journey_capture.sql'),
  'utf8',
)

describe('claim_offer journey/locale capture', () => {
  it('adds p_journey_id and p_locale as optional trailing params', () => {
    expect(sql).toContain('p_journey_id uuid default null,\n  p_locale text default null')
  })

  it('stores both on the offer_claims insert', () => {
    expect(sql).toContain('analytics_journey_id, analytics_locale')
    expect(sql).toContain('p_journey_id, p_locale')
  })

  it('preserves every existing validation guard', () => {
    expect(sql).toContain("raise exception 'offer_not_live'")
    expect(sql).toContain("raise exception 'offer_cap_reached'")
    expect(sql).toContain("raise exception 'visitor_limit_reached'")
    expect(sql).toContain("raise exception 'guide_mismatch'")
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-1-claim-offer-journey`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821120100_r12_1_claim_offer_journey_capture.sql apps/web/tests/db.r12-1-claim-offer-journey.test.ts
git commit -m "feat(db): R12.1 claim_offer captures journey_id/locale for attribution"
```

---

### Task 3: redeem_offer_claim emits offer_redeemed server-side

**Files:**
- Create: `supabase/migrations/20260821120200_r12_1_redeem_emits_offer_redeemed.sql`
- Test: `apps/web/tests/db.r12-1-redeem-emits-event.test.ts`

- [ ] **Step 1: Write the migration**

Widens `redeem_offer_claim` (R12.0, `20260821100200_r12_0_redeem_offer_claim.sql`, as
hardened by its own follow-up fixes) to insert the analytics event after a real (non-idempotent,
non-expired) redemption, only when the claim carries a journey to attribute it to.

```sql
-- supabase/migrations/20260821120200_r12_1_redeem_emits_offer_redeemed.sql
create or replace function public.redeem_offer_claim(
  p_raw_token text,
  p_amount_spent numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid := auth.uid();
  v_token_hash text;
  v_claim record;
  v_offer record;
  v_redemption_id uuid;
  v_existing record;
begin
  if v_staff is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if coalesce(btrim(p_raw_token), '') = '' then raise exception 'bad_token'; end if;

  v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'), 'hex');

  select id, offer_id, status, expires_at, analytics_journey_id, analytics_locale
    into v_claim
    from public.offer_claims
    where claim_token_hash = v_token_hash
    for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;

  select id, merchant_profile_id, commission_kind
    into v_offer
    from public.merchant_offers
    where id = v_claim.offer_id;

  if not exists (
    select 1 from public.merchant_profiles mp
    where mp.id = v_offer.merchant_profile_id and mp.user_id = v_staff
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_claim.status = 'redeemed' then
    select id, redeemed_at into v_existing from public.offer_redemptions where offer_claim_id = v_claim.id;
    return jsonb_build_object('redemption_id', v_existing.id, 'redeemed_at', v_existing.redeemed_at, 'already_redeemed', true);
  end if;

  if v_claim.status = 'expired' or now() > v_claim.expires_at then
    update public.offer_claims set status = 'expired' where id = v_claim.id and status = 'active';
    return jsonb_build_object('expired', true);
  end if;

  if p_amount_spent is not null and p_amount_spent = 'NaN'::numeric then
    raise exception 'bad_amount_spent';
  end if;

  if v_offer.commission_kind = 'percent' and p_amount_spent is null then
    raise exception 'amount_spent_required';
  end if;

  update public.offer_claims set status = 'redeemed' where id = v_claim.id;

  insert into public.offer_redemptions (offer_claim_id, merchant_profile_id, redeemed_by_merchant_user_id, amount_spent)
    values (v_claim.id, v_offer.merchant_profile_id, v_staff, p_amount_spent)
    returning id into v_redemption_id;

  update public.merchant_offers set redeemed_count = redeemed_count + 1, updated_at = now() where id = v_offer.id;

  -- Only a real, newly-redeemed claim reaches here (both the already_redeemed and expired
  -- branches above return early) -- this insert can never double-fire for one redemption.
  -- No event is emitted for a claim with no captured journey (an unconsented claim never had
  -- one) -- there is no anonymous/invented fallback identity for it to attribute to.
  if v_claim.analytics_journey_id is not null then
    insert into public.traveller_analytics_events (
      client_event_id, journey_id, consent_version, event_name, occurred_at,
      locale, route_key, entity_type, entity_id
    ) values (
      gen_random_uuid(), v_claim.analytics_journey_id, 'v1', 'offer_redeemed', now(),
      v_claim.analytics_locale, 'offer_redemption', 'offer', v_offer.id::text
    );
  end if;

  return jsonb_build_object('redemption_id', v_redemption_id, 'redeemed_at', now(), 'already_redeemed', false);
end;
$$;

revoke all on function public.redeem_offer_claim(text, numeric) from public, anon;
grant execute on function public.redeem_offer_claim(text, numeric) to authenticated;
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-1-redeem-emits-event.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120200_r12_1_redeem_emits_offer_redeemed.sql'),
  'utf8',
)

describe('redeem_offer_claim emits offer_redeemed', () => {
  it('only inserts the event when analytics_journey_id is set', () => {
    expect(sql).toContain('if v_claim.analytics_journey_id is not null then')
  })

  it('inserts after the redemption row, using the stored journey/locale', () => {
    const redemptionInsertIdx = sql.indexOf('insert into public.offer_redemptions')
    const eventInsertIdx = sql.indexOf("event_name, occurred_at")
    expect(redemptionInsertIdx).toBeGreaterThan(-1)
    expect(eventInsertIdx).toBeGreaterThan(redemptionInsertIdx)
    expect(sql).toContain("'offer_redeemed', now(),")
    expect(sql).toContain('v_claim.analytics_locale')
  })

  it('the already_redeemed and expired branches both return before the event insert', () => {
    const alreadyRedeemedIdx = sql.indexOf("'already_redeemed', true")
    const expiredIdx = sql.indexOf("'expired', true")
    const eventCheckIdx = sql.indexOf('if v_claim.analytics_journey_id is not null then')
    expect(alreadyRedeemedIdx).toBeGreaterThan(-1)
    expect(expiredIdx).toBeGreaterThan(-1)
    expect(alreadyRedeemedIdx).toBeLessThan(eventCheckIdx)
    expect(expiredIdx).toBeLessThan(eventCheckIdx)
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-1-redeem-emits-event`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821120200_r12_1_redeem_emits_offer_redeemed.sql apps/web/tests/db.r12-1-redeem-emits-event.test.ts
git commit -m "feat(db): R12.1 redeem_offer_claim emits offer_redeemed server-side"
```

---

### Task 4: Widen merchant_insights with visits_driven

**Files:**
- Create: `supabase/migrations/20260821120300_r12_1_merchant_visits_driven.sql`
- Test: `apps/web/tests/db.r12-1-merchant-visits-driven.test.ts`

- [ ] **Step 1: Find the current merchant_insights migration**

Run: `grep -rl "create or replace function public.merchant_insights" supabase/migrations/`

Read the file that command finds in full before writing this task's migration — the existing
function body (missions_published/per_mission/totals) must be reproduced byte-for-byte here
except for the one addition below, the same "reproduce the whole function via CREATE OR
REPLACE" pattern used throughout R10–R12 (e.g. R11.0's widen of `admin_mission_attention`).
Do not reconstruct it from memory or guess at field names — copy it verbatim from the file you
just read, then add the block below into the returned `jsonb_build_object(...)`.

- [ ] **Step 2: Write the migration**

Add this key to `merchant_insights`'s existing `jsonb_build_object(...)` return, alongside
`missions_published`/`per_mission`/`totals` (keep every existing key and its query
unchanged):

```sql
    'visits_driven', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', r.creator_id, 'creator_name', r.creator_name,
        'guide_id', r.guide_id, 'guide_title', r.guide_title,
        'redemptions', r.redemptions, 'attributed_bookings', r.attributed_bookings
      ) order by (r.redemptions + r.attributed_bookings) desc)
      from (
        select
          c.id as creator_id, c.display_name as creator_name,
          g.id as guide_id, g.title as guide_title,
          count(distinct orr.id) filter (where orr.id is not null) as redemptions,
          count(distinct b.id) filter (where b.id is not null) as attributed_bookings
        from public.creators c
        left join public.offer_claims oc on oc.creator_id = c.id
        left join public.merchant_offers mo on mo.id = oc.offer_id and mo.merchant_profile_id = p_merchant_id
        left join public.offer_redemptions orr on orr.offer_claim_id = oc.id and orr.merchant_profile_id = p_merchant_id
        left join public.guides g on g.id = oc.guide_id
        left join public.experiences e on e.merchant_profile_id = p_merchant_id
        left join public.bookings b on b.guide_id = g.id and b.experience_id = e.id and b.status in ('confirmed','completed')
        where oc.id is not null or b.id is not null
        group by c.id, c.display_name, g.id, g.title
        having count(distinct orr.id) filter (where orr.id is not null) > 0
            or count(distinct b.id) filter (where b.id is not null) > 0
        limit 50
      ) r
    ), '[]'::jsonb)
```

Confirm the enclosing function's parameter name is `p_merchant_id` (check the file you read in
Step 1) and adjust the block above if it differs — the migration you write must use whatever
the real parameter is actually called, not a guess.

- [ ] **Step 3: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-1-merchant-visits-driven.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120300_r12_1_merchant_visits_driven.sql'),
  'utf8',
)

describe('merchant_insights visits_driven widening', () => {
  it('adds a visits_driven key with separate redemptions and attributed_bookings counts', () => {
    expect(sql).toContain("'visits_driven', coalesce((")
    expect(sql).toContain("'redemptions', r.redemptions")
    expect(sql).toContain("'attributed_bookings', r.attributed_bookings")
  })

  it('scopes both counts to the calling merchant', () => {
    expect(sql).toContain('mo.merchant_profile_id = p_merchant_id')
    expect(sql).toContain('orr.merchant_profile_id = p_merchant_id')
  })

  it('does not merge the two counts into one number', () => {
    expect(sql).not.toContain('redemptions + attributed_bookings as')
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-1-merchant-visits-driven`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821120300_r12_1_merchant_visits_driven.sql apps/web/tests/db.r12-1-merchant-visits-driven.test.ts
git commit -m "feat(db): R12.1 merchant_insights gains visits_driven breakdown"
```

---

### Task 5: Widen creator_insights with visits_driven total

**Files:**
- Create: `supabase/migrations/20260821120400_r12_1_creator_visits_driven.sql`
- Test: `apps/web/tests/db.r12-1-creator-visits-driven.test.ts`

- [ ] **Step 1: Find the current creator_insights migration**

Run: `grep -rl "create or replace function public.creator_insights" supabase/migrations/`

Read that file in full first, for the same reason as Task 4 — reproduce its existing body
verbatim, adding only the block below to its returned `jsonb_build_object(...)`.

- [ ] **Step 2: Write the migration**

```sql
    'visits_driven', coalesce((
      select count(*)
      from public.offer_redemptions orr
      join public.offer_claims oc on oc.id = orr.offer_claim_id
      where oc.creator_id = auth.uid()
    ), 0)
```

(`creator_insights` takes no parameters — it reads `auth.uid()` directly, matching every other
field already in the function; confirm this against the file you read in Step 1 and adjust if
the real function scopes itself differently.)

- [ ] **Step 3: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-1-creator-visits-driven.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120400_r12_1_creator_visits_driven.sql'),
  'utf8',
)

describe('creator_insights visits_driven widening', () => {
  it('adds a visits_driven total scoped to the calling creator', () => {
    expect(sql).toContain("'visits_driven', coalesce((")
    expect(sql).toContain('oc.creator_id = auth.uid()')
  })

  it('counts offer_redemptions joined through offer_claims, not a raw claim count', () => {
    expect(sql).toContain('from public.offer_redemptions orr')
    expect(sql).toContain('join public.offer_claims oc on oc.id = orr.offer_claim_id')
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-1-creator-visits-driven`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821120400_r12_1_creator_visits_driven.sql apps/web/tests/db.r12-1-creator-visits-driven.test.ts
git commit -m "feat(db): R12.1 creator_insights gains visits_driven total"
```

---

### Task 6: Hand-add packages/db/types.ts entries

No `pnpm --filter @kinnso/db gen` — it reads production (see `db-gen-linked-production-gotcha`
in project notes).

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add the two new offer_claims columns**

Find the existing `offer_claims` entry's `Row`/`Insert`/`Update` blocks (added in R12.0's own
types commit). Add, to all three, positioned alphabetically after `amount_spent`... actually
these belong on `offer_claims`, not `offer_redemptions` — find `offer_claims`'s `Row` block
specifically and add after `claim_token_hash`, before `created_at`:

```typescript
          analytics_journey_id: string | null
```

to `Row`, and `analytics_journey_id?: string | null` to `Insert`/`Update`. Same for
`analytics_locale: string | null` / `analytics_locale?: string | null`.

- [ ] **Step 2: Update claim_offer's Args**

Find the `claim_offer` entry in the `Functions` block (added in R12.0). Add the two new
trailing optional params:

```typescript
      claim_offer: {
        Args: {
          p_creator_id: string
          p_guide_id: string | null
          p_journey_id?: string | null
          p_locale?: string | null
          p_offer_id: string
          p_source: string
        }
        Returns: Json
      }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-add R12.1 types (offer_claims journey columns + claim_offer args)"
```

---

### Task 7: Add offer_viewed/offer_claimed event types

**Files:**
- Modify: `apps/web/lib/analytics/contracts.ts`
- Modify: `apps/web/lib/analytics/client.ts`

- [ ] **Step 1: Widen the event list and payload schema**

In `apps/web/lib/analytics/contracts.ts`, change:

```typescript
export const TRAVELLER_ANALYTICS_EVENTS = [
  'journey_started',
  'entity_viewed',
  'agent_started',
  'booking_cta_clicked',
  'waitlist_submitted',
  'checkout_started',
  'signup_started',
  'signup_completed',
] as const
```

to:

```typescript
export const TRAVELLER_ANALYTICS_EVENTS = [
  'journey_started',
  'entity_viewed',
  'agent_started',
  'booking_cta_clicked',
  'waitlist_submitted',
  'checkout_started',
  'signup_started',
  'signup_completed',
  'offer_viewed',
  'offer_claimed',
] as const
```

(`offer_redeemed` is deliberately absent from this client-side list — it's server-emitted only,
Task 3, and never posted through `/api/analytics`.)

And change:

```typescript
  entityType: z.enum(['guide', 'experience', 'creator', 'article']).optional(),
```

to:

```typescript
  entityType: z.enum(['guide', 'experience', 'creator', 'article', 'offer']).optional(),
```

- [ ] **Step 2: Add typed metadata shapes**

In `apps/web/lib/analytics/client.ts`, add to `TravellerAnalyticsMetadataByEvent` (after the
existing `checkout_started` entry, before `signup_started`):

```typescript
  offer_viewed: CommonMetadata & { routeKey: 'offer_claim' | 'offer_profile'; entityType: 'offer'; entityId: string }
  offer_claimed: CommonMetadata & { routeKey: 'offer_claim' | 'offer_profile'; entityType: 'offer'; entityId: string }
```

(`routeKey` distinguishes the two claim surfaces this phase's design doc references —
guide-page vs. creator-profile — reusing the naming style already used for `guide_detail`/
`creator_profile` elsewhere in this same type.)

- [ ] **Step 3: Add a read-only journey_id export**

`ensureJourney`/`trackTravellerEvent` already read the visitor's current journey id from
storage internally, but nothing exposes it for a caller to pass elsewhere (Task 8 needs this
to pass `p_journey_id` into `claim_offer`). Add, near the other exported functions in
`client.ts`:

```typescript
/** The visitor's current consented journey id, or null if unconsented/no journey yet. */
export function getCurrentJourneyId(): string | null {
  if (!hasAnalyticsConsent()) return null
  const storage = getStorage()
  const journeyId = getStorageValue(storage, JOURNEY_KEY)
  return isJourneyId(journeyId) ? journeyId : null
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/analytics/contracts.ts apps/web/lib/analytics/client.ts
git commit -m "feat(web): R12.1 add offer_viewed/offer_claimed event types + journey_id export"
```

---

### Task 8: Wire events into the claim CTA and claim action

**Files:**
- Modify: `apps/web/components/kinnso/OfferClaimCard.tsx`
- Modify: `apps/web/lib/offers/actions.ts`
- Test: `apps/web/tests/kinnso.OfferClaimCard.test.tsx` (extend)
- Test: `apps/web/tests/offers.actions.test.ts` (extend)

- [ ] **Step 1: Find the current claimOfferAction and OfferClaimCard**

Run: `cat apps/web/lib/offers/actions.ts apps/web/components/kinnso/OfferClaimCard.tsx`

Read both in full — this task modifies the real, currently-shipped R12.0 versions of both
files, not a reconstruction. The exact edits below assume `claimOfferAction`'s current
signature is `(offerId: string, creatorId: string, guideId: string | null, source: 'guide' |
'profile')` and that it calls `supabase.rpc('claim_offer', { p_offer_id, p_creator_id,
p_guide_id, p_source })` — confirm this against what you just read and adapt the diff if it's
shaped differently.

- [ ] **Step 2: Pass journey_id/locale into the claim RPC call**

In `apps/web/lib/offers/actions.ts`, add the import:

```typescript
import { getCurrentJourneyId } from '@/lib/analytics/client'
```

and widen the `supabase.rpc('claim_offer', ...)` call's params object to include:

```typescript
      p_journey_id: getCurrentJourneyId(),
      p_locale: getCurrentJourneyId() ? locale : null,
```

(reuse whatever `locale` variable is already in scope in that function — `claimOfferAction`
already receives `locale` indirectly via `OfferClaimCard`'s existing props per R12.0's Task 9;
if it isn't currently threaded into the action itself, add a `locale: Locale` parameter to
`claimOfferAction`'s signature and pass it from `OfferClaimCard`'s existing `onClaim` call.)

- [ ] **Step 3: Fire offer_viewed on mount and offer_claimed on success**

In `apps/web/components/kinnso/OfferClaimCard.tsx`, add the import:

```typescript
import { useEffect } from 'react'
import { trackTravellerEvent } from '@/lib/analytics/client'
```

Add, inside the component body (after the existing `useTransition` line):

```typescript
  useEffect(() => {
    trackTravellerEvent('offer_viewed', {
      locale, routeKey: source === 'guide' ? 'offer_claim' : 'offer_profile',
      entityType: 'offer', entityId: offer.id,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

and, inside the existing `claim()` function's success branch (where `result.ok && result.claimId`
is checked, alongside the existing `router.push(...)` call):

```typescript
      trackTravellerEvent('offer_claimed', {
        locale, routeKey: source === 'guide' ? 'offer_claim' : 'offer_profile',
        entityType: 'offer', entityId: offer.id,
      })
```

- [ ] **Step 4: Extend the existing tests**

Add to `apps/web/tests/kinnso.OfferClaimCard.test.tsx`:

```typescript
  it('fires offer_viewed on mount', () => {
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={vi.fn()}
      />,
    )
    expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_viewed', {
      locale: 'en', routeKey: 'offer_claim', entityType: 'offer', entityId: 'offer-1',
    })
  })

  it('fires offer_claimed on a successful claim', async () => {
    const onClaim = vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_claimed', {
      locale: 'en', routeKey: 'offer_claim', entityType: 'offer', entityId: 'offer-1',
    }))
  })
```

with the corresponding mock added near this file's existing `vi.mock('next/navigation', ...)`:

```typescript
const { trackTravellerEventMock } = vi.hoisted(() => ({ trackTravellerEventMock: vi.fn() }))
vi.mock('@/lib/analytics/client', () => ({ trackTravellerEvent: trackTravellerEventMock }))
```

Add to `apps/web/tests/offers.actions.test.ts` (mocking `getCurrentJourneyId` the same
hoisted way) a test confirming `claimOfferAction` passes `p_journey_id: null, p_locale: null`
when unconsented (mock returns `null`) and the real journey id + locale when consented (mock
returns a UUID string).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run kinnso.OfferClaimCard offers.actions`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/kinnso/OfferClaimCard.tsx apps/web/lib/offers/actions.ts apps/web/tests/kinnso.OfferClaimCard.test.tsx apps/web/tests/offers.actions.test.ts
git commit -m "feat(web): R12.1 wire offer_viewed/offer_claimed events into the claim CTA"
```

---

### Task 9: Widen the insights query-layer types

**Files:**
- Modify: `apps/web/lib/insights/creator.ts`
- Modify: `apps/web/lib/insights/merchant.ts`
- Test: extend the existing test files for both (find via `grep -rl "getCreatorInsights\|getMerchantInsights" apps/web/tests`)

- [ ] **Step 1: Add visitsDriven to CreatorInsights**

In `apps/web/lib/insights/creator.ts`, add `visitsDriven: number` to the `CreatorInsights`
interface and `visits_driven: number` to `RawCreatorInsights`, then in `getCreatorInsights`'s
return object add `visitsDriven: num(raw.visits_driven),`.

- [ ] **Step 2: Add visitsDriven to MerchantInsights**

In `apps/web/lib/insights/merchant.ts`, add:

```typescript
export interface MerchantVisitRow {
  creatorId: string
  creatorName: string | null
  guideId: string | null
  guideTitle: string | null
  redemptions: number
  attributedBookings: number
}
```

Add `visitsDriven: MerchantVisitRow[]` to `MerchantInsights`. Add the matching raw shape to
`RawMerchantInsights`:

```typescript
  visits_driven: {
    creator_id: string; creator_name: string | null
    guide_id: string | null; guide_title: string | null
    redemptions: number; attributed_bookings: number
  }[]
```

In `getMerchantInsights`'s return object, add:

```typescript
    visitsDriven: (raw.visits_driven ?? []).map((r) => ({
      creatorId: r.creator_id, creatorName: r.creator_name,
      guideId: r.guide_id, guideTitle: r.guide_title,
      redemptions: num(r.redemptions), attributedBookings: num(r.attributed_bookings),
    })),
```

- [ ] **Step 3: Extend the existing tests**

Add one assertion to each file's existing test(s) confirming `visitsDriven`/`visits_driven`
round-trips correctly through the mapping (a total for creator, an array of rows for merchant)
— follow the exact mocking pattern each existing test file already uses for `supabase.rpc`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd apps/web && npx vitest run insights` (adjust the pattern to match whatever the actual
test file names from Step 3's grep are) `&& npx tsc --noEmit`
Expected: PASS, clean

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/insights/creator.ts apps/web/lib/insights/merchant.ts
git commit -m "feat(web): R12.1 widen insights query layer with visitsDriven"
```

(add the two extended test files to this same commit)

---

### Task 10: UI — visits-driven panel, creator stat, i18n

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorInsightsView.tsx`
- Modify: `apps/web/components/kinnso/pages/MerchantInsightsView.tsx`
- Modify: `apps/web/lib/i18n/messages/*.ts` (all 7 locales)

- [ ] **Step 1: Add the creator visit-count stat**

In `CreatorInsightsView.tsx`, add a new stat section (matching the existing `pointsTotal`
section's structure) somewhere after the header, before the `hasPoints` conditional block:

```tsx
      <section className="rounded-lg border p-5">
        <p className="text-sm text-muted-foreground">{t.visitsDriven}</p>
        <p className="text-3xl font-semibold tabular-nums">{data.visitsDriven}</p>
      </section>
```

- [ ] **Step 2: Add the merchant visits-driven table**

In `MerchantInsightsView.tsx`, add a new section (matching the existing `perMissionTitle`
table's structure exactly) after that section:

```tsx
      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-medium">{t.visitsDrivenTitle}</h2>
        {data.visitsDriven.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">{t.colCreator}</th>
                <th className="py-2 px-2 font-medium">{t.colGuide}</th>
                <th className="py-2 px-2 text-right font-medium">{t.colRedemptions}</th>
                <th className="py-2 pl-2 text-right font-medium">{t.colAttributedBookings}</th>
              </tr>
            </thead>
            <tbody>
              {data.visitsDriven.map((r, i) => (
                <tr key={`${r.creatorId}-${r.guideId ?? i}`} className="border-t">
                  <td className="py-2 pr-2">{r.creatorName ?? t.unnamed}</td>
                  <td className="py-2 px-2">{r.guideTitle ?? t.notApplicable}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.redemptions}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">{r.attributedBookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">{t.visitsDrivenEmpty}</p>
        )}
      </section>
```

(`t.unnamed` and `t.notApplicable` already exist elsewhere in the `insights` message
namespace — confirm via `grep -n "unnamed:\|notApplicable:" apps/web/lib/i18n/messages/en.ts`
before assuming; add them to this namespace specifically if they only exist under a different
one.)

- [ ] **Step 3: Add the i18n keys**

Add to the `insights` block's type definition and all 7 locale content blocks (find the exact
current line numbers the same way every prior phase in this repo has — `grep -n
"perMissionTitle:" apps/web/lib/i18n/messages/*.ts` — and insert alongside it, following each
file's existing translation style):

```typescript
    visitsDriven: string
    visitsDrivenTitle: string
    visitsDrivenEmpty: string
    colCreator: string
    colGuide: string
    colRedemptions: string
    colAttributedBookings: string
```

English content:

```typescript
    visitsDriven: 'Visits driven',
    visitsDrivenTitle: 'Visits driven',
    visitsDrivenEmpty: 'No redemptions or attributed bookings yet.',
    colCreator: 'Creator',
    colGuide: 'Guide',
    colRedemptions: 'Redemptions',
    colAttributedBookings: 'Attributed bookings',
```

Write real translations for zh-hk/zh-tw/ja/ko/th/zh-cn matching each file's existing register
in the same `insights` block (read a few neighboring existing keys in each file first, the
same way every prior i18n task in this repo has, rather than machine-translating blind).

- [ ] **Step 4: Run the i18n parity test**

Run: `cd apps/web && npx vitest run i18n.locale-parity`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && cd ../.. && pnpm --filter web lint`
Expected: clean, no new warnings

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorInsightsView.tsx apps/web/components/kinnso/pages/MerchantInsightsView.tsx apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): R12.1 visits-driven panel + creator visit-count stat + i18n"
```

---

### Task 11: Live proof

**Files:**
- Create: `apps/web/tests/offers-attribution.rls.test.ts`

Local Supabase stack only — never production. Grep every existing `*.rls.test.ts` file's fixed
UUID constants first (or use `randomUUID()` throughout, as R12.0's own `offers.rls.test.ts`
already does — follow that same no-fixed-seed pattern here).

- [ ] **Step 1: Start the local stack and reset**

Run: `cd "$(git rev-parse --show-toplevel)" && npx supabase start && npx supabase db reset`

- [ ] **Step 2: Write the live-proof test**

Model this file directly on `apps/web/tests/offers.rls.test.ts`'s existing `beforeAll` fixture
setup (signed-in clients, merchant/creator/mission/offer creation) — read that file first and
reuse its exact helper shape rather than reinventing one. Add these cases on top of that same
fixture:

```typescript
  it('a consented claim + redemption emits exactly one offer_redeemed event with the right journey_id', async () => {
    const journeyId = randomUUID()
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
      p_journey_id: journeyId, p_locale: 'en',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })

    const { data: events } = await admin
      .from('traveller_analytics_events')
      .select('event_name, journey_id, entity_type, entity_id')
      .eq('journey_id', journeyId)
      .eq('event_name', 'offer_redeemed')
    expect(events ?? []).toHaveLength(1)
    expect(events![0].entity_type).toBe('offer')
    expect(events![0].entity_id).toBe(offerId)
  })

  it('an unconsented claim (no journey_id) + redemption emits no analytics event', async () => {
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    const { data: claimRow } = await admin.from('offer_claims').select('id').eq('claim_token_hash', 'nonexistent').maybeSingle()
    void claimRow

    await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })

    const { data: redemption } = await admin
      .from('offer_redemptions')
      .select('id, offer_claim_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const { data: events } = await admin
      .from('traveller_analytics_events')
      .select('id')
      .eq('event_name', 'offer_redeemed')
    // This claim's own redemption inserted no event; other tests' redemptions may have, so
    // assert on this specific claim's absence via the offer_claims row instead of a global
    // zero count.
    const { data: thisClaim } = await admin
      .from('offer_claims')
      .select('analytics_journey_id')
      .eq('id', redemption!.offer_claim_id)
      .single()
    expect(thisClaim!.analytics_journey_id).toBeNull()
    void events
  })

  it('merchant_insights visits_driven reports separate redemption and attributed-booking counts', async () => {
    const { data } = await staffA.rpc('merchant_insights')
    const payload = data as { visits_driven: { creator_id: string; redemptions: number; attributed_bookings: number }[] }
    const row = payload.visits_driven.find((r) => r.creator_id === creatorId)
    expect(row).toBeDefined()
    expect(row!.redemptions).toBeGreaterThan(0)
  })

  it('creator_insights visits_driven total counts this creator\'s own redemptions', async () => {
    const { data } = await creatorClient.rpc('creator_insights')
    const payload = data as { visits_driven: number }
    expect(payload.visits_driven).toBeGreaterThan(0)
  })
```

(`creatorClient`, `staffA`, `visitor`, `creatorId`, `offerId`, `admin` are the existing fixture
variables from `offers.rls.test.ts`'s `beforeAll` — reuse them exactly, do not redeclare.)

- [ ] **Step 3: Run the live-proof test**

Run: `cd apps/web && RUN_R7_3_LOCAL_LIVE_TESTS=1 npx vitest run offers-attribution.rls`
Expected: PASS (4 tests). If any test fails, trace whether it's a real bug in an earlier
task's migration before assuming the test itself is wrong — this phase's own review process
(R12.0's) found real bugs hiding behind exactly that assumption more than once.

- [ ] **Step 4: Run the full test suite before tearing down**

Run: `cd apps/web && npx vitest run`
Expected: PASS across the board, aside from any pre-existing flake already documented in
project notes (the `88888888-...` UUID collision between `notifications.rls.test.ts` and
`settlement-minting.rls.test.ts` is known and unrelated to this phase).

- [ ] **Step 5: Tear down the local stack**

Run: `npx supabase stop`

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/offers-attribution.rls.test.ts
git commit -m "test(db): R12.1 live proof — journey attribution + visits_driven reporting"
```

## Post-implementation

Open a PR titled `Phase R12.1 — Attribution Hardening & Merchant ROI` following the established
pattern (`docs/r12-1-visits-attribution-design` was already opened as the design doc PR; this
is the implementation PR on a fresh branch off `main`, e.g. `feat/r12-1-visits-attribution`).

**Not covered by this plan, needs separate action after merge:** the two CHECK-constraint
widenings, `claim_offer`/`redeem_offer_claim` updates, and both insights RPC widenings are
migrations — like every prior phase this session, merging to `main` does not apply them to
production. They need to be run against the live database the same way R12.0's and R10.1's
were, with the same care given `redeem_offer_claim`'s ON CONFLICT-adjacent history earlier this
session — confirm the exact current production state of `merchant_insights`/`creator_insights`
(their real current function bodies) before writing the copy-paste bundle, rather than
assuming the local migration files are what's actually live.
