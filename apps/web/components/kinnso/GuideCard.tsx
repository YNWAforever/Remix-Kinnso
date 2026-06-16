import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import type { Guide } from "@/lib/creator-mock";

const GuideCard = ({ g }: { g: Guide }) => (
  <Link href={`/g/${g.slug}`} className="group block">
    <article className="k-card overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden bg-kinnso-cream2">
        <img src={g.cover} alt={g.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-kinnso-ink">{g.title}</h3>
        <div className="mt-2 flex items-center gap-2 text-xs text-kinnso-muted">
          <span className="k-mono">@{g.creatorHandle}</span>
          <span>·</span>
          <span className="inline-flex items-center"><MapPin className="mr-0.5 h-3 w-3" /> {g.city}</span>
        </div>
        <div className="mt-3 flex items-center justify-end text-xs text-kinnso-muted">
          <span className="inline-flex items-center"><Bookmark className="mr-1 h-3 w-3" /> {g.saves.toLocaleString()}</span>
        </div>
      </div>
    </article>
  </Link>
);

export default GuideCard;
