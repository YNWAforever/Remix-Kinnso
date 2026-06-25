import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { missionDraftFixture } from '@/lib/missions/fixtures'
import {
  buildMissionInsert,
  buildParticipantInsert,
  createMissionAction,
  createPartnerLinkAction,
  joinMissionAction,
  reviewParticipantAction,
  reviewSubmissionAction,
  submitMilestoneAction,
  updateSettlementAction,
} from '@/lib/missions/actions'

const {
  buildSubIdMock,
  createServiceClientMock,
  createSupabaseServerClientMock,
  createTravelpayoutsPartnerLinksMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  buildSubIdMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  createTravelpayoutsPartnerLinksMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createServiceClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/missions/travelpayouts', () => ({
  buildSubId: buildSubIdMock,
  createTravelpayoutsPartnerLinks: createTravelpayoutsPartnerLinksMock,
}))

vi.mock('server-only', () => ({}))

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

const createSupabaseMock = (
  tableBuilders: Record<string, MockBuilder | MockBuilder[]>,
  options: {
    getUser?: ReturnType<typeof vi.fn>
    rpc?: ReturnType<typeof vi.fn>
  } = {},
) => {
  const builders = new Map(
    Object.entries(tableBuilders).map(([table, builder]) => [
      table,
      Array.isArray(builder) ? [...builder] : builder,
    ]),
  )

  return {
    auth: {
      getUser: options.getUser ?? vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
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
    rpc: options.rpc ?? vi.fn(async () => ({ data: null, error: null })),
  }
}

beforeEach(() => {
  buildSubIdMock.mockReset()
  createServiceClientMock.mockReset()
  createSupabaseServerClientMock.mockReset()
  createTravelpayoutsPartnerLinksMock.mockReset()
  revalidatePathMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
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

  it('carries min_tier into the mission insert payload', () => {
    const payload = buildMissionInsert({
      input: { ...missionDraftFixture, minTier: 'pro' },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload.min_tier).toBe('pro')
  })

  it('defaults min_tier to null when the draft is open to all', () => {
    const payload = buildMissionInsert({
      input: { ...missionDraftFixture, minTier: null },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload.min_tier).toBeNull()
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

describe('joinMissionAction', () => {
  it('rejects merchant users before inserting a creator participant', async () => {
    const participantInsertBuilder = createBuilder({
      single: vi.fn(async () => ({ data: { id: 'participant-1' }, error: null })),
    })
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      }),
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-1', mission_type: 'coupon_affiliate', mission_source: 'merchant' },
          error: null,
        })),
      }),
      mission_participants: participantInsertBuilder,
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-1', locale: 'en' })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Creator access is required'] },
    })
    expect(participantInsertBuilder.insert).not.toHaveBeenCalled()
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
  it('preserves financial fields that the caller does not include', async () => {
    const settlementUpdateBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: { id: 'settlement-1' }, error: null })),
    })
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'ops-member-1' }, error: null })),
      }),
      mission_settlements: settlementUpdateBuilder,
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await updateSettlementAction({
      settlementId: 'settlement-1',
      status: 'paid',
      creatorPayoutStatus: 'paid',
      kinnsoCommissionStatus: 'paid',
      locale: 'en',
    })

    expect(result).toEqual({ ok: true, settlementId: 'settlement-1' })
    const updatePayload = settlementUpdateBuilder.update.mock.calls[0]?.[0]
    expect(updatePayload).toEqual({
      status: 'paid',
      creator_payout_status: 'paid',
      kinnso_commission_status: 'paid',
      updated_by_ops_member_id: 'ops-member-1',
    })
    expect(updatePayload).not.toHaveProperty('affiliate_commission_amount')
    expect(updatePayload).not.toHaveProperty('affiliate_commission_status')
    expect(updatePayload).not.toHaveProperty('creator_commission_amount')
    expect(updatePayload).not.toHaveProperty('kinnso_commission_amount')
    expect(updatePayload).not.toHaveProperty('ops_note')
  })

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

