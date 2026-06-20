// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ScanWidget from '@/components/kinnso/ScanWidget'

afterEach(cleanup)

describe('ScanWidget', () => {
  it('labels the handle field and exposes the async result as a live region', () => {
    vi.useFakeTimers()
    render(<ScanWidget />)
    const input = screen.getByLabelText('Social handle')
    expect(input.getAttribute('name')).toBe('socialHandle')
    expect(input.getAttribute('autoComplete')).toBe('username')
    fireEvent.change(input, { target: { value: 'maywanders' } })
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))
    vi.advanceTimersByTime(1700)
    expect(screen.getByRole('status')).toBeTruthy()
    vi.useRealTimers()
  })
})
