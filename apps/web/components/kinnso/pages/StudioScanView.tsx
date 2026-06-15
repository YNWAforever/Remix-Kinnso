'use client'
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Share2, ArrowRight, Lock } from "lucide-react";
import BearMascot from "@/components/kinnso/BearMascot";
import ScoreRing from "@/components/kinnso/ScoreRing";
import TierBadge from "@/components/kinnso/TierBadge";
import ScoreDeltaChip from "@/components/kinnso/ScoreDeltaChip";
import RescanStatusChip from "@/components/kinnso/RescanStatusChip";
import ScoreBreakdownPanel from "@/components/kinnso/ScoreBreakdownPanel";
import EngagementTrendChart from "@/components/kinnso/EngagementTrendChart";
import ContentMixDonut from "@/components/kinnso/ContentMixDonut";
import WorldHeatmap from "@/components/kinnso/WorldHeatmap";
import CityChip from "@/components/kinnso/CityChip";
import PlaceTagRow from "@/components/kinnso/PlaceTagRow";
import PostThumbnailGrid from "@/components/kinnso/PostThumbnailGrid";
import TagCloud from "@/components/kinnso/TagCloud";
import CityDetailDrawer from "@/components/kinnso/CityDetailDrawer";
import ShareDnaDialog from "@/components/kinnso/ShareDnaDialog";
import MissionCard from "@/components/kinnso/MissionCard";
import {
  creatorLocations, creatorPosts, creatorPlaceTags,
  engagementHistory, type CreatorLocation,
} from "@/lib/creator-mock";
import { missions, tierMeta, type Tier } from "@/lib/creator-mock";
import type { Dna } from "@kinnso/scan";
import type { ExtendedCreator, ScoreBreakdown } from "@/lib/creator-mock";
import type { Messages } from "@/lib/i18n/messages/en";

const SCAN_STEPS = [
  { label: "Connected to Instagram", delay: 0 },
  { label: "Fetched 412 posts",      delay: 1200 },
  { label: "Classified: 286 travel · 126 other", delay: 2400 },
  { label: "Extracted 41 cities across 12 countries", delay: 3600 },
  { label: "Photo scan complete · 22 landmarks identified", delay: 4800 },
  { label: "Engagement Score: ready",  delay: 6000 },
  { label: "6 missions matched",       delay: 7000 },
];

const TIER_ORDER: Tier[] = ["seed", "rising", "pro", "elite"];

