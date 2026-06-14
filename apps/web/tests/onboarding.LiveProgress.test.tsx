// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { JobRow } from '@/lib/onboarding/progress'

afterEach(cleanup)

// ---- Fake Realtime channel: capture the handler so the test can emit frames ----
let emit: ((row: JobRow) => void) | null = null
const channelObj = {
  on: vi.fn((_evt: string, _filter: unknown, cb: (p: { new: JobRow }) => void) => {
    emit = (row: JobRow) => cb({ new: row })
    return channelObj
  }),
  subscribe: vi.fn((cb?: (s: string) => void) => {
    cb?.('SUBSCRIBED')
    return channelObj
  }),
}

// ---- Mutable initial-select result, set per test ----
let initialJob: JobRow = {
  id: 'job-1',
  status: 'fetching',
  progress: { platforms: { instagram: 'pending' } },
  error: null,
}
const single = vi.fn(async () => ({ data: initialJob, error: null }))
const eq = vi.fn(() => ({ single }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))
const getSession = vi.fn(async () => ({
  data: { session: { access_token: 'tok-123' } },
}))
const removeChannel = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: vi.fn(() => channelObj),
    removeChannel,
    from,
    auth: { getSession },
  }),
}))

import { LiveProgress } from '@/components/onboarding/LiveProgress'
import en from '@/lib/i18n/messages/en'
const t = en.onboarding.progressStep

beforeEach(() => {
  emit = null
  process.env.NEXT_PUBLIC_SCAN_URL = 'http://scan.test'
  globalThis.fetch = vi.fn()
  initialJob = {
    id: 'job-1',
    status: 'fetching',
    progress: { platforms: { instagram: 'pending', youtube: 'pending' } },
    error: null,
  }
})
afterEach(() => vi.clearAllMocks())

describe('LiveProgress (fresh run -> live frames)', () => {
  it('POSTs /scan, subscribes, then advances queued->analyzing->ready and calls onReady', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: true,
      json: async () => ({ jobId: 'job-1' }),
    })
    const onReady = vi.fn()
    render(
      <LiveProgress
        creatorId="c1"
        jobId={null}
        platforms={['instagram', 'youtube']}
        t={t}
        onReady={onReady}
      />,
    )
    // POST fired with bearer token
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('http://scan.test/scan', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-123' },
      }),
    )
    // initial select reconciled -> still fetching phase visible
    await waitFor(() => expect(screen.getByText(t.phaseFetching)).toBeTruthy())
    // emit analyzing then ready
    emit?.({ id: 'job-1', status: 'analyzing', progress: { platforms: { instagram: 'ok', youtube: 'pending' } }, error: null })
    await waitFor(() => expect(screen.getByText(t.phaseAnalyzing)).toBeTruthy())
    emit?.({ id: 'job-1', status: 'ready', progress: { platforms: { instagram: 'ok', youtube: 'ok' } }, error: null })
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('job-1'))
  })
})

describe('LiveProgress (subscribe-after-terminal reconcile)', () => {
  it('shows ready immediately from the initial select even if no realtime frame arrives', async () => {
    initialJob = { id: 'job-1', status: 'ready', progress: { platforms: { instagram: 'ok' } }, error: null }
    const onReady = vi.fn()
    render(
      <LiveProgress creatorId="c1" jobId="job-1" platforms={['instagram']} t={t} onReady={onReady} />,
    )
    // No POST when resuming with an existing jobId.
    expect(globalThis.fetch).not.toHaveBeenCalled()
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('job-1'))
  })
})

describe('LiveProgress (429 + retry)', () => {
  it('shows the rate-limit message on 429', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 429,
      ok: false,
      json: async () => ({}),
    })
    render(<LiveProgress creatorId="c1" jobId={null} platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(t.rateLimited)).toBeTruthy())
  })

  it('shows an error notice when POST /scan returns 500', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: async () => ({ error: 'internal error' }),
    })
    render(<LiveProgress creatorId="c1" jobId={null} platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(t.error)).toBeTruthy())
  })

  it('renders Retry on a failed initial job and POSTs the retry endpoint', async () => {
    initialJob = { id: 'job-1', status: 'failed', progress: { platforms: { instagram: 'failed' } }, error: 'boom' }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: true,
      json: async () => ({ jobId: 'job-1' }),
    })
    render(<LiveProgress creatorId="c1" jobId="job-1" platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: t.retry })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: t.retry }))
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('http://scan.test/scan/job-1/retry', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-123' },
      }),
    )
  })
})
