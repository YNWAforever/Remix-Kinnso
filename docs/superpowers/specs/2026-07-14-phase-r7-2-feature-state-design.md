# Phase R7.2 — Feature-State Single Source of Truth Design

**Status:** Approved direction
**Date:** 2026-07-14
**Source of truth:** `kinnso-phase-r7-ux-hardening-spec.md` R7.2 and the program-wide §7 conventions
**Depends on:** Phase R7.0 ground truth (`docs/r7-ground-truth.md`) and Phase R7.1 funnel reliability

## Goal

Make every public product claim derive from one typed, server-side product-state contract so the Agent, Booking, and Sessions surfaces cannot contradict the capabilities that are actually available.

The locked initial state is:

- `AGENT_LIVE=true`;
- `BOOKING_LIVE=false`;
- `SESSIONS_LIVE=false` while production has neither a scheduled/live session nor an ended session with a replay.

The first two values are deployment configuration with explicit defaults. Sessions is derived from public database state and cached through the existing ISR model. Client components receive resolved booleans as props; no public environment variable becomes an independent feature-state source.

## Non-goals

- No creator-copilot changes.
- No edits to shipped migrations or frozen content URLs.
- No production Supabase writes from this implementation task.
- No operations UI for exported leads.
- No R7.3 fixture/content cleanup or R7.5 empty-state redesign.
- No Cache Components or partial-prerendering migration.

## Product-state contract

Add a server-only `apps/web/lib/product-state.ts` module with this public shape:

```ts
export type ProductState = {
  agentLive: boolean;
  bookingLive: boolean;
  sessionsLive: boolean;
};

export function resolveConfiguredProductState(env: NodeJS.ProcessEnv): {
  agentLive: boolean;
  bookingLive: boolean;
};

export async function getProductState(): Promise<ProductState>;
```

`resolveConfiguredProductState()` is pure and testable. It accepts only the case-insensitive string values `true` and `false`; a supplied invalid value throws an actionable error naming the variable but never echoing secrets. An absent `AGENT_LIVE` resolves to `true`; an absent `BOOKING_LIVE` resolves to `false`.

`apps/web/lib/env.ts` imports the same resolver instead of parsing the two flags separately. Provider validation therefore follows the resolved state, including defaults:

- resolved Agent ON requires `AI_GATEWAY_API_KEY` or Vercel workload identity (`VERCEL=1`);
- resolved Booking ON requires the existing Stripe and site-URL variables;
- disabled features do not require their provider credentials.

Production Vercel satisfies the Agent identity rule. Local or CI builds without an AI credential must explicitly set `AGENT_LIVE=false` if they are not using Vercel identity.

## Derived Sessions state

`getSessionsLive()` uses the existing cookie-less public Supabase client and the discovered sessions schema. It returns true when either condition exists:

1. at least one row has status `scheduled` or `live`; or
2. at least one row has status `ended` and a non-null replay URL.

Both existence checks select only an identifier and use a one-row limit. They rely on existing public RLS. A query failure is logged as a named, secret-free warning and fails closed to `false`; it does not make a marketing route dynamic or crash the page.

`getProductState()` deduplicates work within a render using React server `cache()`. Cross-request freshness remains the established route-level ISR contract. The locale layout and marketing routes that consume this state use a 300-second revalidation window. No request-bound API such as `cookies()` or `headers()` is introduced into static marketing routes.

Admin session mutations already revalidate locale home and Sessions paths. The implementation extends that invalidation only if the exact consuming layout/page paths discovered in code require it.

## Render and data boundaries

- `apps/web/app/[locale]/layout.tsx` resolves product state under `revalidate = 300` and sends `sessionsLive` through `SiteChrome` to `Navbar`.
- The homepage resolves or receives the same server contract. `HomeView` passes individual booleans to its client children.
- `/agent` remains request-rendered because it already checks authenticated user state. When Agent is OFF it returns the waitlist experience before loading chat-specific user state.
- Experience detail routes remain request-rendered. They pass `bookingLive` into the booking component.
- Guide/article detail routes retain their current rendering mode and receive `bookingLive` from a server boundary.
- `/for-merchants` and `/for-creators` keep their current static/ISR behavior and select copy server-side.

The configured booleans may be read synchronously where no Sessions database lookup is needed, but all reads must flow through `product-state.ts`. Components never read `process.env` directly.

## Generic feature-interest capture

The approved persistence model is one reusable table, `feature_interest_signups`, created in a new timestamped migration generated with the Supabase CLI. The implementation must discover the CLI-produced path and must not modify an existing migration.

The table contract is:

| Column | Contract |
|---|---|
| `id` | UUID primary key with `gen_random_uuid()` default |
| `feature` | text constrained to `agent`, `booking`, or `sessions` |
| `email` | normalized lowercase email text |
| `locale` | one of the seven supported locales |
| `created_at` | timezone-aware timestamp defaulting to `now()` |

`(feature, email)` is unique, so repeat submissions are idempotent across pages and locales.

RLS is enabled. Anonymous and ordinary authenticated clients receive no direct table read or write grant. Existing operations authorization conventions may receive read access only if the repository's discovered helper and grant pattern supports it without adding a new surface.

A `SECURITY DEFINER` RPC named `join_feature_interest` is the sole public write path. It:

- sets a safe search path;
- validates the feature allowlist, supported locale, normalized email length and shape;
- inserts with `ON CONFLICT DO NOTHING`;
- exposes the same success result for first-time and duplicate submissions;
- is revoked from `public` and granted only to `anon` and `authenticated`.

This is an audited migration/RPC write boundary under §7. The migration receives a SQL contract test covering RLS, grants, validation, and idempotency. Applying the migration to production is a separate operator handoff because this task's Supabase production authority is read-only.

