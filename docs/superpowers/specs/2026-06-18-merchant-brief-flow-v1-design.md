# Merchant Brief Flow v1 Design

Date: 2026-06-18
Status: Approved for implementation planning

## Purpose

Merchant Brief Flow v1 turns the current merchant and creator discovery surfaces into a Supabase-backed two-sided mission workflow. Merchants can post campaign briefs, creators can join or apply, merchants can review milestone work, Instagram and Threads data can enrich trust signals, and KINNSO ops can manually track settlement.

The flow also supports KINNSO-owned affiliate network programs through Travelpayouts. KINNSO can expose the 29 connected Travelpayouts programs as joinable affiliate missions, creators can join those programs without merchant approval, and the app can generate creator-tracked partner links.

The design favors a production-shaped foundation without full payment automation, broad cross-network attribution, or a broad campaign engine.

## Goals

- Add authenticated merchant profiles tied to Supabase Auth users.
- Support three mission compensation modes:
  - coupon affiliate only
  - hybrid affiliate commission plus paid mission fee
  - paid mission only
- Support two affiliate sources:
  - merchant-owned coupon or affiliate campaigns
  - KINNSO-owned Travelpayouts affiliate network programs
- Support open missions and targeted creator invites from one mission model.
- Allow unlimited creator participation.
- Allow coupon affiliate missions and Travelpayouts affiliate programs to auto-join.
- Require merchant approval for paid and hybrid mission participation.
- Support creator milestones, submissions, merchant reviews, and revision requests.
- Generate Travelpayouts partner links with creator-specific tracking IDs.
- Sync or import Travelpayouts booking/statistics and finance data as settlement signals where available.
- Use Instagram and Threads enrichment as advisory trust signals with manual override.
- Give KINNSO ops exclusive control over manual settlement status.
- Enforce data access through Supabase RLS and app-level domain actions.

## Non-Goals

- Stripe checkout, escrow, or automated creator payouts.
- Fully automated affiliate conversion attribution across all networks.
- Automatically paying creator commissions based on Travelpayouts data.
- Hard blocking approval based on scraper success.
- Full notification infrastructure beyond data states needed by the UI.
- Replacing existing mock creator discovery data in one pass unless required by the mission flow.

## Selected Approach

Use a focused Mission domain layer with normalized Supabase tables, strict RLS, and Next app actions/services for state transitions. External Instagram, Threads, and Travelpayouts integrations run server-side through adapters or jobs so RapidAPI keys and affiliate API tokens never reach the browser.

This approach keeps the first implementation practical while leaving room for settlement automation, conversion tracking, and event-driven processing later.

## Actors

### Merchant

An authenticated Supabase user with a `merchant_profiles` row. A user can have both a creator profile and merchant profile. Merchant capabilities are scoped to missions owned by their profile.

### Creator

An authenticated Supabase user with an existing `creators` row. Creators can view eligible published missions, join coupon missions, apply to paid or hybrid missions, accept targeted invites, and submit milestone work.

### KINNSO Ops

An authenticated Supabase user listed in `kinnso_ops_members`. Ops members can view settlement queues and update settlement status fields. This table is the source of truth for internal settlement authority in v1.

KINNSO ops also manages the affiliate network catalog, including the 29 Travelpayouts programs KINNSO has already joined.

## Data Model

### `merchant_profiles`

Stores merchant identity and company metadata.

Key fields:

- `id`
- `user_id`
- `company_name`
- `contact_name`
- `contact_email`
- `website_url`
- `status`
- `created_at`
- `updated_at`

Constraints:

- `user_id` is unique and references Supabase Auth users.
- Merchant-owned rows are selected and updated only by their owner.

### `kinnso_ops_members`

Stores internal users who can operate settlement controls.

Key fields:

- `id`
- `user_id`
- `display_name`
- `status`
- `created_at`
- `updated_at`

Constraints:

- `user_id` is unique and references Supabase Auth users.
- Only active ops members can perform settlement updates.

### `missions`

