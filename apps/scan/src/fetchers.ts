import type { PlatformFetcher, Platform } from '@kinnso/scan'

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 500

async function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Strips the query string from a URL so secrets carried as query params (e.g. the
 * YouTube Data API `key=`) never reach an Error message or log line. Falls back to
 * a static placeholder if the URL cannot be parsed.
 */
function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return '<unparseable-url>'
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleepMs(INITIAL_DELAY_MS * 2 ** (attempt - 1))
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (err) {
      lastError = err
      continue
    }
    if (!RETRYABLE_STATUSES.has(res.status)) return res
    // Redact the query string — some URLs carry secrets as query params (e.g. the
    // YouTube Data API key), and this Error message is surfaced to logs.
    lastError = new Error(`HTTP ${res.status} from ${redactUrl(url)}`)
  }
  throw lastError
}

// ---------------------------------------------------------------------------
// RapidAPI fetcher — Instagram + Threads
// ---------------------------------------------------------------------------

const RAPIDAPI_IG_HOST = 'instagram-scraper-stable-api.p.rapidapi.com'
const RAPIDAPI_THREADS_HOST = 'threads-scraper-api2.p.rapidapi.com'

/**
 * Fetches public profile data for Instagram or Threads via RapidAPI.
 * Returns the raw JSON body; shape is passed to @kinnso/scan `normalize()` as-is.
 */
export class RapidApiFetcher implements PlatformFetcher {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('RapidApiFetcher: RAPIDAPI_KEY is required')
  }

  async fetch(platform: 'instagram' | 'threads', handle: string): Promise<unknown> {
    const host =
      platform === 'instagram' ? RAPIDAPI_IG_HOST : RAPIDAPI_THREADS_HOST

    // The instagram-scraper-stable-api product serves profile data via a POST
    // form endpoint (`/ig_get_fb_profile_v3.php`, body `username_or_url=<handle>`)
    // that returns a FLAT object: { username, biography, follower_count, ... }.
    // The earlier `/user/info?username=` REST route does not exist on this API
    // and 4xx'd for every handle. Threads keeps its own endpoint shape.
    const res =
      platform === 'instagram'
        ? await fetchWithRetry(`https://${host}/ig_get_fb_profile_v3.php`, {
            method: 'POST',
            headers: {
              'x-rapidapi-key': this.apiKey,
              'x-rapidapi-host': host,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ username_or_url: handle }).toString(),
          })
        : await fetchWithRetry(`https://${host}/user/info?username=${encodeURIComponent(handle)}`, {
            method: 'GET',
            headers: {
              'x-rapidapi-key': this.apiKey,
              'x-rapidapi-host': host,
              Accept: 'application/json',
            },
          })

    if (!res.ok) {
      throw new Error(`RapidAPI ${platform} returned HTTP ${res.status} for handle "${handle}"`)
    }
    const raw = (await res.json()) as Record<string, unknown>

    // Reshape the provider response into the nested shape the @kinnso/scan
    // normalizers read:
    //   - Instagram: { data: { user: { edge_followed_by, biography,
    //       edge_media_to_timeline_edge: { edges[].node.edge_media_to_caption.edges[].node.text } } } }
    //   - Threads:   { user: { follower_count, biography }, threads[].post.caption.text }
    //
    // IMPORTANT: the exact SOURCE field paths below (`raw.*`) are provider-dependent
    // and NOT yet verified — they must be confirmed against the live RapidAPI
    // response during the Task 9 smoke-test and the mappings adjusted so the
    // OUTPUT still matches the normalizer input shapes above. If they do not
    // match, normalization silently yields empty signals.
    if (platform === 'instagram') {
      const src = (raw.data ?? raw.user ?? raw) as Record<string, any>
      const u = (src.user ?? src) as Record<string, any>
      return {
        data: {
          user: {
            username: u.username,
            biography: u.biography ?? u.bio,
            edge_followed_by:
              u.edge_followed_by ??
              { count: u.followers_count ?? u.follower_count ?? 0 },
            edge_media_to_timeline_edge:
              u.edge_media_to_timeline_edge ??
              {
                edges: ((u.posts ?? u.media ?? []) as any[]).map((p: any) => ({
                  node: {
                    edge_media_to_caption: {
                      edges: [{ node: { text: p?.caption ?? p?.text ?? '' } }],
                    },
                  },
                })),
              },
          },
        },
      }
    }

    // threads
    const src = (raw.user ?? raw.data ?? raw) as Record<string, any>
    const u = (src.user ?? src) as Record<string, any>
    const rawThreads = (raw.threads ?? src.threads ?? u.threads ?? []) as any[]
    return {
      user: {
        username: u.username,
        biography: u.biography ?? u.bio,
        follower_count: u.follower_count ?? u.followers_count ?? 0,
      },
      threads: rawThreads.map((t: any) => ({
        post: { caption: { text: t?.post?.caption?.text ?? t?.caption ?? t?.text ?? '' } },
      })),
    }
  }
}

// ---------------------------------------------------------------------------
// YouTube Data API v3 fetcher
// ---------------------------------------------------------------------------

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'

/**
 * Fetches public channel data for a YouTube handle/channel via the Data API v3.
 * The `handle` can be a @handle, channel ID (UC...), or custom URL slug.
 */
