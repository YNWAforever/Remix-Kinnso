# Phase R7.9 Explore Usability Design

**Date:** 2026-07-28  
**Status:** Approved  
**Phase:** R7.9 — Explore usability (P2)

## Objective

Make Explore useful for browsing a growing guide inventory without turning the
page into a request-time application. Users can narrow published guides by one
canonical destination, search the fields visible or represented on guide cards,
sort the result set, and progressively reveal more cards. The resulting state is
shareable through a stable URL, while Explore remains statically generated or
ISR-backed.

This design is bound by the Phase R7 specification and the R1–R6 program
conventions, including locale parity, anonymous/RLS-safe reads, focused unit and
E2E coverage, and preservation of existing public metadata and discovery
behavior.

## Approved Product Scope

R7.9 remains a guide-only Explore experience. It does not add experience tabs,
a mixed guide-and-experience feed, request-time search, or a new search index.

The approved controls are:

- One canonical destination at a time, plus an "All destinations" state.
- Text search across guide title, creator handle, city, canonical destination
  name, and canonical destination aliases.
- "Newest" sorting at all times.
- "Most saved" sorting only when the published guide dataset contains at least
  one verified positive save count.
- Progressive disclosure in groups of 12 cards.

## Architecture

The Explore server page continues to load the complete published guide dataset
through `getPublishedGuides()` and the canonical destination dataset through
`getPublishedDestinations()` during static generation or ISR.

Both datasets are passed to a thin client-side discovery controller. The
controller is responsible only for:

1. Parsing and normalizing URL query state.
2. Associating each guide with a canonical destination.
3. Filtering and sorting the in-memory guide collection.
4. Limiting the visible collection to the requested number of 12-card pages.
5. Replacing the browser URL when discovery state changes.

No new API route, RPC, request-time database query, or server action is added.
The server page must not consume request-time `searchParams`, because doing so
would put the static/ISR acceptance criterion at risk.

Initial route navigation receives an Explore-specific `loading.tsx` skeleton.
Client-side filtering, sorting, and pagination are synchronous and must not
introduce an artificial loading delay.

## Data Contract

### Guides

The existing published-guide contract remains authoritative. The input order
returned by `getPublishedGuides()` is the "Newest" order and is preserved rather
than reconstructed in the client.

The discovery controller may derive normalized search and destination values,
but it must not change guide URLs, card presentation, creator attribution,
images, metadata, publication rules, or anonymous-read behavior.

### Destinations

Destination controls are derived only from canonical `destination_index`
records returned by `getPublishedDestinations()`.

Eligible options:

- Begin with "All destinations".
- Include only canonical destinations whose `guideCount` is greater than zero.
- Preserve the canonical destination identity and slug in URL state.

Guide-to-destination matching uses normalized comparisons against the canonical
destination name and its `matchTerms`. A guide that cannot be matched remains
visible under "All destinations" but is not placed into a fabricated or
raw-city destination option.

If canonical destinations are unavailable, Explore still renders all published
guides and hides destination controls. It must not synthesize destination chips
from guide city strings.

## URL and State Model

Discovery state is represented by these query parameters:

| Parameter | Meaning | Default |
| --- | --- | --- |
| `destination` | One canonical destination slug | all destinations |
| `q` | Normalized text query | empty |
| `sort` | `newest` or conditionally `most-saved` | newest |
| `page` | Number of 12-card pages revealed | 1 |

Defaults are omitted from generated URLs. A representative non-default URL is:

```text
/explore?destination=tokyo&q=ramen&sort=most-saved&page=2
```

Control changes update the URL with `history.replaceState`, not push-state
navigation. This prevents search typing and filter adjustments from flooding
Back-button history.

Search updates after a short debounce. Changing the destination, search query,
or sort order resets `page` to 1. "Load more" increments `page`; reloading or
sharing the URL restores the same number of visible results.

Unknown destinations, unsupported sort values, malformed page values, and other
invalid query state fall back safely to defaults. Invalid values are removed
the next time the controller writes normalized state to the URL.

## Filtering, Search, and Sorting

The processing order is:

1. Associate guides with canonical destinations.
2. Apply the single destination filter.
3. Apply normalized text search.
4. Apply the selected sort.
5. Compute the full result count.
6. Reveal up to `page * 12` cards.

Search is case-insensitive, trims leading and trailing whitespace, collapses
excess internal whitespace, and compares normalized values. Its searchable
fields are deliberately limited to:

- Guide title.
- Creator handle.
- Guide city.
- Matched canonical destination name.
- Matched canonical destination aliases or `matchTerms`.

Guide body content is outside scope.

"Newest" preserves the server-provided order. "Most saved" sorts by verified
save count descending and preserves the newest order for ties. The option is
rendered only if at least one published guide has a verified save count greater
than zero.

## Responsive UX

### Desktop