Stores merchant-posted briefs, KINNSO-owned affiliate network programs exposed as missions, and campaign settings.

Key fields:

- `id`
- `merchant_profile_id`
- `created_by_ops_member_id`
- `title`
- `summary`
- `mission_type`: `coupon_affiliate`, `hybrid`, `paid`
- `visibility`: `open`, `targeted`
- `status`: `draft`, `published`, `paused`, `completed`, `cancelled`
- `mission_source`: `merchant`, `travelpayouts`
- `affiliate_network_program_id`
- `coupon_code`
- `coupon_description`
- `coupon_url`
- `affiliate_commission_rate`
- `kinnso_commission_rate`
- `creator_commission_rate`
- `paid_fee_amount`
- `paid_fee_currency`
- `application_instructions`
- `starts_at`
- `ends_at`
- `published_at`
- `created_at`
- `updated_at`

Rules:

- `merchant_profile_id` is required when `mission_source` is `merchant`.
- `created_by_ops_member_id` is required when `mission_source` is `travelpayouts`.
- Merchant-sourced coupon affiliate missions require coupon details and commission terms.
- Travelpayouts affiliate missions require an active affiliate network program and do not require merchant approval for creator participation.
- Travelpayouts affiliate missions use `mission_type` `coupon_affiliate` in v1.
- Hybrid missions require coupon details, commission terms, and paid fee terms.
- Paid missions require paid fee terms and do not require coupon terms.
- Draft merchant missions can be edited by the owning merchant.
- Draft Travelpayouts missions can be edited by KINNSO ops.
- Published missions become visible to eligible creators based on visibility and targeting.

### `affiliate_network_programs`

Stores KINNSO-managed affiliate programs, starting with the 29 Travelpayouts programs already connected by KINNSO.

Key fields:

- `id`
- `network`: `travelpayouts`
- `external_program_id`
- `program_name`
- `program_url`
- `category`
- `description`
- `default_currency`
- `default_commission_description`
- `join_policy`: `auto_join`
- `status`: `active`, `paused`, `archived`
- `metadata`
- `created_at`
- `updated_at`

Rules:

- Only KINNSO ops can create or update affiliate network programs.
- Creators can view active programs exposed as published affiliate missions.
- Program IDs map to Travelpayouts campaign or brand identifiers where available.

### `affiliate_partner_links`

Stores generated affiliate links per creator and program.

Key fields:

- `id`
- `affiliate_network_program_id`
- `mission_id`
- `mission_participant_id`
- `creator_id`
- `network`: `travelpayouts`
- `original_url`
- `partner_url`
- `sub_id`
- `external_status`
- `generated_at`
- `created_at`
- `updated_at`

Rules:

- Creators can create partner links only for active programs they joined.
- Links are generated server-side with Travelpayouts credentials.
- The `sub_id` should encode KINNSO, mission, participant, and creator identifiers so Travelpayouts statistics can be mapped back to creator participation.
- API failures return a user-facing retry state and do not create a successful link record.

### `affiliate_network_events`

Stores imported network-reported actions, bookings, and payout-affecting events.

Key fields:

- `id`
- `network`: `travelpayouts`
- `affiliate_network_program_id`
- `mission_id`
- `mission_participant_id`
- `creator_id`
- `external_action_id`
- `sub_id`
- `event_state`: `processing`, `paid`, `cancelled`, `unknown`
- `price_amount`
- `profit_amount`
- `currency`
- `booked_at`
- `external_updated_at`
- `raw_response_checksum`
- `created_at`
- `updated_at`

Rules:

- Imported events are settlement inputs, not automatic payout commands.
- KINNSO ops reviews imported events before marking creator payout or KINNSO commission settlement complete.
- Duplicate external actions are upserted by network and external action ID.

### `mission_participants`

Stores creator participation, applications, and targeted invites.

Key fields:

- `id`
- `mission_id`
- `creator_id`
- `status`: `invited`, `applied`, `rejected`, `active`, `completed`, `cancelled`
- `source`: `open_join`, `application`, `merchant_invite`, `affiliate_network_join`
- `application_note`
- `merchant_review_note`
- `approved_at`
- `created_at`
- `updated_at`

