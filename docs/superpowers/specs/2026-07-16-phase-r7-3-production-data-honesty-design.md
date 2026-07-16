# Phase R7.3: Production Data Honesty Design

**Status:** Approved design, pending implementation plan  
**Date:** 2026-07-16  
**Scope:** KINNSO Phase R7.3 — production data honesty

## Goal

Make every public media asset, popularity signal, creator listing, article, author attribution, and outbound link defensible from production data. The work removes known demo artifacts, prevents them from returning, and preserves existing public URLs and user actions.

This design is governed by the Phase R7 UX Hardening specification and by the conventions in §7 of `2026-07-02-product-revision-program-design.md`. Existing migration files are immutable. New database changes must be generated as new migrations and production remains read-only during implementation.

## Ground Truth

| Surface | Verified production state | Design consequence |
| --- | --- | --- |
| Guide saves | `guide_saves` has 0 rows, while eight guides expose 1,891 aggregate saves | Recompute counters from the join table and hide numeric totals publicly |
| Creator directory | `public.creators` contains an active public creator with no published guide | Require a published guide unless an operator explicitly lists the creator |
| Guide media | All 10 guide cover URLs use `picsum.photos`; `guides.cover_url` is `NOT NULL` | Make the column nullable, clear demo URLs, and render deterministic placeholders |
| Other media | Experiences and merchants lack cover/logo media; article media uses `cdn.kinnso.ai` | Support missing media consistently and allow only the verified CDN host |
| Published articles | All four published article fixtures fail the new depth threshold; one uses Jane Doe | Unpublish them through an idempotent cleanup migration |
| Article writes | Article persistence is owned by `packages/sync`; no web publication action exists | Enforce publication honesty at the sync transform boundary |
| Merchant links | Merchant websites can contain reserved example domains | Share one external-link rule between sync validation and cleanup |
| Creator permissions | `authenticated` currently has broad table-level update privileges on `creators` | Protect the listing override independently of UI and RPC authorization |

## Constraints

- Do not change frozen content URLs.
- Do not edit or replace shipped migrations.
- Do not modify the creator copilot.
- Do not invent code paths, table names, or components; implementation planning must discover each reference in the repository first.
- Do not write to production Supabase from this phase's development workflow.
- Preserve save and unsave behavior even though public numeric totals are removed.
- Keep direct creator profiles available when the profile is otherwise public; directory eligibility is not a profile-access rule.

## Architecture

R7.3 establishes five shared honesty boundaries:

1. `EntityMedia` decides whether a stored media URL is approved and delegates missing or unapproved media to `MediaPlaceholder`.
2. A creator eligibility helper supplies both the public directory and creator sitemap.
3. An audited, operator-only RPC owns the zero-guide listing override, with a database guard preventing direct owner updates.
4. The sync transform validates publication eligibility before article persistence and downgrades invalid published input to draft.
5. A permanent honesty lint plus rendered smoke coverage prevents known demo tokens from re-entering public output.

These boundaries centralize policy while leaving existing route ownership and content URLs intact.

## Media Honesty

### Shared rendering

`MediaPlaceholder` renders a deterministic KINNSO brand gradient derived from a normalized entity title and city or destination. It includes the entity name and, when available, destination text so missing media remains legible and intentional rather than looking broken.

`EntityMedia` accepts the entity media URL and placeholder inputs. It renders `next/image` only for a valid HTTPS URL on an explicitly approved host. For R7.3, `cdn.kinnso.ai` is the verified remote host and must be configured in `next.config.ts` through `images.remotePatterns`. A missing, malformed, insecure, or unapproved URL renders `MediaPlaceholder`; it must never be passed to the image optimizer.

All public guide, article, creator, merchant, and experience surfaces discovered during implementation planning use the shared renderer, including cards and details. Raw image tags on those surfaces are replaced where they represent entity media.

### Data cleanup

The structural migration makes `guides.cover_url` nullable. The cleanup migration then sets known `picsum.photos` guide covers to `NULL`. It does not replace them with another fabricated URL. Real approved uploaded media remains unchanged.

## Save Honesty

