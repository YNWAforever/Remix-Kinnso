# Phase 5D — Partner Perks Catalog v1

- **Date:** 2026-06-26
- **Status:** Design approved — ready for implementation plan
- **Depends on:** Phase 5A (tier backbone) + 5B (tier gating helpers/`contribution_tier_rank`). Stacks on `feat/phase5b-tier-gating` (which carries 5A+5B+5C, PR #41).
- **Roadmap slot:** Phase 5D of the product-reorg roadmap — *"Partner perks catalog — third-party discounts redeemable by level."* Final Phase 5 sub-project.

## 1. Goal

A tier-gated catalog at `/studio/perks` of third-party partner discounts a creator **receives** as a leveling reward — distinct from the Travelpayouts **Studio Offers** they *promote* to earn commission. Each perk has a `min_tier`; below-tier creators see it **locked** with a `/studio/tier` upsell; at/above tier they **redeem** it (reveal a promo **code** or open a partner **link**). Redemptions are logged per creator (owner-private) for a "Redeemed" badge + basic owner analytics. Delivers the roadmap's perks catalog and the live `/agent` marketing promise ("higher tiers unlock … perks").

### Non-goals (YAGNI)

- Ops/admin UI to manage perks — the catalog is a **curated seed** (same model as `offer-catalog.ts`).
- Per-creator unique codes / code-pool management (a perk has one shared code or link in v1).
- Partner-side fulfillment or redemption verification.
- Expiry, inventory limits, or scheduling.

## 2. Architecture

Mirrors two existing, proven patterns: the **curated catalog** (Studio Offers — a TS source-of-truth synced to a seed migration by a parity test) and **5B tier gating** (`meetsTier` + locked cards + `/studio/tier` upsell + DB defense-in-depth).

```
/studio/perks (server page)
  ├─ gate: creator only (resolveViewerRole)
  ├─ listPerks(supabase)            → catalog metadata (NO redemption_value)
  ├─ getCreatorStoredTier(...)      → creatorTier
  ├─ listRedeemedPerkIds(creator)   → Set<perkId>
  └─ StudioPerksView  → cards: locked | redeem | redeemed(value)
                          └─ Redeem → redeemPerkAction(perkId)
                                        ├─ app meetsTier pre-check (friendly)
                                        └─ rpc redeem_perk(perkId)  ← HARD enforcement
                                             (SECURITY DEFINER: tier check + log + return value)
```

### Components (each independently testable)

| Unit | File | Responsibility |
|---|---|---|
| Catalog source-of-truth | `apps/web/lib/perks/catalog.ts` | `PERK_CATALOG: PerkCatalogEntry[]` — single source for the seed; synced by a parity test |
| Seed migration | `supabase/migrations/<ts>_partner_perks.sql` | `partner_perks` + `perk_redemptions` tables, `redeem_perk` RPC, RLS + column grant, seed rows |
| Queries | `apps/web/lib/perks/queries.ts` | `listPerks` (metadata only), `listRedeemedPerkIds(creatorId)` |
| Redeem action | `apps/web/lib/perks/actions.ts` | `redeemPerkAction(perkId)` — gate + `meetsTier` pre-check + `rpc('redeem_perk')` |
| Card mapping | `apps/web/lib/perks/list.ts` | `mapPerkCard(row, creatorTier, redeemedIds)` → `{ state: 'locked'\|'redeemable'\|'redeemed', … }` |
| View | `apps/web/components/kinnso/pages/StudioPerksView.tsx` | grid of perk cards: locked / redeem / redeemed-with-value |
| Page | `apps/web/app/[locale]/studio/perks/page.tsx` | gate + hydrate perks/tier/redeemed → view |
| Tile + i18n | `StudioQuickLinks.tsx`, `messages/*.ts` | Perks tile + `perks` group ×7 |

## 3. Redemption-value protection (the security-critical decision)

A perk's `redemption_value` (the actual code/link) MUST NOT be readable by a below-tier creator, or the tier gate is trivially bypassed via the API.

- **Column-level grant:** `authenticated` may `select` every `partner_perks` column **except** `redemption_value`. `listPerks` selects only metadata columns. `anon` is fully revoked.
- **`redeem_perk(p_perk_id uuid)` — `SECURITY DEFINER` RPC** is the *only* path to the value:
  1. resolves `auth.uid()` as the creator,
  2. checks the creator meets the perk's `min_tier` (reusing `public.contribution_tier_rank` from 5B; `null` min_tier = open),
  3. inserts `perk_redemptions (creator_id, perk_id)` `on conflict (creator_id, perk_id) do nothing` (idempotent — no TOCTOU, re-redeem is safe),
  4. returns `redemption_value`; raises (mapped to a typed error) if below tier or perk inactive/missing.

This is the 5B defense-in-depth pattern applied to a returned secret: the app-level `meetsTier` check is the friendly pre-check; the RPC is the hard, race-free enforcement, and the value never sits in a broadly-readable column.

## 4. Data model

```sql
-- supabase/migrations/<ts>_partner_perks.sql
create table public.partner_perks (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  partner_name     text not null,
  title            text not null,
  summary          text not null,
  category         text not null,
  discount_label   text not null,                 -- honest, e.g. "20% off annual"
  min_tier         text check (min_tier in ('rising','pro','elite')),  -- null = open to all
  redemption_type  text not null check (redemption_type in ('code','link')),
  redemption_value text not null,                 -- code or url; owner replaces placeholders pre-go-live
  sort_order       int not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
alter table public.partner_perks enable row level security;
-- metadata readable by any authenticated creator; redemption_value is NOT granted (see §3)
create policy partner_perks_auth_read on public.partner_perks
  for select to authenticated using (active);
revoke all on public.partner_perks from anon, authenticated;
grant select (id, slug, partner_name, title, summary, category, discount_label,
              min_tier, redemption_type, sort_order, active)
  on public.partner_perks to authenticated;

create table public.perk_redemptions (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id) on delete cascade,
  perk_id     uuid not null references public.partner_perks(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (creator_id, perk_id)
);
alter table public.perk_redemptions enable row level security;
create policy perk_redemptions_owner_select on public.perk_redemptions
  for select using (creator_id = auth.uid());
-- inserts happen via the SECURITY DEFINER RPC; no direct insert policy needed.
revoke all on public.perk_redemptions from anon;

create or replace function public.redeem_perk(p_perk_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
  v_min   text;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select redemption_value, min_tier into v_value, v_min
    from public.partner_perks where id = p_perk_id and active;
  if not found then raise exception 'perk_not_found'; end if;
  if v_min is not null and
     public.contribution_tier_rank((select tier from public.creator_contribution where creator_id = v_uid))
       < public.contribution_tier_rank(v_min)
  then raise exception 'below_tier'; end if;
  insert into public.perk_redemptions (creator_id, perk_id)
    values (v_uid, p_perk_id) on conflict (creator_id, perk_id) do nothing;
  return v_value;
end;
$$;
revoke all on function public.redeem_perk(uuid) from anon;
grant execute on function public.redeem_perk(uuid) to authenticated;
```

> The exact `contribution_tier_rank` signature + the `creator_contribution.tier` default-to-`seed` behavior are confirmed against the live 5A/5B schema during implementation (a creator with no contribution row = `seed`). If `contribution_tier_rank(null)` isn't safe, coalesce to `'seed'`.

## 5. Catalog source-of-truth

`apps/web/lib/perks/catalog.ts` mirrors `offer-catalog.ts`:

```ts
export type PerkCategory = 'Creator tools' | 'Stock media' | 'Travel' | 'Productivity' | 'Learning'
export type PerkCatalogEntry = {
  slug: string
  partnerName: string
  title: string
  summary: string
  category: PerkCategory
  discountLabel: string
  minTier: 'rising' | 'pro' | 'elite' | null
  redemptionType: 'code' | 'link'
  redemptionValue: string   // PLACEHOLDER until the owner sets the real code/link
  sortOrder: number
}
export const PERK_CATALOG: PerkCatalogEntry[] = [ /* ~6 curated entries spanning tiers + both redemption types */ ]
```

A parity test (`tests/perks.catalog-parity.test.ts`) asserts the TS catalog and the seed migration agree on slugs + key fields (same approach as `missions.offer-catalog-parity.test.ts`).

## 6. Tier gating UI (reuse 5B)

`mapPerkCard(row, creatorTier, redeemedIds)` → card state:
- **locked**: `!meetsTier(creatorTier, row.min_tier)` → tier badge + "Reach {tier} to unlock" + `/studio/tier` link. No redeem button.
- **redeemable**: meets tier, not yet redeemed → "Redeem" button.
- **redeemed**: in `redeemedIds` → show the value (copyable code, or "Open deal" link) + a "Redeemed" badge.

Newly-redeemed value (returned by the action) is shown client-side without a reload.

## 7. Internationalization

`perks` group ×7 locales + `Messages` interface + parity `GROUPS`: page title/subtitle, empty state, `lockedLabel` ("Reach {tier} to unlock"), `redeemCta`, `redeemedBadge`, `codeLabel`, `copyCode`/`copied`, `openDeal`, `errorBelowTier`, `errorGeneric`, `disclaimer` ("Perks are provided by third parties; their terms apply."). Plus `studioHome.perksTitle`/`perksDesc` + a Studio tile.

## 8. Error handling & honesty

| Condition | Behavior |
|---|---|
| Redeem below tier | App `meetsTier` pre-check blocks the call; if reached, RPC raises `below_tier` → typed `formError` (UI keeps the locked state). |
| Perk inactive/missing | RPC raises → typed error. |
| Empty catalog | Honest empty state. |
| Non-creator / unauth | Page `notFound`/`redirect`; action returns auth error. |
| **Content honesty** | Seed ships real partner **names + honest discount labels** but **placeholder `redemption_value`s** the owner replaces before go-live (precedent: the Travelpayouts `tp-<slug>` placeholder ids). Documented as an owner-manual step; the feature is auth-gated and pre-launch until the owner sets real values. |

## 9. Testing strategy (TDD)

- **Catalog parity** — TS `PERK_CATALOG` ↔ seed rows (slugs + fields).
- **Queries** — `listPerks` selects metadata only (asserts `redemption_value` is NOT requested); `listRedeemedPerkIds` returns the owner's set.
- **`redeemPerkAction`** — non-creator rejected; below-tier rejected (pre-check, RPC not called); at/above tier calls `rpc('redeem_perk')` and returns the value; idempotent re-redeem.
- **`mapPerkCard`** — locked/redeemable/redeemed states across tiers + redeemed set.
- **`StudioPerksView`** — renders locked (no redeem), redeemable (redeem button), redeemed (value + badge); empty state.
- **`/studio/perks` host test** — non-creator → notFound; creator → view with correct card states.
- **Studio tile** — live Perks tile links `/studio/perks`.
- **i18n parity** stays green (`perks` in `GROUPS`).
- **DB** — migration applied live + verified via Supabase MCP: tables, RLS, **column grant excludes `redemption_value`**, `redeem_perk` exists + below-tier raises, anon revoked.
- **Finish gate** — full `vitest run` (the 5B/5C lesson), tsc, lint, build with `/studio/perks` in the manifest.

## 10. Env / deploy (owner-manual)

- Replace the placeholder `redemption_value`s in `partner_perks` with real partner codes/links before exposing perks to creators (UPDATE statements or a follow-up seed).
- Owner smoke (needs signed-in creators at different tiers): seed-tier creator sees higher-tier perks locked with the upsell; a qualifying creator redeems → value revealed + "Redeemed" badge persists on reload; below-tier redeem is refused even if the API is called directly.

## 11. Branch / integration

Branch `feat/phase5d-partner-perks` stacks on `feat/phase5b-tier-gating` (5A+5B+5C). At finish: PR #41 is already large, so 5D is likely cleaner as **its own PR** (base `main`, but it will show 5A–5D combined until #41 merges) or a **stacked PR** vs the 5C branch — decided with the owner at the finish gate.

## 12. Open items the owner confirms

1. Real partner perks + their codes/links (the seed ships honest placeholders).
2. The exact tier→perk mapping for the seeded entries (which perks at rising/pro/elite/open).
