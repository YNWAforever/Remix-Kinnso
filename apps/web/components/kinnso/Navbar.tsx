'use client'
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import LocaleSwitcher from "@/components/kinnso/LocaleSwitcher";
import type { ViewerRole } from "@/lib/auth/viewer-role";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * R1A editorial navbar. Role is resolved CLIENT-side (useViewerRole in SiteChrome)
 * so public pages stay statically generable — this component only receives the
 * resolved role. IA (all roles): Explore · Destinations · Articles · Sessions ·
 * AI Agent · Creators; right side carries "For Merchants" (→ /merchants until the
 * R1C landing split moves it to /for-merchants) + the role-aware CTA.
 */
export const Navbar: React.FC<{ locale: Locale; role: ViewerRole; t: Messages["nav"] }> = ({ locale, role, t }) => {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const p = (path: string) => `/${locale}${path}`;

  const baseAnchors = [
    { to: "/explore",      label: t.linkExplore },
    { to: "/destinations", label: t.linkDestinations },
    { to: "/articles",     label: t.linkArticles },
    { to: "/sessions",     label: t.linkSessions },
    { to: "/agent",        label: t.linkAgent },
    { to: "/creators",     label: t.linkCreators },
  ];
  // Merchants keep direct links to their real mission queue + creator search + insights.
  const anchors = role === "merchant"
    ? [...baseAnchors, { to: "/merchants/missions", label: t.linkMissions }, { to: "/merchants/creators", label: t.linkFindCreators }, { to: "/merchants/insights", label: t.linkInsights }]
    : baseAnchors;

  const cta = (() => {
    if (role === "creator") return { label: t.ctaOpenStudio, to: "/studio", className: "k2-btn-primary" };
    if (role === "creator-pending") return { label: t.ctaPending, to: "/creators/apply", className: "inline-flex items-center rounded-[3px] bg-kinnso2-sand px-4 py-2 text-sm font-semibold text-kinnso2-ink" };
    if (role === "merchant") return { label: t.ctaPostMission, to: "/merchants/post", className: "k2-btn-primary" };
    return { label: t.ctaApply, to: "/sign-up", className: "k2-btn-primary" };
  })();

  return (
    <header className="sticky top-0 z-40 border-b border-kinnso2-line bg-kinnso2-paper/95 font-k2-sans backdrop-blur">
      <div className="k2-container flex h-16 items-center justify-between gap-4">
        <Link href={p("")} aria-label="KINNSO" className="flex items-baseline gap-1.5">
          <span className="k2-display text-2xl font-semibold tracking-tight text-kinnso2-ink">KINNSO</span>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-kinnso2-clay" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {anchors.map((a) => {
            const href = p(a.to);
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={a.to}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`px-3 py-2 text-sm font-medium tracking-wide transition ${isActive ? "text-kinnso2-clay" : "text-kinnso2-ink/75 hover:text-kinnso2-ink"}`}
              >
                {a.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href={p("/merchants")} className="px-2 py-2 text-sm font-medium text-kinnso2-ink/75 transition hover:text-kinnso2-ink">
            {t.linkForMerchants}
          </Link>
          <LocaleSwitcher locale={locale} t={t} />
          {role === "anon" && (
            <Link href={p("/sign-in")} className="px-3 py-2 text-sm font-semibold text-kinnso2-ink transition hover:text-kinnso2-clay">{t.signIn}</Link>
          )}
          <Link href={p(cta.to)} className={cta.className}>{cta.label}</Link>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full text-kinnso2-ink transition hover:bg-kinnso2-sand/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso2-clay md:hidden"
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
        <div id="kinnso-mobile-menu" className="border-t border-kinnso2-line bg-kinnso2-paper md:hidden">
          <div className="k2-container flex flex-col gap-1 py-3">
            {anchors.map((a) => (
              <Link key={a.to} href={p(a.to)} onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-medium text-kinnso2-ink transition hover:text-kinnso2-clay">
                {a.label}
              </Link>
            ))}
            <Link href={p("/merchants")} onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-medium text-kinnso2-ink/75 transition hover:text-kinnso2-clay">
              {t.linkForMerchants}
            </Link>
            <div className="mt-2 flex items-center justify-between gap-3">
              <LocaleSwitcher locale={locale} t={t} />
              <div className="flex items-center gap-2">
                {role === "anon" && (
                  <Link href={p("/sign-in")} onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-semibold text-kinnso2-ink transition hover:text-kinnso2-clay">{t.signIn}</Link>
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
