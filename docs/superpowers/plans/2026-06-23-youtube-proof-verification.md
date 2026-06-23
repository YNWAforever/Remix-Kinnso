# YouTube Proof Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let creators submit a YouTube video URL as milestone proof and have the scan worker auto-verify the video belongs to their registered channel, extending the existing Instagram/Threads verification pipeline.

**Architecture:** Reuse the Stage C job/snapshot/polling machinery unchanged. YouTube differs only in (a) proof-URL parsing and (b) author matching: a hybrid channel-ID-then-@handle match absorbed by one optional `expectedId` param on `resolveConfidence`. The real network calls live inside the existing `YouTubeFetcher`; everything degrades to `unavailable`/`needs_review` on failure.

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, Hono worker (`apps/scan`), Next.js (`apps/web`), Supabase/Postgres, YouTube Data API v3.

**Spec:** `docs/superpowers/specs/2026-06-23-youtube-proof-verification-design.md`

**Worktree:** `/Users/willylai/Documents/Claude/Projects/kinnso-v3-missions-journey`, branch `feat/creator-missions-journey`. All commands run from there.

**Test commands:**
- Worker (no env needed): `cd apps/scan && pnpm vitest run tests/<file> --no-file-parallelism`
- Web (dummy Supabase env required): prefix with
  `SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy`
  then `cd apps/web && <prefix> pnpm vitest run tests/<file> --no-file-parallelism`
- Typecheck: `cd apps/scan && pnpm typecheck` and `cd apps/web && pnpm typecheck`

---

## File Map

| File | Change |
|---|---|
| `apps/web/lib/missions/proof-url.ts` | add YouTube parsing; widen `ProofPlatform` |
| `apps/scan/src/proof-url.ts` | identical change (duplicate file) |
| `apps/scan/src/handle-match.ts` | `resolveConfidence` gains optional `expectedId`; ID-then-handle |
| `apps/scan/src/fetchers.ts` | `SinglePostResult.authorId`; `PostFetcher.resolveChannelId` + youtube in `fetchPost`; `YouTubeFetcher.fetchVideoAuthor`/`resolveChannelId`; `CompositeFetcher` dispatch; `RapidApiFetcher.resolveChannelId`; `FakeFetcher`/`FAKE_POSTS` youtube |
| `apps/scan/src/verify.ts` | widen `platform` cast; resolve `expectedId` for youtube; pass to `resolveConfidence` |
| `supabase/migrations/20260619000004_allow_youtube_verification.sql` | new; extend two platform CHECKs (gated) |

**No change needed** (verified): `apps/scan/src/verify-server.ts` (`platform: parsed?.platform ?? null` already), `apps/web/lib/missions/validation.ts` (delegates to `parseProofUrl`), `apps/web/lib/missions/actions.ts` / `verify-client.ts` (no platform gate), `packages/db/types.ts` (`platform: string`, not a literal union).

---

## Task 1: YouTube proof-URL parsing (worker + web)

**Files:**
- Modify: `apps/scan/src/proof-url.ts`
- Modify: `apps/web/lib/missions/proof-url.ts`
- Test: `apps/scan/tests/proof-url.unit.test.ts` (update + add)
- Test: `apps/web/tests/mission.proof-url.test.ts` (update + add)
- Test: `apps/web/tests/mission.validation.test.ts` (update existing "unsupported" case)

- [ ] **Step 1: Update the worker proof-url test — YouTube now parses, tiktok is the unsupported case**

