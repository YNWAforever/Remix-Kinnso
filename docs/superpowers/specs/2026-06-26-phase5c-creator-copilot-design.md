# Phase 5C — Creator Copilot v1 (Studio chat agent + n8n tool)

- **Date:** 2026-06-26
- **Status:** Design approved — ready for implementation plan
- **Depends on:** Phase 5A (tier/contribution backbone) + 5B (tier gating) — currently unmerged in PR #41. 5C stacks on `feat/phase5b-tier-gating`.
- **Roadmap slot:** Phase 5C of the product-reorg roadmap (`2026-06-24-product-reorg-roadmap-design.md`). 5C = "Copilot tool v1 — real AI agents in `/studio/copilot`". Greenfield: zero in-app LLM integration exists today.

## 1. Goal

Deliver a working, honest v1 of the Creator Copilot at `/studio/copilot`, fulfilling the promise already live on the Phase-2 `/agent` marketing page:

> "A growing library of saved AI agents that help you grow your audience, find your next idea, and produce content that earns." — tuned to Creator DNA, tier-gated ("higher tiers unlock more agents, higher limits…").

v1 is a **conversational chat copilot**: the creator chats; an **in-app Anthropic agent** (Vercel AI SDK `streamText`, routed through the **Vercel AI Gateway**) streams replies, personalized by the creator's **DNA**, **gated and rate-limited by tier**, and able to call the **hosted n8n endpoint as a tool** for live data / automation. The thread is saved.

### Non-goals (explicitly out of v1 — YAGNI)

