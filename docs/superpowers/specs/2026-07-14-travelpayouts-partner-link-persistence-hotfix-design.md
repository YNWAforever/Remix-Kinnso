# Travelpayouts Partner-Link Persistence Hotfix Design

**Date:** 2026-07-14
**Status:** Approved
**Branch:** `codex/travelpayouts-persistence-hotfix`

## Context

Phase R7.2 regenerates `packages/db/types.ts` from the local migration history. That truthful generation removes `create_travelpayouts_partner_link`, because `20260618014206_drop_public_partner_link_rpc.sql` dropped the function. A later application commit restored the RPC call and manually restored its TypeScript type without adding a migration. The current app therefore compiles only against a stale type and calls a function that does not exist in the migrated schema.

The removed function accepted a caller-supplied partner URL. The replacement trigger deliberately rewrites authenticated inserts to a pending placeholder, so bypassing that trigger through a general authenticated write would undo a shipped trust boundary.

Section 7 of the product revision program is binding: user-facing money and state writes use audited `SECURITY DEFINER` RPCs, and the Stripe webhook is the sole documented service-role exception. This hotfix therefore must not persist partner links through the service-role client.

## Goals

- Restore a schema-backed, typed persistence path for Travelpayouts partner links.
- Keep the write behind an audited `SECURITY DEFINER` RPC callable only by authenticated users.
- Revalidate creator ownership and all active/published mission invariants inside the transaction.
- Reject off-domain or incorrectly attributed partner URLs.
- Preserve idempotent behavior for repeated link-generation requests.
- Make local type generation and the web typecheck agree without hand-editing generated types.
- Unblock Phase R7.2 without touching production Supabase from Codex.

## Non-goals

- No changes to creator copilot, settlement behavior, mission URLs, or unrelated mission flows.
- No service-role exception for the server action.
- No edits to shipped migrations.
- No production migration execution from this workspace.
- No Travelpayouts API redesign or credential change.

## Considered approaches

### 1. Audited authenticated RPC with stronger validation — selected

Create a new migration that restores the existing RPC signature, but strengthen it beyond the removed implementation. The function derives the expected SubID from authenticated ownership, accepts only HTTPS Travelpayouts short-link hosts, requires that URL to carry the expected SubID, revalidates mission/program state, and opens the trigger bypass only after every check passes.

This follows the binding state-write convention and keeps production activation as an explicit migration step.

### 2. Direct service-role insert — rejected

The repository already has a server-only service client, but using it here would create another service-role write exception and violate the binding Section 7 convention.

### 3. Ordinary authenticated insert — rejected

The existing trigger intentionally replaces authenticated partner-link values with a pending placeholder. Using that path would lose the generated URL and deterministic attribution SubID, breaking the immediate link experience and later event reconciliation.

## Architecture

### Application boundary

`createPartnerLinkAction` continues to authenticate the caller, load only their participant, validate mission/program state, and call the Travelpayouts API. Before invoking the database RPC, it canonicalizes the successful provider URL through a focused helper in `apps/web/lib/missions/travelpayouts.ts`:

- protocol must be `https:`;
- hostname must be `tp.st` or end in `.tp.st`;
- the helper sets exactly one `sub_id` query parameter to the deterministic `buildSubId(...)` result;
- malformed or off-domain provider responses are treated as provider failures and are never persisted.

The action then calls the restored `create_travelpayouts_partner_link` RPC with the canonical URL. Existing-link short-circuiting remains unchanged.

### Database boundary

A CLI-generated migration creates `public.create_travelpayouts_partner_link(uuid, uuid, uuid, text, text, text)` as `SECURITY DEFINER SET search_path = public`.

The function:

1. Requires `auth.uid()`.
2. Trims inputs and rejects empty values.
3. Recomputes the expected SubID as `kinnso_m_<mission>_p_<participant>_c_<creator>`, with UUID hyphens removed, and rejects any mismatch.
4. Requires an HTTPS original URL.
5. Requires the partner URL to use `tp.st` or a subdomain of `tp.st` and to contain the exact expected `sub_id` query value.
6. Joins participant, mission, and affiliate program rows to prove the authenticated creator owns an active participant in the requested published Travelpayouts mission with the requested active Travelpayouts program.
7. Returns an existing successful row for the same network, participant, creator, and original URL.
8. Sets a transaction-local trigger-bypass marker only after validation, inserts the successful provider result, and resolves a uniqueness race by returning the already-created row.

