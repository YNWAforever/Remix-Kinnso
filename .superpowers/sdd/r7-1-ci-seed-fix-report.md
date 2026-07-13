# Phase R7.1 CI seed-fixture isolation fix

## Scope

The deterministic R7.1 smoke fixtures in supabase/seed.sql are required by the E2E job but make the existing apps/web/tests/creator-rls.test.ts owner row-count assertions fail in the quality job. The quality job now removes only auth users 00000000-0000-0000-0000-000000000701 and 00000000-0000-0000-0000-000000000702 after supabase start and before exporting test env/running pnpm test. Their dependent creator, merchant, guide, experience, and availability rows are removed by the existing foreign-key cascades. The E2E job and supabase/seed.sql remain unchanged.

## Implementation

- .github/workflows/ci.yml: added a quality-only bash step.
- Discovers the database container by the Supabase CLI project label (kinnso-v3) and supabase_db_ name prefix.
- Fails with a diagnostic container listing if discovery returns no database container.
- Executes psql -U postgres -d postgres -v ON_ERROR_STOP=1 through docker exec -i.
- Uses fixed UUIDs only; no hosted or production state is touched.

## Verification

- git diff --check — pass.
- Local container discovery found supabase_db_kinnso-v3 (e7cde8d766d2).
- Direct local cleanup command — DELETE 2.
- Follow-up query returned zero rows for both auth IDs.
- Follow-up cascade query returned zero rows for creators, merchant_profiles, and guides fixture rows.
- The local Postgres trigger emitted a non-fatal contribution_on_guide failed warning during delete; psql exited 0 and all target rows were removed.
- Broad CI/test execution was intentionally skipped per the focused-fix request; no production/cloud state was touched.

## Concerns

The trigger warning is existing local-database behavior during cascading auth-user deletion. It did not change the successful cleanup result or exit status.