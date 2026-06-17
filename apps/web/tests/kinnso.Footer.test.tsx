// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Footer from '@/components/kinnso/Footer'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('Footer', () => {
  it('renders translated column titles and locale-prefixed links', () => {
    render(<Footer locale="ja" t={en.footer} />)
    expect(screen.getByText(en.footer.colCreators)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.footer.lStudio }).getAttribute('href')).toBe('/ja/studio')
    expect(screen.getByRole('link', { name: en.footer.lAbout }).getAttribute('href')).toBe('/ja/about')
  })
})