Replace the whole file `apps/scan/tests/proof-url.unit.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { parseProofUrl } from '../src/proof-url'

describe('parseProofUrl (worker)', () => {
  it('parses an Instagram post', () => {
    expect(parseProofUrl('https://www.instagram.com/p/Cabc/')).toEqual({ platform: 'instagram', id: 'Cabc' })
  })
  it('parses a Threads post', () => {
    expect(parseProofUrl('https://www.threads.net/@u/post/Xyz')).toEqual({ platform: 'threads', id: 'Xyz' })
  })
  it('parses a YouTube watch URL', () => {
    expect(parseProofUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ platform: 'youtube', id: 'dQw4w9WgXcQ' })
  })
  it('parses a youtu.be short link', () => {
    expect(parseProofUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ platform: 'youtube', id: 'dQw4w9WgXcQ' })
  })
  it('parses a YouTube Shorts URL', () => {
    expect(parseProofUrl('https://www.youtube.com/shorts/abc123')).toEqual({ platform: 'youtube', id: 'abc123' })
  })
  it('rejects unsupported', () => {
    expect(parseProofUrl('https://www.tiktok.com/@u/video/123')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the worker test to verify it fails**

Run: `cd apps/scan && pnpm vitest run tests/proof-url.unit.test.ts --no-file-parallelism`
Expected: FAIL — the three YouTube cases return `null`.

- [ ] **Step 3: Implement YouTube parsing in the worker parser**

Replace the whole file `apps/scan/src/proof-url.ts` with:

```ts
export type ProofPlatform = 'instagram' | 'threads' | 'youtube'

export type ParsedProofUrl = { platform: ProofPlatform; id: string }

export function parseProofUrl(input: string): ParsedProofUrl | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(?:www|m)\./i, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'instagram.com') {
    const i = parts.findIndex((p) => p === 'p' || p === 'reel' || p === 'reels')
    if (i >= 0 && parts[i + 1]) return { platform: 'instagram', id: parts[i + 1] }
    return null
  }

  if (host === 'threads.net' || host === 'threads.com') {
    const i = parts.findIndex((p) => p === 'post')
    if (i >= 0 && parts[i + 1]) return { platform: 'threads', id: parts[i + 1] }
    return null
  }

  if (host === 'youtube.com') {
    if (parts[0] === 'watch') {
      const v = url.searchParams.get('v')
      return v ? { platform: 'youtube', id: v } : null
    }
    const i = parts.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'live')
    if (i >= 0 && parts[i + 1]) return { platform: 'youtube', id: parts[i + 1] }
    return null
  }

  if (host === 'youtu.be') {
    return parts[0] ? { platform: 'youtube', id: parts[0] } : null
  }

  return null
}
```

- [ ] **Step 4: Run the worker test to verify it passes**

Run: `cd apps/scan && pnpm vitest run tests/proof-url.unit.test.ts --no-file-parallelism`
Expected: PASS (6/6).

- [ ] **Step 5: Update the web proof-url test**

In `apps/web/tests/mission.proof-url.test.ts`, replace the test:

```ts
  it('returns null for an unsupported (YouTube) URL', () => {
    expect(parseProofUrl('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
  })
```

with:

```ts
  it('parses a YouTube watch URL', () => {
    expect(parseProofUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ platform: 'youtube', id: 'dQw4w9WgXcQ' })
  })
  it('parses a youtu.be short link', () => {
    expect(parseProofUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ platform: 'youtube', id: 'dQw4w9WgXcQ' })
  })
  it('parses a YouTube Shorts URL', () => {
    expect(parseProofUrl('https://www.youtube.com/shorts/abc123')).toEqual({ platform: 'youtube', id: 'abc123' })
  })
  it('returns null for an unsupported (TikTok) URL', () => {
    expect(parseProofUrl('https://www.tiktok.com/@u/video/123')).toBeNull()
  })
