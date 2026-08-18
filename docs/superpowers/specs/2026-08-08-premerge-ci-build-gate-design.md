# Pre-merge CI Web Build Gate Design

Date: 2026-08-08
Status: Design approved in conversation; awaiting written-spec review
Scope: Kinnso pre-merge CI quality job

## Problem

The repository's `quality` job already starts a local Supabase stack, exports an
`.env.test` for the full test suite, and runs typecheck, lint, honesty lint, and
tests. It does not run the Next.js production build. The web build validates
public Supabase configuration at `next.config.ts` load time, so a local
worktree without provider configuration cannot currently reproduce that gate.

The post-deploy `verify.yml` workflow validates production or a manually
provided target, but it is intentionally not a pre-merge build gate. The next
phase adds the missing pre-merge build check without introducing production
credentials, live AI calls, live booking behavior, migrations, or data writes.

## Goal

Make the existing CI quality job prove that the web application can perform a
production build using an ephemeral local Supabase stack and safe, secret-free
feature flags.

The gate must:

- run on every pull request through the existing `quality` job;
- reuse the local Supabase stack already created by CI;
- provide only public local Supabase URL and anon-key values to Next.js;
- build with `AGENT_LIVE=false` and `BOOKING_LIVE=false`;
- fail closed when required generated environment values are absent;
- preserve the existing full test setup and ordering;
- leave post-deploy verification, schema, RLS, migrations, RPCs, seeds,
  production data, and production secrets unchanged.

## Non-goals

- Do not add or rotate GitHub, Supabase, AI Gateway, Stripe, or Vercel
  secrets.
- Do not run a live AI or Stripe integration in CI.
- Do not make `verify.yml` a pre-merge workflow.
- Do not change application authorization behavior or runtime product flags.
- Do not modify migrations, RLS policies, RPCs, seed data, or deployment
  configuration.
- Do not make local developers copy a secret-bearing `.env.test` into a
  worktree.

## Architecture and data flow

The existing `.github/workflows/ci.yml` `quality` job remains the single
orchestration boundary:

1. Install dependencies and run the existing static checks.
2. Start the local Supabase stack.
3. Perform the existing fixture cleanup.
4. Export the existing test environment to `apps/web/.env.test`,
   `packages/sync/.env.test`, and `apps/scan/.env.test`.
5. Export a separate web-build environment to `apps/web/.env.local` using only
   the local public Supabase URL and anon key. Next.js loads this file during
   `next build`; the build does not depend on `.env.test` or on cross-step shell
   exports.
6. Check that the two expected public variable names exist without printing
   their values.
7. Run the web build with `AGENT_LIVE=false` and `BOOKING_LIVE=false`.
8. Run the existing `pnpm test` command, which continues to consume the
   generated `.env.test` files.

The existing `validateBuildEnv()` function remains the application-level
contract. The workflow-level presence check catches an incorrectly generated
file before Next.js starts and keeps the failure message local to the CI
setup step.

## Components and boundaries

### `.github/workflows/ci.yml`

Add the build environment export, non-secret presence check, and blocking web
build to the existing `quality` job. The Supabase CLI override names should
produce only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The service-role value remains confined to the existing test environment
generation for integration tests and is not written to the build environment.

The build step receives these explicit flags:

```text
AGENT_LIVE=false
BOOKING_LIVE=false
```

This prevents the default live-agent path from requiring `AI_GATEWAY_API_KEY`
and keeps booking integrations disabled. No `VERCEL=1` emulation is needed.

### Existing application validation

No application source change is required. `apps/web/next.config.ts` already
calls `validateBuildEnv()`, which validates the public Supabase URL and anon
key and conditionally validates live product integrations. The new workflow
feeds that contract with ephemeral local values and safe flags.

### Existing post-deploy workflows

`.github/workflows/verify.yml` and `.github/workflows/nightly-funnel.yml` remain
unchanged. They retain responsibility for production or explicitly targeted
post-deploy verification.

## Failure handling

The new steps are blocking and fail closed:

| Failure | Result |
| --- | --- |
| Local Supabase startup fails | `quality` stops before env export |
| Public build env cannot be generated | `quality` stops before build |
| Required public variable is absent | Presence check fails without printing values |
| `next build` fails | `quality` stops and does not run the broader tests |
| Existing `pnpm test` fails | `quality` reports the test failure independently |

Generated env files live only on the ephemeral GitHub runner and are not
uploaded as artifacts. No step logs their contents.

## Verification and acceptance criteria

### Workflow verification

- Review the workflow diff for YAML validity and correct job ordering.
- Confirm the build step is part of the pull-request-triggered `quality` job.
- Confirm `verify.yml` and `nightly-funnel.yml` are unchanged.
- Confirm no secret values or production endpoints are introduced.
- Run `git diff --check` and the repository's available workflow/lint checks.

### Runtime CI acceptance

- A pull-request CI run starts local Supabase and reaches the web build.
- The web build passes with both live product flags disabled.
- Removing either generated public variable causes the explicit env check or
  existing `validateBuildEnv()` call to fail.
- The existing full test suite still runs with its generated `.env.test`
  values after a successful build.
- CI never requires `AI_GATEWAY_API_KEY`, Stripe credentials, or production
  Supabase credentials for this pre-merge gate.

### Local validation

Local focused checks may use only non-secret placeholders in the same process.
Live integration tests and a full local build remain provider/environment
gated when the developer does not have a local Supabase stack. That limitation
does not weaken the CI gate, because CI owns and provisions its ephemeral
Supabase stack.

## Expected change set

The implementation should modify only:

- `.github/workflows/ci.yml`

No new dependency, application source, database, or production configuration
file is expected.

## Rollback

Rollback is a single revert of the CI workflow commit. It removes the pre-merge
build step while leaving application code, database state, and post-deploy
verification unchanged.
