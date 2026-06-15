'use client'
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Instagram, MessageCircle, Youtube, MapPin } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { creatorLocations, creatorPosts, creatorPlaceTags, engagementHistory, type CreatorLocation } from "@/lib/creator-mock";
import { guides } from "@/lib/creator-mock";
import type { ExtendedCreator } from "@/lib/creator-mock";
import type { ViewerRole } from "@/lib/auth/viewer-role";
import type { Messages } from "@/lib/i18n/messages/en";

import ScoreRing from "@/components/kinnso/ScoreRing";
import TierBadge from "@/components/kinnso/TierBadge";
import PlatformStatCard from "@/components/kinnso/PlatformStatCard";
import WorldHeatmap from "@/components/kinnso/WorldHeatmap";
import CityChip from "@/components/kinnso/CityChip";
import PlaceTagRow from "@/components/kinnso/PlaceTagRow";
import ContentMixDonut from "@/components/kinnso/ContentMixDonut";
import TagCloud from "@/components/kinnso/TagCloud";
import GuideCard from "@/components/kinnso/GuideCard";
import BrandContactCard from "@/components/kinnso/BrandContactCard";
import PostThumbnailGrid from "@/components/kinnso/PostThumbnailGrid";
import CityDetailDrawer from "@/components/kinnso/CityDetailDrawer";
import EngagementTrendChart from "@/components/kinnso/EngagementTrendChart";

interface Props {
  creator: ExtendedCreator;
  role: ViewerRole;
  embedded?: boolean;
  t: Messages['creatorProfile'];
}

