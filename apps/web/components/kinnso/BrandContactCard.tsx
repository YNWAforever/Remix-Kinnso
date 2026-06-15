'use client'
import React from "react";
import Link from "next/link";
import { useViewerRole } from "@/lib/auth/useViewerRole";
import type { ExtendedCreator } from "@/lib/creator-mock";
import { tierMeta } from "@/lib/creator-mock";

interface Props {
  creator: ExtendedCreator;
}

export const BrandContactCard: React.FC<Props> = ({ creator }) => {
  const role = useViewerRole();
  const meta = tierMeta[creator.tier];
  return (
    <div className="overflow-hidden rounded-lg bg-kinnso-amber/40 p-6 md:flex md:items-center md:justify-between md:gap-8">
      <div>
        <h3 className="text-xl font-black text-kinnso-ink">Work with {creator.name.split(" ")[0]}</h3>
        <p className="mt-1 text-sm text-kinnso-ink/80">
          {meta.payout} · {meta.commission} affiliate commission · {meta.label} tier
        </p>
        <p className="mt-1 text-xs text-kinnso-muted">
          {creator.driven90dReach.toLocaleString()} reach · {creator.countries} countries · DNA {creator.score}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
        {role === "merchant" ? (
          <>
            <Link href={`/merchants/post?creator=${creator.handle}`} className="k-btn-primary">Send a brief →</Link>
            <button className="k-btn-ghost">Save to list</button>
          </>
        ) : role === "anon" ? (
          <span className="rounded-pill bg-white/70 px-4 py-2 text-sm font-semibold text-kinnso-ink">
            Sign in as merchant to contact
          </span>
        ) : (
          <Link href="/merchants/post" className="k-btn-primary">Send a brief →</Link>
        )}
      </div>
    </div>
  );
};

export default BrandContactCard;
