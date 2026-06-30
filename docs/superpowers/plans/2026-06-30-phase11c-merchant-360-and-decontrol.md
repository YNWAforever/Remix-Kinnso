# Phase 11C — Merchant 360 + /admin/users De-control + Drop Legacy Tier RPC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-rich Merchant 360 detail page at `/admin/merchants/[merchantId]` (profile incl. ops-only PII, missions, engaged/saved creators, read-only billing, moderation timeline + add-note), unify the merchant write path by removing the inline merchant controls from `/admin/users`, and drop the now-unused legacy 2-arg `admin_set_merchant_tier(uuid,text)` overload.

**Architecture:** One SECURITY DEFINER, `is_active_ops()`-gated RPC `admin_merchant_detail(p_merchant_id uuid) returns jsonb` aggregates every section in one round-trip (mirrors 11A `admin_merchant_analytics` and 10C `admin_creator_detail`). A `getMerchantDetail()` query wrapper maps it to a typed `MerchantDetail` (or `null` when the merchant is missing → `notFound()`). A client `MerchantDetailView` owns the active sub-tab + header quick-action wiring (reusing the 11B `setMerchantStatus`/`setMerchantTier`/`addMerchantNote` actions); five presentational tab components render the sections. The Moderation tab reads `listAudit(supabase, 'merchant', id)` (already built in 10A) and adds a note via the existing `addMerchantNote` action. Directory rows gain a link into this page. Then `/admin/users` drops its merchant tier `<select>` + status toggle and links the merchant row to the 360; `setMerchantTierAction` and the `kind='merchant'` branch of `setUserStatusAction` are retired. **In the same migration that adds the detail RPC, after the app no longer calls it, the legacy `admin_set_merchant_tier(uuid, text)` overload is dropped** and `packages/db/types.ts` is tightened so `p_reason` is required.

**Tech Stack:** Next.js 16 App Router (Server Components + a client view), React 19, TypeScript, Tailwind v4, Supabase RPC (`@supabase/ssr`), Vitest 4 (mocked Supabase), custom i18n (7 locales: `en, zh-hk, zh-tw, zh-cn, ja, ko, th`).

**Branch:** `feat/merchants-console` (freshly cut from merged `main` @ `3bfede2`; 11A `#58` and 11B `#59` already merged). This ships as ONE squash-merged PR titled "Phase 11C — Merchant 360 + /admin/users de-control + drop legacy tier RPC".

**Conventions to honor (from the Phase 11 spec §3/§5/§7/§10 and the 11A/11B + 10C code):**
- Routes gate inline: `await params` → `isLocale(locale)` guard → `notFound()` on bad locale → `createSupabaseServerClient` → **`await requireOpsPage(supabase, loc)` BEFORE any data fetch** → `getDictionary` → query → render. (Mirror `apps/web/app/[locale]/admin/merchants/directory/page.tsx:17-41`.)
- Platform-wide reads go through a SECURITY DEFINER RPC gated on `is_active_ops()` (owner-RLS would hide the row from ops). Errors **propagate** (never swallow to `[]`/`0`). Mirror `getMerchantsOverview` at `apps/web/lib/admin/merchants-queries.ts:91-117`.
- PII (`contact_email`, `contact_name`) is **ops-only** — it appears ONLY in this ops-gated RPC payload, NEVER in any public read. (The 11B directory RPC deliberately returns no PII — see migration comment `supabase/migrations/20260630130000_merchant_ops_lifecycle_and_search.sql:74-75`.)
- Per-currency money honesty: `owed`/`settled` are **per-currency arrays**, never summed across currencies (spec §4.2; mirror `getMerchantsOverview` mapping `merchants-queries.ts:105-106`).
- New timestamped migration only; never edit a shipped one. Applied **live** via Supabase MCP `apply_migration` (snake_case name) to project `scryfkefedzuetfdtrvl`.
- New UI strings → **all 7** locale files + the `Messages` interface (defined in `en.ts`); parity enforced by `apps/web/tests/i18n.locale-parity.test.ts` (the `merchantsOps` group is already in its `GROUPS` array at line 18 — we only ADD keys).
- `packages/db/types.ts` is hand-patched (no live `gen`); add the new function and tighten the tier overload there.
- **Test command (single file, from `apps/web`):** `pnpm exec vitest run tests/<file> --reporter=dot`. Do **not** use `pnpm --filter web test -- <pattern>` (runs real-DB suites that hang on dummy creds).
- **vitest does NOT typecheck.** After each code task run `pnpm exec tsc --noEmit` from `apps/web` (esbuild strips types; this has caught real errors).
- The admin merchants i18n group is `merchantsOps` (NOT the merchant-facing `merchants` group). Type alias in all merchant ops components is `type T = Messages['merchantsOps']`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Conventional Commits with scope (`feat(db):`, `feat(web):`, `i18n(web):`, `refactor(web):`).

---

## CRITICAL ORDERING (read before starting)

The legacy `admin_set_merchant_tier(uuid, text)` overload must be dropped **only after** no live app code path calls it. The ordering below is mandatory:

1. Tasks 1–8 build the Merchant 360 (additive, nothing removed). Task 1's migration adds `admin_merchant_detail` **only** — it does NOT yet drop the legacy overload.
2. Task 9 de-controls `/admin/users`: removes `setMerchantTierAction`, removes the `kind='merchant'` branch of `setUserStatusAction`, and strips the merchant `<select>`/toggle from `AdminUsersView`. **After Task 9, grep proves nothing calls the 2-arg overload.**
3. Task 10 adds a SECOND statement to Task 1's migration file: `DROP FUNCTION public.admin_set_merchant_tier(uuid, text);` and re-applies the migration live; then tightens `packages/db/types.ts` so `p_reason: string` is required.

Do NOT drop the function before Task 9 lands. If you execute tasks out of order, the running app would call a dropped function. The single migration file `20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql` is created in Task 1 with only the CREATE, and the DROP line is appended in Task 10 — so the file is re-applied (idempotent `create or replace` + the new `drop`).

---

## File Structure

**Create:**
- `supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql` — the detail aggregator RPC (Task 1); the `DROP FUNCTION` line appended in Task 10.
- `apps/web/components/kinnso/admin/merchants/detail/ProfileTab.tsx` — merchant profile incl. ops-only contact PII.
- `apps/web/components/kinnso/admin/merchants/detail/MissionsTab.tsx` — mission table (participants/milestone progress).
- `apps/web/components/kinnso/admin/merchants/detail/CreatorsTab.tsx` — engaged creators table + saved count.
- `apps/web/components/kinnso/admin/merchants/detail/BillingTab.tsx` — READ-ONLY settlements table + per-currency owed/settled.
- `apps/web/components/kinnso/admin/merchants/detail/ModerationTab.tsx` — audit timeline (presentational).
- `apps/web/components/kinnso/admin/merchants/MerchantDetailView.tsx` — client: header + quick-actions + sub-tabs + note form.
- `apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx` — gate → `getMerchantDetail` → `notFound()` if null → view.
- Tests: `apps/web/tests/admin.merchants-detail-queries.test.ts`, `apps/web/tests/kinnso.MerchantDetailTabs.test.tsx`, `apps/web/tests/kinnso.MerchantDetailView.test.tsx`, `apps/web/tests/admin.merchants-detail.host.test.tsx`.

**Modify:**
- `apps/web/lib/admin/merchants-queries.ts` — append `MerchantDetail` types + `getMerchantDetail()`.
- `packages/db/types.ts` — add `admin_merchant_detail` (Task 2); tighten `admin_set_merchant_tier` `p_reason` to required (Task 10).
- `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` — add 11C `merchantsOps` detail keys (+ extend the `Messages` interface in `en.ts`). (Task 3)
- `apps/web/components/kinnso/admin/merchants/MerchantsDirectoryView.tsx` — make the company name a `Link` into the 360 page (Task 9).
- `apps/web/tests/kinnso.MerchantsDirectoryView.test.tsx` — assert the row link target (Task 9).
- `apps/web/lib/admin/users-actions.ts` — remove `setMerchantTierAction` + the `kind='merchant'` branch (Task 10).
- `apps/web/components/kinnso/admin/AdminUsersView.tsx` — remove the tier `<select>` + status toggle for merchants; render the merchant row as a Link (Task 10).
- `apps/web/app/[locale]/admin/users/page.tsx` — drop the `setMerchantTierAction` import + `onSetMerchantTier` wiring (Task 10).
- `apps/web/tests/admin.users-actions.test.ts` — remove the `setMerchantTierAction` describe block (Task 10).
- `apps/web/tests/kinnso.AdminUsersView.test.tsx` — replace the tier-control test with a "merchant row links to 360, no inline mutation" test (Task 10).

---

## Data shape (the RPC payload → `MerchantDetail`)

`admin_merchant_detail(p_merchant_id)` returns this jsonb (snake_case), or SQL `null` when the merchant id does not exist (spec §6):

```jsonc
{
  "profile": { "id","company_name","contact_name","contact_email","website_url","status","tier","created_at","updated_at" }, // contact_* ops-only
  "missions": [ { "id","title","status","visibility","participants_count","milestones_total","milestones_approved","created_at" } ],
  "creators": {
    "engaged": [ { "creator_id","display_name","handle","participant_status" } ],
    "saved_count": 0
  },
  "billing": {
    "settlements": [ { "id","mission_title","status","creator_payout_status","kinnso_commission_status","affiliate_commission_status","currency","creator_payout_amount","updated_at" } ],
    "owed":   [ { "currency","amount" } ],   // READ-ONLY, per-currency
    "settled":[ { "currency","amount" } ]    // READ-ONLY, per-currency
  }
}
```

`getMerchantDetail` maps it to a camelCase `MerchantDetail` (Task 4). Audit history is **not** in this payload — the Moderation tab reads it separately via `listAudit(supabase, 'merchant', id)` (already built in 10A) so it refreshes on note-add. (Mirrors 10C creators: audit fetched in TS, not in the RPC — see `2026-06-29-phase10c-creator-360-detail.md:65`.)

**Schema-grounding (verified against `packages/db/types.ts`):**
- `merchant_profiles(id, company_name, contact_name, contact_email, website_url, status, tier, created_at, updated_at)` — `contact_email`/`contact_name` are the ops-only PII.
- `missions(id, merchant_profile_id, title, status, visibility, created_at, …)` — links to merchant via `merchant_profile_id`.
- `mission_participants(id, mission_id, creator_id, status, source, …)` — `participant_status` in the payload = `mp.status`; engaged-creator names come from `creators(display_name, handle)`.
- `mission_milestones(id, mission_id)` — `milestones_total` per mission; `mission_milestone_submissions(mission_milestone_id, status)` with `status='approved'` for `milestones_approved`.
- `merchant_saved_creators(merchant_id, creator_id)` — `saved_count` = row count for the merchant.
- `mission_settlements(id, mission_id, status, creator_payout_status, kinnso_commission_status, affiliate_commission_status, amount_currency, creator_commission_amount, updated_at, …)` — joined to the merchant via `missions.merchant_profile_id`. **There is no `creator_payout_amount` column; the spec field `creator_payout_amount` maps to the DB column `creator_commission_amount`** (same mapping discipline as 10C, where `creator_commission_amount` → `creatorCommissionAmount`, see `creators-queries.ts` `settlements` mapping). `currency` maps to `amount_currency`.
- Per-currency `owed` = sum of `creator_commission_amount` grouped by `amount_currency` where the settlement is NOT settled; `settled` = the same sum where it IS settled. "Settled" here means `creator_payout_status = 'paid'` (read-only honesty — never summed across currencies). Mirror 11A analytics owed/settled posture (`merchants-queries.ts:105-106`).

