# Front-of-House Slice 3f - Market Passport UI System - design

**Date:** 2026-06-20  
**Status:** Direction approved; written spec ready for review  
**Repo:** `kinnso-v3` (`apps/web`)  
**Scope choice:** B - public front-of-house plus creator/merchant product surfaces

---

## Goal

Evolve the current KINNSO orange/cream front-of-house into a distinctive **Market Passport** visual system across the homepage and subpages, without resetting the brand. The system should make KINNSO feel like a travel-commerce network where creators prove city authority, merchants issue missions, and Studio turns social travel proof into paid work.

This slice is visual and interaction-system work only. It does not change mission data, Supabase schemas, onboarding state, article queries, or payment/settlement logic.

## Selected Direction

Use **Market Passport** as the visual thesis:

- Public pages feel like a creator's travel-work passport: route stamps, ticket stacks, social scan cards, guide receipts, and payout slips.
- Product surfaces reuse the same artifacts as real UI: mission tickets, creator proof rows, offer receipts, earnings slips, and Studio tool passes.
- Orange stays as the recognizable KINNSO action signal, while ink, paper, green, gold, and route blue carry structure and state.

This direction was selected over:

- **Signal Atlas** - stronger AI/data motif, but less aligned with the user's preference for the warmer existing identity.
- **Studio Ledger** - strong for monetization surfaces, but less travel-native for public acquisition pages.

## Scope

### In scope

- Global brand tokens, typography, card/radius/shadow rules, focus states, and motion rules in `apps/web/app/globals.css`.
- Shared chrome: `Navbar`, `Footer`, `LocaleSwitcher`, `SiteChrome`.
- Public acquisition pages:
  - `/[locale]`
  - `/[locale]/creators`
  - `/[locale]/merchants`
  - `/[locale]/explore`
  - `/[locale]/feed`
  - `/[locale]/c/[handle]`
  - `/[locale]/g/[slug]`
  - `/[locale]/articles`, category, and detail pages for token, typography, chrome, and navigation alignment.
- Auth/onboarding entry surfaces:
  - `/[locale]/sign-in`
  - `/[locale]/sign-up`
  - `/[locale]/creator`
- Creator and merchant product surfaces:
  - `/[locale]/studio`
  - `/[locale]/studio/scan`
  - `/[locale]/studio/missions`
  - `/[locale]/studio/offers`
  - `/[locale]/studio/earnings`
  - `/[locale]/studio/guides`
  - `/[locale]/merchants/creators`
  - `/[locale]/merchants/post`
  - `/[locale]/merchants/missions`

### Out of scope

- Ops/internal screens such as `/[locale]/ops/settlements`.
- Data model, RLS, Supabase auth, article ingestion, guide publishing behavior, or mission state behavior.
- New payment, notification, or automation features.
- A broad rewrite of unrelated shadcn primitives. Keep primitive changes limited to KINNSO-owned wrappers/usages that render in the scoped pages.

## Visual System

### Palette

Use five core tokens and a small set of semantic aliases:

| Token | Hex | Purpose |
|---|---:|---|
| Rice paper | `#F8F1E6` | Main page background, warm but lighter than current cream. |
| Passport ink | `#211B16` | Primary text, dark panels, ticket borders. |
| KINNSO orange | `#F26A1F` | Primary actions, live markers, selected states. |
| Payout green | `#2F8F5C` | Earnings, qualified status, positive deltas. |
| Transit gold | `#F4BD50` | Route highlights, stamps, secondary badges. |
| Route blue | `#2E6FB8` | Informational badges, guide/map cues, neutral product state. |
| Paper edge | `#DED5C7` | Borders, dividers, dashed ticket rules. |
| Muted ink | `#6D6257` | Secondary copy and labels. |

Orange must not flood whole sections. It should appear as the action color, a stamped accent, or a route marker. Large orange gradient heroes should be retired in favor of paper/ink compositions with image or ticket artifacts.

### Typography

