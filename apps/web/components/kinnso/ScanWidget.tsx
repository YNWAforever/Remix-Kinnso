'use client'
import React, { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import DnaCard from "./DnaCard";
import type { Dna } from "@kinnso/scan";
import type { Tier } from "@/lib/creator-mock";

type DnaMetrics = {
  engagementScore: number; tierSuggested: Tier; travelPosts: number;
  contentMix: { tag: string; pct: number }[]; cities: { city: string; country: string }[];
};
const FALLBACK_DNA: Dna = {
  bio: 'Travel creator.', niches: ['travel', 'coffee'], content_pillars: ['city walks', 'cafes'],
  tone: ['warm', 'minimal'], audience: { top_geos: ['HK', 'TW', 'SG'], top_locales: ['zh-HK', 'en'] },
  platforms: [{ platform: 'instagram', followers: 27400, avg_engagement: 0.06, verified: false }], languages: ['zh-HK', 'en'],
};
const FALLBACK_METRICS: DnaMetrics = {
  engagementScore: 82, tierSuggested: 'rising', travelPosts: 268,
  contentMix: [{ tag: 'Food', pct: 32 }, { tag: 'City Walk', pct: 24 }, { tag: 'Hotels', pct: 18 }, { tag: 'Coffee', pct: 14 }, { tag: 'Wellness', pct: 12 }],
  cities: [{ city: 'Tokyo', country: 'JP' }, { city: 'Hong Kong', country: 'HK' }, { city: 'Taipei', country: 'TW' }, { city: 'Seoul', country: 'KR' }, { city: 'Bangkok', country: 'TH' }, { city: 'Singapore', country: 'SG' }],
};

const platforms = ["Instagram", "Threads", "TikTok", "YouTube"];

export const ScanWidget: React.FC<{ dna?: Dna; metrics?: DnaMetrics }> = ({ dna = FALLBACK_DNA, metrics = FALLBACK_METRICS }) => {
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "done">("idle");

  const runScan = () => {
    if (!handle.trim()) return;
    setStatus("scanning");
    setTimeout(() => setStatus("done"), 1600);
  };

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center rounded-pill bg-white shadow-kinnso ring-1 ring-kinnso-cream2 focus-within:ring-kinnso-orange">
          <span className="k-mono pl-5 pr-1 text-kinnso-muted">@</span>
          <input
            className="k-mono flex-1 bg-transparent py-3 pr-4 text-sm text-kinnso-ink outline-none placeholder:text-kinnso-muted/60"
            placeholder="yourhandle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
            onKeyDown={(e) => e.key === "Enter" && runScan()}
          />
        </div>
        <button onClick={runScan} className="k-btn-primary justify-center sm:px-7" disabled={status === "scanning"}>
          {status === "scanning" ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…</>
          ) : (
            <>Scan <ArrowRight className="ml-2 h-4 w-4" /></>
          )}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/80">
        {platforms.map((p) => (
          <span key={p} className="rounded-pill bg-white/15 px-3 py-1 backdrop-blur-sm">{p}</span>
        ))}
      </div>

      {status === "done" && (
        <div className="mt-6">
          <DnaCard dna={dna} metrics={metrics} compact />
        </div>
      )}
    </div>
  );
};

export default ScanWidget;
