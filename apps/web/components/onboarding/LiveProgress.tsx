'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { reconcileJob, toRenderRows, type JobRow, type JobStatus } from '@/lib/onboarding/progress'
import type { Platform } from '@/lib/onboarding/validateHandle'
import type { Messages } from '@/lib/i18n/messages/en'

type ProgressDict = Messages['onboarding']['progressStep']

const PHASE_KEY: Record<JobStatus, keyof ProgressDict> = {
  queued: 'phaseQueued',
  fetching: 'phaseFetching',
  analyzing: 'phaseAnalyzing',
  ready: 'phaseReady',
  failed: 'phaseFailed',
}
const STATE_KEY = { pending: 'statePending', ok: 'stateOk', failed: 'stateFailed' } as const

type Notice = 'none' | 'rateLimited' | 'reauth' | 'error' | 'unconfigured'

async function bearer(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export function LiveProgress({
  creatorId,
  jobId,
  platforms,
  t,
  onReady,
}: {
  creatorId: string
  jobId: string | null
  platforms: Platform[]
  t: ProgressDict
  onReady: (jobId: string) => void
}) {
  const [job, setJob] = useState<JobRow | null>(null)
  const [notice, setNotice] = useState<Notice>('none')
  const jobIdRef = useRef<string | null>(jobId)
  const readyFiredRef = useRef(false)

  const applyJob = useCallback(
    (incoming: JobRow | null) => {
      setJob((prev) => {
        const next = reconcileJob(prev, incoming)
        if (next && next.status === 'ready' && !readyFiredRef.current) {
          readyFiredRef.current = true
          onReady(next.id)
        }
        return next
      })
    },
    [onReady],
  )

  // POST a fresh scan to the worker; returns the jobId or sets a notice.
  const startScan = useCallback(async (path: string): Promise<string | null> => {
    // The scan worker runs as a separate service (Railway); the web app reaches
    // it via NEXT_PUBLIC_SCAN_URL, inlined at build time. If it's missing or not
    // an absolute URL, an empty value would make fetch() POST to the web app's own
    // origin (e.g. `/scan`) — a silent 404/redirect that strands the wizard. Fail
    // loudly instead of pretending to start a scan.
    const base = process.env.NEXT_PUBLIC_SCAN_URL?.trim()
    if (!base || !/^https?:\/\//i.test(base)) {
      console.error(
        '[scan] NEXT_PUBLIC_SCAN_URL is not configured (got %o) — cannot start scan. ' +
          'Point it at the deployed scan worker and redeploy the web app.',
        process.env.NEXT_PUBLIC_SCAN_URL,
      )
      setNotice('unconfigured')
      return null
    }
    const token = await bearer()
    if (!token) {
      setNotice('reauth')
      return null
    }
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 429) {
      setNotice('rateLimited')
      return null
    }
    if (res.status === 401) {
      setNotice('reauth')
      return null
    }
    if (!res.ok) {
      setNotice('error')
      return null
    }
    const data = (await res.json()) as { jobId?: string }
    return data.jobId ?? null
  }, [])

  // Subscribe to the job row, then do the initial select + reconcile.
  const subscribeAndSelect = useCallback(
    (id: string) => {
      const supabase = createSupabaseBrowserClient()
      const channel = supabase
        .channel(`scan-job-${id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'creator_scan_jobs', filter: `id=eq.${id}` },
          (payload: { new: JobRow }) => applyJob(payload.new),
        )
        .subscribe()

      // Polling backstop: Realtime postgres_changes on the RLS-protected jobs table
      // can be missed (socket-auth / connection timing), which would otherwise strand
      // the wizard forever. Re-select until the job reaches a terminal state.
      let timer: ReturnType<typeof setInterval> | undefined
      const select = (): PromiseLike<void> =>
        supabase
          .from('creator_scan_jobs')
          .select('id, status, progress, error')
          .eq('id', id)
          .single()
          .then(({ data }) => {
            const row = data as JobRow | null
            applyJob(row)
            if (row && (row.status === 'ready' || row.status === 'failed') && timer) {
              clearInterval(timer)
              timer = undefined
            }
          })

      // Initial select AFTER subscribe so a terminal-before-subscribe job reconciles in.
      void select()
      timer = setInterval(() => void select(), 2000)

      return () => {
        if (timer) clearInterval(timer)
        supabase.removeChannel(channel)
      }
    },
    [applyJob],
  )

  useEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      let id = jobIdRef.current
      if (!id) {
        id = await startScan('/scan')
        if (!id || cancelled) return
        jobIdRef.current = id
      }
      cleanup = subscribeAndSelect(id)
    })()
    return () => {
      cancelled = true
      cleanup?.()
    }
    // creatorId is included so a different creator remounts the subscription.
  }, [creatorId, startScan, subscribeAndSelect])

  async function retry() {
    const id = jobIdRef.current
    if (!id) return
    readyFiredRef.current = false
    setNotice('none')
    setJob(null)
    const newId = await startScan(`/scan/${id}/retry`)
    if (newId) {
      jobIdRef.current = newId
      subscribeAndSelect(newId)
    }
  }

  const status: JobStatus = job?.status ?? 'queued'
  const rows = toRenderRows(job?.progress ?? null, platforms)

  return (
    <section className="w-full max-w-md space-y-4">
      <h2 className="text-xl font-semibold">{t.heading}</h2>
      <p className="text-sm font-medium">{t[PHASE_KEY[status]]}</p>

      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.platform} className="flex justify-between text-sm">
            <span className="capitalize">{r.platform}</span>
            <span>{t[STATE_KEY[r.state]]}</span>
          </li>
        ))}
      </ul>

      {notice === 'rateLimited' ? <p className="text-sm text-amber-600">{t.rateLimited}</p> : null}
      {notice === 'reauth' ? <p className="text-sm text-red-600">{t.reauth}</p> : null}
      {notice === 'error' ? <p className="text-sm text-red-600">{t.error}</p> : null}
      {notice === 'unconfigured' ? <p className="text-sm text-red-600">{t.unconfigured}</p> : null}

      {status === 'failed' ? (
        <button
          type="button"
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white"
          onClick={retry}
        >
          {t.retry}
        </button>
      ) : null}
    </section>
  )
}
