import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn()
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: () => ({ insert: insertMock }) }),
}))

import { joinAgentWaitlistAction } from '@/lib/agent/waitlist-actions'

describe('joinAgentWaitlistAction', () => {
  beforeEach(() => insertMock.mockReset())

  it('rejects an invalid email without touching the DB', async () => {
    expect(await joinAgentWaitlistAction('en', 'not-an-email')).toEqual({ ok: false, error: 'invalid' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('normalizes and inserts a valid email', async () => {
    insertMock.mockResolvedValue({ error: null })
    expect(await joinAgentWaitlistAction('en', '  Traveller@Example.COM ')).toEqual({ ok: true })
    expect(insertMock).toHaveBeenCalledWith({ email: 'traveller@example.com', locale: 'en' })
  })

  it('treats a duplicate email (23505) as success — idempotent join', async () => {
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    expect(await joinAgentWaitlistAction('en', 'a@b.co')).toEqual({ ok: true })
  })

  it('reports (and logs) other DB errors as failed', async () => {
    insertMock.mockResolvedValue({ error: { code: '42501', message: 'nope' } })
    expect(await joinAgentWaitlistAction('en', 'a@b.co')).toEqual({ ok: false, error: 'failed' })
  })

  it('honeypot submissions get a fake success and never touch the DB', async () => {
    expect(await joinAgentWaitlistAction('en', 'a@b.co', 'bot-filled-this')).toEqual({ ok: true })
    expect(insertMock).not.toHaveBeenCalled()
  })
})
