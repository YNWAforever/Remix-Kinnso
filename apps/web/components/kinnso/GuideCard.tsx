import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import { EditorialCard } from "@/components/kinnso/editorial/EditorialCard";
import type { Guide } from '@/lib/guides/types';
import type { Locale } from "@/lib/i18n/config";

const GuideCard = ({ g, locale, savesLabel = 'Saves', isSaved, onSaveToggle }: {
  g: Guide; locale: Locale; savesLabel?: string
  isSaved?: boolean
  onSaveToggle?: () => void
}) => (
  <Link href={`/${locale}/g/${g.slug}`} className="group block">
    <EditorialCard
      media={
        <img src={g.cover} alt={g.title} width={640} height={480} loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
      }
      kicker={<span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="h-3 w-3" /> {g.city}</span>}
      title={g.title}
      footer={
        <div className="flex items-center justify-between border-t border-kinnso-edge pt-3 text-xs text-kinnso-muted">
          <span>@{g.creatorHandle}</span>
          {onSaveToggle ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSaveToggle(); }}
              className="inline-flex items-center gap-1"
            >
              <Bookmark aria-hidden="true" className={isSaved ? 'h-3 w-3 fill-current' : 'h-3 w-3'} />
              <span className="sr-only">{savesLabel} </span>
              {g.saves.toLocaleString()}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Bookmark aria-hidden="true" className="h-3 w-3" />
              <span className="sr-only">{savesLabel} </span>
              {g.saves.toLocaleString()}
            </span>
          )}
        </div>
      }
    />
  </Link>
);

export default GuideCard;
