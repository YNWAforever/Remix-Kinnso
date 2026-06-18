'use client'

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

export interface CreatorFilters {
  cities: string[];
  scoreRange: [number, number];
  minEr: number;
  tiers: string[];
  categories: string[];
  primaryAudience: string[];
  platforms: string[];
  minFollowers: number;
  activityDays: number;
}

export const defaultFilters: CreatorFilters = {
  cities: [],
  scoreRange: [50, 100],
  minEr: 4,
  tiers: [],
  categories: [],
  primaryAudience: [],
  platforms: [],
  minFollowers: 0,
  activityDays: 90,
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: CreatorFilters;
  onChange: (v: CreatorFilters) => void;
}

const CITIES   = ["Tokyo","Kyoto","Osaka","Taipei","Hong Kong","Bangkok","Seoul","Singapore","Bali"];
const TIERS    = ["seed","rising","pro","elite"];
const CATS     = ["Food","City Walk","Hotels","Coffee","Photography","Family"];
const AUDIENCE = ["HK","TW","SG","JP","Other"];
const PLATFORMS= ["instagram","threads","youtube"];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="border-b border-kinnso-cream2 py-4">
    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-kinnso-muted">{title}</h4>
    {children}
  </section>
);

export const CreatorFilterDrawer = ({ open, onOpenChange, value, onChange }: Props) => {
  const v = value;
  const set = (patch: Partial<CreatorFilters>) => onChange({ ...v, ...patch });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto bg-kinnso-cream">
        <SheetHeader className="text-left">
          <SheetTitle className="text-kinnso-ink">Filter creators</SheetTitle>
          <SheetDescription className="sr-only">
            Refine creators by location, score, tier, category, audience, platform, and activity.
          </SheetDescription>
        </SheetHeader>

        <Section title="Location">
          <div className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <button key={c} type="button" onClick={() => set({ cities: toggle(v.cities, c) })}
                className={`rounded-pill px-3 py-1 text-xs font-semibold ${v.cities.includes(c) ? "bg-kinnso-orange text-white" : "bg-kinnso-cream2 text-kinnso-ink"}`}>
                {c}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Engagement score">
          <Slider value={v.scoreRange} min={50} max={100} step={1} onValueChange={(val) => set({ scoreRange: [val[0], val[1]] as [number, number] })} />
          <div className="mt-2 flex justify-between text-xs text-kinnso-muted"><span>{v.scoreRange[0]}</span><span>{v.scoreRange[1]}</span></div>
          <label className="mt-3 block text-xs text-kinnso-muted">Minimum ER %
            <input type="number" value={v.minEr} onChange={(e) => set({ minEr: +e.target.value })} className="mt-1 w-20 rounded-md bg-white px-2 py-1 ring-1 ring-kinnso-cream2" />
          </label>
        </Section>

        <Section title="Tier">
          <div className="flex flex-wrap gap-3">
            {TIERS.map((t) => (
              <label key={t} className="inline-flex items-center gap-2 text-sm text-kinnso-ink">
                <Checkbox checked={v.tiers.includes(t)} onCheckedChange={() => set({ tiers: toggle(v.tiers, t) })} />
                <span className="capitalize">{t}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Content category">
          <div className="flex flex-wrap gap-3">
            {CATS.map((c) => (
              <label key={c} className="inline-flex items-center gap-2 text-sm text-kinnso-ink">
                <Checkbox checked={v.categories.includes(c)} onCheckedChange={() => set({ categories: toggle(v.categories, c) })} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Primary audience">
          <div className="flex flex-wrap gap-2">
            {AUDIENCE.map((a) => (
              <button key={a} type="button" onClick={() => set({ primaryAudience: toggle(v.primaryAudience, a) })}
                className={`rounded-pill px-3 py-1 text-xs font-semibold ${v.primaryAudience.includes(a) ? "bg-kinnso-orange text-white" : "bg-kinnso-cream2 text-kinnso-ink"}`}>
                {a}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Platforms">
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map((p) => (
              <label key={p} className="inline-flex items-center gap-2 text-sm capitalize text-kinnso-ink">
                <Checkbox checked={v.platforms.includes(p)} onCheckedChange={() => set({ platforms: toggle(v.platforms, p) })} />
                {p}
              </label>
            ))}
          </div>
          <label className="mt-3 block text-xs text-kinnso-muted">Minimum followers
            <select value={v.minFollowers} onChange={(e) => set({ minFollowers: +e.target.value })} className="ml-2 rounded-md bg-white px-2 py-1 ring-1 ring-kinnso-cream2">
              <option value={0}>Any</option>
              <option value={1000}>1k+</option>
              <option value={5000}>5k+</option>
              <option value={10000}>10k+</option>
              <option value={50000}>50k+</option>
            </select>
          </label>
        </Section>

        <Section title="Activity">
          <select value={v.activityDays} onChange={(e) => set({ activityDays: +e.target.value })} className="rounded-md bg-white px-2 py-1 ring-1 ring-kinnso-cream2">
            <option value={7}>Posted in last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={9999}>Any time</option>
          </select>
        </Section>

        <SheetFooter className="mt-4 flex gap-2 sm:flex-row">
          <button type="button" onClick={() => onChange(defaultFilters)} className="k-btn-ghost flex-1">Clear all</button>
          <button type="button" onClick={() => onOpenChange(false)} className="k-btn-primary flex-1">Apply filters</button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default CreatorFilterDrawer;
