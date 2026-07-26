# Phase R7.7 — Profile Trust and Enquiries Design

**Date:** 2026-07-26
**Status:** Approved for implementation planning
**Phase:** R7.7 — Creator/merchant profile trust hardening and enquiries

## 1. Purpose

R7.7 hardens the existing public creator and merchant profiles without adding
unrelated product capabilities.

The phase has three outcomes:

1. Public creator profiles present human-readable, evidence-backed information
   instead of raw internal DNA fields.
2. Public creator and merchant profiles offer one safe, first-party enquiry
   path.
3. Operations can process enquiries through an audited queue.

The authoritative R7 specification and the R1–R6 program conventions remain
binding. In particular:

- public reads use anonymous access under RLS;
- state-changing operations use narrow, audited database RPCs;
- all new UI copy ships in all seven supported locales;
- optional data never creates empty headings or fabricated claims;
- the phase ships as one squash-merged PR.

## 2. Ground Truth

### 2.1 Creator profile

The current public route is `apps/web/app/[locale]/c/[handle]/page.tsx`.
`getCreatorByHandle()` reads the public creator record and published guides,
then `CreatorProfileView` renders the page.

The current view:

- passes `null` to the avatar media component;
- displays internal DNA `tone`;
- displays raw audience locale codes;
- discards real follower counts when projecting published DNA;
- always renders the guides heading, including an empty state;
- has no collaboration CTA;
- does not render creator-linked articles or hosted sessions.

Published creator DNA already carries numeric platform follower values.
Guides have a creator foreign key. Community sessions have
`host_creator_id`. Articles store author slugs in `articles.authors` and resolve
those slugs against `article_authors.slug`.

There is no real creator profile editor or creator media-upload pipeline in the
repository.

### 2.2 Merchant profile

The current public route is `apps/web/app/[locale]/m/[slug]/page.tsx`.
It reads the public merchant projection and the merchant's published
experiences, then renders `PublicMerchantProfileView`.

The current view:

- shows the merchant website when present;
- shows experience prices;
- does not explain whether booking is available;
- has no first-party contact path;
- has no guide attribution section.

The existing product-state configuration centrally resolves `BOOKING_LIVE`.
Bookings can carry both `guide_id` and `experience_id`, giving a real
guide-to-merchant attribution path without exposing customer data.

There is no dedicated guide-to-experience embed table. City similarity is not
evidence that an experience was featured in a guide.

### 2.3 Existing security patterns

The application already has:

- a trusted client-IP helper;
- database-backed rate-limit buckets;
- honeypot-first server-action tests;
- `is_active_ops()` and existing ops guards;
- `ops_audit_log_append()` for audited state transitions;
- an optional-query wrapper for non-critical public enrichment.

R7.7 reuses these patterns. It does not add a service-role exception.

## 3. Chosen Architecture

Use additive schema changes, focused query functions, and narrow RPC
boundaries.

Do not replace the existing profile queries with large JSON-returning profile
RPCs. Do not grant anonymous callers direct insert permission on the enquiry
table. Do not infer relationships from display-name or city similarity.

The profile routes remain composition roots. They load the required core
profile and concurrently load independent optional sections.

## 4. Data Model

### 4.1 Creator avatar

Add `creators.avatar_url text null`.

When present, the value must be an absolute HTTP or HTTPS URL. R7.7 adds
rendering support only. It does not add storage buckets, uploads, replacement
workflows, or a profile editor.

The value can be populated through controlled data operations until a future
profile-management phase provides a supported editor.

### 4.2 Published follower counts

Replace `creator_public_profile_json(jsonb)` with an additive-compatible
definition that preserves a platform's `followers` value only when the
published DNA contains a real, non-negative numeric value.

The public projection continues to expose:

- niches;
- content pillars;
- tone;
- audience geographies;
- audience locales;
- languages;
- platforms.

The projection may retain internal fields for compatibility, but the R7.7
public view does not render tone or audience locales.

### 4.3 Enquiries

Add `public.enquiries` with:

- `id uuid primary key`;
- `type text not null`, constrained to `creator_collab` or
  `merchant_contact`;
- `creator_id uuid null`, referencing `public.creators`;
- `merchant_profile_id uuid null`, referencing
  `public.merchant_profiles`;
- `name text not null`;
- `email text not null`;
- `message text not null`;
- `status text not null default 'new'`, constrained to `new`,
  `in_progress`, `resolved`, or `spam`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

Use `ON DELETE RESTRICT` for both targets so deleting a profile cannot silently
erase or orphan the operational record.

A check constraint requires exactly one target:

- `creator_collab` requires `creator_id` and forbids
  `merchant_profile_id`;
- `merchant_contact` requires `merchant_profile_id` and forbids
  `creator_id`.

Add indexes supporting the active queue and target history:

