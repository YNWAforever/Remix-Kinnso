import type { ReactNode } from 'react'

/** Small-caps kicker above editorial headlines ("DESTINATIONS", "FROM THE JOURNAL"). */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`k2-eyebrow ${className}`.trim()}>{children}</p>
}
