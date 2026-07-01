# Phase 13 — Missions Operator Console (Design)

**Date:** 2026-07-02
**Status:** Approved (design); pending implementation plans
**Program:** KINNSO Operator Console — vertical slices, one domain at a time. Phase 10 (Creators), Phase 11 (Merchants), and Phase 12 (Team & Roles) are complete and merged. **Missions is the fourth domain.**
**Branch:** `feat/missions-console-13a` (cut fresh from post-merge `main` @ `e6682c3`)

---

## 1. Goal

Give operators a dedicated, read-only surface to **understand any merchant mission across the whole platform** — mirroring the Phase 10 Creators / Phase 11 Merchants consoles exactly. Today a mission is visible only as a summary row inside its owning merchant's 360 page (title/status/participant count); there is no way to search or filter missions across every merchant, and no single-mission drill-down into its milestones, participants, submissions, verification jobs, or social snapshots. Phase 13 closes that gap.

This phase also retires `app/[locale]/ops/settlements/page.tsx`, a pre-console (pre-Phase-10) page that duplicates — with none of the auditing — what `/admin/creators/payouts` (Phase 10D, `admin_set_settlement_status`) already does.

### Non-goals (this phase)

- **No mission status writes.** Mission lifecycle (draft/published/paused/completed/cancelled) stays 100% merchant-controlled via `/merchants/post` and `/merchants/missions/[id]`. This console does not add an ops override RPC — inventing one is new product surface, not a console gap.
- **No settlement writes.** Settlement status changes remain exclusively in the Creators Payouts tab (`admin_set_settlement_status`). Mission 360 shows settlement data read-only, joined by mission, mirroring Merchant 360's `BillingTab`.
- **No travelpayouts/affiliate-offer coverage.** Scope is `mission_source='merchant'` only. Travelpayouts offers are a system-seeded affiliate catalog with no merchant, no milestones, and are already visible to creators via `/studio/offers` — a different product concern entirely.
- **No fine-grained RBAC beyond `is_active_ops()`.** These are read-only, unaudited RPCs (matching `admin_merchant_analytics`'s "read-only, no audit" posture) — Phase 12C's role enforcement applies to audited *write* RPCs, not read paths. `requireOpsPage`/`requireOpsAction` are unchanged (verified against the current `lib/admin/guard.ts`).
- **No changes to the merchant-side mission creation/management flow.** This is an ops-only read surface layered on top of existing data.

### Decomposition → three implementation plans (built in sequence, one PR each, no stacking)

1. **13A — Nav + Overview.** `Missions` added to `AdminShell`; `admin_mission_analytics()`; the **Overview** tab (KPIs, trends, at-risk list).
2. **13B — Directory.** `admin_search_missions()`; the **Directory** list (search/filter/sort/paginate across merchants, row → 360).
3. **13C — Mission 360 + `/ops/settlements` retirement.** `admin_mission_detail()` + the `[missionId]` page with full pipeline-depth sub-tabs; delete the legacy `/ops/settlements` page, its view component, and the now-unused direct `updateSettlementAction` call site (grep for other references first — do not delete if anything else still links to it).

## 2. Shared architecture & conventions

Mirrors Phase 10/11 exactly — no deviation:

- **Routes:** `app/[locale]/admin/missions/{page,directory/page,[missionId]/page}.tsx`. `generateStaticParams` over `LOCALES`; `isLocale` guard → `notFound()`; `await requireOpsPage(supabase, loc)` inline before any data fetch.
- **Data access:** pure query functions taking `SupabaseClient<Database>` in `lib/admin/missions-queries.ts`. All reads go through `is_active_ops()`-gated SECURITY DEFINER RPCs (owner-scoped RLS on `missions`/`mission_participants`/etc. would otherwise hide other merchants' rows from ops). Errors propagate — never swallow to `[]`/`0`.
- **Validation:** `lib/admin/missions-validation.ts` — status/type/visibility guards + `normalizeMissionsDirectoryParams(raw)`, reusing the shared helpers already extracted to `lib/admin/ops-validation.ts` in Phase 11.
- **`ActionResult`/`requireOpsPage`/`requireOpsAction`:** unchanged, reused as-is from `lib/admin/{result,guard}.ts`. This phase has no server actions (read-only), so `missions-actions.ts` is not created.
- **Nav:** add `{ href: '/admin/missions', label: t.navMissions }` to the hardcoded `AdminShell` nav array.
- **i18n:** a new `missionsOps` message group + `navMissions` key across all **7** locales (`en, zh-hk, zh-tw, zh-cn, ja, ko, th`); parity enforced by `tests/i18n.locale-parity.test.ts` (`missionsOps` added to `GROUPS`).
- **Migrations:** new timestamped files only; never edit shipped migrations.
- **Shared UI primitives:** `KpiCard`, `TrendChart`, `StatusBadge` reused verbatim from `components/kinnso/admin/` (already lifted out of `creators/` in Phase 11); no new chart primitives needed.

## 3. New backend — 3 RPCs (SECURITY DEFINER, `is_active_ops()`-gated, read-only/no audit)

All three: first statement raises `forbidden` (SQLSTATE `42501`) unless `is_active_ops()`; grants revoke `public`/`anon`, grant `authenticated`; all `where` clauses implicitly exclude `mission_source='travelpayouts'` (no caller-supplied filter needed — this console simply doesn't surface those rows).

### 3.1 `admin_mission_analytics(p_days int default 30)` — 13A

```
kpis: { total,
        by_status: { draft, published, paused, completed, cancelled },   // nested map, coalesced to {}
        by_type:   { coupon_affiliate, hybrid, paid },
        by_visibility: { open, targeted },
        open_for_applications,          -- status='published' and visibility='open'
        submissions_awaiting_review }   -- mission_milestone_submissions.status in ('submitted','revision_requested')
missions_created:  [{ day, count }]     -- missions.created_at, p_days window
submissions_reviewed: [{ day, count }]  -- mission_milestone_submissions.reviewed_at, p_days window
at_risk: [{ id, title, merchant_name, reason }]
```

**At-risk heuristics (defined once in SQL, tunable, documented here for 13A):**
- `published_no_participants` — `status='published'`, `visibility='open'`, published more than 14 days ago, zero `mission_participants` rows.
- `stalled_submissions` — a submission in `status='submitted'` with `submitted_at` older than 7 days and no `reviewed_at`.
- `verification_failed` — a submission whose latest `mission_verification_jobs` row has `status='failed'` and no newer job exists for that submission.

### 3.2 `admin_search_missions(...)` — 13B

```sql
admin_search_missions(
  p_search text default null,           -- ilike on title
  p_statuses text[] default null,
  p_types text[] default null,
  p_visibilities text[] default null,
  p_merchant_id uuid default null,      -- optional single-merchant scope
  p_limit int default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
) returns table (
  id uuid, title text, merchant_id uuid, merchant_name text,
  status text, mission_type text, visibility text,
  participants_count bigint, milestones_total bigint, milestones_approved bigint,
  created_at timestamptz
)
```

Keyset-paginated on `(created_at, id)`, same convention as `admin_search_creators`/`admin_search_merchants`. `p_merchant_id` exists so a future Merchant-360 deep link can pre-filter this directory (not wired in this phase — no changes to Merchant 360 are in scope).

### 3.3 `admin_mission_detail(p_mission_id uuid)` — 13C

Returns `null` for a missing id **or** a `mission_source='travelpayouts'` row (both map to the page's `notFound()`), otherwise:

```
mission: { id, title, summary, merchant_id, merchant_name, mission_type, visibility, status,
           coupon_code, coupon_description, coupon_url,
           affiliate_commission_rate, kinnso_commission_rate, creator_commission_rate,
           paid_fee_amount, paid_fee_currency, application_instructions, min_tier,
           starts_at, ends_at, published_at, created_at }
milestones: [{ id, title, description, due_at, sort_order,
  submissions: [{ id, participant_id, creator_id, creator_display_name, status, proof_urls, notes,
                  merchant_feedback, submitted_at, reviewed_at,
    verification_jobs: [{ id, platform, status, confidence_status, error, started_at, completed_at }],
    social_snapshots:  [{ id, platform, handle, follower_count, engagement_count, confidence_status, fetched_at }]
  }]
}]
participants: [{ id, creator_id, display_name, handle, status, source, created_at }]
settlements: [{ id, status, creator_payout_status, kinnso_commission_status, affiliate_commission_status,
                currency, creator_commission_amount, updated_at }]   -- READ-ONLY, same shape as Merchant 360 BillingTab
```

This is the "full pipeline depth" decision: every submission carries its complete verification-job history and social-snapshot data inline, so ops can answer "why didn't this auto-verify" without a SQL console — the same visibility gap the mock-data seeding surfaced.

## 4. Modules — components, data, tests

### 13A — Overview (`/admin/missions`)
| File | Responsibility |
|---|---|
| `app/[locale]/admin/missions/page.tsx` | gate → fetch overview → `MissionsOverviewView` |
| `lib/admin/missions-queries.ts` → `getMissionsOverview` | wraps `admin_mission_analytics()` |
| `components/kinnso/admin/missions/MissionsOverviewView.tsx` | KPI cards, 2 trend charts, at-risk list (reuses `KpiCard`/`TrendChart`) |

**Tests:** `admin.missions-queries.test.ts` (overview shape, honest zeros, error propagation); `admin.missions.host.test.tsx` (anon→redirect, non-ops→notFound, ops→renders); `kinnso.MissionsOverviewView.test.tsx`.

### 13B — Directory (`/admin/missions/directory`)
| File | Responsibility |
|---|---|
| `directory/page.tsx` | gate → parse search/filter/sort/page params → fetch → `MissionsDirectoryView` |
| `lib/admin/missions-queries.ts` → `listMissionsDirectory` | wraps `admin_search_missions`, returns `{rows, nextCursor}` |
| `missions-validation.ts` | status/type/visibility guards; `normalizeMissionsDirectoryParams` |
| `MissionsDirectoryView.tsx` | search box, filter controls (status·type·visibility·merchant), sortable table, row→360 |

**Tests:** `admin.missions-queries.test.ts` (filters/sort/pagination, search, merchant scoping); `admin.missions-validation.test.ts`; host + `kinnso.MissionsDirectoryView.test.tsx`.

### 13C — Mission 360 (`/admin/missions/[missionId]`) + retirement
| File | Responsibility |
|---|---|
| `[missionId]/page.tsx` | gate → `getMissionDetail` → `notFound()` on `null` → `MissionDetailView` |
| `lib/admin/missions-queries.ts` → `getMissionDetail` | wraps `admin_mission_detail()` |
| `MissionDetailView.tsx` + tabs: `OverviewTab`, `MilestonesTab`, `ParticipantsTab`, `BillingTab` | header (status·type·visibility, merchant link) + sub-tabs; `MilestonesTab` renders expandable submission rows down to verification-job/social-snapshot detail; `BillingTab` mirrors Merchant 360's read-only billing component |

**Retirement (same PR):** delete `app/[locale]/ops/settlements/page.tsx`, `components/kinnso/pages/OpsSettlementView.tsx`, and the direct `updateSettlementAction` call site — after grepping the codebase to confirm nothing else references them (the audited replacement, `admin_set_settlement_status` via `/admin/creators/payouts`, already ships in Phase 10D).

**Tests:** `admin.missions-queries.test.ts` (detail aggregation incl. nested milestones→submissions→jobs/snapshots, missing-id → `null`, travelpayouts-id → `null`); host test; `kinnso.MissionDetailView.test.tsx` (tab rendering); a repo-wide grep confirming no dangling references to the deleted files before the PR is finalized.

## 5. Error handling

- Page-level: `requireOpsPage` handles anon (`redirect` to sign-in) and non-ops (`notFound`). Missing/travelpayouts `missionId` → `notFound`.
- Query-level: errors propagate; views distinguish "empty" (honest zero) from "failed to load".
- No action-level error handling in this phase (no writes).

## 6. Success criteria

- Ops can search/filter missions across every merchant and open a 360 view showing the complete milestone → submission → verification → settlement chain, without a SQL console.
- The Overview surfaces platform-wide mission health (status/type mix, submissions awaiting review, at-risk missions).
- `/ops/settlements` is deleted with no dangling references; its functionality remains fully covered by `/admin/creators/payouts`.
- All access is ops-gated (binary `is_active_ops()`, consistent with the read-only posture of `admin_merchant_analytics`); no PII leaks to client bundles beyond what Merchant 360 already exposes (merchant name only, no contact email); all new strings exist in all 7 locales (parity test green); `pnpm lint`, `pnpm typecheck`, `pnpm test` pass before each of the three PRs.