- `(status, created_at desc, id desc)`;
- `(creator_id, created_at desc)` where `creator_id is not null`;
- `(merchant_profile_id, created_at desc)` where
  `merchant_profile_id is not null`.

### 4.4 Enquiry rate limiting

Add a dedicated enquiry rate-limit table rather than reusing session RSVP,
checkout, or agent limits.

The bucket is keyed by a non-reversible IP digest and window start. The
submission RPC atomically increments the bucket and rejects requests over the
configured threshold.

The raw client IP is never stored on the enquiry.

## 5. Database Security and RPCs

### 5.1 Table grants and RLS

Enable RLS on `enquiries` and the enquiry rate-limit table.

Revoke direct access from `anon` and `authenticated`. Public submissions and
ops state transitions happen only through explicitly granted RPCs.

The application service role is not used.

### 5.2 Public submission RPC

Add a `SECURITY DEFINER` RPC for enquiry submission. The function:

1. normalizes the enquiry type, target, name, email, and message;
2. validates bounded field lengths and email shape;
3. validates exactly one target for the chosen type;
4. atomically checks and increments the enquiry rate-limit bucket;
5. confirms the target is eligible for its public profile;
6. inserts the enquiry with status `new`;
7. returns the new enquiry ID.

A creator target must be active and publicly listed under the same eligibility
rules used by the public creator profile.

A merchant target must resolve through the active public merchant projection.

The function does not return submitted personal information.

Execute permission is granted only to `anon` and `authenticated`. Internal
helper functions receive no public execution grant.

### 5.3 Ops list RPC

Add an ops-gated, stable list RPC returning queue rows with their public target
name and slug/handle.

It requires an active ops user and accepts bounded filters for:

- active (`new`, `in_progress`), resolved, or spam status groups;
- creator collaboration or merchant contact;
- a capped page size and keyset cursor.

The default application query requests active enquiries newest first.

### 5.4 Audited status RPC

Add a `SECURITY DEFINER` status-transition RPC that:

1. requires an active ops user;
2. locks the enquiry row;
3. validates the requested transition;
4. rejects missing rows and no-op changes;
5. requires a reason when resolving, marking spam, or reopening terminal work;
6. updates `status` and `updated_at`;
7. appends an audit event through `ops_audit_log_append()`.

Allowed transitions are:

- `new -> in_progress`;
- `new -> resolved`;
- `new -> spam`;
- `in_progress -> resolved`;
- `in_progress -> spam`;
- `resolved -> in_progress`;
- `spam -> in_progress`.

The audit metadata includes the previous status and next status. Reasons are
trimmed and bounded.

## 6. Public Creator Profile

### 6.1 Core identity

Extend the public creator domain object with:

- creator ID for related-content queries and enquiry targeting;
- nullable avatar URL;
- optional platform follower count;
- published articles;
- public sessions.

Render the avatar URL through the existing entity-media component. When the
URL is absent or unusable, render name-derived initials.

Render:

- display name;
- handle;
- bio when present;
- a primary `Work with [name]` enquiry CTA.

### 6.2 Human-readable profile fields

Continue to render:

- niches;
- content pillars;
- audience regions;
- languages;
- verified platforms.

Do not render:

- tone;
- audience locales;
- raw language or region codes.

Use `Intl.DisplayNames` with the active page locale. Region values use the
region display-name type. Language values use the language display-name type.
If the runtime cannot resolve a value, omit it rather than falling back to the
raw code.

Format follower counts with the active locale. Render a count only when the
public projection contains a valid stored number. Never synthesize a count.

### 6.3 Related content

Load independent sections concurrently.

#### Guides

Use published guides whose `creator_id` equals the creator ID.

#### Articles

Use published, non-deleted articles only when:

- `articles.authors` contains the creator handle exactly; and
- the same handle resolves to an active `article_authors.slug` entry.

Do not match on display name or fuzzy text.

#### Sessions

Use public sessions whose `host_creator_id` equals the creator ID:

- include scheduled and live sessions;
- include ended sessions only when a public replay is available.

Render each related-content heading only when its list is non-empty. The
creator profile has no empty-state headings in R7.7.

## 7. Public Merchant Profile

### 7.1 Contact CTA

Add a primary `Contact this merchant` enquiry CTA. Keep the existing external
website link when present.

### 7.2 Experience booking state

Resolve `BOOKING_LIVE` through the existing product-state configuration and
pass the result to the merchant profile view.

Every published experience card shows:

- image;
- title;
- city;
- locale-formatted price and currency;
- `Book now` when booking is live;
- `Booking opens soon` when booking is not live.

The card links to the existing experience detail page in both states.

### 7.3 Featured in guides

Show a published guide only when a booking record provides real attribution
between:

- that guide;
- an experience;
- the merchant that owns the experience.

The public query returns only published guide card metadata. It does not return
booking counts, booking IDs, traveler IDs, guest emails, payment data, or any
other customer information.

