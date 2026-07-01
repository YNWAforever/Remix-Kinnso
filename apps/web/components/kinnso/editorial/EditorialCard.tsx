import type { ReactNode } from 'react'

/**
 * Magazine-style card: media band on top, hairline border, generous text block.
 * `media` is a slot (pass your own <Image>) so this stays a dumb server component
 * and tests never need a next/image mock.
 */
export function EditorialCard({
  media,
  kicker,
  title,
  children,
  footer,
  className = '',
}: {
  media?: ReactNode
  kicker?: string
  title: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <article className={`k2-card flex flex-col ${className}`.trim()}>
      {media ? (
        <div data-slot="media" className="aspect-[4/3] w-full overflow-hidden bg-kinnso2-sand">
          {media}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-5">
        {kicker ? <p className="k2-eyebrow">{kicker}</p> : null}
        <h3 className="k2-display text-xl font-semibold text-kinnso2-ink">{title}</h3>
        {children ? <div className="text-sm leading-relaxed text-kinnso2-ink/70">{children}</div> : null}
        {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
      </div>
    </article>
  )
}
