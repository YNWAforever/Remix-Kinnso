'use client'
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import LocaleSwitcher from "@/components/kinnso/LocaleSwitcher";
import type { ViewerRole } from "@/lib/auth/viewer-role";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

export const Navbar: React.FC<{ locale: Locale; role: ViewerRole; t: Messages["nav"] }> = ({ locale, role, t }) => {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const p = (path: string) => `/${locale}${path}`;

  const baseAnchors = [
    { to: "/creators",  label: t.linkCreators },
    { to: "/merchants", label: t.linkMerchants },
    { to: "/agent",     label: t.linkAgent },
    { to: "/feed",      label: t.linkTravelers },
    { to: "/explore",   label: t.linkGuides },
    { to: "/articles",  label: t.linkArticles },
  ];
  const anchors = role === "merchant"
    ? [...baseAnchors, { to: "/merchants/creators", label: t.linkFindCreators }]
    : baseAnchors;

  const cta = (() => {
    if (role === "creator") return { label: t.ctaOpenStudio, to: "/studio", className: "k-btn-primary" };
    if (role === "creator-pending") return { label: t.ctaPending, to: "/creators/apply", className: "k-pill bg-kinnso-amber/30 text-kinnso-ink px-4 py-2" };
    if (role === "merchant") return { label: t.ctaPostMission, to: "/merchants/post", className: "k-btn-primary" };
    return { label: t.ctaApply, to: "/sign-up", className: "k-btn-primary" };
  })();

  return (
    <header className="sticky top-0 z-40 border-b border-kinnso-cream2 bg-kinnso-cream/90 backdrop-blur">
      <div className="k-container flex h-16 items-center justify-between gap-4">
        <Link href={p("")} aria-label="KINNSO" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-kinnso-orange text-white font-black">K</span>
          <span className="text-xl font-black tracking-tight text-kinnso-ink">KINNSO</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {anchors.map((a) => {
            const href = p(a.to);
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={a.to}
                href={href}
                className={`rounded-pill px-3 py-2 text-sm font-semibold transition ${isActive ? "bg-kinnso-cream2 text-kinnso-ink" : "text-kinnso-ink/80 hover:bg-kinnso-cream2"}`}
              >
                {a.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LocaleSwitcher locale={locale} t={t} />
          {role === "anon" && (
            <Link href={p("/sign-in")} className="rounded-pill px-3 py-2 text-sm font-bold text-kinnso-ink hover:bg-kinnso-cream2">{t.signIn}</Link>
          )}
          <Link href={p(cta.to)} className={cta.className}>{cta.label}</Link>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full text-kinnso-ink transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={t.menuToggle}
          aria-expanded={open}
          // Only reference the menu region while it is actually in the DOM
          // (it mounts on open); pointing aria-controls at an absent element is an ARIA error.
          aria-controls={open ? "kinnso-mobile-menu" : undefined}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id="kinnso-mobile-menu" className="border-t border-kinnso-cream2 bg-kinnso-cream md:hidden">
          <div className="k-container flex flex-col gap-1 py-3">
            {anchors.map((a) => (
              <Link key={a.to} href={p(a.to)} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm font-semibold text-kinnso-ink hover:bg-kinnso-cream2">
                {a.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between gap-3">
              <LocaleSwitcher locale={locale} t={t} />
              <div className="flex items-center gap-2">
                {role === "anon" && (
                  <Link href={p("/sign-in")} onClick={() => setOpen(false)} className="rounded-pill px-3 py-2 text-sm font-bold text-kinnso-ink hover:bg-kinnso-cream2">{t.signIn}</Link>
                )}
                <Link href={p(cta.to)} onClick={() => setOpen(false)} className={cta.className}>{cta.label}</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