The migration updates `app_private.prepare_affiliate_partner_link_insert()` to honor that transaction-local marker while preserving the shipped service-role and authenticated-placeholder behavior for every other insert path. The bypass marker is not exposed through any general-purpose RPC.

Privileges are explicit:

- revoke all function privileges from `public` and `anon`;
- grant execute only to `authenticated`;
- do not add direct table write grants.

### Generated types

After a local reset applies the new migration, `packages/db/types.ts` is regenerated mechanically from the local schema. The function signature must be present because it now exists in migration history. No generated type is manually added or retained.

Supabase CLI 2.106.0 on Windows currently misroutes `gen types --local` through platform authentication. The implementation may use the same pinned package's official `supabase-go.exe` sidecar as a local-only generation workaround after recording the standard command failure. It must not use `--linked`, a project ID, or production credentials.

## Security properties

- A caller cannot write a link for another creator because ownership is derived from `auth.uid()` and rechecked in SQL.
- A caller cannot change the deterministic attribution SubID.
- A caller cannot store an arbitrary external or non-HTTPS redirect; persisted redirects are constrained to Travelpayouts short-link hosts.
- A caller cannot mark an arbitrary direct table insert as successful; the trigger bypass exists only inside the audited RPC transaction after validation.
- Repeated requests do not create duplicate attribution rows.
- The RPC does not expose Travelpayouts or Supabase secrets.

The remaining caller-controlled value is a Travelpayouts-hosted short-link path. That is an intentional, bounded input: it can affect only the authenticated creator's row in a validated mission, while the deterministic SubID preserves KINNSO attribution.

## Error handling

- Authentication and ownership/state failures raise controlled database errors and become the existing generic save error in the action.
- Invalid provider URLs fail before the RPC and use the existing Travelpayouts generation-error surface.
- Database insert or conflict-resolution failures never return an unpersisted link as successful.
- Detailed provider and persistence diagnostics remain server-side; secrets are never included in user-visible copy.

## Test strategy

### SQL contract tests

Add a focused migration contract test that verifies:

- exact function signature, security mode, and fixed search path;
- explicit revokes/grant;
- authenticated ownership and active-state joins;
- deterministic SubID derivation and comparison;
- HTTPS/`tp.st`/`sub_id` validation;
- trigger-bypass ordering;
- idempotent existing-row and uniqueness-race behavior.

### Local database integration tests

Using the local Supabase stack, prove:

- anon cannot execute the function;
- a creator cannot persist for another creator's participant;
- inactive or mismatched mission/program state is rejected;
- a wrong SubID, off-domain URL, or missing SubID query is rejected;
- a valid owner request inserts the canonical link;
- a duplicate request returns the existing row.

### Application tests

Update the Travelpayouts and mission-action tests to prove:

- canonicalization rejects HTTP and non-`tp.st` URLs;
- canonicalization replaces any existing `sub_id` with the deterministic value;
- unauthorized or invalid mission requests never call Travelpayouts or the RPC;
- successful generation calls the RPC with the canonical URL and expected SubID;
- RPC failures return the existing safe save error.

Run the focused suites, web typecheck, local type-generation verification, and `git diff --check` before review.

## Rollout and R7.2 handoff

The hotfix PR contains a new migration, so production activation requires an authorized operator to apply it. Codex remains read-only against production Supabase and will not run a linked push or migration command.

The application already calls the missing RPC today, so deploying the code-side URL hardening before the migration does not introduce a new production dependency. The operator migration restores persistence. After application, verification is limited to read-only schema/grant inspection plus safe application smoke checks.

Once the hotfix is squash-merged, Phase R7.2 is rebased or rebuilt on the new `main`. Its local reset then applies both the hotfix migration and the R7.2 feature-interest migration, type generation includes both RPCs truthfully, and Task 2 resumes from a clean focused-test and typecheck baseline.
