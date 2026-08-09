# Mission Partner-Link Orchestration Design

**Status:** Approved design; implementation has not started

**Date:** 2026-08-09

**Worktree:** `codex/ops-authorization-context`

## Summary

Deepen the mission partner-link creation path into a focused command module. The existing Server Action remains the transport adapter. A pure command owns the mission workflow, a Supabase-backed store adapter owns persistence and database reads, and a Travelpayouts adapter owns provider-specific link generation and returned-URL canonicalization.

The first slice is intentionally limited to `createPartnerLinkAction`. It establishes a real seam without broadening into mission creation, participation, reviews, submissions, settlements, migrations, RLS, queues, or retries.

## Context and evidence

The current path is concentrated in `apps/web/lib/missions/actions.ts:598-715`. `createPartnerLinkAction` is 118 lines with cognitive complexity 17 and 12 outgoing calls in the source graph. It currently coordinates:

- authenticated-user lookup and participant ownership;
- mission and affiliate-program state reads;
- request validation and successful-link idempotency;
- deterministic Travelpayouts SubID construction;
- external partner-link generation and URL canonicalization;
- persistence through `create_travelpayouts_partner_link`;
- locale-aware revalidation and user-facing error mapping.

The surrounding seams are already real:

- `apps/web/lib/missions/travelpayouts.ts` contains provider-specific request, response, configuration, SubID, and URL-safety logic;
- the existing RPC re-validates ownership and active mission/program state before inserting;
- `apps/web/tests/mission.travelpayouts.test.ts` covers provider behavior and safety constraints;
- `apps/web/tests/db.travelpayouts-partner-link-rpc.test.ts` covers the database contract;
- `apps/web/tests/mission.actions.test.ts` covers the current Server Action contract with Supabase and provider mocks.

The architecture goal is locality: the command should be understandable without reading the Server Action or the provider implementation. Its interface should be the test surface.

## Goals

1. Make partner-link workflow rules local to one deep mission command module.
2. Keep Supabase and Travelpayouts side effects behind explicit adapters.
3. Preserve the current public Server Action contract and behavior.
4. Make idempotency, ownership, state validation, provider failure, and persistence failure directly testable.
5. Preserve the database RPC and RLS as final enforcement layers.

## Non-goals and constraints

- Do not change the `createPartnerLinkAction` input or `ActionResult` output shape.
- Do not change role precedence, authentication semantics, or introduce `getAuthorizationContext` into this creator-participation path.
- Do not change `create_travelpayouts_partner_link`, RLS, migrations, schema, seeds, or production data.
- Do not add retries, queues, external compensation/deletion, or a new concurrency policy. Preserve the current check-before-save behavior.
- Do not migrate the other mission actions in this slice.
- Do not create a generic repository or action framework. The store and provider seams exist because both are concrete side-effect adapters for this workflow.
- Preserve current messages, including the provider failure message and the save-failure message, without exposing credentials.

## Proposed architecture

### 1. Mission partner-link command module

Create `apps/web/lib/missions/partner-link-command.ts` as the deep module. It accepts an explicit actor, the existing command input, a partner-link store, and a partner-link provider.

The command owns this sequence:

1. Load the participant, mission, affiliate program, and existing successful-link context through the store.
2. Enforce creator ownership and mission/program state using the existing failure semantics.
3. Run `validatePartnerLinkRequest` for active program, active participant, and absolute HTTPS URL rules.
4. Return an existing successful link before contacting Travelpayouts.
5. Build the deterministic SubID from mission, participant, and creator IDs.
6. Ask the provider to create and canonicalize a partner URL.
7. Ask the store to persist through the existing RPC.
8. Return a typed `created`, `reused`, or failure outcome.

The command must not import Next.js, React, `next/cache`, environment variables, or the Supabase client. It may reuse the existing pure mission validation and domain types.

### 2. Supabase partner-link store adapter

Create `apps/web/lib/missions/partner-link-store.ts` as the Supabase adapter. It wires the existing Supabase client to the command's store contract and preserves the current query order and filters:

- participant lookup constrained by `mission_participant_id` and `creator_id`;
- mission lookup constrained by the participant mission ID;
- affiliate-program lookup constrained by the mission program ID;
- existing-successful-link lookup constrained by network, mission, participant, creator, original URL, and `external_status = 'success'`;
- save through `create_travelpayouts_partner_link` with the current argument values.

The adapter translates database outcomes into the command's typed context and persistence failures. The RPC remains authoritative for ownership and active-state revalidation.

### 3. Travelpayouts partner-link adapter

Create a thin adapter around the existing functions in `apps/web/lib/missions/travelpayouts.ts`. It supplies the command's provider contract while retaining:

