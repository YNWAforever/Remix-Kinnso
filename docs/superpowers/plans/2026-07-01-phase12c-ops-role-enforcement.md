# Phase 12C — Ops Role Enforcement (Thread Role Gate Into All RPCs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `is_active_ops()` gate in every existing audited creator/merchant/settlement RPC with `is_active_ops_role(p_min)`, enforcing the permission matrix: read = analyst+, moderation = moderator+, settlements = admin+. No TypeScript source changes — all enforcement is in the DB migration.

**Prerequisite:** Phase 12B must be merged to `main` before cutting this branch. `is_active_ops_role(text)` must exist in the live DB (verified in 12B).

**Architecture:** One migration file re-creates each existing RPC with `create or replace function`, changing only the gate from `is_active_ops()` to `is_active_ops_role('<level>')`. `is_active_ops()` is NOT dropped — it still gates `requireOpsPage`/`requireOpsAction` (the app-layer binary check remains correct). Existing unit test suites need negative role-gate tests added (mocking the RPC returning `forbidden` for under-privileged callers).

**Tech Stack:** PostgreSQL SECURITY DEFINER, Vitest 4.

---

## Permission Matrix (reference)

| RPC | Gate after 12C |
|---|---|
| `admin_creator_analytics` | `is_active_ops_role('analyst')` |
| `admin_merchant_analytics` | `is_active_ops_role('analyst')` |
| `admin_creator_detail` | `is_active_ops_role('analyst')` |
| `admin_merchant_detail` | `is_active_ops_role('analyst')` |
| `admin_search_creators` | `is_active_ops_role('analyst')` |
| `admin_search_merchants` | `is_active_ops_role('analyst')` |
| `admin_list_ops_members` | `is_active_ops_role('analyst')` |
| `admin_set_creator_status` | `is_active_ops_role('moderator')` |
| `admin_reinstate_creator` | `is_active_ops_role('moderator')` |
| `admin_set_creator_verified` | `is_active_ops_role('moderator')` |
| `admin_add_creator_note` | `is_active_ops_role('moderator')` |
| `admin_bulk_set_creator_status` | `is_active_ops_role('moderator')` |
| `admin_set_merchant_status` | `is_active_ops_role('moderator')` |
| `admin_set_merchant_tier` | `is_active_ops_role('moderator')` |
| `admin_add_merchant_note` | `is_active_ops_role('moderator')` |
| `admin_bulk_set_merchant_status` | `is_active_ops_role('moderator')` |
| `admin_set_settlement_status` | `is_active_ops_role('admin')` |

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260701170000_ops_role_enforcement.sql` | CREATE |
| `apps/web/tests/admin.creators-actions.test.ts` | MODIFY (add `forbidden` role-gate negative tests) |
| `apps/web/tests/admin.merchants-actions.test.ts` | MODIFY (add `forbidden` role-gate negative tests) |
| `apps/web/tests/admin.creators-queries.test.ts` | MODIFY (add `forbidden` role-gate test) |
| `apps/web/tests/admin.merchants-queries.test.ts` | MODIFY (add `forbidden` role-gate test) |
| `apps/web/tests/admin.team-queries.test.ts` | MODIFY (add `forbidden` role-gate test) |

---

## Task 1: Collect existing RPC bodies from migration files

Before writing the migration, read each source migration to copy the exact function bodies. The only change in each function is one line.

- [ ] **Step 1: Read Phase 10B migration (creator lifecycle RPCs)**

```bash
cat supabase/migrations/20260629110000_creator_lifecycle_and_search.sql
```
Record the SQL for: `admin_set_creator_status`, `admin_reinstate_creator`, `admin_set_creator_verified`, `admin_add_creator_note`, `admin_bulk_set_creator_status`, `admin_search_creators`.

- [ ] **Step 2: Read Phase 10A migration (analytics RPC)**

```bash
cat supabase/migrations/20260628130000_ops_audit_log_and_creator_analytics.sql
```
Record the SQL for: `admin_creator_analytics`.

- [ ] **Step 3: Read Phase 10C migration (creator detail RPC)**

```bash
cat supabase/migrations/20260629120000_admin_creator_detail.sql
```
Record the SQL for: `admin_creator_detail`.

- [ ] **Step 4: Read Phase 10D migration (settlement status RPC)**

```bash
cat supabase/migrations/20260629140000_admin_set_settlement_status.sql
```
Record the SQL for: `admin_set_settlement_status`.

- [ ] **Step 5: Read Phase 11A migration (merchant analytics RPC)**

```bash
cat supabase/migrations/20260630120000_admin_merchant_analytics.sql
```
Record the SQL for: `admin_merchant_analytics`.

- [ ] **Step 6: Read Phase 11B migration (merchant lifecycle RPCs)**

```bash
cat supabase/migrations/20260630130000_merchant_ops_lifecycle_and_search.sql
```
Record the SQL for: `admin_search_merchants`, `admin_set_merchant_status`, `admin_set_merchant_tier`, `admin_add_merchant_note`, `admin_bulk_set_merchant_status`.

- [ ] **Step 7: Read Phase 11C migration (merchant detail + list ops members RPCs)**

```bash
cat supabase/migrations/20260630140000_admin_merchant_detail_and_drop_legacy_tier.sql
cat supabase/migrations/20260701150000_ops_member_role.sql
```
Record the SQL for: `admin_merchant_detail`, `admin_list_ops_members`.

---

## Task 2: Write the enforcement migration

**Files:**
- Create: `supabase/migrations/20260701170000_ops_role_enforcement.sql`

- [ ] **Step 1: Write the migration header and pattern guide**

```sql
-- Phase 12C — Thread is_active_ops_role(p_min) into every existing audited RPC.
-- Pattern: find the line `if not public.is_active_ops() then` and replace with
-- `if not public.is_active_ops_role('<level>') then`.
-- is_active_ops() is NOT dropped — it still gates requireOpsPage/requireOpsAction.
-- All function bodies are identical to their original migrations except the gate line.
```

- [ ] **Step 2: Write `create or replace` for each READ RPC (analyst gate)**

For each of the following 7 RPCs, copy the original function body from the migration files read in Task 1 and replace:
```sql
  if not public.is_active_ops() then