Rules:

- Coupon affiliate open missions can create active participation immediately.
- Travelpayouts affiliate missions can create active participation immediately.
- Paid and hybrid missions create `applied` participation first, then merchant approval records `approved_at` and moves the participant to `active`.
- Targeted invites create `invited` participation records.
- A creator can have only one participant row per mission.

### `mission_milestones`

Stores merchant-defined deliverables.

Key fields:

- `id`
- `mission_id`
- `title`
- `description`
- `due_at`
- `sort_order`
- `created_at`
- `updated_at`

Rules:

- Milestones are defined at mission level.
- Paid and hybrid missions should have at least one milestone before publishing.
- Merchant coupon affiliate missions may use a simple default milestone such as "Share coupon content".
- Travelpayouts affiliate missions may skip milestones unless KINNSO ops defines a default promotional milestone.

### `mission_milestone_submissions`

Stores creator work for milestones.

Key fields:

- `id`
- `mission_milestone_id`
- `mission_participant_id`
- `status`: `pending`, `submitted`, `revision_requested`, `approved`, `rejected`
- `proof_urls`
- `notes`
- `merchant_feedback`
- `submitted_at`
- `reviewed_at`
- `reviewed_by`
- `created_at`
- `updated_at`

Rules:

- Creators can create and update their own unapproved submissions.
- Merchants can review submissions for their own missions.
- Review actions are approval, revision request, or rejection.

### `mission_social_snapshots`

Stores advisory social enrichment for creator profiles and milestone proof.

Key fields:

- `id`
- `mission_id`
- `mission_participant_id`
- `mission_milestone_submission_id`
- `platform`: `instagram`, `threads`
- `handle`
- `profile_url`
- `proof_url`
- `follower_count`
- `profile_media_url`
- `post_media_url`
- `engagement_count`
- `confidence_status`: `verified_signal`, `needs_review`, `unavailable`
- `raw_response_checksum`
- `fetched_at`
- `created_at`
- `updated_at`

Rules:

- Snapshots are advisory and never hard-block submission or merchant approval.
- RapidAPI credentials are server-only.
- If an API call fails or an endpoint is unavailable, the app records `unavailable` and keeps manual review available.
- Exact RapidAPI endpoint shapes are verified during implementation against the current provider docs before writing adapters.

### `mission_settlements`

Stores manual settlement status controlled by KINNSO ops.

Key fields:

- `id`
- `mission_id`
- `mission_participant_id`
- `status`: `not_started`, `pending`, `partially_paid`, `paid`, `disputed`
- `merchant_invoice_status`
- `merchant_payment_status`
- `creator_payout_status`
- `kinnso_commission_status`
- `affiliate_commission_status`
- `affiliate_network_event_id`
- `amount_currency`
- `paid_fee_amount`
- `affiliate_commission_amount`
- `kinnso_commission_amount`
- `creator_commission_amount`
- `ops_note`
- `updated_by_ops_member_id`
- `created_at`
- `updated_at`

Rules:

- Merchants and creators can view relevant settlement state for their missions and participation.
- Only active KINNSO ops members can update settlement fields.
- v1 does not move money; it records manual finance state and can reference imported affiliate network events.

## Access Control and RLS

All new public-schema tables must have RLS enabled.

Policies should use explicit role targets such as `TO authenticated` and combine them with ownership predicates. `TO authenticated` alone is not sufficient authorization.

Expected policy shape:

- Merchants can select, insert, and update their own `merchant_profiles`.
- Merchants can select and mutate missions owned by their merchant profile.
- Creators can select published open missions and targeted invites addressed to them.
- Creators can create or update their own participant and submission records within allowed state transitions.
- Merchants can select participant and submission records for missions they own.
- KINNSO ops can select mission, participant, submission, and settlement rows needed for settlement operations.
- KINNSO ops can manage affiliate network programs and imported affiliate events.
- Creators can view active affiliate network programs, join related missions, and select their own generated partner links.
- Only KINNSO ops can update settlement rows.
- No client code uses service-role credentials.
- Travelpayouts API tokens, project IDs, and marker values are server-only environment/config values and are never stored in client-visible rows.