const CreatorProfileView: React.FC<Props> = ({ creator, role, embedded, t }) => {
  const [following, setFollowing] = useState(false);
  const toggleFollow = () => setFollowing((v) => !v);

  const [selectedCity, setSelectedCity] = useState<CreatorLocation | null>(null);
  const [postTab, setPostTab] = useState<"all" | "instagram" | "threads" | "youtube">("all");
  const [showAllPlaces, setShowAllPlaces] = useState(false);

  const locs   = useMemo(() => creatorLocations.filter((l) => l.creatorHandle === creator.handle), [creator]);
  const posts  = useMemo(() => creatorPosts.filter((p) => p.creatorHandle === creator.handle), [creator]);
  const places = useMemo(() => creatorPlaceTags.filter((p) => p.creatorHandle === creator.handle), [creator]);
  const history = useMemo(() => engagementHistory.filter((h) => h.creatorHandle === creator.handle), [creator]);
  const myGuides = useMemo(() => guides.filter((g) => g.creatorHandle === creator.handle), [creator]);

  const filteredPosts = postTab === "all" ? posts : posts.filter((p) => p.platform === postTab);
  const wrap = embedded ? "" : "k-container py-8 md:py-12";

  return (
    <article className={wrap}>
      {/* HERO */}
      <header className="overflow-hidden rounded-xl">
        <div className="relative h-48 w-full sm:h-72 md:h-80">
          <img src={creator.banner} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
          <span className="absolute right-4 top-4"><TierBadge tier={creator.tier} className="bg-kinnso-orange !text-white" /></span>
          <div className="absolute -bottom-12 left-6 flex items-end gap-3 sm:left-8">
            <img src={creator.avatar} alt={creator.name} className="h-24 w-24 rounded-full object-cover ring-4 ring-kinnso-cream" />
            <div className="mb-2 hidden rounded-xl bg-white p-1.5 shadow-kinnso sm:block">
              <ScoreRing score={creator.score} size="sm" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 pt-16 sm:p-8 sm:pt-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black text-kinnso-ink md:text-4xl">{creator.name}</h1>
              <p className="k-mono mt-1 text-sm text-kinnso-muted">@{creator.handle}</p>
              <p className="mt-2 max-w-xl text-sm text-kinnso-ink/80">{creator.bio}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center rounded-md bg-kinnso-cream2 px-2 py-0.5 text-kinnso-ink"><MapPin className="mr-1 h-3 w-3" /> {creator.homeCity}</span>
                <span className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-kinnso-ink">{creator.category}</span>
                <a href="#" className="text-kinnso-muted hover:text-kinnso-orange"><Instagram className="h-4 w-4" /></a>
                <a href="#" className="text-kinnso-muted hover:text-kinnso-orange"><MessageCircle className="h-4 w-4" /></a>
                {creator.followerYt > 0 && <a href="#" className="text-kinnso-muted hover:text-kinnso-orange"><Youtube className="h-4 w-4" /></a>}
              </div>
            </div>
            <button type="button" onClick={toggleFollow} className={following ? "k-btn-ghost" : "k-btn-primary"}>
              {following ? t.following : t.follow}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              [t.statGuides, creator.guides],
              [t.statCountries, creator.countries],
              [t.statCities, creator.cities],
              [t.statReach90d, `${(creator.driven90dReach / 1000).toFixed(0)}k`],
              [t.statDrivenGmv, `HK$${(creator.drivenGmv / 1000).toFixed(0)}k`],
            ].map(([label, val], i) => (
              <div key={i} className="rounded-md bg-kinnso-cream2 px-3 py-2">
                <div className="k-mono text-lg font-bold text-kinnso-ink">{val}</div>
                <div className="text-[11px] uppercase tracking-wider text-kinnso-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Engagement band */}
      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-kinnso-cream2 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="k-mono text-3xl font-black text-kinnso-orange">{creator.score}<span className="text-base text-kinnso-muted">/100</span></span>
          <TierBadge tier={creator.tier} />
        </div>
        <span className="text-xs text-kinnso-muted">{t.engagementBandSummary.replace("{er}", (creator.er * 100).toFixed(1))}</span>
      </section>

      {/* Platforms */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <PlatformStatCard platform="instagram" followers={creator.followerIg} avgEng={3400} travelPct={69} />
        <PlatformStatCard platform="threads"   followers={creator.followerTh} avgEng={1100} travelPct={54} />
        <PlatformStatCard platform="youtube"   followers={creator.followerYt} avgEng={creator.followerYt > 0 ? 4200 : 0} travelPct={creator.followerYt > 0 ? 78 : 0} />
      </section>

      {/* Map + places */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-kinnso-ink">{t.destinationsCovered}</h2>
        <p className="text-xs text-kinnso-muted">{t.destinationsCoveredSub.replace("{countries}", String(creator.countries)).replace("{cities}", String(creator.cities))}</p>
        <div className="mt-3"><WorldHeatmap locations={locs} onCityClick={setSelectedCity} height={300} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {locs.map((l) => <CityChip key={l.city} city={l.city} posts={l.postCount} flag={l.flag} onClick={() => setSelectedCity(l)} />)}
        </div>

        <div className="mt-6">
          <button type="button" onClick={() => setShowAllPlaces((v) => !v)} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-kinnso-ink">
            {t.topPlacesCovered} <span className="rounded-pill bg-kinnso-amber/30 px-2 py-0.5 text-xs">{places.length}</span>
          </button>
          <div className="space-y-2">
            {(showAllPlaces ? places : places.slice(0, 5)).map((p, i) => <PlaceTagRow key={i} place={p} />)}
          </div>
        </div>
      </section>

      {/* Trend */}
      <section className="mt-8 k-card p-5">
        <h2 className="text-base font-bold text-kinnso-ink">{t.dnaScore6mo}</h2>
        <div className="mt-3"><EngagementTrendChart history={history} height={200} /></div>
      </section>

      {/* Content mix + tags */}
      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="k-card p-5">
          <h2 className="text-base font-bold text-kinnso-ink">{t.contentMix}</h2>
          <div className="mt-3"><ContentMixDonut data={creator.contentMix} size={160} /></div>
        </div>
        <div className="k-card p-5">
          <h2 className="text-base font-bold text-kinnso-ink">{t.topTags}</h2>
          <div className="mt-3"><TagCloud tags={creator.topTags} /></div>
        </div>
      </section>

      {/* Guides */}
      {myGuides.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-kinnso-ink">{t.latestGuides}</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {myGuides.slice(0, 6).map((g) => <GuideCard key={g.slug} g={g} />)}
          </div>
          {myGuides.length > 6 && (
            <Link href="/feed" className="k-btn-ghost mt-4 inline-block text-sm">{t.viewAllGuides}</Link>
          )}
        </section>
      )}

      {/* Brand contact */}
      <section className="mt-8"><BrandContactCard creator={creator} role={role} t={t} /></section>

      {/* Recent posts */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-kinnso-ink">{t.recentPosts}</h2>
        <Tabs value={postTab} onValueChange={(v) => setPostTab(v as typeof postTab)} className="mt-3">
          <TabsList className="bg-kinnso-cream2">
            <TabsTrigger value="all">{t.tabAll}</TabsTrigger>
            <TabsTrigger value="instagram">{t.tabInstagram}</TabsTrigger>
            <TabsTrigger value="threads">{t.tabThreads}</TabsTrigger>
            <TabsTrigger value="youtube">{t.tabYoutube}</TabsTrigger>
          </TabsList>
          <TabsContent value={postTab} className="mt-4">
            <PostThumbnailGrid posts={filteredPosts.slice(0, 24)} cols={6} />
          </TabsContent>
        </Tabs>
      </section>

      <CityDetailDrawer open={!!selectedCity} onOpenChange={(o) => !o && setSelectedCity(null)} location={selectedCity} posts={posts} places={places} />
    </article>
  );
};

export { CreatorProfileView };
export default CreatorProfileView;
