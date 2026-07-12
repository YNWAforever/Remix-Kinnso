import Link from 'next/link'
import { Bookmark, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/config'

export interface ExperienceCardData {
  slug: string
  title: string
  city: string
  priceAmount: number
  currency: string
  coverUrl: string | null
  savesCount: number
}

export function ExperienceCard({ experience, locale, savesLabel = 'Saves', isSaved, onSaveToggle }: {
  experience: ExperienceCardData
  locale: Locale
  savesLabel?: string
  isSaved?: boolean
  onSaveToggle?: () => void
}) {
  return (
    <Link
      href={`/${locale}/experiences/${experience.slug}`}
      className="group flex items-center gap-3 rounded-lg border border-kinnso-cream2 bg-white p-3 hover:border-kinnso-orangeDark"
    >
      <div
        role="img"
        aria-label={experience.title}
        className="h-16 w-16 shrink-0 rounded-md bg-kinnso-cream2 bg-cover bg-center"
        style={experience.coverUrl ? { backgroundImage: `url(${experience.coverUrl})` } : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-kinnso-ink">{experience.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-kinnso-muted">
          <MapPin className="h-3 w-3" aria-hidden="true" /> {experience.city}
          <span>· {experience.currency} {experience.priceAmount.toLocaleString()}</span>
        </p>
      </div>
      {onSaveToggle ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSaveToggle(); }}
          className="flex shrink-0 items-center gap-1 rounded-[3px] p-2 text-xs text-kinnso-muted hover:text-kinnso-orangeDark"
        >
          <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current text-kinnso-orangeDark')} aria-hidden="true" />
          <span className="sr-only">{savesLabel} </span>
          {experience.savesCount.toLocaleString()}
        </button>
      ) : (
        <span className="flex shrink-0 items-center gap-1 p-2 text-xs text-kinnso-muted">
          <Bookmark className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{savesLabel} </span>
          {experience.savesCount.toLocaleString()}
        </span>
      )}
    </Link>
  )
}

export default ExperienceCard