State transition rules should be enforced in app actions and backed by database constraints where practical. RLS is responsible for access boundaries; domain services are responsible for workflow validity and user-facing errors.

## Workflow

### Merchant Flow

1. Merchant signs in.
2. App creates or completes the merchant profile.
3. Merchant creates a mission from `/[locale]/merchants/post`.
4. Form requirements change based on mission type.
5. Merchant saves draft or publishes.
6. Publishing creates targeted invite rows when creators were selected.
7. Merchant reviews applicants for paid and hybrid missions.
8. Merchant reviews milestone submissions and approves, rejects, or requests revision.
9. Merchant views settlement status but cannot mark settlement paid.

Merchant-created coupon affiliate missions remain merchant-owned. Travelpayouts affiliate network missions are KINNSO-owned program missions and do not need a merchant review step for creators to join.

### Creator Flow

1. Creator sees open missions and targeted invites in creator/studio mission surfaces.
2. Creator can auto-join merchant coupon affiliate missions and KINNSO Travelpayouts affiliate programs.
3. Creator applies to paid or hybrid missions.
4. Creator accepts targeted invites where applicable.
5. For Travelpayouts programs, creator can generate tracked partner links with creator-specific `sub_id` values.
6. Active creator submits milestone work with proof URLs and notes.
7. Creator sees enrichment signals, review feedback, revision requests, and settlement visibility.

### KINNSO Ops Flow

1. Ops member signs in.
2. Ops page verifies membership through `kinnso_ops_members`.
3. Ops manages the Travelpayouts affiliate program catalog.
4. Ops views missions and participants needing finance review.
5. Ops reviews imported affiliate events where available.
6. Ops updates settlement status fields and notes.
7. The app records updater and timestamp.

## UI Surfaces

### `/[locale]/merchants/post`

Mission creation wizard:

- Mission type selection.
- Coupon and affiliate commission terms.
- Paid fee terms.
- Milestone editor.
- Open mission or targeted invite selection.
- Draft and publish actions.

### `/[locale]/merchants/missions`

Merchant mission list:

- Status filters.
- Applicant counts.
- Active creator counts.
- Milestone review counts.
- Settlement summary.

### `/[locale]/merchants/missions/[missionId]`

Merchant mission detail:

- Mission overview.
- Participants and applications.
- Milestone submissions.
- Social enrichment signals.
- Review actions.
- Settlement visibility.

### Affiliate Network Programs Surface

Creator-facing network catalog:

- Active Travelpayouts programs exposed by KINNSO.
- Program details and commission description.
- Auto-join action.
- Partner-link generator.
- Creator-specific generated links.
- Network-reported performance summary where available.

### Creator or Studio Missions Surface

Creator-facing work queue:

- Open missions.
- Targeted invites.
- Applications.
- Active work.
- Milestone submissions.
- Revision and approval states.
- Settlement visibility.

### KINNSO Ops Settlement Surface

Internal settlement page:

- Missions needing settlement review.
- Participant-level settlement status.
- Manual finance status updates.
- Imported Travelpayouts event references.
- Ops notes.

## Social Enrichment

Instagram and Threads enrichment is server-side only.

The first implementation should use adapter boundaries such as:

- `fetchInstagramProfileSnapshot`
- `fetchInstagramPostSnapshot`
- `fetchThreadsProfileSnapshot`
- `fetchThreadsPostSnapshot`

The adapters normalize provider responses into `mission_social_snapshots`. If RapidAPI endpoint access, provider limits, or response shapes differ from expectations, the adapter records `unavailable` or `needs_review` rather than blocking the workflow.

The UI should label enriched data as a trust signal, not as guaranteed truth.

## Travelpayouts Integration

