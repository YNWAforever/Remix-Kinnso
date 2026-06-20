import React from "react";
import { tickerSeed, type TickerItem } from "@/lib/creator-mock";

export const EarningsTicker: React.FC<{ items?: TickerItem[] }> = ({ items: seed = tickerSeed }) => {
  const items = [...seed, ...seed];
  return (
    <div className="relative overflow-hidden bg-kinnso-ink py-3 text-white" aria-label="Recent creator payouts">
      <div className="flex animate-marquee whitespace-nowrap motion-reduce:animate-none">
        {items.map((it, i) => (
          <span key={i} className="mx-6 inline-flex items-center gap-2 text-sm">
            <span className="k-mono text-kinnso-amber">@{it.handle}</span>
            <span className="k-mono font-bold text-kinnso-green">+HK${it.amount.toLocaleString('en-HK')}</span>
            <span className="text-white/70">· {it.label}</span>
            <span className="text-white/40">· {it.ago}</span>
            <span aria-hidden="true" className="text-white/30">●</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default EarningsTicker;
