# Phase 11 — Merchants Operator Console (Design)

**Date:** 2026-06-30
**Status:** Approved (design); pending implementation plan
**Program:** KINNSO Operator Console — vertical slices, one domain at a time. Phase 10 (Creators) is complete and merged. **Merchants is the second domain.**
**Branch:** `feat/merchants-console` (cut fresh from post-merge `main` @ `bc0bd3f`)

---

## 1. Goal

Give operators a dedicated, audited surface to **understand, moderate, and analyze merchants** — mirroring the Phase 10 Creators Operator Console exactly. Today merchants can only be touched from the generic `/admin/users` table via two **unaudited, reason-less** RPCs (`admin_set_merchant_tier`, `admin_set_user_status`). Phase 11 replaces that with a first-class console where every mutation is `is_active_ops()`-gated, reason-required, and written to the shared `ops_audit_log`.

Non-goals (deferred): a merchant public "verified" trust badge; a separate merchant billing/settlement **write** surface (settlement writes stay in the Creators Payouts tab — one shared queue, one write path); RBAC (binary ops access only — that is the later Team & Roles domain).

## 2. Decisions (locked with the user)

1. **Scope = 3 slices:** Overview + Directory + Merchant 360 detail. Billing/settlement data appears **read-only** inside the 360; the only place settlement *status* is written remains the existing Creators Payouts tab (shared `admin_set_settlement_status`).
2. **No new trust flag:** merchant trust stays the existing `tier` (`free`/`growth`), now mutated through an audited, reason-required action. No `verified` column is added.
3. **Unify on the audited path:** the new audited RPCs become the single merchant write path. `/admin/users` **drops its inline merchant status/tier controls** and links the merchant row to `/admin/merchants/[merchantId]`. Creator/ops rows in `/admin/users` are untouched.

## 3. Existing foundation reused (no new build)

- **Schema:** `merchant_profiles` (`id, user_id, company_name, contact_name, contact_email`(PII)`, website_url, status ∈ {active,paused,suspended,archived}, tier ∈ {free,growth}, created_at, updated_at`); `missions(merchant_profile_id)`, `mission_participants`, `mission_milestones` / `mission_milestone_submissions`, `mission_settlements`, `merchant_saved_creators`.
- **Ops infra:** `is_active_ops()`, `ops_audit_log`, `ops_audit_log_append(p_entity_type, p_entity_id, p_action, p_reason, p_metadata)`.
- **App scaffolding:** `requireOpsPage` / `requireOpsAction` (`lib/admin/guard.ts`), `ActionResult<T>` + `formError` (`lib/admin/result.ts`), `listAudit` / `listRecentAudit` (`lib/admin/audit.ts`), `AdminShell` nav (`components/kinnso/admin/AdminShell.tsx`).
- **Pattern source of truth:** the Creators console under `lib/admin/creators-*`, `components/kinnso/admin/creators/*`, `app/[locale]/admin/creators/*`, and spec `docs/superpowers/specs/2026-06-28-phase10-creators-operator-console-design.md`.

## 4. New backend (SQL — applied live to Supabase project `scryfkefedzuetfdtrvl` via MCP `apply_migration`)

All functions: `SECURITY DEFINER`, first statement raises `forbidden` (SQLSTATE `42501`) unless `is_active_ops()`; grants revoke `public`/`anon`, grant `authenticated`. Reason-required writes raise `reason_required` (blank) / `reason_too_long` (>500). Writes `select … for update`, no-op → `no_change`, missing row → `not_found`, and call `ops_audit_log_append('merchant', id, <action>, p_reason, jsonb {from,to,…})`.

| Slice | RPC | Signature | Notes |
|---|---|---|---|
| 11A | `admin_merchant_analytics` | `(p_days int default 30) returns jsonb` | KPIs + 2 trends + leaderboard + at-risk. Read-only (no audit). |
| 11B | `admin_search_merchants` | `(p_search text, p_statuses text[], p_tiers text[], p_created_after timestamptz, p_limit int, p_cursor_created_at timestamptz, p_cursor_id uuid) returns setof …` | Keyset paginated on `(created_at, id)`. Read-only. |
| 11B | `admin_set_merchant_status` | `(p_id uuid, p_status text, p_reason text) returns void` | status ∈ {active,paused,suspended,archived}; raises `bad_status`. action `status.set`. |
| 11B | `admin_set_merchant_tier` | `(p_id uuid, p_tier text, p_reason text) returns void` | **v2** — `DROP` the Phase 7 `(uuid,text)` overload first. tier ∈ {free,growth}; raises `bad_tier`. action `tier.set`. |
| 11B | `admin_add_merchant_note` | `(p_id uuid, p_note text) returns void` | note validated like a reason. action `note.add`. |
| 11B | `admin_bulk_set_merchant_status` | `(p_ids uuid[], p_status text, p_reason text) returns int` | 1–100 ids → `bad_bulk`; returns affected count; one audit row per id. |
| 11C | `admin_merchant_detail` | `(p_merchant_id uuid) returns jsonb` | One 360 payload (see §6). Returns `null` when missing → `notFound()`. Read-only. |