---

## Task 1: Aggregator RPC `admin_merchant_detail` (CREATE only — no DROP yet)

**Files:**
- Create: `supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql`

This RPC has no vitest unit (we test the wrapper with a mocked client in Task 4). It is verified by (a) applying it live, (b) a catalog query confirming it exists, and (c) `tsc` + the wrapper test exercising the mapping.

- [ ] **Step 1: Write the migration (CREATE + grants only)**

Create `supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql`:

```sql
-- Phase 11C — Merchant 360 detail aggregator + (appended in 11C Task 11) DROP of the legacy
-- 2-arg admin_set_merchant_tier overload. One SECURITY DEFINER, is_active_ops()-gated RPC
-- returning a single jsonb payload for the detail page (mirrors admin_merchant_analytics 11A
-- and admin_creator_detail 10C). Returns NULL when the merchant id does not exist, so the
-- page can render notFound(). Reads only; no writes, no audit. The profile section is the ONLY
-- place contact_email/contact_name (PII) is exposed — gated behind is_active_ops().
-- Settlements link to the merchant via missions.merchant_profile_id. Owed/settled are
-- per-currency arrays (never summed across currencies); "settled" = creator_payout_status='paid'.

create or replace function public.admin_merchant_detail(p_merchant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_exists boolean;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select true into v_exists from public.merchant_profiles where id = p_merchant_id;
  if v_exists is null then
    return null;  -- missing merchant -> wrapper returns null -> page notFound()
  end if;

  return jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', mp.id, 'company_name', mp.company_name,
        'contact_name', mp.contact_name, 'contact_email', mp.contact_email,
        'website_url', mp.website_url, 'status', mp.status, 'tier', mp.tier,
        'created_at', mp.created_at, 'updated_at', mp.updated_at)
      from public.merchant_profiles mp where mp.id = p_merchant_id
    ),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'status', m.status, 'visibility', m.visibility,
        'participants_count', (select count(*) from public.mission_participants mp where mp.mission_id = m.id),
        'milestones_total', (select count(*) from public.mission_milestones ms where ms.mission_id = m.id),
        'milestones_approved', (
          select count(*) from public.mission_milestone_submissions sub
          join public.mission_milestones ms on ms.id = sub.mission_milestone_id
          where ms.mission_id = m.id and sub.status = 'approved'
        ),
        'created_at', m.created_at)
        order by m.created_at desc)
      from public.missions m where m.merchant_profile_id = p_merchant_id
    ), '[]'::jsonb),
    'creators', jsonb_build_object(
      'engaged', coalesce((
        select jsonb_agg(row_to_json(e) order by e.display_name nulls last)
        from (
          select distinct on (mp.creator_id)
            mp.creator_id, c.display_name, c.handle, mp.status as participant_status
          from public.mission_participants mp
          join public.missions m on m.id = mp.mission_id
          join public.creators c on c.id = mp.creator_id
          where m.merchant_profile_id = p_merchant_id
          order by mp.creator_id, mp.created_at desc
        ) e
      ), '[]'::jsonb),
      'saved_count', (
        select count(*) from public.merchant_saved_creators sc where sc.merchant_id = p_merchant_id
      )
    ),
    'billing', jsonb_build_object(
      'settlements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', st.id, 'mission_title', m.title, 'status', st.status,
          'creator_payout_status', st.creator_payout_status,
          'kinnso_commission_status', st.kinnso_commission_status,
          'affiliate_commission_status', st.affiliate_commission_status,
          'currency', st.amount_currency,
          'creator_payout_amount', st.creator_commission_amount,
          'updated_at', st.updated_at)
          order by st.updated_at desc)
        from public.mission_settlements st
        join public.missions m on m.id = st.mission_id
        where m.merchant_profile_id = p_merchant_id
      ), '[]'::jsonb),
      'owed', coalesce((
        select jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount))
        from (
          select st.amount_currency as currency, sum(st.creator_commission_amount) as amount
          from public.mission_settlements st
          join public.missions m on m.id = st.mission_id
          where m.merchant_profile_id = p_merchant_id
            and coalesce(st.creator_payout_status, '') <> 'paid'
            and st.creator_commission_amount is not null
            and st.amount_currency is not null
          group by st.amount_currency
        ) t
      ), '[]'::jsonb),
      'settled', coalesce((
        select jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount))
        from (
          select st.amount_currency as currency, sum(st.creator_commission_amount) as amount
          from public.mission_settlements st
          join public.missions m on m.id = st.mission_id
          where m.merchant_profile_id = p_merchant_id
            and st.creator_payout_status = 'paid'
            and st.creator_commission_amount is not null
            and st.amount_currency is not null
          group by st.amount_currency
        ) t
      ), '[]'::jsonb)
    )
  );
end $$;

-- Grants: revoke implicit public+anon EXECUTE, grant authenticated only (is_active_ops() is the gate).
revoke all on function public.admin_merchant_detail(uuid) from public, anon;
grant execute on function public.admin_merchant_detail(uuid) to authenticated;

-- NOTE: the DROP of the legacy admin_set_merchant_tier(uuid, text) overload is appended to this
-- file in Phase 11C Task 10, AFTER the /admin/users de-control removes the last caller.
```

- [ ] **Step 2: Apply the migration live via MCP**

Apply with the Supabase MCP `apply_migration` (project `scryfkefedzuetfdtrvl`, name `admin_merchant_detail_and_drop_legacy_tier`). The controller performs this — the implementer subagent should ask the controller to apply it (subagents have no MCP migration authority here).

- [ ] **Step 3: Verify the function exists (catalog query, not an ops call)**