```

- [ ] **Step 6: Update the web validation test (YouTube no longer "unsupported")**

In `apps/web/tests/mission.validation.test.ts`, replace the test at the `validateSubmission` block:

```ts
  it('rejects an unsupported platform URL', () => {
    const r = validateSubmission({ proofUrl: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('unsupported')
  })
```

with:

```ts
  it('rejects an unsupported platform URL', () => {
    const r = validateSubmission({ proofUrl: 'https://www.tiktok.com/@u/video/123' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('unsupported')
  })
  it('accepts a YouTube proof URL', () => {
    expect(validateSubmission({ proofUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).ok).toBe(true)
  })
```

(The surrounding `validateSubmission` block already keeps the line numbers around 197; match on the test text, not the line number.)

- [ ] **Step 7: Run the web proof-url + validation tests to verify they fail**

Run (with the web env prefix):
`cd apps/web && <prefix> pnpm vitest run tests/mission.proof-url.test.ts tests/mission.validation.test.ts --no-file-parallelism`
Expected: FAIL — YouTube cases not yet parsing in the web parser.

- [ ] **Step 8: Implement YouTube parsing in the web parser**

Replace the whole file `apps/web/lib/missions/proof-url.ts` with the **exact same content** as the worker `apps/scan/src/proof-url.ts` from Step 3 (the two files are intentionally byte-identical).

- [ ] **Step 9: Run the web tests to verify they pass**

Run: `cd apps/web && <prefix> pnpm vitest run tests/mission.proof-url.test.ts tests/mission.validation.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/scan/src/proof-url.ts apps/web/lib/missions/proof-url.ts apps/scan/tests/proof-url.unit.test.ts apps/web/tests/mission.proof-url.test.ts apps/web/tests/mission.validation.test.ts
git commit -m "feat(missions): parse YouTube proof URLs (watch/youtu.be/shorts)"
```

---

## Task 2: Hybrid match in `resolveConfidence`

**Files:**
- Modify: `apps/scan/src/fetchers.ts` (add `authorId?` to `SinglePostResult`)
- Modify: `apps/scan/src/handle-match.ts`
- Test: `apps/scan/tests/handle-match.unit.test.ts`

- [ ] **Step 1: Write failing tests for the ID-then-handle logic**

Append these tests inside the existing `describe('resolveConfidence', ...)` block in `apps/scan/tests/handle-match.unit.test.ts`:

```ts
  it('verified_signal via channel-id match even when handles differ', () => {
    expect(
      resolveConfidence(
        { authorHandle: 'whatever', authorId: 'UCabc', engagementCount: null, postUrl: null },
        'some-handle',
        'UCabc',
      ),
    ).toBe('verified_signal')
  })
  it('falls back to handle match when channel ids differ', () => {
    expect(
      resolveConfidence(
        { authorHandle: '@Traveler', authorId: 'UCother', engagementCount: null, postUrl: null },
        'traveler',
        'UCmine',
      ),
    ).toBe('needs_review')
  })
  it('verified_signal via handle when no expectedId is given (IG/Threads unchanged)', () => {
    expect(
      resolveConfidence({ authorHandle: '@Traveler', authorId: 'UCother', engagementCount: null, postUrl: null }, 'traveler'),
    ).toBe('verified_signal')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/scan && pnpm vitest run tests/handle-match.unit.test.ts --no-file-parallelism`
Expected: FAIL — `resolveConfidence` takes only 2 args / ignores `authorId`; first new test returns `needs_review`.

- [ ] **Step 3: Add `authorId` to `SinglePostResult`**

In `apps/scan/src/fetchers.ts`, change the `SinglePostResult` type to:

```ts
export type SinglePostResult = {
  authorHandle: string | null
  authorId?: string | null
  engagementCount: number | null
  postUrl: string | null
}
```

- [ ] **Step 4: Implement the hybrid match**

Replace the `resolveConfidence` function in `apps/scan/src/handle-match.ts` with:

```ts
export function resolveConfidence(
  post: SinglePostResult | null,
  creatorHandle: string | null,
  expectedId: string | null = null,
): Confidence {
  if (!post) return 'unavailable'
  // ID-first: canonical channel-id match (YouTube). Channel ids are opaque,
  // case-sensitive tokens — compare trimmed, exact case.
  if (post.authorId && expectedId && post.authorId.trim() === expectedId.trim()) {
    return 'verified_signal'
  }
  // Handle fallback (IG/Threads always; YouTube when ids unavailable/mismatched).
  const author = normalizeHandle(post.authorHandle)
  const expected = normalizeHandle(creatorHandle)
  if (author && expected && author === expected) return 'verified_signal'
  return 'needs_review'
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/scan && pnpm vitest run tests/handle-match.unit.test.ts --no-file-parallelism`
Expected: PASS (all old + 3 new).

- [ ] **Step 6: Commit**

```bash
git add apps/scan/src/handle-match.ts apps/scan/src/fetchers.ts apps/scan/tests/handle-match.unit.test.ts
git commit -m "feat(scan): hybrid channel-id-then-handle match in resolveConfidence"
```

---

## Task 3: `YouTubeFetcher` single-video + channel-id methods

**Files:**
- Modify: `apps/scan/src/fetchers.ts` (add two methods to `YouTubeFetcher`)
- Test: `apps/scan/tests/fetchers.youtube.unit.test.ts` (new)

- [ ] **Step 1: Write failing mocked-fetch tests**

Create `apps/scan/tests/fetchers.youtube.unit.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YouTubeFetcher } from '../src/fetchers'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('YouTubeFetcher.fetchVideoAuthor', () => {
  it('returns channelId, customUrl handle, and engagement for a video', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/videos')) {
        return jsonResponse({ items: [{ snippet: { channelId: 'UCabc' }, statistics: { likeCount: '42', viewCount: '1000' } }] })
      }
      if (url.includes('/channels')) {
        return jsonResponse({ items: [{ snippet: { customUrl: '@traveler' } }] })
      }
      return jsonResponse({}, false, 404)
    })
    vi.stubGlobal('fetch', fetchMock)
    const f = new YouTubeFetcher('key')
    expect(await f.fetchVideoAuthor('vid123')).toEqual({
      authorHandle: '@traveler',
      authorId: 'UCabc',
      engagementCount: 42,
      postUrl: 'https://www.youtube.com/watch?v=vid123',
    })
  })

  it('returns null when the video has no channelId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })))
    expect(await new YouTubeFetcher('key').fetchVideoAuthor('vid')).toBeNull()
  })

  it('still returns the id-only result when the channel customUrl call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/videos')
        ? jsonResponse({ items: [{ snippet: { channelId: 'UCabc' }, statistics: {} }] })
        : jsonResponse({}, false, 500),
    ))
    const post = await new YouTubeFetcher('key').fetchVideoAuthor('vid')
    expect(post).toEqual({ authorHandle: null, authorId: 'UCabc', engagementCount: null, postUrl: 'https://www.youtube.com/watch?v=vid' })
  })
})