### 4.1 `admin_merchant_analytics` payload
```
kpis: { total, active, paused, suspended, archived, free, growth, new_in_period,
        missions_live, settlements_pending_count,
        owed: [{currency, amount}], settled: [{currency, amount}] }
signups:        [{ day, count }]                 // merchant_profiles.created_at, p_days window
missions_created:[{ day, count }]                // missions.created_at, p_days window
leaderboard:    [{ id, company_name, tier, missions_count, creators_engaged }]  // top N by missions_count
at_risk:        [{ id, company_name, reason }]   // reasons below
```
**At-risk heuristics (defined once in SQL, tunable):** (a) `tier='growth'` with 0 live missions ("paying-but-idle"); (b) any settlement in `disputed`; (c) a settlement `pending` older than 30 days. Each row carries a machine `reason` key the UI localizes.

### 4.2 Money honesty
Owed/settled are **per-currency arrays**, never summed across currencies (same posture as Creators Payouts). Amounts come from `mission_settlements` joined to the merchant's missions. Queries surface DB errors; they never collapse to `0`/`[]`.

## 5. App data layer (`apps/web/lib/admin/`)

- **`merchants-validation.ts`** — `MERCHANT_STATUSES`/`MerchantStatus`/`isMerchantStatus`, `MERCHANT_TIERS`/`MerchantTier`/`isMerchantTier`, `normalizeMerchantDirectoryParams(raw)`. Reuses the **shared** `validateReason` / `validateBulkIds`.
- **`merchants-queries.ts`** — `getMerchantsOverview(supabase, days=30)` (calls `admin_merchant_analytics` + appends `listRecentAudit('merchant')`), `listMerchantsDirectory(supabase, params)` (calls `admin_search_merchants`, returns `{rows, nextCursor}`), `getMerchantDetail(supabase, merchantId)` (calls `admin_merchant_detail`, `null` → caller `notFound()`s). All take `SupabaseClient<Database>`, map snake→camel, propagate errors.
- **`merchants-actions.ts`** (`'use server'`) — `setMerchantStatus(locale,id,status,reason)`, `setMerchantTier(locale,id,tier,reason)`, `addMerchantNote(locale,id,note)`, `bulkSetMerchantStatus(locale,ids,status,reason)`. Each: `requireOpsAction` gate → validate → `supabase.rpc(...)` → on error `formError(mapError(...))` → `revalidatePath(dirPath(locale))` → `{ ok:true, … }`. FRIENDLY map extends the shared keys with `bad_tier`.
- **Shared extraction (minor, serves both consoles):** move `validateReason` + `validateBulkIds` from `creators-validation.ts` into `lib/admin/ops-validation.ts` and re-import in `creators-validation.ts` (no behavior change; keeps Merchants from depending on the Creators namespace).
- **`users-actions.ts` / `/admin/users`** — remove the merchant branch's inline mutation; the merchant row becomes a link to the 360. (`setMerchantTierAction` and the `kind='merchant'` path of `setUserStatusAction` are retired for merchants.)

## 6. `admin_merchant_detail` payload (360)
```
profile:   { id, company_name, contact_name, contact_email, website_url, status, tier, created_at, updated_at }  // contact_email ops-only, never public
missions:  [{ id, title, status, visibility, participants_count, milestones_total, milestones_approved, created_at }]
creators:  { engaged: [{ creator_id, display_name, handle, participant_status }], saved_count }
billing:   { settlements: [{ id, mission_title, status, creator_payout_status, kinnso_commission_status, affiliate_commission_status, currency, creator_payout_amount, updated_at }],
             owed: [{currency, amount}], settled: [{currency, amount}] }   // READ-ONLY
// audit timeline fetched separately in TS via listAudit('merchant', id)
```