export function StudioScanView({ creator, dna, breakdown, t }: {
  creator: ExtendedCreator
  dna: Dna
  breakdown: ScoreBreakdown
  t: Messages['studio']
}) {
  const router = useRouter();
  // dna is threaded so the host can pass real `creator_dna.final`; the rich
  // metrics overlay (score/audience/contentMix/topTags/er) stays mock this slice.
  void dna;

  // Default to "done" so the report renders synchronously for tests and for
  // hosts that pass an already-scanned creator. This is the one intentional
  // behavior change vs. the redesign: no auto-replay of the fake scan on mount
  // (the intro/scanning branch is reachable only via the Rescan/Start scan
  // buttons), so there is no mount useEffect that would call setState in-effect.
  const [phase, setPhase] = useState<"intro" | "scanning" | "done">("done");
  const [doneSteps, setDoneSteps] = useState<number>(0);
  const [igInput, setIgInput] = useState(creator.handle);
  const [selectedCity, setSelectedCity] = useState<CreatorLocation | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const startScan = () => {
    setPhase("scanning");
    setDoneSteps(0);
    SCAN_STEPS.forEach((s, i) => {
      setTimeout(() => {
        setDoneSteps(i + 1);
        if (i === SCAN_STEPS.length - 1) {
          setTimeout(() => {
            setPhase("done");
          }, 1000);
        }
      }, s.delay);
    });
  };

  const locs = creatorLocations.filter((l) => l.creatorHandle === creator.handle);
  const posts = creatorPosts.filter((p) => p.creatorHandle === creator.handle);
  const places = creatorPlaceTags.filter((p) => p.creatorHandle === creator.handle);
  const history = engagementHistory.filter((h) => h.creatorHandle === creator.handle);
  const topPosts = useMemo(
    () => [...posts].filter((p) => p.isTravel).sort((a, b) => (b.likes + b.saves * 3 + b.comments * 2) - (a.likes + a.saves * 3 + a.comments * 2)).slice(0, 6),
    [posts],
  );
  const lastScanned = new Date().toISOString().slice(0, 10);
  const delta = 3;

  const matched = missions.slice(0, 3);
  const tierIdx = TIER_ORDER.indexOf(creator.tier);

  // ───── INTRO + SCANNING SCREEN ─────────────────────────────
  if (phase !== "done") {
    return (
      <div className="k-container py-16">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <BearMascot variant={phase === "scanning" ? "scanning" : "wave"} size="lg" />
            <h1 className="mt-6 text-3xl font-black text-kinnso-ink">
              {phase === "scanning" ? t.scanningHeading : t.introHeading}
            </h1>
            <p className="mt-2 text-sm text-kinnso-muted">{t.introSub}</p>
          </div>

          {phase === "intro" && (
            <div className="mt-8 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.instagram}</span>
                <div className="flex items-center rounded-pill bg-white ring-1 ring-kinnso-cream2 focus-within:ring-kinnso-orange">
                  <span className="k-mono pl-4 pr-1 text-kinnso-muted">@</span>
                  <input value={igInput} onChange={(e) => setIgInput(e.target.value)} className="k-mono flex-1 bg-transparent py-2.5 pr-4 text-sm outline-none" placeholder={t.handlePlaceholder} />
                </div>
              </label>
              <button type="button" onClick={startScan} className="k-btn-primary w-full">{t.startScan}</button>
            </div>
          )}

          {phase === "scanning" && (
            <>
              <div className="mt-8 h-1.5 overflow-hidden rounded-pill bg-kinnso-cream2">
                <div className="h-full bg-kinnso-orange transition-all duration-500" style={{ width: `${(doneSteps / SCAN_STEPS.length) * 100}%` }} />
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {SCAN_STEPS.map((s, i) => {
                  const done = i < doneSteps;
                  const active = i === doneSteps;
                  return (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {done ? <span className="grid h-5 w-5 place-items-center rounded-full bg-kinnso-green text-white">✓</span>
                              : active ? <Loader2 className="h-5 w-5 animate-spin text-kinnso-orange" />
                              : <span className="h-5 w-5 rounded-full bg-kinnso-cream2" />}
                        <span className={done ? "text-kinnso-ink" : "text-kinnso-muted"}>{s.label}</span>
                      </div>
                      {done && <span className="k-mono text-xs text-kinnso-muted">{(s.delay / 1000).toFixed(0)}s</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    );
  }

  // ───── DNA REPORT ─────────────────────────────────────────
  return (
    <div className="bg-kinnso-cream">
      <div className="k-container py-12">
        <div className="mx-auto max-w-[720px] space-y-10">
          {/* 1 · Identity header */}
          <section className="text-center">
            <BearMascot variant="celebrating" size="md" />
            <h1 className="mt-3 text-2xl font-black text-kinnso-ink">{t.reportReadyHeading}</h1>
          </section>

          <section className="k-card p-5">
            <div className="flex items-start gap-4">
              <img src={creator.avatar} alt={creator.name} className="h-20 w-20 rounded-full object-cover ring-2 ring-kinnso-cream2" />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-kinnso-ink">{creator.name}</h2>
                <p className="k-mono text-sm text-kinnso-muted">@{creator.handle}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-kinnso-ink">{creator.homeCity}</span>
                  <span className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-kinnso-ink">{creator.category}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-kinnso-muted">
                  <span>📷 {(creator.followerIg / 1000).toFixed(1)}k</span>
                  <span>💬 {(creator.followerTh / 1000).toFixed(1)}k</span>
                  {creator.followerYt > 0 && <span>▶️ {(creator.followerYt / 1000).toFixed(1)}k</span>}
                </div>
                <div className="mt-2 text-[11px] text-kinnso-muted">{t.lastScanned} {lastScanned} · {t.postsAnalyzed}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <RescanStatusChip lastScanned={lastScanned} />
                <button type="button" onClick={startScan} className="k-btn-ghost text-xs">{t.rescan}</button>
              </div>
            </div>
          </section>

          {/* 2 · Score ring + tier */}
          <section className="k-card p-6 text-center">
            <div className="flex justify-center"><ScoreRing score={creator.score} size="lg" showOutOf /></div>
            <div className="mt-3"><ScoreDeltaChip delta={delta} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.avgLikes}</div><div className="k-mono font-bold text-kinnso-ink">3,400</div></div>
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.avgSaves}</div><div className="k-mono font-bold text-kinnso-ink">980</div></div>
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.er}</div><div className="k-mono font-bold text-kinnso-ink">{(creator.er * 100).toFixed(1)}%</div></div>
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.travel}</div><div className="k-mono font-bold text-kinnso-ink">69%</div></div>
            </div>
            <div className="mt-5"><TierBadge tier={creator.tier} className="text-base" /></div>
            <p className="mt-2 text-xs text-kinnso-muted">{tierMeta[creator.tier].payout} · {tierMeta[creator.tier].commission} {t.commission}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {TIER_ORDER.map((tier, i) => (
                <React.Fragment key={tier}>
                  <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${i === tierIdx ? "bg-kinnso-orange text-white" : "bg-kinnso-cream2 text-kinnso-muted"}`}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
                  {i < TIER_ORDER.length - 1 && <span className="text-kinnso-muted">▸</span>}
                </React.Fragment>
              ))}
            </div>
          </section>

          {/* 3 · Score breakdown */}
          <ScoreBreakdownPanel breakdown={breakdown} />

          {/* 4 · Trend */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.engagementOverTime}</h3>
            <div className="mt-3"><EngagementTrendChart history={history} /></div>
          </section>

          {/* 5 · Audience */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.yourAudience}</h3>
            <div className="mt-3 flex h-5 w-full overflow-hidden rounded-pill">
              <div className="bg-kinnso-orange" style={{ width: `${creator.audience.hk}%` }} title={`HK ${creator.audience.hk}%`} />
              <div className="bg-kinnso-amber"  style={{ width: `${creator.audience.tw}%` }} title={`TW ${creator.audience.tw}%`} />
              <div className="bg-kinnso-blue"   style={{ width: `${creator.audience.sg}%` }} title={`SG ${creator.audience.sg}%`} />
              <div className="bg-kinnso-cream2" style={{ width: `${creator.audience.other}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-kinnso-muted">
              <span>🇭🇰 HK {creator.audience.hk}%</span>
              <span>🇹🇼 TW {creator.audience.tw}%</span>
              <span>🇸🇬 SG {creator.audience.sg}%</span>
              <span>{t.audienceOther} {creator.audience.other}%</span>
            </div>
          </section>

          {/* 6 · Content mix */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.whatYouCreate}</h3>
            <div className="mt-3"><ContentMixDonut data={creator.contentMix} size={180} /></div>
          </section>

          {/* 7 · Map + places */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.placesCovered}</h3>
            <p className="text-xs text-kinnso-muted">{t.placesCoveredSub.replace("{countries}", String(creator.countries)).replace("{cities}", String(creator.cities))}</p>
            <div className="mt-3"><WorldHeatmap locations={locs} onCityClick={setSelectedCity} /></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {locs.map((l) => <CityChip key={l.city} city={l.city} posts={l.postCount} flag={l.flag} onClick={() => setSelectedCity(l)} />)}
            </div>
            <h4 className="mt-6 text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.topVenues}</h4>
            <div className="mt-3 space-y-2">{places.slice(0, 5).map((p, i) => <PlaceTagRow key={i} place={p} />)}</div>
          </section>

          {/* 8 · Top posts */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.bestTravelPosts}</h3>
            <p className="text-xs text-kinnso-muted">{t.rankedByEngagement}</p>
            <div className="mt-3"><PostThumbnailGrid posts={topPosts} cols={6} /></div>
          </section>

          {/* 9 · Tag cloud */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.knownFor}</h3>
            <div className="mt-3"><TagCloud tags={creator.topTags} /></div>
          </section>

          {/* 10 · Matched missions */}
          <section>
            <div className="-mx-4 mb-4 rounded-md bg-kinnso-orange/90 px-4 py-2 text-sm font-bold text-white sm:-mx-0 sm:rounded-lg">
              {t.matchedForYou}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {matched.map((m) => {
                const locked = TIER_ORDER.indexOf(m.tier) > tierIdx;
                return (
                  <div key={m.id} className={locked ? "relative opacity-80" : ""}>
                    {locked && (
                      <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-pill bg-kinnso-red/15 px-2 py-1 text-[10px] font-bold text-kinnso-red">
                        <Lock className="h-3 w-3" /> {t.reachToUnlock.replace("{tier}", m.tier)}
                      </div>
                    )}
                    <MissionCard m={m} />
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => router.push("/studio/missions")} className="k-btn-ghost mt-4 text-sm">
              {t.viewAllMissions} <ArrowRight className="ml-1 inline h-3 w-3" />
            </button>
          </section>

          {/* Footer actions */}
          <section className="space-y-3">
            <button
              type="button"
              onClick={() => { router.push(`/c/${creator.handle}`); }}
              className="k-btn-primary w-full"
            >
              {t.publishProfile}
            </button>
            <button type="button" onClick={() => setShareOpen(true)} className="k-btn-ghost w-full">
              <Share2 className="mr-2 inline h-4 w-4" /> {t.shareDnaCard}
            </button>
          </section>
        </div>
      </div>

      <CityDetailDrawer open={!!selectedCity} onOpenChange={(o) => !o && setSelectedCity(null)} location={selectedCity} posts={posts} places={places} />
      <ShareDnaDialog open={shareOpen} onOpenChange={setShareOpen} creator={creator} />
    </div>
  );
}

export default StudioScanView;
