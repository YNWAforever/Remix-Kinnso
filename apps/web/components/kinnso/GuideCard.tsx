import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import { ReceiptRow, TicketCard, TicketDivider } from "./MarketPassport";
import type { Guide } from "@/lib/creator-mock";
import type { Locale } from "@/lib/i18n/config";

const GuideCard = ({ g, locale }: { g: Guide; locale: Locale }) => (
  <Link href={`/${locale}/g/${g.slug}`} className="group block">
    <TicketCard as="article" className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-kinnso-cream2">
        <img
          src={g.cover}
          alt={g.title}
          width={640}
          height={480}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-kinnso-ink">{g.title}</h3>
        <div className="mt-2 flex items-center gap-2 text-xs text-kinnso-muted">
          <span className="k-mono">@{g.creatorHandle}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center"><MapPin aria-hidden="true" className="mr-0.5 h-3 w-3" /> {g.city}</span>
        </div>
        <TicketDivider className="my-3" />
        <ReceiptRow
          label={<span className="inline-flex items-center gap-1"><Bookmark aria-hidden="true" className="h-3 w-3" /> Saves</span>}
          value={g.saves.toLocaleString()}
        />
      </div>
    </TicketCard>
  </Link>
);

export default GuideCard;