describe('createPartnerLinkAction', () => {
  it('requires sign in before calling Travelpayouts', async () => {
    const supabase = createSupabaseMock({}, {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createPartnerLinkAction({
      missionParticipantId: 'participant-1',
      originalUrl: 'https://example.com/hotel',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Sign in is required'] },
    })
    expect(createTravelpayoutsPartnerLinksMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('returns an error for a missing or not-owned participant before calling Travelpayouts', async () => {
    const participantBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const supabase = createSupabaseMock({
      mission_participants: participantBuilder,
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createPartnerLinkAction({
      missionParticipantId: 'participant-1',
      originalUrl: 'https://example.com/hotel',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Participant was not found'] },
    })
    expect(participantBuilder.eq).toHaveBeenCalledWith('creator_id', 'user-1')
    expect(createTravelpayoutsPartnerLinksMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('validates inactive participant and program states before calling Travelpayouts', async () => {
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({
          data: { id: 'participant-1', mission_id: 'mission-1', creator_id: 'user-1', status: 'applied' },
          error: null,
        })),
      }),
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'mission-1',
            affiliate_network_program_id: 'program-1',
            mission_source: 'travelpayouts',
            status: 'published',
          },
          error: null,
        })),
      }),
      affiliate_network_programs: createBuilder({
        maybeSingle: vi.fn(async () => ({
          data: { id: 'program-1', network: 'travelpayouts', status: 'paused' },
          error: null,
        })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createPartnerLinkAction({
      missionParticipantId: 'participant-1',
      originalUrl: 'https://example.com/hotel',
    })

    expect(result).toEqual({
      ok: false,
      errors: {
        participantStatus: ['active'],
        programStatus: ['active'],
      },
    })
    expect(createTravelpayoutsPartnerLinksMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('returns an existing partner link without calling Travelpayouts', async () => {
    const existingLinkBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({
        data: { id: 'partner-link-1', partner_url: 'https://tp.st/existing' },
        error: null,
      })),
    })
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({
          data: { id: 'participant-1', mission_id: 'mission-1', creator_id: 'user-1', status: 'active' },
          error: null,
        })),
      }),
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'mission-1',
            affiliate_network_program_id: 'program-1',
            mission_source: 'travelpayouts',
            status: 'published',
          },
          error: null,
        })),
      }),
      affiliate_network_programs: createBuilder({
        maybeSingle: vi.fn(async () => ({
          data: { id: 'program-1', network: 'travelpayouts', status: 'active' },
          error: null,
        })),
      }),
      affiliate_partner_links: existingLinkBuilder,
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createPartnerLinkAction({
      missionParticipantId: 'participant-1',
      originalUrl: 'https://example.com/hotel',
    })

    expect(result).toEqual({
      ok: true,
      link: { id: 'partner-link-1', partner_url: 'https://tp.st/existing' },
    })
    expect(existingLinkBuilder.eq).toHaveBeenCalledWith('creator_id', 'user-1')
    expect(existingLinkBuilder.eq).toHaveBeenCalledWith('external_status', 'success')
    expect(createTravelpayoutsPartnerLinksMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('validates membership before generating and storing a Travelpayouts partner link via the security-definer RPC', async () => {
    buildSubIdMock.mockReturnValue('creator-sub')
    createTravelpayoutsPartnerLinksMock.mockResolvedValue([
      {
        originalUrl: 'https://example.com/hotel',
        partnerUrl: 'https://tp.st/abc',
        status: 'success',
      },
    ])
    const participantBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({
        data: { id: 'participant-1', mission_id: 'mission-1', creator_id: 'user-1', status: 'active' },
        error: null,
      })),
    })
    const missionBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({
        data: {
          id: 'mission-1',
          affiliate_network_program_id: 'program-1',
          mission_source: 'travelpayouts',
          status: 'published',
        },
        error: null,
      })),
    })
    const programBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({
        data: { id: 'program-1', network: 'travelpayouts', status: 'active' },
        error: null,
      })),
    })
    const existingLinkBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const rpcMock = vi.fn(async () => ({
      data: [{ id: 'partner-link-1', partner_url: 'https://tp.st/abc' }],
      error: null,
    }))
    const supabase = createSupabaseMock(
      {
        mission_participants: participantBuilder,
        missions: missionBuilder,
        affiliate_network_programs: programBuilder,
        affiliate_partner_links: existingLinkBuilder,
      },
      { rpc: rpcMock },
    )
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createPartnerLinkAction({
      missionParticipantId: 'participant-1',
      originalUrl: 'https://example.com/hotel',
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: true,
      link: { id: 'partner-link-1', partner_url: 'https://tp.st/abc' },
    })
    expect(participantBuilder.maybeSingle.mock.invocationCallOrder[0])
      .toBeLessThan(createTravelpayoutsPartnerLinksMock.mock.invocationCallOrder[0])
    expect(missionBuilder.maybeSingle.mock.invocationCallOrder[0])
      .toBeLessThan(createTravelpayoutsPartnerLinksMock.mock.invocationCallOrder[0])
    expect(programBuilder.maybeSingle.mock.invocationCallOrder[0])
      .toBeLessThan(createTravelpayoutsPartnerLinksMock.mock.invocationCallOrder[0])
    expect(buildSubIdMock).toHaveBeenCalledWith({
      missionId: 'mission-1',
      participantId: 'participant-1',
      creatorId: 'user-1',
    })
    // Persists through the SECURITY DEFINER RPC on the creator's own client — no
    // service-role key client is constructed.
    expect(rpcMock).toHaveBeenCalledWith('create_travelpayouts_partner_link', {
      p_affiliate_network_program_id: 'program-1',
      p_mission_id: 'mission-1',
      p_mission_participant_id: 'participant-1',
      p_original_url: 'https://example.com/hotel',
      p_partner_url: 'https://tp.st/abc',
      p_sub_id: 'creator-sub',
    })
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh-hk/studio/missions')
  })

  it('returns a save error when the partner-link RPC rejects', async () => {
    buildSubIdMock.mockReturnValue('creator-sub')
    createTravelpayoutsPartnerLinksMock.mockResolvedValue([
      {
        originalUrl: 'https://example.com/hotel',
        partnerUrl: 'https://tp.st/abc',
        status: 'success',
      },
    ])
    const rpcMock = vi.fn(async () => ({ data: null, error: { message: 'Partner link is not allowed' } }))
    const supabase = createSupabaseMock(
      {
        mission_participants: createBuilder({
          maybeSingle: vi.fn(async () => ({
            data: { id: 'participant-1', mission_id: 'mission-1', creator_id: 'user-1', status: 'active' },
            error: null,
          })),
        }),
        missions: createBuilder({
          maybeSingle: vi.fn(async () => ({
            data: {
              id: 'mission-1',
              affiliate_network_program_id: 'program-1',
              mission_source: 'travelpayouts',
              status: 'published',
            },
            error: null,
          })),
        }),
        affiliate_network_programs: createBuilder({
          maybeSingle: vi.fn(async () => ({
            data: { id: 'program-1', network: 'travelpayouts', status: 'active' },
            error: null,
          })),
        }),
        affiliate_partner_links: createBuilder({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        }),
      },
      { rpc: rpcMock },
    )
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createPartnerLinkAction({
      missionParticipantId: 'participant-1',
      originalUrl: 'https://example.com/hotel',
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Partner link could not be saved'] },
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'create_travelpayouts_partner_link',
      expect.objectContaining({
        p_mission_participant_id: 'participant-1',
        p_partner_url: 'https://tp.st/abc',
        p_sub_id: 'creator-sub',
      }),
    )
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('social enrichment boundary', () => {
  it('returns unavailable instead of throwing when enrichment is not configured', async () => {
    const { fetchSocialSnapshot } = await import('@/lib/missions/social-enrichment')

    await expect(
      fetchSocialSnapshot({ platform: 'instagram', proofUrl: 'https://instagram.com/p/demo' }),
    ).resolves.toMatchObject({
      confidenceStatus: 'unavailable',
    })
  })
})

describe('submitMilestoneAction', () => {
  it('rejects an invalid proof URL before any DB call', async () => {
    const supabase = createSupabaseMock({})
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'not-a-url', locale: 'en',
    })
    expect(result).toEqual({ ok: false, errors: { proofUrl: ['url'] } })
  })

  it('inserts a submitted submission for the owning active participant', async () => {
    const submissionInsert = createBuilder({ single: vi.fn(async () => ({ data: { id: 'sub-1' }, error: null })) })
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'user-1', status: 'active', mission_id: 'm1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }), // existing lookup → none
        submissionInsert, // insert
      ],
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1',
      proofUrl: 'https://www.instagram.com/p/Cabc/', notes: 'live', locale: 'en',
    })

    expect(result).toEqual({ ok: true, submissionId: 'sub-1' })
    expect(submissionInsert.insert).toHaveBeenCalledWith({
      mission_milestone_id: 'ms1',
      mission_participant_id: 'p1',
      proof_urls: ['https://www.instagram.com/p/Cabc/'],
      notes: 'live',
      status: 'submitted',
      submitted_at: expect.any(String),
    })
  })

  it('rejects when the participant belongs to another creator', async () => {
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'someone-else', status: 'active', mission_id: 'm1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'https://instagram.com/p/x', locale: 'en',
    })
    expect(result).toEqual({ ok: false, errors: { form: ['Creator access is required'] } })
  })

  it('updates an existing revision_requested submission instead of inserting', async () => {
    const submissionUpdate = createBuilder({ single: vi.fn(async () => ({ data: { id: 'sub-1' }, error: null })) })
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'user-1', status: 'active', mission_id: 'm1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({ maybeSingle: vi.fn(async () => ({ data: { id: 'sub-1', status: 'revision_requested' }, error: null })) }),
        submissionUpdate,
      ],
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'https://instagram.com/p/x', locale: 'en',
    })
    expect(result).toEqual({ ok: true, submissionId: 'sub-1' })
    expect(submissionUpdate.update).toHaveBeenCalled()
  })
})