Run via MCP `execute_sql` against `scryfkefedzuetfdtrvl`:
```sql
select proname, pronargs from pg_proc where proname = 'admin_merchant_detail';
```
Expected: one row, `pronargs = 1`. (Do **not** call the function directly via MCP — `is_active_ops()` will raise `forbidden` since the MCP connection is not an ops session; that's the gate working.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql
git commit -m "feat(db): add admin_merchant_detail 360 aggregator RPC (Phase 11C)"
```

---

## Task 2: Hand-patch `packages/db/types.ts` — add `admin_merchant_detail`

**Files:**
- Modify: `packages/db/types.ts` (the `Functions` block; insert next to `admin_merchant_analytics` near line 1616)

- [ ] **Step 1: Add the function type**

Insert immediately after the `admin_merchant_analytics` entry (lines 1616-1619):

```ts
      admin_merchant_detail: {
        Args: { p_merchant_id: string }
        Returns: Json
      }
```

(Do NOT touch the `admin_set_merchant_tier` entry yet — that happens in Task 10, after de-control.)

- [ ] **Step 2: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit`
Expected: no errors (the new function is now known to `supabase.rpc`).

- [ ] **Step 3: Commit**

```bash
git add packages/db/types.ts
git commit -m "feat(db): type admin_merchant_detail in generated types (Phase 11C)"
```

---

## Task 3: i18n — 11C `merchantsOps` detail keys across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (the `merchantsOps` interface block near line 686 **and** the values block near line 1573)
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (values)
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (existing; must stay green)

The `merchantsOps` group already exists in `GROUPS` (parity test line 18). We only ADD keys. **Every key must be added to all 7 files or the parity test fails.**

- [ ] **Step 1: Extend the `Messages` interface in `en.ts`**

In `apps/web/lib/i18n/messages/en.ts`, inside the `merchantsOps: { … }` interface block, replace the last line before the closing brace:
```ts
    actionFailed: string
  }
```
with:
```ts
    actionFailed: string
    detailBack: string; detailJoined: string; detailUpdated: string
    tabProfile: string; tabMissions: string; tabCreators: string; tabBilling: string; tabModeration: string
    secContact: string; secWebsite: string; contactName: string; contactEmail: string; noContact: string
    colMission: string; colVisibility: string; colParticipants: string; colMilestones: string; missionsEmpty: string
    secEngaged: string; secSaved: string; colCreator: string; colHandle: string; colParticipantStatus: string
    creatorsEmpty: string; savedCount: string
    billingReadonly: string; colSettlement: string; colPayout: string; colKinnso: string; colAffiliate: string
    colAmount: string; colCurrency: string; settlementsEmpty: string; owedTitle: string; settledTitle: string; moneyEmpty: string
    secAudit: string; auditEmpty: string; addNote: string; saveNote: string
    viewDetail: string
  }
```

- [ ] **Step 2: Add the English values in `en.ts`**

In the `merchantsOps: { … }` values block (near line 1573), replace the last line before the closing brace:
```ts
    actionFailed: 'That action could not be completed.',
  },
```
(Match the EXACT existing text of `actionFailed` in the values block — read it first; the punctuation may differ. Then append the new keys after it.) with:
```ts
    actionFailed: 'That action could not be completed.',
    detailBack: 'Back to directory', detailJoined: 'Joined', detailUpdated: 'Updated',
    tabProfile: 'Profile', tabMissions: 'Missions', tabCreators: 'Creators', tabBilling: 'Billing', tabModeration: 'Moderation',
    secContact: 'Contact', secWebsite: 'Website', contactName: 'Contact name', contactEmail: 'Contact email', noContact: 'No contact on file',
    colMission: 'Mission', colVisibility: 'Visibility', colParticipants: 'Participants', colMilestones: 'Milestones', missionsEmpty: 'No missions yet',
    secEngaged: 'Engaged creators', secSaved: 'Saved creators', colCreator: 'Creator', colHandle: 'Handle', colParticipantStatus: 'Status',
    creatorsEmpty: 'No engaged creators yet', savedCount: 'saved',
    billingReadonly: 'Read-only — settlement writes happen in the Payouts queue.', colSettlement: 'Settlement', colPayout: 'Payout', colKinnso: 'KINNSO', colAffiliate: 'Affiliate',
    colAmount: 'Amount', colCurrency: 'Currency', settlementsEmpty: 'No settlements yet', owedTitle: 'Owed', settledTitle: 'Settled', moneyEmpty: 'None',
    secAudit: 'Moderation history', auditEmpty: 'No moderation activity yet', addNote: 'Add a note', saveNote: 'Save note',
    viewDetail: 'View 360',
  },
```

- [ ] **Step 3: Add the same keys (translated) to the other 6 locales**

In each of `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`, locate the `merchantsOps: { … }` values block's `actionFailed: …,` line and append the same keys immediately after it, with these translations:

**`zh-hk.ts` (Traditional, HK):**
```ts
    detailBack: '返回目錄', detailJoined: '加入於', detailUpdated: '更新於',
    tabProfile: '檔案', tabMissions: '任務', tabCreators: '創作者', tabBilling: '帳務', tabModeration: '審核',
    secContact: '聯絡', secWebsite: '網站', contactName: '聯絡人', contactEmail: '聯絡電郵', noContact: '沒有聯絡資料',
    colMission: '任務', colVisibility: '可見度', colParticipants: '參與者', colMilestones: '里程碑', missionsEmpty: '尚無任務',
    secEngaged: '參與創作者', secSaved: '已收藏創作者', colCreator: '創作者', colHandle: '帳號', colParticipantStatus: '狀態',
    creatorsEmpty: '尚無參與創作者', savedCount: '已收藏',
    billingReadonly: '唯讀 — 結算寫入於派付佇列進行。', colSettlement: '結算', colPayout: '派付', colKinnso: 'KINNSO', colAffiliate: '聯盟',
    colAmount: '金額', colCurrency: '貨幣', settlementsEmpty: '尚無結算', owedTitle: '應付', settledTitle: '已結算', moneyEmpty: '無',
    secAudit: '審核紀錄', auditEmpty: '尚無審核活動', addNote: '新增備註', saveNote: '儲存備註',
    viewDetail: '查看 360',
```

**`zh-tw.ts` (Traditional, TW):**
```ts
    detailBack: '返回目錄', detailJoined: '加入於', detailUpdated: '更新於',
    tabProfile: '檔案', tabMissions: '任務', tabCreators: '創作者', tabBilling: '帳務', tabModeration: '審核',
    secContact: '聯絡', secWebsite: '網站', contactName: '聯絡人', contactEmail: '聯絡電郵', noContact: '沒有聯絡資料',
    colMission: '任務', colVisibility: '可見度', colParticipants: '參與者', colMilestones: '里程碑', missionsEmpty: '尚無任務',
    secEngaged: '參與創作者', secSaved: '已收藏創作者', colCreator: '創作者', colHandle: '帳號', colParticipantStatus: '狀態',
    creatorsEmpty: '尚無參與創作者', savedCount: '已收藏',
    billingReadonly: '唯讀 — 結算寫入於撥款佇列進行。', colSettlement: '結算', colPayout: '撥款', colKinnso: 'KINNSO', colAffiliate: '聯盟',
    colAmount: '金額', colCurrency: '貨幣', settlementsEmpty: '尚無結算', owedTitle: '應付', settledTitle: '已結算', moneyEmpty: '無',
    secAudit: '審核紀錄', auditEmpty: '尚無審核活動', addNote: '新增備註', saveNote: '儲存備註',
    viewDetail: '查看 360',
```

**`zh-cn.ts` (Simplified):**
```ts
    detailBack: '返回目录', detailJoined: '加入于', detailUpdated: '更新于',
    tabProfile: '资料', tabMissions: '任务', tabCreators: '创作者', tabBilling: '账务', tabModeration: '审核',
    secContact: '联系', secWebsite: '网站', contactName: '联系人', contactEmail: '联系邮箱', noContact: '暂无联系资料',
    colMission: '任务', colVisibility: '可见度', colParticipants: '参与者', colMilestones: '里程碑', missionsEmpty: '暂无任务',
    secEngaged: '参与创作者', secSaved: '已收藏创作者', colCreator: '创作者', colHandle: '账号', colParticipantStatus: '状态',
    creatorsEmpty: '暂无参与创作者', savedCount: '已收藏',
    billingReadonly: '只读 — 结算写入在支付队列进行。', colSettlement: '结算', colPayout: '支付', colKinnso: 'KINNSO', colAffiliate: '联盟',
    colAmount: '金额', colCurrency: '货币', settlementsEmpty: '暂无结算', owedTitle: '应付', settledTitle: '已结算', moneyEmpty: '无',
    secAudit: '审核记录', auditEmpty: '暂无审核活动', addNote: '添加备注', saveNote: '保存备注',
    viewDetail: '查看 360',
```

**`ja.ts` (Japanese):**
```ts
    detailBack: 'ディレクトリへ戻る', detailJoined: '参加日', detailUpdated: '更新日',
    tabProfile: 'プロフィール', tabMissions: 'ミッション', tabCreators: 'クリエイター', tabBilling: '請求', tabModeration: 'モデレーション',
    secContact: '連絡先', secWebsite: 'ウェブサイト', contactName: '担当者名', contactEmail: '連絡先メール', noContact: '連絡先情報なし',
    colMission: 'ミッション', colVisibility: '公開範囲', colParticipants: '参加者', colMilestones: 'マイルストーン', missionsEmpty: 'ミッションはまだありません',
    secEngaged: '参加クリエイター', secSaved: '保存済みクリエイター', colCreator: 'クリエイター', colHandle: 'ハンドル', colParticipantStatus: 'ステータス',
    creatorsEmpty: '参加クリエイターはまだいません', savedCount: '保存済み',
    billingReadonly: '読み取り専用 — 精算の書き込みは支払いキューで行います。', colSettlement: '精算', colPayout: '支払い', colKinnso: 'KINNSO', colAffiliate: 'アフィリエイト',
    colAmount: '金額', colCurrency: '通貨', settlementsEmpty: '精算はまだありません', owedTitle: '未払い', settledTitle: '精算済み', moneyEmpty: 'なし',
    secAudit: 'モデレーション履歴', auditEmpty: 'モデレーション活動はまだありません', addNote: 'メモを追加', saveNote: 'メモを保存',
    viewDetail: '360 を表示',
```

**`ko.ts` (Korean):**
```ts
    detailBack: '디렉터리로 돌아가기', detailJoined: '가입일', detailUpdated: '업데이트',
    tabProfile: '프로필', tabMissions: '미션', tabCreators: '크리에이터', tabBilling: '결제', tabModeration: '모더레이션',
    secContact: '연락처', secWebsite: '웹사이트', contactName: '담당자', contactEmail: '연락처 이메일', noContact: '연락처 정보 없음',
    colMission: '미션', colVisibility: '공개 범위', colParticipants: '참여자', colMilestones: '마일스톤', missionsEmpty: '아직 미션이 없습니다',
    secEngaged: '참여 크리에이터', secSaved: '저장된 크리에이터', colCreator: '크리에이터', colHandle: '핸들', colParticipantStatus: '상태',
    creatorsEmpty: '아직 참여 크리에이터가 없습니다', savedCount: '저장됨',
    billingReadonly: '읽기 전용 — 정산 기록은 지급 대기열에서 처리됩니다.', colSettlement: '정산', colPayout: '지급', colKinnso: 'KINNSO', colAffiliate: '제휴',
    colAmount: '금액', colCurrency: '통화', settlementsEmpty: '아직 정산이 없습니다', owedTitle: '미지급', settledTitle: '정산됨', moneyEmpty: '없음',
    secAudit: '모더레이션 기록', auditEmpty: '아직 모더레이션 활동이 없습니다', addNote: '메모 추가', saveNote: '메모 저장',
    viewDetail: '360 보기',
```

**`th.ts` (Thai):**
```ts
    detailBack: 'กลับไปยังไดเรกทอรี', detailJoined: 'เข้าร่วมเมื่อ', detailUpdated: 'อัปเดตเมื่อ',
    tabProfile: 'โปรไฟล์', tabMissions: 'ภารกิจ', tabCreators: 'ครีเอเตอร์', tabBilling: 'การเรียกเก็บเงิน', tabModeration: 'การกำกับดูแล',
    secContact: 'ติดต่อ', secWebsite: 'เว็บไซต์', contactName: 'ชื่อผู้ติดต่อ', contactEmail: 'อีเมลติดต่อ', noContact: 'ไม่มีข้อมูลติดต่อ',
    colMission: 'ภารกิจ', colVisibility: 'การมองเห็น', colParticipants: 'ผู้เข้าร่วม', colMilestones: 'เหตุการณ์สำคัญ', missionsEmpty: 'ยังไม่มีภารกิจ',
    secEngaged: 'ครีเอเตอร์ที่เข้าร่วม', secSaved: 'ครีเอเตอร์ที่บันทึก', colCreator: 'ครีเอเตอร์', colHandle: 'แฮนเดิล', colParticipantStatus: 'สถานะ',
    creatorsEmpty: 'ยังไม่มีครีเอเตอร์ที่เข้าร่วม', savedCount: 'บันทึกแล้ว',
    billingReadonly: 'อ่านอย่างเดียว — การบันทึกการชำระบัญชีทำในคิวการจ่าย', colSettlement: 'การชำระบัญชี', colPayout: 'การจ่าย', colKinnso: 'KINNSO', colAffiliate: 'พันธมิตร',
    colAmount: 'จำนวนเงิน', colCurrency: 'สกุลเงิน', settlementsEmpty: 'ยังไม่มีการชำระบัญชี', owedTitle: 'ค้างจ่าย', settledTitle: 'ชำระแล้ว', moneyEmpty: 'ไม่มี',
    secAudit: 'ประวัติการกำกับดูแล', auditEmpty: 'ยังไม่มีกิจกรรมการกำกับดูแล', addNote: 'เพิ่มบันทึก', saveNote: 'บันทึกหมายเหตุ',
    viewDetail: 'ดู 360',
```

- [ ] **Step 4: Run the parity test**

Run from `apps/web`: `pnpm exec vitest run tests/i18n.locale-parity.test.ts --reporter=dot`
Expected: PASS (no missing/extra keys across locales).

- [ ] **Step 5: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors (every locale satisfies the extended `Messages` interface).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "i18n(web): add merchantsOps 360 detail strings (Phase 11C)"
```

---

## Task 4: `getMerchantDetail` query wrapper + `MerchantDetail` types

**Files:**
- Modify: `apps/web/lib/admin/merchants-queries.ts` (append)
- Test: `apps/web/tests/admin.merchants-detail-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/admin.merchants-detail-queries.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { getMerchantDetail } from '@/lib/admin/merchants-queries'

function clientReturning(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) } as never
}

