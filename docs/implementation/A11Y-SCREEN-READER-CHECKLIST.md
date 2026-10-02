# Screen-reader checklist — story 21, manual half

The automated suites (`r7-10-structure`, `r7-10-keyboard`, `r7-10-reflow`) prove structural
facts: landmarks exist, headings do not skip, every control has a name, the page reflows.
They cannot prove that what a screen reader *announces* is useful. This is that pass.

**Run with:** NVDA + Firefox (Windows) or VoiceOver + Safari (macOS). Record the date, the
tool and the result. An empty result column means NOT RUN — do not read it as passing.

## Per route

For each of the 9 routes in `apps/e2e/r7-10-routes.ts`:

1. Load the page. Does the announced page title describe the page, or is it generic?
2. Navigate by landmark (NVDA `D`, VoiceOver `VO-U`). Are banner, main and contentinfo
   announced with useful names?
3. Navigate by heading (`H`). Does the sequence describe the page's structure?
4. Tab through every control. Is each announced with a name that says what it DOES, not
   what it is? "Link, Tokyo coffee guide" passes; "Link, click here" fails.
5. On a form (enquiry dialog, sign-in), are labels, required state and errors announced?
6. Trigger a validation error. Is it announced without moving focus unexpectedly?

## Results

| Date | Tool | Route | Result | Notes |
|---|---|---|---|---|
| | | | | |

## Worth checking first

- **The skip link is automated as reachable and functional, not as intelligible.**
  `r7-10-keyboard` proves the first Tab stop is a working skip link that moves focus into
  `main`. It does not prove NVDA/VoiceOver announce that link usefully, or that landing in
  `main` is announced as arriving somewhere ("main landmark") rather than silently. Confirm
  the announcement itself, not just the focus move.
- **Six routes lost a nested `<main>` this cycle.** The fix removed duplicate `<main>`
  landmarks that six page views were adding on top of `SiteChrome`'s own one. The automated
  suite can only prove there is exactly one `main` element in the DOM; it cannot prove a
  landmark-navigation pass (`D` / `VO-U`) now reads as a single clean `main` region on those
  six routes rather than some other artifact of the removal (e.g. content that used to be
  inside the inner `<main>` now reading as if it starts mid-region).
- **`Footer.tsx` column titles moved from `<h4>` to `<h2>`** to stop skipping a level on 8 of
  9 routes. That is structurally correct, but an `<h2>` reads to a screen-reader user as a
  major section, on par with the page's other top-level sections — walk the heading list
  (`H`) on a route with a rich body (e.g. the guide or article route) and confirm the footer's
  three `<h2>`s land at the end of a sensible outline instead of sounding like they compete
  with the page's real content sections.
- **The Navbar 200% zoom overflow is ledgered, not fixed.** All 9 routes have a `text-200`
  exception for `Navbar.tsx`'s desktop chrome outgrowing its 1280px breakpoint at 200% zoom
  (`scrollWidth` 2324–2479px). Automated coverage stops at "this fails and is recorded" — it
  says nothing about what a real screen-reader-plus-zoom user actually hits: whether the
  overflowed items are still reachable by Tab and landmark navigation in some order, or
  whether some become functionally stranded off-screen. Check this on `home` at minimum, and
  on `explore` and `creator-directory`, which carry their own additional ledgered zoom
  defects (the filter sidebar and the bio clamp) on top of the shared Navbar one.