- `buildSubId` and UUID-hyphen removal;
- `createTravelpayoutsPartnerLinks` configuration and request behavior;
- `canonicalizeTravelpayoutsPartnerUrl` host, protocol, credential, port, fragment, and SubID checks;
- the current safe provider failure reason behavior.

No duplicate provider implementation should be introduced.

### 4. Server Action adapter

Modify `apps/web/lib/missions/actions.ts` so `createPartnerLinkAction` remains responsible for:

- obtaining the authenticated user once;
- creating/wiring the Supabase and Travelpayouts adapters;
- invoking the command;
- mapping the command outcome to the existing `ActionResult` shape;
- revalidating the locale-aware Studio missions path only for a newly created link, preserving the current early return for a reused link.

## Data flow

```text
createPartnerLinkAction
  -> authenticated actor + CreatePartnerLinkInput
  -> createPartnerLinkCommand
  -> SupabaseStore.loadContext
  -> validate ownership, state, and URL
  -> existing successful link?
       yes -> reused outcome -> existing ActionResult
       no  -> TravelpayoutsProvider.create
             -> SupabaseStore.saveViaExistingRpc
             -> created outcome -> revalidate -> existing ActionResult
```

The command does not authenticate independently. This avoids duplicate auth reads and avoids changing the current rule that an active mission participant who owns the participant row is the actor for this operation.

## Outcome and error policy

The internal command result distinguishes:

- `reused`: an existing successful partner link was returned and the provider was not called;
- `created`: the provider returned a valid canonical URL and persistence succeeded;
- validation failure: field-level errors from the existing validation contract;
- domain/persistence failure: a typed failure that maps to the current form-error message.

The following behavior is preserved:

| Condition | Existing user-facing result | Side effects |
| --- | --- | --- |
| No authenticated actor | `Sign in is required` | No store/provider call |
| Participant unavailable | `Participant was not found` | No provider call |
| Mission unavailable | `Mission is not available` | No provider call |
| Program unavailable | `Affiliate program is not available` | No provider call |
| Invalid request | Existing field-level errors | No provider call |
| Successful link exists | Existing link result | No provider call, no revalidation |
| Provider returns no usable link | Current Travelpayouts failure message | No persistence call |
| Provider throws | Current safe Travelpayouts failure message | No persistence call |
| Existing RPC fails or returns no row | `Partner link could not be saved` | No success result |

If the provider succeeds and persistence fails, the command reports the persistence failure. The first slice does not add external rollback or retry behavior because those are separate durability decisions.

## File plan

Create:

- `apps/web/lib/missions/partner-link-command.ts`
- `apps/web/lib/missions/partner-link-store.ts`
- `apps/web/lib/missions/partner-link-provider.ts`
- `apps/web/tests/mission.partner-link-command.test.ts`
- `apps/web/tests/mission.partner-link-store.test.ts` if the adapter contract needs isolated coverage after extraction.

Modify:

- `apps/web/lib/missions/actions.ts`
- `apps/web/tests/mission.actions.test.ts`

Keep unchanged and active:

- `apps/web/lib/missions/travelpayouts.ts`
- `apps/web/lib/missions/validation.ts`
- `apps/web/tests/mission.travelpayouts.test.ts`
- `apps/web/tests/mission.validation.test.ts`
- `apps/web/tests/db.travelpayouts-partner-link-rpc.test.ts`

The implementation plan may collapse the provider adapter into an existing provider module if doing so keeps a real seam and avoids a shallow file. It must not remove the two concrete adapter responsibilities.

## Testing and verification

### Command tests

Use fakes for the store and provider. Cover:

- participant, mission, and program failures;
- validation short-circuiting;
- successful-link reuse and provider non-invocation;
- deterministic SubID passed to the provider;
- provider failure and no persistence;
- provider success and exact store save input;
- persistence failure;
- `created` versus `reused` outcomes.

### Adapter and action tests

- Preserve provider contract coverage in `mission.travelpayouts.test.ts`.
- Preserve RPC contract coverage in `db.travelpayouts-partner-link-rpc.test.ts`.
- Update `mission.actions.test.ts` to verify actor wiring, public result compatibility, and revalidation behavior without re-testing every command branch through Supabase mocks.

### Verification gates

Run focused mission command/provider/action tests, TypeScript typecheck, lint, and `git diff --check`. Run the broader web suite/build only when the existing Supabase environment gate is available; report environment blockers separately from source regressions.

## Acceptance criteria

1. `createPartnerLinkAction` preserves its current input/output and user-facing failure behavior.
2. The command module contains the workflow and has no framework, database, or environment imports.
3. Supabase persistence and Travelpayouts integration are explicit adapters.
4. Existing successful links never trigger a provider call.
5. The existing RPC remains the persistence and final authorization enforcement path.
6. Focused tests cover the command's outcome matrix and existing provider/RPC contracts remain green.
7. No unrelated mission action or database behavior changes.
