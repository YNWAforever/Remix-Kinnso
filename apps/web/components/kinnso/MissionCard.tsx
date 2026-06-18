import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import TierBadge from "./TierBadge";
import type { Mission } from "@/lib/creator-mock";

const MissionCard = ({ m, href }: { m: Mission; href: string }) => (
  <Link href={href} className="block">
    <article className="k-card group relative h-full overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="k-chip">{m.category}</span>
          <h3 className="mt-2 text-lg font-bold leading-snug text-kinnso-ink">{m.title}</h3>
          <p className="mt-1 text-sm text-kinnso-muted">by {m.merchant}</p>
        </div>
        <TierBadge tier={m.tier} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-kinnso-ink/80">{m.brief}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-kinnso-muted">
        <span className="inline-flex items-center"><MapPin className="mr-1 h-3 w-3" /> {m.cities.join(", ")}</span>
        <span className="inline-flex items-center"><Calendar className="mr-1 h-3 w-3" /> {m.travelWindow}</span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-kinnso-cream2 pt-3">
        <div>
          <div className="k-mono text-xl font-bold text-kinnso-green">HK${m.payout.toLocaleString()}</div>
          <div className="text-[10px] uppercase tracking-wider text-kinnso-muted">payout · +{m.commission}% comm.</div>
        </div>
        <span className="k-btn-ghost text-xs">View brief →</span>
      </div>
    </article>
  </Link>
);

export default MissionCard;