- **Display:** `Bricolage Grotesque` via `next/font/google` for hero and large section titles. It is chunky, contemporary, and sticker-like without falling into the common cream/serif template.
- **Body:** keep `DM Sans`, with multilingual fallbacks that preserve readability for `zh-hk`, `zh-tw`, `zh-cn`, `ja`, `ko`, and `th`.
- **Utility/data:** keep `JetBrains Mono` for handles, route IDs, scores, payouts, timestamps, and scan output.

Display type should be used with restraint: homepage hero, creator/merchant landing heroes, major Studio headings, and a few signature cards. Dense product UI should stay calm and readable.

### Shape and Material

- Cards become **tickets**, **passes**, and **receipts** depending on context.
- Border radius remains practical: `8px` for normal cards, `14-18px` only for ticket/pass compositions.
- Use 1px ink or paper-edge borders, dashed separators, clipped/coupon-style edges where useful, and subtle rotation only in hero/signature compositions.
- Avoid nested cards. A ticket can contain rows or panels, but page sections should remain full-width bands or unframed layouts.
- Replace decorative gradients/orbs with useful travel artifacts: route strips, stamped labels, dashed ticket dividers, receipt rows, and real travel imagery where content benefits from inspection.

### Motion

Motion should feel like travel paperwork being sorted, not a generic animation layer:

- One orchestrated homepage moment: ticket stack settles in or route markers draw once.
- Hover states: tickets lift 2-4px, route markers brighten, arrows slide subtly.
- Marquee/ticker becomes reduced-motion aware and preferably pauses on hover/focus.
- Respect `prefers-reduced-motion` globally.

## Signature Element

The memorable element is the **Route Ticket Stack**:

- Hero: overlapping passport card, social scan ticket, and payout receipt.
- Creator cards: compact pass with avatar, handle, tier stamp, score, and city route.
- Mission cards: ticket with merchant/mission stamp, compensation receipt, and action.
- Offers: affiliate receipt with program, commission, generated partner-link row.
- Earnings: ledger receipt rows grouped by currency and payout status.
- Guide pages: route stamp for city, saves, author, and places covered.

This element is not decorative. It encodes what the user is doing: proving a route, taking a mission, publishing a guide, or earning a payout.

## Page Treatment

### Homepage

Hero thesis: **"Trips that pay their way."** The first viewport should show:

- Brand/nav using the evolved token system.
- A route-stamp eyebrow such as `Creator route / HK -> JP -> TW`.
- Large display headline and concise supporting copy.
- Scan widget as a real control, with label, autocomplete/name, and accessible async result.
- Route Ticket Stack preview using real creator/mission/payout content.

Below the hero:

- Replace numbered generic process cards with a route timeline. Keep order only where it is a real sequence: scan, qualify, match, publish, earn.
- Merchant wall becomes partner stamps or luggage tags, not generic pills.
- Featured creators become creator passes.
- Traveler/merchant split becomes two ticket lanes, each with a real image and a concrete action.

### Creator Landing

The creator page should feel like a route application desk:

- Hero uses a creator pass and scan proof.
- Process explains the creator journey as a travel-work route.
- Featured creators use creator passes with city/category/tier stamps.
- CTA is a passport stamp panel, not a soft cream card.

### Merchant Landing and Merchant Product

Merchant pages should feel like issuing briefs into the travel network:

- Landing hero uses a mission ticket stack, not a dark gradient.
- Mission samples use ticket cards with compensation and creator-fit signals.
- Creator discovery page uses a dense but calm "brief desk" layout: search/filter as a route control strip, creator matches as passes, quick view as a dossier sheet.
- Mission posting wizard should read as a brief builder with clear sections and stable form controls, not a marketing card stack.

### Creator Studio

Studio should be product-first but visually connected:

- Dashboard tool cards become Studio passes.
- Scan view becomes a passport inspection screen: input, live progress, DNA review, city route, content mix, top posts.
- Missions/offers become ticket queues.
- Earnings becomes receipt/ledger rows grouped by currency. Mixed currencies stay separate.
- Guides list/form become publishing desk surfaces with clear title/city/cover/summary controls.

### Explore, Feed, Creator Profiles, Guides

