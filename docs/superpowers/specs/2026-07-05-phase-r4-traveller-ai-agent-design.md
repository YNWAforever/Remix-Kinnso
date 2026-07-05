# Phase R4 — Traveller AI Agent v1: Design

**Date:** 2026-07-05
**Status:** Locked (user-approved 2026-07-05, via brainstorming)
**Parent:** `docs/superpowers/specs/2026-07-02-product-revision-program-design.md` (§5.2, §6 R4)
**Builds on:** `feat/revision-r3c` (PR #75, not yet merged as of this writing) — this phase's
one real dependency on R3C is extending `ALLOWED_SOURCE_SURFACES`/the `bookings.
source_surface` CHECK constraint with a new `'agent'` value (§2.6 below). Everything
else in this phase is independent of R3C and could in principle land first if R3C's
merge is delayed — the plan phase should confirm actual branch order against R3C's
merge status at that time, not assume this doc's worktree ancestry is final.
**Scope:** apps/web, supabase/migrations, three new Postgres search RPCs, two new
tables. Charter (master §5.2/§6 R4): `/api/agent` route + public chat at `/agent`;
retrieval over guides/articles/experiences; anon-accessible with IP rate limits and a
cheap model; traveller sign-in unlocks saved history; homepage flips waitlist → "Try AI
Agent"; agent satisfaction instrumentation. "Agent v2" (full itinerary assembly) is
explicitly out of scope. The creator copilot is untouched — different audience, auth,
quota, system prompt, and `copilot_messages`/its RLS are never reused.

---

## 1. Ground truth (surveyed 2026-07-05, this session, against `main`)

- **The `/agent` page today is waitlist-only.** `app/[locale]/agent/page.tsx` renders
  `AgentLandingView` (`components/kinnso/pages/AgentLandingView.tsx`): an eyebrow/title/
  body header, a 3-column value-prop card grid (destination/dates/style), an
  `AgentWaitlistForm` email-capture action, and a footer CTA to `/explore`/`/articles`.
  Its own copy is explicit that this is deliberately not live yet ("The agent isn't live
  yet — we only ship it when it's genuinely useful"). All copy lives in the `agent` i18n
  message group (`lib/i18n/messages/en.ts`, currently ~20 keys: eyebrow/title/body/
  point1-3/formHeading/formBody/emailLabel/submitCta/successNote/errorInvalid/
  errorGeneric/honestNote/exploreCta/articlesCta).
- **A stale instruction, corrected**: the user's global `~/CLAUDE.md` says "LLM calls via
  `lib/openrouter.ts` wrapper (OpenRouter)" — **no such file exists in this repo**. The
  creator copilot (the only existing LLM-calling code) uses **Vercel AI Gateway** via the
  `ai` SDK v6 (`streamText()` → `.toUIMessageStreamResponse()`), with model slugs like
  `anthropic/claude-haiku-4.5`/`anthropic/claude-sonnet-4.6` selected by
  `lib/copilot/policy.ts`'s tier map. This phase follows the real, established pattern
  (AI Gateway + AI SDK v6), not the stale global instruction.
- **The creator copilot is a solid, fully separate precedent, confirmed not to be
  reused**: `app/api/copilot/route.ts` is creator-only (`resolveViewerRole() === 'creator'
  ` gate, 404 otherwise), quota is a per-creator daily count via `countUserMessagesToday()`
  (not IP-based), its system prompt is built from creator DNA, and `copilot_messages`
  (creator_id FK, creator-owner RLS) has anon fully revoked. None of this is touched by
  or reused for R4 — confirmed by design, not just by omission.
- **IP-based rate limiting is already solved — reuse, don't rebuild.** R3A-2 built
  `check_and_increment_checkout_rate_limit(p_ip, p_max_requests, p_window_seconds)` (a
  SECURITY DEFINER RPC over a `checkout_rate_limits` table, anon/authenticated
  EXECUTE-granted) plus `getClientIp()` (`lib/http/client-ip.ts`, reads
  `x-forwarded-for`/`x-real-ip`, documented as "best-effort, not a security boundary").
  This is the exact anon-rate-limit template R4 needs — same shape, new call site, no new
  infrastructure.
- **Full-text search exists for articles only.** `search_articles(p_locale, p_category,
  p_q, p_region, p_tag, p_limit, p_offset)` (migration `20260614000008_search_rpc.sql`)
  does native Postgres FTS via a precomputed `tsvector` column and
  `websearch_to_tsquery('simple', p_q)`, falling back to `ilike` on keywords/tags.
  `lib/articles/queries.ts`'s `searchArticles()` wraps it. **Guides and experiences have
  no equivalent** — only simple `ilike`-based city-heuristic queries
  (`getGuidesForRegions`, `getExperiencesForCity`, both already built for the R1C/R3C
  cross-link features and reused as-is where they fit, but neither does real search by
  arbitrary query text).
- **Traveller identity exists but stores nothing agent-related.** `traveler_profiles`
  (R3A-1) has only `user_id`, `display_name`, `locale`, `marketing_opt_in` — no
  conversation history, no preferences. A new table pair is needed for R4; nothing here
  can be repurposed.
- **Streaming + anon-reachable route conventions both have direct precedent**: the
  copilot proves the `streamText()`/`.toUIMessageStreamResponse()`/`useChat()` shape
  works in this codebase; the Stripe webhook and R3A-2's checkout-session action prove
  the anon-reachable-with-rate-limiting shape. R4 combines both precedents; it invents
  neither.

## 2. Phase decisions

### D-R4-1 · Retrieval covers all three content types from v1, via two new search RPCs mirroring `search_articles`

**Chosen** (user-confirmed): `search_guides(p_locale, p_q, p_region, p_limit, p_offset)`
and `search_experiences(p_q, p_city, p_limit, p_offset)`, each adding a precomputed
`tsvector` column to `guides`/`experiences` (generated column or trigger-maintained,
matching whichever mechanism `article_translations.tsv` already uses — a plan-phase
detail to confirm against the real migration) and a SECURITY INVOKER RPC in the same
shape as `search_articles`. **Rejected**: shipping articles-only for v1 and deferring
guides/experiences — narrower usefulness (an agent that can't recommend a bookable
experience isn't doing the job a travel-booking agent exists to do), and the master
spec's charter explicitly lists all three.

### D-R4-2 · Free-text chat with tool-calling, not a structured intake form

**Chosen** (user-confirmed): the `/agent` route is a conversational `streamText()` call
exposing three tools (`searchGuides`, `searchArticles`, `searchExperiences`) the model
invokes based on what the traveller says, exactly mirroring the copilot's tool-exposure
shape (`ToolSet` from the `ai` SDK). **Rejected**: a non-conversational destination/
dates/style form with a ranking algorithm and no LLM in the loop — cheaper to run, but
doesn't match "AI Agent" framing and forecloses natural multi-turn refinement ("actually,
somewhere cheaper" as a follow-up message).

### D-R4-3 · Fixed cheap model, no tier policy

Every request uses `anthropic/claude-haiku-4.5` (the same slug the copilot already uses
for its cheapest tier) via the same AI Gateway path — no `policyForTier()`-style
indirection, since travellers have no tier. If cost/quality tuning is needed later, this
is a one-line model-slug change, not an architecture change.

### D-R4-4 · Every conversation is persisted; only sign-in unlocks reading it back

**Chosen** (user-confirmed): two new tables —

```
agent_conversations
  id uuid pk default gen_random_uuid()
  traveler_user_id uuid references auth.users(id)   -- nullable (anon)
  anon_session_id uuid                                -- client-generated, nullable when signed in
  locale text not null
  created_at timestamptz not null default now()

agent_messages
  id uuid pk default gen_random_uuid()
  conversation_id uuid not null references agent_conversations(id) on delete cascade
  role text not null check (role in ('user','assistant'))
  content text not null
  tool_calls jsonb
  rating text check (rating in ('up','down'))          -- null until rated
  created_at timestamptz not null default now()
```

RLS: anon and authenticated get **insert-only** on both tables (same shape as
`agent_waitlist`'s R1C precedent) — no anon SELECT policy on either table, ever. Signed-
in travellers additionally get owner-scoped SELECT (`traveler_user_id = auth.uid()`) on
`agent_conversations` (and a join-scoped SELECT on `agent_messages` via
`conversation_id`), so "sign-in unlocks saved history" is real: the row exists for both
anon and signed-in traffic (satisfaction instrumentation and abuse monitoring work
uniformly), but only a signed-in traveller can ever read their own conversation back —
anon has no lookup mechanism, mirroring the guest-checkout "no email-based cross-booking
lookup" stance from R3. No service-role needed: `useChat()` resends the full message
array from client state each turn, so the server only ever needs to **write** a row per
turn, never read history back to reconstruct context — insert-only RLS is sufficient,
consistent with this program's "minimal service-role surface" invariant (still exactly 2
files use `createSupabaseServiceClient()` after this phase, unchanged from R3C).

**Rejected**: a fully stateless anon path with no DB row at all. Diverges anon/signed-in
behavior more than necessary, and forecloses satisfaction instrumentation (D-R4-5) and
basic abuse visibility for the majority of traffic (anon), which is the traffic most
likely to need it.

### D-R4-5 · Satisfaction instrumentation: thumbs up/down per assistant message

**Chosen** (user-confirmed): a rating control renders under each assistant message,
backed by a `'use server'` action that updates `agent_messages.rating` by id (owner- or
anon-session-scoped update, not a new route). **Rejected**: click-through-only implicit
signal (weaker — a click doesn't confirm quality, a non-click doesn't confirm poor
quality) and the "both" option (real, but strictly more scope than the exit criterion
requires for v1 — click-through instrumentation can be a fast-follow if thumbs data
alone proves insufficient).

### D-R4-6 · Agent-sourced bookings get a new `source_surface: 'agent'`, reusing R3C's attribution mechanism

**Chosen** (user-confirmed): add `'agent'` to `ALLOWED_SOURCE_SURFACES`
(`booking-types.ts`, from R3C) and the live `bookings.source_surface` CHECK constraint
(new migration — never edit R3C's shipped one). When the agent surfaces an experience
link, it carries `?src=agent` through to the booking widget exactly like the guide/
article CTAs already do (D-R3C-3's query-param mechanism, unchanged) — no new
attribution plumbing, just one new enum value flowing through infrastructure that
already exists. `creator_id`/`guide_id` stay null for agent-attributed bookings (the
agent isn't tied to a specific creator the way a guide CTA is) unless the surfaced
experience came from a `search_guides` result that itself named a guide, in which case
plan-phase should decide whether to carry that guide's attribution through too — flagged
here, not resolved, since it's a real but secondary question that doesn't block the
core phase.

### D-R4-7 · `/agent` page becomes the live chat; existing value-prop cards stay as an empty state

**Chosen** (user-confirmed): `AgentLandingView`'s header + 3-card value-prop grid render
above the chat when there are no messages yet (empty state), giving new visitors context
before typing; the `AgentWaitlistForm` and its email-capture action are removed
(superseded — the agent is live now, no need to collect an email for a waitlist). The
homepage's existing waitlist CTA block becomes a "Try AI Agent" link straight to `/agent`
— a copy/link change to an existing homepage section, no new homepage component.

## 3. Security invariants

1. **No service-role expansion.** Agent conversation logging goes through normal
   anon/authenticated insert-only RLS, not a third service-role exception — the
   `createSupabaseServiceClient()` import count stays at exactly 2 files
   (Stripe webhook, Travelpayouts cron) after this phase.
2. **Anon-safe reads follow the established gated-read template** wherever a new RLS
   policy needs to check a related table's status (none anticipated for the three search
   RPCs, since they read already-anon-readable `published` content, but re-confirm at
   plan time against each RPC's actual `SECURITY` mode).
3. **Rate limiting is real, not decorative**: the reused checkout rate-limit RPC/helper
   must actually gate every `/api/agent` POST before any model call, mirroring the
   checkout-session-creation path's placement (after input validation, before the
   expensive/external call).
4. **No anon read-back of conversation history**, ever — this is the concrete meaning of
   "sign-in unlocks saved history," not an incidental gap.
5. **Search-tool failures degrade to empty results, never throw into the model's
   tool-call loop** — same "reads never crash the page" stance as every other public
   query in this codebase.

## 4. Testing

Mirror the copilot's existing test shape: a route test with `streamText`/AI Gateway
mocked, a component test with `useChat` mocked (following whatever pattern
`CreatorCopilotView`'s existing test already uses, if one exists — confirm at plan
time). New migration tests for `search_guides`/`search_experiences` (following
`search_articles`'s own migration test, if one exists — confirm at plan time) plus a
rate-limit test reusing the checkout rate-limit test's structure with a new call site.
i18n parity as usual for new/changed `agent` group keys.

## 5. Out of scope (R4)

"Agent v2" full itinerary assembly (explicit master-spec deferral) · click-through
attribution instrumentation (D-R4-5's rejected "both" option — fast-follow only if
thumbs data proves insufficient) · carrying a searched guide's own creator attribution
through an agent-surfaced booking (D-R4-6's flagged-not-resolved question) · any change
to the creator copilot, `copilot_messages`, or its RLS · multi-language model routing
beyond the single fixed Haiku slug.

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Anon rate-limit table (`checkout_rate_limits`) becomes a shared bottleneck/naming mismatch if reused verbatim for a conceptually different endpoint | Plan phase should confirm whether to reuse the exact same table (rate-limiting is generically "requests per IP per window," arguably fine to share) or add a second `agent_rate_limits` table with the same RPC shape — a real, cheap decision to make explicitly rather than default silently. |
| Building 2 new FTS-backed search RPCs (D-R4-1) is more schema/migration work than the master spec's one-line phase description implies | Sized correctly by scoping this as its own design (this doc) rather than folding it into a smaller estimate — the plan phase should size these as their own tasks, not "extend an existing thing." |
| Agent-recommended experiences could imply bookability that isn't real (same SEO/UX honesty concern as R1-R3) | Search results should only ever surface `published` + bookable-merchant experiences, same filter already used by `getExperiencesForCity` — no new honesty risk if this filter is applied consistently in `search_experiences`. |
| R3C (PR #75) dependency for D-R4-6 | If R3C's merge is delayed significantly, D-R4-6's `ALLOWED_SOURCE_SURFACES` extension can be deferred to a fast-follow without blocking the rest of R4 — it's the one piece of this phase with an external dependency. |

## 7. User action items (outside the codebase)

None identified yet — unlike R2/R3, this phase has no long-lead external dependency
(no new vendor account, no KYC). Confirm at plan time whether the AI Gateway's existing
credentials/quota (already used by the copilot) are sufficient for anon-facing traffic
volume, or whether a separate budget/rate ceiling should be configured on the Gateway
side itself (outside this codebase).