export class YouTubeFetcher implements PlatformFetcher {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('YouTubeFetcher: YOUTUBE_API_KEY is required')
  }

  async fetch(platform: 'youtube', handle: string): Promise<unknown> {
    // Normalise: strip leading "@" if present
    const forHandle = handle.startsWith('@') ? handle : `@${handle}`
    // Request contentDetails too so we can locate the uploads playlist.
    const url =
      `${YOUTUBE_BASE}/channels` +
      `?part=snippet,statistics,contentDetails` +
      `&forHandle=${encodeURIComponent(forHandle)}` +
      `&key=${encodeURIComponent(this.apiKey)}`

    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`YouTube Data API returned HTTP ${res.status} for handle "${handle}"`)
    }
    const body = (await res.json()) as {
      items?: Array<{
        contentDetails?: { relatedPlaylists?: { uploads?: string } }
      }>
    }
    const channel = body.items?.[0]
    if (!channel) {
      throw new Error(`YouTube Data API returned no channel for handle "${handle}"`)
    }

    // Fetch recent uploads. Graceful degradation: a videos-call failure still
    // returns the channel with an empty recentVideos list (per the per-platform
    // partial-failure design).
    let recentVideos: unknown[] = []
    try {
      const uploads = channel.contentDetails?.relatedPlaylists?.uploads
      if (uploads) {
        const vurl =
          `${YOUTUBE_BASE}/playlistItems` +
          `?part=snippet` +
          `&playlistId=${encodeURIComponent(uploads)}` +
          `&maxResults=10` +
          `&key=${encodeURIComponent(this.apiKey)}`
        const vres = await fetchWithRetry(vurl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })
        if (vres.ok) {
          const vbody = (await vres.json()) as {
            items?: Array<{ snippet?: unknown }>
          }
          recentVideos = (vbody.items ?? []).map((it) => ({ snippet: it.snippet }))
        }
      }
    } catch (err) {
      console.warn(`[scan] YouTube recentVideos fetch failed for "${handle}"`, (err as Error).message)
    }

    // Reshape into the `{ channel, recentVideos }` shape the @kinnso/scan
    // YouTube normalizer reads.
    return { channel, recentVideos }
  }
}

// ---------------------------------------------------------------------------
// Composite fetcher — dispatches to the right real fetcher per platform
// ---------------------------------------------------------------------------

/**
 * The default real fetcher used by apps/scan in production.
 * Dispatches IG/Threads to RapidApiFetcher and YouTube to YouTubeFetcher.
 */
export class CompositeFetcher implements PlatformFetcher {
  private readonly rapidApi: RapidApiFetcher
  private readonly youtube: YouTubeFetcher

  constructor(rapidApiKey: string, youtubeApiKey: string) {
    this.rapidApi = new RapidApiFetcher(rapidApiKey)
    this.youtube = new YouTubeFetcher(youtubeApiKey)
  }

  fetch(platform: Platform, handle: string): Promise<unknown> {
    if (platform === 'instagram' || platform === 'threads') {
      return this.rapidApi.fetch(platform as 'instagram' | 'threads', handle)
    }
    if (platform === 'youtube') {
      return this.youtube.fetch('youtube', handle)
    }
    throw new Error(`CompositeFetcher: unsupported platform "${platform}"`)
  }
}

// ---------------------------------------------------------------------------
// FakeFetcher — used in integration tests and SCAN_FIXTURE_MODE
// ---------------------------------------------------------------------------

/**
 * Minimal canned raw payload returned for each platform by the fake fetcher.
 * NOTE: These shapes MUST match the nested paths the `@kinnso/scan` normalizers
 * read (Plan 2 is the contract) — otherwise `normalize()` silently yields empty
 * signals. See the regression test in fetchers.unit.test.ts.
 */
export const FAKE_PAYLOADS: Record<Platform, unknown> = {
  instagram: {
    data: {
      user: {
        username: 'fake_ig_user',
        biography: 'Fake IG bio for testing',
        edge_followed_by: { count: 5000 },
        edge_media_to_timeline_edge: {
          edges: [
            {
              node: {
                edge_media_to_caption: {
                  edges: [{ node: { text: 'Fake IG post caption' } }],
                },
              },
            },
          ],
        },
      },
    },
  },
  threads: {
    user: {
      username: 'fake_threads_user',
      biography: 'Fake Threads bio for testing',
      follower_count: 1200,
    },
    threads: [{ post: { caption: { text: 'Fake threads post' } } }],
  },
  youtube: {
    channel: {
      snippet: { title: 'Fake YouTube Channel', description: 'Fake YT description' },
      statistics: { subscriberCount: '8000', videoCount: '30' },
    },
    recentVideos: [
      { snippet: { title: 'Fake video', description: 'Fake video description' } },
    ],
  },
}

/**
 * Fake fetcher for tests and fixture mode.
 * Never makes network calls; returns deterministic canned payloads.
 * Optionally override per platform via `overrides` map.
 */
export class FakeFetcher implements PlatformFetcher {
  constructor(
    private readonly overrides: Partial<Record<Platform, unknown>> = {},
    private readonly failPlatforms: Platform[] = []
  ) {}

  async fetch(platform: Platform, _handle: string): Promise<unknown> {
    if (this.failPlatforms.includes(platform)) {
      throw new Error(`FakeFetcher: simulated failure for platform "${platform}"`)
    }
    return this.overrides[platform] ?? FAKE_PAYLOADS[platform]
  }
}
