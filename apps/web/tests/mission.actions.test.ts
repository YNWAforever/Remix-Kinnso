import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { missionDraftFixture } from '@/lib/missions/fixtures'
import {
  buildMissionInsert,
  buildParticipantInsert,
  createMissionAction,
  reviewParticipantAction,
  reviewSubmissionAction,
  updateSettlementAction,
} from '@/lib/missions/actions'

const { createSupabaseServerClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

type MockBuilder = {
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const createBuilder = (overrides: Partial<MockBuilder> = {}) => {
  const builder = {} as MockBuilder
  builder.delete = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.insert = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.or = vi.fn(() => builder)
  builder.select = vi.fn(() => builder)
  builder.single = vi.fn(() => builder)
  builder.update = vi.fn(() => builder)
  return Object.assign(builder, overrides)
}

const createSupabaseMock = (tableBuilders: Record<string, MockBuilder | MockBuilder[]>) => {
  const builders = new Map(
    Object.entries(tableBuilders).map(([table, builder]) => [
      table,
      Array.isArray(builder) ? [...builder] : builder,
    ]),
  )

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      const builder = builders.get(table)
      if (!builder) throw new Error(`Unexpected table: ${table}`)

      if (Array.isArray(builder)) {
        const next = builder.shift()
        if (!next) throw new Error(`Unexpected repeated table: ${table}`)
        return next
      }

      return builder
    }),
  }
}

beforeEach(() => {
  createSupabaseServerClientMock.mockReset()
  revalidatePathMock.mockReset()
})

describe('mission actions module boundary', () => {
  it('keeps synchronous builders out of a file-level server module', () => {
    const source = readFileSync(new URL('../lib/missions/actions.ts', import.meta.url), 'utf8')

    expect(source.trimStart().startsWith("'use server'")).toBe(false)
    expect(source).not.toContain("from 'next/cache'")
    expect(source).not.toContain('from "next/cache"')
    expect(buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })).not.toHaveProperty('then')
  })
})

describe('mission actions builders', () => {
  it('builds a mission insert payload from a valid merchant draft', () => {
    const payload = buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload).toMatchObject({
      merchant_profile_id: 'merchant-profile-1',
      mission_source: 'merchant',
      mission_type: 'coupon_affiliate',
      status: 'published',
      coupon_code: 'STAY10',
    })
    expect(payload.published_at).toEqual(expect.any(String))
  })

  it('builds an active participant for coupon auto-join', () => {
    expect(buildParticipantInsert({
      missionId: 'mission-1',
      creatorId: 'creator-1',
      missionType: 'coupon_affiliate',
      missionSource: 'merchant',
    })).toMatchObject({
      mission_id: 'mission-1',
      creator_id: 'creator-1',
      status: 'active',
      source: 'open_join',
    })
  })

  it('does not import next/cache at module evaluation in tests', async () => {
    vi.resetModules()
    await expect(import('@/lib/missions/actions')).resolves.toBeTruthy()
  })
})

describe('createMissionAction', () => {
  it('revalidates locale-aware merchant and studio mission paths', async () => {
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: createBuilder({
        single: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
      mission_milestones: createBuilder({
        insert: vi.fn(async () => ({ error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createMissionAction(missionDraftFixture, {
      publish: true,
      locale: 'zh-hk',
    })

    expect(result).toEqual({ ok: true, missionId: 'mission-1' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh-hk/merchants/missions')
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh-hk/studio/missions')
  })

  it('rolls back the mission when milestone insertion fails', async () => {
    const missionDeleteBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: [
        createBuilder({
          single: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
        }),
        missionDeleteBuilder,
      ],
      mission_milestones: createBuilder({
        insert: vi.fn(async () => ({ error: new Error('milestone insert failed') })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createMissionAction(missionDraftFixture, {
      publish: true,
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Mission milestones could not be created'] },
    })
    expect(missionDeleteBuilder.delete).toHaveBeenCalledTimes(1)
    expect(missionDeleteBuilder.eq).toHaveBeenCalledWith('id', 'mission-1')
  })

  it('returns an incomplete creation error when rollback delete returns no row', async () => {
    const missionDeleteBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: [
        createBuilder({
          single: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
        }),
        missionDeleteBuilder,
      ],
      mission_milestones: createBuilder({
        insert: vi.fn(async () => ({ error: new Error('milestone insert failed') })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createMissionAction(missionDraftFixture, {
      publish: true,
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: {
        form: ['Mission creation is incomplete. Please retry or contact ops before publishing again.'],
      },
    })
    expect(missionDeleteBuilder.delete).toHaveBeenCalledTimes(1)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('reviewParticipantAction', () => {
  it('returns an error when the participant update returns no row', async () => {
    const participantUpdateBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      mission_participants: [
        createBuilder({
          single: vi.fn(async () => ({
            data: { id: 'participant-1', mission_id: 'mission-1', status: 'applied' },
            error: null,
          })),
        }),
        participantUpdateBuilder,
      ],
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await reviewParticipantAction({
      participantId: 'participant-1',
      action: 'approve',
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Participant review could not be saved'] },
    })
    expect(participantUpdateBuilder.eq).toHaveBeenCalledWith('status', 'applied')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('reviewSubmissionAction', () => {
  it('returns an error when the submission update returns no row', async () => {
    const submissionUpdateBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({
          single: vi.fn(async () => ({
            data: {
              id: 'submission-1',
              status: 'submitted',
              mission_participant_id: 'participant-1',
            },
            error: null,
          })),
        }),
        submissionUpdateBuilder,
      ],
      mission_participants: createBuilder({
        single: vi.fn(async () => ({ data: { mission_id: 'mission-1' }, error: null })),
      }),
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await reviewSubmissionAction({
      submissionId: 'submission-1',
      action: 'approve',
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Submission review could not be saved'] },
    })
    expect(submissionUpdateBuilder.eq).toHaveBeenCalledWith('status', 'submitted')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('updateSettlementAction', () => {
  it('returns a form error when no settlement row is updated', async () => {
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'ops-member-1' }, error: null })),
      }),
      mission_settlements: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await updateSettlementAction({
      settlementId: 'settlement-1',
      status: 'pending',
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'pending',
      affiliateCommissionAmount: null,
      locale: 'en',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Settlement update could not be saved'] },
    })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
