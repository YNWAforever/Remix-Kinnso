# Phase 6 — Admin Panel v1 (Shell + Perks + Users)

- **Date:** 2026-06-26
- **Status:** Design approved — ready for implementation plan(s)
- **Depends on:** Phase 5 (tier backbone/gating, `kinnso_ops_members`, `resolveViewerRole`). Stacks on `feat/phase5b-tier-gating` (5A+5B+5C, PR #41).
- **Supersedes:** the standalone `2026-06-26-phase5d-partner-perks-design.md` — partner perks are now **ops-managed** as module **6B** of this panel (not a code-managed seed catalog).

## 1. Goal

A dedicated, ops-only **Admin Panel** at `/admin` to control kinnso-v3 content and users, built as a **shell + pluggable modules**. v1 ships three: the **shell** (6A), the **Perks** module (6B — ops CRUD + the creator-facing catalog), and the **Users** module (6C — manage creators/merchants/ops). Access reuses the existing **ops role** (`kinnso_ops_members` → `resolveViewerRole === 'ops'`). Later modules (content/pages, missions oversight, etc.) plug into the same shell.

### Non-goals (v1)
- No new "admin" role distinct from ops (reuse ops; finer-grained admin tiers later).
- Users module: **view + activate/suspend only** — no role granting (making someone ops/merchant) in v1.
- No migration of the existing `/ops/settlements` page into the panel yet (it stays; fold in later).
- Perks: no seed content (ops create perks in the panel); no per-creator unique codes, partner fulfillment, expiry/inventory.

### Decomposition → three implementation plans (built in sequence)
This spec is the shared design; implementation is **three plans**, each producing working software:
1. **6A — Admin shell** (layout/gate/nav/dashboard + `admin` i18n). Foundation.
2. **6B — Perks module** (DB + RPCs + `/admin/perks` CRUD + `/studio/perks` catalog + `perks` i18n).
3. **6C — Users module** (admin SECURITY DEFINER functions + `/admin/users` + `users` i18n).

## 2. Shared architecture & conventions

- **Route group:** `app/[locale]/admin/*` (localized, like `ops/` and `studio/`). `generateStaticParams` over `LOCALES`.
- **Gate helper (DRY):** `apps/web/lib/admin/guard.ts`
  - `requireOpsPage(supabase)` — `getUser` → `redirect(sign-in)` if anon; `resolveViewerRole` → `notFound()` if not `'ops'`; returns `{ user }`.
  - `requireOpsAction(supabase)` — same checks but returns a typed `ActionFailure` (`{ ok:false, errors:{form:[...]}}`) instead of throwing, for server actions. Reuses `getActiveOpsMember`.
- **Admin layout:** `app/[locale]/admin/layout.tsx` (server) calls `requireOpsPage`, renders `<AdminShell>` (sidebar nav: Dashboard · Perks · Users) around `{children}`. A non-ops user never sees the chrome (layout `notFound`s first).
- **Action result shape:** reuse the established `ActionResult<T> = ({ok:true} & T) | {ok:false; errors: ValidationErrors}` + `formError(msg)` from `lib/missions/actions.ts` (extract a shared `lib/forms/result.ts` if cleaner, else mirror the shape).
- **Cross-cutting DB access for admin:** prefer `SECURITY DEFINER` functions that check ops membership internally over broad RLS changes to existing tables — keeps existing creator/merchant flows untouched and centralizes admin authority. New admin-owned tables (`partner_perks`) use ops-RLS directly.
- **i18n:** new groups added to all 7 locales + the `Messages` interface + the parity `GROUPS` array.

## 3. Module 6A — Admin shell

### Components
| File | Responsibility |
|---|---|
| `apps/web/lib/admin/guard.ts` | `requireOpsPage` / `requireOpsAction` |
| `apps/web/app/[locale]/admin/layout.tsx` | gate + render `AdminShell` |
| `apps/web/app/[locale]/admin/page.tsx` | dashboard (overview counts) |
| `apps/web/components/kinnso/admin/AdminShell.tsx` | sidebar nav + content frame |
| `apps/web/lib/admin/queries.ts` | `getAdminOverview(supabase)` → `{ perksActive, perksTotal, creators, merchants, ops, redemptions }` |
| i18n `admin` group | nav labels, dashboard titles, counts |

- **Nav** is a static list (`{ href, key }[]`): Dashboard (`/admin`), Perks (`/admin/perks`), Users (`/admin/users`). Active-route highlight via `usePathname` in a small client `AdminNav`, or server-rendered with the current segment passed in.
- **Dashboard counts** come from `getAdminOverview` (count queries / admin functions). Honest zeros when empty.

### Tests
- `admin.layout`/page host test: non-ops → `notFound`; ops → renders shell + dashboard with counts.
- `AdminShell` component test: renders the three nav links to the right hrefs.

## 4. Module 6B — Perks

### Data model & access (the security-critical part)
`partner_perks` is **ops-owned**: creators/anon get **no direct table access**; creators reach perks only through two `SECURITY DEFINER` functions, so `redemption_value` is never directly selectable by a creator at any tier.

```sql
create table public.partner_perks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  partner_name text not null,
  title text not null,
  summary text not null,
  category text not null,
  discount_label text not null,
  min_tier text check (min_tier in ('rising','pro','elite')),  -- null = open to all
  redemption_type text not null check (redemption_type in ('code','link')),
  redemption_value text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partner_perks enable row level security;
revoke all on public.partner_perks from anon, authenticated;

-- ops-only direct access (admin panel reads/writes incl. the value)
create or replace function public.is_active_ops() returns boolean
  language sql stable as $$
  select exists (select 1 from public.kinnso_ops_members
                 where user_id = auth.uid() and status = 'active') $$;
create policy partner_perks_ops_all on public.partner_perks
  for all to authenticated using (public.is_active_ops()) with check (public.is_active_ops());
grant select, insert, update on public.partner_perks to authenticated; -- gated by the policy above

create table public.perk_redemptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  perk_id uuid not null references public.partner_perks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (creator_id, perk_id)
);
alter table public.perk_redemptions enable row level security;
create policy perk_redemptions_owner_select on public.perk_redemptions
  for select using (creator_id = auth.uid());
revoke all on public.perk_redemptions from anon;

-- creator read path: metadata only, no redemption_value
create or replace function public.list_active_perks()
returns table (id uuid, slug text, partner_name text, title text, summary text,
               category text, discount_label text, min_tier text, redemption_type text, sort_order int)
language sql security definer set search_path = public stable as $$
  select id, slug, partner_name, title, summary, category, discount_label,
         min_tier, redemption_type, sort_order
  from public.partner_perks where active order by sort_order, created_at $$;
grant execute on function public.list_active_perks() to authenticated;

-- creator redeem path: tier-gated; returns the value; logs the redemption (idempotent)
create or replace function public.redeem_perk(p_perk_id uuid)
returns table (redemption_type text, redemption_value text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_min text; v_type text; v_val text;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select min_tier, redemption_type, redemption_value into v_min, v_type, v_val
    from public.partner_perks where id = p_perk_id and active;
  if not found then raise exception 'perk_not_found'; end if;
  if v_min is not null and
     public.contribution_tier_rank(coalesce((select tier from public.creator_contribution
        where creator_id = v_uid), 'seed')) < public.contribution_tier_rank(v_min)
  then raise exception 'below_tier'; end if;
  insert into public.perk_redemptions (creator_id, perk_id)
    values (v_uid, p_perk_id) on conflict (creator_id, perk_id) do nothing;
  return query select v_type, v_val;
end $$;
revoke all on function public.redeem_perk(uuid) from anon;
grant execute on function public.redeem_perk(uuid) to authenticated;
```

> The `partner_perks_ops_all` policy gates direct table access to ops; `list_active_perks`/`redeem_perk` are SECURITY DEFINER so they bypass RLS for the specific, safe projections. `redeem_perk` reuses 5B's `contribution_tier_rank` (confirmed `contribution_tier_rank(null/unknown) → 0 = seed`).

### Ops admin — `/admin/perks`
- **Page** `app/[locale]/admin/perks/page.tsx` (under the admin layout, already ops-gated): lists all perks (incl. `active` + redemption_value, read via the ops RLS policy through `lib/admin/perks-queries.ts: listAllPerks`).
- **Form** `AdminPerkForm` (client): create/edit fields — partner_name, title, summary, category, discount_label, min_tier (open/rising/pro/elite), redemption_type (code/link), redemption_value, sort_order, active.
- **Actions** `lib/admin/perks-actions.ts`: `createPerkAction(input)`, `updatePerkAction(id, input)`, `togglePerkActiveAction(id, active)` — each `requireOpsAction` then writes via the cookie client (ops RLS). `slug` auto-derived from title (unique; suffix on collision). Validation: required fields, `redemption_value` non-empty, valid enums.

### Creator catalog — `/studio/perks`
- **Page** `app/[locale]/studio/perks/page.tsx`: creator-gated; `supabase.rpc('list_active_perks')` → perks; `getCreatorStoredTier` → tier; `listRedeemedPerkIds(creator)` → redeemed set; render `StudioPerksView`.
- **`lib/perks/list.ts: mapPerkCard(row, creatorTier, redeemedIds)`** → `{ …, state: 'locked'|'redeemable'|'redeemed' }` (locked = `!meetsTier`; redeemed = in set).
- **`StudioPerksView`**: locked (tier badge + `/studio/tier` upsell, no button), redeemable ("Redeem"), redeemed ("Redeemed" badge + reveal button). Reveal/redeem calls `redeemPerkAction(perkId)` → `rpc('redeem_perk')` → returns `{type,value}` shown client-side (copyable code or "Open deal" link). Redeemed cards re-reveal via the same idempotent action (value isn't stored client-readable).
- **`lib/perks/actions.ts: redeemPerkAction`**: creator gate + `meetsTier` pre-check (friendly) + `rpc('redeem_perk')` (hard) → `{ ok:true, redemptionType, value }` or `formError`.
- Studio **Perks tile** in `StudioQuickLinks`; `perks` i18n group.

## 5. Module 6C — Users

### Access via SECURITY DEFINER admin functions (no change to existing table RLS)
```sql
create or replace function public.admin_list_creators()
returns table (id uuid, display_name text, handle text, status text, created_at timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden'; end if;
  return query select id, display_name, handle, status, created_at from public.creators order by created_at desc;
end $$;
-- analogous admin_list_merchants() (id, company_name, contact_email, status, created_at)
-- analogous admin_list_ops() (id, user_id, display_name, status, created_at)

create or replace function public.admin_set_user_status(p_kind text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden'; end if;
  if p_status not in ('active','suspended') then raise exception 'bad_status'; end if;
  if p_kind = 'creator' then update public.creators set status = p_status where id = p_id;
  elsif p_kind = 'merchant' then update public.merchant_profiles set status = p_status where id = p_id;
  elsif p_kind = 'ops' then
    -- no-lockout guards: cannot suspend yourself or the last active ops
    if p_status = 'suspended' then
      if (select user_id from public.kinnso_ops_members where id = p_id) = auth.uid()
        then raise exception 'cannot_suspend_self'; end if;
      if (select count(*) from public.kinnso_ops_members where status='active') <= 1
        then raise exception 'last_active_ops'; end if;
    end if;
    update public.kinnso_ops_members set status = p_status where id = p_id;
  else raise exception 'bad_kind'; end if;
end $$;
grant execute on function public.admin_list_creators(), public.admin_list_merchants(),
  public.admin_list_ops(), public.admin_set_user_status(text, uuid, text) to authenticated;
```

### UI — `/admin/users`
- Three sections (Creators / Merchants / Ops) each listing name, status, joined date, with an **Activate/Suspend** toggle.
- **Actions** `lib/admin/users-actions.ts: setUserStatusAction(kind, id, status)` → `requireOpsAction` + `rpc('admin_set_user_status')`; maps `cannot_suspend_self`/`last_active_ops`/`forbidden` to typed errors.
- **Queries** `lib/admin/users-queries.ts`: `listAdminUsers(supabase)` → calls the three `admin_list_*` RPCs.
- `users` i18n group (admin) — or fold into the `admin` group.

## 6. Error handling

| Condition | Behavior |
|---|---|
| Non-ops hits any `/admin/*` | layout `notFound()` (no admin chrome leaks) |
| Non-ops calls an admin action | `requireOpsAction` → typed `forbidden` error |
| Creator redeems below tier | pre-check blocks; RPC raises `below_tier` → typed error; card stays locked |
| Suspend self / last ops | RPC raises → typed error; UI shows the reason; no status change |
| Perk validation fails | action returns field errors; form shows them |
| Empty catalog / no users | honest empty states |

## 7. Testing (TDD, per plan)

- **6A:** guard unit (`requireOpsPage`/`Action` ops vs non-ops); layout/page host tests (non-ops→notFound, ops→shell+counts); `AdminShell` nav links; `getAdminOverview`.
- **6B:** perks DB migration applied live + verified (ops-RLS blocks non-ops select, the 2 RPCs exist, `redeem_perk` raises below-tier, anon revoked); `listAllPerks`/`createPerkAction`/`updatePerkAction`/`togglePerkActiveAction` (ops-gated, validation); `AdminPerkForm` component; `mapPerkCard` states; `redeemPerkAction` (below-tier blocked, at-tier returns value, idempotent); `StudioPerksView`; `/studio/perks` + `/admin/perks` host tests; Studio tile; `perks`+`admin` i18n parity.
- **6C:** users migration verified live (4 functions, ops-gate, self/last-ops guards); `listAdminUsers`; `setUserStatusAction` (the guards); `/admin/users` host test; `users` i18n parity.
- **Finish gate (each plan):** full `vitest run`, tsc, lint, `next build` with the new routes in the manifest. (5B/5C lesson: full suite, not a targeted sweep.)

## 8. Owner-manual / deploy
- Ops members already exist in `kinnso_ops_members`; the panel is reachable at `/<locale>/admin` for any active ops user.
- Perks are created in `/admin/perks` (no seed) — the creator catalog is honestly empty until ops add perks.
- Manual smoke (needs an ops session + creators at tiers): ops creates a Pro perk → a seed creator sees it locked at `/studio/perks`; a Pro creator redeems → value revealed + "Redeemed" persists; ops can't suspend themselves / the last ops.

## 9. Branch / integration
Branch `feat/phase6-admin-panel` (off the 5A–5C branch). This is a large, distinct surface → **its own PR** (separate from PR #41). Built as three sequential plans (6A→6B→6C); each can be a commit range / reviewable unit within the one PR.

## 10. Open items the owner confirms
1. Real perk content is created by ops in-panel (no seed) — confirmed.
2. Dashboard metrics set (perks active/total, users by role, redemptions) — adjust if you want others (e.g. missions, guides).
3. Later modules (content/pages, missions oversight) are separate follow-up slices.
