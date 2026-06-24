import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

const Footer = ({ locale, t }: { locale: Locale; t: Messages["footer"] }) => {
  const p = (path: string) => `/${locale}${path}`;
  const cols = [
    { title: t.colCreators, links: [[t.lApply, "/sign-up"], [t.lStudio, "/studio"], [t.lMissions, "/studio/missions"], [t.lEarnings, "/studio/earnings"]] as const },
    { title: t.colMerchants, links: [[t.lPostMission, "/merchants/post"], [t.lPricing, "/merchants"]] as const },
    { title: t.colCompany, links: [[t.lAbout, "/about"], [t.lAgent, "/agent"], [t.lLegal, "/legal/creator-terms"]] as const },
  ];
  return (
    <footer className="border-t border-kinnso-cream2 bg-white">
      <div className="k-container grid gap-10 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-kinnso-orange text-white font-black">K</span>
            <span className="text-xl font-black tracking-tight text-kinnso-ink">KINNSO</span>
          </div>
          <p className="mt-3 text-sm text-kinnso-muted">{t.tagline}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{c.title}</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map(([label, href]) => (
                <li key={label}><Link href={p(href)} className="text-kinnso-ink hover:text-kinnso-orange">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-kinnso-cream2">
        <div className="k-container flex items-center justify-center py-4 text-xs text-kinnso-muted sm:justify-start">
          <span>{t.rights}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
