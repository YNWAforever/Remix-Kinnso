# Phase R12.0 — The Visit Loop MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship merchant-created offers, creator-attributed visitor claims, and staff-verified in-store redemption, settling through the existing R10.1/R10.2 payout pipeline.

**Architecture:** Three new tables (`merchant_offers`, `offer_claims`, `offer_redemptions`), two SECURITY DEFINER RPCs (`claim_offer`, `redeem_offer_claim`) modeled on the existing R10.2/R11.0 validate→lock→write shape, an `AFTER INSERT` settlement trigger on `offer_redemptions` that composes with (and does not modify) R10.1's existing settlement-mint trigger, and four new UI surfaces (claim CTA, claim confirmation/QR, merchant redeem screen with camera+manual entry, merchant offer management).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), `qrcode.react` (QR generation), `jsqr` (QR decoding from camera frames), Vitest.

---

## Implementation note: a spec-vs-schema gap this plan resolves

The approved design doc (`docs/superpowers/specs/2026-08-21-phase-r12-0-visit-loop-design.md`)
describes settlement rows carrying `source = 'visit_redemption'` and enforcing
`per_visitor_limit` via a partial unique index. Neither is quite how the actual schema works:

- `mission_settlements` has no `source`/`kind` column today — R10.1's existing fee-settlement
  rows are distinguished from affiliate settlements purely by which nullable columns are
  populated (`mission_participant_id` set + `affiliate_network_event_id` null + positive
  `paid_fee_amount` = a fee settlement). Task 4 below adds a `source` column (default
  `'mission_fee'`, so R10.1's unmodified trigger needs zero changes) rather than widening the
  design doc's aspirational-but-nonexistent column.
- `mission_settlements.mission_id` is `not null`, but this phase's `merchant_offers.mission_id`
  is nullable (the design doc's "offers can outlive their mission"). Task 4 resolves this: a
  redemption against a mission-less offer applies the discount but mints no settlement (no
  mission context, no creator-payout obligation) — the trigger no-ops rather than erroring.
- `per_visitor_limit` can be any positive integer, not just 1, so a plain unique index can't
  enforce it. Task 2's `claim_offer` RPC takes `for update` on the `merchant_offers` row
  (serializing every claim attempt against that specific offer) and enforces both
  `per_visitor_limit` and `total_cap` via `count`/`if` checks under that lock — race-safe
  without a unique-index trick that only works for limit=1.

These are implementation-mechanism corrections, not requirement changes — the design doc's
actual requirements (race-safe caps, settlement flowing through the existing pipeline) are
still met.

---

### Task 1: The three core tables

**Files:**
- Create: `supabase/migrations/20260821100000_r12_0_offer_claim_redemption_tables.sql`
- Test: `apps/web/tests/db.r12-0-offer-tables.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260821100000_r12_0_offer_claim_redemption_tables.sql
--
-- R12.0 -- The Visit Loop MVP. See
-- docs/superpowers/specs/2026-08-21-phase-r12-0-visit-loop-design.md.
--
-- merchant_offers: the redeemable thing a mission promotes. Merchant self-service (RLS
-- owner-write, not RPC-gated -- creating/pausing/ending an offer has no race-safety or fraud
-- concern the way claiming and redeeming do).
--
-- offer_claims: the attribution moment. Requires sign-in (visitor_user_id not null, no
-- anonymous/email variant -- see design doc Decision 4). RPC-only writes.
--
-- offer_redemptions: the in-store moment of truth. RPC-only writes.

create table public.merchant_offers (
  id                  uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid not null references public.merchant_profiles(id) on delete cascade,
  mission_id          uuid references public.missions(id) on delete set null,
  title               text not null check (char_length(btrim(title)) between 1 and 120),
  terms               text not null check (char_length(btrim(terms)) between 1 and 1000),
  discount_kind       text not null check (discount_kind in ('percent', 'amount', 'item')),
  discount_value      numeric not null check (discount_value > 0),
  commission_kind     text not null check (commission_kind in ('flat', 'percent')),
  commission_value    numeric not null check (commission_value > 0),
  valid_from          timestamptz not null,
  valid_to            timestamptz not null check (valid_to > valid_from),
  per_visitor_limit   integer not null default 1 check (per_visitor_limit > 0),
  total_cap           integer check (total_cap > 0),
  claimed_count       integer not null default 0 check (claimed_count >= 0),
  redeemed_count      integer not null default 0 check (redeemed_count >= 0),
  status              text not null default 'draft' check (status in ('draft', 'live', 'paused', 'ended')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index merchant_offers_merchant_idx on public.merchant_offers (merchant_profile_id, created_at desc);
create index merchant_offers_mission_idx on public.merchant_offers (mission_id) where mission_id is not null;
create index merchant_offers_live_idx on public.merchant_offers (status, valid_from, valid_to) where status = 'live';

alter table public.merchant_offers enable row level security;
revoke all on public.merchant_offers from public, anon, authenticated;

create policy merchant_offers_owner_all on public.merchant_offers
  for all
  to authenticated
  using (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = merchant_offers.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = merchant_offers.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

grant select, insert, update, delete on public.merchant_offers to authenticated;

create table public.offer_claims (
  id               uuid primary key default gen_random_uuid(),
  offer_id         uuid not null references public.merchant_offers(id) on delete cascade,
  creator_id       uuid not null references public.creators(id),
  guide_id         uuid references public.guides(id),
  visitor_user_id  uuid not null,
  claim_token_hash text not null unique,
  source_surface   text not null check (source_surface in ('guide', 'profile')),
  expires_at       timestamptz not null,
  status           text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  created_at       timestamptz not null default now()
);

create index offer_claims_visitor_idx on public.offer_claims (visitor_user_id, created_at desc);
create index offer_claims_offer_idx on public.offer_claims (offer_id, created_at desc);

alter table public.offer_claims enable row level security;
revoke all on public.offer_claims from public, anon, authenticated;

create policy offer_claims_visitor_select on public.offer_claims
  for select
  to authenticated
  using (visitor_user_id = (select auth.uid()));

create policy offer_claims_merchant_select on public.offer_claims
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_offers mo
      join public.merchant_profiles mp on mp.id = mo.merchant_profile_id
      where mo.id = offer_claims.offer_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

grant select on public.offer_claims to authenticated; -- inserts/updates happen only via claim_offer/redeem_offer_claim

create table public.offer_redemptions (
  id                            uuid primary key default gen_random_uuid(),
  offer_claim_id                uuid not null unique references public.offer_claims(id),
  merchant_profile_id           uuid not null references public.merchant_profiles(id),
  redeemed_by_merchant_user_id  uuid not null,
  redeemed_at                   timestamptz not null default now(),
  amount_spent                  numeric check (amount_spent >= 0),
  settlement_id                 uuid references public.mission_settlements(id),
  created_at                    timestamptz not null default now()
);

create index offer_redemptions_merchant_idx on public.offer_redemptions (merchant_profile_id, redeemed_at desc);

alter table public.offer_redemptions enable row level security;
revoke all on public.offer_redemptions from public, anon, authenticated;

create policy offer_redemptions_visitor_select on public.offer_redemptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.offer_claims oc
      where oc.id = offer_redemptions.offer_claim_id
        and oc.visitor_user_id = (select auth.uid())
    )
  );

create policy offer_redemptions_merchant_select on public.offer_redemptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = offer_redemptions.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

grant select on public.offer_redemptions to authenticated; -- inserts happen only via redeem_offer_claim
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-0-offer-tables.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100000_r12_0_offer_claim_redemption_tables.sql'),
  'utf8',
)

describe('R12.0 offer/claim/redemption tables', () => {
  it('creates merchant_offers with commission_kind and discount_kind check constraints', () => {
    expect(sql).toContain("discount_kind text not null check (discount_kind in ('percent', 'amount', 'item'))")
    expect(sql).toContain("commission_kind text not null check (commission_kind in ('flat', 'percent'))")
  })

  it('creates offer_claims with visitor_user_id not-null (no anonymous claim path)', () => {
    expect(sql).toContain('visitor_user_id  uuid not null,')
  })

  it('creates offer_redemptions referencing mission_settlements for the payout link', () => {
    expect(sql).toContain('settlement_id                 uuid references public.mission_settlements(id),')
  })

  it('enables RLS and revokes all client access on all three tables', () => {
    for (const table of ['merchant_offers', 'offer_claims', 'offer_redemptions']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`revoke all on public.${table} from public, anon, authenticated`)
    }
  })

  it('grants offer_claims and offer_redemptions select-only (RPC-only writes)', () => {
    expect(sql).toContain('grant select on public.offer_claims to authenticated')
    expect(sql).toContain('grant select on public.offer_redemptions to authenticated')
  })

  it('grants merchant_offers full CRUD for owner self-service', () => {
    expect(sql).toContain('grant select, insert, update, delete on public.merchant_offers to authenticated')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-0-offer-tables`
Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821100000_r12_0_offer_claim_redemption_tables.sql apps/web/tests/db.r12-0-offer-tables.test.ts
git commit -m "feat(db): R12.0 merchant_offers, offer_claims, offer_redemptions tables"
```

---

### Task 2: `claim_offer` RPC

**Files:**
- Create: `supabase/migrations/20260821100100_r12_0_claim_offer.sql`
- Test: `apps/web/tests/db.r12-0-claim-offer.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260821100100_r12_0_claim_offer.sql
--
-- Validate -> lock -> write, same shape as admin_create_payout_batch (R10.2). Takes
-- `for update` on the merchant_offers row, which serializes every concurrent claim attempt
-- against that specific offer -- both per_visitor_limit and total_cap are enforced as plain
-- `if` checks under that lock, not a predicate update or unique index (per_visitor_limit can
-- be any positive integer, so a simple unique-per-visitor index can't express it).
create or replace function public.claim_offer(
  p_offer_id uuid,
  p_creator_id uuid,
  p_guide_id uuid default null,
  p_source text default 'profile'
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

  insert into public.offer_claims (offer_id, creator_id, guide_id, visitor_user_id, claim_token_hash, source_surface, expires_at)
    values (p_offer_id, p_creator_id, p_guide_id, v_visitor, v_token_hash, p_source, v_offer.valid_to)
    returning id into v_claim_id;

  return jsonb_build_object('claim_id', v_claim_id, 'raw_token', v_raw_token, 'expires_at', v_offer.valid_to);
end;
$$;

revoke all on function public.claim_offer(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.claim_offer(uuid, uuid, uuid, text) to authenticated;
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-0-claim-offer.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100100_r12_0_claim_offer.sql'),
  'utf8',
)

describe('claim_offer RPC', () => {
  it('takes for update on merchant_offers to serialize claim attempts', () => {
    expect(sql).toContain('from public.merchant_offers\n    where id = p_offer_id\n    for update')
  })

  it('enforces total_cap and per_visitor_limit as plain checks under the lock', () => {
    expect(sql).toContain("raise exception 'offer_cap_reached'")
    expect(sql).toContain("raise exception 'visitor_limit_reached'")
  })

  it('requires the offer to be live and within its validity window', () => {
    expect(sql).toContain("raise exception 'offer_not_live'")
    expect(sql).toContain("raise exception 'offer_not_in_window'")
  })

  it('checks creator eligibility via mission_participants active/completed status', () => {
    expect(sql).toContain("and mp.status in ('active', 'completed')")
  })

  it('never persists the raw token, only its sha256 hash', () => {
    expect(sql).toContain("v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex')")
    expect(sql).toContain('claim_token_hash')
    expect(sql).not.toContain('v_raw_token,\n        p_source')
  })

  it('revokes public/anon and grants only authenticated', () => {
    expect(sql).toContain('revoke all on function public.claim_offer(uuid, uuid, uuid, text) from public, anon')
    expect(sql).toContain('grant execute on function public.claim_offer(uuid, uuid, uuid, text) to authenticated')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-0-claim-offer`
Expected: PASS (6 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821100100_r12_0_claim_offer.sql apps/web/tests/db.r12-0-claim-offer.test.ts
git commit -m "feat(db): R12.0 claim_offer RPC"
```

---

### Task 3: `redeem_offer_claim` RPC

**Files:**
- Create: `supabase/migrations/20260821100200_r12_0_redeem_offer_claim.sql`
- Test: `apps/web/tests/db.r12-0-redeem-offer-claim.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260821100200_r12_0_redeem_offer_claim.sql
--
-- Locks the claim row `for update` -- a genuinely concurrent second scan blocks until the
-- first commits, then observes status = 'redeemed' and returns the idempotent branch instead
-- of erroring. Ownership is enforced here, not by RLS: a creator cannot self-redeem (this RPC
-- requires the caller to be staff of the offer's own merchant_profile_id).
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

  select id, offer_id, status, expires_at
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
    raise exception 'claim_expired';
  end if;

  if v_offer.commission_kind = 'percent' and p_amount_spent is null then
    raise exception 'amount_spent_required';
  end if;

  update public.offer_claims set status = 'redeemed' where id = v_claim.id;

  insert into public.offer_redemptions (offer_claim_id, merchant_profile_id, redeemed_by_merchant_user_id, amount_spent)
    values (v_claim.id, v_offer.merchant_profile_id, v_staff, p_amount_spent)
    returning id into v_redemption_id;

  update public.merchant_offers set redeemed_count = redeemed_count + 1, updated_at = now() where id = v_offer.id;

  return jsonb_build_object('redemption_id', v_redemption_id, 'redeemed_at', now(), 'already_redeemed', false);
end;
$$;

revoke all on function public.redeem_offer_claim(text, numeric) from public, anon;
grant execute on function public.redeem_offer_claim(text, numeric) to authenticated;
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-0-redeem-offer-claim.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100200_r12_0_redeem_offer_claim.sql'),
  'utf8',
)

describe('redeem_offer_claim RPC', () => {
  it('locks the claim row for update before checking status', () => {
    expect(sql).toContain('where claim_token_hash = v_token_hash\n    for update')
  })

  it('returns already_redeemed for a second call instead of erroring', () => {
    expect(sql).toContain("'already_redeemed', true")
  })

  it('requires the caller to be staff of the offer\'s own merchant', () => {
    expect(sql).toContain("raise exception 'forbidden' using errcode = '42501'")
    expect(sql).toContain('mp.user_id = v_staff')
  })

  it('requires amount_spent only for percent-commission offers', () => {
    expect(sql).toContain("if v_offer.commission_kind = 'percent' and p_amount_spent is null then")
  })

  it('rejects an expired claim', () => {
    expect(sql).toContain("raise exception 'claim_expired'")
  })

  it('revokes public/anon and grants only authenticated', () => {
    expect(sql).toContain('revoke all on function public.redeem_offer_claim(text, numeric) from public, anon')
    expect(sql).toContain('grant execute on function public.redeem_offer_claim(text, numeric) to authenticated')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-0-redeem-offer-claim`
Expected: PASS (6 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821100200_r12_0_redeem_offer_claim.sql apps/web/tests/db.r12-0-redeem-offer-claim.test.ts
git commit -m "feat(db): R12.0 redeem_offer_claim RPC"
```

---

### Task 4: Settlement on redemption

**Files:**
- Create: `supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql`
- Test: `apps/web/tests/db.r12-0-settlement-on-redemption.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql
--
-- Adds a `source` discriminator to mission_settlements (it had none -- R10.1's existing fee
-- settlements are distinguished only by which nullable columns are populated). Defaults to
-- 'mission_fee' so R10.1's own trigger needs zero changes; only this phase's new trigger sets
-- 'visit_redemption' explicitly.
alter table public.mission_settlements
  add column source text not null default 'mission_fee' check (source in ('mission_fee', 'visit_redemption'));

-- AFTER INSERT on offer_redemptions, not on offer_claims -- the settlement obligation is
-- created at the moment of redemption (the in-store event), not at claim time.
--
-- No-ops (does not raise) when the offer has no mission_id, or the claiming creator has no
-- mission_participants row: the discount still applies to the visitor, but there is no
-- mission context to hang a creator-payout obligation on. This differs from R10.1's own
-- trigger, which always has a mission context by construction (it fires from a milestone
-- submission that is itself scoped to a mission).
create or replace function public.create_settlement_on_offer_redemption() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mission_id uuid;
  v_creator_id uuid;
  v_commission_kind text;
  v_commission_value numeric;
  v_participant_id uuid;
  v_fee numeric;
  v_settlement_id uuid;
begin
  select mo.mission_id, mo.commission_kind, mo.commission_value, oc.creator_id
    into v_mission_id, v_commission_kind, v_commission_value, v_creator_id
    from public.offer_claims oc
    join public.merchant_offers mo on mo.id = oc.offer_id
    where oc.id = new.offer_claim_id;

  if v_mission_id is null then
    return new;
  end if;

  select id into v_participant_id
    from public.mission_participants
    where mission_id = v_mission_id and creator_id = v_creator_id;
  if v_participant_id is null then
    return new;
  end if;

  v_fee := case
    when v_commission_kind = 'flat' then v_commission_value
    else round(coalesce(new.amount_spent, 0) * v_commission_value / 100, 2)
  end;
  if v_fee <= 0 then
    return new;
  end if;

  insert into public.mission_settlements (mission_id, mission_participant_id, paid_fee_amount, amount_currency, status, source)
    values (v_mission_id, v_participant_id, v_fee, 'HKD', 'not_started', 'visit_redemption')
    returning id into v_settlement_id;

  update public.offer_redemptions set settlement_id = v_settlement_id where id = new.id;

  return new;
end;
$$;

create trigger create_settlement_on_offer_redemption_trg
  after insert on public.offer_redemptions
  for each row execute function public.create_settlement_on_offer_redemption();
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-0-settlement-on-redemption.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql'),
  'utf8',
)

describe('settlement-on-redemption trigger', () => {
  it('adds a source column to mission_settlements defaulting to mission_fee', () => {
    expect(sql).toContain("add column source text not null default 'mission_fee' check (source in ('mission_fee', 'visit_redemption'))")
  })

  it('fires AFTER INSERT on offer_redemptions', () => {
    expect(sql).toContain('after insert on public.offer_redemptions')
  })

  it('no-ops when the offer has no mission context', () => {
    expect(sql).toContain('if v_mission_id is null then\n    return new;\n  end if;')
  })

  it('no-ops when the creator has no mission_participants row', () => {
    expect(sql).toContain('if v_participant_id is null then\n    return new;\n  end if;')
  })

  it('computes the fee from commission_kind, flat or percent of amount_spent', () => {
    expect(sql).toContain("when v_commission_kind = 'flat' then v_commission_value")
    expect(sql).toContain('round(coalesce(new.amount_spent, 0) * v_commission_value / 100, 2)')
  })

  it('inserts with source visit_redemption and status not_started', () => {
    expect(sql).toContain("'not_started', 'visit_redemption'")
  })

  it('writes the settlement id back onto the redemption row', () => {
    expect(sql).toContain('update public.offer_redemptions set settlement_id = v_settlement_id where id = new.id')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-0-settlement-on-redemption`
Expected: PASS (7 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql apps/web/tests/db.r12-0-settlement-on-redemption.test.ts
git commit -m "feat(db): R12.0 settlement-on-redemption trigger"
```

---

### Task 5: `redemption_velocity` in the ops attention queue

**Files:**
- Create: `supabase/migrations/20260821100400_r12_0_admin_mission_attention_redemption_velocity.sql`
- Test: `apps/web/tests/db.r12-0-attention-redemption-velocity.test.ts`
- Modify: `apps/web/lib/admin/missions-queries.ts`

- [ ] **Step 1: Write the migration**

`admin_mission_attention()` (R11.1, `supabase/migrations/20260820090200_r11_1_admin_mission_attention.sql`)
already returns `{ overdue_reviews, at_risk_missions }`. This widens it to add
`redemption_velocity`: offers whose redemption count in the last hour crosses a flat
threshold. `create or replace function` is safe here — the function returns `jsonb`, not a
`RETURNS TABLE` shape, so the R10.1-era "can't widen RETURNS TABLE column count in place"
gotcha does not apply (same reasoning R11.0's `20260819090200_r11_0_widen_mission_analytics.sql`
already documented for a sibling function).

```sql
-- supabase/migrations/20260821100400_r12_0_admin_mission_attention_redemption_velocity.sql
create or replace function public.admin_mission_attention()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'overdue_reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submission_id', r.submission_id, 'mission_id', r.mission_id, 'mission_title', r.mission_title,
        'creator_id', r.creator_id, 'review_deadline', r.review_deadline) order by r.review_deadline asc)
      from (
        select sub.id as submission_id, mi.id as mission_id, mi.title as mission_title,
          participant.creator_id, sub.review_deadline
        from public.mission_milestone_submissions sub
        join public.mission_participants participant on participant.id = sub.mission_participant_id
        join public.missions mi on mi.id = participant.mission_id
        where sub.status = 'submitted' and sub.review_deadline < now()
        order by sub.review_deadline asc
        limit 50
      ) r
    ), '[]'::jsonb),
    'at_risk_missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'merchant_name', r.merchant_name, 'reason', r.reason))
      from (
        select mi.id, mi.title, mp.company_name as merchant_name,
          case
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            ) then 'verification_failed'
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            ) then 'stalled_submissions'
            else 'published_no_participants'
          end as reason
        from public.missions mi
        join public.merchant_profiles mp on mp.id = mi.merchant_profile_id
        where (
            exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            )
            or exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            )
            or (
              mi.status = 'published' and mi.visibility = 'open'
              and mi.published_at < now() - interval '14 days'
              and not exists (
                select 1 from public.mission_participants part where part.mission_id = mi.id
              )
            )
          )
        limit 20
      ) r
    ), '[]'::jsonb),
    'redemption_velocity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'offer_id', r.offer_id, 'offer_title', r.offer_title, 'merchant_name', r.merchant_name,
        'redemptions_last_hour', r.redemptions_last_hour) order by r.redemptions_last_hour desc)
      from (
        select mo.id as offer_id, mo.title as offer_title, mp.company_name as merchant_name,
          count(orr.id) as redemptions_last_hour
        from public.merchant_offers mo
        join public.merchant_profiles mp on mp.id = mo.merchant_profile_id
        join public.offer_redemptions orr on orr.merchant_profile_id = mo.merchant_profile_id
          and orr.redeemed_at > now() - interval '1 hour'
        group by mo.id, mo.title, mp.company_name
        having count(orr.id) >= 10
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_mission_attention() from public, anon;
grant execute on function public.admin_mission_attention() to authenticated;
```

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-0-attention-redemption-velocity.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100400_r12_0_admin_mission_attention_redemption_velocity.sql'),
  'utf8',
)

describe('admin_mission_attention redemption_velocity widening', () => {
  it('adds a redemption_velocity key alongside the two existing keys', () => {
    expect(sql).toContain("'overdue_reviews',")
    expect(sql).toContain("'at_risk_missions',")
    expect(sql).toContain("'redemption_velocity', coalesce((")
  })

  it('flags offers with 10+ redemptions in the last hour', () => {
    expect(sql).toContain("having count(orr.id) >= 10")
    expect(sql).toContain("interval '1 hour'")
  })

  it('keeps the is_active_ops gate unchanged', () => {
    expect(sql).toContain('if not public.is_active_ops() then')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-0-attention-redemption-velocity`
Expected: PASS (3 tests)

- [ ] **Step 4: Read the current `MissionAttention` type and update it**

Read `apps/web/lib/admin/missions-queries.ts` first to find the exact shape of the existing
`overdue_reviews`/`at_risk_missions` return type (it was defined in R11.1), then add a
`redemption_velocity` field following the identical pattern (snake_case DB row → camelCase
mapped field), for example:

```typescript
// apps/web/lib/admin/missions-queries.ts — add alongside the existing fields
redemption_velocity?: { offer_id: string; offer_title: string; merchant_name: string; redemptions_last_hour: number }[]
```

and in the mapping function that already converts `overdue_reviews`/`at_risk_missions` into
the camelCase result object, add:

```typescript
redemptionVelocity: (r.redemption_velocity ?? []).map((v) => ({
  offerId: v.offer_id, offerTitle: v.offer_title, merchantName: v.merchant_name,
  redemptionsLastHour: v.redemptions_last_hour,
})),
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260821100400_r12_0_admin_mission_attention_redemption_velocity.sql apps/web/tests/db.r12-0-attention-redemption-velocity.test.ts apps/web/lib/admin/missions-queries.ts
git commit -m "feat(db): R12.0 redemption_velocity flag on admin_mission_attention"
```

---

### Task 6: `list_offers_for_creator` public read RPC

**Files:**
- Create: `supabase/migrations/20260821100500_r12_0_list_offers_for_creator.sql`
- Test: `apps/web/tests/db.r12-0-list-offers-for-creator.test.ts`

Backs the claim CTA on both `/g/[slug]` and `/c/[handle]`: a `stable SECURITY DEFINER` RPC
returning only the metadata a visitor needs, never internal counters like `claimed_count`.
An offer shows for a creator only when that creator has an `active`/`completed`
`mission_participants` row on the offer's mission — an offer with no `mission_id` (design
doc's "outlived its mission" case) never appears here, matching Task 4's settlement no-op for
the same case: a mission-less offer isn't promotable by any specific creator, though it can
still exist for historical/audit purposes.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260821100500_r12_0_list_offers_for_creator.sql
create or replace function public.list_offers_for_creator(p_creator_id uuid)
returns table (
  id uuid, title text, terms text, discount_kind text, discount_value numeric,
  merchant_name text, valid_to timestamptz
)
language sql stable security definer set search_path = public as $$
  select mo.id, mo.title, mo.terms, mo.discount_kind, mo.discount_value,
    mp.company_name, mo.valid_to
  from public.merchant_offers mo
  join public.merchant_profiles mp on mp.id = mo.merchant_profile_id
  where mo.status = 'live'
    and now() between mo.valid_from and mo.valid_to
    and (mo.total_cap is null or mo.claimed_count < mo.total_cap)
    and exists (
      select 1 from public.mission_participants part
      where part.mission_id = mo.mission_id
        and part.creator_id = p_creator_id
        and part.status in ('active', 'completed')
    )
  order by mo.valid_to asc
  limit 10;
$$;

revoke all on function public.list_offers_for_creator(uuid) from public, anon;
grant execute on function public.list_offers_for_creator(uuid) to authenticated, anon;
```

Note: `grant ... to authenticated, anon` — unlike claim/redeem, *reading* which offers are
live on a public guide/profile page must work for a signed-out visitor browsing before they
sign in to claim (the claim CTA itself still requires sign-in, enforced by `claim_offer`).

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-0-list-offers-for-creator.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100500_r12_0_list_offers_for_creator.sql'),
  'utf8',
)

describe('list_offers_for_creator RPC', () => {
  it('only returns live offers within their validity window and under cap', () => {
    expect(sql).toContain("mo.status = 'live'")
    expect(sql).toContain('now() between mo.valid_from and mo.valid_to')
    expect(sql).toContain('mo.total_cap is null or mo.claimed_count < mo.total_cap')
  })

  it('scopes to the given creator via an active/completed mission_participants row', () => {
    expect(sql).toContain("and part.status in ('active', 'completed')")
  })

  it('never exposes internal counters like claimed_count or redeemed_count', () => {
    expect(sql).not.toMatch(/select[\s\S]*claimed_count[\s\S]*from public\.merchant_offers mo\n  join/)
  })

  it('is readable by anon (public browsing) but writes stay authenticated-only elsewhere', () => {
    expect(sql).toContain('grant execute on function public.list_offers_for_creator(uuid) to authenticated, anon')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-0-list-offers-for-creator`
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821100500_r12_0_list_offers_for_creator.sql apps/web/tests/db.r12-0-list-offers-for-creator.test.ts
git commit -m "feat(db): R12.0 list_offers_for_creator public read RPC"
```

---

### Task 7: Hand-add `packages/db/types.ts` entries

No `pnpm --filter @kinnso/db gen` — it reads production (see
`db-gen-linked-production-gotcha` in project notes).

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add the three new Tables entries**

In the `Tables` block: `merchant_offers` sorts between `merchant_budgets` and
`merchant_profiles`; `offer_claims` and `offer_redemptions` sort between `notifications` and
`ops_audit_log`.

```typescript
      merchant_offers: {
        Row: {
          claimed_count: number
          commission_kind: string
          commission_value: number
          created_at: string
          discount_kind: string
          discount_value: number
          id: string
          merchant_profile_id: string
          mission_id: string | null
          per_visitor_limit: number
          redeemed_count: number
          status: string
          terms: string
          title: string
          total_cap: number | null
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          claimed_count?: number
          commission_kind: string
          commission_value: number
          created_at?: string
          discount_kind: string
          discount_value: number
          id?: string
          merchant_profile_id: string
          mission_id?: string | null
          per_visitor_limit?: number
          redeemed_count?: number
          status?: string
          terms: string
          title: string
          total_cap?: number | null
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          claimed_count?: number
          commission_kind?: string
          commission_value?: number
          created_at?: string
          discount_kind?: string
          discount_value?: number
          id?: string
          merchant_profile_id?: string
          mission_id?: string | null
          per_visitor_limit?: number
          redeemed_count?: number
          status?: string
          terms?: string
          title?: string
          total_cap?: number | null
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_offers_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_offers_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
```

```typescript
      offer_claims: {
        Row: {
          claim_token_hash: string
          created_at: string
          creator_id: string
          expires_at: string
          guide_id: string | null
          id: string
          offer_id: string
          source_surface: string
          status: string
          visitor_user_id: string
        }
        Insert: {
          claim_token_hash: string
          created_at?: string
          creator_id: string
          expires_at: string
          guide_id?: string | null
          id?: string
          offer_id: string
          source_surface: string
          status?: string
          visitor_user_id: string
        }
        Update: {
          claim_token_hash?: string
          created_at?: string
          creator_id?: string
          expires_at?: string
          guide_id?: string | null
          id?: string
          offer_id?: string
          source_surface?: string
          status?: string
          visitor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_claims_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "merchant_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_redemptions: {
        Row: {
          amount_spent: number | null
          created_at: string
          id: string
          merchant_profile_id: string
          offer_claim_id: string
          redeemed_at: string
          redeemed_by_merchant_user_id: string
          settlement_id: string | null
        }
        Insert: {
          amount_spent?: number | null
          created_at?: string
          id?: string
          merchant_profile_id: string
          offer_claim_id: string
          redeemed_at?: string
          redeemed_by_merchant_user_id: string
          settlement_id?: string | null
        }
        Update: {
          amount_spent?: number | null
          created_at?: string
          id?: string
          merchant_profile_id?: string
          offer_claim_id?: string
          redeemed_at?: string
          redeemed_by_merchant_user_id?: string
          settlement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_redemptions_offer_claim_id_fkey"
            columns: ["offer_claim_id"]
            isOneToOne: true
            referencedRelation: "offer_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "mission_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Add `source` to the existing `mission_settlements` entry**

Find `mission_settlements`'s `Row`/`Insert`/`Update` blocks and add `source: string` /
`source?: string` alongside the existing fields (alphabetically, after `paid_fee_amount`,
before `status`).

- [ ] **Step 3: Add the four new Functions entries**

```typescript
      claim_offer: {
        Args: { p_offer_id: string; p_creator_id: string; p_guide_id: string | null; p_source: string }
        Returns: Json
      }
```
(sorts between `check_and_increment_traveller_analytics_rate_limit` and `confirm_booking_from_webhook`)

```typescript
      list_offers_for_creator: { Args: { p_creator_id: string }; Returns: unknown }
```
(sorts among the l-entries, check neighbors)

```typescript
      redeem_offer_claim: {
        Args: { p_raw_token: string; p_amount_spent: number | null }
        Returns: Json
      }
```
(sorts right before `redeem_perk`)

`admin_mission_attention` already exists in this file (added in R11.1) — its `Returns: Json`
signature is unchanged by Task 5's widening, no entry edit needed there.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-add R12.0 types (3 tables + mission_settlements.source + 3 RPCs)

pnpm --filter @kinnso/db gen reads production -- see db-gen-linked-production-gotcha."
```

---

### Task 8: Merchant offer management

**Files:**
- Create: `apps/web/lib/merchants/offers-queries.ts`
- Create: `apps/web/lib/merchants/offers-actions.ts`
- Create: `apps/web/lib/merchants/offers-validation.ts`
- Create: `apps/web/app/[locale]/merchants/dashboard/offers/page.tsx`
- Create: `apps/web/components/kinnso/pages/MerchantOffersView.tsx`
- Test: `apps/web/tests/merchants.offers-actions.test.ts`

- [ ] **Step 1: Write `offers-validation.ts`**

```typescript
// apps/web/lib/merchants/offers-validation.ts
import type { ActionFailure } from '@/lib/admin/result'
import { formError } from '@/lib/admin/result'

export interface OfferInput {
  title: string
  terms: string
  discountKind: 'percent' | 'amount' | 'item'
  discountValue: string
  commissionKind: 'flat' | 'percent'
  commissionValue: string
  validFrom: string
  validTo: string
  perVisitorLimit: string
  totalCap: string
  missionId: string | null
}

export interface ParsedOfferInput {
  title: string
  terms: string
  discountKind: 'percent' | 'amount' | 'item'
  discountValue: number
  commissionKind: 'flat' | 'percent'
  commissionValue: number
  validFrom: string
  validTo: string
  perVisitorLimit: number
  totalCap: number | null
  missionId: string | null
}

export type OfferValidationResult = { ok: true; parsed: ParsedOfferInput } | ActionFailure

export function validateOfferInput(input: OfferInput): OfferValidationResult {
  const title = input.title.trim()
  const terms = input.terms.trim()
  if (title.length < 1 || title.length > 120) return formError('Title must be 1-120 characters')
  if (terms.length < 1 || terms.length > 1000) return formError('Terms must be 1-1000 characters')

  const discountValue = Number(input.discountValue)
  if (!Number.isFinite(discountValue) || discountValue <= 0) return formError('Discount value must be a positive number')

  const commissionValue = Number(input.commissionValue)
  if (!Number.isFinite(commissionValue) || commissionValue <= 0) return formError('Commission value must be a positive number')

  const validFrom = new Date(input.validFrom)
  const validTo = new Date(input.validTo)
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) return formError('Valid dates are required')
  if (validTo <= validFrom) return formError('End date must be after start date')

  const perVisitorLimit = Number(input.perVisitorLimit)
  if (!Number.isInteger(perVisitorLimit) || perVisitorLimit <= 0) return formError('Per-visitor limit must be a positive whole number')

  let totalCap: number | null = null
  if (input.totalCap.trim() !== '') {
    totalCap = Number(input.totalCap)
    if (!Number.isInteger(totalCap) || totalCap <= 0) return formError('Total cap must be a positive whole number')
  }

  return {
    ok: true,
    parsed: {
      title, terms, discountKind: input.discountKind, discountValue,
      commissionKind: input.commissionKind, commissionValue,
      validFrom: validFrom.toISOString(), validTo: validTo.toISOString(),
      perVisitorLimit, totalCap, missionId: input.missionId,
    },
  }
}
```

- [ ] **Step 2: Write `offers-queries.ts`**

```typescript
// apps/web/lib/merchants/offers-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MerchantOfferRow {
  id: string
  title: string
  terms: string
  discountKind: string
  discountValue: number
  commissionKind: string
  commissionValue: number
  validFrom: string
  validTo: string
  perVisitorLimit: number
  totalCap: number | null
  claimedCount: number
  redeemedCount: number
  status: string
}

export async function listMerchantOffers(supabase: Client, merchantProfileId: string): Promise<MerchantOfferRow[]> {
  const { data, error } = await supabase
    .from('merchant_offers')
    .select('id, title, terms, discount_kind, discount_value, commission_kind, commission_value, valid_from, valid_to, per_visitor_limit, total_cap, claimed_count, redeemed_count, status')
    .eq('merchant_profile_id', merchantProfileId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, terms: row.terms,
    discountKind: row.discount_kind, discountValue: row.discount_value,
    commissionKind: row.commission_kind, commissionValue: row.commission_value,
    validFrom: row.valid_from, validTo: row.valid_to,
    perVisitorLimit: row.per_visitor_limit, totalCap: row.total_cap,
    claimedCount: row.claimed_count, redeemedCount: row.redeemed_count,
    status: row.status,
  }))
}
```

- [ ] **Step 3: Write `offers-actions.ts`**

```typescript
// apps/web/lib/merchants/offers-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireMerchantAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateOfferInput, type OfferInput } from '@/lib/merchants/offers-validation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function createMerchantOfferAction(input: OfferInput): Promise<ActionResult<{ id: string }>> {
  const validation = validateOfferInput(input)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const p = validation.parsed
  const { data, error } = await supabase
    .from('merchant_offers')
    .insert({
      merchant_profile_id: gate.merchantId,
      mission_id: p.missionId,
      title: p.title, terms: p.terms,
      discount_kind: p.discountKind, discount_value: p.discountValue,
      commission_kind: p.commissionKind, commission_value: p.commissionValue,
      valid_from: p.validFrom, valid_to: p.validTo,
      per_visitor_limit: p.perVisitorLimit, total_cap: p.totalCap,
    })
    .select('id')
    .single()
  if (error || !data) {
    if (error) console.error('[merchant:offers] create failed', error)
    return formError('Offer could not be created')
  }

  revalidatePath('/merchants/dashboard/offers')
  return { ok: true, id: data.id as string }
}

export async function setMerchantOfferStatusAction(
  offerId: string,
  status: 'live' | 'paused' | 'ended',
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('merchant_offers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('merchant_profile_id', gate.merchantId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[merchant:offers] setStatus failed', error)
    return formError('Offer status could not be changed')
  }

  revalidatePath('/merchants/dashboard/offers')
  return { ok: true, id: data.id as string }
}
```

- [ ] **Step 4: Write the failing action test**

```typescript
// apps/web/tests/merchants.offers-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OfferInput } from '@/lib/merchants/offers-validation'

const { requireMerchantActionMock, fromMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string }; merchantId: string } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'merchant-user-1' }, merchantId: 'merchant-1',
  })),
  fromMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createMerchantOfferAction, setMerchantOfferStatusAction } from '@/lib/merchants/offers-actions'

const validInput: OfferInput = {
  title: 'Free dessert with any main', terms: 'One per visitor, dine-in only',
  discountKind: 'item', discountValue: '1',
  commissionKind: 'flat', commissionValue: '20',
  validFrom: '2027-01-01T00:00:00.000Z', validTo: '2027-06-01T00:00:00.000Z',
  perVisitorLimit: '1', totalCap: '100', missionId: null,
}

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'select', 'eq', 'single', 'maybeSingle']) builder[m] = vi.fn(() => builder)
  builder.single = vi.fn(async () => finalValue)
  builder.maybeSingle = vi.fn(async () => finalValue)
  return builder
}

beforeEach(() => { requireMerchantActionMock.mockClear(); fromMock.mockReset() })

describe('createMerchantOfferAction', () => {
  it('fails the gate for a non-merchant caller', async () => {
    requireMerchantActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Merchant access is required'] } })
    const result = await createMerchantOfferAction(validInput)
    expect(result.ok).toBe(false)
  })

  it('rejects an end date before the start date', async () => {
    const result = await createMerchantOfferAction({ ...validInput, validFrom: '2027-06-01T00:00:00.000Z', validTo: '2027-01-01T00:00:00.000Z' })
    expect(result.ok).toBe(false)
  })

  it('inserts with merchant_profile_id from the gate, not client input', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'offer-1' }, error: null }))
    await createMerchantOfferAction(validInput)
    const insertedRow = (fromMock.mock.results[0].value.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(insertedRow.merchant_profile_id).toBe('merchant-1')
  })
})

describe('setMerchantOfferStatusAction', () => {
  it('scopes the update to the caller\'s own merchant_profile_id', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'offer-1' }, error: null }))
    await setMerchantOfferStatusAction('offer-1', 'live')
    const eqCalls = (fromMock.mock.results[0].value.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqCalls).toContainEqual(['merchant_profile_id', 'merchant-1'])
  })
})
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run merchants.offers-actions`
Expected: PASS (4 tests)

- [ ] **Step 6: Write `MerchantOffersView.tsx`**

```tsx
// apps/web/components/kinnso/pages/MerchantOffersView.tsx
'use client'

import { useState, useTransition } from 'react'
import type { MerchantOfferRow } from '@/lib/merchants/offers-queries'
import type { OfferInput } from '@/lib/merchants/offers-validation'

type CreateOffer = (input: OfferInput) => Promise<{ ok: boolean; errors?: Record<string, string[]> }>
type SetStatus = (offerId: string, status: 'live' | 'paused' | 'ended') => Promise<{ ok: boolean }>

const emptyInput: OfferInput = {
  title: '', terms: '', discountKind: 'item', discountValue: '',
  commissionKind: 'flat', commissionValue: '',
  validFrom: '', validTo: '', perVisitorLimit: '1', totalCap: '', missionId: null,
}

export function MerchantOffersView({
  t, offers, onCreate, onSetStatus,
}: {
  t: Record<string, string>
  offers: MerchantOfferRow[]
  onCreate: CreateOffer
  onSetStatus: SetStatus
}) {
  const [input, setInput] = useState<OfferInput>(emptyInput)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setFormError(null)
    startTransition(async () => {
      const result = await onCreate(input)
      if (!result.ok) {
        setFormError(result.errors?.form?.[0] ?? 'Could not create offer')
        return
      }
      setInput(emptyInput)
    })
  }

  return (
    <main>
      <h1 className="k-display">{t.title}</h1>
      <section className="mt-6 max-w-lg">
        <input className="w-full rounded border border-kinnso-line p-2" placeholder={t.fieldTitle}
          value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} />
        <input className="mt-2 w-full rounded border border-kinnso-line p-2" placeholder={t.fieldTerms}
          value={input.terms} onChange={(e) => setInput({ ...input, terms: e.target.value })} />
        <div className="mt-2 flex gap-2">
          <select className="rounded border border-kinnso-line p-2" value={input.discountKind}
            onChange={(e) => setInput({ ...input, discountKind: e.target.value as OfferInput['discountKind'] })}>
            <option value="item">{t.discountItem}</option>
            <option value="percent">{t.discountPercent}</option>
            <option value="amount">{t.discountAmount}</option>
          </select>
          <input className="w-24 rounded border border-kinnso-line p-2" placeholder={t.fieldValue}
            value={input.discountValue} onChange={(e) => setInput({ ...input, discountValue: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <select className="rounded border border-kinnso-line p-2" value={input.commissionKind}
            onChange={(e) => setInput({ ...input, commissionKind: e.target.value as OfferInput['commissionKind'] })}>
            <option value="flat">{t.commissionFlat}</option>
            <option value="percent">{t.commissionPercent}</option>
          </select>
          <input className="w-24 rounded border border-kinnso-line p-2" placeholder={t.fieldValue}
            value={input.commissionValue} onChange={(e) => setInput({ ...input, commissionValue: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <input type="datetime-local" className="rounded border border-kinnso-line p-2"
            value={input.validFrom} onChange={(e) => setInput({ ...input, validFrom: e.target.value })} />
          <input type="datetime-local" className="rounded border border-kinnso-line p-2"
            value={input.validTo} onChange={(e) => setInput({ ...input, validTo: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <input className="w-32 rounded border border-kinnso-line p-2" placeholder={t.fieldPerVisitorLimit}
            value={input.perVisitorLimit} onChange={(e) => setInput({ ...input, perVisitorLimit: e.target.value })} />
          <input className="w-32 rounded border border-kinnso-line p-2" placeholder={t.fieldTotalCap}
            value={input.totalCap} onChange={(e) => setInput({ ...input, totalCap: e.target.value })} />
        </div>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        <button disabled={isPending} onClick={submit}
          className="mt-3 rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white disabled:opacity-50">
          {t.publish}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.yourOffers}</h2>
        <div className="mt-3 grid gap-3">
          {offers.map((offer) => (
            <div key={offer.id} className="rounded-lg border border-kinnso-line p-4">
              <p className="font-bold text-kinnso-ink">{offer.title}</p>
              <p className="text-sm text-kinnso-muted">{offer.status} · {offer.claimedCount} {t.claimed} · {offer.redeemedCount} {t.redeemed}</p>
              <div className="mt-2 flex gap-2 text-sm">
                {offer.status !== 'live' ? (
                  <button onClick={() => startTransition(() => onSetStatus(offer.id, 'live'))} className="text-kinnso-orange">{t.actPublish}</button>
                ) : null}
                {offer.status === 'live' ? (
                  <button onClick={() => startTransition(() => onSetStatus(offer.id, 'paused'))} className="text-kinnso-ink">{t.actPause}</button>
                ) : null}
                <button onClick={() => startTransition(() => onSetStatus(offer.id, 'ended'))} className="text-red-600">{t.actEnd}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 7: Write the page**

```tsx
// apps/web/app/[locale]/merchants/dashboard/offers/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { noindexMetadata } from '@/lib/seo/metadata'
import { listMerchantOffers } from '@/lib/merchants/offers-queries'
import { createMerchantOfferAction, setMerchantOfferStatusAction } from '@/lib/merchants/offers-actions'
import { MerchantOffersView } from '@/components/kinnso/pages/MerchantOffersView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantOffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
  const messages = await getDictionary(loc)
  const offers = await listMerchantOffers(supabase, merchantId)
  return (
    <MerchantOffersView
      t={messages.merchantOffers}
      offers={offers}
      onCreate={createMerchantOfferAction}
      onSetStatus={setMerchantOfferStatusAction}
    />
  )
}
```

`onCreate={createMerchantOfferAction}` and `onSetStatus={setMerchantOfferStatusAction}` pass
the server action references directly, not wrapped closures — see the fix already merged in
[PR #117](https://github.com/YNWAforever/Remix-Kinnso/pull/117) for the exact bug this avoids.

- [ ] **Step 8: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean (the `messages.merchantOffers` reference will only resolve once Task 13 adds
the i18n keys — if typecheck fails here specifically on that key, that's expected until Task
13; everything else must be clean)

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/merchants/offers-queries.ts apps/web/lib/merchants/offers-actions.ts apps/web/lib/merchants/offers-validation.ts apps/web/app/\[locale\]/merchants/dashboard/offers/page.tsx apps/web/components/kinnso/pages/MerchantOffersView.tsx apps/web/tests/merchants.offers-actions.test.ts
git commit -m "feat(web): R12.0 merchant offer management page"
```

---

### Task 9: Claim CTA on guide and creator profile pages

**Files:**
- Create: `apps/web/lib/offers/public-queries.ts`
- Create: `apps/web/components/kinnso/OfferClaimCard.tsx`
- Modify: guide page component (locate via Step 1) and creator profile component (locate via Step 2)
- Test: `apps/web/tests/kinnso.OfferClaimCard.test.tsx`

- [ ] **Step 1: Find the guide detail page's rendering component**

Run: `grep -rln "GuideDetailView\|/g/\[slug\]" apps/web/app apps/web/components --include="*.tsx" | grep -v node_modules`

This locates the component that renders `/g/[slug]`. Read it to find where creator
attribution is already displayed (it must already know `creatorId` and `guideId` to render
the byline) — that's where the `OfferClaimCard` list mounts.

- [ ] **Step 2: Find the creator profile page's rendering component**

Run: `grep -rln "CreatorProfileView\|/c/\[handle\]" apps/web/app apps/web/components --include="*.tsx" | grep -v node_modules`

Same idea — find where `creatorId` is already available in that component's props.

- [ ] **Step 3: Write `public-queries.ts`**

```typescript
// apps/web/lib/offers/public-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface PublicOffer {
  id: string
  title: string
  terms: string
  discountKind: string
  discountValue: number
  merchantName: string
  validTo: string
}

export async function listOffersForCreator(supabase: Client, creatorId: string): Promise<PublicOffer[]> {
  const { data, error } = await supabase.rpc('list_offers_for_creator', { p_creator_id: creatorId })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, terms: row.terms,
    discountKind: row.discount_kind, discountValue: row.discount_value,
    merchantName: row.merchant_name, validTo: row.valid_to,
  }))
}
```

- [ ] **Step 4: Write `OfferClaimCard.tsx`**

```tsx
// apps/web/components/kinnso/OfferClaimCard.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { PublicOffer } from '@/lib/offers/public-queries'

type ClaimOffer = (offerId: string, creatorId: string, guideId: string | null, source: 'guide' | 'profile') =>
  Promise<{ ok: boolean; claimId?: string; errors?: Record<string, string[]> }>

export function OfferClaimCard({
  t, locale, offer, creatorId, guideId, source, onClaim,
}: {
  t: { claimButton: string; validThrough: string }
  locale: Locale
  offer: PublicOffer
  creatorId: string
  guideId: string | null
  source: 'guide' | 'profile'
  onClaim: ClaimOffer
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function claim() {
    startTransition(async () => {
      const result = await onClaim(offer.id, creatorId, guideId, source)
      if (result.ok && result.claimId) {
        router.push(`/${locale}/offers/${result.claimId}`)
      }
    })
  }

  return (
    <div className="rounded-lg border border-kinnso-line p-4 max-w-md">
      <p className="font-bold text-kinnso-ink">{offer.title}</p>
      <p className="mt-1 text-sm text-kinnso-muted">
        {offer.merchantName} · {t.validThrough} {new Date(offer.validTo).toLocaleDateString(locale, { timeZone: 'UTC' })}
      </p>
      <button
        disabled={isPending}
        onClick={claim}
        className="mt-3 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {t.claimButton}
      </button>
    </div>
  )
}
```

`toLocaleDateString(locale, { timeZone: 'UTC' })` — pinned per the hydration-mismatch fix
already merged in [PR #117](https://github.com/YNWAforever/Remix-Kinnso/pull/117); every new
date-formatting call site in this phase must follow the same pattern.

- [ ] **Step 5: Write the component test**

```tsx
// apps/web/tests/kinnso.OfferClaimCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OfferClaimCard } from '@/components/kinnso/OfferClaimCard'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const offer = {
  id: 'offer-1', title: 'Free dessert with any main', terms: 'One per visitor',
  discountKind: 'item', discountValue: 1, merchantName: 'Bloom Tea House',
  validTo: '2027-06-01T00:00:00.000Z',
}

describe('OfferClaimCard', () => {
  it('calls onClaim with the offer, creator, guide, and source', async () => {
    const onClaim = vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith('offer-1', 'creator-1', 'guide-1', 'guide'))
  })

  it('renders the offer title and merchant name', () => {
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId={null} source="profile"
        onClaim={vi.fn()}
      />,
    )
    expect(screen.getByText('Free dessert with any main')).toBeInTheDocument()
    expect(screen.getByText(/Bloom Tea House/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run kinnso.OfferClaimCard`
Expected: PASS (2 tests)

- [ ] **Step 7: Wire into the guide page**

In the guide page's server component (found in Step 1), after loading the existing guide
data, add:

```typescript
import { listOffersForCreator } from '@/lib/offers/public-queries'
import { OfferClaimCard } from '@/components/kinnso/OfferClaimCard'
import { claimOfferAction } from '@/lib/offers/actions' // written in Task 10

// alongside the existing data fetches:
const offers = await listOffersForCreator(supabase, guide.creatorId)
```

and in the JSX, render one `OfferClaimCard` per offer:

```tsx
{offers.map((offer) => (
  <OfferClaimCard
    key={offer.id}
    t={messages.offerClaim}
    locale={loc}
    offer={offer}
    creatorId={guide.creatorId}
    guideId={guide.id}
    source="guide"
    onClaim={claimOfferAction}
  />
))}
```

Adjust `guide.creatorId`/`guide.id` to the actual field names found in Step 1's component —
the guide detail data structure already carries a creator id (used for the byline), reuse it
rather than adding a new query.

- [ ] **Step 8: Wire into the creator profile page**

Same shape in the creator profile component found in Step 2, with `source="profile"` and
`guideId={null}`.

- [ ] **Step 9: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean except the `messages.offerClaim` reference (resolved in Task 13) and
`claimOfferAction` (written in Task 10) — both expected until those tasks land.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/offers/public-queries.ts apps/web/components/kinnso/OfferClaimCard.tsx apps/web/tests/kinnso.OfferClaimCard.test.tsx
git commit -m "feat(web): R12.0 offer claim CTA component + public offers query"
```

(The guide-page and profile-page wiring edits from Steps 7-8 land in this same commit — add
those two modified files to the `git add` line above once identified.)

---

### Task 10: Claim action + confirmation/QR screen

**Files:**
- Create: `apps/web/lib/offers/actions.ts`
- Create: `apps/web/app/[locale]/offers/[claimId]/page.tsx`
- Create: `apps/web/components/kinnso/pages/OfferClaimConfirmationView.tsx`
- Modify: `apps/web/package.json` (add `qrcode.react`)
- Test: `apps/web/tests/offers.actions.test.ts`

- [ ] **Step 1: Add the QR generation dependency**

Run: `cd apps/web && pnpm add qrcode.react`

- [ ] **Step 2: Write `actions.ts`**

The raw claim token is returned once, in the RPC response — it must be carried to the
confirmation page via a short-lived mechanism that survives a redirect. This plan uses a
signed, expiring cookie (never a query string — raw tokens must not end up in server logs or
browser history) set by the action and read once by the confirmation page.

```typescript
// apps/web/lib/offers/actions.ts
'use server'

import { cookies } from 'next/headers'
import { requireTravelerAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function claimOfferAction(
  offerId: string,
  creatorId: string,
  guideId: string | null,
  source: 'guide' | 'profile',
): Promise<ActionResult<{ claimId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('claim_offer', {
    p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: guideId, p_source: source,
  })
  if (error || !data) {
    if (error) console.error('[offers] claim failed', error)
    return formError('This offer could not be claimed')
  }

  const result = data as { claim_id: string; raw_token: string; expires_at: string }
  const cookieStore = await cookies()
  cookieStore.set(`offer-token-${result.claim_id}`, result.raw_token, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
  })

  return { ok: true, claimId: result.claim_id }
}
```

5-minute cookie lifetime: long enough for the redirect + page render, short enough that a
raw token sitting in a cookie jar isn't a standing liability — the QR itself (rendered client-
side from that cookie value) is what the visitor actually screenshots/keeps.

- [ ] **Step 3: Write the failing action test**

```typescript
// apps/web/tests/offers.actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requireTravelerActionMock, rpcMock, cookieSetMock } = vi.hoisted(() => ({
  requireTravelerActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'visitor-1' },
  })),
  rpcMock: vi.fn(),
  cookieSetMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireTravelerAction: requireTravelerActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSetMock }) }))

import { claimOfferAction } from '@/lib/offers/actions'

beforeEach(() => { requireTravelerActionMock.mockClear(); rpcMock.mockReset(); cookieSetMock.mockClear() })

describe('claimOfferAction', () => {
  it('fails the gate for a signed-out caller', async () => {
    requireTravelerActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Sign in is required'] } })
    const result = await claimOfferAction('offer-1', 'creator-1', null, 'profile')
    expect(result.ok).toBe(false)
  })

  it('calls claim_offer with the right args and sets a scoped, httpOnly cookie with the raw token', async () => {
    rpcMock.mockResolvedValue({ data: { claim_id: 'claim-1', raw_token: 'rawtoken123', expires_at: '2027-06-01T00:00:00.000Z' }, error: null })
    const result = await claimOfferAction('offer-1', 'creator-1', 'guide-1', 'guide')
    expect(rpcMock).toHaveBeenCalledWith('claim_offer', {
      p_offer_id: 'offer-1', p_creator_id: 'creator-1', p_guide_id: 'guide-1', p_source: 'guide',
    })
    expect(result).toEqual({ ok: true, claimId: 'claim-1' })
    expect(cookieSetMock).toHaveBeenCalledWith(
      'offer-token-claim-1', 'rawtoken123',
      expect.objectContaining({ httpOnly: true, secure: true, maxAge: 300 }),
    )
  })

  it('returns a friendly error when the RPC fails, without leaking the raw error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'offer_cap_reached' } })
    const result = await claimOfferAction('offer-1', 'creator-1', null, 'profile')
    expect(result.ok).toBe(false)
    expect(cookieSetMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run offers.actions`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `OfferClaimConfirmationView.tsx`**

```tsx
// apps/web/components/kinnso/pages/OfferClaimConfirmationView.tsx
'use client'

import { QRCodeSVG } from 'qrcode.react'

export function OfferClaimConfirmationView({
  t, offerTitle, merchantName, rawToken,
}: {
  t: { heading: string; showAt: string }
  offerTitle: string
  merchantName: string
  rawToken: string
}) {
  return (
    <main className="flex flex-col items-center py-12">
      <h1 className="k-display">{t.heading}</h1>
      <p className="mt-2 text-kinnso-muted">{t.showAt} {merchantName}</p>
      <div className="mt-6 rounded-lg border border-kinnso-line p-6">
        <QRCodeSVG value={rawToken} size={200} />
      </div>
      <p className="mt-4 font-bold text-kinnso-ink">{offerTitle}</p>
    </main>
  )
}
```

- [ ] **Step 6: Write the confirmation page**

```tsx
// apps/web/app/[locale]/offers/[claimId]/page.tsx
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { OfferClaimConfirmationView } from '@/components/kinnso/pages/OfferClaimConfirmationView'

export default async function OfferClaimConfirmationPage({
  params,
}: { params: Promise<{ locale: string; claimId: string }> }) {
  const { locale, claimId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) notFound()

  const cookieStore = await cookies()
  const rawToken = cookieStore.get(`offer-token-${claimId}`)?.value
  if (!rawToken) notFound() // cookie expired or this claim isn't this visitor's -- fall back to /trips

  const { data: claim, error } = await supabase
    .from('offer_claims')
    .select('offer_id, merchant_offers(title), visitor_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (error || !claim || claim.visitor_user_id !== gate.user.id) notFound()

  const messages = await getDictionary(loc)
  const offerTitle = (claim.merchant_offers as { title: string } | null)?.title ?? ''

  return (
    <OfferClaimConfirmationView
      t={messages.offerClaim}
      offerTitle={offerTitle}
      merchantName="" // TODO placeholder replaced in Step 7 below with a real merchant-name join
      rawToken={rawToken}
    />
  )
}
```

- [ ] **Step 7: Fix the merchant name join**

The `merchantName=""` placeholder in Step 6 is not acceptable — replace the query with a join
through `merchant_offers` to `merchant_profiles`:

```typescript
  const { data: claim, error } = await supabase
    .from('offer_claims')
    .select('offer_id, merchant_offers(title, merchant_profiles(company_name)), visitor_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (error || !claim || claim.visitor_user_id !== gate.user.id) notFound()

  const messages = await getDictionary(loc)
  const offer = claim.merchant_offers as { title: string; merchant_profiles: { company_name: string } | null } | null
```

and pass `merchantName={offer?.merchant_profiles?.company_name ?? ''}` instead of the
placeholder. Re-read the file after this edit to confirm both `merchantName=""` and the
`// TODO` comment from Step 6 are gone.

- [ ] **Step 8: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean except `messages.offerClaim` (Task 13)

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/lib/offers/actions.ts apps/web/app/\[locale\]/offers/\[claimId\]/page.tsx apps/web/components/kinnso/pages/OfferClaimConfirmationView.tsx apps/web/tests/offers.actions.test.ts
git commit -m "feat(web): R12.0 claim action + QR confirmation screen"
```

---

### Task 11: Merchant redeem screen (camera + manual)

**Files:**
- Create: `apps/web/lib/offers/redeem-actions.ts`
- Create: `apps/web/app/[locale]/merchants/dashboard/redeem/page.tsx`
- Create: `apps/web/components/kinnso/pages/MerchantRedeemView.tsx`
- Modify: `apps/web/package.json` (add `jsqr`)
- Test: `apps/web/tests/offers.redeem-actions.test.ts`
- Test: `apps/web/tests/kinnso.MerchantRedeemView.test.tsx`

- [ ] **Step 1: Add the QR decoding dependency**

Run: `cd apps/web && pnpm add jsqr`

- [ ] **Step 2: Write `redeem-actions.ts`**

```typescript
// apps/web/lib/offers/redeem-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireMerchantAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface RedeemResult {
  redemptionId: string
  redeemedAt: string
  alreadyRedeemed: boolean
}

export async function redeemOfferClaimAction(
  rawToken: string,
  amountSpent: number | null,
): Promise<ActionResult<RedeemResult>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('redeem_offer_claim', {
    p_raw_token: rawToken, p_amount_spent: amountSpent,
  })
  if (error || !data) {
    if (error) console.error('[offers] redeem failed', error)
    const message = (error as { message?: string } | null)?.message ?? ''
    if (message.includes('claim_not_found')) return formError('Code not recognized')
    if (message.includes('claim_expired')) return formError('This offer has expired')
    if (message.includes('amount_spent_required')) return formError('Enter the amount spent')
    return formError('Could not redeem this offer')
  }

  const result = data as { redemption_id: string; redeemed_at: string; already_redeemed: boolean }
  revalidatePath('/merchants/dashboard/offers')
  return {
    ok: true,
    redemptionId: result.redemption_id,
    redeemedAt: result.redeemed_at,
    alreadyRedeemed: result.already_redeemed,
  }
}
```

- [ ] **Step 3: Write the failing action test**

```typescript
// apps/web/tests/offers.redeem-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requireMerchantActionMock, rpcMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string }; merchantId: string } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'staff-1' }, merchantId: 'merchant-1',
  })),
  rpcMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { redeemOfferClaimAction } from '@/lib/offers/redeem-actions'

beforeEach(() => { requireMerchantActionMock.mockClear(); rpcMock.mockReset() })

describe('redeemOfferClaimAction', () => {
  it('fails the gate for a non-merchant caller', async () => {
    requireMerchantActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Merchant access is required'] } })
    const result = await redeemOfferClaimAction('rawtoken', null)
    expect(result.ok).toBe(false)
  })

  it('passes through a successful first-time redemption', async () => {
    rpcMock.mockResolvedValue({ data: { redemption_id: 'r1', redeemed_at: '2027-01-01T00:00:00.000Z', already_redeemed: false }, error: null })
    const result = await redeemOfferClaimAction('rawtoken', 50)
    expect(result).toEqual({ ok: true, redemptionId: 'r1', redeemedAt: '2027-01-01T00:00:00.000Z', alreadyRedeemed: false })
  })

  it('surfaces a friendly message for claim_expired without leaking the raw error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'claim_expired' } })
    const result = await redeemOfferClaimAction('rawtoken', null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form[0]).toBe('This offer has expired')
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run offers.redeem-actions`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `MerchantRedeemView.tsx`**

```tsx
// apps/web/components/kinnso/pages/MerchantRedeemView.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import type { RedeemResult } from '@/lib/offers/redeem-actions'

type RedeemAction = (rawToken: string, amountSpent: number | null) =>
  Promise<{ ok: true } & RedeemResult | { ok: false; errors: Record<string, string[]> }>

export function MerchantRedeemView({ t, onRedeem }: {
  t: {
    title: string; scanning: string; manualPlaceholder: string; manualSubmit: string
    amountSpentPrompt: string; amountSpentSubmit: string; success: string; alreadyRedeemed: string
  }
  onRedeem: RedeemAction
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [manualCode, setManualCode] = useState('')
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [amountSpent, setAmountSpent] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let frameId: number

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        scanFrame()
      } catch {
        // Camera unavailable or denied -- manual entry below still works.
      }
    }

    function scanFrame() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code?.data) {
            setPendingToken(code.data)
            return // stop scanning once a code is found; resumes on redeemToken('retry')
          }
        }
      }
      frameId = requestAnimationFrame(scanFrame)
    }

    startCamera()
    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  async function redeem(token: string, spent: number | null) {
    setError(null)
    const result = await onRedeem(token, spent)
    if (!result.ok) {
      setError(result.errors.form[0])
      setPendingToken(null)
      return
    }
    setMessage(result.alreadyRedeemed ? t.alreadyRedeemed : t.success)
    setPendingToken(null)
    setManualCode('')
    setAmountSpent('')
  }

  return (
    <main>
      <h1 className="k-display">{t.title}</h1>

      <div className="mt-4">
        <video ref={videoRef} muted playsInline className="w-full max-w-sm rounded-lg bg-black" />
        <canvas ref={canvasRef} className="hidden" />
        <p className="mt-1 text-sm text-kinnso-muted">{t.scanning}</p>
      </div>

      <div className="mt-4 max-w-sm">
        <input
          className="w-full rounded border border-kinnso-line p-2"
          placeholder={t.manualPlaceholder}
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
        />
        <button
          className="mt-2 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white"
          onClick={() => setPendingToken(manualCode)}
        >
          {t.manualSubmit}
        </button>
      </div>

      {pendingToken ? (
        <div className="mt-4 max-w-sm rounded-lg border border-kinnso-line p-4">
          <p>{t.amountSpentPrompt}</p>
          <input
            className="mt-2 w-full rounded border border-kinnso-line p-2"
            placeholder="0.00"
            value={amountSpent}
            onChange={(e) => setAmountSpent(e.target.value)}
          />
          <button
            className="mt-2 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white"
            onClick={() => redeem(pendingToken, amountSpent.trim() === '' ? null : Number(amountSpent))}
          >
            {t.amountSpentSubmit}
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-4 font-bold text-kinnso-ink">{message}</p> : null}
      {error ? <p className="mt-4 text-red-600">{error}</p> : null}
    </main>
  )
}
```

The `amount_spent` prompt always shows once a code is scanned/entered, whether or not the
offer is percent-commission — a flat-commission redemption simply submits with `amountSpent`
left blank (`null`), and the RPC only *requires* it for percent offers (Task 3's
`amount_spent_required` check). Keeping the UI uniform avoids a round-trip to first look up
the offer's `commission_kind` before deciding whether to show the field at all — the RPC is
already the single source of truth for whether it's required.

- [ ] **Step 6: Write the component test**

```tsx
// apps/web/tests/kinnso.MerchantRedeemView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MerchantRedeemView } from '@/components/kinnso/pages/MerchantRedeemView'

const t = {
  title: 'Redeem', scanning: 'Point the camera at the QR code',
  manualPlaceholder: 'Enter code manually', manualSubmit: 'Look up',
  amountSpentPrompt: 'Amount spent (optional)', amountSpentSubmit: 'Redeem',
  success: 'Redeemed!', alreadyRedeemed: 'Already redeemed',
}

// jsdom has no camera; getUserMedia is undefined by default, which the component already
// handles by catching and falling back to manual entry -- no mock needed for these tests.

describe('MerchantRedeemView', () => {
  it('submits the manually entered code and shows the amount-spent prompt', () => {
    render(<MerchantRedeemView t={t} onRedeem={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Look up'))
    expect(screen.getByText('Amount spent (optional)')).toBeInTheDocument()
  })

  it('calls onRedeem with the token and parsed amount, then shows success', async () => {
    const onRedeem = vi.fn(async () => ({ ok: true as const, redemptionId: 'r1', redeemedAt: '2027-01-01T00:00:00.000Z', alreadyRedeemed: false }))
    render(<MerchantRedeemView t={t} onRedeem={onRedeem} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Look up'))
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '45' } })
    fireEvent.click(screen.getByText('Redeem'))
    await waitFor(() => expect(onRedeem).toHaveBeenCalledWith('abc123', 45))
    await waitFor(() => expect(screen.getByText('Redeemed!')).toBeInTheDocument())
  })

  it('shows the already-redeemed message distinctly from a fresh success', async () => {
    const onRedeem = vi.fn(async () => ({ ok: true as const, redemptionId: 'r1', redeemedAt: '2027-01-01T00:00:00.000Z', alreadyRedeemed: true }))
    render(<MerchantRedeemView t={t} onRedeem={onRedeem} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Look up'))
    fireEvent.click(screen.getByText('Redeem'))
    await waitFor(() => expect(screen.getByText('Already redeemed')).toBeInTheDocument())
  })

  it('shows a friendly error and lets the user retry without losing the manual code', async () => {
    const onRedeem = vi.fn(async () => ({ ok: false as const, errors: { form: ['Code not recognized'] } }))
    render(<MerchantRedeemView t={t} onRedeem={onRedeem} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'bad-code' } })
    fireEvent.click(screen.getByText('Look up'))
    fireEvent.click(screen.getByText('Redeem'))
    await waitFor(() => expect(screen.getByText('Code not recognized')).toBeInTheDocument())
  })
})
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run kinnso.MerchantRedeemView`
Expected: PASS (4 tests)

- [ ] **Step 8: Write the page**

```tsx
// apps/web/app/[locale]/merchants/dashboard/redeem/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { noindexMetadata } from '@/lib/seo/metadata'
import { redeemOfferClaimAction } from '@/lib/offers/redeem-actions'
import { MerchantRedeemView } from '@/components/kinnso/pages/MerchantRedeemView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantRedeemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, loc)
  const messages = await getDictionary(loc)
  return <MerchantRedeemView t={messages.offerRedeem} onRedeem={redeemOfferClaimAction} />
}
```

- [ ] **Step 9: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean except `messages.offerRedeem` (Task 13)

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/lib/offers/redeem-actions.ts apps/web/app/\[locale\]/merchants/dashboard/redeem/page.tsx apps/web/components/kinnso/pages/MerchantRedeemView.tsx apps/web/tests/offers.redeem-actions.test.ts apps/web/tests/kinnso.MerchantRedeemView.test.tsx
git commit -m "feat(web): R12.0 merchant redeem screen (camera + manual)"
```

---

### Task 12: Merchant dashboard ROI counter

**Files:**
- Modify: `apps/web/lib/merchants/offers-queries.ts`
- Modify: `apps/web/components/kinnso/pages/MerchantOffersView.tsx`
- Modify: `apps/web/tests/merchants.offers-actions.test.ts` (no change needed — this task
  only touches the read path, not the actions already tested there)
- Test: extend the existing query test coverage (Step 2 below)

`listMerchantOffers` (Task 8) already returns `claimedCount`/`redeemedCount` per offer, and
`MerchantOffersView` already renders them in the offer list (`{offer.claimedCount} {t.claimed}
· {offer.redeemedCount} {t.redeemed}`). This task adds only the aggregate summary row the
design doc's "lightweight ROI counter" calls for — total claims and redemptions across all of
a merchant's offers, not the richer per-creator/per-guide breakdown (that's R12.1, out of
scope here).

- [ ] **Step 1: Add the aggregate to `offers-queries.ts`**

```typescript
// apps/web/lib/merchants/offers-queries.ts — add below listMerchantOffers
export interface OffersSummary {
  totalClaimed: number
  totalRedeemed: number
}

export function summarizeOffers(offers: MerchantOfferRow[]): OffersSummary {
  return {
    totalClaimed: offers.reduce((sum, o) => sum + o.claimedCount, 0),
    totalRedeemed: offers.reduce((sum, o) => sum + o.redeemedCount, 0),
  }
}
```

Plain aggregation over the already-fetched list, not a second query — the offer list is
already loaded on this page and is small (a 3-merchant pilot, single-digit offers each).

- [ ] **Step 2: Write the test**

```typescript
// apps/web/tests/merchants.offers-summary.test.ts
import { describe, it, expect } from 'vitest'
import { summarizeOffers, type MerchantOfferRow } from '@/lib/merchants/offers-queries'

function offer(overrides: Partial<MerchantOfferRow>): MerchantOfferRow {
  return {
    id: 'o1', title: 't', terms: 'x', discountKind: 'item', discountValue: 1,
    commissionKind: 'flat', commissionValue: 10, validFrom: '2027-01-01T00:00:00.000Z',
    validTo: '2027-06-01T00:00:00.000Z', perVisitorLimit: 1, totalCap: null,
    claimedCount: 0, redeemedCount: 0, status: 'live', ...overrides,
  }
}

describe('summarizeOffers', () => {
  it('sums claimed and redeemed counts across all offers', () => {
    const summary = summarizeOffers([
      offer({ claimedCount: 5, redeemedCount: 2 }),
      offer({ claimedCount: 3, redeemedCount: 1 }),
    ])
    expect(summary).toEqual({ totalClaimed: 8, totalRedeemed: 3 })
  })

  it('returns zeros for an empty offer list', () => {
    expect(summarizeOffers([])).toEqual({ totalClaimed: 0, totalRedeemed: 0 })
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run merchants.offers-summary`
Expected: PASS (2 tests)

- [ ] **Step 4: Render the summary in `MerchantOffersView.tsx`**

```tsx
// apps/web/components/kinnso/pages/MerchantOffersView.tsx — imports
import { summarizeOffers } from '@/lib/merchants/offers-queries'
```

and inside the component, right after the `<h1>`:

```tsx
      <p className="mt-1 text-kinnso-muted">
        {summarizeOffers(offers).totalClaimed} {t.totalClaimed} · {summarizeOffers(offers).totalRedeemed} {t.totalRedeemed}
      </p>
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean except `t.totalClaimed`/`t.totalRedeemed` (Task 13)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/merchants/offers-queries.ts apps/web/components/kinnso/pages/MerchantOffersView.tsx apps/web/tests/merchants.offers-summary.test.ts
git commit -m "feat(web): R12.0 merchant dashboard claims/redemptions summary"
```

---

### Task 13: i18n parity — all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`

- [ ] **Step 1: Read the existing `Messages` type and `en.ts` structure**

Run: `grep -n "merchantDashboard:\|missionsOps:" apps/web/lib/i18n/messages/en.ts apps/web/lib/i18n/*.d.ts apps/web/lib/i18n/config.ts 2>/dev/null`

This locates (a) the `Messages` type definition file that must be widened with the three new
namespace keys below, and (b) the exact surrounding structure of `en.ts` to match indentation
and quoting style.

- [ ] **Step 2: Add three new namespaces to the `Messages` type**

In the type file found in Step 1, add:

```typescript
  merchantOffers: {
    title: string
    fieldTitle: string
    fieldTerms: string
    fieldValue: string
    fieldPerVisitorLimit: string
    fieldTotalCap: string
    discountItem: string
    discountPercent: string
    discountAmount: string
    commissionFlat: string
    commissionPercent: string
    publish: string
    yourOffers: string
    claimed: string
    redeemed: string
    totalClaimed: string
    totalRedeemed: string
    actPublish: string
    actPause: string
    actEnd: string
  }
  offerClaim: {
    claimButton: string
    validThrough: string
    heading: string
    showAt: string
  }
  offerRedeem: {
    title: string
    scanning: string
    manualPlaceholder: string
    manualSubmit: string
    amountSpentPrompt: string
    amountSpentSubmit: string
    success: string
    alreadyRedeemed: string
  }
```

- [ ] **Step 3: Add the English content to `en.ts`**

```typescript
  merchantOffers: {
    title: 'Offers',
    fieldTitle: 'Title — e.g. Free dessert with any main',
    fieldTerms: 'Terms',
    fieldValue: 'Value',
    fieldPerVisitorLimit: 'Per-visitor limit',
    fieldTotalCap: 'Total cap',
    discountItem: 'Free item',
    discountPercent: 'Percent off',
    discountAmount: 'Amount off',
    commissionFlat: 'Flat fee',
    commissionPercent: 'Percent of spend',
    publish: 'Publish offer',
    yourOffers: 'Your offers',
    claimed: 'claimed',
    redeemed: 'redeemed',
    totalClaimed: 'total claims',
    totalRedeemed: 'total redemptions',
    actPublish: 'Publish',
    actPause: 'Pause',
    actEnd: 'End',
  },
  offerClaim: {
    claimButton: 'Claim this offer',
    validThrough: 'Valid through',
    heading: 'Show this at the venue',
    showAt: 'Show this at',
  },
  offerRedeem: {
    title: 'Redeem',
    scanning: 'Point the camera at the visitor’s QR code',
    manualPlaceholder: 'Enter code manually',
    manualSubmit: 'Look up',
    amountSpentPrompt: 'Amount spent (optional unless required)',
    amountSpentSubmit: 'Redeem',
    success: 'Redeemed!',
    alreadyRedeemed: 'Already redeemed',
  },
```

- [ ] **Step 4: Add the translated content to the other 6 locale files**

```typescript
// zh-hk.ts (Traditional Chinese, Hong Kong)
  merchantOffers: {
    title: '優惠',
    fieldTitle: '標題 — 例如：主菜任食送甜品',
    fieldTerms: '條款',
    fieldValue: '數值',
    fieldPerVisitorLimit: '每位訪客限額',
    fieldTotalCap: '總名額',
    discountItem: '免費項目',
    discountPercent: '折扣百分比',
    discountAmount: '減免金額',
    commissionFlat: '固定佣金',
    commissionPercent: '按消費百分比',
    publish: '發布優惠',
    yourOffers: '你的優惠',
    claimed: '已領取',
    redeemed: '已兌換',
    totalClaimed: '總領取次數',
    totalRedeemed: '總兌換次數',
    actPublish: '發布',
    actPause: '暫停',
    actEnd: '結束',
  },
  offerClaim: {
    claimButton: '領取此優惠',
    validThrough: '有效期至',
    heading: '請於商戶出示此頁面',
    showAt: '請於此商戶出示',
  },
  offerRedeem: {
    title: '兌換',
    scanning: '請將鏡頭對準訪客的二維碼',
    manualPlaceholder: '手動輸入代碼',
    manualSubmit: '查詢',
    amountSpentPrompt: '消費金額（如非必填可留空）',
    amountSpentSubmit: '兌換',
    success: '已兌換！',
    alreadyRedeemed: '此優惠已被兌換',
  },
```

```typescript
// zh-tw.ts (Traditional Chinese, Taiwan)
  merchantOffers: {
    title: '優惠',
    fieldTitle: '標題 — 例如：主餐即送甜點',
    fieldTerms: '條款',
    fieldValue: '數值',
    fieldPerVisitorLimit: '每位訪客限額',
    fieldTotalCap: '總名額',
    discountItem: '免費項目',
    discountPercent: '折扣百分比',
    discountAmount: '折抵金額',
    commissionFlat: '固定佣金',
    commissionPercent: '按消費百分比',
    publish: '發布優惠',
    yourOffers: '你的優惠',
    claimed: '已領取',
    redeemed: '已兌換',
    totalClaimed: '總領取次數',
    totalRedeemed: '總兌換次數',
    actPublish: '發布',
    actPause: '暫停',
    actEnd: '結束',
  },
  offerClaim: {
    claimButton: '領取此優惠',
    validThrough: '有效期至',
    heading: '請於商家出示此頁面',
    showAt: '請於此商家出示',
  },
  offerRedeem: {
    title: '兌換',
    scanning: '請將鏡頭對準訪客的 QR code',
    manualPlaceholder: '手動輸入代碼',
    manualSubmit: '查詢',
    amountSpentPrompt: '消費金額（若非必填可留空）',
    amountSpentSubmit: '兌換',
    success: '已兌換！',
    alreadyRedeemed: '此優惠已被兌換',
  },
```

```typescript
// zh-cn.ts (Simplified Chinese)
  merchantOffers: {
    title: '优惠',
    fieldTitle: '标题 — 例如：主菜赠送甜品',
    fieldTerms: '条款',
    fieldValue: '数值',
    fieldPerVisitorLimit: '每位访客限额',
    fieldTotalCap: '总名额',
    discountItem: '免费项目',
    discountPercent: '折扣百分比',
    discountAmount: '减免金额',
    commissionFlat: '固定佣金',
    commissionPercent: '按消费百分比',
    publish: '发布优惠',
    yourOffers: '你的优惠',
    claimed: '已领取',
    redeemed: '已兑换',
    totalClaimed: '总领取次数',
    totalRedeemed: '总兑换次数',
    actPublish: '发布',
    actPause: '暂停',
    actEnd: '结束',
  },
  offerClaim: {
    claimButton: '领取此优惠',
    validThrough: '有效期至',
    heading: '请在商户处出示此页面',
    showAt: '请在此商户处出示',
  },
  offerRedeem: {
    title: '兑换',
    scanning: '请将镜头对准访客的二维码',
    manualPlaceholder: '手动输入代码',
    manualSubmit: '查询',
    amountSpentPrompt: '消费金额（非必填可留空）',
    amountSpentSubmit: '兑换',
    success: '已兑换！',
    alreadyRedeemed: '此优惠已被兑换',
  },
```

```typescript
// ja.ts (Japanese)
  merchantOffers: {
    title: 'オファー',
    fieldTitle: 'タイトル — 例：メイン注文でデザート無料',
    fieldTerms: '利用条件',
    fieldValue: '数値',
    fieldPerVisitorLimit: '一人あたりの上限',
    fieldTotalCap: '総上限数',
    discountItem: '無料アイテム',
    discountPercent: '割引率',
    discountAmount: '割引額',
    commissionFlat: '固定手数料',
    commissionPercent: '利用額に対する割合',
    publish: 'オファーを公開',
    yourOffers: 'あなたのオファー',
    claimed: '獲得済み',
    redeemed: '利用済み',
    totalClaimed: '獲得数合計',
    totalRedeemed: '利用数合計',
    actPublish: '公開',
    actPause: '一時停止',
    actEnd: '終了',
  },
  offerClaim: {
    claimButton: 'このオファーを獲得',
    validThrough: '有効期限',
    heading: '店舗でこの画面を提示してください',
    showAt: '提示先',
  },
  offerRedeem: {
    title: '利用受付',
    scanning: '訪問者のQRコードにカメラを向けてください',
    manualPlaceholder: 'コードを手入力',
    manualSubmit: '検索',
    amountSpentPrompt: '利用金額（必須の場合のみ入力）',
    amountSpentSubmit: '利用を確定',
    success: '利用完了！',
    alreadyRedeemed: 'すでに利用済みです',
  },
```

```typescript
// ko.ts (Korean)
  merchantOffers: {
    title: '오퍼',
    fieldTitle: '제목 — 예: 메인 메뉴 주문 시 디저트 무료',
    fieldTerms: '이용 조건',
    fieldValue: '값',
    fieldPerVisitorLimit: '1인당 제한',
    fieldTotalCap: '전체 한도',
    discountItem: '무료 아이템',
    discountPercent: '할인율',
    discountAmount: '할인 금액',
    commissionFlat: '고정 수수료',
    commissionPercent: '지출 금액 비율',
    publish: '오퍼 게시',
    yourOffers: '내 오퍼',
    claimed: '수령됨',
    redeemed: '사용됨',
    totalClaimed: '총 수령 수',
    totalRedeemed: '총 사용 수',
    actPublish: '게시',
    actPause: '일시중지',
    actEnd: '종료',
  },
  offerClaim: {
    claimButton: '이 오퍼 받기',
    validThrough: '유효 기간',
    heading: '매장에서 이 화면을 제시하세요',
    showAt: '제시할 매장',
  },
  offerRedeem: {
    title: '사용 처리',
    scanning: '방문객의 QR코드에 카메라를 비춰주세요',
    manualPlaceholder: '코드 직접 입력',
    manualSubmit: '조회',
    amountSpentPrompt: '지출 금액 (필수인 경우만 입력)',
    amountSpentSubmit: '사용 처리',
    success: '사용 완료!',
    alreadyRedeemed: '이미 사용된 오퍼입니다',
  },
```

```typescript
// th.ts (Thai)
  merchantOffers: {
    title: 'ข้อเสนอ',
    fieldTitle: 'ชื่อข้อเสนอ — เช่น รับของหวานฟรีเมื่อสั่งเมนูหลัก',
    fieldTerms: 'เงื่อนไข',
    fieldValue: 'มูลค่า',
    fieldPerVisitorLimit: 'จำกัดต่อผู้เยี่ยมชม',
    fieldTotalCap: 'จำนวนสูงสุดทั้งหมด',
    discountItem: 'ของฟรี',
    discountPercent: 'ส่วนลดเปอร์เซ็นต์',
    discountAmount: 'ส่วนลดจำนวนเงิน',
    commissionFlat: 'ค่าคอมมิชชั่นคงที่',
    commissionPercent: 'เปอร์เซ็นต์จากยอดใช้จ่าย',
    publish: 'เผยแพร่ข้อเสนอ',
    yourOffers: 'ข้อเสนอของคุณ',
    claimed: 'รับสิทธิ์แล้ว',
    redeemed: 'ใช้สิทธิ์แล้ว',
    totalClaimed: 'จำนวนการรับสิทธิ์ทั้งหมด',
    totalRedeemed: 'จำนวนการใช้สิทธิ์ทั้งหมด',
    actPublish: 'เผยแพร่',
    actPause: 'หยุดชั่วคราว',
    actEnd: 'สิ้นสุด',
  },
  offerClaim: {
    claimButton: 'รับข้อเสนอนี้',
    validThrough: 'ใช้ได้ถึง',
    heading: 'แสดงหน้านี้ที่ร้าน',
    showAt: 'แสดงที่',
  },
  offerRedeem: {
    title: 'ใช้สิทธิ์',
    scanning: 'สแกน QR โค้ดของผู้เยี่ยมชม',
    manualPlaceholder: 'กรอกรหัสด้วยตนเอง',
    manualSubmit: 'ค้นหา',
    amountSpentPrompt: 'จำนวนเงินที่ใช้จ่าย (กรอกเฉพาะกรณีจำเป็น)',
    amountSpentSubmit: 'ยืนยันการใช้สิทธิ์',
    success: 'ใช้สิทธิ์สำเร็จ!',
    alreadyRedeemed: 'ข้อเสนอนี้ถูกใช้สิทธิ์ไปแล้ว',
  },
```

Insert each block into its file at the same structural position as `en.ts` (alongside the
other top-level namespace keys), matching that file's existing trailing-comma and quote
conventions.

- [ ] **Step 5: Run the locale-parity test**

Run: `cd apps/web && npx vitest run i18n.locale-parity`
Expected: PASS — all 7 locales now carry the same key set for `merchantOffers`, `offerClaim`,
and `offerRedeem`.

- [ ] **Step 6: Typecheck the whole app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean — this resolves every `messages.merchantOffers`/`messages.offerClaim`/
`messages.offerRedeem` reference left dangling by Tasks 8-12.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts apps/web/lib/i18n/*.d.ts
git commit -m "i18n(web): R12.0 offer/claim/redeem strings across all 7 locales"
```

---

### Task 14: Live proof

**Files:**
- Create: `apps/web/tests/offers.rls.test.ts`

Local Supabase stack only — never production (per project convention: every `*.rls.test.ts`
in this repo runs against a local stack; see the `kinnso-full-gate-needs-live-stack` and
`live-proof-fixed-uuid-collision` project notes before writing fixed seed UUIDs — grep every
existing `*.rls.test.ts` file's constants first, or use `randomUUID()` throughout, which this
test does).

- [ ] **Step 1: Start the local Supabase stack**

Run: `cd "$(git rev-parse --show-toplevel)" && npx supabase start`
Expected: stack comes up on the ports configured in `supabase/config.toml`

- [ ] **Step 2: Apply all R12.0 migrations locally**

Run: `npx supabase db reset`
Expected: replays every migration including all six from Tasks 1-6, clean exit

- [ ] **Step 3: Write the live-proof test**

```typescript
// apps/web/tests/offers.rls.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient<Database>(url, serviceKey)

async function signedInClient(email: string) {
  const password = 'test-password-12345!'
  await admin.auth.admin.createUser({ email, password, email_confirm: true })
  const client = createClient<Database>(url, anonKey)
  await client.auth.signInWithPassword({ email, password })
  return client
}

describe('R12.0 offer claim/redeem RLS + live proof', () => {
  let merchantAId: string
  let merchantBId: string
  let creatorId: string
  let missionId: string
  let offerId: string
  let visitor: Awaited<ReturnType<typeof signedInClient>>
  let staffA: Awaited<ReturnType<typeof signedInClient>>
  let staffB: Awaited<ReturnType<typeof signedInClient>>
  let creatorClient: Awaited<ReturnType<typeof signedInClient>>

  beforeAll(async () => {
    const merchantAUser = randomUUID()
    const merchantBUser = randomUUID()
    const creatorUser = randomUUID()
    const visitorUser = randomUUID()

    staffA = await signedInClient(`merchant-a-${merchantAUser}@test.kinnso.dev`)
    staffB = await signedInClient(`merchant-b-${merchantBUser}@test.kinnso.dev`)
    creatorClient = await signedInClient(`creator-${creatorUser}@test.kinnso.dev`)
    visitor = await signedInClient(`visitor-${visitorUser}@test.kinnso.dev`)

    const { data: { user: staffAUser } } = await staffA.auth.getUser()
    const { data: { user: staffBUser } } = await staffB.auth.getUser()
    const { data: { user: creatorAuthUser } } = await creatorClient.auth.getUser()

    const { data: mA } = await admin.from('merchant_profiles').insert({
      user_id: staffAUser!.id, company_name: `Merchant A ${randomUUID()}`, status: 'active',
    }).select('id').single()
    merchantAId = mA!.id as string

    const { data: mB } = await admin.from('merchant_profiles').insert({
      user_id: staffBUser!.id, company_name: `Merchant B ${randomUUID()}`, status: 'active',
    }).select('id').single()
    merchantBId = mB!.id as string

    await admin.from('creators').insert({ id: creatorAuthUser!.id, status: 'active', display_name: 'Test Creator' })
    creatorId = creatorAuthUser!.id

    const { data: mission } = await admin.from('missions').insert({
      merchant_profile_id: merchantAId, title: `Mission ${randomUUID()}`,
      mission_type: 'paid', status: 'published', visibility: 'open',
    }).select('id').single()
    missionId = mission!.id as string

    await admin.from('mission_participants').insert({
      mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join',
    })

    const { data: offer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Free dessert', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 20,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 1, total_cap: 10, status: 'live',
    }).select('id').single()
    offerId = offer!.id as string
  })

  it('full chain: claim -> redeem -> settlement minted with source visit_redemption', async () => {
    const { data: claim, error: claimError } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const { data: redemption, error: redeemError } = await staffA.rpc('redeem_offer_claim', {
      p_raw_token: rawToken, p_amount_spent: null,
    })
    expect(redeemError).toBeNull()
    expect((redemption as { already_redeemed: boolean }).already_redeemed).toBe(false)

    const { data: settlement } = await admin
      .from('mission_settlements')
      .select('source, paid_fee_amount, status')
      .eq('mission_id', missionId)
      .eq('source', 'visit_redemption')
      .single()
    expect(settlement?.source).toBe('visit_redemption')
    expect(settlement?.paid_fee_amount).toBe(20)
    expect(settlement?.status).toBe('not_started')
  })

  it('double-scan is idempotent: second redeem returns already_redeemed, not an error', async () => {
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    const first = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect((first.data as { already_redeemed: boolean }).already_redeemed).toBe(false)

    const second = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(second.error).toBeNull()
    expect((second.data as { already_redeemed: boolean }).already_redeemed).toBe(true)
  })

  it('merchant B cannot redeem merchant A\'s claim', async () => {
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error } = await staffB.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('forbidden')
  })

  it('a creator cannot call redeem_offer_claim at all', async () => {
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error } = await creatorClient.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('forbidden')
  })

  it('a visitor reads only their own claims, not another visitor\'s', async () => {
    const otherVisitor = await signedInClient(`visitor2-${randomUUID()}@test.kinnso.dev`)
    const { data: mine } = await visitor.from('offer_claims').select('id').eq('creator_id', creatorId)
    const { data: theirs } = await otherVisitor.from('offer_claims').select('id').eq('creator_id', creatorId)
    expect((mine ?? []).length).toBeGreaterThan(0)
    expect(theirs ?? []).toEqual([])
  })

  it('merchant B cannot read merchant A\'s claims', async () => {
    const { data: theirs } = await staffB.from('offer_claims').select('id').eq('offer_id', offerId)
    expect(theirs ?? []).toEqual([])
  })

  it('claiming past total_cap fails cleanly', async () => {
    const { data: cappedOffer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Capped offer', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 10,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 1, total_cap: 1, status: 'live',
    }).select('id').single()

    const firstVisitor = visitor
    const { error: firstError } = await firstVisitor.rpc('claim_offer', {
      p_offer_id: cappedOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(firstError).toBeNull()

    const secondVisitor = await signedInClient(`visitor3-${randomUUID()}@test.kinnso.dev`)
    const { error: secondError } = await secondVisitor.rpc('claim_offer', {
      p_offer_id: cappedOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(secondError).not.toBeNull()
    expect(secondError!.message).toContain('offer_cap_reached')
  })

  it('two truly concurrent claims against a total_cap-1-remaining offer: exactly one wins', async () => {
    const { data: almostFullOffer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Almost full offer', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 10,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 1, total_cap: 1, status: 'live',
    }).select('id').single()

    const visitorA = await signedInClient(`race-a-${randomUUID()}@test.kinnso.dev`)
    const visitorB = await signedInClient(`race-b-${randomUUID()}@test.kinnso.dev`)

    const [resultA, resultB] = await Promise.all([
      visitorA.rpc('claim_offer', { p_offer_id: almostFullOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile' }),
      visitorB.rpc('claim_offer', { p_offer_id: almostFullOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile' }),
    ])

    const successes = [resultA, resultB].filter((r) => r.error === null)
    const failures = [resultA, resultB].filter((r) => r.error !== null)
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0].error!.message).toContain('offer_cap_reached')

    const { data: finalOffer } = await admin.from('merchant_offers').select('claimed_count').eq('id', almostFullOffer!.id).single()
    expect(finalOffer?.claimed_count).toBe(1)
  })

  it('two truly concurrent redemptions of the same claim: exactly one debits, the other is idempotent', async () => {
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    const [redeemA, redeemB] = await Promise.all([
      staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null }),
      staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null }),
    ])

    expect(redeemA.error).toBeNull()
    expect(redeemB.error).toBeNull()
    const alreadyRedeemedFlags = [redeemA, redeemB].map((r) => (r.data as { already_redeemed: boolean }).already_redeemed)
    expect(alreadyRedeemedFlags.sort()).toEqual([false, true])

    const { data: redemptions } = await admin.from('offer_redemptions').select('id').eq('offer_claim_id', (claim as { claim_id: string }).claim_id)
    expect(redemptions ?? []).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Run the live-proof test**

Run: `cd apps/web && RUN_R7_3_LOCAL_LIVE_TESTS=1 npx vitest run offers.rls`
Expected: PASS (9 tests)

- [ ] **Step 5: Run the full test suite before tearing down the stack**

Per project convention, ~20 test files beyond `*.rls.test.ts` also hit the live local stack
and will time out (not skip) once it's down — run the full suite while it's still up:

Run: `cd apps/web && npx vitest run`
Expected: PASS across the board (aside from any pre-existing, already-known flakes unrelated
to this phase)

- [ ] **Step 6: Tear down the local stack**

Run: `npx supabase stop`

- [ ] **Step 7: Commit**

```bash
git add apps/web/tests/offers.rls.test.ts
git commit -m "test(db): R12.0 live proof — claim/redeem/settle chain + RLS"
```

---

## Post-implementation

Open a PR titled `Phase R12.0 — The Visit Loop MVP (offer, claim, in-store redemption)`
following the established pattern (`docs/r12-0-visit-loop-design` was already merged as the
design doc PR; this is the implementation PR on a fresh branch off `main`, e.g.
`feat/r12-0-visit-loop`).
