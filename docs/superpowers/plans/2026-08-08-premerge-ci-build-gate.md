# Pre-merge CI Web Build Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a blocking, secret-free Next.js production build to the existing pull-request CI quality job using the ephemeral local Supabase stack already provisioned by CI.

**Architecture:** Extend `.github/workflows/ci.yml`'s existing `quality` job after local Supabase env generation. Keep `.env.test` for the current full test suite, generate a separate public-only `apps/web/.env.local` for Next.js, validate its required variable names without printing values, and run `pnpm --filter web build` with `AGENT_LIVE=false` and `BOOKING_LIVE=false` before `pnpm test`.

**Tech Stack:** GitHub Actions, Bash, Supabase CLI 2.106.0, pnpm 11, Turborepo, Next.js 16, TypeScript, Vitest 4.

## Global Constraints

- The gate must run on every pull request through the existing `quality` job.
- Reuse the local Supabase stack already created by CI.
- Provide only public local Supabase URL and anon-key values to Next.js.
- Build with `AGENT_LIVE=false` and `BOOKING_LIVE=false`.
- Fail closed when required generated environment values are absent.
- Preserve the existing full test setup and ordering.
- Leave post-deploy verification, schema, RLS, migrations, RPCs, seeds, production data, and production secrets unchanged.
- Do not add or rotate GitHub, Supabase, AI Gateway, Stripe, or Vercel secrets.
- Do not run a live AI or Stripe integration in CI.
- Do not make `verify.yml` a pre-merge workflow.
- Do not change application authorization behavior or runtime product flags.
- Do not modify migrations, RLS policies, RPCs, seed data, or deployment configuration.
- Do not make local developers copy a secret-bearing `.env.test` into a worktree.
- The service-role value remains confined to the existing test environment generation and is not written to the build environment.
- Generated env files live only on the ephemeral GitHub runner and are not uploaded as artifacts. No step logs their contents.
- Use `pnpm.cmd` for Windows commands and preserve unrelated local changes and untracked review artifacts.

---

## File Map

Modify only:

- `.github/workflows/ci.yml` ??export the public build env, check its shape, and run the blocking web build.

No application source, test source, dependency, database, deployment, or post-deploy workflow file is expected to change.

### Task 1: Add the Secret-Free Web Build Gate to CI

**Files:**
- Modify: `.github/workflows/ci.yml` after the existing `Export local Supabase env for tests` step and before `pnpm test`.

**Interfaces:**
- Consumes: the local Supabase stack started by the existing `pnpm supabase start` step and the existing quality-job test env export.
- Produces: `apps/web/.env.local` containing only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, followed by a passing or blocking `pnpm --filter web build` result.

- [ ] **Step 1: Confirm the current CI insertion point.**

Run:

```powershell
rg -n "Export local Supabase env for tests|pnpm test|supabase status" .github/workflows/ci.yml
```

Expected: the existing test env export appears before the existing `pnpm test` step inside the `quality` job; no build step exists there yet.

- [ ] **Step 2: Add the public build-env export and non-secret presence check.**

Insert the following steps immediately after the existing test-env export step and before `pnpm test`:

```yaml
      - name: Export local Supabase env for web build
        run: |
          pnpm -s supabase status -o env \
            --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
            --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
            | tee apps/web/.env.local > /dev/null

      - name: Check web build environment
        shell: bash
        run: |
          set -euo pipefail
          test -s apps/web/.env.local
          grep -q '^NEXT_PUBLIC_SUPABASE_URL=' apps/web/.env.local
          grep -q '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' apps/web/.env.local
```

The export must not include `SUPABASE_SERVICE_ROLE_KEY`; the existing test-env export remains the only step that writes the service-role value, and that file is consumed by tests only.

- [ ] **Step 3: Add the blocking web build with safe product flags.**

Insert this step after the presence check and before the existing `pnpm test` step:

```yaml
      - name: Build web with safe product flags
        env:
          AGENT_LIVE: 'false'
          BOOKING_LIVE: 'false'
        run: pnpm --filter web build
```

