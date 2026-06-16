'use client'
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useViewerRole } from "@/lib/auth/useViewerRole";

const baseAnchors = [
  { to: "/creators",  label: "Creators" },
  { to: "/merchants", label: "Merchants" },
  { to: "/agent",     label: "AI Agent" },
  { to: "/feed",      label: "Travelers" },
  { to: "/explore",   label: "Guides" },
  { to: "/articles",  label: "Articles" },
];
const merchantAnchor = { to: "/merchants/creators", label: "Find Creators" };

export const Navbar: React.FC = () => {
  const role = useViewerRole();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const anchors = role === "merchant" ? [...baseAnchors, merchantAnchor] : baseAnchors;

  const cta = (() => {
    if (role === "creator") return { label: "Open Studio →", to: "/studio", className: "k-btn-primary" };
    if (role === "creator-pending") return { label: "Application pending", to: "/creators/apply", className: "k-pill bg-kinnso-amber/30 text-kinnso-ink px-4 py-2" };
    if (role === "merchant") return { label: "Post a Mission →", to: "/merchants/post", className: "k-btn-primary" };
    return { label: "Apply as Creator", to: "/creators/apply", className: "k-btn-primary" };
  })();

  return (
    <header className="sticky top-0 z-40 border-b border-kinnso-cream2 bg-kinnso-cream/90 backdrop-blur">
      <div className="k-container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-kinnso-orange text-white font-black">K</span>
          <span className="text-xl font-black tracking-tight text-kinnso-ink">KINNSO</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {anchors.map((a) => {
            const isActive = pathname === a.to || pathname.endsWith(a.to)
            return (
              <Link
                key={a.to}
                href={a.to}
                className={`rounded-pill px-3 py-2 text-sm font-semibold transition ${isActive ? "bg-kinnso-cream2 text-kinnso-ink" : "text-kinnso-ink/80 hover:bg-kinnso-cream2"}`}
              >
                {a.label}
              </Link>
            )
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href={cta.to} className={cta.className}>{cta.label}</Link>
        </div>

        <button className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="border-t border-kinnso-cream2 bg-kinnso-cream md:hidden">
          <div className="k-container flex flex-col py-3">
            {anchors.map((a) => (
              <Link key={a.to} href={a.to} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm font-semibold text-kinnso-ink hover:bg-kinnso-cream2">
                {a.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between">
              <Link href={cta.to} onClick={() => setOpen(false)} className={cta.className}>{cta.label}</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
