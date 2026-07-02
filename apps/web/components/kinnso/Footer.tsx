import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

/** R1A editorial footer: dark-ink band, four columns (Explore / Creators / Merchants / Company). */
const Footer = ({ locale, t }: { locale: Locale; t: Messages["footer"] }) => {
  const p = (path: string) => `/${locale}${path}`;
  const cols = [
    { title: t.colExplore,   links: [[t.lGuides, "/explore"], [t.lDestinations, "/destinations"], [t.lArticles, "/articles"], [t.lSessions, "/sessions"]] as const },
    { title: t.colCreators,  links: [[t.lApply, "/sign-up"], [t.lStudio, "/studio"], [t.lMissions, "/studio/missions"], [t.lEarnings, "/studio/earnings"]] as const },
    { title: t.colMerchants, links: [[t.lPostMission, "/merchants/post"], [t.lPricing, "/merchants"]] as const },
    { title: t.colCompany,   links: [[t.lAbout, "/about"], [t.lAgent, "/agent"], [t.lContact, "/contact"], [t.lLegal, "/legal/creator-terms"]] as const },
  ];
  return (
    <footer className="bg-kinnso2-ink font-k2-sans text-kinnso2-paper">
      <div className="k2-container grid gap-10 py-14 md:grid-cols-5">
        <div>
          <span className="k2-display text-2xl font-semibold tracking-tight text-kinnso2-paper">KINNSO</span>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-kinnso2-paper/60">{t.tagline}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso2-sun">{c.title}</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map(([label, href]) => (
                <li key={`${label}-${href}`}>
                  <Link href={p(href)} className="text-kinnso2-paper/80 transition hover:text-kinnso2-paper">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-kinnso2-paper/15">
        <div className="k2-container flex items-center justify-center py-4 text-xs text-kinnso2-paper/50 sm:justify-start">
          <span>{t.rights}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