Do not set `VERCEL=1`, `AI_GATEWAY_API_KEY`, Stripe credentials, or production Supabase credentials. The existing `apps/web/next.config.ts` call to `validateBuildEnv()` must validate the generated public env while the safe flags prevent live integration requirements.

- [ ] **Step 4: Verify the workflow diff and protected boundaries.**

Run:

```powershell
git diff --check
git diff -- .github/workflows/ci.yml
git diff --name-only -- .github/workflows/ci.yml .github/workflows/verify.yml .github/workflows/nightly-funnel.yml
```

Expected:

- no whitespace errors;
- only `.github/workflows/ci.yml` is changed;
- `verify.yml` and `nightly-funnel.yml` are not modified;
- the public build env export, non-secret checks, safe flags, and build step are ordered before `pnpm test`;
- no secret values, production URLs, or data mutations appear in the diff.

- [ ] **Step 5: Run available local static checks.**

Run:

```powershell
pnpm.cmd --filter web typecheck
pnpm.cmd --filter web lint
git diff --check
```

Expected: typecheck exits 0; lint exits 0 with only any pre-existing baseline warnings; diff check exits 0. These checks do not replace the CI build because the local worktree does not own the ephemeral Supabase stack.

- [ ] **Step 6: Commit only the workflow change.**

Run:

```powershell
git add -- .github/workflows/ci.yml
git commit -m "ci: add secret-free web build gate"
```

Expected: one commit containing only `.github/workflows/ci.yml`; pre-existing untracked review artifacts remain unstaged.

### Task 2: Verify the Pull-Request CI Gate

**Files:**
- Review only: `.github/workflows/ci.yml`
- No additional source changes.

**Interfaces:**
- Consumes: the Task 1 workflow commit and the existing pull-request CI workflow.
- Produces: CI evidence for the quality job's public env check, web build, and subsequent full test suite.

- [ ] **Step 1: Confirm the committed branch and intended scope.**

Run:

```powershell
git status --short --branch
git log --oneline --decorate --max-count=3
git diff --name-status origin/main...HEAD
```

Expected: the working tree has no tracked changes, the new CI commit is at `HEAD`, and the branch diff contains only the planned workflow file plus the already-approved design/plan documentation.

- [ ] **Step 2: Push the workflow commit and observe the pull-request quality job.**

Run:

```powershell
git push origin codex/ops-authorization-context
gh pr checks 106 --watch
```

Expected: the pull-request `quality` job starts local Supabase, generates both test and build env files, passes the web build with `AGENT_LIVE=false` and `BOOKING_LIVE=false`, then runs the existing full tests. Do not treat post-deploy `verify.yml` or nightly funnel results as substitutes for this pre-merge gate.

- [ ] **Step 3: Capture and classify CI results.**

Record separately:

- build-env export/presence check;
- `web` build;
- existing typecheck, lint, honesty lint, and full test tasks;
- any unrelated or provider-specific failures.

If a failure is caused by missing provider configuration, preserve the exact job message and do not add a secret or change production state. If the build fails with the generated local env and safe flags, treat it as a source/configuration regression requiring a follow-up fix before completion.

- [ ] **Step 4: Prepare the handoff.**

Report the workflow commit, CI run or check URL, quality-job result, build result, full-test result, and any remaining environment/provider gate. Confirm that no generated env file was committed or uploaded.

## Spec Coverage Self-Review

- The existing quality job remains the orchestration boundary: Task 1, Steps 2-3.
- Public-only Next.js build env is generated separately from test env: Task 1, Step 2.
- Safe feature flags disable AI and booking integration requirements: Task 1, Step 3.
- Missing env and build failures fail closed: Task 1, Steps 2-3; Task 2, Step 3.
- Existing tests remain active after the build: Task 1, Step 3; Task 2, Step 2.
- Post-deploy and nightly workflows remain unchanged: Task 1, Step 4.
- No production secrets/data/schema/RLS/RPC/migration/seed changes are permitted: Global Constraints and Task 1, Step 4.
- The plan contains no unresolved implementation placeholders; all commands, file paths, env names, flags, and expected outcomes are explicit.
