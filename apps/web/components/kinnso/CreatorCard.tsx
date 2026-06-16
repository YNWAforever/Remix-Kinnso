import Link from "next/link";
import TierBadge from "./TierBadge";
import type { Creator } from "@/lib/creator-mock";

const CreatorCard = ({ c, locale }: { c: Creator; locale?: string }) => (
  <Link href={locale ? `/${locale}/c/${c.handle}` : `/c/${c.handle}`} className="block w-56 shrink-0">
    <div className="k-card p-4 text-center transition hover:-translate-y-0.5 hover:shadow-lg">
      <img src={c.avatar} alt={c.name} className="mx-auto h-20 w-20 rounded-full object-cover ring-2 ring-kinnso-cream2" />
      <h4 className="mt-3 font-bold text-kinnso-ink">{c.name}</h4>
      <p className="k-mono text-xs text-kinnso-muted">@{c.handle}</p>
      <p className="mt-1 text-xs text-kinnso-muted">{c.homeCity} · {c.category}</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <TierBadge tier={c.tier} score={c.score} showScore />
      </div>
      <p className="mt-2 text-xs text-kinnso-muted">{c.guides} Guides</p>
    </div>
  </Link>
);

export default CreatorCard;
