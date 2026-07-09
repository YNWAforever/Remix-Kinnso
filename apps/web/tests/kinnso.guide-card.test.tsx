// apps/web/tests/kinnso.guide-card.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GuideCard from '@/components/kinnso/GuideCard'

afterEach(cleanup)

const guide = { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Kyoto', saves: 5, creatorHandle: 'teafan' }

describe('GuideCard', () => {
  it('renders the static bookmark count when isSaved/onSaveToggle are omitted (existing 3 consumers, unchanged)', () => {
    render(<GuideCard g={guide} locale="en" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders an interactive toggle button when isSaved/onSaveToggle are both supplied, and never navigates the card link on click', () => {
    const onSaveToggle = vi.fn()
    render(<GuideCard g={guide} locale="en" isSaved={true} onSaveToggle={onSaveToggle} />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onSaveToggle).toHaveBeenCalledTimes(1)
  })
})