const payload = {
  profile: {
    id: 'm1', company_name: 'Acme Co', contact_name: 'Pat', contact_email: 'pat@acme.test',
    website_url: 'https://acme.test', status: 'active', tier: 'growth',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  missions: [{ id: 'mi1', title: 'Tokyo eats', status: 'live', visibility: 'public', participants_count: 4, milestones_total: 3, milestones_approved: 1, created_at: '2026-06-02T00:00:00Z' }],
  creators: { engaged: [{ creator_id: 'c1', display_name: 'Mia', handle: 'mia', participant_status: 'active' }], saved_count: 7 },
  billing: {
    settlements: [{ id: 's1', mission_title: 'Tokyo eats', status: 'pending', creator_payout_status: 'pending', kinnso_commission_status: 'pending', affiliate_commission_status: null, currency: 'HKD', creator_payout_amount: 120.5, updated_at: '2026-06-03T00:00:00Z' }],
    owed: [{ currency: 'HKD', amount: 120.5 }, { currency: 'JPY', amount: 9000 }],
    settled: [{ currency: 'HKD', amount: 50 }],
  },
}

describe('getMerchantDetail', () => {
  it('maps the RPC payload to a camelCase MerchantDetail', async () => {
    const supabase = clientReturning(payload)
    const detail = await getMerchantDetail(supabase, 'm1')
    expect(detail).not.toBeNull()
    expect(detail!.profile).toMatchObject({ id: 'm1', companyName: 'Acme Co', contactName: 'Pat', contactEmail: 'pat@acme.test', status: 'active', tier: 'growth' })
    expect(detail!.missions[0]).toMatchObject({ id: 'mi1', title: 'Tokyo eats', participantsCount: 4, milestonesTotal: 3, milestonesApproved: 1 })
    expect(detail!.creators.engaged[0]).toMatchObject({ creatorId: 'c1', displayName: 'Mia', participantStatus: 'active' })
    expect(detail!.creators.savedCount).toBe(7)
    expect(detail!.billing.settlements[0]).toMatchObject({ missionTitle: 'Tokyo eats', creatorPayoutAmount: 120.5, currency: 'HKD' })
    // per-currency honesty: arrays preserved, never collapsed/summed
    expect(detail!.billing.owed).toEqual([{ currency: 'HKD', amount: 120.5 }, { currency: 'JPY', amount: 9000 }])
    expect(detail!.billing.settled).toEqual([{ currency: 'HKD', amount: 50 }])
  })

  it('returns null when the merchant is missing (RPC returns null)', async () => {
    const supabase = clientReturning(null)
    expect(await getMerchantDetail(supabase, 'nope')).toBeNull()
  })

  it('propagates errors (no silent null)', async () => {
    const supabase = clientReturning(null, new Error('boom'))
    await expect(getMerchantDetail(supabase, 'm1')).rejects.toThrow('boom')
  })

  it('tolerates empty sections', async () => {
    const supabase = clientReturning({ ...payload, missions: [], creators: { engaged: [], saved_count: 0 }, billing: { settlements: [], owed: [], settled: [] } })
    const detail = await getMerchantDetail(supabase, 'm1')
    expect(detail!.missions).toEqual([])
    expect(detail!.creators.engaged).toEqual([])
    expect(detail!.billing.owed).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/admin.merchants-detail-queries.test.ts --reporter=dot`
Expected: FAIL with "getMerchantDetail is not a function" / import error.

- [ ] **Step 3: Append the implementation to `merchants-queries.ts`**

Append at the end of `apps/web/lib/admin/merchants-queries.ts`:

```ts
export interface MerchantDetailProfile {
  id: string
  companyName: string
  contactName: string | null
  contactEmail: string | null
  websiteUrl: string | null
  status: string
  tier: string
  createdAt: string
  updatedAt: string
}
export interface MerchantDetailMission {
  id: string
  title: string
  status: string
  visibility: string | null
  participantsCount: number
  milestonesTotal: number
  milestonesApproved: number
  createdAt: string
}
export interface MerchantDetailEngagedCreator {
  creatorId: string
  displayName: string | null
  handle: string | null
  participantStatus: string
}
export interface MerchantDetailSettlement {
  id: string
  missionTitle: string
  status: string
  creatorPayoutStatus: string | null
  kinnsoCommissionStatus: string | null
  affiliateCommissionStatus: string | null
  currency: string | null
  creatorPayoutAmount: number | null
  updatedAt: string
}
export interface MerchantDetailMoney { currency: string; amount: number }

export interface MerchantDetail {
  profile: MerchantDetailProfile
  missions: MerchantDetailMission[]
  creators: { engaged: MerchantDetailEngagedCreator[]; savedCount: number }
  billing: {
    settlements: MerchantDetailSettlement[]
    owed: MerchantDetailMoney[]
    settled: MerchantDetailMoney[]
  }
}

type DetailPayload = {
  profile: { id: string; company_name: string; contact_name: string | null; contact_email: string | null; website_url: string | null; status: string; tier: string; created_at: string; updated_at: string }
  missions: { id: string; title: string; status: string; visibility: string | null; participants_count: number; milestones_total: number; milestones_approved: number; created_at: string }[]
  creators: { engaged: { creator_id: string; display_name: string | null; handle: string | null; participant_status: string }[]; saved_count: number }
  billing: {
    settlements: { id: string; mission_title: string; status: string; creator_payout_status: string | null; kinnso_commission_status: string | null; affiliate_commission_status: string | null; currency: string | null; creator_payout_amount: number | null; updated_at: string }[]
    owed: { currency: string; amount: number }[]
    settled: { currency: string; amount: number }[]
  }
}

/**
 * Full ops-aggregate 360 for one merchant. Single SECURITY DEFINER RPC
 * (`admin_merchant_detail`, is_active_ops()-gated) so ops sees all sections despite
 * owner-scoped RLS, including ops-only contact PII. Returns null when the merchant id
 * does not exist (page -> notFound()). Billing is READ-ONLY; owed/settled stay per-currency
 * (never summed). Audit history is fetched separately by the page via listAudit(). Errors propagate.
 */
export async function getMerchantDetail(supabase: Client, merchantId: string): Promise<MerchantDetail | null> {
  const { data, error } = await supabase.rpc('admin_merchant_detail', { p_merchant_id: merchantId })
  if (error) throw error
  if (!data) return null
  const p = data as unknown as DetailPayload
  return {
    profile: {
      id: p.profile.id, companyName: p.profile.company_name,
      contactName: p.profile.contact_name, contactEmail: p.profile.contact_email,
      websiteUrl: p.profile.website_url, status: p.profile.status, tier: p.profile.tier,
      createdAt: p.profile.created_at, updatedAt: p.profile.updated_at,
    },
    missions: (p.missions ?? []).map((m) => ({
      id: m.id, title: m.title, status: m.status, visibility: m.visibility,
      participantsCount: Number(m.participants_count), milestonesTotal: Number(m.milestones_total),
      milestonesApproved: Number(m.milestones_approved), createdAt: m.created_at,
    })),
    creators: {
      engaged: (p.creators?.engaged ?? []).map((e) => ({
        creatorId: e.creator_id, displayName: e.display_name, handle: e.handle, participantStatus: e.participant_status,
      })),
      savedCount: Number(p.creators?.saved_count ?? 0),
    },
    billing: {
      settlements: (p.billing?.settlements ?? []).map((s) => ({
        id: s.id, missionTitle: s.mission_title, status: s.status,
        creatorPayoutStatus: s.creator_payout_status,
        kinnsoCommissionStatus: s.kinnso_commission_status,
        affiliateCommissionStatus: s.affiliate_commission_status,
        currency: s.currency,
        creatorPayoutAmount: s.creator_payout_amount === null ? null : Number(s.creator_payout_amount),
        updatedAt: s.updated_at,
      })),
      owed: (p.billing?.owed ?? []).map((o) => ({ currency: o.currency, amount: Number(o.amount) })),
      settled: (p.billing?.settled ?? []).map((s) => ({ currency: s.currency, amount: Number(s.amount) })),
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/admin.merchants-detail-queries.test.ts --reporter=dot`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/admin/merchants-queries.ts apps/web/tests/admin.merchants-detail-queries.test.ts
git commit -m "feat(web): add getMerchantDetail 360 aggregator query (Phase 11C)"
```

---

## Task 5: Presentational tab components

**Files:**
- Create: `apps/web/components/kinnso/admin/merchants/detail/ProfileTab.tsx`
- Create: `apps/web/components/kinnso/admin/merchants/detail/MissionsTab.tsx`
- Create: `apps/web/components/kinnso/admin/merchants/detail/CreatorsTab.tsx`
- Create: `apps/web/components/kinnso/admin/merchants/detail/BillingTab.tsx`
- Create: `apps/web/components/kinnso/admin/merchants/detail/ModerationTab.tsx`
- Test: `apps/web/tests/kinnso.MerchantDetailTabs.test.tsx`

These are pure functions (no hooks) so they need no `'use client'`; they are imported by the client `MerchantDetailView`. Each takes `t: Messages['merchantsOps']` plus its slice of `MerchantDetail` (and `ModerationTab` takes `AuditEntry[]`). Use a shared local date helper `d.slice(0,10)` for dates (matches the directory/overview views). `BillingTab` is **read-only** — it renders tables and the per-currency owed/settled, with NO buttons or mutation controls. Reuse `MerchantStatusBadge`/`MerchantTierBadge` from `badges.tsx` in the Profile section. (Mirror 10C tab components in `apps/web/components/kinnso/admin/creators/detail/*`.)

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.MerchantDetailTabs.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ProfileTab } from '@/components/kinnso/admin/merchants/detail/ProfileTab'
import { MissionsTab } from '@/components/kinnso/admin/merchants/detail/MissionsTab'
import { CreatorsTab } from '@/components/kinnso/admin/merchants/detail/CreatorsTab'
import { BillingTab } from '@/components/kinnso/admin/merchants/detail/BillingTab'
import { ModerationTab } from '@/components/kinnso/admin/merchants/detail/ModerationTab'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'
import type { AuditEntry } from '@/lib/admin/audit'

afterEach(cleanup)
const t = en.merchantsOps

const detail: MerchantDetail = {
  profile: { id: 'm1', companyName: 'Acme Co', contactName: 'Pat', contactEmail: 'pat@acme.test', websiteUrl: 'https://acme.test', status: 'active', tier: 'growth', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  missions: [{ id: 'mi1', title: 'Tokyo eats', status: 'live', visibility: 'public', participantsCount: 4, milestonesTotal: 3, milestonesApproved: 1, createdAt: '2026-06-02T00:00:00Z' }],
  creators: { engaged: [{ creatorId: 'c1', displayName: 'Mia', handle: 'mia', participantStatus: 'active' }], savedCount: 7 },
  billing: {
    settlements: [{ id: 's1', missionTitle: 'Tokyo eats', status: 'pending', creatorPayoutStatus: 'pending', kinnsoCommissionStatus: 'pending', affiliateCommissionStatus: null, currency: 'HKD', creatorPayoutAmount: 120.5, updatedAt: '2026-06-03T00:00:00Z' }],
    owed: [{ currency: 'HKD', amount: 120.5 }, { currency: 'JPY', amount: 9000 }],
    settled: [{ currency: 'HKD', amount: 50 }],
  },
}
const empty: MerchantDetail = { ...detail, profile: { ...detail.profile, contactName: null, contactEmail: null }, missions: [], creators: { engaged: [], savedCount: 0 }, billing: { settlements: [], owed: [], settled: [] } }

describe('Merchant detail tabs', () => {
  it('ProfileTab shows ops-only contact PII', () => {
    render(<ProfileTab t={t} profile={detail.profile} />)
    expect(screen.getByText('pat@acme.test')).toBeTruthy()
    expect(screen.getByText('Pat')).toBeTruthy()
  })
  it('ProfileTab shows the no-contact empty state', () => {
    render(<ProfileTab t={t} profile={empty.profile} />)
    expect(screen.getByText(t.noContact)).toBeTruthy()
  })
  it('MissionsTab lists missions and milestone progress', () => {
    render(<MissionsTab t={t} missions={detail.missions} />)
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
  })
  it('MissionsTab shows empty state', () => {
    render(<MissionsTab t={t} missions={[]} />)
    expect(screen.getByText(t.missionsEmpty)).toBeTruthy()
  })
  it('CreatorsTab lists engaged creators and the saved count', () => {
    render(<CreatorsTab t={t} creators={detail.creators} />)
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(screen.getByText(/7/)).toBeTruthy()
  })
  it('BillingTab is read-only: renders settlement + per-currency money, no buttons', () => {
    const { container } = render(<BillingTab t={t} billing={detail.billing} />)
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
    expect(screen.getByText('JPY')).toBeTruthy() // second currency never collapsed
    expect(screen.getByText(t.billingReadonly)).toBeTruthy()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('select')).toBeNull()
  })
  it('ModerationTab lists audit entries and shows empty state', () => {
    const entries: AuditEntry[] = [{ id: 'a1', entityType: 'merchant', entityId: 'm1', action: 'status.paused', reason: 'review', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]
    const { rerender } = render(<ModerationTab t={t} entries={entries} />)
    expect(screen.getByText('status.paused')).toBeTruthy()
    expect(screen.getByText('review')).toBeTruthy()
    rerender(<ModerationTab t={t} entries={[]} />)
    expect(screen.getByText(t.auditEmpty)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.MerchantDetailTabs.test.tsx --reporter=dot`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `ProfileTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetailProfile } from '@/lib/admin/merchants-queries'
import { MerchantStatusBadge, MerchantTierBadge } from '@/components/kinnso/admin/merchants/badges'

type T = Messages['merchantsOps']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function ProfileTab({ t, profile }: { t: T; profile: MerchantDetailProfile }) {
  const hasContact = profile.contactName || profile.contactEmail
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-kinnso-line p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secContact}</p>
        {hasContact ? (
          <dl className="text-sm text-kinnso-muted">
            {profile.contactName ? <div className="flex justify-between gap-2"><dt>{t.contactName}</dt><dd className="text-kinnso-ink">{profile.contactName}</dd></div> : null}
            {profile.contactEmail ? <div className="flex justify-between gap-2"><dt>{t.contactEmail}</dt><dd className="min-w-0 truncate text-right text-kinnso-ink">{profile.contactEmail}</dd></div> : null}
          </dl>
        ) : <p className="text-sm text-kinnso-muted">{t.noContact}</p>}
      </section>
      <section className="rounded-xl border border-kinnso-line p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secWebsite}</p>
        {profile.websiteUrl
          ? <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="text-sm text-kinnso-orange hover:underline">{profile.websiteUrl}</a>
          : <p className="text-sm text-kinnso-muted">—</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MerchantStatusBadge status={profile.status} t={t} />
          <MerchantTierBadge tier={profile.tier} t={t} />
        </div>
        <p className="mt-3 text-sm text-kinnso-muted">{t.detailJoined} {day(profile.createdAt)} · {t.detailUpdated} {day(profile.updatedAt)}</p>
      </section>
    </div>
  )
}

export default ProfileTab
```

- [ ] **Step 4: Implement `MissionsTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetailMission } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function MissionsTab({ t, missions }: { t: T; missions: MerchantDetailMission[] }) {
  if (missions.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.missionsEmpty}</p>
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-kinnso-muted">
        <tr className="border-b border-kinnso-line">
          <th className="py-2 font-bold">{t.colMission}</th>
          <th className="py-2 font-bold">{t.colStatus}</th>
          <th className="py-2 font-bold">{t.colVisibility}</th>
          <th className="py-2 font-bold">{t.colParticipants}</th>
          <th className="py-2 font-bold">{t.colMilestones}</th>
          <th className="py-2 font-bold">{t.colJoined}</th>
        </tr>
      </thead>
      <tbody>
        {missions.map((m) => (
          <tr key={m.id} className="border-b border-kinnso-line/60">
            <td className="py-2 font-bold text-kinnso-ink">{m.title}</td>
            <td className="py-2 text-kinnso-muted">{m.status}</td>
            <td className="py-2 text-kinnso-muted">{m.visibility ?? '—'}</td>
            <td className="py-2 text-kinnso-muted">{m.participantsCount}</td>
            <td className="py-2 text-kinnso-muted">{m.milestonesApproved}/{m.milestonesTotal}</td>
            <td className="py-2 text-kinnso-muted">{day(m.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default MissionsTab
```

- [ ] **Step 5: Implement `CreatorsTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']

export function CreatorsTab({ t, creators }: { t: T; creators: MerchantDetail['creators'] }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secSaved}</p>
        <p className="text-2xl font-black text-kinnso-ink">{creators.savedCount} <span className="text-sm font-bold text-kinnso-muted">{t.savedCount}</span></p>
      </section>
      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secEngaged}</p>
        {creators.engaged.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.creatorsEmpty}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-line">
                <th className="py-2 font-bold">{t.colCreator}</th>
                <th className="py-2 font-bold">{t.colHandle}</th>
                <th className="py-2 font-bold">{t.colParticipantStatus}</th>
              </tr>
            </thead>
            <tbody>
              {creators.engaged.map((e) => (
                <tr key={e.creatorId} className="border-b border-kinnso-line/60">
                  <td className="py-2 font-bold text-kinnso-ink">{e.displayName ?? e.handle ?? e.creatorId}</td>
                  <td className="py-2 text-kinnso-muted">{e.handle ? `@${e.handle}` : '—'}</td>
                  <td className="py-2 text-kinnso-muted">{e.participantStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default CreatorsTab
```

- [ ] **Step 6: Implement `BillingTab.tsx` (READ-ONLY)**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')
const money = (n: number | null) => (n === null ? '—' : n.toFixed(2))

function MoneyList({ rows, empty }: { rows: { currency: string; amount: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-kinnso-muted">{empty}</p>
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((r) => (
        <li key={r.currency} className="flex justify-between gap-2">
          <span className="font-bold text-kinnso-ink">{r.currency}</span>
          <span className="text-kinnso-muted">{r.amount.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  )
}

export function BillingTab({ t, billing }: { t: T; billing: MerchantDetail['billing'] }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-lg bg-kinnso-cream2 px-3 py-2 text-sm text-kinnso-muted">{t.billingReadonly}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-kinnso-line p-4">
          <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.owedTitle}</p>
          <MoneyList rows={billing.owed} empty={t.moneyEmpty} />
        </section>
        <section className="rounded-xl border border-kinnso-line p-4">
          <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.settledTitle}</p>
          <MoneyList rows={billing.settled} empty={t.moneyEmpty} />
        </section>
      </div>

      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.colSettlement}</p>
        {billing.settlements.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.settlementsEmpty}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-line">
                <th className="py-2 font-bold">{t.colMission}</th>
                <th className="py-2 font-bold">{t.colAmount}</th>
                <th className="py-2 font-bold">{t.colCurrency}</th>
                <th className="py-2 font-bold">{t.colPayout}</th>
                <th className="py-2 font-bold">{t.colKinnso}</th>
                <th className="py-2 font-bold">{t.colAffiliate}</th>
                <th className="py-2 font-bold">{t.colStatus}</th>
                <th className="py-2 font-bold">{t.detailUpdated}</th>
              </tr>
            </thead>
            <tbody>
              {billing.settlements.map((s) => (
                <tr key={s.id} className="border-b border-kinnso-line/60">
                  <td className="py-2 font-bold text-kinnso-ink">{s.missionTitle}</td>
                  <td className="py-2 text-kinnso-muted">{money(s.creatorPayoutAmount)}</td>
                  <td className="py-2 text-kinnso-muted">{s.currency ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.creatorPayoutStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.kinnsoCommissionStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.affiliateCommissionStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.status}</td>
                  <td className="py-2 text-kinnso-muted">{day(s.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default BillingTab
```

- [ ] **Step 7: Implement `ModerationTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { AuditEntry } from '@/lib/admin/audit'

type T = Messages['merchantsOps']
const day = (s: string) => s.slice(0, 10)

export function ModerationTab({ t, entries }: { t: T; entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.auditEmpty}</p>
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.id} className="rounded-xl border border-kinnso-line p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-kinnso-ink">{e.action}</span>
            <span className="shrink-0 text-kinnso-muted">{day(e.createdAt)}</span>
          </div>
          {e.reason ? <p className="mt-1 text-kinnso-muted">{e.reason}</p> : null}
        </li>
      ))}
    </ul>
  )
}

export default ModerationTab
```

- [ ] **Step 8: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.MerchantDetailTabs.test.tsx --reporter=dot`
Expected: PASS (7 tests).

- [ ] **Step 9: Typecheck + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
```bash
git add apps/web/components/kinnso/admin/merchants/detail apps/web/tests/kinnso.MerchantDetailTabs.test.tsx
git commit -m "feat(web): add merchant 360 detail tab components (Phase 11C)"
```

---

## Task 6: `MerchantDetailView` (client) — header, quick-actions, sub-tabs, note form

**Files:**
- Create: `apps/web/components/kinnso/admin/merchants/MerchantDetailView.tsx`
- Test: `apps/web/tests/kinnso.MerchantDetailView.test.tsx`

The view owns: active-tab state; a shared reason input + pending/error state for header status/tier quick-actions; and a note input for the Moderation tab. It reuses the existing badge components and the 11B action signatures (passed as props for testability, exactly like `MerchantsDirectoryView`). The header quick-actions reuse the SAME action contracts as the directory: `setMerchantStatus(locale,id,status,reason)`, `setMerchantTier(locale,id,tier,reason)`, `addMerchantNote(locale,id,note)`. (Mirror 10C `CreatorDetailView` at `2026-06-29-phase10c-creator-360-detail.md:1025-1188`, but merchant status has no linear lifecycle, so the status action opens a `<select>` of all four statuses, same as the directory `pending.kind === 'status'` block in `MerchantsDirectoryView.tsx:185-196`.)

On a successful action, call `router.refresh()`; on failure, render the friendly error from `ActionResult.errors`. Billing tab gets NO action wiring (read-only).

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.MerchantDetailView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MerchantDetailView } from '@/components/kinnso/admin/merchants/MerchantDetailView'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'
import type { AuditEntry } from '@/lib/admin/audit'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }))
afterEach(cleanup)
beforeEach(() => refreshMock.mockReset())

const detail: MerchantDetail = {
  profile: { id: 'm1', companyName: 'Acme Co', contactName: 'Pat', contactEmail: 'pat@acme.test', websiteUrl: null, status: 'active', tier: 'free', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  missions: [{ id: 'mi1', title: 'Tokyo eats', status: 'live', visibility: 'public', participantsCount: 4, milestonesTotal: 3, milestonesApproved: 1, createdAt: '2026-06-02T00:00:00Z' }],
  creators: { engaged: [], savedCount: 0 },
  billing: { settlements: [], owed: [], settled: [] },
}
const audit: AuditEntry[] = [{ id: 'a1', entityType: 'merchant', entityId: 'm1', action: 'status.paused', reason: 'review', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]

function makeActions() {
  return {
    setMerchantStatus: vi.fn(async () => ({ ok: true as const, id: 'm1', status: 'suspended' as const })),
    setMerchantTier: vi.fn(async () => ({ ok: true as const, id: 'm1', tier: 'growth' as const })),
    addMerchantNote: vi.fn(async () => ({ ok: true as const, id: 'm1' })),
  }
}

function renderView(actions = makeActions()) {
  render(<MerchantDetailView t={en.merchantsOps} locale="en" detail={detail} audit={audit} actions={actions} />)
  return actions
}

describe('MerchantDetailView', () => {
  it('renders the header with company name, status and tier', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Acme Co' })).toBeTruthy()
    expect(screen.getAllByText(en.merchantsOps.statusActive).length).toBeGreaterThan(0)
  })
  it('switches to the Missions tab and shows a mission', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.tabMissions }))
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
  })
  it('sets a status with a reason via the header action', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actSetStatus }))
    fireEvent.change(screen.getByDisplayValue(en.merchantsOps.statusActive), { target: { value: 'suspended' } })
    fireEvent.change(screen.getByPlaceholderText(en.merchantsOps.reasonPlaceholder), { target: { value: 'fraud' } })
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actApply }))
    await waitFor(() => expect(actions.setMerchantStatus).toHaveBeenCalledWith('en', 'm1', 'suspended', 'fraud'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
  it('adds a note from the Moderation tab', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.tabModeration }))
    fireEvent.change(screen.getByPlaceholderText(en.merchantsOps.notePlaceholder), { target: { value: 'called them' } })
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.saveNote }))
    await waitFor(() => expect(actions.addMerchantNote).toHaveBeenCalledWith('en', 'm1', 'called them'))
  })
  it('surfaces an action failure instead of refreshing', async () => {
    const actions = makeActions()
    actions.setMerchantTier.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required.'] } })
    renderView(actions)
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actSetTier }))
    fireEvent.change(screen.getByPlaceholderText(en.merchantsOps.reasonPlaceholder), { target: { value: 'upgrade' } })
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actApply }))
    expect(await screen.findByText('Active ops access is required.')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.MerchantDetailView.test.tsx --reporter=dot`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `MerchantDetailView.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'
import type { AuditEntry } from '@/lib/admin/audit'
import type { ActionResult } from '@/lib/admin/result'
import type { MerchantStatus, MerchantTier } from '@/lib/admin/merchants-validation'
import { MerchantStatusBadge, MerchantTierBadge } from '@/components/kinnso/admin/merchants/badges'
import { ProfileTab } from '@/components/kinnso/admin/merchants/detail/ProfileTab'
import { MissionsTab } from '@/components/kinnso/admin/merchants/detail/MissionsTab'
import { CreatorsTab } from '@/components/kinnso/admin/merchants/detail/CreatorsTab'
import { BillingTab } from '@/components/kinnso/admin/merchants/detail/BillingTab'
import { ModerationTab } from '@/components/kinnso/admin/merchants/detail/ModerationTab'

type T = Messages['merchantsOps']

export interface MerchantDetailActions {
  setMerchantStatus: (locale: Locale, id: string, status: MerchantStatus, reason: string) => Promise<ActionResult<{ id: string; status: MerchantStatus }>>
  setMerchantTier: (locale: Locale, id: string, tier: MerchantTier, reason: string) => Promise<ActionResult<{ id: string; tier: MerchantTier }>>
  addMerchantNote: (locale: Locale, id: string, note: string) => Promise<ActionResult<{ id: string }>>
}

type TabKey = 'profile' | 'missions' | 'creators' | 'billing' | 'moderation'
type Pending = { kind: 'status'; status: MerchantStatus } | { kind: 'tier'; tier: MerchantTier } | null

const day = (s: string) => s.slice(0, 10)

export function MerchantDetailView({
  t, locale, detail, audit, actions,
}: { t: T; locale: Locale; detail: MerchantDetail; audit: AuditEntry[]; actions: MerchantDetailActions }) {
  const router = useRouter()
  const { profile } = detail
  const [tab, setTab] = useState<TabKey>('profile')
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)

  const firstError = (r: ActionResult<unknown>): string =>
    (!r.ok && Object.values(r.errors)[0]?.[0]) || t.actionFailed

  function start(p: NonNullable<Pending>) { setPending(p); setReason(''); setError(null) }
  function cancel() { setPending(null); setReason(''); setError(null) }

  async function apply() {
    if (!pending) return
    setBusy(true); setError(null)
    let res: ActionResult<unknown>
    if (pending.kind === 'status') res = await actions.setMerchantStatus(locale, profile.id, pending.status, reason)
    else res = await actions.setMerchantTier(locale, profile.id, pending.tier, reason)
    setBusy(false)
    if (res.ok) { cancel(); router.refresh() }
    else setError(firstError(res))
  }

  async function saveNote() {
    setNoteError(null)
    const res = await actions.addMerchantNote(locale, profile.id, note)
    if (res.ok) { setNote(''); router.refresh() }
    else setNoteError(firstError(res))
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'profile', label: t.tabProfile },
    { key: 'missions', label: t.tabMissions },
    { key: 'creators', label: t.tabCreators },
    { key: 'billing', label: t.tabBilling },
    { key: 'moderation', label: t.tabModeration },
  ]

  const btn = 'rounded-lg border border-kinnso-line px-3 py-1.5 text-sm font-bold text-kinnso-ink hover:bg-kinnso-cream2 disabled:opacity-50'

  return (
    <main>
      <Link href={`/${locale}/admin/merchants/directory`} className="text-sm font-bold text-kinnso-muted hover:text-kinnso-ink">
        ← {t.detailBack}
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="k-display">{profile.companyName}</h1>
        <MerchantStatusBadge status={profile.status} t={t} />
        <MerchantTierBadge tier={profile.tier} t={t} />
        <span className="text-sm text-kinnso-muted">{t.detailJoined} {day(profile.createdAt)}</span>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => start({ kind: 'status', status: profile.status as MerchantStatus })}>{t.actSetStatus}</button>
        <button type="button" className={btn} onClick={() => start({ kind: 'tier', tier: profile.tier as MerchantTier })}>{t.actSetTier}</button>
      </div>

      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-kinnso-line bg-kinnso-cream2 p-3">
          {pending.kind === 'status' ? (
            <>
              {pending.status === 'archived' ? <p className="w-full text-sm text-red-600">{t.confirmArchive}</p> : null}
              <select value={pending.status} onChange={(e) => setPending({ kind: 'status', status: e.target.value as MerchantStatus })}
                className="rounded-lg border border-kinnso-line px-3 py-1.5 text-sm font-bold text-kinnso-ink">
                <option value="active">{t.statusActive}</option>
                <option value="paused">{t.statusPaused}</option>
                <option value="suspended">{t.statusSuspended}</option>
                <option value="archived">{t.statusArchived}</option>
              </select>
            </>
          ) : (
            <select value={pending.tier} onChange={(e) => setPending({ kind: 'tier', tier: e.target.value as MerchantTier })}
              className="rounded-lg border border-kinnso-line px-3 py-1.5 text-sm font-bold text-kinnso-ink">
              <option value="free">{t.tierFree}</option>
              <option value="growth">{t.tierGrowth}</option>
            </select>
          )}
          <input className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-line px-3 py-1.5 text-sm"
            placeholder={t.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className={btn} disabled={busy || reason.trim() === ''} onClick={apply}>{t.actApply}</button>
          <button type="button" className={btn} disabled={busy} onClick={cancel}>{t.actCancel}</button>
          {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
        </div>
      )}

      <nav className="mt-6 flex gap-2 border-b border-kinnso-line">
        {tabs.map((x) => (
          <button key={x.key} type="button" aria-current={tab === x.key ? 'page' : undefined}
            onClick={() => setTab(x.key)}
            className={`px-3 py-2 text-sm font-bold ${tab === x.key ? 'border-b-2 border-kinnso-orange text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}
          >{x.label}</button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'profile' && <ProfileTab t={t} profile={detail.profile} />}
        {tab === 'missions' && <MissionsTab t={t} missions={detail.missions} />}
        {tab === 'creators' && <CreatorsTab t={t} creators={detail.creators} />}
        {tab === 'billing' && <BillingTab t={t} billing={detail.billing} />}
        {tab === 'moderation' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <input className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-line px-3 py-1.5 text-sm"
                placeholder={t.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" className={btn} disabled={note.trim() === ''} onClick={saveNote}>{t.saveNote}</button>
              {noteError ? <p className="w-full text-sm text-red-700">{noteError}</p> : null}
            </div>
            <ModerationTab t={t} entries={audit} />
          </div>
        )}
      </div>
    </main>
  )
}

export default MerchantDetailView
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.MerchantDetailView.test.tsx --reporter=dot`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + lint + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
Run from `apps/web`: `pnpm exec eslint components/kinnso/admin/merchants/MerchantDetailView.tsx components/kinnso/admin/merchants/detail` — expected: 0 errors (convert any ternary-statement lint warnings to if/else as the 11B code does).
```bash
git add apps/web/components/kinnso/admin/merchants/MerchantDetailView.tsx apps/web/tests/kinnso.MerchantDetailView.test.tsx
git commit -m "feat(web): add MerchantDetailView 360 client view (Phase 11C)"
```

---

## Task 7: The `[merchantId]` route

**Files:**
- Create: `apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx`
- Test: `apps/web/tests/admin.merchants-detail.host.test.tsx`

The page gates inline, fetches detail + audit, and renders `notFound()` when the merchant is missing. It does **not** use `generateStaticParams` (merchant ids are dynamic). Server actions are imported and passed to the client view (same wiring as `directory/page.tsx:35-38`). Mirror the gate ordering of `directory/page.tsx`: `await params` → `isLocale` → server client → `await requireOpsPage` BEFORE any fetch → `getDictionary` → query → render.

This repo's merchant host tests mock `resolveViewerRole` + `auth.getUser` (NOT `requireOpsPage` directly) — see `admin.merchants-directory.host.test.tsx:21-23`. Match that convention so the real `requireOpsPage` runs against the mocked role/auth.

- [ ] **Step 1: Write the failing host test**

Create `apps/web/tests/admin.merchants-detail.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, detailMock, auditMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  detailMock: vi.fn(async () => ({
    profile: { id: 'm1', companyName: 'Acme Co', contactName: null, contactEmail: null, websiteUrl: null, status: 'active', tier: 'free', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
    missions: [], creators: { engaged: [], savedCount: 0 }, billing: { settlements: [], owed: [], settled: [] },
  })),
  auditMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/merchants-queries', () => ({ getMerchantDetail: detailMock }))
vi.mock('@/lib/admin/audit', () => ({ listAudit: auditMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/lib/admin/merchants-actions', () => ({ setMerchantStatus: vi.fn(), setMerchantTier: vi.fn(), addMerchantNote: vi.fn() }))

import MerchantDetailPage from '@/app/[locale]/admin/merchants/[merchantId]/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
  detailMock.mockClear(); auditMock.mockClear()
})

const params = (merchantId = 'm1', locale = 'en') => Promise.resolve({ locale, merchantId })

describe('Merchant 360 page gate', () => {
  it('renders the view for ops when the merchant exists', async () => {
    const ui = await MerchantDetailPage({ params: params() })
    render(ui)
    expect(screen.getByRole('heading', { name: 'Acme Co' })).toBeTruthy()
  })
  it('notFounds when the merchant is missing', async () => {
    detailMock.mockResolvedValueOnce(null)
    await expect(MerchantDetailPage({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MerchantDetailPage({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MerchantDetailPage({ params: params() })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an invalid locale', async () => {
    await expect(MerchantDetailPage({ params: params('m1', 'xx') })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/admin.merchants-detail.host.test.tsx --reporter=dot`
Expected: FAIL (page module not found).

- [ ] **Step 3: Implement the page**

Create `apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMerchantDetail } from '@/lib/admin/merchants-queries'
import { listAudit } from '@/lib/admin/audit'
import { MerchantDetailView } from '@/components/kinnso/admin/merchants/MerchantDetailView'
import { setMerchantStatus, setMerchantTier, addMerchantNote } from '@/lib/admin/merchants-actions'

export default async function MerchantDetailPage({
  params,
}: { params: Promise<{ locale: string; merchantId: string }> }) {
  const { locale, merchantId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const detail = await getMerchantDetail(supabase, merchantId)
  if (!detail) notFound()
  const audit = await listAudit(supabase, 'merchant', merchantId)
  return (
    <MerchantDetailView
      t={messages.merchantsOps}
      locale={loc}
      detail={detail}
      audit={audit}
      actions={{ setMerchantStatus, setMerchantTier, addMerchantNote }}
    />
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/admin.merchants-detail.host.test.tsx --reporter=dot`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
```bash
git add "apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx" apps/web/tests/admin.merchants-detail.host.test.tsx
git commit -m "feat(web): add merchant 360 detail route (Phase 11C)"
```

---

## Task 8: Link Directory rows → 360 page

**Files:**
- Modify: `apps/web/components/kinnso/admin/merchants/MerchantsDirectoryView.tsx`
- Modify: `apps/web/tests/kinnso.MerchantsDirectoryView.test.tsx`

The Directory currently renders the company name as plain text (`MerchantsDirectoryView.tsx:166`). Make it a `Link` to `/${locale}/admin/merchants/${id}` so ops can open the 360 (spec §5: row → 360). The component already receives `locale`.

- [ ] **Step 1: Add a failing assertion to the directory view test**

In `apps/web/tests/kinnso.MerchantsDirectoryView.test.tsx`, add this test inside the existing `describe('MerchantsDirectoryView', …)` (use the existing render helper / a row whose `id` is `'m1'` and `companyName` is `'Acme Co'` — match the existing fixture's id/name; adjust the expected href/name to the fixture actually used):

```tsx
  it('links each company name to its 360 detail page', () => {
    renderView() // existing helper; fixture row id 'm1', name 'Acme Co'
    const link = screen.getByRole('link', { name: 'Acme Co' })
    expect(link.getAttribute('href')).toBe('/en/admin/merchants/m1')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.MerchantsDirectoryView.test.tsx --reporter=dot`
Expected: FAIL ("Acme Co" is text, not a link).

- [ ] **Step 3: Make the company name a Link**

In `MerchantsDirectoryView.tsx`: add `import Link from 'next/link'` at the top. Replace the plain name cell (line 166):
```tsx
                    <p className="font-bold text-kinnso-ink">{row.companyName}</p>
```
with:
```tsx
                    <p className="font-bold">
                      <Link href={`/${locale}/admin/merchants/${row.id}`} className="text-kinnso-ink hover:text-kinnso-orange hover:underline">
                        {row.companyName}
                      </Link>
                    </p>
```

Keep all surrounding badges/buttons unchanged.

- [ ] **Step 4: Run the directory test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.MerchantsDirectoryView.test.tsx --reporter=dot`
Expected: PASS (all prior tests + the new link test).

- [ ] **Step 5: Typecheck + lint + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
Run from `apps/web`: `pnpm exec eslint components/kinnso/admin/merchants/MerchantsDirectoryView.tsx` — expected: no new errors.
```bash
git add apps/web/components/kinnso/admin/merchants/MerchantsDirectoryView.tsx apps/web/tests/kinnso.MerchantsDirectoryView.test.tsx
git commit -m "feat(web): link merchant directory rows to 360 (Phase 11C)"
```

---

## Task 9: De-control `/admin/users` (retire the merchant write path)

**Files:**
- Modify: `apps/web/lib/admin/users-actions.ts`
- Modify: `apps/web/components/kinnso/admin/AdminUsersView.tsx`
- Modify: `apps/web/app/[locale]/admin/users/page.tsx`
- Modify: `apps/web/tests/admin.users-actions.test.ts`
- Modify: `apps/web/tests/kinnso.AdminUsersView.test.tsx`

After this task: the merchant section in `/admin/users` becomes link-only (no tier `<select>`, no status toggle), `setMerchantTierAction` is gone, and `setUserStatusAction` no longer accepts `kind='merchant'`. Creator/ops rows are UNTOUCHED. **Nothing in the app calls the 2-arg `admin_set_merchant_tier` after this.**

- [ ] **Step 1: Update the action tests first (red)**

In `apps/web/tests/admin.users-actions.test.ts`:
1. Remove the entire `describe('setMerchantTierAction', …)` block (lines ~68 to its closing `})`).
2. Remove `setMerchantTierAction` from the import on line 12 → `import { setUserStatusAction } from '@/lib/admin/users-actions'`.
3. Add a guard test asserting `kind='merchant'` is now rejected. Inside `describe('setUserStatusAction', …)` add:

```ts
  it('rejects kind=merchant now that merchants are managed in the merchants console', async () => {
    const r = await setUserStatusAction('en', 'merchant' as never, 'm1', 'suspended')
    expect(r.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
```

In `apps/web/tests/kinnso.AdminUsersView.test.tsx`:
1. Remove `onSetMerchantTier={okTier}` from every `render(...)` call and drop the `okTier` const (line 19). The `AdminUsersView` prop is removed in Step 3.
2. Replace the `it('changing a merchant tier control calls onSetMerchantTier', …)` test (lines 41-50) with:

```tsx
  it('renders the merchant row as a link to its 360 and exposes no inline merchant mutation', () => {
    render(<AdminUsersView t={en.users} locale="en" users={users} onSetStatus={ok} />)
    const link = screen.getByRole('link', { name: 'Klook' })
    expect(link.getAttribute('href')).toBe('/en/admin/merchants/m1')
    // no tier select for the merchant row
    expect(screen.queryByLabelText(`${en.users.tierLabel} Klook`)).toBeNull()
    // no Suspend/Activate control inside the merchant row link
    expect(link.closest('button')).toBeNull()
  })
```

3. Keep the creator + ops tests as-is (they still pass `onSetStatus={ok}`).

Run from `apps/web`: `pnpm exec vitest run tests/admin.users-actions.test.ts tests/kinnso.AdminUsersView.test.tsx --reporter=dot`
Expected: FAIL (the import / removed export / changed component shape).

- [ ] **Step 2: Edit `users-actions.ts` — drop the merchant write path**

In `apps/web/lib/admin/users-actions.ts`:
1. Delete the `setMerchantTierAction` function entirely (lines 44-62).
2. Delete the unused `export type MerchantTier = 'free' | 'growth'` (line 9).
3. Remove `bad_tier: 'Invalid tier.',` from the `FRIENDLY` map (line 18).
4. In `setUserStatusAction`, narrow the kind guard so `merchant` is no longer accepted. Change `export type UserKind = 'creator' | 'merchant' | 'ops'` (line 7) to `export type UserKind = 'creator' | 'ops'`, and change the guard on line 32:
```ts
  if (kind !== 'creator' && kind !== 'merchant' && kind !== 'ops') return formError(FRIENDLY.bad_kind)
```
to:
```ts
  if (kind !== 'creator' && kind !== 'ops') return formError(FRIENDLY.bad_kind)
```

The file no longer references `admin_set_merchant_tier`. (Verify in Step 5.)

- [ ] **Step 3: Edit `AdminUsersView.tsx` — merchant row is link-only**

In `apps/web/components/kinnso/admin/AdminUsersView.tsx`:
1. Add `import Link from 'next/link'` at the top.
2. Remove the `MerchantTier` import and the `SetMerchantTier` type (lines 8, 13), and remove the `onSetMerchantTier` prop + the `changeTier` function (lines 50-62) and the tier `<select>` block (lines 86-97).
3. Update `UserKind` import usage — it is now `'creator' | 'ops'`; the merchant section must NOT use `UserSection` with mutation. Replace the merchant `UserSection` (lines 127-129) with a read-only linked list. Concretely, change the `AdminUsersView` signature to drop `onSetMerchantTier`:
```ts
export function AdminUsersView({ t, locale, users, onSetStatus }: {
  t: T; locale: Locale; users: AdminUsers; onSetStatus: SetStatus
}) {
```
and replace the merchant `<UserSection .../>` with a dedicated read-only section:
```tsx
      <section className="mt-8">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.sectionMerchants}</h2>
        {users.merchants.length === 0 ? (
          <p className="mt-3 text-kinnso-muted">{t.empty}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {users.merchants.map((m) => (
              <TicketCard key={m.id} className="flex items-center justify-between p-4">
                <div>
                  <Link href={`/${locale}/admin/merchants/${m.id}`} className="font-bold text-kinnso-ink hover:text-kinnso-orange hover:underline">
                    {m.company_name}
                  </Link>
                  <p className="text-sm text-kinnso-muted">
                    {statusLabel(t, m.status)}{' · '}{t.joined} {new Date(m.created_at).toLocaleDateString(locale)}
                  </p>
                </div>
                <Link href={`/${locale}/admin/merchants/${m.id}`} className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink">
                  {t.manageInConsole}
                </Link>
              </TicketCard>
            ))}
          </div>
        )}
      </section>
```
4. The `UserSection` helper keeps its `onSetMerchantTier`/`changeTier`/tier `<select>` removed — those props are gone from the merchant path. Creator + ops sections still call `<UserSection ... kind="creator" onSetStatus={onSetStatus} />` and `kind="ops"`. Update the `SetStatus` type's kind param to `UserKind` (now `'creator' | 'ops'`), unchanged signature otherwise.

(Add a `manageInConsole` i18n key to the `users` group in all 7 locales in Step 4. Its English value: `'Manage in console'`. Translations: zh-hk/zh-tw `'前往控制台管理'`, zh-cn `'前往控制台管理'`, ja `'コンソールで管理'`, ko `'콘솔에서 관리'`, th `'จัดการในคอนโซล'`. Extend the `users` interface in `en.ts` with `manageInConsole: string`.)

- [ ] **Step 4: Add the `manageInConsole` i18n key (all 7 locales)**

In `apps/web/lib/i18n/messages/en.ts`, in the `users` interface block (after `tierLabel: string; tierFree: string; tierGrowth: string` near line 715) add `manageInConsole: string`. In the `users` values block of all 7 locale files, add `manageInConsole:` with the translations from Step 3. (Leave the now-unused `tierLabel`/`tierFree`/`tierGrowth` keys in place — removing them is optional cleanup and risks parity churn; keeping them is harmless. If you remove them, remove from ALL 7 + the interface.)

- [ ] **Step 5: Edit `users/page.tsx` — drop the tier wiring**

In `apps/web/app/[locale]/admin/users/page.tsx`:
1. Change the import on line 7 to drop `setMerchantTierAction` and `MerchantTier`:
```ts
import { setUserStatusAction, type UserKind, type UserStatus } from '@/lib/admin/users-actions'
```
2. Delete the `onSetMerchantTier` server function (lines 29-32).
3. Remove `onSetMerchantTier={onSetMerchantTier}` from the `<AdminUsersView .../>` render (line 34).

- [ ] **Step 6: Run the de-control tests to verify they pass**

Run from `apps/web`:
```bash
pnpm exec vitest run tests/admin.users-actions.test.ts tests/kinnso.AdminUsersView.test.tsx tests/admin.users.host.test.tsx tests/i18n.locale-parity.test.ts --reporter=dot
```
Expected: all green. (If `admin.users.host.test.tsx` asserts `onSetMerchantTier`, update it to drop that prop.)

- [ ] **Step 7: Prove nothing calls the legacy 2-arg tier RPC**

Run from repo root:
```bash
grep -rn "admin_set_merchant_tier" apps/web/lib apps/web/app apps/web/components
```
Expected output: ONLY the 3-arg call inside `apps/web/lib/admin/merchants-actions.ts:52` (`{ p_id, p_tier, p_reason }`). There must be NO occurrence in `users-actions.ts`. This is the safety gate for Task 10.

- [ ] **Step 8: Typecheck + lint + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
Run from `apps/web`: `pnpm exec eslint lib/admin/users-actions.ts components/kinnso/admin/AdminUsersView.tsx app/\[locale\]/admin/users/page.tsx` — expected: 0 errors.
```bash
git add apps/web/lib/admin/users-actions.ts apps/web/components/kinnso/admin/AdminUsersView.tsx "apps/web/app/[locale]/admin/users/page.tsx" apps/web/lib/i18n/messages apps/web/tests/admin.users-actions.test.ts apps/web/tests/kinnso.AdminUsersView.test.tsx
git commit -m "refactor(web): de-control /admin/users merchant path, link to 360 (Phase 11C)"
```

---

## Task 10: Drop the legacy `admin_set_merchant_tier(uuid, text)` overload

**Files:**
- Modify: `supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql` (append the DROP)
- Modify: `packages/db/types.ts` (tighten the tier `p_reason` to required)

**Precondition:** Task 10 Step 7 grep proved no live caller of the 2-arg overload. Do NOT proceed otherwise.

- [ ] **Step 1: Append the DROP to the migration file**

At the end of `supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql`, replace the trailing NOTE comment with:

```sql
-- Phase 11C — drop the legacy Phase 7 2-arg tier setter. The audited 3-arg
-- admin_set_merchant_tier(uuid, text, text) (from 20260630130000) is the only tier write path now;
-- the /admin/users de-control removed the last caller of the 2-arg overload. Both overloads
-- coexisted between 11B and this point — dropping the 2-arg version makes the audited one canonical.
drop function if exists public.admin_set_merchant_tier(uuid, text);
```

(Use `drop function if exists … (uuid, text)` — the exact arg-type signature disambiguates the overload from the surviving `(uuid, text, text)`.)

- [ ] **Step 2: Re-apply the migration live via MCP**

Re-apply with Supabase MCP `apply_migration` (project `scryfkefedzuetfdtrvl`, name `admin_merchant_detail_and_drop_legacy_tier`). The `create or replace function admin_merchant_detail` re-runs harmlessly; the new `drop function if exists` removes the 2-arg overload. The controller performs this (subagents have no MCP migration authority).

- [ ] **Step 3: Verify only the 3-arg overload remains**

Run via MCP `execute_sql` against `scryfkefedzuetfdtrvl`:
```sql
select oid::regprocedure as signature
from pg_proc where proname = 'admin_set_merchant_tier' order by 1;
```
Expected: exactly ONE row → `admin_set_merchant_tier(uuid, text, text)`. The `(uuid, text)` overload must be gone.

- [ ] **Step 4: Tighten `packages/db/types.ts`**

In `packages/db/types.ts`, the `admin_set_merchant_tier` entry (line 1739-1742) currently reads:
```ts
      admin_set_merchant_tier: {
        Args: { p_id: string; p_tier: string; p_reason?: string }
        Returns: undefined
      }
```
The optional `p_reason?` was only there to cover both overloads. Now that the 2-arg overload is dropped, make `p_reason` required:
```ts
      admin_set_merchant_tier: {
        Args: { p_id: string; p_tier: string; p_reason: string }
        Returns: undefined
      }
```

- [ ] **Step 5: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit`
Expected: no errors. (The only caller, `merchants-actions.ts:52`, already passes `p_reason: reason.trim()`, so the now-required arg is satisfied.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql packages/db/types.ts
git commit -m "feat(db): drop legacy admin_set_merchant_tier(uuid,text) overload (Phase 11C)"
```

---

## Final verification (after all tasks)

- [ ] **Prove the legacy RPC is fully retired (code + DB):**
  - Code: from repo root `grep -rn "admin_set_merchant_tier" apps/web` → only `merchants-actions.ts` (3-arg). `grep -rn "setMerchantTierAction" apps/web` → no results.
  - DB: the `pg_proc` query in Task 11 Step 3 shows only `(uuid, text, text)`.
- [ ] **Typecheck the whole web app:** from `apps/web`, `pnpm exec tsc --noEmit` — no errors.
- [ ] **Lint the new/changed files:** from `apps/web`, `pnpm exec eslint components/kinnso/admin/merchants lib/admin "app/[locale]/admin/merchants" "app/[locale]/admin/users" components/kinnso/admin/AdminUsersView.tsx` — 0 errors.
- [ ] **Run all 11C + touched suites (one command, explicit files):**
  ```bash
  pnpm exec vitest run \
    tests/admin.merchants-detail-queries.test.ts \
    tests/kinnso.MerchantDetailTabs.test.tsx \
    tests/kinnso.MerchantDetailView.test.tsx \
    tests/admin.merchants-detail.host.test.tsx \
    tests/kinnso.MerchantsDirectoryView.test.tsx \
    tests/admin.merchants-actions.test.ts \
    tests/admin.users-actions.test.ts \
    tests/kinnso.AdminUsersView.test.tsx \
    tests/admin.users.host.test.tsx \
    tests/i18n.locale-parity.test.ts \
    --reporter=dot
  ```
  Expected: all green.
- [ ] **Multi-lens adversarial review (spec §12)** before the PR — three lenses:
  - **Security/gate:** RPC raises `forbidden` unless `is_active_ops()`; `search_path=public`; anon/public revoked, authenticated granted; route awaits `requireOpsPage` BEFORE any fetch; the DROP did not orphan a live caller.
  - **Data-mapping:** snake→camel mapping is complete and lossless; `creator_payout_amount` payload key ↔ `creator_commission_amount` DB column is correct; per-currency owed/settled arrays are never summed/collapsed; `null` detail → `notFound()`; errors propagate (no `?? []`/`?? 0` swallow in the wrapper).
  - **i18n parity:** every new `merchantsOps` + `users` key exists in all 7 locales; `tests/i18n.locale-parity.test.ts` green; the `merchantsOps`/`users` groups are in the parity `GROUPS` array.
  Fix findings, then push and open the single "Phase 11C — Merchant 360 + /admin/users de-control + drop legacy tier RPC" PR (squash-merge to `main`).
- [ ] **Update the `operator-console-program` memory** noting 11C is merged.

---

## Self-Review notes (spec coverage)

- §6 `admin_merchant_detail` 360 payload (profile incl. contact_*, missions[], creators{engaged[],saved_count}, billing{settlements[],owed[],settled[]}) — RPC Task 1, wrapper Task 4, tabs Task 5. ✓
- "contact_email/contact_name ops-only, never public" — exposed ONLY in the `is_active_ops()`-gated RPC; the 11B directory RPC returns no PII; ProfileTab renders it behind the ops route. ✓ (mirror creators "no PII" posture — 10C plan line 1400; merchants additionally carry email, gated.)
- "billing READ-ONLY" — BillingTab has no buttons/selects; the test asserts `querySelector('button')`/`('select')` are null; settlement writes stay in the Creators Payouts tab (spec §2). ✓
- "Returns NULL when missing → caller notFound()" — RPC returns null (Task 1), wrapper returns null (Task 4), page `notFound()` (Task 7). ✓
- "Audit timeline fetched in TS via listAudit" — page fetches `listAudit(supabase,'merchant',id)` (Task 7); ModerationTab is presentational; add-note wired to `addMerchantNote` (Task 6). ✓
- §5 de-control: remove inline merchant tier/status, retire `setMerchantTierAction` + `kind='merchant'` branch, merchant row → link; creator/ops untouched — Task 10. ✓
- §4 "DROP the Phase 7 (uuid,text) overload" + §9 "remove the optional p_reason accommodation" — Task 11, ordered AFTER de-control (CRITICAL ORDERING section). ✓
- "Directory rows now LINK to /admin/merchants/[merchantId]" — Task 9. ✓
- §8 i18n: merchantsOps detail strings + users `manageInConsole` ×7, parity green — Tasks 3, 10. ✓
- §11 tests: detail query (null/camel/per-currency/error), [merchantId] host (ops/non-ops/anon), MerchantDetailView component, de-control tests — Tasks 4,5,6,7,10. ✓
- Per-currency honesty (§4.2) — owed/settled arrays preserved end-to-end; Task 4 test asserts two currencies survive (mirror 11A `merchants-queries.ts:105-106`). ✓

## Open questions / risks flagged

1. **`creator_payout_amount` has no matching DB column.** The spec §6 billing field is `creator_payout_amount`, but `mission_settlements` has `creator_commission_amount` (the creator's leg) — there is no column literally named `creator_payout_amount`. The plan maps the payload key `creator_payout_amount` → DB `creator_commission_amount` (the same column 10C surfaces as the creator's payout). If "merchant payout amount" was intended (the merchant-side cost), the column would instead be `paid_fee_amount`. **Confirm with the spec owner which leg the 360 should show.** The plan documents the chosen mapping explicitly so it's easy to flip.
2. **"Settled" definition.** Owed/settled are split on `creator_payout_status = 'paid'` (mirrors the payout leg). If the merchants overview RPC (11A) defines owed/settled differently (e.g., on `mission_settlements.status`), align the detail RPC to match it for consistency — verify against `admin_merchant_analytics`'s owed/settled SQL before applying.
3. **`users.tierLabel`/`tierFree`/`tierGrowth` become dead** after de-control. The plan leaves them to avoid parity churn; flag for a follow-up cleanup if the reviewer prefers them removed (must be removed from all 7 + the interface together).
4. **`admin.users.host.test.tsx` may reference `onSetMerchantTier`.** Task 10 Step 6 calls this out, but the exact edit depends on that file's current assertions (not fully read here) — the executing engineer must read it and drop any merchant-tier wiring/assertions.
5. **Single-PR scope.** Unlike the per-slice 11A/11B PRs, 11C bundles three concerns (360 + de-control + DROP) in one PR by user instruction. The DROP is irreversible against the live DB; the Task 10→11 ordering and the Task 10 Step 7 / Task 11 Step 3 grep+catalog gates are the safety mechanism. Do not reorder.
