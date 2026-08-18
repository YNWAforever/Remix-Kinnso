import { describe, expect, it } from 'vitest'
import { getReviewQueue, getMissionDetail } from '@/lib/admin/mission-review-queries'

type ChainResult = { data: unknown; error: unknown }

/** A minimal thenable query-builder stub: every chain method returns itself, and the
 *  chain resolves to the same fixed result whether awaited directly or after
 *  `.maybeSingle()` — mirroring how a real PostgrestFilterBuilder is thenable at any
 *  point in the chain. */
function makeChain(result: ChainResult) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: ChainResult) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

function fakeClient(tables: Record<string, ChainResult>) {
  return {
    from: (table: string) => {
      const cfg = tables[table]
      if (!cfg) throw new Error(`Unexpected table in test: ${table}`)
      return makeChain(cfg)
    },
  } as never
}

const SUBMISSION_ROWS = [
  {
    id: 'sub-1',
    status: 'submitted',
    submitted_at: '2026-08-17T00:00:00Z',
    review_deadline: '2026-08-19T00:00:00Z',
    mission_participants: { id: 'p1', creator_id: 'c1', mission_id: 'm1', missions: { id: 'm1', title: 'Mission One' } },
    mission_verification_jobs: [
      { confidence_status: 'low', created_at: '2026-08-17T01:00:00Z' },
      { confidence_status: 'high', created_at: '2026-08-17T02:00:00Z' },
    ],
  },
  {
    id: 'sub-2',
    status: 'revision_requested',
    submitted_at: '2026-08-16T00:00:00Z',
    review_deadline: '2026-08-18T00:00:00Z',
    mission_participants: { id: 'p2', creator_id: 'c2', mission_id: 'm2', missions: { id: 'm2', title: 'Mission Two' } },
    mission_verification_jobs: [],
  },
]

describe('getReviewQueue', () => {
  it('maps joined rows, picking the latest verification job by created_at', async () => {
    const supabase = fakeClient({ mission_milestone_submissions: { data: SUBMISSION_ROWS, error: null } })
    const rows = await getReviewQueue(supabase)
    expect(rows).toEqual([
      {
        submissionId: 'sub-1',
        missionId: 'm1',
        missionTitle: 'Mission One',
        creatorId: 'c1',
        status: 'submitted',
        submittedAt: '2026-08-17T00:00:00Z',
        reviewDeadline: '2026-08-19T00:00:00Z',
        confidenceStatus: 'high',
      },
      {
        submissionId: 'sub-2',
        missionId: 'm2',
        missionTitle: 'Mission Two',
        creatorId: 'c2',
        status: 'revision_requested',
        submittedAt: '2026-08-16T00:00:00Z',
        reviewDeadline: '2026-08-18T00:00:00Z',
        confidenceStatus: null,
      },
    ])
  })

  it('returns an empty array when nothing is awaiting review', async () => {
    const supabase = fakeClient({ mission_milestone_submissions: { data: [], error: null } })
    await expect(getReviewQueue(supabase)).resolves.toEqual([])
  })

  it('propagates a query error rather than swallowing it', async () => {
    const supabase = fakeClient({ mission_milestone_submissions: { data: null, error: { message: 'boom' } } })
    await expect(getReviewQueue(supabase)).rejects.toEqual({ message: 'boom' })
  })
})

describe('getMissionDetail', () => {
  it('returns null when the mission does not exist', async () => {
    const supabase = fakeClient({
      missions: { data: null, error: null },
    })
    await expect(getMissionDetail(supabase, 'missing-mission')).resolves.toBeNull()
  })

  it('assembles mission, participants, milestones, and the filtered review-queue subset', async () => {
    const supabase = fakeClient({
      missions: {
        data: { id: 'm1', title: 'Mission One', status: 'published', mission_type: 'hybrid', mission_source: 'merchant', merchant_profile_id: 'merchant-1' },
        error: null,
      },
      mission_participants: {
        data: [{ id: 'p1', status: 'active', source: 'open_join', creator_id: 'c1', application_note: null, approved_at: '2026-08-01T00:00:00Z' }],
        error: null,
      },
      mission_milestones: {
        data: [{ id: 'ms1', title: 'Milestone', description: 'Post it', due_at: null, sort_order: 0 }],
        error: null,
      },
      mission_milestone_submissions: { data: SUBMISSION_ROWS, error: null },
    })

    const detail = await getMissionDetail(supabase, 'm1')

    expect(detail?.mission).toEqual({
      id: 'm1', title: 'Mission One', status: 'published', missionType: 'hybrid', missionSource: 'merchant', merchantProfileId: 'merchant-1',
    })
    expect(detail?.participants).toEqual([
      { id: 'p1', status: 'active', source: 'open_join', creatorId: 'c1', applicationNote: null, approvedAt: '2026-08-01T00:00:00Z' },
    ])
    expect(detail?.milestones).toEqual([
      { id: 'ms1', title: 'Milestone', description: 'Post it', dueAt: null, sortOrder: 0 },
    ])
    // Only sub-1 belongs to mission m1 (SUBMISSION_ROWS also contains sub-2 for m2).
    expect(detail?.submissions.map((s) => s.submissionId)).toEqual(['sub-1'])
  })
})
