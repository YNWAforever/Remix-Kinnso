# Deterministic Pre-merge CI Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]).

**Goal:** Make the existing CI quality gate execute for the exact branch head on pull requests, codex/** push fallbacks, and manual dispatches while preserving the established main-branch validation path.

**Architecture:** Keep .github/workflows/ci.yml as the only quality workflow. Add explicit event triggers, read-only workflow permissions, and event/ref-scoped concurrency at the workflow level; gate the existing E2E job so only pull-request and main-branch events run it. Leave the existing quality steps, public-only build environment, safe product flags, and full test ordering intact.

**Tech Stack:** GitHub Actions, GitHub-hosted Ubuntu runners, actions/checkout@v4, pnpm/action-setup@v4, Node.js 22, Supabase CLI 2.106.0, pnpm 11.6.0, Turborepo, Next.js, TypeScript, Bash, PowerShell, and GitHub CLI.

## Global Constraints

- The canonical pull-request trigger uses opened, synchronize, reopened, and ready_for_review event types.
- The push fallback is limited to branches matching codex/**; the existing main push trigger remains enabled.
- workflow_dispatch runs the quality job and does not start E2E.
- The existing pull-request and main push E2E behavior remains active.
- The workflow uses permissions: contents: read and event/ref-scoped concurrency.
- The quality job remains the single source of typecheck, lint, honesty lint, local Supabase setup, public-only web build environment, web build, and full test execution.
- apps/web/.env.local contains only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY; the service-role value remains confined to the existing test environment files.
- The public build environment reuses the already-exported test environment, rejects malformed or blank public-source entries before moving the temporary file into place, ignores unrelated valid Supabase status variables, and does not invoke `supabase status` a second time.
- The web build runs with AGENT_LIVE=false and BOOKING_LIVE=false before pnpm test.
- No application source, authorization behavior, schema, migration, RLS policy, RPC, seed, production data, deployment workflow, GitHub setting, branch-protection rule, secret, or paid provider configuration changes.
- Do not create a second quality workflow or modify .github/workflows/verify.yml or .github/workflows/nightly-funnel.yml.
- Generated environment files are ephemeral and are not printed, committed, or uploaded as artifacts.
- Local checks use pnpm.cmd on Windows; remote checks use read-only GitHub CLI queries except for the approved branch push and optional workflow dispatch.
- Completion requires a registered CI quality job for the exact branch head with every quality step successful; a skipped E2E job is expected only for push fallback or manual runs.

---

## File Map

Modify only:

- .github/workflows/ci.yml — declare deterministic triggers and concurrency, set read-only permissions, and route E2E by event while preserving the existing quality job.

Review only:

- .github/workflows/verify.yml — confirm it remains outside the implementation scope.
- .github/workflows/nightly-funnel.yml — confirm it remains outside the implementation scope.

Create only the implementation-plan document during planning:

- docs/superpowers/plans/2026-08-08-deterministic-ci-execution.md — this plan; it is not part of the workflow change.

No application, database, dependency, test-source, or deployment files are expected to change.

## Task 1: Add the deterministic workflow event contract

**Files:**
- Modify: .github/workflows/ci.yml:1-7

**Interfaces:**
- Consumes: GitHub Actions event context for pull requests, branch pushes, and manual dispatches.
- Produces: a single CI workflow with explicit PR event types, main and codex/** push triggers, a manual entry point, read-only contents permission, and event/ref-scoped concurrency.

- [ ] Step 1: Write and run the pre-change trigger contract check.

Run this PowerShell check before editing the workflow:

~~~powershell
$workflow = (Get-Content -Raw -LiteralPath '.github/workflows/ci.yml') -replace "`r`n", "`n"

if ($workflow.Contains("      - 'codex/**'")) {
  throw 'The pre-change workflow unexpectedly already contains the codex push fallback.'
}

Write-Output 'EXPECTED_FAIL: codex push fallback is absent'
exit 1
~~~

Expected: the command exits 1 and prints EXPECTED_FAIL: codex push fallback is absent. This establishes the missing trigger behavior before the workflow edit.

- [ ] Step 2: Replace the workflow header with the approved event and control contract.

Replace the current name/on header with this exact block, leaving the jobs section and all existing quality steps unchanged:

~~~yaml
name: CI

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches:
      - main
      - 'codex/**'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.event_name }}-${{ github.event.pull_request.head.ref || github.ref_name }}
  cancel-in-progress: true
~~~

The github.event_name segment keeps a pull-request run separate from a push fallback for the same branch. The pull-request head ref is preferred when available; github.ref_name supplies the branch or manual-dispatch ref for other events.

- [ ] Step 3: Run the workflow diff check for the header change.

Run:

~~~powershell
git diff --check
git diff --unified=0 -- .github/workflows/ci.yml
~~~

Expected: no whitespace errors; the diff contains only the top-level trigger, permission, and concurrency changes; the existing quality and e2e step bodies are unchanged.

- [ ] Step 4: Commit the event-contract change.

Run:

~~~powershell
git add -- .github/workflows/ci.yml
git commit -m "ci: harden deterministic workflow triggers"
~~~

Expected: one commit containing only .github/workflows/ci.yml; pre-existing untracked .superpowers/sdd/ review artifacts remain unstaged.

## Task 2: Route E2E execution by event

**Files:**
- Modify: .github/workflows/ci.yml at the e2e job declaration

**Interfaces:**
- Consumes: the event names and refs exposed by the Task 1 workflow contract, plus the existing quality job result.
- Produces: E2E runs for pull requests and main pushes; E2E skips for codex/** push fallbacks and workflow_dispatch while quality still runs.

- [ ] Step 1: Locate the E2E job declaration before editing.

Run:

~~~powershell
rg -n -A5 -B2 '^  e2e:' .github/workflows/ci.yml
~~~

Expected: the output shows e2e, runs-on, and needs: quality without an event condition.

- [ ] Step 2: Add the event condition to the E2E job.

Change the job header to this exact block and leave every E2E step below it unchanged:

~~~yaml
  e2e:
    if: ${{ github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}
    runs-on: ubuntu-latest
    needs: quality
~~~

This condition allows all declared pull-request event types and the existing main push path. It skips the codex/** push fallback and manual dispatch before any E2E runner, Supabase stack, fixture, or artifact step starts.

- [ ] Step 3: Verify the event-routing diff.

Run:

~~~powershell
git diff --check
git diff --unified=0 -- .github/workflows/ci.yml
~~~

Expected: the only new job-level condition is the exact E2E event expression; no quality step, E2E step, or other workflow file changes appear.

- [ ] Step 4: Commit the E2E routing change.

Run:

~~~powershell
git add -- .github/workflows/ci.yml
git commit -m "ci: route e2e by workflow event"
~~~

Expected: one commit containing only .github/workflows/ci.yml.

## Task 3: Run the complete local workflow contract and source checks

**Files:**
- Review: .github/workflows/ci.yml
- Review: .github/workflows/verify.yml
- Review: .github/workflows/nightly-funnel.yml
- No file changes.

**Interfaces:**
- Consumes: the two committed workflow edits and the existing public-only web build gate.
- Produces: local evidence that trigger routing, permissions, concurrency, env allow-listing, safe flags, and build/test ordering match the approved design.

- [ ] Step 1: Run the full structural CI contract check.

Run:

~~~powershell
$path = '.github/workflows/ci.yml'
$workflow = (Get-Content -Raw -LiteralPath $path) -replace "`r`n", "`n"

$requiredHeader = @'
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches:
      - main
      - 'codex/**'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.event_name }}-${{ github.event.pull_request.head.ref || github.ref_name }}
  cancel-in-progress: true
'@
$requiredHeader = $requiredHeader.Trim() -replace "`r`n", "`n"

if (-not $workflow.Contains($requiredHeader)) {
  throw 'The top-level CI event, permission, or concurrency contract is incorrect.'
}

$requiredE2eHeader = @'
  e2e:
    if: ${{ github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}
    runs-on: ubuntu-latest
    needs: quality
'@
$requiredE2eHeader = $requiredE2eHeader.Trim() -replace "`r`n", "`n"

if (-not $workflow.Contains($requiredE2eHeader)) {
  throw 'The E2E event-routing condition is incorrect.'
}

$publicStart = $workflow.IndexOf('      - name: Export local Supabase env for web build', [StringComparison]::Ordinal)
$publicEnd = $workflow.IndexOf('      - name: Check web build environment', [StringComparison]::Ordinal)
if ($publicStart -lt 0 -or $publicEnd -le $publicStart) {
  throw 'The public-only web build environment steps are missing or out of order.'
}

$publicSection = $workflow.Substring($publicStart, $publicEnd - $publicStart)
foreach ($fragment in @(
  'apps/web/.env.test',
  '$1 == "SUPABASE_URL"',
  '$1 == "SUPABASE_ANON_KEY"',
  '$1 == "SUPABASE_SERVICE_ROLE_KEY" { next }',
  'NEXT_PUBLIC_SUPABASE_URL=',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
  'index($0, "=") == 0 { exit 1 }',
  'substr($0, index($0, "=") + 1) !~ /[^[:space:]]/',
  '                { next }'
)) {
  if (-not $publicSection.Contains($fragment)) {
    throw "Missing public-env safety fragment: $fragment"
  }
}

if ($publicSection.Contains('pnpm -s supabase status -o env')) {
  throw 'The public web build environment must reuse the validated test env instead of querying Supabase status again.'
}

if ($publicSection.Contains('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')) {
  throw 'The public web build environment contains a service-role value.'
}

foreach ($fragment in @(
  "AGENT_LIVE: 'false'",
  "BOOKING_LIVE: 'false'",
  'run: pnpm --filter web build',
  'run: pnpm test'
)) {
  if (-not $workflow.Contains($fragment)) {
    throw "Missing quality-job fragment: $fragment"
  }
}

$buildIndex = $workflow.IndexOf('run: pnpm --filter web build', [StringComparison]::Ordinal)
$testIndex = $workflow.IndexOf('run: pnpm test', [StringComparison]::Ordinal)
if ($buildIndex -ge $testIndex) {
  throw 'The web build must appear before the full test suite.'
}

Write-Output 'CI_CONTRACT_OK'
~~~

Expected: the command exits 0 and prints CI_CONTRACT_OK. It must not print any environment values.

- [ ] Step 2: Run focused public-env regression harnesses against the same awk logic.

Run:

~~~powershell
$workflow = (Get-Content -Raw -LiteralPath '.github/workflows/ci.yml') -replace "`r`n", "`n"
$match = [regex]::Match(
  $workflow,
  "(?s)awk -F= '(?<script>.*?)'\s+apps/web/\.env\.test\s+>\s+"
)

if (-not $match.Success) {
  throw 'Unable to extract the public-only awk guard from .github/workflows/ci.yml.'
}

$awkScript = ($match.Groups['script'].Value -replace "\n                ", "`n").Trim()
$inputPath = Join-Path $env:TEMP 'kinnso-public-env-blank-input.txt'
$scriptPath = Join-Path $env:TEMP 'kinnso-public-env-guard.awk'
$outputPath = Join-Path $env:TEMP 'kinnso-public-env-blank-output.txt'
$awkPath = (Get-Command awk -ErrorAction SilentlyContinue).Source

if (-not $awkPath) {
  $awkPath = 'C:\Program Files\Git\usr\bin\awk.exe'
}

if (-not (Test-Path -LiteralPath $awkPath)) {
  throw 'Unable to locate awk for the blank-value regression harness.'
}

[System.IO.File]::WriteAllLines($inputPath, @(
  'SUPABASE_URL=   '
  'SUPABASE_ANON_KEY=token=='
  'SUPABASE_SERVICE_ROLE_KEY=service-token=='
), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($scriptPath, $awkScript, [System.Text.UTF8Encoding]::new($false))
if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath
}

& $awkPath '-F=' '-f' $scriptPath $inputPath > $outputPath
if ($LASTEXITCODE -eq 0) {
  throw 'The blank-value regression unexpectedly passed.'
}

if ((Test-Path -LiteralPath $outputPath) -and ((Get-Item -LiteralPath $outputPath).Length -ne 0)) {
  throw 'The blank-value regression wrote filtered output unexpectedly.'
}

Write-Output 'BLANK_VALUE_REJECTED'
~~~

Expected: the command exits 0 and prints BLANK_VALUE_REJECTED after awk rejects the whitespace-only source URL value without writing a promoted env file.

- [ ] Step 3: Run the available web typecheck.

Run:

~~~powershell
pnpm.cmd --filter web typecheck
~~~

Expected: exit code 0. This checks the existing application source without requiring the CI runner's Docker-backed local Supabase stack.

- [ ] Step 4: Run the available web lint.

Run:

~~~powershell
pnpm.cmd --filter web lint
~~~

Expected: exit code 0 with no lint errors; any warnings must match the repository's existing baseline.

- [ ] Step 5: Verify tracked file boundaries and whitespace.

Run:

~~~powershell
git diff --check
git status --short -- .github/workflows/ci.yml .github/workflows/verify.yml .github/workflows/nightly-funnel.yml
git diff --name-only HEAD~2..HEAD
~~~

Expected: the working tree has no tracked workflow changes after the two implementation commits; the two-commit range lists only .github/workflows/ci.yml; the post-deploy and nightly workflow paths are absent from the range.

## Task 4: Verify the exact-head CI quality run remotely

**Files:**
- Review: .github/workflows/ci.yml
- Review: PR 106 in YNWAforever/Remix-Kinnso
- No file changes.

**Interfaces:**
- Consumes: the pushed branch head and GitHub Actions workflow registration.
- Produces: exact-SHA evidence for the CI workflow, the quality job, all quality steps, and the event-appropriate E2E result.

- [ ] Step 1: Confirm the branch head and push the repository-only workflow change.

Run:

~~~powershell
git status --short --branch
git log --oneline --decorate --max-count=5
git push origin codex/ops-authorization-context
~~~

Expected: the branch is codex/ops-authorization-context, the workflow commits are present, and the remote branch points to the local HEAD. Do not push another branch or merge into main.

- [ ] Step 2: Query Actions runs registered for the exact head SHA.

Run:

~~~powershell
$repo = 'YNWAforever/Remix-Kinnso'
$headSha = (git rev-parse HEAD).Trim()
$runs = @(gh run list --repo $repo --workflow CI --commit $headSha --limit 20 --json databaseId,headSha,event,status,conclusion,url | ConvertFrom-Json)

$runs | Format-Table databaseId, headSha, event, status, conclusion, url

if (-not ($runs | Where-Object { $_.headSha -eq $headSha })) {
  throw "No CI run registered for exact head $headSha."
}
~~~

Expected: at least one CI run has headSha equal to the local HEAD. A PR event is the canonical result; a push event for codex/** is the repository-controlled fallback.

- [ ] Step 3: Wait for the exact-head quality run and inspect every quality step.

Re-query the newest exact-head CI run and inspect it:

~~~powershell
$repo = 'YNWAforever/Remix-Kinnso'
$headSha = (git rev-parse HEAD).Trim()
$run = @(gh run list --repo $repo --workflow CI --commit $headSha --limit 20 --json databaseId,headSha,event,status,conclusion,url | ConvertFrom-Json) |
  Where-Object { $_.headSha -eq $headSha } |
  Sort-Object -Property databaseId -Descending |
  Select-Object -First 1

if (-not $run) {
  throw "No exact-head CI run is available for $headSha."
}

$runId = [string]$run.databaseId
gh run watch $runId --repo $repo --exit-status
gh run view $runId --repo $repo --json jobs --jq '.jobs[] | select(.name == "quality") | {name, status, conclusion, steps: [.steps[] | {name, status, conclusion}]}'
gh pr checks 106 --repo YNWAforever/Remix-Kinnso
~~~

Expected: the quality job conclusion is success, and these steps each have a successful conclusion: dependency install, typecheck, lint, honesty lint, Supabase CLI setup, local Supabase start, fixture cleanup, test env export, public web build env export, build env check, safe web build, and the full test suite. The PR check rollup shows the pre-merge CI quality check for the same head.

For a push or workflow_dispatch run, the E2E job is expected to be skipped by the event condition. For a pull-request run, the existing E2E path remains expected to run after quality succeeds.

- [ ] Step 4: Use the manual dispatch fallback only when no exact-head run registered.

If Step 2 finds no exact-head CI run after the branch push, run the approved repository-controlled dispatch:

~~~powershell
$repo = 'YNWAforever/Remix-Kinnso'
$branch = 'codex/ops-authorization-context'
$headSha = (git rev-parse HEAD).Trim()
gh workflow run .github/workflows/ci.yml --repo $repo --ref $branch
gh run list --repo $repo --workflow CI --branch $branch --limit 20 --json databaseId,headSha,event,status,conclusion,url | ConvertFrom-Json | Format-Table databaseId, headSha, event, status, conclusion, url
~~~

Expected: the dispatched run registers against the current branch head and is evaluated using the Step 3 quality-job checks. This does not change repository settings, branch protection, secrets, production data, or deployment state.

- [ ] Step 5: Classify a missing or failed gate without bypassing it.

If no PR, push-fallback, or manual run registers for the exact SHA, record:

~~~powershell
$headSha = (git rev-parse HEAD).Trim()
gh api "repos/YNWAforever/Remix-Kinnso/actions/runs?head_sha=$headSha&per_page=100"
gh pr view 106 --repo YNWAforever/Remix-Kinnso --json headRefName,headRefOid,url,statusCheckRollup
~~~

Expected: the handoff identifies the exact SHA, workflow query, PR head SHA, and absent CI check as an external Actions registration, permission, or provider gate. Do not add credentials, mutate production state, merge, or claim a passed quality gate. If a registered quality step fails, preserve its job log and return to the workflow source rather than treating a skipped or unrelated check as success.

## Spec Coverage Self-Review

- Explicit PR event types, codex/** push fallback, main preservation, manual dispatch, read-only permissions, and event/ref concurrency are covered by Task 1.
- E2E behavior for pull requests, main pushes, codex/** pushes, and manual dispatches is covered by Task 2 and Task 4, Step 3.
- The existing quality sequence, public-only env allow-list, malformed-output rejection, nonblank public-value rejection, safe flags, and build-before-test ordering are checked by Task 3, Steps 1-2.
- Local typecheck, lint, whitespace, and workflow-boundary checks are covered by Task 3, Steps 3-5.
- Exact-head CI registration, quality-job success, PR check evidence, and missing-run classification are covered by Task 4.
- The repository-only boundary and all excluded production, database, deployment, secret, and settings changes are enforced by the Global Constraints and Task 4, Step 5.
- The plan contains concrete paths, commands, workflow fragments, expected outputs, and commit messages for every implementation action.