Deduplicate guides and sort them deterministically by the newest qualifying
published guide. If no qualifying relationship exists, omit the section.

Do not use city similarity as attribution.

## 8. Shared Public Enquiry Experience

Both profile CTAs open the same accessible client-side dialog configured with
the appropriate enquiry type and target.

The form contains:

- target name and enquiry purpose;
- name;
- email;
- message;
- an off-screen honeypot field;
- submit and cancel controls;
- inline validation and submission feedback.

The server action:

1. checks the honeypot before any other dependency;
2. returns the normal success state for honeypot submissions without a write;
3. performs inexpensive input validation;
4. resolves the trusted client IP;
5. calls the public submission RPC;
6. maps database results to safe form states.

Supported form outcomes are:

- success;
- invalid input;
- rate limited;
- generic failure.

The client:

- preserves valid input after correctable errors;
- disables duplicate submission while pending;
- replaces the form with confirmation after success;
- does not promise a response time;
- resets when a completed dialog is closed and opened again;
- traps keyboard focus while open;
- restores focus to the invoking CTA on close.

No submitted personal information is written to application logs.

## 9. Ops Enquiry Queue

Add `/{locale}/admin/enquiries` to the existing admin navigation.

The default view shows `new` and `in_progress` enquiries newest first.
Operators can filter by:

- active, resolved, or spam;
- creator collaboration or merchant contact.

Each item shows:

- enquiry type;
- target profile name and link;
- visitor name and email;
- full message;
- received time;
- current status;
- allowed next actions.

Moving to `resolved`, `spam`, or reopening to `in_progress` requires a reason.
All actions use the audited status RPC.

R7.7 does not add:

- email delivery;
- creator or merchant notifications;
- operator assignment;
- CRM synchronization;
- exports;
- bulk status actions.

## 10. Resilience

The core profile lookup is required. A missing or ineligible core profile
continues to return `notFound()`.

Guides, articles, sessions, and attributed guides are optional enrichment.
Wrap them independently with the existing optional-query pattern so a
recognized optional-schema or transient read failure degrades that section to
an empty list without taking down the public profile.

Do not hide programming errors in development and tests.

Enquiry submission fails closed when rate limiting, target validation, or
insertion cannot be completed.

Operational logs may contain enquiry IDs and database error codes. They must
not contain names, email addresses, or message bodies.

## 11. Localization

Add all new public and ops strings to all seven locale dictionaries and keep
locale parity green.

Use locale-aware formatting for:

- language names;
- region names;
- prices;
- follower counts;
- timestamps in the ops queue.

Visible raw locale, language, and region codes are an acceptance failure.

## 12. Testing

Implementation follows test-driven development.

### 12.1 Database and migration tests

Cover:

- avatar URL constraint;
- enquiry type and target consistency constraints;
- grants and RLS;
- public RPC execution permissions;
- rate-limit increment and denial;
- creator and merchant target eligibility;
- successful creator and merchant insertions;
- ops list authorization;
- allowed and forbidden status transitions;
- required reasons;
- audit-row creation;
- public attributed-guide output containing no private booking data.

### 12.2 Unit and component tests

Cover:

- honeypot checks before client IP, Supabase, rate limiting, or insertion;
- validation and normalization;
- safe error mapping;
- real follower-count preservation;
- invalid follower-value omission;
- locale display-name conversion with no raw-code fallback;
- avatar image and initials fallback;
- exact creator-handle/author-slug article matching;
- creator-hosted session filtering;
- both `BOOKING_LIVE` states;
- zero-optional-data rendering with no empty headings;
- enquiry dialog keyboard and submission states;
- ops queue filters and transition controls.

### 12.3 Host and end-to-end tests

Add or extend route-host tests for:

- creator public profile;
- merchant public profile;
- admin enquiry queue.

Relevant Playwright coverage proves:

1. a visitor can submit a creator collaboration enquiry;
2. a visitor can submit a merchant contact enquiry;
3. an ops user can see both in the queue;
4. an ops user can perform an audited status transition.

## 13. Delivery and Verification

After adding the migration, regenerate Supabase database types.

Before publishing the PR, run:

- targeted migration, unit, component, and host tests;
- seven-locale parity;
- lint;
- TypeScript checks;
- the relevant Playwright subset;
- the production build.

Separate unrelated baseline failures from R7.7 regressions and record evidence.

Ship R7.7 on `codex/r7-7-profile-enquiries` as one pull request. Squash-merge
only after required checks pass and review findings are resolved.

## 14. Explicit Non-Goals

R7.7 does not include:

- a creator avatar upload or media-management workflow;
- a creator profile editor;
- fuzzy creator/article matching;
- city-based guide attribution;
- enquiry email or notification delivery;
- CRM integration;
- creator or merchant inboxes;
- public enquiry history;
- booking changes;
- creator copilot changes;
- edits to previously shipped migration files;
- changes to frozen public content URLs.
