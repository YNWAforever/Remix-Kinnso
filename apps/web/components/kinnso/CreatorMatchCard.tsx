'use client'
import React, { useState } from "react";
import Link from "next/link";
import { Bookmark, ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtendedCreator } from "@/lib/creator-mock";
import { creatorPosts, creatorLocations, engagementHistory, computeMatch } from "@/lib/creator-mock";
import ScoreRing from "./ScoreRing";
import TierBadge from "./TierBadge";
import EngagementTrendChart from "./EngagementTrendChart";
import TagCloud from "./TagCloud";
import WorldHeatmap from "./WorldHeatmap";

interface Props {
  creator: ExtendedCreator;
  saved: boolean;
  onToggleSave: () => void;
  onQuickView: () => void;
}

export const CreatorMatchCard: React.FC<Props> = ({ creator, saved, onToggleSave, onQuickView }) => {
  const [expanded, setExpanded] = useState(false);
  const match = computeMatch(creator);
  const locs = creatorLocations.filter((l) => l.creatorHandle === creator.handle).slice(0, 5);
  const topPosts = creatorPosts.filter((p) => p.creatorHandle === creator.handle && p.isTravel).slice(0, 3);
  const history = engagementHistory.filter((h) => h.creatorHandle === creator.handle);

  return (
    <article className="k-card overflow-hidden">
      <div className="grid gap-4 p-5 md:grid-cols-[200px_1fr_180px] md:gap-6">
        {/* Left */}
        <div className="flex items-start gap-3 md:flex-col md:items-start">
          <div className="relative">
            <img src={creator.avatar} alt={creator.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-kinnso-cream2" />
            <div className="absolute -bottom-1 -right-1"><TierBadge tier={creator.tier} className="!px-2 !py-0.5 !text-[10px]" /></div>
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-kinnso-ink">{creator.name}</div>
            <div className="k-mono text-xs text-kinnso-muted">@{creator.handle}</div>
            <div className="mt-1 text-xs text-kinnso-muted">{creator.homeCity} · {creator.category}</div>
          </div>
        </div>

        {/* Center */}
        <div>
          <div className="flex items-start gap-4">
            <ScoreRing score={match.score} size="sm" label="match" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {match.reasonList.map((r) => (
                  <span key={r.label} className="inline-flex items-center gap-1 rounded-md bg-kinnso-cream2 px-2 py-0.5 text-xs text-kinnso-ink">
                    <span>{r.icon}</span> {r.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-kinnso-muted">
                <span>DNA <span className="k-mono font-bold text-kinnso-ink">{creator.score}</span></span>
                <span>ER <span className="k-mono font-bold text-kinnso-ink">{(creator.er * 100).toFixed(1)}%</span></span>
                <span>{creator.guides} Guides</span>
                <span>{(creator.driven90dReach / 1000).toFixed(0)}k Reach</span>
                <span>{creator.countries} Countries</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col gap-2">
          <button onClick={onQuickView} className="k-btn-ghost text-xs"><ExternalLink className="mr-1 inline h-3 w-3" /> View profile</button>
          <Link href={`/merchants/post?creator=${creator.handle}`} className="k-btn-primary text-xs">Send brief →</Link>
          <button onClick={onToggleSave} className={cn("k-btn-ghost text-xs", saved && "bg-kinnso-amber/40 text-kinnso-ink")}>
            <Bookmark className={cn("mr-1 inline h-3 w-3", saved && "fill-current")} /> {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-center gap-1 border-t border-kinnso-cream2 py-2 text-xs font-semibold text-kinnso-muted hover:bg-kinnso-cream2">
        {expanded ? "Hide details" : "Show details"} <ChevronDown className={cn("h-3 w-3 transition", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="grid gap-5 border-t border-kinnso-cream2 bg-kinnso-cream2/40 p-5 md:grid-cols-3">
          <div>
            <h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-kinnso-muted">Top locations</h5>
            <div className="overflow-hidden rounded-md">
              <WorldHeatmap locations={locs} height={140} interactive={false} />
            </div>
          </div>
          <div>
            <h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-kinnso-muted">Content sample</h5>
            <div className="grid grid-cols-3 gap-1.5">
              {topPosts.map((p) => (
                <a key={p.id} href={p.postUrl} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-md">
                  <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
          <div>
            <h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-kinnso-muted">Engagement trend</h5>
            <EngagementTrendChart history={history} height={100} compact />
          </div>
          <div className="md:col-span-3">
            <TagCloud tags={creator.topTags.slice(0, 8)} />
          </div>
        </div>
      )}
    </article>
  );
};

export default CreatorMatchCard;