## 7. Routes & components

- **Routes** (`app/[locale]/admin/merchants/`): `page.tsx` (Overview), `directory/page.tsx`, `[merchantId]/page.tsx` (360). Canonical gate: `await params` → `isLocale` guard → `createSupabaseServerClient` → **`await requireOpsPage` before any fetch** → `getDictionary` → query → render the client view with `t={messages.merchants}`.
- **Components** (`components/kinnso/admin/merchants/`): `MerchantsOverviewView`, `MerchantsDirectoryView`, `MerchantDetailView`, `MerchantsTabs` (Overview/Directory), `badges.tsx` (StatusBadge, TierBadge), `MerchantsLeaderboard`, and detail sub-tabs `detail/{ProfileTab, MissionsTab, CreatorsTab, BillingTab, ModerationTab}.tsx`. `BillingTab` is read-only. `ModerationTab` = audit timeline + add-note (wired to `addMerchantNote`).
- **Shared chart primitives:** lift `KpiCard` + `TrendChart` out of `creators/` into `components/kinnso/admin/` and import from both consoles (no behavior change).
- **Nav:** add `{ href: /${locale}/admin/merchants, label: t.navMerchants }` to `AdminShell`.

## 8. i18n

New `merchants` group in all **7** locales (`en, zh-hk, zh-tw, zh-cn, ja, ko, th`) — title/KPIs/trends/leaderboard/at-risk reasons/status & tier labels/directory filters & columns/actions/confirmations/360 sub-tabs & sections/empty states/validation copy. Add `navMerchants` to the `admin` group ×7. Add `'merchants'` to the `GROUPS` array in `tests/i18n.locale-parity.test.ts`.

## 9. DB types

Hand-patch `packages/db/types.ts` `Functions` with all 7 entries (6 new + the re-signed `admin_set_merchant_tier`): analytics/detail `Returns: Json`; search `Returns: unknown`; the three single-row writes (status/tier/note) `Returns: undefined`; bulk `Returns: number`. Also **remove** the retired 2-arg `admin_set_merchant_tier` overload.

## 10. Error handling

DB raises a single machine token (`forbidden`, `bad_status`, `bad_tier`, `bad_bulk`, `reason_required`, `reason_too_long`, `no_change`, `not_found`). Actions map it to localized FRIENDLY copy via substring match, defaulting to a generic fallback; pages `notFound()` on a `null` detail; queries propagate (never swallow). RLS unaffected — all reads go through ops-gated SECURITY DEFINER RPCs.

## 11. Testing

Per slice, Vitest with the hoisted-mock harness (`rpcMock`/`gateMock`/`revalidateMock`; `next/navigation` mock including `usePathname` + `useSearchParams`):
- `merchants-validation.test.ts` — status/tier guards, param normalization.
- `merchants-actions.test.ts` — happy path + RPC arg shape, blank-reason short-circuit (no RPC), each FRIENDLY mapping incl. `bad_tier`, revalidate called.
- `merchants-queries.test.ts` — snake→camel mapping, keyset cursor, `null` detail, error propagation, per-currency honesty.
- `*.host.test.tsx` for the 3 routes — ops renders; non-ops → `notFound`; anon → redirect; directory forwards normalized filters.
- component tests for tabs + a representative view.
- `i18n.locale-parity.test.ts` stays green with `merchants` added.
All of `pnpm --filter web typecheck`, `lint`, `test` green before each PR.

## 12. Delivery

Cut `feat/merchants-console` from post-merge `main`. Ship **per-slice PRs (11A → 11B → 11C)**, each squash-merged to `main` **before** the next slice starts — no stacking, so the squash-ancestry i18n-merge-conflict pathology from Phase 10 cannot recur. Each slice: subagent-driven TDD build → multi-lens adversarial review (security / data-mapping / i18n-parity lenses) → apply migration live → PR → update the `operator-console-program` memory.

## 13. Open items

- **Leaderboard metric** = missions run (+ creators engaged shown alongside); a spend-based leaderboard is deferred because settlement amounts are multi-currency and not meaningfully summable.
- **At-risk thresholds** (30-day pending, growth-with-0-missions) are first-pass; tunable in the one SQL function.
- A merchant public verified/trust badge remains a future product/brand decision (out of scope, as with the creator public badge).
