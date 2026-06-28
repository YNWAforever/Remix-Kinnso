# Phase 10 — Creators Operator Console

- **Date:** 2026-06-28
- **Status:** Design approved — ready for implementation plan(s)
- **Depends on:** Phase 6 (admin shell, `requireOpsPage`/`requireOpsAction`, `ActionResult`, `kinnso_ops_members`, `is_active_ops()`, `admin_overview_counts`, `admin_list_creators`, `admin_set_user_status`); Phase 5 (creator contribution/tier backbone); Phase 8 (analytics/insights patterns). Reuses `lib/missions` `listOpsSettlements`/`opsSettlementSelect`.
- **Part of:** the larger **Operator Console** program (the SaaS-style ops backend). Sequencing was chosen as **vertical slices, one domain at a time** — Creators is the first domain. Merchants, Content, Algorithm, Team & Roles, and cross-domain Analytics are later, separate phases that reuse the foundations laid here (notably the shared `ops_audit_log`).

## 1. Goal

A dedicated, ops-only **Creators console** under the existing admin shell that lets a small ops team **understand, moderate, analyze, and pay** creators — the platform's core entity. It is *not* a second copy of the generic Users list; it is the creator-specific, data-rich operator view.

Information architecture (approved): **one `Creators` sidebar item** with three tabs — **Overview**, **Directory**, **Payouts** — plus a full **Creator 360 detail** page (`/admin/creators/[creatorId]`) reached by clicking a creator. Landing tab is **Overview** (balanced console for generalist ops).

Four jobs, all in scope for this phase:
1. **Creator 360 view** — one page aggregating profile, DNA/scan, missions, earnings, content, and moderation history.
2. **Account lifecycle & moderation** — activate / suspend / **ban** / **reinstate**, plus a **verified** trust flag; every state change requires a reason and is written to a shared audit log.
3. **Performance analytics** — aggregate KPIs, growth & engagement time-series, a contribution leaderboard, and an at-risk list.
4. **Payouts & earnings ops** — a settlement queue across creators with audited status writes and a money-flow summary.

### Non-goals (this phase)
- **No fine-grained RBAC.** Access stays binary ops (`is_active_ops()`); "who may pay out / ban" controls are deferred to the later **Team & Roles** phase. Payout actions get an extra confirmation step in the meantime.
- **No new creator analytics warehouse / event pipeline** — analytics are computed on demand from existing tables via SECURITY DEFINER RPCs. (If query cost becomes an issue, a materialized view is a later optimization.)
- **No edits to creator content/DNA** from the console (read-only display of `creator_dna`, `guides`); content moderation actions are a later Content phase.
- **No bulk payout execution** — payouts here are status review/marking, not initiating money movement.

### Decomposition → four implementation plans (built in sequence)
This spec is the shared design; implementation is **four plans**, each shipping working software:
1. **10A — Nav + shared audit log + Overview.** Add `Creators` to the shell nav; build the shared `ops_audit_log` table + `ops_audit_log_append` helper; build `admin_creator_analytics()`; ship the **Overview** tab (KPIs, trends, leaderboard, at-risk). `creators` i18n group.
2. **10B — Directory + lifecycle/moderation.** Status migration (`banned` + `verified`); `admin_search_creators()`; the **Directory** list (search/filter/sort/paginate, row → 360); lifecycle/verify/note actions wired to the audit log; bulk status actions.
3. **10C — Creator 360 detail.** `getCreatorDetail()` aggregator + `[creatorId]` page with sub-tabs (Profile & DNA · Missions · Earnings · Content · Moderation).
4. **10D — Payouts.** `admin_set_settlement_status()`; the **Payouts** tab reusing `listOpsSettlements`, money-flow summary, confirm-gated status writes.

## 2. Shared architecture & conventions

Mirrors the Phase 6 admin recipe exactly:

- **Routes:** `app/[locale]/admin/creators/{page,directory/page,payouts/page,[creatorId]/page}.tsx`. `generateStaticParams` over `LOCALES`; `isLocale` guard → `notFound()`; **`await requireOpsPage(supabase, loc)` inline before any data fetch** (the admin layout gate does not precede the page fetch because Next renders layout + page in parallel — every existing admin page gates inline; we match that).
- **Data access:** pure query functions taking `SupabaseClient<Database>` in `lib/admin/creators-queries.ts`. Platform-wide reads/writes go through **SECURITY DEFINER RPCs gated on `is_active_ops()`** (owner-RLS would hide other creators' rows from ops). Errors **propagate** — never swallow to `[]`/`0`.
- **Server actions:** file-level `'use server'` in `lib/admin/creators-actions.ts`; pattern = server client → `requireOpsAction` → validate (`creators-validation.ts`) → mutate via RPC → `revalidatePath('/${locale}/admin/creators...')` → return `ActionResult`. camelCase→snake_case via a local `toRow()`; DB raise-messages mapped to friendly copy.
- **`ActionResult<T> = ({ok:true} & T) | {ok:false; errors: Record<string,string[]>}`**, whole-form errors under `errors.form` via `formError(msg)` (reused from `lib/admin/result.ts`).
- **PII:** drop sensitive fields (e.g. email) before passing data to client components, per the existing convention.
- **Nav:** add one entry `{ href: '/admin/creators', key: 'navCreators' }` to the hardcoded `AdminShell` nav array; active state via `usePathname()`.
- **i18n:** a new `creators` message group + `navCreators` key added to **all 7** locale files (`lib/i18n/messages/*.ts`) and the `Messages` interface; parity enforced by `tests/i18n.locale-parity.test.ts`.
- **Migrations:** new timestamped files only; never edit shipped migrations.

## 3. The three new backend pieces

### 3.1 `ops_audit_log` (shared, built in 10A)

A single ops-wide audit/notes log — **not creator-specific** — so every later console module (merchants, content, payouts, team) reuses it. Fills a confirmed gap (no ops audit log exists today).

```sql
create table public.ops_audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_ops_member_id uuid not null references public.kinnso_ops_members(id),
  entity_type     text not null,            -- 'creator' | 'merchant' | 'settlement' | ...
  entity_id       uuid not null,
  action          text not null,            -- 'status.suspend' | 'status.ban' | 'status.reinstate' | 'verify.set' | 'note.add' | 'settlement.status' | ...
  reason          text,                     -- required by the calling RPCs for state changes
  metadata        jsonb not null default '{}'::jsonb,  -- e.g. { from:'active', to:'suspended' }
  created_at      timestamptz not null default now()
);
create index ops_audit_log_entity_idx on public.ops_audit_log (entity_type, entity_id, created_at desc);
alter table public.ops_audit_log enable row level security;
-- read: active ops only; no direct insert/update/delete (writes only via SECURITY DEFINER RPCs)
create policy ops_audit_read on public.ops_audit_log for select using (is_active_ops());
```

- Internal helper `ops_audit_log_append(p_actor, p_entity_type, p_entity_id, p_action, p_reason, p_metadata)` called *inside* the mutation RPCs (same transaction) so an action and its audit row commit atomically.
- `listAudit(supabase, entityType, entityId)` in `lib/admin/audit.ts` powers the 360 Moderation tab and the Overview "recent moderation activity" feed.

### 3.2 `admin_creator_analytics()` (10A)

SECURITY DEFINER, `is_active_ops()`-gated. Returns ops-aggregate data (the existing `getCreatorInsights` is per-creator-self and not reusable here). Shape (one RPC returning json, or a small set):
- **KPIs:** total creators, by status (onboarding/active/suspended/banned), verified count, new in period, payouts pending — with previous-period deltas.
- **Time-series:** signups per day/week and an engagement proxy (contribution events and/or milestone submissions) over the selected window.
- **Leaderboard:** top creators by `creator_contribution.contribution_points` (+ tier).
- **At-risk:** creators meeting heuristics — e.g. latest `creator_scan_jobs.status='failed'`, no `mission_participants` with status in (`active`,`completed`) recently, or a downward points trend. (Exact thresholds finalized in 10A; documented in the plan.)

### 3.3 `admin_set_settlement_status()` (10D)

SECURITY DEFINER, ops-gated, audited. Wraps a status change on `mission_settlements` (overall `status` and/or a per-leg `*_status`), stamps `updated_by_ops_member_id` and `ops_note`, and appends an `ops_audit_log` row (`entity_type='settlement'`). Enforces valid transitions (e.g. cannot move a `paid` leg back to `pending` without an explicit flag).

## 4. Lifecycle & verification (approved option C)

`creators.status` is extended and a `verified` flag is added (migration in **10B**):

```sql
-- extend the status CHECK to add a terminal 'banned' state
alter table public.creators drop constraint creators_status_check;  -- (use actual constraint name)
alter table public.creators add constraint creators_status_check
  check (status in ('onboarding','active','suspended','banned'));
-- independent trust flag
alter table public.creators add column verified boolean not null default false;
-- public surfaces may read 'verified' (badge on public profile); RLS public-read policy updated to expose it
```

Transition rules (enforced in the write RPC, reusing existing guard ideas from `admin_set_user_status`):
- **activate:** `onboarding`/`suspended` → `active`.
- **suspend:** `active` → `suspended` (reversible).
- **ban:** `active`/`suspended` → `banned` (terminal; reason required).
- **reinstate:** `banned` → `active` — a **distinct, extra-guarded** action (separate UI control + confirm), not the normal activate path.
- **verify:** `admin_set_creator_verified(p_id, p_verified)` toggles the flag independently of status; surfaced in Directory, 360 header, and public profile (label localized in all 7 locales).
- Every transition **requires a reason** and writes an `ops_audit_log` row with `{from,to}` metadata. Existing `admin_set_user_status` guards (`cannot_suspend_self`, `last_active_ops`) are not relevant to creators but the audited-RPC pattern is reused.

## 5. Modules — components, data, tests

Each module below = the matching implementation plan from §1 (10A–10D).

### 10A — Overview (`/admin/creators`)
| File | Responsibility |
|---|---|
| `app/[locale]/admin/creators/page.tsx` | gate → fetch overview → `CreatorsOverviewView` |
| `lib/admin/creators-queries.ts` → `getCreatorsOverview` | wraps `admin_creator_analytics()` + recent audit feed |
| `components/kinnso/admin/creators/CreatorsOverviewView.tsx` | KPI cards, trend charts, leaderboard, at-risk, moderation feed |
| shared: `KpiCard`, `TrendChart`, `Leaderboard`, `StatusBadge`, `VerifiedBadge`, `TierBadge` | |

**Tests:** `admin.creators-queries.test.ts` (overview shape, honest zeros, error propagation); `admin.creators.host.test.tsx` (anon→redirect, non-ops→notFound, ops→renders); `kinnso.CreatorsOverviewView.test.tsx`.

### 10B — Directory (`/admin/creators/directory`)
| File | Responsibility |
|---|---|
| `directory/page.tsx` | gate → parse search/filter/sort/page params → fetch → `CreatorsDirectoryView` |
| `lib/admin/creators-queries.ts` → `listCreatorsDirectory` | wraps `admin_search_creators(search, filters, sort, cursor, limit)` |
| `creators-actions.ts` → `setCreatorStatus`, `reinstateCreator`, `setCreatorVerified`, `addCreatorNote`, `bulkSetCreatorStatus` | audited writes |
| `creators-validation.ts` | reason required; valid status/transition; bulk id list bounds |
| `CreatorsDirectoryView.tsx` | search box, filter controls (status·tier·DNA·activity), sortable table, row→360, bulk action bar with reason prompt |

`admin_search_creators` extends today's `admin_list_creators()` with `p_search`, `p_status[]`, `p_tier[]`, `p_dna`, `p_verified`, sort, and **keyset pagination** (cursor on `(created_at,id)`) for scale.

**Tests:** `admin.creators-queries.test.ts` (filters/sort/pagination, search); `admin.creators-actions.test.ts` (each transition incl. ban→reinstate guard, verify toggle, note→audit row, bulk; `ActionResult` shapes; reason-required failures); `admin.creators-validation.test.ts`; `admin.audit.test.ts`; host + `kinnso.CreatorsDirectoryView.test.tsx`.

### 10C — Creator 360 detail (`/admin/creators/[creatorId]`)
| File | Responsibility |
|---|---|
| `[creatorId]/page.tsx` | gate → `getCreatorDetail` → `CreatorDetailView` |
| `lib/admin/creators-queries.ts` → `getCreatorDetail` | aggregates `creators`, `creator_dna`, `creator_scan_jobs`, `creator_social_handles`, `creator_contribution(+events)`, `mission_participants(+milestone submissions)`, `mission_settlements`, `guides`, `ops_audit_log` |
| `CreatorDetailView.tsx` + tabs: `ProfileDnaTab`, `MissionsTab`, `EarningsTab`, `ContentTab`, `ModerationTab` | header (status·tier·verified·quick actions) + sub-tabs |

Header quick actions = the lifecycle/verify actions from 5B (reused). Moderation tab lists this creator's `ops_audit_log` entries + an add-note form.

**Tests:** `admin.creators-queries.test.ts` (detail aggregation, missing-creator → notFound path); host test (gate); `kinnso.CreatorDetailView.test.tsx` (tab rendering, action wiring).

### 10D — Payouts (`/admin/creators/payouts`)
| File | Responsibility |
|---|---|
| `payouts/page.tsx` | gate → fetch settlements → `CreatorPayoutsView` |
| `lib/admin/creators-queries.ts` → `listCreatorSettlements` | reuses `lib/missions` `listOpsSettlements`/`opsSettlementSelect`, grouped + money-flow summary |
| `creators-actions.ts` → `setSettlementStatus` | wraps `admin_set_settlement_status()`; **extra confirm** required |
| `CreatorPayoutsView.tsx` | queue table filtered by settlement status, money-flow summary cards, per-row status action behind a confirm dialog |

**Tests:** `admin.creators-queries.test.ts` (settlement grouping/summary); `admin.creators-actions.test.ts` (settlement status transition guards, audit row, `ActionResult`); host + `kinnso.CreatorPayoutsView.test.tsx`.

## 6. Error handling

- Page-level: `requireOpsPage` handles anon (`redirect` to sign-in) and non-ops (`notFound`). Bad `creatorId` → `notFound`.
- Query-level: errors propagate (no silent empty states); the views distinguish "empty" (honest zero) from "failed to load".
- Action-level: all return `ActionResult`; validation and DB-raise messages map to friendly, localized copy; success triggers `revalidatePath`.
- Money-touching (payouts) + destructive (ban) actions require a confirm step in the UI and a reason server-side.

## 7. Risks & open items (resolve in plans, not blocking)

- **Analytics query cost** — on-demand RPC aggregates are fine at current scale; revisit with a materialized view if the Overview gets slow. (Non-goal to build the pipeline now.)
- **At-risk heuristics** — exact thresholds defined in 10A; keep them in one documented SQL function so they're tunable.
- **`verified` on public surfaces** — adding it to the public-read RLS + public creator queries (`getPublicCreators`, `getCreatorByHandle`) and the public profile UI is in 10B's scope; coordinate the badge string across all 7 locales.
- **Settlement transition matrix** — the legal status transitions (5 leg-statuses + overall) must be written down explicitly in 10D before coding the RPC.

## 8. Success criteria

- Ops can find any creator (search/filter), open a 360 view, and take a moderation action with a reason that shows up in the audit trail.
- Ops can see creator growth/engagement, the contribution leaderboard, and an at-risk list on the Overview.
- Ops can review settlements and mark statuses, with every change audited and stamped to the acting ops member.
- All access is ops-gated; no PII leaks to client bundles; all new strings exist in all 7 locales (parity test green); `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
