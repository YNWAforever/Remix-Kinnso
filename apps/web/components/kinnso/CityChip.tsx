'use client'

import { cn } from "@/lib/utils";

interface Props {
  city: string;
  posts?: number;
  flag?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

const CityChip = ({ city, posts, flag, onClick, active, className }: Props) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition",
      active ? "bg-kinnso-orange text-white" : "bg-kinnso-cream2 text-kinnso-ink hover:bg-kinnso-amber/30",
      className
    )}
  >
    {flag && <span aria-hidden>{flag}</span>}
    <span className="font-semibold">{city}</span>
    {posts !== undefined && <span className="text-xs opacity-70">({posts})</span>}
  </button>
);

export default CityChip;
