import type { ReactNode } from 'react'

/**
 * R1A editorial band: consistent max-width + vertical rhythm for every
 * editorial-journal surface. Server component — no client state.
 */
export function SectionShell({
  as: Tag = 'section',
  className = '',
  children,
}: {
  as?: 'section' | 'div' | 'header'
  className?: string
  children: ReactNode
}) {
  return (
    <Tag className={`py-14 md:py-20 ${className}`.trim()}>
      <div className="k2-container">{children}</div>
    </Tag>
  )
}
