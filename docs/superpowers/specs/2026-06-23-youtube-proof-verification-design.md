# YouTube Proof Verification — Design Spec

**Date:** 2026-06-23
**Status:** Approved (brainstorming) → ready for implementation plan
**Depends on:** Creator Missions Journey Stage C (`mission_verification_jobs`, `mission_social_snapshots`, the `/verify-submission` worker route, the `SubmissionVerification` polling client). This spec extends that pipeline to a third platform; it changes no UI states and adds no i18n keys.

## Goal

Let a creator submit a **YouTube video URL** as milestone proof and have the scan worker auto-verify that the video belongs to the creator's registered YouTube channel — reusing the existing Instagram/Threads verification machinery (job lifecycle, snapshot, realtime polling, graceful degradation) rather than building a parallel path.

## Context — what already exists

- `creator_social_handles.platform` CHECK already allows `('instagram','youtube','threads')` — creators can already register a YouTube handle (onboarding has a YouTube handle step). **No change needed there.**
- `apps/scan/src/fetchers.ts` already has a working `YouTubeFetcher` (Data API v3, `channels?forHandle=`) used by the **creator-profile scan**, plus `FAKE_PAYLOADS.youtube` and a `redactUrl` helper that already strips the `key=` query param from logs. The worker is configured with `YOUTUBE_API_KEY`.
- The verification pipeline (`verify.ts`) is platform-uniform: load submission → `fetchPost(platform, id)` → `resolveConfidence(post, creatorHandle)` → write snapshot. Failure to fetch yields `confidence_status='unavailable'` and the job still completes `ready` (merchant manual review closes the loop).

What is missing for **verification** (as opposed to the profile scan): YouTube proof-URL parsing, a single-video `fetchPost`, channel-ID resolution, the match logic, type widening, web-validation acceptance, and the platform CHECK migration.

## Scope

**In:** single YouTube video URL proof; URL forms `https://www.youtube.com/watch?v=ID`, `https://youtu.be/ID`, `https://www.youtube.com/shorts/ID` (also `m.youtube.com`); hybrid ID-then-handle author match; snapshot `platform='youtube'`; reuse of all existing job/snapshot/polling code and the `unavailable` degradation path.

**Out (YAGNI / follow-ups):** other platforms (TikTok, etc.); playlist/channel/Short-with-no-video-id proofs; backfilling existing snapshots; any new UI state, copy, or i18n key; engagement-threshold logic (engagement is captured best-effort but not gated on).

## Architecture

A YouTube verification differs from IG/Threads only in (a) URL parsing and (b) how the post author is matched to the creator. Everything else — the job row, the snapshot row, the worker route, the browser polling — is unchanged. The match difference is absorbed by one optional parameter on `resolveConfidence`; the parsing and fetch differences are absorbed inside the existing fetcher classes.

### 1. Proof URL parsing

Both `apps/web/lib/missions/proof-url.ts` and `apps/scan/src/proof-url.ts` (currently byte-identical duplicates) gain a YouTube branch. `ProofPlatform` becomes `'instagram' | 'threads' | 'youtube'`.

YouTube extraction rules (host compared after stripping a leading `www.`/`m.`):
- host `youtube.com`: if path is `watch`, id = `searchParams.get('v')`; if path starts `shorts/<id>` or `embed/<id>` or `live/<id>`, id = that segment.
- host `youtu.be`: id = first path segment.
- An 11-char-ish video id is accepted as-is (no strict length gate — return whatever non-empty id is extracted; an invalid id simply fails the fetch → `unavailable`).
- No `v` param / no id segment → `null` (→ web validation `url` error).

The two files stay identical; both get the same branch.

### 2. Fetcher changes (`apps/scan/src/fetchers.ts`)

**`SinglePostResult`** gains an optional field:
```ts
export type SinglePostResult = {
  authorHandle: string | null   // IG/Threads username; YouTube channel customUrl, e.g. '@mychannel' (resolveConfidence normalizes)
  authorId?: string | null      // YouTube channelId (UC…); unset/null for IG/Threads
  engagementCount: number | null
  postUrl: string | null
}
```

**`PostFetcher`** interface:
```ts
export interface PostFetcher {
  fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null>
  // Resolve a creator's registered handle to a canonical channel id. YouTube-only;
  // non-YouTube implementations return null. Used for the ID-first match.
  resolveChannelId(handle: string): Promise<string | null>
}
```

**`YouTubeFetcher`** gains:
- `async fetchVideoAuthor(id): Promise<SinglePostResult | null>`
  - `GET /videos?part=snippet,statistics&id=<id>&key=` → `items[0].snippet.channelId`, `.channelTitle`, `items[0].statistics.likeCount|viewCount`. No item → `null`.
  - `GET /channels?part=snippet&id=<channelId>&key=` → `items[0].snippet.customUrl` (e.g. `@mychannel`). Best-effort; on failure leave `authorHandle = null` (ID match can still succeed).
  - Returns `{ authorHandle: customUrl, authorId: channelId, engagementCount: likeCount ?? viewCount ?? null, postUrl: 'https://www.youtube.com/watch?v='+id }` (raw customUrl; `resolveConfidence` normalizes).
  - Whole method wrapped so any throw/parse failure → `null` (mirrors `RapidApiFetcher.fetchPost`).
- `async resolveChannelId(handle): Promise<string | null>`
  - `GET /channels?part=id&forHandle=@<handle>&key=` → `items[0].id`. Any failure/no item → `null`.

**`RapidApiFetcher`**: `fetchPost` platform type widened (still only handles instagram/threads — a `youtube` call should never reach it); add `async resolveChannelId() { return null }` to satisfy the interface.