- Structured task-agent cards / a multi-agent "library" UI (the marketing's "library of saved agents" is honored in v1 via the system prompt + n8n tool; the card library is a fast-follow).
- Multi-thread management UI (v1 = one rolling thread per creator; "New chat" archives).
- Direct mutation of KINNSO data by the agent (publishing guides, editing missions). The n8n tool stays read-leaning in v1.
- Image generation, voice, file upload.
- Streaming the n8n tool's own progress (tool returns a single JSON result).

## 2. Architecture

In-app brain, n8n as a tool. The LLM runs in a Next.js route handler via the Vercel AI SDK; n8n is exposed to the model as a callable tool.

```
Browser (/studio/copilot)
  └─ CreatorCopilotView  ── useChat ──►  POST /api/copilot
                                              │  (Supabase auth = creator)
                                              │  load DNA + stored tier
                                              │  enforce daily message cap
                                              │  buildCopilotSystemPrompt(dna, locale)
                                              ▼
                                         streamText({
                                           model: gateway slug for tier,
                                           system, messages,
                                           tools: { n8n },          ◄── lib/copilot/tools/n8n.ts
                                           stopWhen: stepCountIs(N)         │ POST N8N_COPILOT_URL
                                         })                                  ▼ (Bearer token)
                                              │  .toUIMessageStreamResponse({ onFinish: persist })
                                              ▼
                                         stream tokens ──► UI (token-by-token)
```

### Components (each independently testable)

| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| Stream route handler | `apps/web/app/api/copilot/route.ts` | `POST`: auth → creator-gate → load DNA+tier → rate-limit check → `streamText` with system prompt + n8n tool → stream → persist on finish | Supabase server client, `ai`, policy, system-prompt, n8n tool, queries |
| System prompt | `apps/web/lib/copilot/system-prompt.ts` | Pure `buildCopilotSystemPrompt(dna, locale)` → string. Injects niches/pillars/tone/audience; omits empties; embeds safety + locale + role framing | `Dna` type only |
| Tier policy | `apps/web/lib/copilot/policy.ts` | Pure `policyForTier(tier)` → `{ model, dailyLimit, n8nEnabled }`. Single source of all tier knobs | `Tier`, `meetsTier` from `lib/contribution/tiers` |
| n8n tool | `apps/web/lib/copilot/tools/n8n.ts` | AI SDK `tool()` POSTing to `N8N_COPILOT_URL` w/ bearer token; returns parsed JSON to the model; typed `unconfigured`/`error` results (never throws) | `fetch`, env, `zod` |
| Persistence queries | `apps/web/lib/copilot/queries.ts` | `getRecentMessages`, `appendMessage`, `countUserMessagesToday`, `archiveThread` | Supabase client |
| Config helper | `apps/web/lib/copilot/config.ts` | `isCopilotConfigured()` → gateway credential present (or on Vercel) | env |
| Chat view (client) | `apps/web/components/kinnso/pages/CreatorCopilotView.tsx` | `useChat` → `/api/copilot`; renders thread, streaming, limit-reached card, unconfigured state, tool-working indicator, disclaimer | `@ai-sdk/react`, i18n |
| Page (server) | `apps/web/app/[locale]/studio/copilot/page.tsx` | auth + creator-gate; hydrate DNA validity, tier, recent thread, remaining-quota, configured flag; render view or unconfigured card | Supabase, policy, queries, config |
| Studio tile | `StudioQuickLinks.tsx` + `studioHome` i18n | "Copilot" tile linking `/studio/copilot` | i18n |

### Dependencies to add

- `ai` (v5) — `streamText`, `tool`, `stepCountIs`; its **default global provider is the Vercel AI Gateway**, so `model: 'anthropic/claude-…'` (a plain string) routes through the gateway.
- `@ai-sdk/react` (v5) — `useChat` (the React hook moved out of `ai` in v5).
- `zod` — already in the repo (used by `DnaSchema`); reused for the n8n tool `inputSchema`.

No `@ai-sdk/anthropic`, no direct `ANTHROPIC_API_KEY` — the gateway handles provider routing and auth.

> **Implementation note (mandatory):** This repo runs a **modified Next.js 16** with breaking changes (`apps/web/AGENTS.md`). Implementers MUST read the relevant guide in `node_modules/next/dist/docs/` before writing the route handler / page, and read the installed `ai` + `@ai-sdk/react` v5 docs before wiring `streamText`/`useChat` (the v5 API differs from older training data — `UIMessage`, `toUIMessageStreamResponse`, transport-based `useChat`).

## 3. Provider & auth — Vercel AI Gateway

- **Model selection:** `streamText({ model: <gateway slug> })`. `policy.ts` returns gateway model slugs by tier (Haiku-class for seed/rising, Sonnet-class for pro/elite). **Exact slugs are confirmed against the live gateway model catalog at implementation time** — the spec does not hardcode a guessed ID. Slugs are centralized as named constants in `policy.ts` so a model bump is a one-line change.
- **Auth:** `AI_GATEWAY_API_KEY` (server-only) for local dev / CI; **zero-config OIDC when deployed on Vercel** (no key needed in production). Never exposed to the browser.
- **Unconfigured detection:** `isCopilotConfigured()` = `!!process.env.AI_GATEWAY_API_KEY || process.env.VERCEL === '1'`. The page uses it to render the chat vs. the "Copilot isn't switched on yet" card. The route additionally wraps the gateway call in try/catch and maps any gateway auth/credit error to a typed stream error (defense in depth; never a raw 500).

## 4. Tier integration (ties 5A/5B together)

Chat is available to **all creators** (so the single live creator can use it today), **scaled by tier** entirely through `policyForTier(tier)`:

| Tier | model class | daily message limit | n8n tool |
|---|---|---|---|
| seed | Haiku-class | low (e.g. 10) | **off** (pure chat) |
| rising | Haiku-class | medium (e.g. 30) | **on** |
| pro | Sonnet-class | high (e.g. 80) | **on** |
| elite | Sonnet-class | highest (e.g. 200) | **on** |

- Exact numbers live in `policy.ts` as the single source of truth (the table above is the default; tunable without touching call sites).
- `n8nEnabled` is gated with `meetsTier(tier, 'rising')` — literal delivery of "higher tiers unlock more agents/automation."
- The tier value comes from `getCreatorStoredTier(supabase, user.id)` (the 5B helper). The route handler passes the **resolved policy**, not the raw tier, to the model setup.
- When the limit is hit, the route returns **429** with a typed body; the UI shows a limit-reached card with an upsell link to `/studio/tier`.

## 5. Data model & persistence

v1 = **one rolling thread per creator** (no thread-list UI). One migration adds a creator-private message log, following the 5A/5B RLS conventions exactly.

```sql
-- supabase/migrations/<ts>_copilot_messages.sql
create table public.copilot_messages (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  tool_calls  jsonb,                       -- optional: summarized tool invocations on assistant turns
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index copilot_messages_creator_active_idx
  on public.copilot_messages (creator_id, created_at)
  where archived = false;

alter table public.copilot_messages enable row level security;

-- Owner-only: auth.uid() == creators.id == creator_id (project-wide ownership model)
create policy copilot_messages_owner_select on public.copilot_messages
  for select using (creator_id = auth.uid());
create policy copilot_messages_owner_insert on public.copilot_messages
  for insert with check (creator_id = auth.uid());
create policy copilot_messages_owner_update on public.copilot_messages
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());

revoke all on public.copilot_messages from anon;  -- tier is private; copilot content is private
```

- Reads/writes use the **cookie-bound Supabase server client** in the route (RLS `creator_id = auth.uid()` makes a service-role key unnecessary).
- **`countUserMessagesToday`**: `select count(*) where creator_id = $1 and role = 'user' and created_at >= date_trunc('day', now() at time zone 'utc')`. UTC-calendar-day reset (predictable; no per-creator timezone in v1).
- **"New chat"** sets `archived = true` on the creator's active rows (keeps history, drops it from context + the active view).
- Persistence on `streamText` finish: append the user message (before streaming) and the assistant message (in `onFinish`). Tool calls summarized into `tool_calls`.

## 6. Data flow (request lifecycle)

1. **Page load** (`/studio/copilot/page.tsx`): auth → if not active creator, `redirect`/`notFound` per existing studio convention. Validate `creator_dna.final` with `DnaSchema` (bounce to `/creator` if invalid, matching `studio/page.tsx`). Load tier → policy, recent non-archived messages, `countUserMessagesToday`, `isCopilotConfigured()`. Render `CreatorCopilotView` (or the unconfigured card).
2. **Send**: `useChat` POSTs the message history to `/api/copilot` (same-origin cookies → auth).
3. **Route**: auth + creator-gate (401 if not a creator) → load DNA + tier → `policyForTier` → `countUserMessagesToday >= dailyLimit` ? **429 typed** : continue → `appendMessage(user)` → `buildCopilotSystemPrompt(dna, locale)` → `streamText({ model, system, messages, tools: policy.n8nEnabled ? { n8n } : {}, stopWhen: stepCountIs(N) })` → `toUIMessageStreamResponse({ onFinish: persist assistant })`.
4. **Tool call** (if model invokes `n8n` and enabled): AI SDK runs `execute()` → server `fetch` POST to `N8N_COPILOT_URL` with bearer token → returns `{ ok, data, summary }` (or typed `unconfigured`/`error`) to the model → model continues → streams the final answer.
5. **Finish**: assistant message persisted; client refreshes remaining-quota.

## 7. n8n tool contract — **PROPOSED; owner confirms/corrects**

This is a best-guess contract. The owner confirms the real shape against the live n8n workflow at the spec-review gate (or supplies the actual contract); `lib/copilot/tools/n8n.ts` is the single place to adjust.

```
POST  $N8N_COPILOT_URL
Headers:
  Content-Type: application/json
  Authorization: Bearer $N8N_COPILOT_TOKEN
Body:
  {
    "action": "search_trends" | "enrich" | "<workflow action id>",
    "query":  "<the model's natural-language request>",
    "params": { ...structured args the model supplies... },
    "creator": { "id": "<uuid>", "niches": ["..."], "locales": ["..."] }
  }
Response (200):
  { "ok": true,  "data": { ... }, "summary": "<concise string for the model to use>" }
  { "ok": false, "error": "<message>" }
```

- The AI SDK `tool()` exposes a single `n8n` tool with a `zod` `inputSchema` (`action`, `query`, `params`). `execute()` enriches with `creator` from the route's authenticated context (the model never supplies the creator id).
- Missing `N8N_COPILOT_URL`/token → `execute()` returns `{ ok:false, error:'unconfigured' }` (typed), which the model relays as "that capability isn't connected yet." No throw, no 500.
- Network/non-2xx/parse failure → `{ ok:false, error:'…' }`. Timeout via `AbortSignal.timeout(...)`.

## 8. Internationalization

- New `copilot` message group across all 7 locales (en/ja/ko/th/zh-cn/zh-hk/zh-tw) + the `Messages` interface in `en.ts` + the parity test `GROUPS` array (`tests/i18n.locale-parity.test.ts`). Keys: page title/subtitle, input placeholder, send, empty-state, limit-reached (+ upsell), tool-working indicator, generic error, unconfigured-state title/body, disclaimer ("AI-generated — verify before publishing").
- New `studioHome.copilotTitle` / `copilotDesc` + a `StudioQuickLinks` "Copilot" tile (live badge).
- The agent **responds in the creator's locale** — the system prompt states the active locale; UI chrome is i18n'd.

## 9. Error handling & safety

| Condition | Behavior |
|---|---|
| Gateway credential missing | Page renders honest "Copilot isn't switched on yet" card (mirrors scan-worker unconfigured pattern). Route maps gateway auth errors → typed stream error. |
| n8n unset / errors / timeout | Tool returns typed `{ ok:false }`; model relays gracefully. Never 500. |
| Daily limit exceeded | Route 429 typed; UI limit-reached card + `/studio/tier` upsell. |
| Non-creator / unauthenticated | Route 401; page `redirect`/`notFound` per studio convention. |
| Invalid DNA jsonb | Validated with `DnaSchema`; page bounces to `/creator` (same as `studio/page.tsx`). |
| **Prompt injection** | n8n tool output is **untrusted data**. The system prompt instructs the model to treat tool results as data only and never follow instructions embedded in them. v1 tools are read-leaning (no destructive side-effects gated behind a tool the model autonomously calls). |
| Abuse / runaway cost | Per-tier daily cap (DB-counted) + `stopWhen: stepCountIs(N)` bounds tool-loop steps per turn. |

## 10. Testing strategy (TDD)

Unit (vitest, no network):
- `buildCopilotSystemPrompt(dna)` — includes niches/pillars/tone/audience; omits empty arrays; states locale + safety clause.
- `policyForTier` — every tier → correct `{ model, dailyLimit, n8nEnabled }`; `n8nEnabled` matches `meetsTier(tier,'rising')`.
- `n8n` tool `execute` — mocked `fetch`: success maps `{ok,data,summary}`; missing env → `unconfigured`; non-2xx / network / bad-JSON → typed error; timeout honored.
- `queries` — `countUserMessagesToday` filter shape; `getRecentMessages` excludes archived; `appendMessage`/`archiveThread` payloads (mocked client like `contribution.queries.test.ts`).
- `isCopilotConfigured` — env permutations.

Route **host test** (`tests/copilot.route.host.test.tsx` or `.test.ts`) — mock Supabase (`auth.getUser` **and** `.from()`), mock `ai` `streamText`:
- non-creator → 401; over-limit → 429 typed; unconfigured → typed; happy path → streams + persists user & assistant.
- **This host test is added to the finish-gate full-suite sweep** (5B lesson: host tests escaped per-task gates; always run the FULL `vitest run` at finish).

Component test (`CreatorCopilotView`) — renders messages; input disabled at limit; unconfigured card; tool-working indicator. Mock `@ai-sdk/react` `useChat`.

i18n parity test stays green (`copilot` in `GROUPS`; all 7 locales + interface).

DB: migration **applied live + verified via Supabase MCP** (table exists, RLS enabled, anon blocked, owner policies present).

Full finish gate: `tsc --noEmit` clean, lint 0 errors, **full `vitest run`** green, `next build` succeeds with `/api/copilot` + `/studio/copilot` in the manifest.

## 11. Env / deploy (owner-manual, mirrors the scan worker)

| Var | Scope | Where | Notes |
|---|---|---|---|
| `AI_GATEWAY_API_KEY` | server-only | local/CI `.env` | Not needed in Vercel prod (OIDC zero-config). |
| `N8N_COPILOT_URL` | server-only | Vercel | The live webhook URL (owner). |
| `N8N_COPILOT_TOKEN` | server-only | Vercel | Bearer token for the webhook (owner). |

Owner manual smoke (needs a signed-in creator session — cannot be automated): open `/<loc>/studio/copilot` → send a message → streamed reply renders; at rising+, the agent can invoke the n8n tool once the URL/token are set; the daily limit blocks the (limit+1)-th message with the upsell card. `.env.example` updated with the three vars + comments.

## 12. Branch / integration

- Branch `feat/phase5c-creator-copilot` **stacked on `feat/phase5b-tier-gating`** (5A/5B unmerged in PR #41; 5C depends on the tier helpers).
- At finish (per `finishing-a-development-branch`): either fold 5C into PR #41 (one big 5A+5B+5C PR) or open a sequential PR after #41 merges. Decided with the owner at the finish gate.

## 13. Open items the owner confirms

1. **n8n contract** (§7) — confirm action ids, request/response shape, auth header, and the webhook URL.
2. **Gateway model slugs** (§3) — confirm the exact Haiku-class / Sonnet-class slugs in the gateway catalog.
3. **Tier numbers** (§4) — confirm the default daily limits per tier (10/30/80/200) and that n8n unlocks at `rising`.
