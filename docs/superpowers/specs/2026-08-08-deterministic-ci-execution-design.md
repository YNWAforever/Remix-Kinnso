# Deterministic Pre-merge CI Execution Design

**Date:** 2026-08-08
**Status:** Proposed
**Scope:** Repository-only CI trigger and execution hardening for PR #106

## Goal

Make the repository's pre-merge quality gate execute deterministically for the exact branch head, then require the complete `quality` job to pass before this phase is considered complete. The gate must include the existing typecheck, lint, honesty lint, local Supabase setup, public-only web build environment, Next.js production build, and full test suite.

## Context and observed failure

The current `.github/workflows/ci.yml` already defines a `quality` job and a `pull_request` trigger. It also provisions a local Supabase stack and contains the approved secret-free web build gate.

For PR #106, pushes to `codex/ops-authorization-context` reached GitHub, but exact-head Actions queries returned only the post-deploy `Verify (cutover gate)` workflow. No pre-merge `CI` workflow or `quality` job registered for the pushed heads. The skipped post-deploy checks and Vercel checks are not substitutes for the missing quality gate.

The next phase is repository-only. It may change tracked workflow configuration and observe PR checks, but it must not change GitHub repository settings, branch protection, secrets, production data, or deployment workflows.

## Decisions

- Keep `.github/workflows/ci.yml` as the single source of quality-job logic.
- Preserve the existing PR quality path and local Supabase setup.
- Add an exact-head push fallback for `codex/**` branches.
- Add an explicit `workflow_dispatch` entry point for repeatable repository-controlled diagnostics.
- Make pull-request event types explicit, including draft-to-ready transitions.
- Run only `quality` for branch-push and manual fallback events; keep E2E on pull requests and the existing `main` push path.
- Add event/ref-scoped concurrency so stale runs for the same event and ref are canceled without cross-canceling a PR run and its push fallback.
- Set workflow permissions to read-only repository contents.
- Do not create a second quality workflow, duplicate application logic, or add provider-specific secrets.
- Completion requires a real `CI` quality run for the exact head with every quality step green.

## Trigger and job architecture

The workflow will expose this event contract:

| Event | `quality` job | `e2e` job | Purpose |
| --- | --- | --- | --- |
| `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) | Run | Run | Canonical PR validation and required check surface |
| `push` to `codex/**` | Run | Skip | Exact-head fallback when PR registration is absent or delayed |
| `push` to `main` | Preserve current behavior | Preserve current behavior | Existing main-branch validation |
| `workflow_dispatch` | Run | Skip | Explicit repository-controlled diagnostic/recovery path |

The `e2e` job will be guarded so a branch-push or manual quality run does not start the existing E2E service/fixture flow. This keeps the fallback focused on the missing quality evidence and avoids unnecessary duplicate browser work. The existing pull-request and `main` E2E behavior remains unchanged.

The workflow will use an explicit read-only `contents` permission. Concurrency will be scoped by event and ref, using the pull-request head branch when available and the ref name otherwise. A newer run for the same event/ref may cancel an older run; a push fallback will not cancel the separate PR run merely because both refer to the same branch.

## Data flow and boundaries

All event paths enter the existing `quality` job after checkout and package setup:

1. Install the frozen dependency graph.
2. Run the existing repository typecheck, lint, and honesty lint tasks.
3. Install/use the pinned Supabase CLI and start the local Supabase stack.
4. Preserve the existing test environment export, including its test-only service-role value.
5. Generate a separate `apps/web/.env.local` containing only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the local stack. Reject malformed or unexpected output before promoting the temporary file.
6. Validate the public build environment.
7. Run `pnpm --filter web build` with `AGENT_LIVE=false` and `BOOKING_LIVE=false`.
8. Run the existing `pnpm test` suite.

The existing test environment and the new public-only build environment remain separate. No generated env file is committed or uploaded. The service-role value is never written to `apps/web/.env.local`. No production URL, AI credential, Stripe credential, migration, RLS policy, RPC, seed, or live integration is introduced.

## Failure handling

- A missing local Supabase stack, missing public variable, malformed env output, build failure, or test failure fails the quality job.
- A skipped E2E job on `codex/**` push or manual dispatch is expected and is not evidence that quality passed or failed.
- A registered `CI` run with a failed quality step is a source/configuration failure and must be fixed before completion.
- If neither PR nor exact-head push/manual execution registers a `CI` run, the result is an external GitHub Actions/permissions/registration blocker. The phase must not claim build or test success, add secrets, or mutate production state to work around it.
- The workflow must not print generated env contents or upload env files as artifacts.

## Verification and acceptance

### Local checks

Before remote verification, inspect the workflow and run:

- a structural check for explicit triggers, `codex/**` push fallback, manual dispatch, read-only permissions, E2E conditions, concurrency, public-only env output, safe flags, and build-before-test ordering;
- `pnpm.cmd --filter web typecheck`;
- `pnpm.cmd --filter web lint`;
- `git diff --check` and a changed-file boundary check.

Local checks do not substitute for the CI build because the isolated worktree does not own the runner's Docker-backed Supabase stack.

### Remote checks

Push the exact branch head and observe both the PR check rollup and the Actions run list for that exact SHA. Acceptance requires:

- a registered pre-merge `CI` workflow run for the exact head;
- the `quality` job to pass typecheck, lint, honesty lint, local Supabase setup/env checks, the web build with both safe flags, and the full test suite;
- no generated env artifact or production mutation;
- any E2E skip on push fallback to be explained by the event routing, not treated as a quality result;
- the PR check URL and exact run evidence recorded in the handoff.

If the quality run still does not register after the repository trigger hardening, stop at the external gate and report the exact SHA, workflow query, PR state, and missing check. Do not merge or claim completion.

## Non-goals

- No application authorization or product behavior changes.
- No new database schema, migration, RLS policy, RPC, seed, or production data changes.
- No changes to `verify.yml` or `nightly-funnel.yml`.
- No GitHub settings, branch-protection, secret, paid-provider, deployment, or rollback changes.
- No separate duplicate quality workflow.
- No merge to `main` as part of this phase.

## Risks and trade-offs

The `codex/**` push fallback can create an additional quality run alongside the PR run, increasing CI usage. Event/ref-scoped concurrency limits stale duplicates without hiding the canonical PR event. The fallback is intentionally limited to `quality`; E2E remains on its established PR/main paths.

The design cannot correct organization-level Actions disablement or branch-protection configuration because those are outside the repository-only boundary. If the workflow remains absent from exact-head Actions results after these changes, the correct outcome is a release gate with explicit external blocker evidence.
