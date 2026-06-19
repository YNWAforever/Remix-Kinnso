// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { GuideForm } from '@/components/kinnso/GuideForm'

afterEach(cleanup)

describe('GuideForm', () => {
  it('renders the four fields and both submit buttons', () => {
    render(<GuideForm t={en.studioGuides} mode="new" onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(en.studioGuides.titleLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.studioGuides.cityLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.studioGuides.coverLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.studioGuides.summaryLabel)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.studioGuides.saveDraft })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.studioGuides.publish })).toBeTruthy()
  })

  it('shows a validation error and does not call onSubmit when title is blank', () => {
    const onSubmit = vi.fn()
    render(<GuideForm t={en.studioGuides} mode="new" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: en.studioGuides.publish }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(en.studioGuides.errorTitleRequired)
  })
})