Travelpayouts is the first affiliate network integration.

Relevant documented capabilities:

- Partner links API converts direct travel brand links into partner links and supports an optional `sub_id` for tracking.
- Statistics API can return booking/action data for connected affiliate programs, including fields such as campaign ID, action ID, `sub_id`, price, profit, state, and dates.
- Finance API can return balance, payout history, and actions affecting balance.

Server-side configuration required:

- `TRAVELPAYOUTS_API_TOKEN`
- `TRAVELPAYOUTS_PROJECT_ID` or equivalent Travelpayouts `trs` value
- `TRAVELPAYOUTS_MARKER`

Rules:

- The token provided during planning must be treated as exposed and rotated before production use.
- The token must never be committed to git, exposed as a `NEXT_PUBLIC_` variable, or stored in public database rows.
- Travelpayouts partner-link creation runs only on the server.
- Network events are imported on a scheduled or ops-triggered basis.
- Imported Travelpayouts events inform settlement but do not automatically mark commissions paid.
- Program catalog bootstrap can start from a KINNSO-maintained seed of the 29 connected programs, then be refreshed manually or by a future sync job if Travelpayouts exposes enough program metadata.

## Validation

Validation should cover:

- Required fields for each mission type.
- Commission and fee amounts are non-negative.
- Commission split fields are present for merchant coupon and hybrid missions.
- Paid fee fields are present for hybrid and paid missions.
- Paid and hybrid missions have at least one milestone before publish.
- Coupon missions can auto-join.
- Paid and hybrid missions require merchant approval.
- Travelpayouts affiliate program missions can auto-join.
- Travelpayouts partner-link creation requires an active participant and active program.
- Only active participants can submit milestone work.
- Approved submissions cannot be overwritten by creators.
- Settlement updates require active ops membership.

## Error Handling

- Auth-required routes redirect or show the existing sign-in prompt pattern.
- Missing merchant profile prompts the merchant to complete basic company fields.
- RLS-denied actions return user-facing "not allowed" messages.
- Invalid state transitions return specific validation errors.
- Social enrichment failures are stored as unavailable snapshots and shown as manual-review states.
- Travelpayouts link-generation failures are shown as retryable API errors and do not create successful partner-link records.
- Travelpayouts statistics import failures are logged and retried without blocking creator participation.
- Duplicate participation attempts return the existing participant state instead of creating another row.

## Testing Plan

- Unit tests for mission type validation.
- Unit tests for participant and milestone state transitions.
- RLS tests for merchant, creator, and ops access boundaries.
- Component or route tests for the mission creation wizard.
- Component or route tests for creator join, apply, invite acceptance, and milestone submission.
- Component or route tests for merchant review actions.
- Component or route tests for ops-only settlement controls.
- Mocked tests for Instagram and Threads enrichment adapters.
- Mocked tests for Travelpayouts partner-link generation, event import, and token-not-exposed behavior.
- Final implementation verification with typecheck, lint, test suite, and production build.

## Implementation Slices

1. Schema, grants, and RLS migrations.
2. Generated database types.
3. Mission validation and domain action layer.
4. Merchant mission creation and mission detail surfaces.
5. Creator/studio mission participation and submission surfaces.
6. KINNSO ops settlement surface.
7. Travelpayouts program catalog, partner-link generation, and imported event references.
8. Social enrichment adapters and snapshot UI.
9. Full verification pass.

## Self-Review Notes

- Scope is limited to v1 mission workflow, Travelpayouts affiliate program joins/link generation, manual settlement, and advisory social enrichment.
- Payment automation and broad cross-network affiliate conversion tracking are explicitly out of scope.
- Access control uses tables and RLS rather than user-editable metadata or hardcoded email lists.
- The design supports unlimited creators while preserving merchant approval for paid budget exposure.
- RapidAPI capabilities are treated as implementation-time integration details behind adapters, so the workflow remains reliable if a provider response changes.
- Travelpayouts credentials are treated as server-only secrets and the planning token must be rotated before production.
