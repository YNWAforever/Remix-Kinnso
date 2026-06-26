'use client'
import React, { useMemo, useState } from "react";
import { Filter, Search, X, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CreatorMatchCard from "@/components/kinnso/CreatorMatchCard";
import CreatorFilterDrawer, { defaultFilters, type Facets } from "@/components/kinnso/CreatorFilterDrawer";
import { rankCreators, type RankedCreator, type CreatorFilters } from "@/lib/merchants/relevance";
import { tierPolicy, type MerchantTier } from "@/lib/merchants/tier-policy";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

type SearchMessages = Messages['merchantSearch'];

interface PublishedMission {
  id: string;
  title: string;
}

interface Props {
  locale: Locale;
  t: SearchMessages;
  ranked: RankedCreator[];
  tier: MerchantTier;
  facets: Facets;
  savedHandles: string[];
  workingHandles: string[];
  invitesRemaining: number;
  publishedMissions: PublishedMission[];
  onInvite: (missionId: string, creatorHandle: string) => void;
  onSave: (handle: string) => void;
  onUnsave: (handle: string) => void;
  onNote: (handle: string, note: string) => void;
}

const MerchantsCreatorsView: React.FC<Props> = ({
  locale,
  t,
  ranked,
  tier,
  facets,
  savedHandles,
  workingHandles,
  invitesRemaining,
  publishedMissions,
  onInvite,
  onSave,
  onUnsave,
  onNote,
}) => {
  const policy = tierPolicy(tier);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<CreatorFilters>(defaultFilters);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"recommended" | "saved" | "working">("recommended");
  const [briefHandle, setBriefHandle] = useState<string | null>(null);

  const savedSet = new Set(savedHandles);

  // Re-rank the underlying creators against the active honest filters (Growth
  // only — Free can't open the drawer). Then apply the free-text name/handle
  // search. Recommended is capped on Free via the tier policy.
  const filteredRanked = useMemo(() => {
    const base = policy.filtersUnlocked
      ? rankCreators(ranked.map((r) => r.creator), filters)
      : ranked;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => `${r.creator.name} @${r.creator.handle}`.toLowerCase().includes(q));
  }, [ranked, filters, query, policy.filtersUnlocked]);

  const recommended = useMemo(
    () => (policy.resultCap == null ? filteredRanked : filteredRanked.slice(0, policy.resultCap)),
    [filteredRanked, policy.resultCap],
  );
  const isCapped = policy.resultCap != null && filteredRanked.length > policy.resultCap;

  const savedCreators = useMemo(
    () => ranked.filter((r) => savedHandles.includes(r.creator.handle)),
    [ranked, savedHandles],
  );
  const workingCreators = useMemo(
    () => ranked.filter((r) => workingHandles.includes(r.creator.handle)),
    [ranked, workingHandles],
  );

  const openFilters = () => {
    if (policy.filtersUnlocked) setFilterOpen(true);
  };

  const toggleSave = (handle: string) => {
    if (savedSet.has(handle)) onUnsave(handle);
    else onSave(handle);
  };

  const viewProfile = (handle: string) => {
    if (typeof window !== "undefined") window.open(`/${locale}/c/${handle}`, "_blank");
  };

  return (
    <>
      <div className="k-container py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-kinnso-ink md:text-4xl">{t.heading}</h1>
            <p className="mt-1 text-sm text-kinnso-muted">{t.sub}</p>
          </div>
          <div className="k-ticket px-4 py-2 text-xs">
            <span className="rounded-pill bg-white px-2 py-0.5 text-kinnso-ink">
              {t.invitesLeft.replace('{count}', String(invitesRemaining))}
            </span>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="sticky top-16 z-30 -mx-4 mt-6 bg-kinnso-cream/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-pill sm:px-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-pill bg-white px-4 py-2 ring-1 ring-kinnso-cream2">
              <Search className="h-4 w-4 text-kinnso-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")}>
                  <X className="h-4 w-4 text-kinnso-muted" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={openFilters}
              disabled={!policy.filtersUnlocked}
              aria-disabled={!policy.filtersUnlocked}
              title={!policy.filtersUnlocked ? t.filtersLocked : undefined}
              className="k-btn-ghost shrink-0 disabled:opacity-50"
            >
              {policy.filtersUnlocked ? (
                <Filter className="mr-1 inline h-4 w-4" />
              ) : (
                <Lock className="mr-1 inline h-4 w-4" />
              )}{" "}
              {t.filter}
            </button>
          </div>
        </div>

        {/* Upgrade banner (free only) */}
        {!policy.filtersUnlocked && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-kinnso-amber/30 px-5 py-4">
            <div>
              <h3 className="text-sm font-black text-kinnso-ink">{t.upgradeTitle}</h3>
              <p className="text-xs text-kinnso-muted">{t.upgradeBlurb}</p>
            </div>
            <button type="button" className="k-btn-primary text-sm">{t.upgradeCta}</button>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="mt-6">
          <TabsList className="bg-kinnso-cream2">
            <TabsTrigger value="recommended">
              {t.tabRecommended}{" "}
              <span className="ml-2 rounded-pill bg-kinnso-orange/20 px-1.5 py-0.5 text-[10px] text-kinnso-orange">{recommended.length}</span>
            </TabsTrigger>
            <TabsTrigger value="saved">
              {t.tabSaved}{" "}
              <span className="ml-2 rounded-pill bg-kinnso-amber/40 px-1.5 py-0.5 text-[10px] text-kinnso-ink">{savedCreators.length}</span>
            </TabsTrigger>
            <TabsTrigger value="working">
              {t.tabWorking}{" "}
              <span className="ml-2 rounded-pill bg-kinnso-green/15 px-1.5 py-0.5 text-[10px] text-kinnso-green">{workingCreators.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="mt-5 space-y-4">
            {recommended.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptyRecommended}</p>}
            {recommended.map((r) => (
              <CreatorMatchCard
                key={r.creator.handle}
                ranked={r}
                saved={savedSet.has(r.creator.handle)}
                t={t}
                onSave={toggleSave}
                onView={viewProfile}
                onSendBrief={setBriefHandle}
              />
            ))}
            {isCapped && <p className="text-center text-xs text-kinnso-muted">{t.resultsCapped}</p>}
          </TabsContent>

          <TabsContent value="saved" className="mt-5 space-y-4">
            {savedCreators.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptySaved}</p>}
            {savedCreators.map((r) => (
              <div key={r.creator.handle}>
                <CreatorMatchCard
                  ranked={r}
                  saved
                  t={t}
                  onSave={toggleSave}
                  onView={viewProfile}
                  onSendBrief={setBriefHandle}
                />
                <div className="-mt-1 rounded-b-lg bg-kinnso-cream2 px-4 py-2">
                  <input
                    placeholder={t.addNote}
                    defaultValue=""
                    onBlur={(e) => onNote(r.creator.handle, e.target.value)}
                    className="w-full bg-transparent text-xs text-kinnso-ink outline-none placeholder:text-kinnso-muted"
                  />
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="working" className="mt-5 space-y-4">
            {workingCreators.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptyWorking}</p>}
            {workingCreators.map((r) => (
              <CreatorMatchCard
                key={r.creator.handle}
                ranked={r}
                saved={savedSet.has(r.creator.handle)}
                t={t}
                onSave={toggleSave}
                onView={viewProfile}
                onSendBrief={setBriefHandle}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <CreatorFilterDrawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onChange={setFilters}
        facets={facets}
        t={t}
      />

      {/* Send-brief mission picker */}
      <Dialog open={!!briefHandle} onOpenChange={(o) => !o && setBriefHandle(null)}>
        <DialogContent className="bg-kinnso-cream">
          <DialogHeader>
            <DialogTitle className="text-kinnso-ink">{t.pickMissionTitle}</DialogTitle>
            <DialogDescription className="sr-only">{t.sub}</DialogDescription>
          </DialogHeader>
          {publishedMissions.length === 0 ? (
            <p className="text-sm text-kinnso-muted">{t.pickMissionEmpty}</p>
          ) : (
            <div className="space-y-2">
              {publishedMissions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (briefHandle) onInvite(m.id, briefHandle);
                    setBriefHandle(null);
                  }}
                  disabled={invitesRemaining <= 0}
                  aria-disabled={invitesRemaining <= 0}
                  className="block w-full rounded-lg bg-white px-4 py-3 text-left text-sm text-kinnso-ink ring-1 ring-kinnso-cream2 hover:bg-kinnso-cream2 disabled:opacity-50"
                >
                  {m.title}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export { MerchantsCreatorsView };
export default MerchantsCreatorsView;