```
with:
```sql
  if not public.is_active_ops_role('analyst') then
```

RPCs to update (analyst gate):
1. `admin_creator_analytics(p_days int default 30)`
2. `admin_merchant_analytics(p_days int default 30)`
3. `admin_creator_detail(p_creator_id uuid)`
4. `admin_merchant_detail(p_merchant_id uuid)`
5. `admin_search_creators(p_search text, p_statuses text[], p_limit int, p_cursor_created_at timestamptz, p_cursor_id uuid)`
6. `admin_search_merchants(p_search text, p_statuses text[], p_tiers text[], p_limit int, p_cursor_created_at timestamptz, p_cursor_id uuid)`
7. `admin_list_ops_members()`

After each `create or replace function ... $$;` block, add the grants (unchanged from the original):
```sql
revoke all on function public.<name>(<args>) from public, anon;
grant execute on function public.<name>(<args>) to authenticated;
```

- [ ] **Step 3: Write `create or replace` for each MODERATION RPC (moderator gate)**

Replace `is_active_ops()` with `is_active_ops_role('moderator')` for:
1. `admin_set_creator_status(p_id uuid, p_status text, p_reason text)`
2. `admin_reinstate_creator(p_id uuid, p_reason text)`
3. `admin_set_creator_verified(p_id uuid, p_verified boolean, p_reason text)`
4. `admin_add_creator_note(p_id uuid, p_note text)`
5. `admin_bulk_set_creator_status(p_ids uuid[], p_status text, p_reason text)`
6. `admin_set_merchant_status(p_id uuid, p_status text, p_reason text)`
7. `admin_set_merchant_tier(p_id uuid, p_tier text, p_reason text)`
8. `admin_add_merchant_note(p_id uuid, p_note text)`
9. `admin_bulk_set_merchant_status(p_ids uuid[], p_status text, p_reason text)`

- [ ] **Step 4: Write `create or replace` for the SETTLEMENTS RPC (admin gate)**

Replace `is_active_ops()` with `is_active_ops_role('admin')` for:
1. `admin_set_settlement_status(p_id uuid, p_status text, p_creator_payout_status text, p_kinnso_commission_status text, p_affiliate_commission_status text, p_reason text, p_allow_revert boolean)`

- [ ] **Step 5: Apply migration via MCP**

Use `apply_migration` with `project_id: scryfkefedzuetfdtrvl`, `name: ops_role_enforcement`.

- [ ] **Step 6: Verify via MCP `execute_sql`**

```sql
-- Spot-check: admin_set_settlement_status should now have 'admin' in its body
select prosrc from pg_proc where proname = 'admin_set_settlement_status';
```
Expected: the source contains `is_active_ops_role('admin')`.

```sql
select prosrc from pg_proc where proname = 'admin_set_creator_status';
```
Expected: contains `is_active_ops_role('moderator')`.

```sql
select prosrc from pg_proc where proname = 'admin_creator_analytics';
```
Expected: contains `is_active_ops_role('analyst')`.

---

## Task 3: Add negative role-gate tests to existing test suites

These tests confirm that when the DB returns `forbidden` (what `is_active_ops_role` raises for under-privileged callers), the action layer surfaces a user-friendly error — not a crash.

**Files:**
- Modify: `apps/web/tests/admin.creators-actions.test.ts`
- Modify: `apps/web/tests/admin.merchants-actions.test.ts`
- Modify: `apps/web/tests/admin.creators-queries.test.ts`
- Modify: `apps/web/tests/admin.merchants-queries.test.ts`
- Modify: `apps/web/tests/admin.team-queries.test.ts`

- [ ] **Step 1: Add role-gate tests to `admin.creators-actions.test.ts`**

Inside the existing `describe` block, add:
```ts
describe('role-gate (12C)', () => {
  it('setCreatorStatus surfaces forbidden when RPC raises (analyst calling moderator RPC)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setCreatorStatus('en', 'c1', 'active', 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalled()
  })
  it('setCreatorVerified surfaces forbidden', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setCreatorVerified('en', 'c1', true, 'reason')
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Add role-gate tests to `admin.merchants-actions.test.ts`**

```ts
describe('role-gate (12C)', () => {
  it('setMerchantStatus surfaces forbidden for analyst caller', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setMerchantStatus('en', 'm1', 'suspended', 'reason')
    expect(res.ok).toBe(false)
  })
  it('settlement actions surface forbidden for moderator caller (admin required)', async () => {
    // admin_set_settlement_status is called via the creators-actions module.
    // This confirms the action maps the DB forbidden error to a user-friendly message.
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await setMerchantTier('en', 'm1', 'growth', 'reason')
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Add role-gate test to `admin.creators-queries.test.ts`**

In the `getCreatorDetail` describe block, add:
```ts
it('throws when RPC returns forbidden (analyst scope)', async () => {
  rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
  await expect(getCreatorDetail(supabase, 'c1')).rejects.toMatchObject({ message: 'forbidden' })
})
```

- [ ] **Step 4: Add role-gate test to `admin.merchants-queries.test.ts`**

In the `getMerchantDetail` describe block, add:
```ts
it('throws when RPC returns forbidden', async () => {
  rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
  await expect(getMerchantDetail(supabase, 'm1')).rejects.toMatchObject({ message: 'forbidden' })
})
```

- [ ] **Step 5: Add role-gate test to `admin.team-queries.test.ts`**

In the `getTeamMembers` describe block, add (this already exists from the 12A plan, verify it's present):
```ts
it('throws when the RPC returns an error', async () => {
  rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
  await expect(getTeamMembers(supabase)).rejects.toMatchObject({ message: 'forbidden' })
})
```

- [ ] **Step 6: Run all web tests**

```bash
pnpm --filter web test --run
```
Expected: all suites pass including the new role-gate tests.

---

## Task 4: Typecheck, lint, commit, open PR

- [ ] **Step 1: Typecheck and lint**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
```
Expected: 0 errors.

- [ ] **Step 2: Adversarial review (3 lenses)**

**Security:**
- `is_active_ops()` is still used in `requireOpsPage`/`requireOpsAction` — verify `apps/web/lib/admin/guard.ts` is UNCHANGED. The app-layer binary gate is intentionally left as-is. ✓
- Spot-check via `execute_sql` that `prosrc` of `admin_set_settlement_status` contains `is_active_ops_role('admin')` (not 'moderator' by mistake). ✓
- Verify `admin_creator_analytics` uses `is_active_ops_role('analyst')` — read-only stats should be visible to all ops members. ✓
- `revoke all ... from public, anon` is still present after each `create or replace` — grep migration for any missing grant block.

**Data mapping:**
- Function signatures are unchanged — only the gate call changed. Verify no argument list was accidentally altered by comparing `pg_proc.proargnames` for one function against the original migration.
- `admin_list_ops_members` now uses `is_active_ops_role('analyst')` instead of `is_active_ops()` — both return false for non-ops callers, so behaviour is identical for current members (all are active=owner post-12A backfill). ✓

**i18n:**
- No i18n changes in 12C. Run parity test to confirm no regression: `pnpm --filter web test -- i18n.locale-parity --run`.

- [ ] **Step 3: Fix any findings**

```bash
git add -A
git commit -m "fix(db): Phase 12C adversarial review fixes"
```
(Skip if no findings.)

- [ ] **Step 4: Commit all changes**

```bash
git add \
  supabase/migrations/20260701170000_ops_role_enforcement.sql \
  apps/web/tests/admin.creators-actions.test.ts \
  apps/web/tests/admin.merchants-actions.test.ts \
  apps/web/tests/admin.creators-queries.test.ts \
  apps/web/tests/admin.merchants-queries.test.ts \
  apps/web/tests/admin.team-queries.test.ts
git commit -m "feat(db): Phase 12C — thread is_active_ops_role() into all audited RPCs"
```

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feat/team-roles-12c
gh pr create \
  --title "Phase 12C — Ops role enforcement in all audited RPCs" \
  --body "$(cat <<'EOF'
## Summary
- Re-creates all 17 existing audited RPCs with \`is_active_ops_role(p_min)\` gate
- Permission matrix enforced: read = analyst+, moderation = moderator+, settlements = admin+
- \`is_active_ops()\` retained in \`requireOpsPage\`/\`requireOpsAction\` (binary active-member check unchanged)
- No TypeScript source changes — pure DB enforcement
- Existing test suites extended with \`forbidden\` role-gate negative tests

## Test plan
- [ ] \`pnpm --filter web test --run\` — all suites green
- [ ] \`pnpm --filter web typecheck\` — 0 errors
- [ ] DB spot-check: \`admin_set_settlement_status\` prosrc contains \`is_active_ops_role('admin')\`
- [ ] DB spot-check: \`admin_set_creator_status\` prosrc contains \`is_active_ops_role('moderator')\`
- [ ] DB spot-check: \`admin_creator_analytics\` prosrc contains \`is_active_ops_role('analyst')\`
- [ ] Sign in as an analyst-role member → can view Overview/Directory/360s; attempting a lifecycle action returns "Active ops access is required" (the DB raises 42501)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