describe('YouTubeFetcher.resolveChannelId', () => {
  it('resolves a handle to a channel id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [{ id: 'UCabc' }] })))
    expect(await new YouTubeFetcher('key').resolveChannelId('@traveler')).toBe('UCabc')
  })
  it('returns null when no channel matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })))
    expect(await new YouTubeFetcher('key').resolveChannelId('@nobody')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/scan && pnpm vitest run tests/fetchers.youtube.unit.test.ts --no-file-parallelism`
Expected: FAIL — `fetchVideoAuthor`/`resolveChannelId` do not exist on `YouTubeFetcher`.

- [ ] **Step 3: Implement the two methods**

In `apps/scan/src/fetchers.ts`, add these two methods to the `YouTubeFetcher` class (after its existing `fetch` method, before the closing brace):

```ts
  // Single-video author lookup for mission proof verification. Best-effort:
  // any failure resolves to null (treated as confidence 'unavailable').
  async fetchVideoAuthor(id: string): Promise<SinglePostResult | null> {
    try {
      const vurl =
        `${YOUTUBE_BASE}/videos?part=snippet,statistics` +
        `&id=${encodeURIComponent(id)}&key=${encodeURIComponent(this.apiKey)}`
      const vres = await fetchWithRetry(vurl, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!vres.ok) return null
      const vbody = (await vres.json()) as {
        items?: Array<{ snippet?: { channelId?: string }; statistics?: { likeCount?: string; viewCount?: string } }>
      }
      const item = vbody.items?.[0]
      const channelId = item?.snippet?.channelId ?? null
      if (!channelId) return null
      const likes = Number(item?.statistics?.likeCount ?? NaN)
      const views = Number(item?.statistics?.viewCount ?? NaN)
      const engagementCount = Number.isFinite(likes) ? likes : Number.isFinite(views) ? views : null

      // Best-effort customUrl (@handle) for the handle-fallback match.
      let authorHandle: string | null = null
      try {
        const curl =
          `${YOUTUBE_BASE}/channels?part=snippet` +
          `&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(this.apiKey)}`
        const cres = await fetchWithRetry(curl, { method: 'GET', headers: { Accept: 'application/json' } })
        if (cres.ok) {
          const cbody = (await cres.json()) as { items?: Array<{ snippet?: { customUrl?: string } }> }
          authorHandle = cbody.items?.[0]?.snippet?.customUrl ?? null
        }
      } catch (err) {
        console.warn(`[scan] youtube customUrl fetch failed for "${channelId}"`, (err as Error).message)
      }

      return { authorHandle, authorId: channelId, engagementCount, postUrl: `https://www.youtube.com/watch?v=${id}` }
    } catch (err) {
      console.warn(`[scan] youtube fetchVideoAuthor failed for "${id}"`, (err as Error).message)
      return null
    }
  }

  // Resolve a creator's registered @handle to its canonical channel id (UC…).
  // Best-effort: returns null on any failure.
  async resolveChannelId(handle: string): Promise<string | null> {
    try {
      const forHandle = handle.startsWith('@') ? handle : `@${handle}`
      const url =
        `${YOUTUBE_BASE}/channels?part=id` +
        `&forHandle=${encodeURIComponent(forHandle)}&key=${encodeURIComponent(this.apiKey)}`
      const res = await fetchWithRetry(url, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      const body = (await res.json()) as { items?: Array<{ id?: string }> }
      return body.items?.[0]?.id ?? null
    } catch (err) {
      console.warn(`[scan] youtube resolveChannelId failed for "${handle}"`, (err as Error).message)
      return null
    }
  }
```

(`YOUTUBE_BASE`, `fetchWithRetry`, and `SinglePostResult` are all already defined in this file.)

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/scan && pnpm vitest run tests/fetchers.youtube.unit.test.ts --no-file-parallelism`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add apps/scan/src/fetchers.ts apps/scan/tests/fetchers.youtube.unit.test.ts
git commit -m "feat(scan): YouTubeFetcher fetchVideoAuthor + resolveChannelId"
```

---

## Task 4: Fetcher plumbing (interface, composite, fakes)

**Files:**
- Modify: `apps/scan/src/fetchers.ts` (`PostFetcher`, `RapidApiFetcher`, `CompositeFetcher`, `FakeFetcher`, `FAKE_POSTS`)
- Test: `apps/scan/tests/fetchers.fetchpost.unit.test.ts` (add)

- [ ] **Step 1: Write failing tests for youtube fake post + resolveChannelId**

Append to `apps/scan/tests/fetchers.fetchpost.unit.test.ts` (inside `describe('FakeFetcher.fetchPost', ...)` add the first; add the second as a new `describe`):

```ts
  it('returns a deterministic post for youtube with a channel id', async () => {
    const f = new FakeFetcher()
    const post = await f.fetchPost('youtube', 'vid123')
    expect(post).toEqual({ authorHandle: 'fakeytchannel', authorId: 'UCfakechannelid', engagementCount: 999, postUrl: 'https://www.youtube.com/watch?v=vid123' })
  })
```

```ts
describe('FakeFetcher.resolveChannelId', () => {
  it('returns the canned channel id by default', async () => {
    expect(await new FakeFetcher().resolveChannelId('@x')).toBe('UCfakechannelid')
  })
  it('honors a channel-id override', async () => {
    expect(await new FakeFetcher({}, [], {}, 'UCcustom').resolveChannelId('@x')).toBe('UCcustom')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/scan && pnpm vitest run tests/fetchers.fetchpost.unit.test.ts --no-file-parallelism`
Expected: FAIL — `fetchPost('youtube', …)` not allowed / `resolveChannelId` missing on `FakeFetcher`.

- [ ] **Step 3: Widen the `PostFetcher` interface**

In `apps/scan/src/fetchers.ts`, replace the `PostFetcher` interface with:

```ts
export interface PostFetcher {
  // Returns null on any fetch/parse failure — callers treat null as 'unavailable'.
  fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null>
  // Resolve a creator's registered handle to a canonical channel id. YouTube-only;
  // non-YouTube fetchers return null. Used for the ID-first match.
  resolveChannelId(handle: string): Promise<string | null>
}
```

- [ ] **Step 4: Update `RapidApiFetcher`**

In `RapidApiFetcher`, widen the `fetchPost` signature and guard youtube, then add `resolveChannelId`. Change the method signature line:

```ts
  async fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null> {
    if (platform === 'youtube') return null // routed to YouTubeFetcher by CompositeFetcher
    try {
```

(Keep the rest of the existing `fetchPost` body unchanged.) Then add, immediately after `fetchPost`:

```ts
  // RapidAPI handles IG/Threads only; channel-id resolution is YouTube-specific.
  async resolveChannelId(): Promise<string | null> {
    return null
  }
```

- [ ] **Step 5: Update `CompositeFetcher`**

Replace `CompositeFetcher`'s `fetchPost` method and add `resolveChannelId`:

```ts
  fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null> {
    if (platform === 'youtube') return this.youtube.fetchVideoAuthor(id)
    return this.rapidApi.fetchPost(platform, id)
  }

  resolveChannelId(handle: string): Promise<string | null> {
    return this.youtube.resolveChannelId(handle)
  }
```

- [ ] **Step 6: Update `FAKE_POSTS` and `FakeFetcher`**

Replace the `FAKE_POSTS` constant with:

```ts
const FAKE_POSTS: Record<'instagram' | 'threads' | 'youtube', (id: string) => SinglePostResult> = {
  instagram: (id) => ({ authorHandle: 'fake_ig_user', engagementCount: 1234, postUrl: `https://www.instagram.com/p/${id}/` }),
  threads: (id) => ({ authorHandle: 'fake_threads_user', engagementCount: 56, postUrl: `https://www.threads.net/post/${id}` }),
  youtube: (id) => ({ authorHandle: 'fakeytchannel', authorId: 'UCfakechannelid', engagementCount: 999, postUrl: `https://www.youtube.com/watch?v=${id}` }),
}
```

Replace the `FakeFetcher` constructor and add `resolveChannelId`, and widen `fetchPost`:

```ts
export class FakeFetcher implements PlatformFetcher, PostFetcher {
  constructor(
    private readonly overrides: Partial<Record<Platform, unknown>> = {},
    private readonly failPlatforms: Platform[] = [],
    private readonly postOverrides: Partial<Record<'instagram' | 'threads' | 'youtube', SinglePostResult>> = {},
    private readonly channelId: string | null = 'UCfakechannelid',
  ) {}

  async fetch(platform: Platform, _handle: string): Promise<unknown> {
    if (this.failPlatforms.includes(platform)) {
      throw new Error(`FakeFetcher: simulated failure for platform "${platform}"`)
    }
    return this.overrides[platform] ?? FAKE_PAYLOADS[platform]
  }

  async fetchPost(platform: 'instagram' | 'threads' | 'youtube', id: string): Promise<SinglePostResult | null> {
    if (this.failPlatforms.includes(platform)) return null
    if (this.postOverrides[platform]) return this.postOverrides[platform]!
    return FAKE_POSTS[platform](id)
  }

  async resolveChannelId(_handle: string): Promise<string | null> {
    return this.channelId
  }
}
```

- [ ] **Step 7: Run to verify pass + typecheck**

Run:
`cd apps/scan && pnpm vitest run tests/fetchers.fetchpost.unit.test.ts tests/fetchers.unit.test.ts --no-file-parallelism && pnpm typecheck`
Expected: PASS and clean typecheck.

- [ ] **Step 8: Commit**

```bash
git add apps/scan/src/fetchers.ts apps/scan/tests/fetchers.fetchpost.unit.test.ts
git commit -m "feat(scan): wire youtube into PostFetcher (composite + fakes)"
```

---

## Task 5: `verify.ts` — resolve expectedId for youtube

**Files:**
- Modify: `apps/scan/src/verify.ts`
- Test: `apps/scan/tests/verify.unit.test.ts` (add)

- [ ] **Step 1: Write failing youtube verify tests**

Append inside `describe('verifySubmission', ...)` in `apps/scan/tests/verify.unit.test.ts`:

```ts
  it('writes a verified_signal youtube snapshot via channel-id match', async () => {
    const db = makeDb({ platform: 'youtube', proof_url: 'https://www.youtube.com/watch?v=abc' }, 'any-handle')
    await verifySubmission(deps(db), JOB_ID) // FakeFetcher youtube post.authorId === resolveChannelId default
    const snapshot = (db as never as TrackingDb)._inserts.find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.platform).toBe('youtube')
    expect(snapshot.data.confidence_status).toBe('verified_signal')
  })

  it('falls back to handle match for youtube when channel ids differ', async () => {
    const db = makeDb({ platform: 'youtube', proof_url: 'https://www.youtube.com/watch?v=abc' }, 'matchme')
    const fetcher = new FakeFetcher({}, [], { youtube: { authorHandle: 'matchme', authorId: 'UCother', engagementCount: 1, postUrl: null } }, 'UCmine')
    await verifySubmission(deps(db, fetcher), JOB_ID)
    const snapshot = (db as never as TrackingDb)._inserts.find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('verified_signal')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/scan && pnpm vitest run tests/verify.unit.test.ts --no-file-parallelism`
Expected: FAIL — youtube id match not wired; first test yields `needs_review` (no `expectedId` passed).

- [ ] **Step 3: Wire expectedId into `verifySubmission`**

In `apps/scan/src/verify.ts`:

(a) Widen the platform cast — replace:

```ts
    const platform = (job.platform ?? '') as 'instagram' | 'threads'
```

with:

```ts
    const platform = (job.platform ?? '') as 'instagram' | 'threads' | 'youtube'
```

(b) Replace these two lines:

```ts
    const post = await fetcher.fetchPost(parsed.platform, parsed.id)
    const confidence = resolveConfidence(post, handleRow?.handle ?? null)
```

with:

```ts
    const post = await fetcher.fetchPost(parsed.platform, parsed.id)
    // YouTube uses a hybrid match: resolve the creator's handle to a canonical
    // channel id so resolveConfidence can match on id first, handle second.
    const expectedId =
      parsed.platform === 'youtube' && handleRow?.handle
        ? await fetcher.resolveChannelId(handleRow.handle)
        : null
    const confidence = resolveConfidence(post, handleRow?.handle ?? null, expectedId)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/scan && pnpm vitest run tests/verify.unit.test.ts --no-file-parallelism`
Expected: PASS (all old + 2 new).

- [ ] **Step 5: Full worker gate + typecheck**

Run: `cd apps/scan && pnpm vitest run tests/*.unit.test.ts --no-file-parallelism && pnpm typecheck`
Expected: all worker unit tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/scan/src/verify.ts apps/scan/tests/verify.unit.test.ts
git commit -m "feat(scan): resolve channel id for youtube verification in verifySubmission"
```

---

## Task 6: Platform CHECK migration (GATED) + finalize

**Files:**
- Create: `supabase/migrations/20260619000004_allow_youtube_verification.sql`
- Modify: memory `kinnso-v3-missions-journey.md`

- [ ] **Step 1: Confirm the live constraint names**

Via the Supabase MCP (`mcp__supabase__execute_sql`, project `scryfkefedzuetfdtrvl`), run:

```sql
select conrelid::regclass as table, conname
from pg_constraint
where conname in ('mission_social_snapshots_platform_check','mission_verification_jobs_platform_check')
   or (conrelid::regclass::text in ('public.mission_social_snapshots','public.mission_verification_jobs') and contype='c');
```

Expected: the two `*_platform_check` constraints exist with the default names. If the names differ, adjust the `drop constraint` targets in Step 2.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260619000004_allow_youtube_verification.sql`:

```sql
-- Allow platform='youtube' on the mission verification path so YouTube video
-- proofs can be auto-verified. creator_social_handles already permits 'youtube'.
alter table public.mission_social_snapshots
  drop constraint if exists mission_social_snapshots_platform_check,
  add constraint mission_social_snapshots_platform_check
    check (platform in ('instagram','threads','youtube'));

alter table public.mission_verification_jobs
  drop constraint if exists mission_verification_jobs_platform_check,
  add constraint mission_verification_jobs_platform_check
    check (platform in ('instagram','threads','youtube'));
```

- [ ] **Step 3: PAUSE — get the user's explicit OK before touching the live DB**

Do not apply until the user approves this specific migration (gated-migration protocol).

- [ ] **Step 4: Apply the migration to the live project**

Via `mcp__supabase__apply_migration` (project `scryfkefedzuetfdtrvl`, name `allow_youtube_verification`) with the SQL from Step 2.

- [ ] **Step 5: Verify the constraints were updated**

Via `mcp__supabase__execute_sql`:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname in ('mission_social_snapshots_platform_check','mission_verification_jobs_platform_check');
```

Expected: both defs now read `CHECK (platform = ANY (ARRAY['instagram','threads','youtube']))`.

- [ ] **Step 6: Full repo gate**

Run:
```
cd apps/scan && pnpm vitest run tests/*.unit.test.ts --no-file-parallelism && pnpm typecheck
cd apps/web && <prefix> pnpm vitest run tests/mission.proof-url.test.ts tests/mission.validation.test.ts tests/i18n.locale-parity.test.ts --no-file-parallelism && pnpm typecheck
```
Expected: all PASS, both typechecks clean.

- [ ] **Step 7: Update memory**

In `kinnso-v3-missions-journey.md`, update the follow-ups note: YouTube proof verification is now implemented (migration `20260619000004` applied live); remove it from "remaining follow-ups".

- [ ] **Step 8: Commit + push**

```bash
git add supabase/migrations/20260619000004_allow_youtube_verification.sql
git commit -m "feat(db): allow platform=youtube on mission verification (applied to scryfkefedzuetfdtrvl)"
git push origin feat/creator-missions-journey
```

---

## Notes for the implementer

- **DRY:** `apps/scan/src/proof-url.ts` and `apps/web/lib/missions/proof-url.ts` are intentional byte-identical duplicates (worker has no path alias into the web app). Keep them identical.
- **YAGNI:** no new UI states, i18n keys, or platforms beyond YouTube. The `proofUrlPlaceholder` staying an Instagram example is intentional.
- **Degradation:** every YouTube network call is best-effort → null → `unavailable`/`needs_review`, job still `ready`. Do not add throw-on-failure paths.
- **Migration safety:** the code is mergeable before the migration — no YouTube submissions exist yet; apply the migration before the feature is exercised in production.