**`CompositeFetcher`**:
- `fetchPost(platform, id)`: `youtube` → `this.youtube.fetchVideoAuthor(id)`; else → `this.rapidApi.fetchPost(platform, id)`.
- `resolveChannelId(handle)`: → `this.youtube.resolveChannelId(handle)`.

**`FakeFetcher`** + `FAKE_POSTS`: add a `youtube` canned post `{ authorHandle: 'fakeytchannel', authorId: 'UCfakechannelid', engagementCount: 999, postUrl: 'https://www.youtube.com/watch?v=<id>' }`; `resolveChannelId(handle)` returns a canned id (default `'UCfakechannelid'`, overridable) so ID-match tests are deterministic; honor `failPlatforms`/`postOverrides` as today.

### 3. Match logic (`apps/scan/src/handle-match.ts`)

`resolveConfidence` gains an optional third parameter. Truth table:

| post | ID match (`authorId === expectedId`, both non-empty) | handle match (`norm(authorHandle) === norm(creatorHandle)`, both non-empty) | result |
|---|---|---|---|
| `null` | — | — | `unavailable` |
| present | true | — | `verified_signal` |
| present | false/NA | true | `verified_signal` |
| present | false/NA | false/NA | `needs_review` |

```ts
export function resolveConfidence(
  post: SinglePostResult | null,
  creatorHandle: string | null,
  expectedId: string | null = null,
): Confidence {
  if (!post) return 'unavailable'
  if (post.authorId && expectedId && post.authorId.trim() === expectedId.trim()) return 'verified_signal'
  const author = normalizeHandle(post.authorHandle)
  const expected = normalizeHandle(creatorHandle)
  if (author && expected && author === expected) return 'verified_signal'
  return 'needs_review'
}
```
Channel ids are compared trimmed, **case-sensitively** (they are opaque case-sensitive tokens). IG/Threads callers omit `expectedId`, so their behavior is byte-for-byte unchanged.

### 4. Verify pipeline (`apps/scan/src/verify.ts`)

After `fetchPost`, resolve the creator's channel id **only for youtube**, then pass it through:
```ts
const post = await deps.fetcher.fetchPost(parsed.platform, parsed.id)
const expectedId = parsed.platform === 'youtube'
  ? await deps.fetcher.resolveChannelId(creatorHandle)
  : null
const confidence = resolveConfidence(post, creatorHandle, expectedId)
```
`resolveChannelId` is itself best-effort (returns `null` on failure); a `null` `expectedId` simply means the match falls through to the handle path. No new failure modes — the existing null-platform / missing-submission / missing-participant guards from Stage C are unchanged.

### 5. Web validation (`apps/web/lib/missions/validation.ts`)

`validateSubmission` already calls `parseProofUrl`. With YouTube now parseable, a YouTube URL yields a valid `{platform:'youtube', ...}` and is accepted; the `proofUrl: 'unsupported'` branch (if it enumerates allowed platforms) must include `youtube`. If validation relies solely on `parseProofUrl` returning non-null, no change beyond the parser is needed — to be confirmed when the file is read during planning.

### 6. Generated DB types (`packages/db/types.ts`)

If the `platform` columns of `mission_social_snapshots` / `mission_verification_jobs` are emitted as string-literal unions, widen them to include `'youtube'`. If emitted as plain `string`, no change. Confirm during planning.

## Migration (gated production step)

One additive migration `supabase/migrations/20260619000004_allow_youtube_verification.sql` (next free index after `20260619000003`) extending two CHECK constraints:

```sql
alter table public.mission_social_snapshots
  drop constraint if exists mission_social_snapshots_platform_check,
  add constraint mission_social_snapshots_platform_check
    check (platform in ('instagram','threads','youtube'));

alter table public.mission_verification_jobs
  drop constraint if exists mission_verification_jobs_platform_check,
  add constraint mission_verification_jobs_platform_check
    check (platform in ('instagram','threads','youtube'));
```

The constraint names above are Postgres defaults (`<table>_<column>_check`); **verify the actual names against the live DB before applying** (via the Supabase MCP) and adjust the `drop constraint if exists` target if they differ. Applied to the live project `scryfkefedzuetfdtrvl` via the Supabase MCP, with an explicit pause for the user's OK before applying (per the established gated-migration protocol).

## Error handling & degradation

No new failure modes. Every new network call (`fetchVideoAuthor`'s two GETs, `resolveChannelId`'s GET) is best-effort and resolves to `null`, which flows to `confidence_status='unavailable'` (post null) or `needs_review` (author/id unresolved), with the job still marked `ready`. Secrets in URLs continue to be redacted from logs by the existing `redactUrl`.

## Testing (TDD)

- **proof-url (web + worker):** `watch?v=`, `youtu.be/`, `/shorts/` → `{platform:'youtube', id}`; malformed/no-id → `null`; existing IG/Threads cases still pass.
- **resolveConfidence:** ID match → `verified_signal`; ID mismatch + handle match → `verified_signal`; both mismatch → `needs_review`; `post=null` → `unavailable`; **IG/Threads (no `expectedId`) unchanged** (regression).
- **YouTube fetchPost (FakeFetcher):** returns `authorId` + `authorHandle`; `failPlatforms:['youtube']` → `null`.
- **resolveChannelId (FakeFetcher):** returns canned id; non-youtube fetchers return `null`.
- **verify pipeline:** youtube submission → snapshot `platform='youtube'` with the confidence dictated by the FakeFetcher's id/handle; null fetch → `unavailable` + job `ready`.
- **web validation:** a youtube URL passes `validateSubmission`; a non-video youtube URL fails with `url`.

## Out of scope / follow-ups

- Updating the `missionDetail.proofUrlPlaceholder` example (still an Instagram URL) — cosmetic; left as-is.
- TikTok or other platforms.
- Engagement-based gating.