`guides.saves_count` remains a denormalized internal counter maintained by the existing `guide_saves` insert/delete triggers. The structural migration recomputes every guide counter from the authoritative join table. This preserves any legitimate saves made between the production audit and migration application. Public guide cards and details retain save and unsave controls but no longer display numeric save totals. The counter may continue to support internal ordering or future operator reporting, but R7.3 does not represent it as public social proof.

## Creator Listing Eligibility

Add `public.creators.is_listed boolean NOT NULL DEFAULT false`. The field is an inclusion override, not a general visibility toggle:

```text
eligible for directory/sitemap = active + public profile + valid handle
                                 + (at least one published guide OR is_listed)
```

One shared query/helper must enforce this rule for both the public creator directory and creator sitemap. A direct `/c/[handle]` lookup continues to use the existing broader public-profile rule, so an unlisted zero-guide creator can still be reached by an intentional direct link.

### Operator override

Operators change the override only through `admin_set_creator_listed(p_id uuid, p_is_listed boolean, p_reason text)`.

The function is `SECURITY DEFINER`, sets `search_path = public`, verifies `is_active_ops()`, requires a meaningful reason, updates the creator, and appends an immutable event through the existing operations audit-log boundary. Execution is explicitly revoked from `PUBLIC` and `anon` and granted only to `authenticated`, with authorization still enforced inside the function.

Because authenticated users currently possess broad update rights on `creators`, the migration also adds a database-level update guard for `is_listed`. A non-ops creator-owner update that changes this field is rejected even if another creator field is editable. The authorized ops RPC succeeds and is covered by local RLS/security tests. The implementation must not rely on hiding the field from client code.

The admin creator moderation surface exposes the override with its current value, an explicit reason input, confirmation, and route/cache revalidation after success.

## Article Publication Honesty

### Write boundary and outcome

`packages/sync` is the sole article publication boundary in current code. During transform, every input requesting a non-null `published_at` is validated before persistence. A failure does not abort the whole sync job: the article still syncs with `published_at = NULL` and emits structured warnings identifying the failed rules, article, and locale where applicable.

Draft input remains draft and does not need to satisfy publication thresholds.

### Translation depth

Every published translation must contain:

- At least three non-empty content blocks.
- At least 150 locale-aware words.

Word counting uses `Intl.Segmenter(locale, { granularity: "word" })` and counts only segments where `isWordLike` is true. This provides one deterministic rule that works for space-delimited languages as well as Chinese, Japanese, and Thai. Content-block extraction must reuse or align with the existing article block model rather than count serialized JSON syntax.

### Author identity

Every published article must resolve at least one nonempty, active author identity. Placeholder identities and names, including `jane-doe` and Jane Doe, are rejected.

The platform identity is explicit: an idempotently created `kinnso-editorial` author may display as “KINNSO Editorial.” That label is used only when this identity is actually attached to the article. Unknown, missing, or inactive authors never silently fall back to editorial attribution.

### External links

A shared validator recursively inspects URL-bearing fields in article JSON and links embedded in HTML content. Public external links must parse as absolute URLs, use HTTPS, and not target reserved example domains, including any `*.example.*` host.

The same rule applies to merchant `website_url` at its write boundary. The rule concerns outbound public URLs, not test-only email addresses or deliberately isolated test fixtures.

## Migrations

Implementation creates exactly two new generated migrations using the Supabase CLI naming workflow. No timestamp is handwritten.

### 1. Structural and behavioral migration

The first migration:

- Drops the `NOT NULL` constraint from `guides.cover_url`.
- Recomputes all `guides.saves_count` values from `guide_saves` without disturbing existing trigger maintenance.
- Adds `creators.is_listed` with a non-null false default.
- Adds the database guard for unauthorized `is_listed` changes.
- Creates `admin_set_creator_listed`, its explicit execution grants, and audit behavior.
- Adds the explicit `kinnso-editorial` platform-author identity if the final discovered schema places identity creation with structural data.

Generated `@kinnso/db` database types are refreshed after the schema change.

### 2. Idempotent production cleanup migration

The second migration is safe to re-run conceptually and uses predicates narrow enough to avoid modifying future legitimate content. It:

- Clears guide cover URLs hosted by `picsum.photos`.
- Unpublishes the four currently noncompliant published article fixtures by setting `published_at` to `NULL` only when they remain noncompliant targets.
- Removes placeholder Jane Doe attribution from those fixtures and attaches `kinnso-editorial` only where explicit editorial ownership is intended and documented by the fixture data.
- Nulls invalid merchant website URLs, including reserved example-domain values.
- Cleans invalid article external links identified by the audit without changing frozen content URLs.

The exact row predicates and identifiers must be confirmed from repository schema and a fresh read-only production query during implementation planning.

## Permanent Regression Controls

### Honesty lint

A repository check scans public application source, seeds, and real fixture modules for these forbidden production tokens: `picsum.photos`, `maps.example`, `Jane Doe`, `example.com/staycation`, and `you@example.com`.

The lint excludes test assertions and test-only email data so it protects shipped content without banning legitimate validator coverage. It is wired into the root quality/CI job and fails with file and token diagnostics.

Existing source offenders in seeds, locale content, and mission fixtures are replaced with honest values or removed. Database cleanup is verified separately because the current `picsum.photos` problem lives in production data rather than repository literals.

### Rendered smoke coverage

Rendered smoke tests inspect HTML for the home, explore, article listing, one eligible creator, and one merchant route. None may emit any forbidden token above. Coverage must exercise the placeholder media path as well as approved CDN media.

## Error Handling and Observability

- `EntityMedia` fails closed to a deterministic placeholder and does not leak invalid URLs into the DOM.
- Sync publication warnings are structured and attributable; invalid requested publication becomes a draft rather than an all-or-nothing job failure.
- The creator override RPC returns explicit authorization and validation failures and always records successful changes with the operator-provided reason.
- Cleanup statements are narrow and measurable. Pre/post counts are captured in migration verification so an unexpected target count blocks rollout.

## Verification Strategy

Unit coverage verifies URL-host policy, recursive article link discovery, locale-aware word counting, content-block thresholds, author resolution, media fallback selection, and creator eligibility semantics.

Database tests verify save counter recomputation, continued trigger behavior, eligibility with and without a published guide, ops override audit logging, direct owner update rejection, RPC authorization, and idempotent cleanup predicates. Local migrations run from a clean database and generated types must compile.

Web verification covers changed component tests, route/data-query tests, honesty lint, rendered smoke routes, TypeScript, and production build. Sync verification covers valid publication, each downgrade reason, mixed valid/invalid batch behavior, and structured warnings.

## Deployment Gate and Rollback

The implementation PR remains draft and must not be merged or deployed until an authorized operator applies both new migrations in order and verifies their target counts. Production Supabase access during development is read-only.

After migrations, a writable Preview environment must pass save/unsave, creator listing override, audit-log, article downgrade, media rendering, and outbound-link smoke checks. Only then may the PR be made ready and promoted through the normal review path.

Rollback is forward-only: code can temporarily retain placeholder rendering and hidden save totals, while corrective migrations restore narrowly identified rows or policy behavior. Shipped migrations are never edited or reverted in place.

## Out of Scope

- Reintroducing public save totals or fabricating replacement popularity values.
- A new article CMS or web publication action.
- Rewriting the repository's broader creator update privilege model beyond protecting `is_listed`.
- Changing frozen public content URLs.
- Creator copilot changes.
- Production migration execution, production data writes, or deployment before the gate above is satisfied.

## Approved Decisions

- Missing or unapproved entity media uses a deterministic branded placeholder; only verified uploaded media is optimized.
- Public numeric guide save totals are hidden, while save actions and honest internal counters remain.
- A creator appears in discovery with a published guide or an audited operator inclusion override; direct public profiles remain reachable.
- Article publication honesty is enforced at the existing sync ingress, with invalid requested publication downgraded to draft and reported.
- Every published translation must meet the block and locale-aware word thresholds and resolve a real author.
- Platform editorial attribution is explicit, never a generic fallback.
- Two new migrations separate structural behavior from narrow, idempotent cleanup.
- Permanent source lint and rendered smoke tests protect the public experience from known demo artifacts.
