'use client'
import React, { useMemo, useState } from "react";
import { Filter, Search, X, Lock } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CreatorMatchCard from "@/components/kinnso/CreatorMatchCard";
import CreatorFilterDrawer, { defaultFilters, type CreatorFilters } from "@/components/kinnso/CreatorFilterDrawer";
import { CreatorProfileView } from "@/components/kinnso/pages/CreatorProfileView";
import { extendedCreators, creatorLocations, merchantWorkingWith, getCreator, computeMatch, type ExtendedCreator } from "@/lib/creator-mock";
import type { Messages } from "@/lib/i18n/messages/en";
import type { MerchantProfile } from "@/lib/creator-mock";

function filterCreators(list: ExtendedCreator[], f: CreatorFilters, query: string): ExtendedCreator[] {
  const q = query.trim().toLowerCase();
  return list.filter((c) => {
    if (c.score < f.scoreRange[0] || c.score > f.scoreRange[1]) return false;
    if (c.er * 100 < f.minEr) return false;
    if (f.tiers.length && !f.tiers.includes(c.tier)) return false;
    if (f.categories.length && !f.categories.includes(c.category)) return false;
    if (f.primaryAudience.length && !f.primaryAudience.includes(c.primaryAudienceCountry)) return false;
    if (f.cities.length) {
      const myCities = creatorLocations.filter((l) => l.creatorHandle === c.handle).map((l) => l.city);
      if (!f.cities.some((x) => myCities.includes(x))) return false;
    }
    if (f.platforms.length) {
      const has = f.platforms.some((p) => (p === "instagram" && c.followerIg > 0) || (p === "threads" && c.followerTh > 0) || (p === "youtube" && c.followerYt > 0));
      if (!has) return false;
    }
    if (f.minFollowers && c.totalReach < f.minFollowers) return false;
    if (f.activityDays < 9999) {
      const last = new Date(c.lastPostedAt).getTime();
      const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
      if (days > f.activityDays) return false;
    }
    if (q) {
      const hay = `${c.name} ${c.handle} ${c.homeCity} ${c.category} ${c.topTags.map((t) => t.tag).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const FREE_CAP = 3;

interface Props {
  merchant: MerchantProfile;
  t: Messages['merchants'] & { creatorProfile: Messages['creatorProfile'] };
}

const MerchantsCreatorsView: React.FC<Props> = ({ merchant, t }) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<CreatorFilters>(defaultFilters);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"recommended" | "saved" | "working">("recommended");
  const [saves, setSaves] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [quickViewHandle, setQuickViewHandle] = useState<string | null>(null);

  const [invitesLeft, setInvitesLeft] = useState(merchant.invitesLeft);
  const searchesLeft = merchant.searchesLeft;
  const isFree = merchant.tier === "free";

  const toggleSave = (handle: string) =>
    setSaves((s) => (s.includes(handle) ? s.filter((h) => h !== handle) : [...s, handle]));

  // ranked recommended
  const recommended = useMemo(() => {
    const filtered = filterCreators(extendedCreators, filters, query);
    return filtered
      .map((c) => ({ c, match: computeMatch(c, merchant) }))
      .sort((a, b) => b.match.score - a.match.score);
  }, [filters, query, merchant]);

  const savedCreators = useMemo(
    () => extendedCreators.filter((c) => saves.includes(c.handle)),
    [saves]
  );
  const workingCreators = useMemo(
    () => merchantWorkingWith.map((w) => ({ ...w, creator: extendedCreators.find((c) => c.handle === w.handle)! })).filter((x) => x.creator),
    []
  );

  return (
    <>
      <div className="k-container py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-kinnso-ink md:text-4xl">{t.heading}</h1>
            <p className="mt-1 text-sm text-kinnso-muted">{t.sub}</p>
          </div>
          <div className="rounded-lg bg-kinnso-cream2 px-4 py-2 text-xs">
            <div className="text-kinnso-muted">{t.yourProfile}</div>
            <div className="font-semibold text-kinnso-ink">{merchant.name} · {merchant.city} · {merchant.category}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="rounded-pill bg-white px-2 py-0.5 text-kinnso-ink">{searchesLeft}/{merchant.searchLimit} {t.searchesLeft}</span>
              <span className="rounded-pill bg-white px-2 py-0.5 text-kinnso-ink">{invitesLeft}/{merchant.inviteLimit} {t.invitesLeft}</span>
            </div>
          </div>
        </div>

        {/* Sticky filter bar */}
        <div className="sticky top-16 z-30 -mx-4 mt-6 bg-kinnso-cream/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-pill sm:px-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-pill bg-white px-4 py-2 ring-1 ring-kinnso-cream2">
              <Search className="h-4 w-4 text-kinnso-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} className="flex-1 bg-transparent text-sm outline-none" />
              {query && <button type="button" onClick={() => setQuery("")}><X className="h-4 w-4 text-kinnso-muted" /></button>}
            </div>
            <button
              type="button"
              onClick={() => { if (!isFree) setFilterOpen(true); }}
              disabled={isFree}
              aria-disabled={isFree}
              title={isFree ? t.upgradeBlurb : undefined}
              className="k-btn-ghost shrink-0 disabled:opacity-50"
            >
              {isFree ? <Lock className="mr-1 inline h-4 w-4" /> : <Filter className="mr-1 inline h-4 w-4" />} {t.filter}
            </button>
          </div>
        </div>

        {/* Upgrade banner (free only) */}
        {isFree && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-kinnso-amber/30 px-5 py-4">
            <div>
              <h3 className="text-sm font-black text-kinnso-ink">{t.upgradeToGrowth}</h3>
              <p className="text-xs text-kinnso-muted">{t.upgradeBlurb}</p>
            </div>
            <button type="button" className="k-btn-primary text-sm">{t.upgradeCta}</button>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-6">
          <TabsList className="bg-kinnso-cream2">
            <TabsTrigger value="recommended">{t.tabRecommended} <span className="ml-2 rounded-pill bg-kinnso-orange/20 px-1.5 py-0.5 text-[10px] text-kinnso-orange">{recommended.length}</span></TabsTrigger>
            <TabsTrigger value="saved">{t.tabSaved} <span className="ml-2 rounded-pill bg-kinnso-amber/40 px-1.5 py-0.5 text-[10px] text-kinnso-ink">{savedCreators.length}</span></TabsTrigger>
            <TabsTrigger value="working">{t.tabWorking} <span className="ml-2 rounded-pill bg-kinnso-green/15 px-1.5 py-0.5 text-[10px] text-kinnso-green">{workingCreators.length}</span></TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="mt-5 space-y-4">
            {recommended.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptyRecommended}</p>}
            {(isFree ? recommended.slice(0, FREE_CAP) : recommended).map(({ c }) => (
              <CreatorMatchCard
                key={c.handle}
                creator={c}
                saved={saves.includes(c.handle)}
                onToggleSave={() => toggleSave(c.handle)}
                onQuickView={() => setQuickViewHandle(c.handle)}
              />
            ))}
            {isFree && recommended.length > FREE_CAP && (
              <p className="text-center text-xs text-kinnso-muted">{t.resultsCapped}</p>
            )}
          </TabsContent>

          <TabsContent value="saved" className="mt-5 space-y-4">
            {savedCreators.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptySaved}</p>}
            {savedCreators.map((c) => (
              <div key={c.handle}>
                <CreatorMatchCard
                  creator={c}
                  saved
                  onToggleSave={() => toggleSave(c.handle)}
                  onQuickView={() => setQuickViewHandle(c.handle)}
                />
                <div className="-mt-1 rounded-b-lg bg-kinnso-cream2 px-4 py-2">
                  <input
                    placeholder={t.addPrivateNote}
                    value={notes[c.handle] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [c.handle]: e.target.value }))}
                    className="w-full bg-transparent text-xs text-kinnso-ink outline-none placeholder:text-kinnso-muted"
                  />
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="working" className="mt-5 space-y-4">
            {workingCreators.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptyWorking}</p>}
            {workingCreators.map((w) => (
              <div key={w.handle} className="k-card p-5">
                <div className="flex items-center gap-3">
                  <img src={w.creator.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
                  <div className="flex-1">
                    <div className="font-bold text-kinnso-ink">{w.creator.name}</div>
                    <div className="k-mono text-xs text-kinnso-muted">@{w.handle}</div>
                  </div>
                  <span className={`rounded-pill px-3 py-1 text-xs font-semibold ${
                    w.status === "in_progress" ? "bg-kinnso-amber/40 text-kinnso-ink"
                    : w.status === "delivered" ? "bg-kinnso-blue/15 text-kinnso-blue"
                    : "bg-kinnso-green/15 text-kinnso-green"
                  }`}>
                    {w.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-3 text-sm text-kinnso-ink">{w.missionTitle}</p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <CreatorFilterDrawer open={filterOpen} onOpenChange={setFilterOpen} value={filters} onChange={setFilters} />

      {/* Quick view drawer */}
      <Sheet open={!!quickViewHandle} onOpenChange={(o) => !o && setQuickViewHandle(null)}>
        <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto bg-kinnso-cream p-0">
          {quickViewHandle && (
            <div className="px-4 pb-24 pt-6">
              {(() => {
                const c = getCreator(quickViewHandle);
                return c ? <CreatorProfileView creator={c} role="merchant" embedded t={t.creatorProfile} /> : null;
              })()}
            </div>
          )}
          {quickViewHandle && (
            <div className="sticky bottom-0 flex gap-2 border-t border-kinnso-cream2 bg-kinnso-cream p-4">
              <button
                type="button"
                onClick={() => { setInvitesLeft((n) => n - 1); setQuickViewHandle(null); }}
                disabled={invitesLeft === 0}
                aria-disabled={invitesLeft === 0}
                title={invitesLeft === 0 ? t.inviteDisabled : undefined}
                className="k-btn-primary flex-1 text-center disabled:opacity-50"
              >
                {t.sendBrief}
              </button>
              <button type="button" onClick={() => toggleSave(quickViewHandle)} className="k-btn-ghost">
                {saves.includes(quickViewHandle) ? t.saved : t.save}
              </button>
              <button type="button" onClick={() => setQuickViewHandle(null)} className="k-btn-ghost">{t.close}</button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export { MerchantsCreatorsView };
export default MerchantsCreatorsView;