- Explore/feed cards use guide tickets with city, author, saves, and route stamps.
- Creator profiles lead with a passport-style hero: banner image, avatar pass, tier/score, route/city proof, guides, posts.
- Guide detail pages use real cover imagery as the hero, with a ticket overlay for city/author/saves instead of generic text-on-gradient.
- Article pages receive token/type cleanup and selected ticket-style navigation elements only. A full editorial layout redesign is out of scope for this slice.

## Components and Boundaries

Introduce small reusable building blocks rather than rewriting every page separately:

- `KinnsoPageShell` or class utilities for page bands and max widths.
- `RouteStamp` for eyebrow/status stamps.
- `TicketCard` for bordered ticket/pass surfaces.
- `TicketDivider` for dashed separators.
- `RouteMarkers` for city/source/destination dots.
- `ReceiptRow` for payout and earnings rows.

These should be presentational and data-agnostic. Existing page hosts continue fetching data in server components and passing props to views. Client components remain client only where interactivity exists today.

## Accessibility and UI Quality

This redesign must also address the issues found in the live review:

- Add skip link and main target in shell.
- Add `aria-expanded`/`aria-controls` to mobile nav.
- Give scan/search inputs labels, names, and appropriate autocomplete behavior.
- Add `aria-live="polite"` to async scan result regions.
- Make decorative icons `aria-hidden`.
- Add reduced-motion handling for marquee, ticket animations, and spinners.
- Use real images or `next/image`/explicit dimensions where possible; avoid content images as inaccessible CSS backgrounds.
- Keep visible focus rings aligned to the new token system.
- Ensure form controls always have visible or programmatic labels.
- Preserve language switching and seven-locale text parity.

## Data Flow and Architecture

No data-flow changes are required.

- Server routes under `app/[locale]` keep their current data fetching and auth/role gates.
- Presentational components consume existing props.
- Client components keep local UI state only for scan demos, filters, tabs, copy actions, and forms.
- No Supabase query, RLS policy, action, or schema migration is part of this slice.

## Error, Empty, Loading, and Restricted States

Each redesigned product surface should have a designed state, not a blank generic card:

- Empty creator feed: "No guide tickets yet" with one clear action.
- Empty missions/offers: route/brief desk empty state with next step.
- Earnings empty: receipt tray empty, explain that settled payouts will appear here.
- Auth-gated Studio pages keep existing redirects/404 behavior; visual treatment starts after access is granted.
- Form errors stay specific and actionable, using the new danger token and `role="alert"` where needed.

## Testing and Verification

Implementation plan should include:

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- Focused component tests for any new reusable components.
- Existing route/component tests updated only when markup expectations change.
- Browser verification at desktop and mobile widths for:
  - homepage,
  - creators landing,
  - merchants landing,
  - Studio home,
  - Studio scan,
  - merchant creator search,
  - guide/feed card surfaces.
- Reduced-motion verification.
- Quick color/palette scan to ensure the page does not collapse into a one-note cream/orange theme.

## Risks and Assumptions

- **Risk: generic warm startup look.** Mitigation: no serif default, no gradient hero, orange used sparingly, ticket/route artifacts must encode real workflow/state.
- **Risk: over-decoration.** Mitigation: spend the visual risk in the Route Ticket Stack; keep product surfaces dense, quiet, and useful.
- **Risk: broad surface area.** Mitigation: build global tokens and reusable ticket primitives first, then migrate route groups in slices.
- **Risk: multilingual typography.** Mitigation: keep body/UI fonts conservative for non-Latin locales; display font may fall back gracefully where needed.
- **Assumption:** the implementation can add a Google display font through `next/font/google` without changing deployment setup.

## Recommended Implementation Slices

1. **Foundation:** tokens, fonts, focus/reduced-motion rules, shell skip link, shared ticket primitives.
2. **Homepage:** hero, scan widget accessibility, route timeline, creator passes, partner stamps, ticket lanes.
3. **Public subpages:** creators, merchants, explore/feed, creator profile, guide detail.
4. **Product surfaces:** Studio home/scan/missions/offers/earnings/guides, merchant creator search, mission post wizard.
5. **Article/auth polish:** sign-in/up, onboarding, article/list/detail token alignment.
