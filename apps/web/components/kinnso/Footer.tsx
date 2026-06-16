import Link from "next/link";

const cols = [
  { title: "Creators", links: [["Apply", "/creators/apply"], ["Studio", "/studio"], ["Missions", "/studio/missions"], ["Earnings", "/studio/earnings"]] as const },
  { title: "Merchants", links: [["Post a mission", "/merchants/post"], ["Pricing", "/merchants"], ["Case studies", "/about"], ["Contact", "/about"]] as const },
  { title: "Company", links: [["About", "/about"], ["AI Agent", "/agent"], ["Press", "/about"], ["Legal", "/legal/creator-terms"]] as const },
];

const Footer = () => (
  <footer className="border-t border-kinnso-cream2 bg-white">
    <div className="k-container grid gap-10 py-12 md:grid-cols-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-kinnso-orange text-white font-black">K</span>
          <span className="text-xl font-black tracking-tight text-kinnso-ink">KINNSO</span>
        </div>
        <p className="mt-3 text-sm text-kinnso-muted">
          AI Travel Content Studio · Pays creators · Hong Kong · Taipei · Tokyo
        </p>
      </div>
      {cols.map((c) => (
        <div key={c.title}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{c.title}</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {c.links.map(([label, href]) => (
              <li key={label}><Link href={href} className="text-kinnso-ink hover:text-kinnso-orange">{label}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <div className="border-t border-kinnso-cream2">
      <div className="k-container flex flex-col items-center justify-between gap-2 py-4 text-xs text-kinnso-muted sm:flex-row">
        <span>© 2026 KINNSO. All rights reserved.</span>
        <span className="flex items-center gap-3">
          <a href="#" className="hover:text-kinnso-orange">Instagram</a>
          <a href="#" className="hover:text-kinnso-orange">Threads</a>
          <a href="#" className="hover:text-kinnso-orange">LINE</a>
          <a href="#" className="hover:text-kinnso-orange">WhatsApp</a>
        </span>
      </div>
    </div>
  </footer>
);

export default Footer;