Desktop uses a persistent destination-filter sidebar. Search and sort controls
sit above the guide grid. The result count communicates the effect of the
current controls without displacing the existing guide cards.

### Mobile

Mobile retains a compact search row and exposes a Filters button. The button:

- Displays an active-filter badge when a non-default destination or sort is
  selected.
- Opens a bottom sheet containing destination chips and sort options.
- Uses thumb-friendly targets.
- Provides a result-count action such as "Show N results".

The bottom sheet closes through its explicit close control, the result-count
action, or Escape. Closing it restores focus to the Filters button.

## Empty and Pagination States

When filters or search produce no results, controls remain visible. The empty
state explains that no guides matched and provides one clear "Reset filters"
action that returns destination, search, sort, and page to their defaults.

"Load more" is shown only when additional filtered results exist. Activating it
reveals the next 12 cards without a request. The control disappears when the
complete filtered result set is visible.

## Accessibility

R7.9 supplies the accessibility needed for its new controls without replacing
the broader R7.10 accessibility pass:

- Every search, destination, sort, Reset, and Load more control has a programmatic
  name and visible keyboard focus.
- The active destination and sort are exposed to assistive technology.
- Result-count changes are announced through a polite live region.
- The mobile bottom sheet traps focus while open.
- Background content is not interactive while the sheet is open.
- Escape closes the sheet and focus returns to the Filters button.
- All chips and actions are keyboard-operable native controls where practical.
- Motion is not required to understand state changes.

## Resilience

- An unavailable destination dataset degrades to unfiltered guide browsing.
- Unmatched guides remain discoverable under the default view.
- Invalid URL state never produces an exception or an unusable control state.
- Stable ordering prevents cards with equal save counts from jumping.
- Existing guide-data errors retain their established page-level handling;
  R7.9 does not conceal unexpected database failures.

## Testing Strategy

### Unit tests

Pure discovery helpers cover:

- Canonical destination matching by name and aliases.
- Unmatched-guide behavior.
- Search normalization and each approved searchable field.
- Combined destination and search filtering.
- Newest-order preservation.
- Most-saved descending order and stable ties.
- Conditional availability of Most saved.
- Query parsing, invalid-value fallback, and default omission.
- Twelve-card pagination and bounds.

### Component tests

Component coverage verifies:

- Desktop destination sidebar, search, sort, and result count.
- Mobile Filters button, active badge, and bottom sheet.
- Focus trap, Escape close, focus restoration, and accessible names.
- Conditional Most saved option.
- Filtered-empty state and Reset behavior.
- Load more visibility and progressive card disclosure.
- Graceful rendering when no canonical destinations are available.
- Route-level skeleton structure.

### End-to-end tests

E2E coverage verifies that:

- Destination, query, sort, and page state work together.
- Direct URL entry and reload restore the same discovery state.
- Control changes replace the current history entry.
- The filtered-empty state resets successfully.
- Mobile filtering can be completed through the bottom sheet.
- Existing guide cards still navigate to their established public URLs.

### Build and convention checks

- The production build must continue reporting Explore as static/ISR.
- All new visible strings must exist in all seven locale files.
- Locale-parity tests must pass.
- Existing metadata, sitemap, robots, JSON-LD, publication, and anonymous-read
  behavior must remain green.

## Acceptance Criteria

R7.9 is accepted when:

1. Users can filter published guides by one live canonical destination.
2. Users can search the approved guide-card fields.
3. Users can sort by Newest and, when real save data exists, Most saved.
4. Discovery state is URL-stable, shareable, reloadable, and updated through
   history replacement.
5. More than 12 results can be progressively revealed.
6. A functional filtered-empty state can reset all discovery state.
7. Desktop and mobile layouts follow the approved sidebar and bottom-sheet
   patterns.
8. The new controls meet the accessibility behavior defined above.
9. Initial route navigation has a skeleton without fake client-side waits.
10. Explore remains statically generated or ISR-backed.

## Rejected Alternatives

### URL-driven server rendering

Processing every filter change on the server could provide server-rendered
filtered results, but it risks making Explore request-time dynamic and conflicts
with the explicit static/ISR goal.

### Client API fetching

An endpoint-driven search could scale to a much larger inventory, but it adds
latency, request loading and error states, and new infrastructure without a
current need.

### Multi-destination selection

Multi-select OR filtering adds URL encoding and mobile-selection complexity.
The approved single-destination model better matches destination browsing and
the specification's stable URL example.

### Raw city-derived chips

Generating chips directly from guide city strings would create duplicate or
non-canonical destination identities and bypass the live destination inventory.

## Future Considerations

If the published inventory outgrows practical in-memory filtering, a later
phase may move the same URL contract behind a paginated search endpoint. That
change should preserve the R7.9 interaction model while separately addressing
server-side indexing, result caching, and request loading states.
