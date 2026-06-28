import { describe, it, expect } from 'vitest'
import { validateCopilotMessages, MAX_COPILOT_MESSAGES } from '@/lib/copilot/request'

const small = () => ({ role: 'user', parts: [{ type: 'text', text: 'hi' }] })

describe('validateCopilotMessages', () => {
  it('accepts a small valid payload', () => {
    const result = validateCopilotMessages([small()])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.messages).toHaveLength(1)
  })
  it('rejects an empty array as invalid', () => {
    expect(validateCopilotMessages([])).toEqual({ ok: false, reason: 'invalid' })
  })
  it('rejects a non-array as invalid', () => {
    expect(validateCopilotMessages('nope')).toEqual({ ok: false, reason: 'invalid' })
  })
  it('rejects too many messages as too_large', () => {
    const many = Array.from({ length: MAX_COPILOT_MESSAGES + 1 }, small)
    expect(validateCopilotMessages(many)).toEqual({ ok: false, reason: 'too_large' })
  })
  it('rejects an oversized single message as too_large', () => {
    const huge = [{ role: 'user', parts: [{ type: 'text', text: 'x'.repeat(50_001) }] }]
    expect(validateCopilotMessages(huge)).toEqual({ ok: false, reason: 'too_large' })
  })
  it('accepts a payload just under both caps', () => {
    const justUnder = [{ role: 'user', parts: [{ type: 'text', text: 'x'.repeat(50_000) }] }]
    const result = validateCopilotMessages(justUnder)
    expect(result.ok).toBe(true)
  })
})