## Server action and reusable form

Add a typed server action and a shared `FeatureInterestForm` used by Agent and Booking OFF states. Its input is the feature, locale, email, and a visually hidden honeypot value.

- A filled honeypot returns the same generic success result without writing.
- Invalid client input produces a localized validation state and never invokes the RPC.
- The server action revalidates the feature and locale before invoking `join_feature_interest`.
- RPC errors produce a localized, retryable generic failure; raw database errors never reach the browser.
- Success copy does not reveal whether the email already existed.
- The form has an explicit label, status announcement, pending state, disabled duplicate submission, and keyboard-visible focus behavior.

The shared form is a client island; its surrounding headline, explanation, and metadata are chosen by server components.

## Claim-surface mapping

Every R7.2 surface maps to one resolved flag:

| Surface | Flag | OFF | ON |
|---|---|---|---|
| Homepage Agent band | Agent | waitlist copy and Agent interest form | current live CTA and current live copy |
| `/agent` title, metadata, hero, and body | Agent | waitlist language and Agent interest form | live chat language and `AgentChatView` |
| Homepage traveller step 3 | Booking | notification/coming-soon wording | booking-live wording |
| Experience booking CTA | Booking | “Get notified when booking opens” and Booking interest form | existing checkout flow |
| `/for-merchants` booking bullet | Booking | coming-soon merchant wording | live-booking merchant wording |
| `/for-creators` earnings bullet | Booking | future-earnings wording | live-earnings wording |
| Article experience-embed header | Booking | discovery/notification wording | current ready-to-book wording |
| Navbar Sessions item | Sessions | omitted | shown |
| Homepage Sessions band | Sessions | omitted even if inconsistent data is passed | shown when qualifying public rows exist |

When Booking is OFF, the checkout server action must be unreachable from the rendered Booking widget. Tests prove the OFF branch cannot submit or navigate to checkout.

The Agent page metadata and visible page copy select the same dictionary branch from the same state value. A test renders metadata and body in both states to prevent disagreement.

## Localization contract

All state-dependent user-facing strings live in the locale dictionaries for:

- `en`;
- `zh-hk`;
- `zh-tw`;
- `ja`;
- `ko`;
- `th`;
- `zh-cn`.

Dictionary groups gain explicit live and waitlist/notification variants rather than embedding English literals in components. Locale parity must remain exact across all seven files.

A source-scan test rejects the literal claim phrases `Coming Soon`, `Live now`, and `coming soon` in component source outside locale dictionaries. Matching is intentionally scoped to source components so tests, documentation, migrations, and dictionary content remain legitimate.

## Failure behavior

- Invalid configured flag strings fail build validation with the variable name and accepted values.
- Sessions lookup failure resolves Sessions OFF and logs only a named safe warning.
- Duplicate interest signup succeeds without revealing membership.
- Honeypot submissions succeed without a database write.
- Invalid email/feature/locale input is rejected at both action and RPC boundaries.
- Interest persistence failure leaves the user on the page with localized retry copy.
- Booking OFF never degrades into an active checkout CTA, even if availability rows exist.
- Agent OFF never initializes the chat experience, even if the current user is authenticated.

## Testing strategy

Implementation follows red-green-refactor and adds the smallest test at each boundary:

1. Pure product-state tests cover defaults, explicit ON/OFF values, mixed case, invalid strings, and provider-validation alignment.
2. Sessions-state tests mock the public client for scheduled/live existence, replay existence, no rows, and query failure.
3. Migration contract tests cover table shape, constraints, RLS, RPC grants, normalization, and idempotent conflict handling.
4. Server-action tests cover validation, honeypot, success, duplicate-safe success, and sanitized failure.
5. Form tests cover accessible labels/status, pending state, success, and retry.
6. Host/component tests exercise both flag states for every row in the claim-surface table.
7. Agent tests prove metadata and visible body select the same state.
8. Booking tests prove the OFF branch cannot invoke checkout and the ON branch preserves the existing flow.
9. Navbar/Home tests prove Sessions is absent when OFF and shown only when ON with qualifying data.
10. The forbidden-literal scan and seven-locale parity test run with the normal unit suite.
11. Existing funnel smoke, sitemap crawl, typecheck, lint, and production build remain required regression checks.

Browser verification covers the default state: live Agent entry, no Sessions navigation/band, and Booking notification capture instead of checkout. It does not submit production data; persistence is verified locally against the migration contract and action mocks unless a writable non-production Supabase environment is explicitly authorized.

## Deployment and rollback

The code and unapplied timestamped migration ship in the R7.2 PR. Before enabling any OFF-to-ON change, operators must verify provider configuration and the corresponding live route in Preview.

- Turning Agent OFF or Booking OFF is a configuration rollback followed by redeploy.
- Sessions turns ON automatically within the ISR window after a qualifying public row exists and turns OFF after qualifying rows are removed or cancelled.
- Interest capture requires the new migration to be applied before deploying OFF-state forms to an environment. Until that operational prerequisite is satisfied, deployment must not proceed with an OFF state whose form would call the missing RPC.

## Acceptance mapping

- One source of truth: all configured and derived reads flow through `product-state.ts`.
- Honest defaults: Agent ON, Booking OFF, Sessions derived and currently OFF.
- Static safety: marketing routes use cookie-less public reads and 300-second ISR.
- Complete surface coverage: every spec-listed claim is mapped and tested in both states.
- Useful OFF states: Agent and Booking collect idempotent feature interest through one audited RPC.
- Session honesty: navigation and homepage exposure require qualifying database state.
- Locale integrity: all seven dictionaries remain structurally identical.
- Regression prevention: metadata/body consistency, checkout isolation, literal scanning, and existing funnel checks are automated.
